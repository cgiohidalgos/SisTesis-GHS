import AppLayout from "@/components/layout/AppLayout";
import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getApiBase } from "@/lib/utils";
import { Users, Calendar, UserCheck, Mail, Clock, Eye, EyeOff, Search, X, ChevronDown } from "lucide-react";
import StatusBadge from "@/components/thesis/StatusBadge";
import { statusLabels } from "@/lib/mock-data";

const API_BASE = getApiBase();

export default function AdminDirectedTheses() {
  const navigate = useNavigate();
  const [theses, setTheses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [visibleEvaluators, setVisibleEvaluators] = useState<Record<string, boolean>>({});
  const [openEvaluatorSections, setOpenEvaluatorSections] = useState<Record<string, boolean>>({});

  const toggleEvaluator = (key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setVisibleEvaluators(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleEvaluatorSection = (thesisId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenEvaluatorSections(prev => ({ ...prev, [thesisId]: !prev[thesisId] }));
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/theses/directed`, {
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    })
      .then((r) => r.json())
      .then((data) => setTheses(Array.isArray(data) ? data : []))
      .catch(() => setTheses([]))
      .finally(() => setLoading(false));
  }, []);

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
  const clearFilters = () => { setSearch(""); setStatusFilter(""); setProgramFilter(""); };

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto px-4 sm:px-0">
        <div className="mb-6">
          <h2 className="font-heading text-2xl font-bold text-foreground mb-1">Mis Estudiantes</h2>
          <p className="text-sm text-muted-foreground">Proyectos de grado en los que estás asignado como director.</p>
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
              onClick={clearFilters}
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
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{theses.length === 0 ? "No tienes estudiantes asignados como director." : "No se encontraron proyectos con esos filtros."}</p>
            {hasFilters && <button onClick={clearFilters} className="text-sm text-accent hover:underline mt-1">Limpiar filtros</button>}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((thesis) => {
              const studentNames = Array.isArray(thesis.students)
                ? thesis.students.map((s: any) => (s.name || s.full_name || "").split(" ").slice(0, 2).join(" ")).filter(Boolean).join(", ")
                : "";
              const programNames = Array.isArray(thesis.programs)
                ? thesis.programs.map((p: any) => p.name).join(", ")
                : "";
              return (
                <button
                  key={thesis.id}
                  className="w-full text-left bg-card rounded-lg border shadow-card hover:shadow-elevated transition-all duration-300 group"
                  onClick={() => navigate(`/admin/directed-thesis/${thesis.id}`)}
                >
                  <div className="p-5">
                    <div className="mb-3">
                      <h3 className="font-heading font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-2">
                        {thesis.title}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <StatusBadge status={thesis.status} />
                      {studentNames && (
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          {studentNames}
                        </span>
                      )}
                      {programNames && (
                        <span className="flex items-center gap-1.5">
                          📚 {programNames}
                        </span>
                      )}
                      {thesis.created_at && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(thesis.created_at > 1e12 ? thesis.created_at : thesis.created_at * 1000)
                            .toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
                        </span>
                      )}
                    </div>

                    {Array.isArray(thesis.evaluators) && thesis.evaluators.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                        <button
                          onClick={(e) => toggleEvaluatorSection(thesis.id, e)}
                          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          Evaluadores asignados ({thesis.evaluators.length})
                          <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${openEvaluatorSections[thesis.id] ? "rotate-180" : ""}`} />
                        </button>
                        {openEvaluatorSections[thesis.id] && thesis.evaluators.map((ev: any, i: number) => {
                          const key = `${thesis.id}-${i}`;
                          const visible = !!visibleEvaluators[key];
                          return (
                            <div key={i} className="text-xs text-muted-foreground pl-5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              <button
                                onClick={(e) => toggleEvaluator(key, e)}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                Ver datos del evaluador
                              </button>
                              {visible && (
                                <>
                                  <span className="font-medium text-foreground">{ev.name}</span>
                                  <span className="flex items-center gap-1">
                                    <Mail className="w-3 h-3" />
                                    {ev.institutional_email}
                                  </span>
                                </>
                              )}
                              {ev.due_date && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span style={{ color: ev.has_evaluated ? "#16a34a" : "#e85d04" }} className="font-semibold">Fecha límite:</span>{" "}
                                  {new Date(ev.due_date > 1e12 ? ev.due_date : ev.due_date * 1000)
                                    .toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
