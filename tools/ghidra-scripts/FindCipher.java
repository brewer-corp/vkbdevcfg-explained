/* Two questions:
 *   1. What does the .cfg save path call?
 *   2. Is there an inline cipher anywhere -- i.e. an XOR inside a loop,
 *      which is the shape every hand-rolled block/stream cipher has.
 *
 * @category VKB
 */

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.symbol.FlowType;

public class FindCipher extends GhidraScript {

    @Override
    public void run() throws Exception {
        Function save = getFunctionAt(toAddr("00726f00"));
        if (save != null) {
            println("==== callees of the save path FUN_00726f00 "
                    + "(size " + save.getBody().getNumAddresses() + ") ====");
            int i = 0;
            for (Function c : save.getCalledFunctions(null)) {
                println(String.format("  %2d. %-28s size=%d",
                        ++i, c.getName(true), c.getBody().getNumAddresses()));
                if (i > 90) { println("  ..."); break; }
            }
        }

        println("\n==== scanning all functions for XOR inside a loop ====");
        List<Function> hits = new ArrayList<Function>();
        int total = 0, withXor = 0;

        for (Function f : currentProgram.getFunctionManager().getFunctions(true)) {
            total++;
            boolean sawXor = false;
            int xorCount = 0;
            Instruction last = null;
            for (Instruction ins : currentProgram.getListing()
                    .getInstructions(f.getBody(), true)) {
                String mn = ins.getMnemonicString();
                if (mn.equals("XOR") || mn.equals("XOREAX")) {
                    // ignore xor reg,reg (zeroing idiom)
                    if (ins.getNumOperands() == 2
                            && ins.getOpObjects(0)[0] != null
                            && ins.getOpObjects(1)[0] != null
                            && ins.getOpObjects(0)[0] == ins.getOpObjects(1)[0]) {
                        continue;
                    }
                    sawXor = true;
                    xorCount++;
                }
                last = ins;
            }
            if (!sawXor) continue;
            withXor++;

            // is the function's control flow cyclic (loop)?
            boolean loop = false;
            for (Instruction ins : currentProgram.getListing()
                    .getInstructions(f.getBody(), true)) {
                for (Address t : ins.getFlows()) {
                    if (t == null) continue;
                    if (t.compareTo(f.getEntryPoint()) >= 0
                            && t.compareTo(ins.getAddress()) < 0
                            && f.getBody().contains(t)) {
                        loop = true;
                    }
                }
            }
            if (loop && xorCount > 0) {
                hits.add(f);
            }
        }

        println("functions scanned: " + total);
        println("functions containing a non-zeroing XOR: " + withXor);
        println("functions with XOR *and* a loop: " + hits.size());
        for (Function f : hits) {
            int callers = f.getCallingFunctions(null).size();
            println(String.format("  %-24s @ %s  size=%-6d xorloop callers=%d",
                    f.getName(true), f.getEntryPoint(),
                    f.getBody().getNumAddresses(), callers));
        }
        println("\nSCAN_DONE");
    }
}