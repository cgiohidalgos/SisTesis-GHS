import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { toast } from "sonner";
import { getApiBase } from "@/lib/utils";
import { Send, CheckCircle2, AlertTriangle, Clock, X } from "lucide-react";

const API_BASE = getApiBase();

type Eval = {
  assignment_id: string;
  thesis_id: string;
  thesis_title: string;
  evaluator_id: string;
  evaluator_name: string;
  evaluator_email: string;
  due_date: number | null;
  is_blind: number;
  program_name: string;
  evaluated: number;
};

const DUE_FILTERS = [
  { key: "", label: "Todas" },
  { key: "overdue", label: "Vencidas" },
  { key: "7", label: "< 7 días" },
  { key: "15", label: "< 15 días" },
  { key: "30", label: "< 30 días" },
];

export default function AdminEvaluations() {
  const [rows, setRows] = useState<Eval[]>([]);
  const [loading, setLoading] = useState(true);
  const [dueFilter, setDueFilter] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const now = Math.floor(Date.now() / 1000);

  const fetchEvals = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const url = new URL(`${API_BASE}/admin/evaluations`);
      if (dueFilter) url.searchParams.set("due", dueFilter);
      const resp = await fetch(url.toString(), {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!resp.ok) throw new Error("Error cargando evaluaciones");
      setRows(await resp.json());
      setSelected(new Set());
    } catch (e: any) {
      toast.error(e.message || "Error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEvals(); }, [dueFilter]);

  // Programas únicos para el dropdown
  const programs = useMemo(() => {
    const set = new Set(rows.map((r) => r.program_name));
    return [...set].sort();
  }, [rows]);

  // Filas visibles según filtros locales
  const visible = useMemo(() => {
    return rows.filter((r) => {
      if (programFilter && r.program_name !== programFilter) return false;
      if (onlyPending && r.evaluated) return false;
      return true;
    });
  }, [rows, programFilter, onlyPending]);

  // Seleccionables (los que ya evaluaron no son seleccionables)
  const selectableIds = useMemo(() =>
    visible.filter((r) => !r.evaluated).map((r) => r.assignment_id),
    [visible]
  );

  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((s) => { const n = new Set(s); selectableIds.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelected((s) => { const n = new Set(s); selectableIds.forEach((id) => n.add(id)); return n; });
    }
  };

  const toggle = (id: string) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  // Selección rápida por categoría
  const selectCategory = (category: "overdue" | "week" | "pending") => {
    const ids = visible
      .filter((r) => !r.evaluated)
      .filter((r) => {
        if (category === "overdue") return r.due_date && r.due_date < now;
        if (category === "week") return r.due_date && r.due_date >= now && r.due_date < now + 7 * 86400;
        return true; // pending = all not evaluated
      })
      .map((r) => r.assignment_id);
    setSelected((s) => { const n = new Set(s); ids.forEach((id) => n.add(id)); return n; });
  };

  const selectedRows = useMemo(() =>
    rows.filter((r) => selected.has(r.assignment_id)),
    [rows, selected]
  );

  const sendReminders = async () => {
    setSending(true);
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/admin/send-reminders`, {
        method: "POST",
        headers: { Authorization: token ? `Bearer ${token}` : "", "Content-Type": "application/json" },
        body: JSON.stringify({ assignment_ids: [...selected] }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Error");
      toast.success(`Recordatorios enviados: ${data.sent}${data.failed ? ` | Fallidos: ${data.failed}` : ""}`);
      setSelected(new Set());
      setConfirmOpen(false);
    } catch (e: any) {
      toast.error(e.message || "Error enviando recordatorios");
    } finally {
      setSending(false);
    }
  };

  const urgencyIcon = (r: Eval) => {
    if (!r.due_date) return null;
    if (r.due_date < now) return <AlertTriangle className="w-3.5 h-3.5 text-destructive" title="Vencida" />;
    if (r.due_date < now + 7 * 86400) return <Clock className="w-3.5 h-3.5 text-warning" title="Vence pronto" />;
    return null;
  };

  return (
    <AppLayout role="admin">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Encabezado */}
        <div>
          <h2 className="font-heading text-2xl font-bold text-foreground">Evaluaciones Pendientes</h2>
          <p className="text-sm text-muted-foreground mt-1">Selecciona evaluadores y envía recordatorios por correo.</p>
        </div>

        {/* Filtros de urgencia */}
        <div className="flex flex-wrap gap-2">
          {DUE_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setDueFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                dueFilter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Filtros secundarios */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
            className="text-sm border rounded-md px-3 py-1.5 bg-background"
          >
            <option value="">Todos los programas</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            Solo pendientes
          </label>

          <span className="text-xs text-muted-foreground ml-auto">
            {visible.length} registro{visible.length !== 1 ? "s" : ""} visibles
          </span>
        </div>

        {/* Selección rápida por categoría */}
        <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Selección rápida</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => selectCategory("overdue")}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Todos vencidos
            </button>
            <button
              onClick={() => selectCategory("week")}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20 transition-colors"
            >
              <Clock className="w-3.5 h-3.5" />
              Vencen esta semana
            </button>
            <button
              onClick={() => selectCategory("pending")}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
            >
              Todos pendientes visibles
            </button>
            {programFilter && (
              <button
                onClick={() => selectCategory("pending")}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent-foreground border border-accent/20 hover:bg-accent/20 transition-colors"
              >
                Todos de «{programFilter}»
              </button>
            )}
            {selected.size > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-muted text-muted-foreground border hover:bg-muted/80 transition-colors ml-auto"
              >
                <X className="w-3.5 h-3.5" />
                Limpiar selección ({selected.size})
              </button>
            )}
          </div>
        </div>

        {/* Barra de acción */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <span className="text-sm font-medium">
              {selected.size} evaluador{selected.size !== 1 ? "es" : ""} seleccionado{selected.size !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Send className="w-4 h-4" />
              Enviar recordatorio ({selected.size})
            </button>
          </div>
        )}

        {/* Tabla */}
        <div className="rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 text-left">
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-primary"
                    title="Seleccionar todos visibles"
                  />
                </th>
                <th className="p-3 font-semibold">Proyecto</th>
                <th className="p-3 font-semibold">Evaluador</th>
                <th className="p-3 font-semibold">Programa</th>
                <th className="p-3 font-semibold">Vence</th>
                <th className="p-3 font-semibold text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Cargando...</td></tr>
              ) : visible.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Sin registros para los filtros seleccionados.</td></tr>
              ) : (
                visible.map((r, i) => {
                  const isSelected = selected.has(r.assignment_id);
                  const isEvaluated = !!r.evaluated;
                  return (
                    <tr
                      key={r.assignment_id}
                      className={`border-t transition-colors ${isEvaluated ? "opacity-50" : "hover:bg-muted/20"} ${
                        isSelected ? "bg-primary/5" : i % 2 === 0 ? "" : "bg-muted/5"
                      }`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isEvaluated}
                          onChange={() => toggle(r.assignment_id)}
                          className="w-4 h-4 accent-primary"
                        />
                      </td>
                      <td className="p-3 max-w-xs">
                        <Link
                          to={`/admin/theses/${r.thesis_id}`}
                          className="hover:underline text-foreground font-medium line-clamp-2"
                        >
                          {r.thesis_title}
                        </Link>
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{r.evaluator_name}</div>
                        {!r.is_blind && r.evaluator_email && (
                          <div className="text-xs text-muted-foreground">{r.evaluator_email}</div>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">{r.program_name}</td>
                      <td className="p-3">
                        {r.due_date ? (
                          <span className="inline-flex items-center gap-1.5">
                            {urgencyIcon(r)}
                            <span className={r.due_date < now ? "text-destructive font-medium" : ""}>
                              {new Date(r.due_date * 1000).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Sin fecha</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {isEvaluated ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-success/15 text-success px-2 py-0.5 rounded-full font-medium">
                            <CheckCircle2 className="w-3 h-3" />
                            Entregada
                          </span>
                        ) : r.due_date && r.due_date < now ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">
                            <AlertTriangle className="w-3 h-3" />
                            Vencida
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs bg-warning/10 text-warning px-2 py-0.5 rounded-full font-medium">
                            <Clock className="w-3 h-3" />
                            Pendiente
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de confirmación */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !sending && setConfirmOpen(false)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold">Confirmar envío</h3>
              <button onClick={() => !sending && setConfirmOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Se enviará un recordatorio por correo a los siguientes <strong>{selected.size}</strong> evaluador{selected.size !== 1 ? "es" : ""}:
            </p>
            <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-lg border p-3 bg-muted/30">
              {selectedRows.map((r) => (
                <div key={r.assignment_id} className="text-xs">
                  <span className="font-medium">{r.evaluator_name}</span>
                  {r.evaluator_email && <span className="text-muted-foreground"> — {r.evaluator_email}</span>}
                  <div className="text-muted-foreground truncate">{r.thesis_title}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={sending}
                className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={sendReminders}
                disabled={sending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
                {sending ? "Enviando..." : `Enviar ${selected.size} recordatorio${selected.size !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
