import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import { FileText, UserCheck, Clock, AlertTriangle, CalendarDays, CheckCircle2, XCircle, ChevronRight, X, Send, Bell } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

import { getApiBase } from "@/lib/utils";
const API_BASE = getApiBase();

function getDefenseDate(thesis: any): Date | null {
  if (thesis.defense_date) {
    const ms = thesis.defense_date > 1e12 ? thesis.defense_date : thesis.defense_date * 1000;
    return new Date(ms);
  }
  for (const ev of (thesis.timeline || [])) {
    if (ev.defense_date) {
      const ms = ev.defense_date > 1e12 ? ev.defense_date : ev.defense_date * 1000;
      return new Date(ms);
    }
  }
  return null;
}

export default function AdminDashboard() {
  const { isSuper } = useAuth();
  const [stats, setStats] = useState<any[]>([]);
  const [byProgram, setByProgram] = useState<any[]>([]);
  const [evalStats, setEvalStats] = useState<any[]>([]);
  const [theses, setTheses] = useState<any[]>([]);
  const [evalModal, setEvalModal] = useState<{ evaluator: any; theses: any[] } | null>(null);
  const [evalModalLoading, setEvalModalLoading] = useState(false);

  // Recordatorios
  const [pendingEvals, setPendingEvals] = useState<any[]>([]);
  const [reminderSelected, setReminderSelected] = useState<Set<string>>(new Set());
  const [reminderConfirm, setReminderConfirm] = useState(false);
  const [reminderSending, setReminderSending] = useState(false);
  const [reminderFilter, setReminderFilter] = useState<'all' | 'overdue' | 'week'>('all');

  const navigate = useNavigate();
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: token ? `Bearer ${token}` : '' };
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const [sresp, tresp] = await Promise.all([
        fetch(`${API_BASE}/admin/stats`, { headers, signal: controller.signal }),
        fetch(`${API_BASE}/theses`, { headers, signal: controller.signal }),
      ]);
      clearTimeout(timeoutId);
      if (sresp.ok) {
        const sjson = await sresp.json();
        const baseStats = [
          { label: 'Total proyectos de grado', value: sjson.totalTheses, icon: FileText, color: 'text-info', bg: 'bg-info/10 border-info/30', tooltip: 'Número total de proyectos de grado registrados en el sistema, sin importar su estado.' },
          { label: 'Con evaluadores asignados', value: sjson.assigned, icon: UserCheck, color: 'text-accent-foreground', bg: 'bg-accent/10 border-accent/30', tooltip: 'Proyectos que ya tienen al menos un evaluador asignado.' },
          { label: 'En Evaluación', value: sjson.inEvaluation, icon: Clock, color: 'text-warning', bg: 'bg-warning/10 border-warning/30', tooltip: 'Proyectos actualmente en proceso de evaluación: enviados, en evaluación parcial, o en revisión pendiente.' },
        ];
        const dueStats = [];
        if (sjson.overdue !== undefined) {
          dueStats.push({ label: 'Evaluaciones vencidas', value: sjson.overdue, icon: Clock, color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/30', link: '/admin/evaluations?due=overdue', tooltip: 'Evaluaciones cuya fecha límite ya pasó y aún no han sido enviadas.' });
        }
        if (sjson.due7 !== undefined) {
          dueStats.push({ label: 'Vence <7 días', value: sjson.due7, icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', link: '/admin/evaluations?due=7', tooltip: 'Evaluaciones que vencen en menos de 7 días.' });
        }
        if (sjson.due15 !== undefined) {
          dueStats.push({ label: 'Vence <15 días', value: sjson.due15, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', link: '/admin/evaluations?due=15', tooltip: 'Evaluaciones que vencen en menos de 15 días.' });
        }
        if (sjson.due30 !== undefined) {
          dueStats.push({ label: 'Vence <30 días', value: sjson.due30, icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-50/60 border-yellow-100', link: '/admin/evaluations?due=30', tooltip: 'Evaluaciones que vencen en menos de 30 días.' });
        }
        setStats(baseStats.concat(dueStats));
        if (sjson.byProgram) setByProgram(sjson.byProgram);
        if (sjson.evaluatorStats) setEvalStats(sjson.evaluatorStats);
      }
      if (tresp.ok) {
        const tjson = await tresp.json();
        setTheses(tjson);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPendingEvals = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/admin/evaluations`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (resp.ok) {
        const data = await resp.json();
        setPendingEvals(data.filter((r: any) => !r.evaluated));
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchData();
    fetchPendingEvals();
  }, []);

  const openEvalModal = async (evaluator: any) => {
    setEvalModal({ evaluator, theses: [] });
    setEvalModalLoading(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/admin/evaluator/${evaluator.id}/theses`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (resp.ok) {
        const data = await resp.json();
        setEvalModal({ evaluator, theses: data });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setEvalModalLoading(false);
    }
  };

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  // Theses with overdue evaluators
  const overdueTheses = useMemo(() => theses.filter(t =>
    (t.evaluators || []).some((e: any) => {
      if (!e.due_date) return false;
      const due = new Date(e.due_date > 1e12 ? e.due_date : e.due_date * 1000);
      due.setHours(0,0,0,0);
      return due < today;
    })
  ), [theses, today]);

  // Recordatorios — filtro local
  const nowSec = Math.floor(Date.now() / 1000);
  const reminderVisible = useMemo(() => {
    if (reminderFilter === 'overdue') return pendingEvals.filter(r => r.due_date && r.due_date < nowSec);
    if (reminderFilter === 'week') return pendingEvals.filter(r => r.due_date && r.due_date >= nowSec && r.due_date < nowSec + 7 * 86400);
    return pendingEvals;
  }, [pendingEvals, reminderFilter, nowSec]);

  const reminderAllSelected = reminderVisible.length > 0 && reminderVisible.every(r => reminderSelected.has(r.assignment_id));
  const toggleReminderAll = () => {
    if (reminderAllSelected) {
      setReminderSelected(s => { const n = new Set(s); reminderVisible.forEach(r => n.delete(r.assignment_id)); return n; });
    } else {
      setReminderSelected(s => { const n = new Set(s); reminderVisible.forEach(r => n.add(r.assignment_id)); return n; });
    }
  };

  const sendReminders = async () => {
    setReminderSending(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/admin/send-reminders`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_ids: [...reminderSelected] }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Error');
      toast.success(`Recordatorios enviados: ${data.sent}${data.failed ? ` | Fallidos: ${data.failed}` : ''}`);
      setReminderSelected(new Set());
      setReminderConfirm(false);
    } catch (e: any) {
      toast.error(e.message || 'Error enviando recordatorios');
    } finally {
      setReminderSending(false);
    }
  };

  // Upcoming defenses in next 7 days
  const upcomingDefenses = useMemo(() => {
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    return theses
      .map(t => ({ thesis: t, date: getDefenseDate(t) }))
      .filter(({ date }) => date && date >= today && date <= in7)
      .sort((a, b) => a.date!.getTime() - b.date!.getTime());
  }, [theses, today]);

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto px-0">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
          Panel de Administración
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Gestión integral del proceso de evaluación de proyectos de grado.
        </p>

        {/* Urgency alert */}
        {overdueTheses.length > 0 && (
          <div className="mb-6 rounded-lg border border-destructive/40 bg-destructive/8 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
              <p className="text-sm font-semibold text-destructive">
                {overdueTheses.length} proyecto(s) con evaluación vencida
              </p>
            </div>
            <div className="space-y-1.5">
              {overdueTheses.slice(0, 5).map(t => (
                <Link
                  key={t.id}
                  to={`/admin/theses/${t.id}`}
                  className="flex items-center justify-between text-xs text-destructive/90 hover:text-destructive hover:underline py-0.5"
                >
                  <span className="line-clamp-1 flex-1">{t.title}</span>
                  <span className="ml-2 flex-shrink-0">
                    {(t.students || []).map((s: any) => s.name?.split(' ').slice(0,2).join(' ')).filter(Boolean).join(', ')}
                  </span>
                </Link>
              ))}
              {overdueTheses.length > 5 && (
                <Link to="/admin/evaluations?due=overdue" className="text-xs text-destructive hover:underline">
                  Ver {overdueTheses.length - 5} más →
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Upcoming defenses */}
        {upcomingDefenses.length > 0 && (
          <div className="mb-6 rounded-lg border border-info/40 bg-info/8 p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-info flex-shrink-0" />
              <p className="text-sm font-semibold text-info">
                {upcomingDefenses.length} defensa(s) en los próximos 7 días
              </p>
            </div>
            <div className="space-y-1.5">
              {upcomingDefenses.map(({ thesis, date }) => (
                <Link
                  key={thesis.id}
                  to={`/admin/theses/${thesis.id}`}
                  className="flex items-center justify-between text-xs text-info/90 hover:text-info hover:underline py-0.5"
                >
                  <span className="line-clamp-1 flex-1">{thesis.title}</span>
                  <span className="ml-2 flex-shrink-0 font-medium">
                    {date!.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'long' })}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              title={stat.tooltip || stat.label}
              className={`relative bg-card rounded-xl border shadow-card p-3 sm:p-5 transition-all duration-150 ${stat.link ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''} ${stat.bg || ''}`}
              onClick={() => { if (stat.link) navigate(stat.link); }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.bg || 'bg-muted'}`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                {stat.link && (
                  <svg className={`w-3.5 h-3.5 ${stat.color} opacity-60`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </div>
              <p className={`text-2xl sm:text-3xl font-heading font-bold ${stat.color}`}>
                {stat.value ?? 0}
              </p>
              <p className="text-xs text-muted-foreground leading-tight mt-1 font-medium">{stat.label}</p>
              {stat.tooltip && (
                <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity duration-150 z-10 pointer-events-none">
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-popover text-popover-foreground text-xs rounded-lg shadow-lg border p-2.5 text-center leading-relaxed">
                    {stat.tooltip}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-popover" />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>



        {/* Recordatorios a evaluadores */}
        {pendingEvals.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-lg font-semibold text-foreground flex items-center gap-2">
                <Bell className="w-5 h-5 text-warning" />
                Recordatorios a Evaluadores
              </h3>
              <Link to="/admin/evaluations" className="text-xs text-primary hover:underline flex items-center gap-1">
                Ver página completa <ChevronRight className="w-3 h-3" />
              </Link>
            </div>

            {/* Filtros rápidos */}
            <div className="flex flex-wrap gap-2 mb-3">
              {([['all','Todos'], ['overdue','Vencidos'], ['week','Esta semana']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setReminderFilter(key); setReminderSelected(new Set()); }}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    reminderFilter === key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-muted'
                  }`}
                >
                  {label} ({key === 'all' ? pendingEvals.length : key === 'overdue' ? pendingEvals.filter(r => r.due_date && r.due_date < nowSec).length : pendingEvals.filter(r => r.due_date && r.due_date >= nowSec && r.due_date < nowSec + 7*86400).length})
                </button>
              ))}
              {reminderSelected.size > 0 && (
                <button
                  onClick={() => setReminderConfirm(true)}
                  className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Send className="w-3 h-3" />
                  Enviar recordatorio ({reminderSelected.size})
                </button>
              )}
            </div>

            {/* Tabla compacta */}
            <div className="rounded-xl border shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/60 text-left">
                    <th className="p-2.5 w-8">
                      <input type="checkbox" checked={reminderAllSelected} onChange={toggleReminderAll} className="w-3.5 h-3.5 accent-primary" />
                    </th>
                    <th className="p-2.5 font-semibold text-xs">Evaluador</th>
                    <th className="p-2.5 font-semibold text-xs">Proyecto</th>
                    <th className="p-2.5 font-semibold text-xs">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {reminderVisible.slice(0, 10).map((r, i) => {
                    const isOverdue = r.due_date && r.due_date < nowSec;
                    const isSoon = r.due_date && r.due_date >= nowSec && r.due_date < nowSec + 7*86400;
                    const isChecked = reminderSelected.has(r.assignment_id);
                    return (
                      <tr key={r.assignment_id} className={`border-t transition-colors ${isChecked ? 'bg-primary/5' : i % 2 === 0 ? '' : 'bg-muted/5'} hover:bg-muted/20`}>
                        <td className="p-2.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => setReminderSelected(s => { const n = new Set(s); n.has(r.assignment_id) ? n.delete(r.assignment_id) : n.add(r.assignment_id); return n; })}
                            className="w-3.5 h-3.5 accent-primary"
                          />
                        </td>
                        <td className="p-2.5">
                          <div className="font-medium text-xs">{r.evaluator_name}</div>
                          <div className="text-[11px] text-muted-foreground">{r.program_name}</div>
                        </td>
                        <td className="p-2.5 max-w-[200px]">
                          <Link to={`/admin/theses/${r.thesis_id}`} className="text-xs hover:underline line-clamp-1">{r.thesis_title}</Link>
                        </td>
                        <td className="p-2.5 whitespace-nowrap">
                          {r.due_date ? (
                            <span className={`inline-flex items-center gap-1 text-xs ${isOverdue ? 'text-destructive font-medium' : isSoon ? 'text-warning font-medium' : 'text-muted-foreground'}`}>
                              {isOverdue && <AlertTriangle className="w-3 h-3" />}
                              {isSoon && <Clock className="w-3 h-3" />}
                              {new Date(r.due_date * 1000).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {reminderVisible.length > 10 && (
                <div className="px-4 py-2.5 border-t bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
                  <span>Mostrando 10 de {reminderVisible.length}</span>
                  <Link to="/admin/evaluations" className="text-primary hover:underline">Ver todos →</Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Breakdown by program */}
        {byProgram.length > 0 && (
          <>
            <h3 className="font-heading text-lg font-semibold text-foreground mb-4">
              Estadísticas por Programa {isSuper ? "(todos los programas)" : "(mis programas)"}
            </h3>
            <div className="mb-8 space-y-3">
              {byProgram.map((p) => {
                const counts = p.counts || {};
                const assigned   = counts.evaluators_assigned || 0;
                const inEval     = (counts.submitted || 0) + (counts.en_evaluacion || 0);
                const revMin     = counts.revision_minima || 0;
                const revCuid    = counts.revision_cuidados || 0;
                const revSent    = counts.revision_submitted || 0;
                const sust       = counts.sustentacion || 0;
                const total      = Object.values(counts).reduce((s: number, v: any) => s + (v as number), 0);
                const segments = [
                  { label: 'Con evaluadores asignados', value: assigned,  color: 'bg-muted-foreground/30' },
                  { label: 'En evaluación',              value: inEval,    color: 'bg-warning' },
                  { label: 'Revisión mínima',            value: revMin,    color: 'bg-yellow-400' },
                  { label: 'Revisión con cuidados',      value: revCuid,   color: 'bg-purple-500' },
                  { label: 'Revisión enviada',           value: revSent,   color: 'bg-blue-400' },
                  { label: 'Aprobado — Sustentación',    value: sust,      color: 'bg-success' },
                ].filter(s => s.value > 0);
                return (
                  <div key={p.program_id} className="rounded-xl border bg-card p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-semibold text-sm text-foreground">{p.program_name || 'Sin programa'}</span>
                      <span className="text-xs text-muted-foreground font-medium">{total} proyecto{total !== 1 ? 's' : ''}</span>
                    </div>
                    {/* Barra de progreso segmentada */}
                    <div className="flex h-3 w-full rounded-full overflow-hidden gap-px mb-3">
                      {total === 0 ? (
                        <div className="flex-1 bg-muted rounded-full" />
                      ) : segments.map((s) => (
                        <div
                          key={s.label}
                          className={`${s.color} transition-all`}
                          style={{ width: `${(s.value / total) * 100}%` }}
                          title={`${s.label}: ${s.value}`}
                        />
                      ))}
                    </div>
                    {/* Leyenda compacta */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {[
                        { label: 'Asignados',         value: assigned, dot: 'bg-muted-foreground/50' },
                        { label: 'En evaluación',      value: inEval,   dot: 'bg-warning' },
                        { label: 'Rev. mínima',        value: revMin,   dot: 'bg-yellow-400' },
                        { label: 'Rev. con cuidados',  value: revCuid,  dot: 'bg-purple-500' },
                        { label: 'Rev. enviada',       value: revSent,  dot: 'bg-blue-400' },
                        { label: 'Sustentación',       value: sust,     dot: 'bg-success' },
                      ].map(item => (
                        <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.dot}`} />
                          {item.label}:&nbsp;<span className={`font-semibold ${item.value > 0 ? 'text-foreground' : 'text-muted-foreground/40'}`}>{item.value}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {evalStats.length > 0 && (
              <>
                <h3 className="font-heading text-lg font-semibold text-foreground mb-4">
                  Estadísticas por Evaluador
                </h3>
                <div className="overflow-x-auto mb-8 rounded-xl border shadow-card">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/70">
                        <th className="p-3 text-left font-semibold text-muted-foreground">Evaluador</th>
                        <th className="p-3 text-center font-semibold">Proyectos asignados</th>
                        <th className="p-3 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {evalStats.map((e, i) => (
                        <tr
                          key={e.id}
                          className={`border-t transition-colors cursor-pointer hover:bg-accent/10 ${i % 2 === 0 ? '' : 'bg-muted/10'}`}
                          onClick={() => openEvalModal(e)}
                        >
                          <td className="p-3 font-medium">{e.name}</td>
                          <td className="p-3 text-center">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-info/15 text-info font-bold text-xs">{e.theses}</span>
                          </td>
                          <td className="p-3 text-muted-foreground/50"><ChevronRight className="w-4 h-4" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* Recent Theses */}
        <h3 className="font-heading text-lg font-semibold text-foreground mb-4">
          Proyectos recientes
        </h3>
        <div className="space-y-4">
          {theses.slice(0, 5).map((thesis) => (
            <ThesisCard
              key={thesis.id}
              thesis={thesis}
              linkTo="/admin/theses"
              showAssignedBy
            />
          ))}
          {theses.length > 5 && (
            <Link to="/admin/theses" className="block text-center text-sm text-accent hover:underline py-2">
              Ver todos los {theses.length} proyectos →
            </Link>
          )}
        </div>
      </div>

      {/* Evaluator detail modal */}
      {evalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEvalModal(null)}>
          <div className="bg-card rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="font-heading text-base font-semibold">{evalModal.evaluator.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{evalModal.evaluator.theses} proyecto(s) asignado(s)</p>
              </div>
              <button onClick={() => setEvalModal(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {evalModalLoading ? (
                <p className="text-sm text-muted-foreground text-center py-8">Cargando...</p>
              ) : evalModal.theses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Sin proyectos asignados.</p>
              ) : (
                <div className="space-y-3">
                  {(() => {
                    // Agrupar filas por thesis_id (puede haber varias filas si hay varios estudiantes)
                    const grouped = new Map<string, { thesis: any; students: string[] }>();
                    for (const t of evalModal.theses) {
                      if (!grouped.has(t.thesis_id)) {
                        grouped.set(t.thesis_id, { thesis: t, students: [] });
                      }
                      if (t.student_name) grouped.get(t.thesis_id)!.students.push(t.student_name);
                    }
                    const conceptLabels: Record<string, string> = {
                      accepted: 'Aceptado',
                      minor_changes: 'Cambios mínimos',
                      major_changes: 'Revisión con cuidados',
                    };
                    const conceptColors: Record<string, string> = {
                      accepted: 'bg-green-100 text-green-700',
                      minor_changes: 'bg-yellow-100 text-yellow-700',
                      major_changes: 'bg-purple-100 text-purple-700',
                    };
                    return [...grouped.values()].map(({ thesis: t, students }) => {
                      const dueMs = t.due_date ? (t.due_date > 1e12 ? t.due_date : t.due_date * 1000) : null;
                      const dueDate = dueMs ? new Date(dueMs) : null;
                      const isOverdue = dueMs && dueMs * 1000 < Date.now();
                      const evaluated = t.eval_count && t.eval_count > 0;
                      return (
                        <div key={t.thesis_id} className="rounded-lg border p-3 bg-card hover:bg-muted/20 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              to={`/admin/theses/${t.thesis_id}`}
                              className="font-medium text-sm hover:underline text-foreground line-clamp-2 flex-1"
                              onClick={() => setEvalModal(null)}
                            >
                              {t.title}
                            </Link>
                            {evaluated ? (
                              <span className={`shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${conceptColors[t.latest_concept] || 'bg-green-100 text-green-700'}`}>
                                <CheckCircle2 className="w-3 h-3" />
                                {conceptLabels[t.latest_concept] || 'Evaluado'}
                              </span>
                            ) : (
                              <span className="shrink-0 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                                <XCircle className="w-3 h-3" />
                                Pendiente
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                            {students.length > 0 && (
                              <span>
                                {students.length === 1 ? 'Estudiante' : 'Estudiantes'}:{' '}
                                <span className="font-medium text-foreground">{students.join(', ')}</span>
                              </span>
                            )}
                            {dueDate ? (
                              <span className={isOverdue && !evaluated ? 'text-destructive font-medium' : ''}>
                                Vence: {dueDate.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                                {isOverdue && !evaluated && ' ⚠️'}
                              </span>
                            ) : (
                              <span>Sin fecha límite</span>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación recordatorios */}
      {reminderConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !reminderSending && setReminderConfirm(false)}>
          <div className="bg-card rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-lg font-semibold">Confirmar envío</h3>
              <button onClick={() => !reminderSending && setReminderConfirm(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Se enviará un recordatorio a <strong>{reminderSelected.size}</strong> evaluador{reminderSelected.size !== 1 ? 'es' : ''}:
            </p>
            <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-lg border p-3 bg-muted/30">
              {pendingEvals.filter(r => reminderSelected.has(r.assignment_id)).map(r => (
                <div key={r.assignment_id} className="text-xs">
                  <span className="font-medium">{r.evaluator_name}</span>
                  <div className="text-muted-foreground truncate">{r.thesis_title}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 justify-end pt-1">
              <button onClick={() => setReminderConfirm(false)} disabled={reminderSending} className="px-4 py-2 rounded-lg border text-sm hover:bg-muted transition-colors">Cancelar</button>
              <button onClick={sendReminders} disabled={reminderSending} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60">
                <Send className="w-4 h-4" />
                {reminderSending ? 'Enviando...' : `Enviar ${reminderSelected.size}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
