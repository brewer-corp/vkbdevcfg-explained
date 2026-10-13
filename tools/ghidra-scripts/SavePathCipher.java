/* Does the .cfg save path reach any XOR-in-loop routine?
 *
 * Breadth-first walk from the save function, then report every reachable
 * function that contains a non-zeroing XOR inside a loop. That shape is the
 * signature of a hand-rolled block or stream cipher.
 *
 * @category VKB
 */

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;

public class SavePathCipher extends GhidraScript {

    private Map<Function, Boolean> xorLoopCache = new HashMap<Function, Boolean>();

    @Override
    public void run() throws Exception {
        Function root = getFunctionAt(toAddr("00726f00"));
        if (root == null) { println("save function not found"); return; }

        println("==== BFS from FUN_00726f00 (the 'Config files|*.cfg' owner) ====");

        Map<Function, Integer> depth = new HashMap<Function, Integer>();
        Set<Function> visited = new HashSet<Function>();
        Deque<Function> q = new ArrayDeque<Function>();
        q.add(root);
        depth.put(root, 0);
        visited.add(root);
        int maxDepth = 6;

        List<Function> xorLoopReachable = new ArrayList<Function>();

        while (!q.isEmpty()) {
            Function f = q.poll();
            int d = depth.get(f);
            if (hasXorInLoop(f)) {
                xorLoopReachable.add(f);
                println(String.format("  ** XOR-in-loop at depth %d: %s @ %s size=%d",
                        d, f.getName(true), f.getEntryPoint(),
                        f.getBody().getNumAddresses()));
            }
            if (d >= maxDepth) continue;
            for (Function c : f.getCalledFunctions(null)) {
                if (visited.add(c)) {
                    depth.put(c, d + 1);
                    q.add(c);
                }
            }
        }

        println("\nfunctions reachable from the save path: " + visited.size());
        println("XOR-in-loop functions reachable:        " + xorLoopReachable.size());

        // control: how common is this shape overall?
        int total = 0, xorloops = 0;
        for (Function f : currentProgram.getFunctionManager().getFunctions(true)) {
            total++;
            if (hasXorInLoop(f)) xorloops++;
        }
        println(String.format("baseline: %d of %d functions (%.2f%%) have this shape",
                xorloops, total, 100.0 * xorloops / total));

        println("\n==== direct callees of the save path, with XOR/loop flags ====");
        for (Function c : root.getCalledFunctions(null)) {
            println(String.format("  %-24s size=%-7d xorloop=%s",
                    c.getName(true), c.getBody().getNumAddresses(),
                    hasXorInLoop(c)));
        }
        println("\nBFS_DONE");
    }

    private boolean hasXorInLoop(Function f) {
        if (xorLoopCache.containsKey(f)) return xorLoopCache.get(f);
        boolean sawXor = false, loop = false;
        for (Instruction ins : currentProgram.getListing()
                .getInstructions(f.getBody(), true)) {
            String mn = ins.getMnemonicString();
            if ((mn.equals("XOR") || mn.equals("XOREAX")) && ins.getNumOperands() == 2
                    && ins.getOpObjects(0)[0] != null
                    && ins.getOpObjects(1)[0] != null
                    && ins.getOpObjects(0)[0] == ins.getOpObjects(1)[0]) {
                continue;
            }
            if (mn.equals("XOR") || mn.equals("XOREAX")) sawXor = true;
            for (Address t : ins.getFlows()) {
                if (t == null) continue;
                if (t.compareTo(f.getEntryPoint()) >= 0
                        && t.compareTo(ins.getAddress()) < 0
                        && f.getBody().contains(t)) loop = true;
            }
        }
        boolean r = sawXor && loop;
        xorLoopCache.put(f, r);
        return r;
    }
}