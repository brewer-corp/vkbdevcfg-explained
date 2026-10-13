/* Disassemble the XOR instructions in a function with surrounding context,
 * and optionally decompile companion functions. Used to inspect cipher-shaped
 * code without wading through decompiler noise.
 *
 * @category VKB
 */

import java.util.ArrayList;
import java.util.List;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.util.task.TaskMonitor;

public class XorContext extends GhidraScript {

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();

        DecompInterface decomp = new DecompInterface();
        decomp.openProgram(currentProgram);

        for (String spec : args) {
            String addrHex = spec;
            int ctx = 6;
            int c = spec.indexOf(':');
            if (c > 0) {
                addrHex = spec.substring(0, c);
                ctx = Integer.parseInt(spec.substring(c + 1));
            }
            Function f = getFunctionAt(toAddr(addrHex));
            if (f == null) f = getFunctionContaining(toAddr(addrHex));
            if (f == null) { println("no function at " + addrHex); continue; }

            println("\n" + bar());
            println("XOR instructions in " + f.getName(true)
                    + " @ " + f.getEntryPoint()
                    + "  (body " + f.getBody().getNumAddresses() + " bytes)");
            println(bar());

            List<Instruction> xors = new ArrayList<Instruction>();
            for (Instruction ins : currentProgram.getListing()
                    .getInstructions(f.getBody(), true)) {
                String mn = ins.getMnemonicString();
                if (!mn.equals("XOR") && !mn.equals("XOREAX")) continue;
                if (ins.getNumOperands() == 2
                        && ins.getOpObjects(0)[0] != null
                        && ins.getOpObjects(1)[0] != null
                        && ins.getOpObjects(0)[0] == ins.getOpObjects(1)[0]) {
                    continue;
                }
                xors.add(ins);
            }
            println("  non-zeroing XOR count: " + xors.size());

            for (Instruction x : xors) {
                Instruction cur = x;
                Instruction back = cur;
                for (int i = 0; i < ctx && back != null; i++) {
                    back = back.getPrevious();
                }
                println("\n  ---- around " + x.getAddress() + " ----");
                while (back != null) {
                    String mark = back.getAddress().equals(x.getAddress()) ? " >> " : "    ";
                    println(String.format("  %s%-10s %s", mark,
                            back.getAddress(), back));
                    if (back.getAddress().compareTo(x.getAddress()) >= 0) break;
                    back = back.getNext();
                }
            }
        }
        decomp.dispose();
        println("\nXORCTX_DONE");
    }

    private String bar() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 64; i++) sb.append('=');
        return sb.toString();
    }
}