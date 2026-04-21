import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { toast } from "sonner";
import { getApiBase } from "@/lib/utils";
import { Download, BarChart2, AlertTriangle } from "lucide-react";

const API = getApiBase();

function authHeaders() {
  const token = localStorage.getItem("token");
  return { Authorization: token ? `Bearer ${token}` : "" };
}

interface EvaluatorStat {
  full_name: string;
  email: string;
  total_asignadas: number;
  completadas: number;
  vencidas: number;
  promedio_nota: number | null;
  dias_promedio: number | null;
}

interface Discrepancy {
  thesis_id: string;
  title: string;
  evaluadores: string;
  nota_max: number;
  nota_min: number;
  diferencia: number;
}

export default function AdminReports() {
  const navigate = useNavigate();
  const [evaluators, setEvaluators] = useState<EvaluatorStat[]>([]);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [threshold, setThreshold] = useState(1.0);
  const [loadingEval, setLoadingEval] = useState(true);
  const [loadingDisc, setLoadingDisc] = useState(true);

  useEffect(() => {
    fetch(`${API}/admin/reports/evaluators`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setEvaluators(data); setLoadingEval(false); })
      .catch(() => { toast.error("Error cargando reporte de evaluadores"); setLoadingEval(false); });
  }, []);

  useEffect(() => {
    setLoadingDisc(true);
    fetch(`${API}/admin/reports/discrepancies?threshold=${threshold}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setDiscrepancies(data); setLoadingDisc(false); })
      .catch(() => { toast.error("Error cargando discrepancias"); setLoadingDisc(false); });
  }, [threshold]);

  const downloadCSV = () => {
    const token = localStorage.getItem("token");
    const url = `${API}/admin/reports/theses`;
    fetch(url, { headers: { Authorization: token ? `Bearer ${token}` : "" } })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `tesis-${Date.now()}.csv`;
        a.click();
      })
      .catch(() => toast.error("Error descargando CSV"));
  };

  const diffColor = (d: number) => {
    if (d >= 2) return "text-red-600 font-bold";
    if (d >= 1) return "text-yellow-600 font-semibold";
    return "text-foreground";
  };

  return (
    <AppLayout role="admin">
      <div className="max-w-5xl mx-auto space-y-10">
        <div>
          <h2 className="font-heading text-2xl font-bold text-foreground mb-1 flex items-center gap-2">
            <BarChart2 className="w-6 h-6" /> Reportes
          </h2>
          <p className="text-muted-foreground text-sm">Métricas y análisis del sistema</p>
        </div>

        {/* Exportación CSV */}
        <section className="bg-card border rounded-xl p-5">
          <h3 className="font-semibold text-lg mb-1">Exportación avanzada</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Descarga todas las tesis con directores, notas de documento, presentación, nota final y concepto.
          </p>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            <Download className="w-4 h-4" /> Descargar CSV completo
          </button>
        </section>

        {/* Rendimiento de evaluadores */}
        <section className="bg-card border rounded-xl p-5">
          <h3 className="font-semibold text-lg mb-4">Rendimiento de evaluadores</h3>
          {loadingEval ? (
            <p className="text-muted-foreground text-sm">Cargando...</p>
          ) : evaluators.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sin datos aún.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Evaluador</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Asignadas</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Completadas</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Vencidas</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Nota prom.</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Días prom.</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluators.map((e, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition">
                      <td className="py-2 pr-4">
                        <p className="font-medium">{e.full_name}</p>
                        <p className="text-xs text-muted-foreground">{e.email}</p>
                      </td>
                      <td className="text-center py-2 px-2">{e.total_asignadas}</td>
                      <td className="text-center py-2 px-2">{e.completadas}</td>
                      <td className="text-center py-2 px-2">
                        {e.vencidas > 0 ? (
                          <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                            <AlertTriangle className="w-3 h-3" />{e.vencidas}
                          </span>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </td>
                      <td className="text-center py-2 px-2">
                        {e.promedio_nota != null ? e.promedio_nota.toFixed(2) : "—"}
                      </td>
                      <td className="text-center py-2 px-2">
                        {e.dias_promedio != null ? `${e.dias_promedio}d` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Discrepancias */}
        <section className="bg-card border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h3 className="font-semibold text-lg">Discrepancias de calificación</h3>
              <p className="text-muted-foreground text-sm">Tesis donde los evaluadores difieren significativamente</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <label className="text-muted-foreground">Diferencia mínima:</label>
              <select
                value={threshold}
                onChange={e => setThreshold(parseFloat(e.target.value))}
                className="border rounded px-2 py-1 text-sm bg-background"
              >
                <option value={0.5}>≥ 0.5</option>
                <option value={1.0}>≥ 1.0</option>
                <option value={1.5}>≥ 1.5</option>
                <option value={2.0}>≥ 2.0</option>
              </select>
            </div>
          </div>
          {loadingDisc ? (
            <p className="text-muted-foreground text-sm">Cargando...</p>
          ) : discrepancies.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No hay tesis con diferencia ≥ {threshold.toFixed(1)} entre evaluadores.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Tesis</th>
                    <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Evaluadores</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Nota máx.</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Nota mín.</th>
                    <th className="text-center py-2 px-2 font-medium text-muted-foreground">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {discrepancies.map((d, i) => (
                    <tr
                      key={i}
                      className="border-b last:border-0 hover:bg-muted/30 transition cursor-pointer"
                      onClick={() => navigate(`/admin/theses/${d.thesis_id}`)}
                    >
                      <td className="py-2 pr-4 max-w-[240px]">
                        <p className="font-medium line-clamp-2">{d.title}</p>
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground text-xs">{d.evaluadores}</td>
                      <td className="text-center py-2 px-2">{d.nota_max?.toFixed(2)}</td>
                      <td className="text-center py-2 px-2">{d.nota_min?.toFixed(2)}</td>
                      <td className={`text-center py-2 px-2 ${diffColor(d.diferencia)}`}>
                        {d.diferencia?.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  );
}
