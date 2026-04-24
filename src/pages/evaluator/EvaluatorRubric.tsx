import AppLayout from "@/components/layout/AppLayout";
import RubricEvaluation from "@/components/thesis/RubricEvaluation";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { defaultRubric, presentationRubric } from "@/lib/mock-data";
import { useAuth } from "@/hooks/useAuth";
import DigitalSignSection from "@/components/thesis/DigitalSignSection";
import { getApiBase } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const API_BASE = getApiBase();

async function downloadFile(url: string, fileName: string) {
  try {
    const token = localStorage.getItem('token');
    const resp = await fetch(`${API_BASE}${url}`, {
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
    alert(err.message || 'No se pudo descargar el archivo');
  }
}

export default function EvaluatorRubric() {
  const { id } = useParams();
  const { user, profile, role } = useAuth();
  const [thesis, setThesis] = useState<any>(null);
  const [weights, setWeights] = useState<{doc:number;presentation:number}>({doc:70,presentation:30});
  const [actaStatus, setActaStatus] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingRubric, setDownloadingRubric] = useState<string>("");
  const [programDocRubric, setProgramDocRubric] = useState<any[] | null>(null);
  const [programPresRubric, setProgramPresRubric] = useState<any[] | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`${API_BASE}/theses/${id}`, {
          headers: { Authorization: token ? "Bearer " + token : "" },
        });
        if (!resp.ok) throw new Error("No se pudo cargar el proyecto de grado");
        const data = await resp.json();
        setThesis(data);

        const actaResp = await fetch(`${API_BASE}/theses/${id}/acta/status`, {
          headers: { Authorization: token ? "Bearer " + token : "" },
        });
        if (actaResp.ok) {
          setActaStatus(await actaResp.json());
        }

        const programId = data?.programs?.[0]?.id;
        if (programId) {
          try {
            const rubricResp = await fetch(`${API_BASE}/admin/program-rubrics/${programId}`, {
              headers: { Authorization: token ? `Bearer ${token}` : '' },
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

      } catch (e: any) {
        toast.error(e.message);
      }
    };
    fetchData();

    (async () => {
      try {
        const token = localStorage.getItem("token");
        const r = await fetch(`${API_BASE}/super/weights`, {
          headers: { Authorization: token ? "Bearer " + token : "" },
        });
        if (r.ok) {
          const d = await r.json();
          setWeights({ doc: d.doc, presentation: d.presentation });
        }
      } catch (e) { /* ignore */ }
    })();
  }, [id]);

  const appRole = (role as "evaluator" | "admin") ?? "evaluator";

  if (!thesis) return (
    <AppLayout role={appRole}>
      <div className="p-6 text-center">Cargando información del proyecto de grado...</div>
    </AppLayout>
  );

  const currentRound = Number(thesis.revision_round || 0);

  // pick evaluations by current round so previous rounds remain closed (not overwritten)
  const myDocEvals = thesis.evaluations?.filter((ev: any) =>
    (ev.evaluation_type === "document" || ev.type === "document") &&
    ev.evaluator_id === user?.id
  ) || [];
  const docEvalsCurrentRound = myDocEvals.filter((ev: any) => Number(ev.revision_round || 0) === currentRound);
  let docEval = docEvalsCurrentRound.sort((a: any, b: any) => (b.submitted_at || b.created_at || 0) - (a.submitted_at || a.created_at || 0))[0];
  const previousDocEval = myDocEvals
    .filter((ev: any) => Number(ev.revision_round || 0) < currentRound)
    .sort((a: any, b: any) => (b.submitted_at || b.created_at || 0) - (a.submitted_at || a.created_at || 0))[0];

  // If evaluator already gave "accepted" in a previous round, they don't need to re-evaluate.
  // Use the previous evaluation as the effective one so the rubric shows as completed.
  const thesisIsDone = thesis.status === 'sustentacion' || thesis.status === 'finalized';
  if (!docEval && previousDocEval && (previousDocEval.concept === 'accepted' || thesisIsDone)) {
    docEval = previousDocEval;
  }

  const myPresEvals = thesis.evaluations?.filter((ev: any) =>
    (ev.evaluation_type === "presentation" || ev.type === "presentation") &&
    ev.evaluator_id === user?.id
  ) || [];
  const presEvalsCurrentRound = myPresEvals.filter((ev: any) => Number(ev.revision_round || 0) === currentRound);
  const presEval = presEvalsCurrentRound.sort((a: any, b: any) => (b.submitted_at || b.created_at || 0) - (a.submitted_at || a.created_at || 0))[0];
  const wantPresentation = !!thesis.defense_date;

  const submitEvaluation = async (data: { score: number | null; observations: string; concept?: any; sections?: any; files?: File[] }, type: 'document' | 'presentation') => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const authHeader = token ? 'Bearer ' + token : '';
      // Strip files from JSON payload (File objects can't be serialized)
      const { files, ...jsonData } = data;
      const resp = await fetch(`${API_BASE}/evaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader },
        body: JSON.stringify({ thesis_id: thesis.id, evaluation_type: type, ...jsonData }),
      });
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.error || 'failed');
      }
      const evalResult = await resp.json();

      // Upload files to the separate endpoint
      if (files && files.length > 0) {
        let uploadErrors = 0;
        for (const file of files) {
          const fd = new FormData();
          fd.append('file', file);
          try {
            const uploadResp = await fetch(`${API_BASE}/evaluations/${evalResult.id}/files`, {
              method: 'POST',
              headers: { Authorization: authHeader },
              body: fd,
            });
            if (!uploadResp.ok) {
              console.error('Error uploading file:', file.name, await uploadResp.text());
              uploadErrors++;
            }
          } catch (uploadErr) {
            console.error('Error uploading file:', file.name, uploadErr);
            uploadErrors++;
          }
        }
        if (uploadErrors > 0) {
          toast.error(`${uploadErrors} archivo(s) no se pudieron subir. Puede intentar subirlos nuevamente.`);
        }
      }

      toast.success('Evaluación enviada');
      // reload thesis to update state
      const r2 = await fetch(`${API_BASE}/theses/${thesis.id}`, {
        headers: { Authorization: authHeader },
      });
      if (r2.ok) {
        setThesis(await r2.json());
      }
      const actaResp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/status`, {
        headers: { Authorization: authHeader },
      });
      if (actaResp.ok) setActaStatus(await actaResp.json());
    } catch (e:any) {
      toast.error(e.message || 'Error al enviar evaluación');
    } finally {
      setSubmitting(false);
    }
  };
  // find the evaluator record in thesis for due dates
  const myEvaluator = thesis.evaluators?.find((e: any) => String(e.id) === String(user?.id));

  /** Upload files to an already-submitted evaluation */
  const uploadFilesToEval = async (evalId: string, files: File[]) => {
    const token = localStorage.getItem('token');
    const authHeader = token ? 'Bearer ' + token : '';
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      const resp = await fetch(`${API_BASE}/evaluations/${evalId}/files`, {
        method: 'POST',
        headers: { Authorization: authHeader },
        body: fd,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Error al subir archivo' }));
        throw new Error(err.error || 'Error al subir archivo');
      }
    }
    toast.success('Archivos subidos correctamente');
    // reload thesis to show the new files
    const r2 = await fetch(`${API_BASE}/theses/${thesis.id}`, {
      headers: { Authorization: authHeader },
    });
    if (r2.ok) setThesis(await r2.json());
  };

  const handleDownloadRubric = async (evaluationType: string) => {
    if (!thesis?.id) return;
    setDownloadingRubric(evaluationType);
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(
        `${API_BASE}/evaluations/rubric-xlsx?thesis_id=${thesis.id}&evaluation_type=${evaluationType}`,
        { headers: { Authorization: token ? "Bearer " + token : "" } }
      );
      if (!resp.ok) throw new Error("Error generando el archivo");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Rubrica_${evaluationType === "document" ? "Documento" : "Sustentacion"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message || "Error al descargar");
    } finally {
      setDownloadingRubric("");
    }
  };

  const docScore = docEval?.final_score ?? 0;
  const presScore = presEval?.final_score ?? 0;
  const finalWeightedScore = wantPresentation 
    ? ((docScore * (weights.doc / 100)) + (presScore * (weights.presentation / 100))) 
    : docScore;

  return (
    <AppLayout role={appRole}>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-8">
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-primary tracking-tight leading-none">
            {thesis.title}
            {thesis.revision_round > 0 && (
              <span className="ml-2 text-lg font-normal text-muted-foreground">(Ronda {thesis.revision_round})</span>
            )}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Estudiantes</p>
              <div className="flex flex-col gap-3">
                {thesis.students?.map((s: any) => (
                  <div key={s.id} className="rounded-lg border border-border bg-secondary/50 px-4 py-3 text-sm space-y-1">
                    <p className="font-semibold text-foreground">{s.name}</p>
                    {s.student_code && <p className="text-muted-foreground">Código: <span className="font-medium text-foreground">{s.student_code}</span></p>}
                    {s.cedula && <p className="text-muted-foreground">Cédula: <span className="font-medium text-foreground">{s.cedula}</span></p>}
                    {(s.institutional_email || s.email) && <p className="text-muted-foreground">Correo: <span className="font-medium text-foreground">{s.institutional_email || s.email}</span></p>}
                  </div>
                ))}
              </div>
            </div>
            {thesis.files && thesis.files.length > 0 && (
              <div className="mb-4">
                <h3 className="font-heading text-lg font-bold text-foreground mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  Documentos enviados
                </h3>
                <div className="grid grid-cols-1 gap-3">
                  {thesis.files.map((f: any) => {
                    const isUrl = f.file_url?.startsWith('http://') || f.file_url?.startsWith('https://') ||
                                  f.file_name?.startsWith('http://') || f.file_name?.startsWith('https://');
                    const isPdf = f.file_name?.toLowerCase().endsWith('.pdf');
                    const isDoc = f.file_name?.toLowerCase().match(/\.(doc|docx)$/);
                    const urlToOpen = isUrl ? (f.file_url?.startsWith('http') ? f.file_url : f.file_name) : null;
                    return (
                      <div
                        key={typeof f.id === 'object' && f.id !== null ? JSON.stringify(f.id) : String(f.id)}
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
                            <a href={urlToOpen!} target="_blank" rel="noopener noreferrer" className="block w-full group-hover:text-accent transition-colors">
                              <p className="font-medium text-sm truncate">{f.file_name}</p>
                              {urlToOpen !== f.file_name && <p className="text-xs text-muted-foreground truncate mt-0.5">{urlToOpen}</p>}
                            </a>
                          ) : (
                            <button type="button" className="text-left w-full group-hover:text-accent transition-colors" onClick={() => downloadFile(f.file_url, f.file_name)}>
                              <p className="font-medium text-sm truncate">{f.file_name}</p>
                            </button>
                          )}
                        </div>
                        <div className="flex-shrink-0">
                          {isUrl ? (
                            <a href={urlToOpen!} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full hover:bg-accent/10 transition-colors inline-block" title="Abrir enlace">
                              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          ) : (
                            <button type="button" onClick={() => downloadFile(f.file_url, f.file_name)} className="p-2 rounded-full hover:bg-accent/10 transition-colors" title="Descargar">
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
          </div>
        </div>

        {thesis.defense_date && (
          <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30">
            <h3 className="text-sm font-bold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">Información de la Sustentación</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Fecha y Hora</p>
                <p className="text-sm font-medium">{new Date(thesis.defense_date * 1000).toLocaleString()}</p>
              </div>
              {thesis.defense_location && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Lugar</p>
                  <p className="text-sm font-medium">{thesis.defense_location}</p>
                </div>
              )}
            </div>
            {thesis.defense_info && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-1">Observaciones generales</p>
                <p className="text-sm font-medium whitespace-pre-wrap">{thesis.defense_info}</p>
              </div>
            )}
          </div>
        )}

        <div className="bg-white dark:bg-slate-950 rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-border">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calificación Consolidada</h3>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <p className="text-4xl font-black text-primary">{finalWeightedScore.toFixed(1)}<span className="text-lg text-muted-foreground font-medium ml-1">/ 5.0</span></p>
                <p className="text-sm font-medium text-success mt-1">Nota Final Ponderada</p>
              </div>
              <div className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 p-3 rounded-lg font-mono break-words">
                Cálculo: ({docScore.toFixed(1)} x {weights.doc}%) {wantPresentation ? "+ (" + presScore.toFixed(1) + " x " + weights.presentation + "%)" : ""}
              {/* show debug info when no eval present */}
              {docEval || presEval ? null : (
                <p className="text-xs text-red-500 mt-2">No se encontró evaluación para el usuario actual.</p>
              )}              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-bold tracking-tight">Rúbricas de Evaluación</h3>
          <Accordion type="single" collapsible className="w-full border rounded-xl overflow-hidden bg-white dark:bg-slate-950">
            <AccordionItem value="doc" className="border-b">
              <AccordionTrigger className="hover:no-underline px-5 py-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-left w-full">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div>
                      <p className="font-semibold text-base text-foreground">Rúbrica de Documento</p>
                      {myEvaluator?.due_date && (
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Fecha límite: <span className="font-medium text-foreground">{new Date(myEvaluator.due_date * 1000).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {currentRound > 0 && (
                      <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full font-medium">Ronda {currentRound}</span>
                    )}
                    {docEval ? (
                      <span className="inline-flex items-center gap-1.5 text-sm bg-success/10 text-success px-3 py-1.5 rounded-full font-medium">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        Enviada
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm bg-warning/10 text-warning px-3 py-1.5 rounded-full font-medium">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Pendiente
                      </span>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-6">
                <div className="flex justify-end mb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadRubric("document")}
                    disabled={downloadingRubric === "document"}
                    className="text-green-700 border-green-400 hover:bg-green-50 text-xs"
                  >
                    {downloadingRubric === "document"
                      ? "⏳ Descargando..."
                      : docEval ? "📥 Descargar mi evaluación (XLSX)" : "📥 Descargar rúbrica en blanco (XLSX)"}
                  </Button>
                </div>
                {previousDocEval && (
                  <div className="mb-4 rounded-lg border border-border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
                    Existe una evaluación cerrada de una ronda anterior. Esta ronda genera una nueva evaluación sin sobrescribir la anterior.
                  </div>
                )}
                <RubricEvaluation
                  thesis={thesis}
                  rubric={programDocRubric ?? defaultRubric}
                  onSubmit={(data) => submitEvaluation(data, 'document')}
                  onUploadFiles={docEval ? (files) => uploadFilesToEval(docEval.id, files) : undefined}
                  readOnly={!!docEval}
                  submitDisabled={!!docEval || submitting}
                  showConcept={true}
                  showFiles={true}
                  initialConcept={docEval?.concept || null}
                  initialFinalScore={docEval?.final_score}
                  initialSections={docEval ? (programDocRubric ?? defaultRubric).map((s: any) => ({
                    ...s,
                    criteria: s.criteria.map((c: any) => {
                      const sc = docEval.scores?.find((x: any) => x.section_id === s.id && x.criterion_id === c.id);
                      return { ...c, score: sc?.score ?? undefined, observations: sc?.observations || "" };
                    })
                  })) : undefined}
                  initialGeneralObs={docEval?.general_observations || ""}
                  initialFiles={docEval?.files || []}
                />
              </AccordionContent>
            </AccordionItem>
            {thesis.defense_date && (
              <AccordionItem value="pres" className="border-none">
                <AccordionTrigger className="hover:no-underline px-5 py-5">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-left w-full">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.362a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
                      </div>
                      <div>
                        <p className="font-semibold text-base text-foreground">Rúbrica de Sustentación</p>
                        {myEvaluator?.due_date && (
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Fecha límite: <span className="font-medium text-foreground">{new Date(myEvaluator.due_date * 1000).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {currentRound > 0 && (
                        <span className="text-xs bg-muted text-muted-foreground px-2.5 py-1 rounded-full font-medium">Ronda {currentRound}</span>
                      )}
                      {presEval ? (
                        <span className="inline-flex items-center gap-1.5 text-sm bg-success/10 text-success px-3 py-1.5 rounded-full font-medium">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          Enviada
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-sm bg-warning/10 text-warning px-3 py-1.5 rounded-full font-medium">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          Pendiente
                        </span>
                      )}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-6">
                  <div className="flex justify-end mb-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownloadRubric("presentation")}
                      disabled={downloadingRubric === "presentation"}
                      className="text-green-700 border-green-400 hover:bg-green-50 text-xs"
                    >
                      {downloadingRubric === "presentation"
                        ? "⏳ Descargando..."
                        : presEval ? "📥 Descargar mi evaluación (XLSX)" : "📥 Descargar rúbrica en blanco (XLSX)"}
                    </Button>
                  </div>
                  <RubricEvaluation
                    thesis={thesis}
                    rubric={programPresRubric ?? presentationRubric}
                    onSubmit={(data) => submitEvaluation(data, 'presentation')}
                    onUploadFiles={presEval ? (files) => uploadFilesToEval(presEval.id, files) : undefined}
                    readOnly={!!presEval}
                    submitDisabled={!!presEval || submitting}
                    showConcept={false}
                    showFiles={true}
                    initialConcept={presEval?.concept || null}
                    initialFinalScore={presEval?.final_score}
                    initialSections={(programPresRubric ?? presentationRubric).map((s: any) => ({
                      ...s,
                      criteria: s.criteria.map((c: any) => {
                        const sc = presEval?.scores?.find((x: any) => x.section_id === s.id && x.criterion_id === c.id);
                        return { ...c, score: sc?.score ?? undefined, observations: sc?.observations || "" };
                      })
                    }))}
                    initialGeneralObs={presEval?.general_observations || ""}
                    initialFiles={presEval?.files || []}
                  />
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        </div>

        {actaStatus?.allSigned && (
          <div className="border rounded-xl p-4 bg-white dark:bg-slate-950">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">Acta de Sustentación</h3>
            <p className="text-sm text-muted-foreground mb-3">Todas las firmas han sido registradas. Puede descargar el acta en PDF.</p>
            <button
              className="px-4 py-2 rounded bg-primary text-primary-foreground flex items-center gap-2"
              onClick={async () => {
                try {
                  const token = localStorage.getItem('token');
                  const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/export?format=pdf`, {
                    headers: { Authorization: token ? 'Bearer ' + token : '' },
                  });
                  if (!resp.ok) {
                    const err = await resp.json().catch(() => ({ error: 'Error al descargar' }));
                    throw new Error(err.error || 'Error al descargar');
                  }
                  const disposition = resp.headers.get('Content-Disposition') || '';
                  const match = disposition.match(/filename="?([^"]+)"?/);
                  const filename = match ? match[1] : 'acta.pdf';
                  const blob = await resp.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                  toast.success('Acta descargada');
                } catch (e: any) {
                  toast.error(e.message || 'Error al descargar acta');
                }
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Descargar Acta PDF
            </button>
          </div>
        )}

        {actaStatus?.allSigned && (
          <div className="border rounded-xl p-6 bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-green-900 dark:text-green-100 mb-2">
                  ¡Gracias por evaluar este trabajo!
                </h3>
                <p className="text-sm text-green-800 dark:text-green-200 mb-4">
                  Su evaluación ha sido registrada exitosamente y el proceso de sustentación ha concluido. 
                  A continuación puede descargar todos los documentos relacionados con esta tesis.
                </p>
                <button
                  className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium flex items-center gap-2 transition-colors shadow-md"
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/download-complete-package`, {
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


        {thesis.timeline && thesis.timeline.length > 0 && (
          <div className="pt-6 border-t border-border">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-6">Historial de Evaluación</h3>
            <ThesisTimeline events={thesis.timeline} isBlindReview={thesis.evaluators?.some((e: any) => e.is_blind)} isAdmin={false} programDocRubric={programDocRubric ?? undefined} programPresRubric={programPresRubric ?? undefined} />
          </div>
        )}

        {id && user && (() => {
          // Only show digital signing once ALL assigned evaluators have submitted BOTH doc AND presentation evaluations
          const assignedIds: string[] = (thesis.evaluators || []).map((e: any) => e.id).filter(Boolean);
          const allEvals: any[] = thesis.evaluations || [];
          const docEvalIds = new Set(
            allEvals.filter((e: any) => e.evaluation_type === 'document' || e.type === 'document').map((e: any) => e.evaluator_id)
          );
          const presEvalIds = new Set(
            allEvals.filter((e: any) => e.evaluation_type === 'presentation' || e.type === 'presentation').map((e: any) => e.evaluator_id)
          );
          const hasDefense = !!thesis.defense_date;
          const allDocDone = assignedIds.length > 0 && assignedIds.every(eid => docEvalIds.has(eid));
          // presentation evals are required (defense must exist AND all evaluators must have submitted)
          const allPresDone = hasDefense && assignedIds.length > 0 && assignedIds.every(eid => presEvalIds.has(eid));
          if (!allDocDone || !allPresDone) return null;
          return (
            <DigitalSignSection
              thesisId={id}
              userName={user.full_name || ""}
              myRole={appRole}
              myUserId={user.id}
            />
          );
        })()}
      </div>
    </AppLayout>
  );
}
