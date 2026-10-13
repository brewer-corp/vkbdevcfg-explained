/* Decompile a specific function and, optionally, follow its callees.
 *
 * @category VKB
 */

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.util.task.TaskMonitor;

public class DecompAt extends GhidraScript {

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        if (args.length < 1) {
            println("usage: DecompAt <addrHex> [depth]");
            return;
        }
        Address start = toAddr(args[0]);
        int depth = args.length > 1 ? Integer.parseInt(args[1]) : 0;

        DecompInterface decomp = new DecompInterface();
        decomp.openProgram(currentProgram);

        Function root = getFunctionAt(start);
        if (root == null) root = getFunctionContaining(start);
        if (root == null) { println("no function at " + start); return; }

        Set<Function> seen = new HashSet<Function>();
        Deque<Function> queue = new ArrayDeque<Function>();
        queue.add(root);
        seen.add(root);

        int printed = 0;
        while (!queue.isEmpty() && printed < 25) {
            Function f = queue.poll();
            DecompileResults res = decomp.decompileFunction(f, 90, TaskMonitor.DUMMY);
            println("\n" + bar());
            println("FUNCTION " + f.getName(true) + " @ " + f.getEntryPoint());
            println(bar());
            if (res != null && res.decompileCompleted()
                    && res.getDecompiledFunction() != null) {
                println(res.getDecompiledFunction().getC());
            } else {
                println("  <decompile failed>");
            }
            printed++;
            if (seen.size() > depth) continue;
            for (Function c : f.getCalledFunctions(null)) {
                if (seen.add(c)) queue.add(c);
            }
        }
        decomp.dispose();
        println("\nDECOMPILE_DONE " + printed);
    }

    private String bar() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 60; i++) sb.append('=');
        return sb.toString();
    }
}