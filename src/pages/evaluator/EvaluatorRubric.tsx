import AppLayout from "@/components/layout/AppLayout";
import RubricEvaluation from "@/components/thesis/RubricEvaluation";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { defaultRubric, presentationRubric } from "@/lib/mock-data";
import { useAuth } from "@/hooks/useAuth";
import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

export default function EvaluatorRubric() {
  const { id } = useParams();
  const { user } = useAuth();
  const [thesis, setThesis] = useState<any>(null);
  const [weights, setWeights] = useState<{doc:number;presentation:number}>({doc:70,presentation:30});
  const [actaStatus, setActaStatus] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  
  // Estado para firma digital con certificado
  const [digitalSignStatus, setDigitalSignStatus] = useState<any>(null);
  const [digitalSignFile, setDigitalSignFile] = useState<File | null>(null);
  const [loadingDigitalSign, setLoadingDigitalSign] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`${API_BASE}/theses/${id}`, {
          headers: { Authorization: token ? "Bearer " + token : "" },
        });
        if (!resp.ok) throw new Error("No se pudo cargar la tesis");
        const data = await resp.json();
        setThesis(data);

        const actaResp = await fetch(`${API_BASE}/theses/${id}/acta/status`, {
          headers: { Authorization: token ? "Bearer " + token : "" },
        });
        if (actaResp.ok) {
          setActaStatus(await actaResp.json());
        }

        // Cargar estado de firma digital
        const digitalResp = await fetch(`${API_BASE}/theses/${id}/acta/digital-signature-status`, {
          headers: { Authorization: token ? "Bearer " + token : "" },
        });
        if (digitalResp.ok) {
          setDigitalSignStatus(await digitalResp.json());
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

  if (!thesis) return (
    <AppLayout role="evaluator">
      <div className="p-6 text-center">Cargando información de la tesis...</div>
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

  const docScore = docEval?.final_score ?? 0;
  const presScore = presEval?.final_score ?? 0;
  const finalWeightedScore = wantPresentation 
    ? ((docScore * (weights.doc / 100)) + (presScore * (weights.presentation / 100))) 
    : docScore;

  return (
    <AppLayout role="evaluator">
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
              <div className="space-y-2">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Archivos Enviados</p>
                <div className="flex flex-col gap-1">
                  {thesis.files.map((f: any) => (
                    <a key={f.id} href={API_BASE + f.file_url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent hover:text-accent/80 hover:underline flex items-center gap-2 transition-colors">
                      {f.file_name}
                    </a>
                  ))}
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
                <p className="text-sm font-medium">{new Date(thesis.defense_date).toLocaleString()}</p>
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
                <p className="text-4xl font-black text-primary">{finalWeightedScore.toFixed(2)}<span className="text-lg text-muted-foreground font-medium ml-1">/ 5.00</span></p>
                <p className="text-sm font-medium text-success mt-1">Nota Final Ponderada</p>
              </div>
              <div className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 p-3 rounded-lg font-mono break-words">
                Cálculo: ({docScore.toFixed(2)} x {weights.doc}%) {wantPresentation ? "+ (" + presScore.toFixed(2) + " x " + weights.presentation + "%)" : ""}
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
            <AccordionItem value="doc" className="border-b px-2">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-left w-full">
                  <span>Rúbrica de Documento</span>
                  {currentRound > 0 && (
                    <span className="text-xs text-muted-foreground">Ronda {currentRound}</span>
                  )}
                  {myEvaluator?.due_date && (
                    <span className="text-xs text-muted-foreground">Vence: {new Date(myEvaluator.due_date).toLocaleDateString('es-CO')}</span>
                  )}
                  {docEval ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-success/10 text-success px-2 py-1 rounded">✓ Enviada</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs bg-warning/10 text-warning px-2 py-1 rounded">⏳ Pendiente</span>
                  )}
                </div>
                </AccordionTrigger>
              <AccordionContent className="pb-6">
                {previousDocEval && (
                  <div className="mb-4 rounded-lg border border-border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
                    Existe una evaluación cerrada de una ronda anterior. Esta ronda genera una nueva evaluación sin sobrescribir la anterior.
                  </div>
                )}
                <RubricEvaluation
                  thesis={thesis}
                  onSubmit={(data) => submitEvaluation(data, 'document')}
                  onUploadFiles={docEval ? (files) => uploadFilesToEval(docEval.id, files) : undefined}
                  readOnly={!!docEval}
                  submitDisabled={!!docEval || submitting}
                  showConcept={true}
                  showFiles={true}
                  initialConcept={docEval?.concept || null}
                  initialFinalScore={docEval?.final_score}
                  initialSections={docEval ? defaultRubric.map((s: any) => ({
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
            <AccordionItem value="pres" className="border-none px-2">
              <AccordionTrigger className="hover:no-underline py-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-left w-full">
                  <span>Rúbrica de Sustentación</span>
                  {currentRound > 0 && (
                    <span className="text-xs text-muted-foreground">Ronda {currentRound}</span>
                  )}
                  {myEvaluator?.due_date && (
                    <span className="text-xs text-muted-foreground">Vence: {new Date(myEvaluator.due_date).toLocaleDateString('es-CO')}</span>
                  )}
                  {presEval ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-success/10 text-success px-2 py-1 rounded">✓ Enviada</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs bg-warning/10 text-warning px-2 py-1 rounded">⏳ Pendiente</span>
                  )}
                </div>
                </AccordionTrigger>
              <AccordionContent className="pb-6">
                <RubricEvaluation
                  thesis={thesis}
                  onSubmit={(data) => submitEvaluation(data, 'presentation')}
                  onUploadFiles={presEval ? (files) => uploadFilesToEval(presEval.id, files) : undefined}
                  readOnly={!!presEval}
                  submitDisabled={!!presEval || submitting}
                  showConcept={false}
                  showFiles={true}
                  initialConcept={presEval?.concept || null}
                  initialFinalScore={presEval?.final_score}
                  initialSections={presentationRubric.map((s: any) => ({
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

        {/* Sección de Firma Digital con Certificado para Evaluadores */}
        {actaStatus?.canEvaluatorSign && (
          <div className="border rounded-xl p-4 bg-white dark:bg-slate-950">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">🔐 Firma Digital con Certificado</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Descargue el PDF, fírmelo con Adobe Acrobat usando su certificado digital y súbalo de vuelta.
            </p>

            {/* Estado de firmas digitales */}
            {digitalSignStatus && (
              <div className="mb-3 space-y-1">
                <p className="text-xs font-medium">Estado de firmas:</p>
                {digitalSignStatus.digitalSignatures?.length > 0 ? (
                  digitalSignStatus.digitalSignatures.map((sig: any, idx: number) => (
                    <div key={idx} className="text-xs text-green-600">
                      ✓ {sig.signer_role === 'evaluator' ? 'Evaluador' : sig.signer_role === 'director' ? 'Director' : 'Dir. Programa'}: {sig.signer_name}
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">No hay firmas digitales registradas aún.</p>
                )}
                {digitalSignStatus.pendingSigners?.length > 0 && (
                  <p className="text-xs text-orange-600 mt-1">
                    Pendientes: {digitalSignStatus.pendingSigners.map((p: any) => p.name).join(', ')}
                  </p>
                )}
                
                {/* Botón para descargar PDF final firmado cuando todas las firmas estén completas */}
                {digitalSignStatus.allSigned && (
                  <button
                    className="mt-2 px-4 py-2 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-700"
                    onClick={async () => {
                      try {
                        const token = localStorage.getItem('token');
                        const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/download-final-signed`, {
                          headers: { Authorization: token ? 'Bearer ' + token : '' },
                        });
                        if (!resp.ok) {
                          const err = await resp.json();
                          throw new Error(err.error || 'No se pudo descargar');
                        }
                        const blob = await resp.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `acta-final-firmada-${thesis.id}.pdf`;
                        a.click();
                        window.URL.revokeObjectURL(url);
                        toast.success('PDF final descargado');
                      } catch (e: any) {
                        toast.error(e.message || 'Error al descargar');
                      }
                    }}
                  >
                    ✅ Descargar PDF final firmado
                  </button>
                )}
              </div>
            )}

            {/* Descargar PDF para firmar */}
            <div className="flex gap-2 flex-wrap mb-3">
              <button
                className="px-4 py-2 rounded bg-secondary text-secondary-foreground text-sm"
                onClick={async () => {
                  try {
                    const token = localStorage.getItem('token');
                    const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/download-for-signing`, {
                      headers: { Authorization: token ? 'Bearer ' + token : '' },
                    });
                    if (!resp.ok) throw new Error('No se pudo descargar');
                    const blob = await resp.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `acta-${thesis.id}-para-firmar.pdf`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                  } catch (e: any) {
                    toast.error(e.message || 'Error al descargar');
                  }
                }}
              >
                📥 Descargar PDF para firmar
              </button>
            </div>

            {/* Subir PDF firmado */}
            <div className="space-y-2">
              <p className="text-xs font-medium">Subir PDF firmado:</p>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => setDigitalSignFile(e.target.files?.[0] || null)}
                className="text-sm"
              />
              <button
                className="px-4 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50 text-sm"
                disabled={!digitalSignFile || loadingDigitalSign}
                onClick={async () => {
                  if (!digitalSignFile) return;
                  setLoadingDigitalSign(true);
                  try {
                    const token = localStorage.getItem('token');
                    const form = new FormData();
                    form.append('signed_pdf', digitalSignFile);
                    form.append('signer_role', 'evaluator');

                    const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/upload-signed`, {
                      method: 'POST',
                      headers: { Authorization: token ? 'Bearer ' + token : '' },
                      body: form,
                    });
                    const data = await resp.json();
                    if (!resp.ok) throw new Error(data.error || 'No se pudo subir');
                    
                    toast.success('Firma digital registrada correctamente');
                    setDigitalSignFile(null);
                    
                    // Refrescar estado
                    const digitalResp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/digital-signature-status`, {
                      headers: { Authorization: token ? 'Bearer ' + token : '' },
                    });
                    if (digitalResp.ok) setDigitalSignStatus(await digitalResp.json());
                  } catch (e: any) {
                    toast.error(e.message || 'Error al subir PDF firmado');
                  } finally {
                    setLoadingDigitalSign(false);
                  }
                }}
              >
                {loadingDigitalSign ? 'Subiendo...' : '📤 Subir PDF firmado'}
              </button>
            </div>
          </div>
        )}

        {/* Sección independiente para descargar PDF final firmado */}
        {digitalSignStatus?.allSigned && !actaStatus?.canEvaluatorSign && (
          <div className="border rounded-xl p-4 bg-green-50 dark:bg-green-950">
            <h3 className="text-sm font-bold text-green-700 dark:text-green-300 uppercase tracking-widest mb-2">✅ Acta Firmada Completamente</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Todas las firmas digitales han sido registradas. Puede descargar el acta final firmada.
            </p>
            <div className="space-y-1 mb-3">
              {digitalSignStatus.digitalSignatures?.map((sig: any, idx: number) => (
                <div key={idx} className="text-xs text-green-600">
                  ✓ {sig.signer_role === 'evaluator' ? 'Evaluador' : sig.signer_role === 'director' ? 'Director' : 'Dir. Programa'}: {sig.signer_name}
                </div>
              ))}
            </div>
            <button
              className="px-4 py-2 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-700"
              onClick={async () => {
                try {
                  const token = localStorage.getItem('token');
                  const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/download-final-signed`, {
                    headers: { Authorization: token ? 'Bearer ' + token : '' },
                  });
                  if (!resp.ok) {
                    const err = await resp.json();
                    throw new Error(err.error || 'No se pudo descargar');
                  }
                  const blob = await resp.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `acta-final-firmada-${thesis.id}.pdf`;
                  a.click();
                  window.URL.revokeObjectURL(url);
                  toast.success('PDF final descargado');
                } catch (e: any) {
                  toast.error(e.message || 'Error al descargar');
                }
              }}
            >
              📄 Descargar PDF final firmado
            </button>
          </div>
        )}

        {thesis.timeline && thesis.timeline.length > 0 && (
          <div className="pt-6 border-t border-border">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-6">Historial de Evaluación</h3>
            <ThesisTimeline events={thesis.timeline} isBlindReview={thesis.evaluators?.some((e: any) => e.is_blind)} isAdmin={false} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
