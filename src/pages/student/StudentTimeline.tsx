import AppLayout from "@/components/layout/AppLayout";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import StatusBadge from "@/components/thesis/StatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { getApiBase } from "@/lib/utils";
const API_BASE = getApiBase();

const downloadFile = async (url: string, fileName: string) => {
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
    a.click();
    URL.revokeObjectURL(blobUrl);
  } catch (err: any) {
    toast.error(err.message || 'No se pudo descargar el archivo');
  }
};

function ScoreCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl p-4 bg-white dark:bg-slate-950 space-y-3">
      <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{label}</h3>
      {children}
    </div>
  );
}

export default function StudentTimeline() {
  const [thesis, setThesis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState<{doc:number;presentation:number}>({doc:70,presentation:30});
  const [programDocRubric, setProgramDocRubric] = useState<any[] | null>(null);
  const [programPresRubric, setProgramPresRubric] = useState<any[] | null>(null);
  const [revisionComment, setRevisionComment] = useState('');
  const [revisionFiles, setRevisionFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [submittingRevision, setSubmittingRevision] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTheses = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`${API_BASE}/theses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error("Error consultando proyectos de grado");
        let data = await resp.json();
        if (data && data[0] && data[0].timeline && Array.isArray(data[0].timeline)) {
          data[0].timeline = data[0].timeline.map((e: any) => ({
            ...e,
            date: e.date ?? undefined,
          }));
        }
        const thesisData = data[0] || null;
        setThesis(thesisData);
        const programId = thesisData?.programs?.[0]?.id;
        if (programId) {
          try {
            const rubricResp = await fetch(`${API_BASE}/admin/program-rubrics/${programId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (rubricResp.ok) {
              const rubrics = await rubricResp.json();
              const docR = rubrics.find((r: any) => r.evaluation_type === 'document');
              const presR = rubrics.find((r: any) => r.evaluation_type === 'presentation');
              if (docR) setProgramDocRubric(docR.sections_json);
              if (presR) setProgramPresRubric(presR.sections_json);
            }
          } catch (e) { /* usar rúbrica por defecto */ }
        }
      } catch (err: any) {
        toast.error(err.message || "Error consultando proyectos de grado");
      } finally {
        setLoading(false);
      }
    };
    fetchTheses();

    // fetch weights
    (async () => {
      try {
        const token = localStorage.getItem("token");
        const r = await fetch(`${API_BASE}/super/weights`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (r.ok) {
          const d = await r.json();
          setWeights({ doc: d.doc ?? 70, presentation: d.presentation ?? 30 });
        }
      } catch {}
    })();
  }, []);

  // handlers for the student revision form
  const handleRevisionFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setRevisionFiles(prev => [...prev, ...Array.from(files)]);
    setFileInputKey((k: number) => k + 1);
  };

  const removeRevisionFile = (index: number) => {
    setRevisionFiles(prev => prev.filter((_, i) => i !== index));
  };

  const submitRevision = async () => {
    if (!thesis) return;
    setSubmittingRevision(true);
    try {
      const token = localStorage.getItem('token');
      const form = new FormData();
      form.append('comment', revisionComment);
      revisionFiles.forEach(f => form.append('files', f));
      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/revision`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        body: form,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'Error al enviar revisión');
      }
      toast.success('Revisión enviada');
      // clear form and reload thesis
      setRevisionComment('');
      setRevisionFiles([]);
      const r2 = await fetch(`${API_BASE}/theses`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (r2.ok) {
        const data = await r2.json();
        setThesis(data[0] || null);
      }
    } catch (e:any) {
      toast.error(e.message || 'Error al enviar revisión');
    } finally {
      setSubmittingRevision(false);
    }
  };

  return (
    <AppLayout role="student">
      <div className="max-w-2xl mx-auto px-4 sm:px-0">
        {loading ? (
          <div className="text-center py-8">Cargando...</div>
        ) : !thesis ? (
          <div className="text-center py-8">
            <p className="mb-4">Aún no has registrado ningún proyecto de grado.</p>
            <button className="btn" onClick={() => navigate("/student/register-thesis")}>Registrar nuevo proyecto de grado</button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
                <h2 className="font-heading text-2xl font-bold text-foreground">
                  Seguimiento de mi proyecto de grado
                </h2>
                {thesis.revision_round > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">Ronda de revisión: {thesis.revision_round}</p>
                )}
                <StatusBadge status={thesis.status} />
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {thesis.title}
              </p>
              {thesis.students && thesis.students.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground mb-2">
                    <strong>Autor{thesis.students.length>1?'es':''}:</strong> {thesis.students.map((s:any)=>s.name).join(', ')}
                  </p>
                  {thesis.students.map((student: any, idx: number) => (
                    <div key={idx} className="ml-4 text-xs text-muted-foreground space-y-0.5 mb-2">
                      {student.student_code && (
                        <p><strong>Código:</strong> {student.student_code}</p>
                      )}
                      {student.cedula && (
                        <p><strong>Cédula:</strong> {student.cedula}</p>
                      )}
                      {student.institutional_email && (
                        <p><strong>Correo institucional:</strong> {student.institutional_email}</p>
                      )}
                      {student.email && student.email !== student.institutional_email && (
                        <p><strong>Correo personal:</strong> {student.email}</p>
                      )}
                      {student.cvlac && (
                        <p><strong>CVLAC:</strong> {student.cvlac}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {thesis.directors && thesis.directors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm text-muted-foreground">
                    <strong>Director{thesis.directors.length>1?'es':''}:</strong>{' '}
                    {thesis.directors
                      .map((d: any) => {
                        if (typeof d === 'string') return d;
                        const name = d?.name || d?.user_id || '';
                        const email = d?.institutional_email || d?.email;
                        return email ? `${name} (${email})` : name;
                      })
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
              )}
              {thesis.evaluators && thesis.evaluators.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Evaluadores asignados:</strong>{' '}
                  {thesis.evaluators.some((e:any)=>e.is_blind) ? (
                    <em>pares ciegos</em>
                  ) : (
                    thesis.evaluators.map((e:any)=>e.name).join(', ')
                  )}
                </p>
              )}
              {thesis.defense_date && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Sustentación:</strong> {new Date(thesis.defense_date * 1000).toLocaleString()} {thesis.defense_location ? `en ${thesis.defense_location}` : ''}
                  {thesis.defense_info && ` – ${thesis.defense_info}`}
                </p>
              )}
              {thesis.status !== 'draft' && (
                <p className="mt-2 text-sm text-red-600">
                  ⚠️ El proyecto de grado ya fue enviado a evaluación y no puede modificarse.
                </p>
              )}
            </div>
            {thesis.files && thesis.files.length > 0 && (
              <div className="mb-6">
                <h3 className="font-heading text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Documentos enviados
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {thesis.files.map((f:any) => {
                    const isUrl = f.file_url?.startsWith('http://') || f.file_url?.startsWith('https://') || 
                                  f.file_name?.startsWith('http://') || f.file_name?.startsWith('https://');
                    const isPdf = f.file_name?.toLowerCase().endsWith('.pdf');
                    const isDoc = f.file_name?.toLowerCase().match(/\.(doc|docx)$/);
                    const urlToOpen = isUrl ? (f.file_url?.startsWith('http') ? f.file_url : f.file_name) : null;
                    
                    return (
                      <div
                        key={f.id}
                        className="group relative flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/5 hover:border-accent/50 transition-all duration-200 shadow-sm hover:shadow-md"
                      >
                        <div className="flex-shrink-0">
                          {isUrl ? (
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                              </svg>
                            </div>
                          ) : isPdf ? (
                            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                              <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            </div>
                          ) : isDoc ? (
                            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                              <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          {isUrl ? (
                            <a
                              href={urlToOpen}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block w-full group-hover:text-accent transition-colors"
                            >
                              <p className="font-medium text-sm truncate">{f.file_name}</p>
                              {urlToOpen !== f.file_name && (
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{urlToOpen}</p>
                              )}
                            </a>
                          ) : (
                            <button
                              type="button"
                              className="text-left w-full group-hover:text-accent transition-colors"
                              onClick={() => downloadFile(f.file_url, f.file_name)}
                            >
                              <p className="font-medium text-sm truncate">{f.file_name}</p>
                            </button>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {isUrl ? (
                            <a
                              href={urlToOpen}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 rounded-full hover:bg-accent/10 transition-colors inline-block"
                              title="Abrir enlace en nueva pestaña"
                            >
                              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          ) : (
                            <button
                              type="button"
                              onClick={() => downloadFile(f.file_url, f.file_name)}
                              className="p-2 rounded-full hover:bg-accent/10 transition-colors"
                              title="Descargar"
                            >
                              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <ThesisTimeline
              events={thesis.timeline || []}
              isBlindReview={thesis.evaluators && thesis.evaluators.some((e:any)=>e.is_blind)}
              isAdmin={false}
              programDocRubric={programDocRubric ?? undefined}
              programPresRubric={programPresRubric ?? undefined}
            />

            {/* revision submission form — only show when ALL assigned evaluators have submitted their document evaluation */}
            {(() => {
              const canRevise = thesis.status === 'revision_minima' || thesis.status === 'revision_cuidados' || thesis.status === 'en_evaluacion';
              if (!canRevise) return null;
              const assignedIds: string[] = (thesis.evaluators || []).map((e: any) => e.id).filter(Boolean);
              
              // Get only the most recent document evaluation from each evaluator (like backend does)
              const docEvals = (thesis.evaluations || []).filter((e: any) => e.evaluation_type !== 'presentation');
              const mostRecentByEvaluator = new Map();
              docEvals.forEach((ev: any) => {
                const existingEval = mostRecentByEvaluator.get(ev.evaluator_id);
                if (!existingEval || (ev.submitted_at || 0) > (existingEval.submitted_at || 0)) {
                  mostRecentByEvaluator.set(ev.evaluator_id, ev);
                }
              });
              const docEvalIds = new Set(Array.from(mostRecentByEvaluator.keys()));
              
              const allDocEvaluated = assignedIds.length > 0 && assignedIds.every(id => docEvalIds.has(id));
              
              // Show informative message if not all evaluators have submitted yet
              if (!allDocEvaluated) {
                const evaluatedCount = docEvalIds.size;
                const totalCount = assignedIds.length;
                const revisionType = thesis.status === 'revision_minima' 
                  ? 'cambios mínimos' 
                  : thesis.status === 'revision_cuidados' 
                    ? 'cambios con cuidados' 
                    : 'evaluación en progreso';
                return (
                  <div className="mt-8 p-4 sm:p-6 border-2 border-amber-500/50 rounded-lg bg-amber-50 dark:bg-amber-950/20 space-y-3">
                    <div className="flex items-start gap-3">
                      <svg className="w-6 h-6 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1 space-y-2">
                        <h3 className="text-base font-bold text-amber-900 dark:text-amber-100">
                          {thesis.status === 'en_evaluacion' 
                            ? `Evaluación en progreso (${evaluatedCount}/${totalCount})`
                            : `Evaluación en progreso - ${revisionType}`}
                        </h3>
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          Has recibido <strong>{evaluatedCount} de {totalCount}</strong> evaluaciones. 
                          {totalCount - evaluatedCount === 1 
                            ? ' Falta 1 evaluador por enviar su evaluación.' 
                            : ` Faltan ${totalCount - evaluatedCount} evaluadores por enviar sus evaluaciones.`}
                        </p>
                        <div className="bg-white dark:bg-slate-900 rounded-md p-3 space-y-2 border border-amber-200 dark:border-amber-800">
                          <p className="text-sm font-semibold text-foreground">
                            📋 ¿Qué puedes hacer mientras esperas?
                          </p>
                          <ul className="text-sm text-muted-foreground space-y-1.5 ml-1">
                            <li className="flex items-start gap-2">
                              <span className="text-amber-600 dark:text-amber-500 font-bold">•</span>
                              <span>Revisa los comentarios del evaluador que ya envió su evaluación (ver arriba en el timeline).</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-amber-600 dark:text-amber-500 font-bold">•</span>
                              <span><strong>Ve adelantando las correcciones</strong> indicadas para ahorrar tiempo.</span>
                            </li>
                            <li className="flex items-start gap-2">
                              <span className="text-amber-600 dark:text-amber-500 font-bold">•</span>
                              <span>Prepara un documento (Excel/CSV recomendado) donde justifiques cada cambio realizado.</span>
                            </li>
                          </ul>
                        </div>
                        <p className="text-xs text-amber-700 dark:text-amber-300 italic">
                          Cuando todos los evaluadores hayan enviado sus evaluaciones, aparecerá aquí el formulario para subir tu trabajo corregido.
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }
              return (
                <div className="mt-8 p-4 sm:p-6 border rounded-lg bg-white dark:bg-slate-950 space-y-4">
                  <h3 className="text-lg font-bold">Enviar Revisión / Respuesta</h3>
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>
                      Has recibido la evaluación de tu documento. Antes de enviar tu revisión, asegúrate de:
                    </p>
                    <ul className="list-disc list-inside space-y-1 ml-1">
                      <li>Revisar los comentarios y recomendaciones de los evaluadores (Ver arriba).</li>
                      <li>Aplicar <strong>todas</strong> las correcciones indicadas en el documento.</li>
                      <li>Subir el <strong>documento corregido</strong>.</li>
                      <li>Subir un archivo separado (<strong>recomendado: Excel o CSV</strong>) donde expliques y justifiques cada cambio realizado en respuesta a los comentarios de los evaluadores.</li>
                    </ul>
                    <p className="text-xs text-muted-foreground/80 italic">
                      Ambos evaluadores recibirán tu revisión para una nueva evaluación.
                    </p>
                  </div>
                  <Textarea
                    value={revisionComment}
                    onChange={(e) => setRevisionComment(e.target.value)}
                    placeholder="Escribe aquí un resumen de los cambios realizados o cualquier observación adicional..."
                    className="min-h-[100px]"
                  />
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">Archivos de revisión</label>
                    <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-2 border rounded-md text-sm hover:bg-accent/10 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Agregar archivo
                      <input key={fileInputKey} type="file" className="hidden" onChange={handleRevisionFiles} />
                    </label>
                    {revisionFiles.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {revisionFiles.map((f, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-secondary/30 text-sm">
                            <span className="truncate flex-1">{f.name}</span>
                            <button
                              type="button"
                              onClick={() => removeRevisionFile(i)}
                              className="text-destructive hover:text-destructive/80 flex-shrink-0 p-1 rounded hover:bg-destructive/10 transition-colors"
                              title="Quitar archivo"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 font-medium"
                    disabled={submittingRevision || revisionFiles.length === 0}
                    onClick={submitRevision}
                  >
                    {submittingRevision ? 'Enviando...' : 'Enviar Revisión'}
                  </button>
                </div>
              );
            })()}

            {/* Score summaries */}
            {(() => {
              const evals: any[] = thesis.evaluations || [];
              const isBlind = thesis.evaluators?.some((e:any) => e.is_blind);
              const docEvals = evals.filter((e:any) => e.evaluation_type !== 'presentation' && e.final_score != null);
              const presEvals = evals.filter((e:any) => e.evaluation_type === 'presentation' && e.final_score != null);
              const w = weights;
              const docAvg = docEvals.length ? docEvals.reduce((a:number,b:any) => a + Number(b.final_score), 0) / docEvals.length : null;
              const presAvg = presEvals.length ? presEvals.reduce((a:number,b:any) => a + Number(b.final_score), 0) / presEvals.length : null;

              // Per-evaluator totals
              const evaluatorIds = [...new Set(evals.map((e:any) => e.evaluator_id))];
              const perEvaluator = evaluatorIds.map(eid => {
                const evName = isBlind ? null : (evals.find((e:any) => e.evaluator_id === eid)?.evaluator_name || 'Evaluador');
                const doc = evals.find((e:any) => e.evaluator_id === eid && e.evaluation_type !== 'presentation');
                const pres = evals.find((e:any) => e.evaluator_id === eid && e.evaluation_type === 'presentation');
                const dScore = doc?.final_score != null ? Number(doc.final_score) : null;
                const pScore = pres?.final_score != null ? Number(pres.final_score) : null;
                let total: number | null = null;
                if (dScore != null && pScore != null) {
                  total = dScore * (w.doc / 100) + pScore * (w.presentation / 100);
                } else if (dScore != null) {
                  total = dScore;
                }
                return { name: evName, docScore: dScore, presScore: pScore, total };
              });

              const hasDefense = !!thesis.defense_date;
              const finalScore = thesis.weighted?.finalScore;
              const assignedEvaluatorIds = (thesis.evaluators || []).map((e: any) => e.id).filter(Boolean);
              const presentationEvaluatorIds = new Set(presEvals.map((e: any) => e.evaluator_id));
              const allEvaluatedPresentation =
                assignedEvaluatorIds.length > 0 &&
                assignedEvaluatorIds.every((id: any) => presentationEvaluatorIds.has(id));

              const shouldShowConsolidated =
                hasDefense &&
                docAvg != null &&
                finalScore != null &&
                allEvaluatedPresentation;

              return (
                <div className="space-y-4 mt-6">
                  {/* Document scores */}
                  {docEvals.length > 0 && (() => {
                    const clsDoc = (score: number | null) => {
                      if (score === null) return null;
                      if (score < 3) return { code: 'I', label: 'Insuficiente', color: 'text-red-600' };
                      if (score < 4) return { code: 'P', label: 'Parcialmente suficiente', color: 'text-yellow-600' };
                      return { code: 'S', label: 'Suficiente', color: 'text-green-600' };
                    };
                    if (thesis.isPregrado && thesis.sectionClassifications?.document) {
                      return (
                        <ScoreCard label="Clasificación por Sección — Documento">
                          {thesis.sectionClassifications.document.map((sc: any) => {
                            const cls = sc.classification;
                            const color = cls
                              ? cls.code === 'S' ? 'text-green-600' : cls.code === 'P' ? 'text-yellow-600' : 'text-red-600'
                              : 'text-muted-foreground';
                            return (
                              <div key={sc.section_id} className="flex justify-between items-center text-sm py-1">
                                <span className="text-muted-foreground">{sc.section_name}</span>
                                {cls ? (
                                  <span className={`font-bold ${color}`}>{cls.code} — {cls.label}</span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </div>
                            );
                          })}
                        </ScoreCard>
                      );
                    }
                    // Posgrado: before defense → per-evaluator I/P/S only; after defense → numeric scores
                    const clsDescriptions: Record<string, string> = {
                      I: 'No cumple los criterios mínimos requeridos.',
                      P: 'Cumple algunos criterios pero requiere mejoras.',
                      S: 'Cumple satisfactoriamente todos los criterios de evaluación.',
                    };
                    if (!hasDefense) {
                      return (
                        <ScoreCard label="Calificaciones del Documento">
                          <div className="space-y-3 mb-3">
                            {docEvals.map((ev: any, i: number) => {
                              const evCls = clsDoc(ev.final_score != null ? Number(ev.final_score) : null);
                              return (
                                <div key={ev.id || i} className="text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground font-medium">{isBlind ? `Evaluador ${i + 1}` : ev.evaluator_name}:</span>
                                    {evCls ? (
                                      <span className={`font-bold ${evCls.color}`}>{evCls.code} — {evCls.label}</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </div>
                                  {evCls && (
                                    <p className="text-xs text-muted-foreground mt-0.5 ml-1">{clsDescriptions[evCls.code]}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground border-t pt-2">
                            Esta evaluación vale <strong>{weights.doc}%</strong> de la nota final.
                          </p>
                        </ScoreCard>
                      );
                    }
                    // After defense scheduled: show numeric scores
                    const docCls = clsDoc(docAvg);
                    return (
                      <ScoreCard label="Calificaciones del Documento">
                        {docCls && (
                          <div className="mb-3">
                            <span className={`text-base font-black ${docCls.color}`}>{docCls.code} — {docCls.label}</span>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mb-2">
                          Esta evaluación vale <strong>{weights.doc}%</strong> de la nota final.
                        </p>
                        {docEvals.map((ev: any, i: number) => (
                          <div key={ev.id || i} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{isBlind ? `Evaluador ${i + 1}` : ev.evaluator_name}</span>
                            <span className="font-semibold">{Number(ev.final_score).toFixed(1)}</span>
                          </div>
                        ))}
                        {docAvg != null && (
                          <div className="border-t pt-2 mt-2 flex justify-between text-sm font-bold">
                            <span>Promedio Documento</span>
                            <span>{docAvg.toFixed(1)} / 5.0</span>
                          </div>
                        )}
                      </ScoreCard>
                    );
                  })()}

                  {/* Presentation scores — always numeric */}
                  {presEvals.length > 0 && (
                    <ScoreCard label="Calificaciones de la Sustentación">
                      <p className="text-xs text-muted-foreground mb-2">
                        Esta evaluación vale <strong>{weights.presentation}%</strong> de la nota final.
                      </p>
                      {presEvals.map((ev:any, i:number) => (
                        <div key={ev.id || i} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{isBlind ? `Evaluador ${i+1}` : ev.evaluator_name}</span>
                          <span className="font-semibold">{Number(ev.final_score).toFixed(1)}</span>
                        </div>
                      ))}
                      {presAvg != null && (
                        <div className="border-t pt-2 mt-2 flex justify-between text-sm font-bold">
                          <span>Promedio Sustentación</span>
                          <span>{presAvg.toFixed(1)} / 5.0</span>
                        </div>
                      )}
                    </ScoreCard>
                  )}

                  {/* Consolidated */}
                  {shouldShowConsolidated && (() => {
                    const clsDoc = (score: number | null) => {
                      if (score === null) return null;
                      if (score < 3) return { code: 'I', label: 'Insuficiente', color: 'text-red-600' };
                      if (score < 4) return { code: 'P', label: 'Parcialmente suficiente', color: 'text-yellow-600' };
                      return { code: 'S', label: 'Suficiente', color: 'text-green-600' };
                    };
                    const docCls = thesis.isPregrado ? clsDoc(docAvg) : null;
                    return (
                    <ScoreCard label="Calificación Consolidada">
                      <div className="text-center mb-3">
                        <span className="text-3xl font-black text-primary">{Number(finalScore).toFixed(1)}</span>
                        <span className="text-lg text-muted-foreground"> / 5.0</span>
                      </div>
                      <div className="text-sm text-center font-semibold text-muted-foreground mb-2">Nota Final Ponderada</div>
                      {hasDefense && allEvaluatedPresentation ? (
                        <p className="text-sm text-center text-muted-foreground break-words">
                          {thesis.isPregrado && docCls
                            ? <>Documento: <span className={`font-semibold ${docCls.color}`}>{docCls.code}</span> ({docAvg.toFixed(1)} × {w.doc}%) + Sustentación: {presAvg?.toFixed(1)} × {w.presentation}% = {Number(finalScore).toFixed(1)}</>
                            : <>Cálculo: ({docAvg.toFixed(1)} × {w.doc}%) + ({presAvg?.toFixed(1)} × {w.presentation}%) = {Number(finalScore).toFixed(1)}</>
                          }
                        </p>
                      ) : (
                        <p className="text-sm text-center text-muted-foreground break-words">
                          {thesis.isPregrado && docCls
                            ? <>Documento: <span className={`font-semibold ${docCls.color}`}>{docCls.code} — {docCls.label}</span> ({docAvg.toFixed(1)})</>
                            : <>Cálculo: promedio documento = {docAvg.toFixed(1)}</>
                          }
                        </p>
                      )}

                      {perEvaluator.length > 0 && (
                        <div className="border-t pt-3 mt-3 space-y-2">
                          {perEvaluator.map((pe, i) => {
                            const peCls = thesis.isPregrado ? clsDoc(pe.docScore) : null;
                            return (
                            <div key={i} className="text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">{pe.name || `Evaluador ${i+1}`}:</span>{' '}
                              {pe.docScore != null && (
                                thesis.isPregrado && peCls
                                  ? <><span className={`font-semibold ${peCls.color}`}>{peCls.code}</span> ({pe.docScore.toFixed(1)})</>
                                  : <>documento {pe.docScore.toFixed(1)}</>
                              )}
                              {pe.presScore != null && <>, sustentación {pe.presScore.toFixed(1)}</>}
                              {pe.total != null && <>, total <span className="font-semibold text-foreground">{pe.total.toFixed(1)}</span></>}
                              {pe.docScore != null && pe.presScore != null && (
                                <div className="text-xs ml-4 text-muted-foreground/70">
                                  ({pe.docScore.toFixed(1)} × {w.doc}% + {pe.presScore.toFixed(1)} × {w.presentation}%)
                                </div>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </ScoreCard>
                    );
                  })()}
                </div>
              );
            })()}

          </>
        )}
      </div>
    </AppLayout>
  );
}
