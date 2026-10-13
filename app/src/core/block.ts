// The 4096-byte parameter block and the .cfg container around it.
import { concat, crc32Stm32, fromHex, rc4 } from './bytes';

export const BLOCK_SIZE = 0x1000;

/** 16-byte constant behind the .cfg cipher; bytes 7..10 are replaced by the file's CRC word. */
const CFG_KEY = fromHex('f35df531f0a8dbbcbbafcd0303713a7f');

const u32le = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, n >>> 24]);
const readU32 = (b: Uint8Array, at: number) => new DataView(b.buffer, b.byteOffset).getUint32(at, true);

export const looksLikeBlock = (b: Uint8Array) => b.length >= 12 && b[0] === 0xff && b[1] === 0xff;
export const typeId = (block: Uint8Array) => block[2];
export const firmwareWord = (block: Uint8Array) => block[8] | (block[9] << 8);
export function firmwareText(block: Uint8Array): string {
  const fw = firmwareWord(block);
  return `${(fw >> 12).toString(16)}.${((fw >> 4) & 0xff).toString(16).padStart(2, '0')}.${(fw & 0xf).toString(16).toUpperCase()}`;
}

/** The CRC-32 the device keeps at block[4:8]; it covers block[8:]. */
export const blockCrc = (block: Uint8Array) => crc32Stm32(block.subarray(8));
export const blockCrcOk = (block: Uint8Array) => blockCrc(block) === readU32(block, 4);

/** Return a copy with block[4:8] set to the CRC the device would compute. */
export function withFixedCrc(block: Uint8Array): Uint8Array {
  const out = new Uint8Array(block);
  out.set(u32le(blockCrc(out)), 4);
  return out;
}

const cfgKey = (crcWord: Uint8Array) => concat(CFG_KEY.subarray(0, 7), crcWord, CFG_KEY.subarray(11, 13));

/** .cfg bytes -> parameter block (with the device CRC filled in). Throws if the file CRC fails. */
export function cfgDecrypt(file: Uint8Array): Uint8Array {
  const crcWord = file.slice(0, 4);
  const plain = rc4(file.subarray(4), cfgKey(crcWord));
  if (((crc32Stm32(plain) ^ 0xffffffff) >>> 0) !== readU32(crcWord, 0))
    throw new Error('Not a profile this tool understands: the file checksum does not match.');
  return withFixedCrc(concat(plain.subarray(0, 4), crcWord, plain.subarray(4)));
}

/** Parameter block -> .cfg bytes, identical to what VKBDevCfg writes. block[4:8] is ignored. */
export function cfgEncrypt(block: Uint8Array): Uint8Array {
  const plain = concat(block.subarray(0, 4), block.subarray(8));
  const crcWord = u32le((crc32Stm32(plain) ^ 0xffffffff) >>> 0);
  return concat(crcWord, rc4(plain, cfgKey(crcWord)));
}

/** Accept either a plaintext block or a .cfg profile. */
export function loadBlockFile(data: Uint8Array): Uint8Array {
  return looksLikeBlock(data) ? withFixedCrc(data) : cfgDecrypt(data);
}

export interface DiffRun { start: number; end: number }

/** Runs of differing bytes from offset 8 (the header's CRC word follows from the rest). */
export function diffBlocks(a: Uint8Array, b: Uint8Array): DiffRun[] {
  const runs: DiffRun[] = [];
  for (let i = 8; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) continue;
    const last = runs[runs.length - 1];
    if (last && i <= last.end + 1) last.end = i;
    else runs.push({ start: i, end: i });
  }
  return runs;
}

/** Why a block must not be written to a stick holding `current`; null if it may be. */
export function writeRefusal(current: Uint8Array, next: Uint8Array): string | null {
  if (next.length !== BLOCK_SIZE) return `The block is ${next.length} bytes; this stick uses ${BLOCK_SIZE}.`;
  if (!looksLikeBlock(next)) return 'The data does not start like a parameter block.';
  if (typeId(next) !== typeId(current))
    return `This configuration is for a different model (type 0x${typeId(next).toString(16)}, stick is 0x${typeId(current).toString(16)}). The stick would not refuse it, so this tool does.`;
  if (firmwareWord(next) !== firmwareWord(current))
    return `This configuration is for firmware ${firmwareText(next)}; the stick runs ${firmwareText(current)}.`;
  return null;
}
