/* Find callers of a function and show how they pass its arguments.
 *
 * @category VKB
 */

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.util.task.TaskMonitor;

public class Callers extends GhidraScript {

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 1) { println("usage: Callers <addr>"); return; }
        Address target = toAddr(args[0]);
        Function tf = getFunctionAt(target);
        if (tf == null) tf = getFunctionContaining(target);
        if (tf == null) { println("no function at " + target); return; }

        println("callers of " + tf.getName(true) + " @ " + tf.getEntryPoint());
        // instead: use references
        Reference[] refs = getReferencesTo(tf.getEntryPoint());
        println("  " + refs.length + " reference(s)");

        DecompInterface decomp = new DecompInterface();
        decomp.openProgram(currentProgram);

        int shown = 0;
        for (Reference r : refs) {
            Function c = getFunctionContaining(r.getFromAddress());
            if (c == null) continue;
            println("\n" + bar());
            println("CALLER " + c.getName(true) + " @ " + c.getEntryPoint()
                    + "  (size " + c.getBody().getNumAddresses() + ")");
            println(bar());
            DecompileResults res = decomp.decompileFunction(c, 90, TaskMonitor.DUMMY);
            if (res != null && res.decompileCompleted()
                    && res.getDecompiledFunction() != null) {
                println(res.getDecompiledFunction().getC());
            }
            if (++shown >= 6) { println("... (truncated)"); break; }
        }
        decomp.dispose();
        println("\nCALLERS_DONE");
    }

    private String bar() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 64; i++) sb.append('=');
        return sb.toString();
    }
}