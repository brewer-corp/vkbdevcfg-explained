/* Show disassembly around call sites of a target function, so register/stack
 * arguments can be read directly.
 *
 * @category VKB
 */

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.symbol.Reference;

public class CallSite extends GhidraScript {

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 2) { println("usage: CallSite <targetAddr> <backCount>"); return; }
        Address target = toAddr(args[0]);
        int back = args.length > 1 ? Integer.parseInt(args[1]) : 24;

        Function tf = getFunctionAt(target);
        if (tf == null) tf = getFunctionContaining(target);

        println("call sites of " + (tf != null ? tf.getName(true) : "?")
                + " @ " + target);

        Reference[] refs = getReferencesTo(target);
        for (Reference r : refs) {
            Function caller = getFunctionContaining(r.getFromAddress());
            println("\n" + bar());
            println("in " + (caller != null ? caller.getName(true) : "?")
                    + " @ " + r.getFromAddress());
            println(bar());
            Instruction ins = getInstructionAt(r.getFromAddress());
            if (ins == null) continue;
            Instruction cur = ins;
            for (int i = 0; i < back && cur != null; i++) cur = cur.getPrevious();
            while (cur != null) {
                String mark = cur.getAddress().equals(ins.getAddress()) ? " >> " : "    ";
                println(String.format("%s%-10s %s", mark,
                        cur.getAddress(), cur));
                if (cur.getAddress().compareTo(ins.getAddress()) >= 0) break;
                cur = cur.getNext();
            }
        }
        println("\nCALLSITE_DONE");
    }

    private String bar() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 64; i++) sb.append('=');
        return sb.toString();
    }
}