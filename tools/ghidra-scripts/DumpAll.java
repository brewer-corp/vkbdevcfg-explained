// Bulk-decompile every function in the given address ranges to one .c file each.
// args: outdir lo1 hi1 [lo2 hi2 ...]
// @category VKB
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import ghidra.app.decompiler.*;
import ghidra.app.decompiler.parallel.*;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.mem.Memory;
import ghidra.program.model.symbol.*;
import ghidra.util.task.TaskMonitor;

public class DumpAll extends GhidraScript {
    Memory mem;

    String strAt(Address a) {
        try {
            if (!mem.contains(a)) return null;
            byte[] b = new byte[160];
            int n = mem.getBytes(a, b);
            // ASCII
            int i = 0;
            while (i < n && b[i] >= 0x20 && b[i] < 0x7f) i++;
            if (i >= 4 && i < n && b[i] == 0) return "\"" + new String(b, 0, i, StandardCharsets.US_ASCII) + "\"";
            // UTF-16LE
            i = 0;
            StringBuilder sb = new StringBuilder();
            while (i + 1 < n) {
                int c = (b[i] & 0xff) | ((b[i + 1] & 0xff) << 8);
                if (c == 0) break;
                if (c < 0x20 || (c > 0x7e && c < 0x400) || c > 0x4ff) { sb.setLength(0); break; }
                sb.append((char) c); i += 2;
            }
            if (sb.length() >= 3) return "L\"" + sb + "\"";
        } catch (Exception e) {}
        return null;
    }

    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        final File outdir = new File(args[0]);
        outdir.mkdirs();
        mem = currentProgram.getMemory();
        AddressSet set = new AddressSet();
        for (int i = 1; i + 1 < args.length; i += 2) set.add(toAddr(args[i]), toAddr(args[i + 1]));
        final FunctionManager fm = currentProgram.getFunctionManager();
        final ReferenceManager rm = currentProgram.getReferenceManager();
        List<Function> funcs = new ArrayList<>();
        for (Function f : fm.getFunctions(set, true)) funcs.add(f);
        println("DUMPALL functions=" + funcs.size());
        final PrintWriter idx = new PrintWriter(new FileWriter(new File(outdir, "_index.tsv")));
        final AtomicInteger done = new AtomicInteger();
        DecompilerCallback<Void> cb = new DecompilerCallback<Void>(currentProgram, new DecompileConfigurer() {
            public void configure(DecompInterface d) {
                DecompileOptions o = new DecompileOptions();
                d.setOptions(o);
                d.toggleCCode(true); d.toggleSyntaxTree(false); d.setSimplificationStyle("decompile");
            }
        }) {
            @Override
            public Void process(DecompileResults res, TaskMonitor m) throws Exception {
                Function f = res.getFunction();
                String name = f.getName(true);
                String safe = name.replaceAll("[^A-Za-z0-9_.]", "_");
                if (safe.length() > 80) safe = safe.substring(0, 80);
                String fname = f.getEntryPoint().toString() + "_" + safe + ".c";
                StringBuilder sb = new StringBuilder();
                sb.append("// FUNCTION ").append(name).append(" @ ").append(f.getEntryPoint())
                  .append(" size=").append(f.getBody().getNumAddresses()).append("\n");
                // callers
                StringBuilder cs = new StringBuilder(); int nc = 0;
                for (Function c : f.getCallingFunctions(TaskMonitor.DUMMY)) { if (nc++ < 40) cs.append(' ').append(c.getName(true)).append('@').append(c.getEntryPoint()); }
                sb.append("// CALLERS(").append(nc).append("):").append(cs).append("\n");
                StringBuilder ce = new StringBuilder(); int ne = 0;
                for (Function c : f.getCalledFunctions(TaskMonitor.DUMMY)) { if (ne++ < 80) ce.append(' ').append(c.getName(true)).append('@').append(c.getEntryPoint()); }
                sb.append("// CALLEES(").append(ne).append("):").append(ce).append("\n");
                // strings + globals referenced
                LinkedHashMap<String, String> strs = new LinkedHashMap<>();
                AddressIterator it = f.getBody().getAddresses(true);
                InstructionIterator ii = currentProgram.getListing().getInstructions(f.getBody(), true);
                while (ii.hasNext()) {
                    Instruction ins = ii.next();
                    for (Reference r : ins.getReferencesFrom()) {
                        if (r.getReferenceType().isFlow()) continue;
                        Address t = r.getToAddress();
                        if (!t.isMemoryAddress()) continue;
                        String s = strAt(t);
                        if (s != null && strs.size() < 200) strs.put(t.toString(), s);
                    }
                }
                for (Map.Entry<String, String> e : strs.entrySet()) sb.append("// STR ").append(e.getKey()).append(" = ").append(e.getValue()).append("\n");
                if (res != null && res.decompileCompleted() && res.getDecompiledFunction() != null) sb.append(res.getDecompiledFunction().getC());
                else sb.append("// <decompile failed: ").append(res == null ? "null" : res.getErrorMessage()).append(">\n");
                try (Writer w = new OutputStreamWriter(new FileOutputStream(new File(outdir, fname)), StandardCharsets.UTF_8)) { w.write(sb.toString()); }
                synchronized (idx) { idx.println(f.getEntryPoint() + "\t" + f.getBody().getNumAddresses() + "\t" + name + "\t" + fname + "\t" + nc + "\t" + ne); }
                int d = done.incrementAndGet();
                if (d % 500 == 0) System.err.println("DUMPALL progress " + d);
                return null;
            }
        };
        cb.setTimeout(120);
        try { ParallelDecompiler.decompileFunctions(cb, funcs, monitor); }
        finally { cb.dispose(); idx.close(); }
        println("DUMPALL_DONE " + done.get());
    }
}
