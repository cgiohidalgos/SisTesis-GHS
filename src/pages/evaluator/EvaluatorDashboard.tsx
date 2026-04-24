import AppLayout from "@/components/layout/AppLayout";
import StatusBadge from "@/components/thesis/StatusBadge";
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getApiBase } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { FileText, Users, Calendar, Clock, Eye, EyeOff, CheckCircle2, Search, X } from "lucide-react";
import { statusLabels } from "@/lib/mock-data";

const API_BASE = getApiBase();

export default function EvaluatorDashboard() {
  const [theses, setTheses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const { user } = useAuth();
  const navigate = useNavigate();

  const allPrograms = useMemo(() =>
    [...new Set(theses.flatMap(t => (t.programs || []).map((p: any) => p.name)))].sort()
  , [theses]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return theses.filter(t => {
      const matchSearch = !q ||
        t.title?.toLowerCase().includes(q) ||
        (t.students || []).some((s: any) => (s.name || "").toLowerCase().includes(q));
      const matchStatus = !statusFilter || t.status === statusFilter;
      const matchProgram = !programFilter || (t.programs || []).some((p: any) => p.name === programFilter);
      return matchSearch && matchStatus && matchProgram;
    });
  }, [theses, search, statusFilter, programFilter]);

  const hasFilters = !!(search || statusFilter || programFilter);

  const fetchTheses = async (currentUser: any) => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('No se pudieron cargar los proyectos de grado');
      let data = await resp.json();
      if (currentUser) {
        data = data.map((t:any) => {
          const myEvals = Array.isArray(t.evaluations)
            ? t.evaluations.filter((e:any) => String(e.evaluator_id) === String(currentUser.id))
            : [];
          const currentRound = Number(t.revision_round || 0);
          const myCurrentRoundEvals = myEvals.filter((e:any) => Number(e.revision_round || 0) === currentRound);
          let hasDoc = myCurrentRoundEvals.some((e:any) => e.evaluation_type !== 'presentation');
          const hasPres = myCurrentRoundEvals.some((e:any) => e.evaluation_type === 'presentation');

          if (!hasDoc) {
            const thesisIsDone = t.status === 'sustentacion' || t.status === 'finalized';
            const prevAccepted = myEvals.some((e:any) =>
              e.evaluation_type !== 'presentation' &&
              Number(e.revision_round || 0) < currentRound &&
              e.concept === 'accepted'
            );
            if (prevAccepted || thesisIsDone) hasDoc = true;
          }

          const completed = hasDoc && (!t.defense_date || hasPres);
          const myAssignment = Array.isArray(t.evaluators)
            ? t.evaluators.find((e:any) => String(e.id) === String(currentUser.id))
            : null;
          return {
            ...t,
            evaluated: myCurrentRoundEvals.length > 0 || hasDoc,
            evalCompleted: completed,
            my_due_date: myAssignment?.due_date ?? null,
            my_is_blind: myAssignment?.is_blind ?? false,
          };
        });
      }
      // remove duplicates by id just in case backend returns them
      const seen = new Set();
      data = data.filter((t:any) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      });
      setTheses(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTheses(user);
  }, [user]);

  return (
    <AppLayout role="evaluator">
      <div className="max-w-4xl mx-auto px-4 sm:px-0">
        <div className="mb-6">
          <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
            Proyectos asignados
          </h2>
          <p className="text-sm text-muted-foreground">
            Trabajos pendientes de evaluación académica.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 mb-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por título o estudiante…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="">Todos los estados</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>{label as string}</option>
            ))}
          </select>
          {allPrograms.length > 0 && (
            <select
              value={programFilter}
              onChange={e => setProgramFilter(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">Todos los programas</option>
              {allPrograms.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {hasFilters && (
            <button
              onClick={() => { setSearch(""); setStatusFilter(""); setProgramFilter(""); }}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" /> Limpiar
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          {hasFilters ? `Mostrando ${filtered.length} de ${theses.length} proyecto(s)` : `${theses.length} proyecto(s) en total`}
        </p>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{theses.length === 0 ? "No tienes proyectos asignados por el momento." : "No se encontraron proyectos con esos filtros."}</p>
            {hasFilters && <button onClick={() => { setSearch(""); setStatusFilter(""); setProgramFilter(""); }} className="text-sm text-accent hover:underline mt-1">Limpiar filtros</button>}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((thesis) => (
              <button
                key={thesis.id}
                onClick={() => navigate(`/evaluator/rubric/${thesis.id}`)}
                className="w-full text-left bg-card rounded-lg border shadow-card hover:shadow-elevated transition-all duration-300 group"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-heading font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-2">
                      {thesis.title}
                    </h3>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {thesis.my_is_blind ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded">
                          <EyeOff className="w-3 h-3" /> Par ciego
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded">
                          <Eye className="w-3 h-3" /> Abierto
                        </span>
                      )}
                      {thesis.evaluated && thesis.status !== 'evaluacion_terminada' && (
                        <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded">Evaluado</span>
                      )}
                      <StatusBadge status={thesis.status} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    {thesis.students?.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        {thesis.students
                          .map((s: any) => s.name?.split(" ").slice(0, 2).join(" "))
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                    {thesis.programs?.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        📚 {thesis.programs.map((p: any) => p.name).join(", ")}
                      </span>
                    )}
                    {thesis.my_due_date && (
                      <span className="flex items-center gap-1.5 text-amber-600">
                        <Clock className="w-3.5 h-3.5" />
                        Fecha límite:{" "}
                        {new Date(
                          thesis.my_due_date > 1e12 ? thesis.my_due_date : thesis.my_due_date * 1000
                        ).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {thesis.created_at
                        ? new Date(
                            thesis.created_at > 1e12
                              ? thesis.created_at
                              : thesis.created_at * 1000
                          ).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })
                        : ""}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
