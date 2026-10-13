// Heuristically mark caller-cleanup functions as __cdecl so stack args are recovered.
// @category VKB
import java.util.*;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;
import ghidra.program.model.scalar.Scalar;

public class FixConv extends GhidraScript {
    @Override
    public void run() throws Exception {
        Listing lst = currentProgram.getListing();
        FunctionManager fm = currentProgram.getFunctionManager();
        ReferenceManager rm = currentProgram.getReferenceManager();
        int set = 0, total = 0, retn = 0;
        for (Function f : fm.getFunctions(true)) {
            if (f.isThunk() || f.isExternal()) continue;
            total++;
            // any RET imm in body -> callee cleanup -> not cdecl
            boolean calleeClean = false;
            InstructionIterator ii = lst.getInstructions(f.getBody(), true);
            int n = 0;
            while (ii.hasNext() && n++ < 20000) {
                Instruction ins = ii.next();
                if (ins.getMnemonicString().equals("RET") && ins.getNumOperands() > 0) {
                    Object[] o = ins.getOpObjects(0);
                    if (o.length > 0 && o[0] instanceof Scalar && ((Scalar) o[0]).getUnsignedValue() > 0) calleeClean = true;
                }
            }
            if (calleeClean) { retn++; continue; }
            int votes = 0, sites = 0;
            for (Reference r : rm.getReferencesTo(f.getEntryPoint())) {
                if (!r.getReferenceType().isCall()) continue;
                Instruction call = lst.getInstructionAt(r.getFromAddress());
                if (call == null) continue;
                sites++;
                Instruction nx = call.getNext();
                if (nx == null) continue;
                String s = nx.toString();
                if (s.startsWith("ADD ESP,") || s.equals("POP ECX")) votes++;
                if (sites > 400) break;
            }
            if (votes >= 1 && votes * 2 >= sites) {
                try { f.setCallingConvention("__cdecl"); set++; } catch (Exception e) { println("ERR " + f + " " + e); }
            }
        }
        println("FIXCONV_DONE total=" + total + " cdecl=" + set + " calleeclean=" + retn);
    }
}
