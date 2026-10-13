/* Find references to an address (the RC4 key buffer) and show each one in
 * disassembly context, so a runtime key derivation can be read.
 *
 * @category VKB
 */

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.symbol.Reference;
import ghidra.util.task.TaskMonitor;

public class KeyRefs extends GhidraScript {

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 1) { println("usage: KeyRefs <addrHex> [context]"); return; }
        Address target = toAddr(args[0]);
        int ctx = args.length > 1 ? Integer.parseInt(args[1]) : 10;

        println("references to " + target);
        Reference[] refs = getReferencesTo(target);
        println("  " + refs.length + " reference(s)\n");

        DecompInterface decomp = new DecompInterface();
        decomp.openProgram(currentProgram);

        int n = 0;
        for (Reference r : refs) {
            Function caller = getFunctionContaining(r.getFromAddress());
            Instruction ins = getInstructionAt(r.getFromAddress());
            println(String.format("%3d. %-10s  type=%-8s in %s",
                    ++n, r.getFromAddress(), r.getReferenceType(),
                    caller != null ? caller.getName(true) : "?"));
            if (ins != null) {
                Instruction cur = ins;
                for (int i = 0; i < ctx && cur != null; i++) cur = cur.getPrevious();
                while (cur != null) {
                    String mark = cur.getAddress().equals(ins.getAddress()) ? " >> " : "    ";
                    println(String.format("      %s%-10s %s", mark,
                            cur.getAddress(), cur));
                    if (cur.getAddress().compareTo(ins.getAddress()) >= 0) break;
                    cur = cur.getNext();
                }
            }
            println();
            if (n >= 25) { println("... truncated"); break; }
        }
        decomp.dispose();
        println("KEYREFS_DONE");
    }
}