import AppLayout from "@/components/layout/AppLayout";
import { getApiBase } from "@/lib/utils";
import { useEffect, useState } from "react";
import { CalendarDays, Users, ChevronDown, ChevronUp, Clock } from "lucide-react";

const API_BASE = getApiBase();

interface Thesis {
  id: string;
  title: string;
  status: string;
  evaluators: { id: string; full_name: string }[];
  directors: { id: string; full_name: string }[];
}

interface Slot {
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
}

interface OverlapResult {
  slots: Slot[];
  users: { id: string; full_name: string }[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  submitted: "Enviada",
  under_review: "En revisión",
  assigned: "Asignada",
  evaluated: "Evaluada",
  approved: "Aprobada",
  rejected: "Rechazada",
};

function groupByDate(slots: Slot[]) {
  const map: Record<string, Slot[]> = {};
  for (const s of slots) {
    if (!map[s.fecha]) map[s.fecha] = [];
    map[s.fecha].push(s);
  }
  return map;
}

function formatDate(fecha: string) {
  return new Date(fecha + "T12:00:00").toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

export default function AdminAvailability() {
  const token = localStorage.getItem("token");
  const headers = { Authorization: `Bearer ${token}` };

  const [theses, setTheses] = useState<Thesis[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [overlap, setOverlap] = useState<OverlapResult | null>(null);
  const [loadingOverlap, setLoadingOverlap] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/admin/theses-with-participants`, { headers })
      .then(r => r.json())
      .then(data => { setTheses(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function loadOverlap(thesisId: string) {
    if (selected === thesisId) { setSelected(null); setOverlap(null); return; }
    setSelected(thesisId);
    setOverlap(null);
    setLoadingOverlap(true);
    try {
      const res = await fetch(`${API_BASE}/admin/availability/thesis/${thesisId}`, { headers });
      const data = await res.json();
      setOverlap(data);
    } catch {
      setOverlap({ slots: [], users: [] });
    } finally {
      setLoadingOverlap(false);
    }
  }

  const filtered = theses.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase())
  );

  const participants = (t: Thesis) => [
    ...t.directors.map(d => ({ ...d, tipo: "Director" })),
    ...t.evaluators.map(e => ({ ...e, tipo: "Evaluador" })),
  ];

  return (
    <AppLayout role="admin">
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <CalendarDays className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Disponibilidades para sustentaciones</h1>
            <p className="text-sm text-muted-foreground">
              Selecciona un proyecto para ver los horarios donde todos los participantes coinciden
            </p>
          </div>
        </div>

        <input
          type="text"
          placeholder="Buscar proyecto..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm mb-4 bg-background"
        />

        {loading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">Cargando proyectos...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No hay proyectos.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(t => {
              const parts = participants(t);
              const isOpen = selected === t.id;
              const grouped = overlap && isOpen ? groupByDate(overlap.slots) : null;
              const hasParticipants = parts.length > 0;

              return (
                <div key={t.id} className="border rounded-xl overflow-hidden bg-card shadow-sm">
                  {/* Cabecera de la tesis */}
                  <button
                    className="w-full flex items-start justify-between gap-4 p-4 text-left hover:bg-accent/50 transition-colors"
                    onClick={() => loadOverlap(t.id)}
                    disabled={!hasParticipants}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{t.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                          {STATUS_LABELS[t.status] || t.status}
                        </span>
                        {parts.length > 0 ? (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {parts.map(p => p.full_name).join(", ")}
                          </span>
                        ) : (
                          <span className="text-xs text-orange-500">Sin evaluadores ni director asignados</span>
                        )}
                      </div>
                    </div>
                    {hasParticipants && (
                      isOpen ? <ChevronUp className="w-4 h-4 shrink-0 mt-1 text-muted-foreground" />
                              : <ChevronDown className="w-4 h-4 shrink-0 mt-1 text-muted-foreground" />
                    )}
                  </button>

                  {/* Panel de intersección */}
                  {isOpen && (
                    <div className="border-t bg-background/50 p-4">
                      {loadingOverlap ? (
                        <p className="text-sm text-muted-foreground">Calculando disponibilidades...</p>
                      ) : !overlap ? null : (
                        <>
                          {/* Participantes con cuenta */}
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              Participantes considerados
                            </p>
                            {overlap.users.length === 0 ? (
                              <p className="text-sm text-orange-500">Ningún participante tiene cuenta activa en el sistema.</p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {overlap.users.map(u => {
                                  const tipo = t.directors.find(d => d.id === u.id) ? "Director" : "Evaluador";
                                  return (
                                    <span key={u.id} className="text-xs px-2 py-1 rounded-full border bg-background">
                                      {u.full_name}
                                      <span className="ml-1 text-muted-foreground">· {tipo}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Slots de intersección */}
                          <div>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              Horarios donde todos coinciden (bloques de 40 min mínimo)
                            </p>
                            {overlap.slots.length === 0 ? (
                              <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 rounded-lg px-3 py-2">
                                <Clock className="w-4 h-4 shrink-0" />
                                No hay horarios donde todos los participantes estén disponibles al mismo tiempo.
                                {overlap.users.length < parts.length && (
                                  <span className="block text-xs mt-0.5">
                                    Nota: {parts.length - overlap.users.length} participante(s) no han registrado disponibilidad.
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {Object.entries(grouped!).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, slots]) => (
                                  <div key={fecha}>
                                    <p className="text-sm font-medium capitalize mb-1">{formatDate(fecha)}</p>
                                    <div className="flex flex-wrap gap-2">
                                      {slots.map((s, i) => (
                                        <span
                                          key={i}
                                          className="text-sm bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800 px-3 py-1 rounded-lg font-medium"
                                        >
                                          {s.hora_inicio} – {s.hora_fin}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                                {overlap.users.length < parts.length && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    ⚠️ {parts.length - overlap.users.length} participante(s) aún no han registrado disponibilidad — estos horarios son parciales.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
