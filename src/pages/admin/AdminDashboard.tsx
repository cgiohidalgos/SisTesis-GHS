import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import { FileText, Users, CheckCircle2, Clock, AlertTriangle, CalendarDays } from "lucide-react";
import { useEffect, useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

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
          { label: 'Total proyectos de grado', value: sjson.totalTheses, icon: FileText, color: 'text-info' },
          { label: 'En Evaluación', value: sjson.inEvaluation, icon: Clock, color: 'text-warning' },
          { label: 'Finalizadas', value: sjson.finalized, icon: CheckCircle2, color: 'text-success' },
          { label: 'Evaluadores', value: sjson.evaluators, icon: Users, color: 'text-accent' },
        ];
        const dueStats = [];
        if (sjson.overdue !== undefined) {
          dueStats.push({ label: 'Evaluaciones vencidas', value: sjson.overdue, icon: Clock, color: 'text-destructive', link: '/admin/evaluations?due=overdue' });
        }
        if (sjson.due7 !== undefined) {
          dueStats.push({ label: 'Vence <7d', value: sjson.due7, icon: Clock, color: 'text-warning', link: '/admin/evaluations?due=7' });
        }
        if (sjson.due15 !== undefined) {
          dueStats.push({ label: 'Vence <15d', value: sjson.due15, icon: Clock, color: 'text-warning', link: '/admin/evaluations?due=15' });
        }
        if (sjson.due30 !== undefined) {
          dueStats.push({ label: 'Vence <30d', value: sjson.due30, icon: Clock, color: 'text-warning', link: '/admin/evaluations?due=30' });
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

  useEffect(() => {
    fetchData();
  }, []);

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
                    {date!.toLocaleDateString('es-CO', { weekday: 'short', month: 'short', day: 'numeric' })}
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
              className={`bg-card rounded-lg border shadow-card p-3 sm:p-5 ${stat.link ? 'cursor-pointer hover:bg-accent/10' : ''}`}
              onClick={() => {
                if (stat.link) navigate(stat.link);
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-4 h-4 sm:w-5 sm:h-5 ${stat.color}`} />
              </div>
              <p className="text-xl sm:text-2xl font-heading font-bold text-foreground">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Overview chart */}
        <div className="mb-8 h-48 sm:h-64 bg-card rounded-lg p-4 shadow-card">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats}
                dataKey="value"
                nameKey="label"
                outerRadius={80}
                fill="#8884d8"
                label
              >
                {stats.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#8884d8','#ffc658','#82ca9d','#a4de6c'][index % 4]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Breakdown by program */}
        {byProgram.length > 0 && (
          <>
            <h3 className="font-heading text-lg font-semibold text-foreground mb-4">
              Estadísticas por Programa {isSuper ? "(todos los programas)" : "(mis programas)"}
            </h3>
            <div className="overflow-x-auto mb-8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="p-2 text-left min-w-[120px]">Programa</th>
                    <th className="p-2 min-w-[80px]">En evaluación</th>
                    <th className="p-2 min-w-[80px]">Finalizadas</th>
                    <th className="p-2 min-w-[80px]">Otras</th>
                  </tr>
                </thead>
                <tbody>
                  {byProgram.map((p) => {
                    const counts = p.counts || {};
                    const inEval = (counts.submitted || 0) + (counts.revision_minima || 0) + (counts.revision_cuidados || 0);
                    const fin = (counts.sustentacion || 0) + (counts.finalized || 0);
                    const other = Object.entries(counts)
                      .filter(([k]) => !['submitted','revision_minima','revision_cuidados','sustentacion','finalized'].includes(k))
                      .reduce((sum, [,v]) => sum + (v as number), 0);
                    return (
                      <tr key={p.program_id} className="border-t">
                        <td className="p-2">{p.program_name || 'Sin programa'}</td>
                        <td className="p-2 text-center">{inEval}</td>
                        <td className="p-2 text-center">{fin}</td>
                        <td className="p-2 text-center">{other}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mb-8 h-48 sm:h-64 bg-card rounded-lg p-4 shadow-card">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byProgram.map(p => {
                  const counts = p.counts || {};
                  const inEval = (counts.submitted || 0) + (counts.revision_minima || 0) + (counts.revision_cuidados || 0);
                  const fin = counts.sustentacion || 0;
                  const other = Object.entries(counts)
                    .filter(([k]) => !['submitted','revision_minima','revision_cuidados','sustentacion'].includes(k))
                    .reduce((sum, [,v]) => sum + (v as number), 0);
                  return { name: p.program_name, inEval, finalized: fin, other };
                })}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} height={48} tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + '…' : v} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="inEval" stackId="a" fill="#8884d8" />
                  <Bar dataKey="finalized" stackId="a" fill="#82ca9d" />
                  <Bar dataKey="other" stackId="a" fill="#ffc658" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {evalStats.length > 0 && (
              <>
                <h3 className="font-heading text-lg font-semibold text-foreground mb-4">
                  Estadísticas por Evaluador
                </h3>
                <div className="overflow-x-auto mb-8">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted">
                        <th className="p-2 text-left">Evaluador</th>
                        <th className="p-2">Proyectos asignados</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evalStats.map((e) => (
                        <tr key={e.id} className="border-t">
                          <td className="p-2">{e.name}</td>
                          <td className="p-2 text-center">{e.theses}</td>
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
            />
          ))}
          {theses.length > 5 && (
            <Link to="/admin/theses" className="block text-center text-sm text-accent hover:underline py-2">
              Ver todos los {theses.length} proyectos →
            </Link>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
