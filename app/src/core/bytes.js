// The three primitives the protocol and the profile format are built from.
// Each mirrors a routine in VKBDevCfg-C v0.93.89; see docs/PROTOCOL.md.
/** CRC-16/MODBUS, carried in every transfer header. */
export function crc16(data) {
    let crc = 0xffff;
    for (const b of data) {
        crc ^= b;
        for (let i = 0; i < 8; i++)
            crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
    return crc;
}
/** The STM32 hardware CRC: poly 0x04C11DB7, init 0xFFFFFFFF, LE words fed MSB first, no final xor. */
export function crc32Stm32(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let crc = 0xffffffff;
    for (let i = 0; i + 4 <= data.length; i += 4) {
        crc = (crc ^ view.getUint32(i, true)) >>> 0;
        for (let k = 0; k < 32; k++)
            crc = (crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1) >>> 0;
    }
    return crc;
}
/** RC4. Returns a new array; the input is not modified. */
export function rc4(data, key) {
    const S = new Uint8Array(256);
    for (let i = 0; i < 256; i++)
        S[i] = i;
    for (let i = 0, j = 0; i < 256; i++) {
        j = (j + S[i] + key[i % key.length]) & 0xff;
        [S[i], S[j]] = [S[j], S[i]];
    }
    const out = new Uint8Array(data);
    for (let n = 0, i = 0, j = 0; n < out.length; n++) {
        i = (i + 1) & 0xff;
        j = (j + S[i]) & 0xff;
        [S[i], S[j]] = [S[j], S[i]];
        out[n] ^= S[(S[i] + S[j]) & 0xff];
    }
    return out;
}
export const hex = (b, sep = ' ') => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(sep);
export function fromHex(s) {
    const clean = s.replace(/[^0-9a-f]/gi, '');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++)
        out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
}
export function concat(...parts) {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}
