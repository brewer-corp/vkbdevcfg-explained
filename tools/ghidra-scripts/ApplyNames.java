// Apply RTTI-derived names: creates functions, names them, sets __fastcall convention.
// @category VKB
import java.io.*;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.*;

public class ApplyNames extends GhidraScript {
    @Override
    public void run() throws Exception {
        String[] args = getScriptArgs();
        BufferedReader br = new BufferedReader(new FileReader(args[0]));
        String line; int nf = 0, nl = 0, created = 0;
        SymbolTable st = currentProgram.getSymbolTable();
        while ((line = br.readLine()) != null) {
            String[] p = line.split("\t");
            if (p.length < 3) continue;
            Address a = toAddr(p[0]);
            String kind = p[1], name = p[2];
            if (kind.equals("V")) {
                try { st.createLabel(a, name, SourceType.USER_DEFINED); nl++; } catch (Exception e) {}
                continue;
            }
            String cls = null, fn = name;
            int i = name.indexOf("::");
            if (i > 0) { cls = name.substring(0, i); fn = name.substring(i + 2); }
            Function f = getFunctionAt(a);
            if (f == null) {
                disassemble(a);
                f = createFunction(a, null);
                if (f != null) created++;
            }
            if (f == null) { println("FAIL " + line); continue; }
            try {
                Namespace ns = currentProgram.getGlobalNamespace();
                if (cls != null) {
                    ns = st.getNamespace(cls, currentProgram.getGlobalNamespace());
                    if (ns == null) ns = st.createNameSpace(currentProgram.getGlobalNamespace(), cls, SourceType.USER_DEFINED);
                }
                f.setParentNamespace(ns);
                f.setName(fn, SourceType.USER_DEFINED);
                if (kind.equals("M")) f.setCallingConvention("__fastcall");
                nf++;
            } catch (Exception e) { println("ERR " + line + " " + e); }
        }
        br.close();
        println("APPLYNAMES_DONE funcs=" + nf + " labels=" + nl + " created=" + created);
    }
}
