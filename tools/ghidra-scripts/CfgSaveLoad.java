/* Locate and decompile the .cfg profile save/load path.
 *
 * Anchors on the literal strings only the save/load code can reference, then
 * walks references back to containing functions. Falls back to function-name
 * matching if the string route yields too little.
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
import ghidra.program.model.symbol.Reference;
import ghidra.util.task.TaskMonitor;

public class CfgSaveLoad extends GhidraScript {

    private static final String[] NEEDLES = {
        "Config files|*.cfg",
        "config files|*.cfg",
        "zconfig.ini",
        "zconfig_GNX_profiles.ini",
        "VKBDevCfg"
    };

    private static final String[] NAME_HINTS = {
        "cfg", "Cfg", "CFG", "Save", "Load", "Profile", "Write", "Read"
    };

    /** Find the next occurrence of a byte pattern at or after `start`, or null. */
    private Address findBytesFrom(Address start, byte[] pat) {
        if (start == null) return null;
        if (start.compareTo(currentProgram.getMaxAddress()) > 0) return null;
        return currentProgram.getMemory().findBytes(
            start, currentProgram.getMaxAddress(), pat, null, true, monitor);
    }

    @Override
    public void run() throws Exception {
        List<Function> targets = new ArrayList<Function>();
        Address min = currentProgram.getMinAddress();

        println("==== string anchors ====");
        for (String needle : NEEDLES) {
            byte[] pat = needle.getBytes();
            Address a = findBytesFrom(min, pat);
            int hits = 0;
            while (a != null && hits < 10) {
                println("STRING  \"" + needle + "\"  @ " + a);
                Reference[] refs = getReferencesTo(a);
                println("        " + refs.length + " reference(s)");
                for (Reference r : refs) {
                    Function f = getFunctionContaining(r.getFromAddress());
                    if (f != null && !targets.contains(f)) {
                        targets.add(f);
                        println("   -> " + f.getName(true) + " @ " + f.getEntryPoint());
                    }
                }
                a = findBytesFrom(a.add(pat.length), pat);
                hits++;
            }
        }

        if (targets.size() < 5) {
            println("\n==== name-based fallback ====");
            int added = 0;
            for (Function f : currentProgram.getFunctionManager().getFunctions(true)) {
                String n = f.getName(true);
                for (String h : NAME_HINTS) {
                    if (n.contains(h)) {
                        if (!targets.contains(f)) { targets.add(f); added++; }
                        break;
                    }
                }
                if (added > 150) break;
            }
            println("   added " + added + " by name");
        }

        println("\n==== decompiling " + targets.size() + " functions ====");
        DecompInterface decomp = new DecompInterface();
        decomp.openProgram(currentProgram);
        int written = 0;
        for (Function f : targets) {
            DecompileResults res = decomp.decompileFunction(f, 90, TaskMonitor.DUMMY);
            if (res != null && res.decompileCompleted()
                    && res.getDecompiledFunction() != null) {
                println("\n" + bar());
                println("FUNCTION " + f.getName(true) + " @ " + f.getEntryPoint());
                println(bar());
                println(res.getDecompiledFunction().getC());
                written++;
                if (written >= 40) { println("... (truncated)"); break; }
            }
        }
        decomp.dispose();
        println("\nDECOMPILED_OK " + written + " of " + targets.size());
    }

    private String bar() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 60; i++) sb.append('=');
        return sb.toString();
    }
}