import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import { getApiBase } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import DigitalSignSection from "@/components/thesis/DigitalSignSection";

const API_BASE = getApiBase();

async function downloadFile(url: string, fileName: string) {
  try {
    const backendBase = API_BASE || `${window.location.protocol}//${window.location.hostname}:4000`;
    const token = localStorage.getItem('token');
    const resp = await fetch(`${backendBase}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!resp.ok) throw new Error(`Error descargando archivo (${resp.status})`);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err: any) {
    alert(err.message || 'No se pudo descargar el archivo');
  }
}

function normalizePersonName(person: any): string {
  if (typeof person === 'string' || typeof person === 'number') return String(person);
  if (!person) return '';
  const candidate = person.name ?? person.user_id;
  if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
  if (typeof candidate === 'object' && candidate !== null) return String(candidate.name ?? candidate.user_id ?? '');
  return '';
}

function normalizePersonKey(person: any): string {
  if (typeof person === 'string') return person;
  if (!person) return '';
  if (person.user_id) return String(person.user_id);
  if (person.id) return String(person.id);
  if (person.name) return String(person.name);
  try { return JSON.stringify(person, Object.keys(person).sort()); } catch { return String(person); }
}

export default function DirectorThesisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [thesis, setThesis] = useState<any>(null);
  const [weights, setWeights] = useState<{ doc: number; presentation: number }>({ doc: 70, presentation: 30 });
  const [actaStatus, setActaStatus] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/theses/${id}`, { headers: { Authorization: token ? `Bearer ${token}` : '' } })
      .then(r => r.json())
      .then(data => setThesis(data))
      .catch(() => toast.error('No se pudo cargar la tesis'));

    fetch(`${API_BASE}/admin/weights`, { headers: { Authorization: token ? `Bearer ${token}` : '' } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setWeights({ doc: data.doc ?? 70, presentation: data.presentation ?? 30 }); })
      .catch(() => {});
    
    fetch(`${API_BASE}/theses/${id}/acta/digital-signature-status`, { headers: { Authorization: token ? `Bearer ${token}` : '' } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setActaStatus(data); })
      .catch(() => {});
  }, [id]);

  const consolidated = (() => {
    if (!thesis?.evaluations?.length) return null;
    const docScores = thesis.evaluations.filter((e: any) => e.evaluation_type !== 'presentation').map((e: any) => e.final_score).filter((n: any) => n != null);
    const presScores = thesis.evaluations.filter((e: any) => e.evaluation_type === 'presentation').map((e: any) => e.final_score).filter((n: any) => n != null);
    const docAvg = docScores.length ? docScores.reduce((a: number, b: number) => a + b, 0) / docScores.length : 0;
    const presAvg = presScores.length ? presScores.reduce((a: number, b: number) => a + b, 0) / presScores.length : 0;
    let finalWeighted = thesis.defense_date
      ? (docAvg * (weights.doc / 100)) + (presAvg * (weights.presentation / 100))
      : docAvg;
    if (thesis.status === 'finalized' && thesis.final_weighted_override != null) {
      finalWeighted = thesis.final_weighted_override;
    }
    const byEvaluator: Record<string, { doc: number | null; pres: number | null; name?: string }> = {};
    thesis.evaluations.forEach((ev: any) => {
      const key = normalizePersonKey(ev.evaluator_name || ev);
      const name = normalizePersonName(ev.evaluator_name || ev) || 'Evaluador';
      if (!byEvaluator[key]) byEvaluator[key] = { doc: null, pres: null };
      if (ev.evaluation_type === 'presentation') byEvaluator[key].pres = ev.final_score;
      else byEvaluator[key].doc = ev.final_score;
      if (!byEvaluator[key].name) byEvaluator[key].name = name;
    });
    return { docAvg, presAvg, finalWeighted, byEvaluator };
  })();

  if (!thesis) {
    return (
      <AppLayout role="evaluator">
        <div className="max-w-4xl mx-auto px-4 py-8 text-muted-foreground">Cargando...</div>
      </AppLayout>
    );
  }

  const safeStr = (v: any) => {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (Array.isArray(v)) return v.map(safeStr).join(', ');
    return v.name ?? v.user_id ?? JSON.stringify(v);
  };

  return (
    <AppLayout role="evaluator">
      <div className="max-w-4xl mx-auto px-4 sm:px-0">
        <div className="mb-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/evaluator/my-students')}>
            ← Mis Estudiantes
          </Button>
        </div>

        {/* Thesis info */}
        <div className="mb-6 bg-card p-6 rounded-lg shadow-card">
          <h2 className="font-heading text-2xl font-bold mb-3">Detalle de Tesis</h2>
          <p className="text-sm text-muted-foreground mb-1"><strong>Estado:</strong> <span className="capitalize">{safeStr(thesis.status)}</span></p>
          {thesis.title && <p className="text-sm text-muted-foreground mb-1"><strong>Título:</strong> {safeStr(thesis.title)}</p>}
          {thesis.student_name && <p className="text-sm text-muted-foreground mb-1"><strong>Estudiante:</strong> {safeStr(thesis.student_name)}</p>}
          {thesis.directors?.length > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              <strong>Director(es):</strong> {thesis.directors.map((d: any) => safeStr(d)).join(', ')}
            </p>
          )}
          {thesis.program_name && <p className="text-sm text-muted-foreground mb-1"><strong>Programa:</strong> {safeStr(thesis.program_name)}</p>}
        </div>

        {/* Evaluators */}
        {thesis.evaluators?.length > 0 && (
          <div className="mb-6 bg-white dark:bg-slate-950 rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Evaluadores</h3>
            </div>
            <div className="p-6 space-y-3">
              {thesis.evaluators.map((ev: any, idx: number) => {
                const docSent = thesis.evaluations?.some((x: any) => x.evaluator_id === ev.id && x.evaluation_type !== 'presentation');
                const presSent = thesis.evaluations?.some((x: any) => x.evaluator_id === ev.id && x.evaluation_type === 'presentation');
                const docEval = thesis.evaluations?.find((x: any) => x.evaluator_id === ev.id && x.evaluation_type !== 'presentation');
                const presEval = thesis.evaluations?.find((x: any) => x.evaluator_id === ev.id && x.evaluation_type === 'presentation');
                return (
                  <div key={ev.id || idx} className="border border-border rounded-lg p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-medium">{ev.name || ev.full_name}</span>
                      <span className="text-xs text-muted-foreground">{ev.email}</span>
                      {ev.due_date && <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Límite: {ev.due_date}</span>}
                      {ev.is_blind && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Par Ciego</span>}
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className={docSent ? 'text-success' : 'text-muted-foreground'}>
                        Documento: {docSent ? `✓ ${docEval?.final_score?.toFixed(1) ?? ''}` : 'Pendiente'}
                      </span>
                      <span className={presSent ? 'text-success' : 'text-muted-foreground'}>
                        Sustentación: {presSent ? `✓ ${presEval?.final_score?.toFixed(1) ?? ''}` : 'Pendiente'}
                      </span>
                    </div>
                    {ev.revisionFiles?.length > 0 && (
                      <div className="mt-2">
                        <span className="text-xs font-semibold text-muted-foreground">Archivos del Evaluador:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {ev.revisionFiles.map((f: any, fi: number) => (
                            <button
                              key={fi}
                              onClick={() => downloadFile(f.url, f.name)}
                              className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-700 hover:bg-blue-100 transition-colors"
                            >
                              {f.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Calificaciones del documento */}
        {thesis.evaluations?.filter((e: any) => e.evaluation_type !== 'presentation').length > 0 && (
          <div className="mb-6 bg-white dark:bg-slate-950 rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calificaciones del Documento</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {thesis.evaluations.filter((e: any) => e.evaluation_type !== 'presentation').map((ev: any, idx: number) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-border">
                    <p className="text-sm text-muted-foreground font-medium mb-1">{ev.evaluator_name || `Evaluador ${idx + 1}`}</p>
                    <p className="text-3xl font-black text-primary">{ev.final_score != null ? ev.final_score.toFixed(1) : '-'}<span className="text-sm text-muted-foreground font-normal ml-1">/ 5.00</span></p>
                    {ev.concept && <p className="text-xs mt-1 capitalize text-muted-foreground">{ev.concept.replace(/_/g, ' ')}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Calificación consolidada */}
        {consolidated && (
          <div className="mb-6 bg-white dark:bg-slate-950 rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calificación Consolidada</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <p className="text-4xl font-black text-primary">
                    {consolidated.finalWeighted.toFixed(1)}
                    <span className="text-lg text-muted-foreground font-medium ml-1">/ 5.00</span>
                  </p>
                  <p className="text-sm font-medium text-success mt-1">Nota Final Ponderada</p>
                </div>
                <div className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 p-3 rounded-lg font-mono">
                  Cálculo: ({consolidated.docAvg.toFixed(1)} x {weights.doc}%)
                  {thesis.defense_date ? ` + (${consolidated.presAvg.toFixed(1)} x ${weights.presentation}%)` : ''}
                  {' '}= {consolidated.finalWeighted.toFixed(1)}
                </div>
              </div>
              <div className="text-sm">
                {Object.entries(consolidated.byEvaluator).map(([key, scores], idx) => {
                  const docScore = scores.doc;
                  const presScore = scores.pres;
                  const displayName = scores.name || key;
                  const totalScore = thesis.defense_date
                    ? ((docScore || 0) * (weights.doc / 100) + (presScore || 0) * (weights.presentation / 100))
                    : docScore;
                  return (
                    <div key={`${key}-${idx}`} className="mb-2">
                      <strong>{displayName}</strong>: documento {docScore != null ? docScore.toFixed(1) : '-'}, sustentación {presScore != null ? presScore.toFixed(1) : '-'}, total {totalScore != null ? (totalScore as number).toFixed(1) : '-'}
                      <div className="text-xs text-muted-foreground">
                        ({docScore != null ? `${docScore.toFixed(1)} x ${weights.doc}%` : '0'}
                        {thesis.defense_date ? ` + ${presScore != null ? `${presScore.toFixed(1)} x ${weights.presentation}%` : '0'}` : ''})
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        {thesis.timeline?.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Historial</h3>
            <ThesisTimeline events={thesis.timeline} isAdmin={true} />
          </div>
        )}

        {actaStatus?.allSigned && (
          <div className="mb-6 border rounded-xl p-6 bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-green-900 dark:text-green-100 mb-2">
                  ¡Gracias por haber dirigido este trabajo!
                </h3>
                <p className="text-sm text-green-800 dark:text-green-200 mb-4">
                  El proceso de sustentación ha concluido exitosamente. A continuación puede descargar todos los documentos relacionados con esta tesis.
                </p>
                <button
                  className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium flex items-center gap-2 transition-colors shadow-md"
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${id}/download-complete-package`, {
                        headers: { Authorization: token ? 'Bearer ' + token : '' },
                      });
                      if (!resp.ok) {
                        const err = await resp.json().catch(() => ({ error: 'Error al descargar' }));
                        throw new Error(err.error || 'Error al descargar');
                      }
                      const disposition = resp.headers.get('Content-Disposition') || '';
                      const match = disposition.match(/filename="?([^"]+)"?/);
                      const filename = match ? match[1] : 'Tesis_Completa.zip';
                      const blob = await resp.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = decodeURIComponent(filename);
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                      toast.success('Paquete completo descargado');
                    } catch (e: any) {
                      toast.error(e.message || 'Error al descargar el paquete completo');
                    }
                  }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Descargar Paquete Completo (.zip)
                </button>
                <p className="text-xs text-green-700 dark:text-green-300 mt-3">
                  El archivo incluye: todos los documentos enviados, acta de sustentación (PDF y Word), y rúbricas completas (XLSX) de todos los evaluadores.
                </p>
              </div>
            </div>
          </div>
        )}

        {id && user && (
          <DigitalSignSection
            thesisId={id}
            userName={user.full_name || ""}
            myRole="director"
            myUserId={user.id}
            showAllPending={true}
          />
        )}
      </div>
    </AppLayout>
  );
}
