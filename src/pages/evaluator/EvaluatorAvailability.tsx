import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { getApiBase } from "@/lib/utils";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = getApiBase();

interface Block {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
}

const HOURS = Array.from({ length: 29 }, (_, i) => {
  const h = Math.floor(i / 2) + 7; // 07:00 → 21:00 en pasos de 30 min
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // lunes=0
}

function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function EvaluatorAvailability({ forceRole }: { forceRole?: string } = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const token = localStorage.getItem("token");

  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [newStart, setNewStart] = useState("08:00");
  const [newEnd, setNewEnd] = useState("10:00");
  const [saving, setSaving] = useState(false);

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`${API_BASE}/availability/me`, { headers })
      .then(r => r.json())
      .then(setBlocks)
      .catch(() => {});
  }, []);

  const blocksForDate = (fecha: string) => blocks.filter(b => b.fecha === fecha);
  const daysWithBlocks = new Set(blocks.map(b => b.fecha));

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDow = getFirstDayOfWeek(viewYear, viewMonth);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  async function addBlock() {
    if (!selectedDate) return;
    if (newStart >= newEnd) {
      toast({ title: "Error", description: "La hora de inicio debe ser anterior a la hora de fin", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/availability`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: selectedDate, hora_inicio: newStart, hora_fin: newEnd }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Error al guardar");
      }
      const created = await res.json();
      setBlocks(prev => [...prev, created]);
      toast({ title: "Guardado", description: "Bloque de disponibilidad agregado" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function deleteBlock(id: string) {
    try {
      await fetch(`${API_BASE}/availability/${id}`, { method: "DELETE", headers });
      setBlocks(prev => prev.filter(b => b.id !== id));
      toast({ title: "Eliminado", description: "Bloque de disponibilidad eliminado" });
    } catch {
      toast({ title: "Error", description: "No se pudo eliminar", variant: "destructive" });
    }
  }

  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  const selectedBlocks = selectedDate ? blocksForDate(selectedDate) : [];

  const role = forceRole || (Array.isArray(user?.roles) ? user.roles[0] : user?.role) || "evaluator";

  return (
    <AppLayout role={role as any}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <CalendarDays className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Mi disponibilidad</h1>
            <p className="text-sm text-muted-foreground">Marca los días y horarios en que puedes asistir a sustentaciones</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Calendario */}
          <div className="bg-card border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="p-1 rounded hover:bg-accent">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="font-semibold text-base">
                {MONTH_NAMES[viewMonth]} {viewYear}
              </span>
              <button onClick={nextMonth} className="p-1 rounded hover:bg-accent">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Encabezado días */}
            <div className="grid grid-cols-7 mb-1">
              {["Lu","Ma","Mi","Ju","Vi","Sa","Do"].map(d => (
                <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            {/* Celdas */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const dateStr = toDateStr(viewYear, viewMonth, day);
                const isPast = dateStr < todayStr;
                const isSelected = dateStr === selectedDate;
                const hasBlocks = daysWithBlocks.has(dateStr);
                return (
                  <button
                    key={day}
                    disabled={isPast}
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={[
                      "relative flex items-center justify-center rounded-lg h-9 text-sm font-medium transition-colors",
                      isPast ? "text-muted-foreground/40 cursor-not-allowed" : "hover:bg-accent cursor-pointer",
                      isSelected ? "bg-primary text-primary-foreground hover:bg-primary" : "",
                      dateStr === todayStr && !isSelected ? "ring-1 ring-primary" : "",
                    ].join(" ")}
                  >
                    {day}
                    {hasBlocks && !isSelected && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-500" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Con disponibilidad</span>
              <span className="flex items-center gap-1"><span className="w-4 h-4 rounded flex items-center justify-center ring-1 ring-primary text-[10px]">●</span> Hoy</span>
            </div>
          </div>

          {/* Panel de bloques */}
          <div className="bg-card border rounded-xl p-4 shadow-sm flex flex-col gap-4">
            {!selectedDate ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-10">
                <CalendarDays className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Selecciona un día en el calendario para agregar o ver tu disponibilidad</p>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="font-semibold text-base">
                    {new Date(selectedDate + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Bloques de disponibilidad para este día</p>
                </div>

                {/* Bloques existentes */}
                {selectedBlocks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay bloques registrados para este día.</p>
                ) : (
                  <ul className="space-y-2">
                    {selectedBlocks.map(b => (
                      <li key={b.id} className="flex items-center justify-between bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg px-3 py-2">
                        <span className="text-sm font-medium text-green-800 dark:text-green-300">
                          {b.hora_inicio} – {b.hora_fin}
                        </span>
                        <button
                          onClick={() => deleteBlock(b.id)}
                          className="text-red-400 hover:text-red-600 p-1 rounded"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Agregar nuevo bloque */}
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Agregar bloque</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Desde</label>
                      <select
                        value={newStart}
                        onChange={e => setNewStart(e.target.value)}
                        className="border rounded px-2 py-1.5 text-sm bg-background"
                      >
                        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Hasta</label>
                      <select
                        value={newEnd}
                        onChange={e => setNewEnd(e.target.value)}
                        className="border rounded px-2 py-1.5 text-sm bg-background"
                      >
                        {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col justify-end">
                      <label className="text-xs text-muted-foreground invisible">btn</label>
                      <button
                        onClick={addBlock}
                        disabled={saving}
                        className="flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
                      >
                        <Plus className="w-4 h-4" />
                        Agregar
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Resumen de toda la disponibilidad */}
        {blocks.length > 0 && (
          <div className="mt-6 bg-card border rounded-xl p-4 shadow-sm">
            <h2 className="font-semibold mb-3">Toda mi disponibilidad registrada</h2>
            <div className="space-y-2">
              {Object.entries(
                blocks.reduce((acc, b) => {
                  if (!acc[b.fecha]) acc[b.fecha] = [];
                  acc[b.fecha].push(b);
                  return acc;
                }, {} as Record<string, Block[]>)
              ).sort(([a], [b]) => a.localeCompare(b)).map(([fecha, bs]) => (
                <div key={fecha} className="flex items-start gap-3">
                  <span className="text-sm font-medium w-44 shrink-0">
                    {new Date(fecha + "T12:00:00").toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {bs.map(b => (
                      <span key={b.id} className="text-xs bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 px-2 py-0.5 rounded-full">
                        {b.hora_inicio} – {b.hora_fin}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
