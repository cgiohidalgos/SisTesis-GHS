import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import { useAuth } from "@/hooks/useAuth";
import { defaultRubric, presentationRubric } from "@/lib/mock-data";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import RubricEvaluation from "@/components/thesis/RubricEvaluation";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function AdminThesisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [thesis, setThesis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [reviewItems, setReviewItems] = useState<{id:string,label:string}[]>([]);
  const [weights, setWeights] = useState<{doc:number;presentation:number}>({doc:70,presentation:30});
  const [actaStatus, setActaStatus] = useState<any>(null);
  const [directorName, setDirectorName] = useState("");
  const [directorSignFile, setDirectorSignFile] = useState<File | null>(null);
  const [programDirectorName, setProgramDirectorName] = useState("");
  const [programDirectorSignFile, setProgramDirectorSignFile] = useState<File | null>(null);

  // compute consolidated averages and breakdown for display
  const consolidated = (() => {
    if (!thesis || !thesis.evaluations || thesis.evaluations.length === 0) {
      return null;
    }
    const docScores = thesis.evaluations
      .filter((e:any) => e.evaluation_type !== 'presentation')
      .map((e:any) => e.final_score)
      .filter((n:any) => n != null);
    const presScores = thesis.evaluations
      .filter((e:any) => e.evaluation_type === 'presentation')
      .map((e:any) => e.final_score)
      .filter((n:any) => n != null);
    const docAvg = docScores.length ? docScores.reduce((a:number,b:number)=>a+b,0)/docScores.length : 0;
    const presAvg = presScores.length ? presScores.reduce((a:number,b:number)=>a+b,0)/presScores.length : 0;
    const finalWeighted = thesis.defense_date
      ? ((docAvg * (weights.doc/100)) + (presAvg * (weights.presentation/100)))
      : docAvg;
    const byEvaluator: Record<string,{doc:number|null;pres:number|null}> = {};
    thesis.evaluations.forEach((ev:any)=>{
      const name = ev.evaluator_name || 'Evaluador';
      if (!byEvaluator[name]) byEvaluator[name] = {doc:null,pres:null};
      if (ev.evaluation_type === 'presentation') {
        byEvaluator[name].pres = ev.final_score;
      } else {
        byEvaluator[name].doc = ev.final_score;
      }
    });
    return {docAvg,presAvg,finalWeighted,byEvaluator};
  })();

  const { isSuper } = useAuth();

  const fetchThesis = async () => {
    if (!id) return;
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${id}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('No se pudo cargar la tesis');
      const data = await resp.json();
      // convert timeline dates to readable form
      if (data.timeline && Array.isArray(data.timeline)) {
        data.timeline = data.timeline.map((e: any) => ({
          ...e,
          date: e.date ? new Date(e.date).toLocaleString() : undefined,
        }));
      }
      setThesis(data);

      const actaResp = await fetch(`${API_BASE}/theses/${id}/acta/status`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (actaResp.ok) {
        const acta = await actaResp.json();
        setActaStatus(acta);
        if (!directorName && acta.directors?.length) setDirectorName(acta.directors[0]);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };


  useEffect(() => {
    fetchThesis();
    // load review checklist template (admins allowed too)
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE}/super/review-items`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (resp.ok) {
          const items = await resp.json();
          setReviewItems(items);
          const init: Record<string, boolean> = {};
          items.forEach((it:any) => { init[it.id] = false; });
          setChecklist(init);
        }
      } catch (e) {
        console.error('failed to load review items', e);
      }
    })();
    // also load evaluation weights if superadmin
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE}/super/weights`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (resp.ok) {
          const data = await resp.json();
          setWeights({ doc: data.doc, presentation: data.presentation });
        }
      } catch (e) {
        console.error('failed to load weights', e);
      }
    })();
  }, [id]);

  const markNonCompliant = async () => {
    if (!thesis) return;
    if (!comment.trim()) {
      toast.error('Ingrese un comentario');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/theses/${thesis.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ ok: false, comment }),
      });
      toast.success('Tesis regresada al estudiante');
      navigate('/admin/theses');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const assignEvaluators = () => {
    if (!thesis) return;
    navigate(`/admin/evaluators?thesis=${thesis.id}`);
  };

  // component for scheduling the defense date/location
  const DefenseScheduler = ({ thesis, onScheduled }: any) => {
    const [date, setDate] = useState<string>(thesis.defense_date ? new Date(thesis.defense_date).toISOString().slice(0,16) : '');
    const [location, setLocation] = useState<string>(thesis.defense_location || '');
    const [info, setInfo] = useState<string>(thesis.defense_info || '');
    const [saving, setSaving] = useState(false);
    const handleSave = async () => {
      if (!date || !location) {
        toast.error('Ingrese fecha y lugar');
        return;
      }
      setSaving(true);
      try {
        const token = localStorage.getItem('token');
        await fetch(`${API_BASE}/theses/${thesis.id}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token?`Bearer ${token}`:'' },
          body: JSON.stringify({ date, location, info }),
        });
        toast.success('Sustentación programada');
        onScheduled();
      } catch (e:any) {
        toast.error(e.message);
      } finally {
        setSaving(false);
      }
    };
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Fecha y hora</label>
          <input
            type="datetime-local"
            className="border p-2 w-full"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Lugar</label>
          <input
            type="text"
            className="border p-2 w-full"
            placeholder="Ej. Sala 101"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Información adicional</label>
          <textarea
            className="border p-2 w-full"
            placeholder="Detalles adicionales, enlace virtual, etc."
            value={info}
            onChange={(e) => setInfo(e.target.value)}
          />
        </div>
        <Button onClick={handleSave} disabled={saving || !date || !location}>
          Guardar programación
        </Button>
      </div>
    );
  };

  const handleDelete = async () => {
    if (!thesis) return;
    if (!confirm("¿Eliminar esta tesis? Esta acción no se puede deshacer.")) return;
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${thesis.id}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('Error eliminando tesis');
      toast.success('Tesis eliminada');
      navigate('/admin/theses');
    } catch (e:any) {
      toast.error(e.message);
    }
  };

  if (!thesis) return null;

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 bg-card p-6 rounded-lg shadow-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-2xl font-bold">Detalle de Tesis</h2>
            <Button variant="destructive" size="sm" onClick={handleDelete}>Eliminar tesis</Button>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            <strong>Estado:</strong> <span className="capitalize">{thesis.status}</span>
          </p>
          <p className="text-lg font-semibold mb-2">
            <strong>Título:</strong> {thesis.title}
          </p>
          {thesis.students && thesis.students.length > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              <strong>Autor{thesis.students.length>1?'es':''}:</strong> {thesis.students.map((s:any)=>s.name).join(', ')}
            </p>
          )}
          {thesis.directors && thesis.directors.length > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              <strong>Director{thesis.directors.length>1?'es':''}:</strong> {thesis.directors.join(', ')}
            </p>
          )}
          {thesis.programs && thesis.programs.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <strong>Programas:</strong> {thesis.programs.map((p:any)=>p.name).join(', ')}
            </p>
          )}
        </div>
        {thesis.keywords && (
          <div className="mb-4">
            <strong>Palabras clave:</strong> {thesis.keywords}
          </div>
        )}
        {thesis.evaluators && thesis.evaluators.length > 0 && (
          <div className="mb-6">
            <strong>Evaluadores asignados:</strong>{' '}
            {thesis.evaluators.map((e:any) =>
              e.is_blind ? 'Par ciego' : e.name
            ).join(', ')}
            {thesis.evaluators.some((e:any) => e.due_date) && (
              <p className="text-sm text-muted-foreground">
                <strong>Fecha(s) límite:</strong> {thesis.evaluators
                  .map((e:any) => e.due_date)
                  .filter(Boolean)
                  .map((d:string) => new Date(d).toLocaleDateString())
                  .join(', ')}
              </p>
            )}

            {/* per-evaluator status accordions */}
            <Accordion type="single" collapsible className="mt-4 w-full border rounded-xl overflow-hidden bg-white dark:bg-slate-950">
              {thesis.evaluators.map((ev:any) => {
                const docSent = thesis.evaluations?.some((x:any) => x.evaluator_id===ev.id && x.evaluation_type!=='presentation');
                const presSent = thesis.evaluations?.some((x:any) => x.evaluator_id===ev.id && x.evaluation_type==='presentation');
                // pull the actual evaluation objects to show later
                const docEval = thesis.evaluations?.find((x:any) => x.evaluator_id===ev.id && x.evaluation_type!=='presentation');
                const presEval = thesis.evaluations?.find((x:any) => x.evaluator_id===ev.id && x.evaluation_type==='presentation');
                // compute due-date status badge when evaluation still pending
                let dueStatus: JSX.Element | null = null;
                if (ev.due_date && !(docSent && (thesis.defense_date ? docSent && presSent : docSent))) {
                  const now = new Date();
                  const due = new Date(ev.due_date);
                  const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
                  if (diff < 0) {
                    dueStatus = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-100 text-red-600 border border-red-200">
                        Atrasado
                      </span>
                    );
                  } else if (diff <= 4) {
                    dueStatus = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-yellow-100 text-yellow-700 border border-yellow-200">
                        Casi vence
                      </span>
                    );
                  } else {
                    dueStatus = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 text-muted-foreground border border-border">
                        Pendiente
                      </span>
                    );
                  }
                }
                return (
                  <AccordionItem key={ev.id} value={ev.id} className="border-b px-2">
                    <AccordionTrigger className="hover:no-underline py-4 flex justify-between items-center">
                      <span>{ev.is_blind ? 'Evaluador (Par ciego)' : ev.name}</span>
                      {dueStatus}
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 space-y-4">
                      {/* document rubric accordion if sent*/}
                      {docSent && docEval && (
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={`${ev.id}-doc`} className="border-b px-2">
                            <AccordionTrigger className="hover:no-underline py-2 flex justify-between items-center">
                              <span>Rúbrica de Documento</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-success/10 text-success border border-success/20">Enviada</span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4">
                              <RubricEvaluation
                                thesis={thesis}
                                readOnly={true}
                                submitDisabled={true}
                                showConcept={false}
                                showFiles={false}
                                initialConcept={docEval.concept || null}
                                initialFinalScore={docEval.final_score}
                                initialSections={docEval ? defaultRubric.map((s: any) => ({
                                  ...s,
                                  criteria: s.criteria.map((c: any) => {
                                    const sc = docEval.scores?.find((x: any) => x.section_id === s.id && x.criterion_id === c.id);
                                    return { ...c, score: sc?.score ?? undefined, observations: sc?.observations || "" };
                                  })
                                })) : undefined}
                                initialGeneralObs={docEval.general_observations || ""}
                                initialFiles={docEval.files || []}
                              />
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}

                      {/* presentation rubric accordion if sent*/}
                      {presSent && presEval && (
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={`${ev.id}-pres`} className="border-b px-2">
                            <AccordionTrigger className="hover:no-underline py-2 flex justify-between items-center">
                              <span>Rúbrica de Sustentación</span>
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-success/10 text-success border border-success/20">Enviada</span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4">
                              <RubricEvaluation
                                thesis={thesis}
                                readOnly={true}
                                submitDisabled={true}
                                showConcept={false}
                                showFiles={false}
                                initialConcept={presEval.concept || null}
                                initialFinalScore={presEval.final_score}
                                initialSections={presEval ? presentationRubric.map((s: any) => ({
                                  ...s,
                                  criteria: s.criteria.map((c: any) => {
                                    const sc = presEval.scores?.find((x: any) => x.section_id === s.id && x.criterion_id === c.id);
                                    return { ...c, score: sc?.score ?? undefined, observations: sc?.observations || "" };
                                  })
                                })) : undefined}
                                initialGeneralObs={presEval.general_observations || ""}
                                initialFiles={presEval.files || []}
                              />
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        )}
        {thesis.files && thesis.files.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Documentos enviados</h3>
            <ul className="list-disc list-inside space-y-1">
              {thesis.files.map((f:any)=> (
                <li key={f.id}>
                  <a href={`${API_BASE}${f.file_url}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    {f.file_name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* defense card like evaluator */}
        {thesis.defense_date && (
          <div className="mb-6 p-4 rounded-xl bg-blue-50/50 border border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30">
            <h3 className="text-sm font-bold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
              Información de la Sustentación
            </h3>
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

        {/* consolidated score for admin */}
        {consolidated && (
          <div className="mb-6 bg-white dark:bg-slate-950 rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calificación Consolidada</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <p className="text-4xl font-black text-primary">
                      {consolidated.finalWeighted.toFixed(2)}
                      <span className="text-lg text-muted-foreground font-medium ml-1">/ 5.00</span>
                    </p>
                    <p className="text-sm font-medium text-success mt-1">Nota Final Ponderada</p>
                  </div>
                  <div className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 p-3 rounded-lg font-mono">
                    Cálculo: ({consolidated.docAvg.toFixed(2)} x {weights.doc}%) {thesis.defense_date ? `+ (${consolidated.presAvg.toFixed(2)} x ${weights.presentation}%)` : ''} = {consolidated.finalWeighted.toFixed(2)}
                  </div>
                </div>
                <div className="text-sm">
                  {Object.entries(consolidated.byEvaluator).map(([name, scores]) => {
                    const docScore = scores.doc != null ? scores.doc : null;
                    const presScore = scores.pres != null ? scores.pres : null;
                    const totalScore = thesis.defense_date
                      ? ((docScore||0)*(weights.doc/100) + (presScore||0)*(weights.presentation/100))
                      : docScore;
                    return (
                      <div key={name} className="mb-2">
                        <strong>{name}</strong>: documento {docScore!==null?docScore.toFixed(2):'-'}, sustentación {presScore!==null?presScore.toFixed(2):'-'}, total {totalScore!==null?totalScore.toFixed(2):'-'}
                        <div className="text-xs text-muted-foreground">
                          ({docScore!==null?`${docScore.toFixed(2)} x ${weights.doc}%`:'0'}{thesis.defense_date?` + ${presScore!==null?`${presScore.toFixed(2)} x ${weights.presentation}%`:'0'}`:''})
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* only show revision checklist if there are no evaluators yet */}
        {(!thesis.evaluators || thesis.evaluators.length === 0) && (
          <div className="mb-4">
            <strong>Revisión</strong>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
              {reviewItems.map((item) => (
                <label key={item.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!checklist[item.id]}
                    onChange={() => setChecklist((c) => ({ ...c, [item.id]: !c[item.id] }))}
                    className="form-checkbox"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        )}
        {thesis.timeline && thesis.timeline.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Historial</h3>
            <ThesisTimeline events={thesis.timeline} isAdmin={true} />
          </div>
        )}
        {thesis.status === 'submitted' && (
          <>
            <div className="mb-4">
              {reviewItems.length > 0 && reviewItems.every(it => checklist[it.id]) ? (
                <Button
                  onClick={assignEvaluators}
                  disabled={loading}
                >
                  Cumple todo
                </Button>
              ) : (
                <>
                  <textarea
                    className="w-full border p-2 mb-2"
                    placeholder="Comentario al regresar"
                    value={comment}
                    onChange={(e)=>setComment(e.target.value)}
                  />
                  <Button variant="destructive" onClick={markNonCompliant} disabled={loading}>Regresar al estudiante</Button>
                </>
              )}
            </div>

          </>
        )}
        {/* schedule defense when status indicates sustentación */}
        {thesis.status === 'sustentacion' && (
          <div className="mb-6 border p-4 rounded bg-info/10">
            <h3 className="font-semibold mb-2">Programar Sustentación</h3>
            {thesis.defense_date ? (
              <div className="space-y-2">
                <p>
                  <strong>Fecha y hora:</strong>{' '}{new Date(thesis.defense_date).toLocaleString()}
                </p>
                {thesis.defense_location && (
                  <p><strong>Lugar:</strong> {thesis.defense_location}</p>
                )}
                {thesis.defense_info && (
                  <p><strong>Información adicional:</strong> {thesis.defense_info}</p>
                )}
                <Button size="sm" variant="outline" onClick={() => {
                  // clear to allow reschedule
                  setThesis((t:any) => ({ ...t, defense_date: null, defense_location: '', defense_info: '' }));
                }}>
                  Modificar
                </Button>
              </div>
            ) : (
              <DefenseScheduler thesis={thesis} onScheduled={fetchThesis} />
            )}
          </div>
        )}
        {actaStatus?.allEvaluatorsDone && (
          <div className="mb-6 border p-4 rounded bg-success/5">
            <h3 className="font-semibold mb-2">Acta de Sustentación</h3>
            <p className="text-sm text-muted-foreground mb-2">
              Firmas de jurados: {actaStatus.evaluatorSignatures?.length || 0}/{actaStatus.evaluators?.length || 0}
            </p>
            {actaStatus.missingEvaluatorSignatures?.length > 0 && (
              <p className="text-sm text-red-600 mb-2">
                Pendientes por firmar: {actaStatus.missingEvaluatorSignatures.map((e:any)=>e.name).join(', ')}
              </p>
            )}
            <div className="space-y-2 mb-3">
              {(actaStatus.evaluatorSignatures || []).map((s:any) => (
                <div key={s.id} className="text-sm">
                  Jurado: <strong>{s.signer_name}</strong>{' '}
                  <a className="text-accent hover:underline" href={`${API_BASE}${s.file_url}`} target="_blank" rel="noreferrer">ver firma</a>
                </div>
              ))}
              {(actaStatus.directorSignatures || []).map((s:any) => (
                <div key={s.id} className="text-sm">
                  Director: <strong>{s.signer_name}</strong>{' '}
                  <a className="text-accent hover:underline" href={`${API_BASE}${s.file_url}`} target="_blank" rel="noreferrer">ver firma</a>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 mt-2">
              <p className="text-sm font-medium mb-2">Firma del Director (admin)</p>
              {(() => {
                const signed = (actaStatus.directorSignatures || []).map((s:any) => s.signer_name?.toLowerCase());
                const pending = (actaStatus.directors || []).filter((d:string) => !signed.includes(d.toLowerCase()));
                if (pending.length === 0) return <p className="text-sm text-muted-foreground mb-2">Todos los directores ya firmaron.</p>;
                return (
                  <select
                    className="border rounded px-2 py-1 text-sm mb-2 w-full"
                    value={directorName}
                    onChange={(e) => setDirectorName(e.target.value)}
                  >
                    <option value="">Seleccione un director...</option>
                    {pending.map((d:string) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                );
              })()}
              <input type="file" accept="image/*" onChange={(e) => setDirectorSignFile(e.target.files?.[0] || null)} className="mb-2" />
              <div className="flex gap-2 flex-wrap">
                <Button
                  disabled={!directorSignFile || !directorName}
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const form = new FormData();
                      if (directorSignFile) form.append('signature', directorSignFile);
                      if (directorName) form.append('director_name', directorName);
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/sign-director`, {
                        method: 'POST',
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                        body: form,
                      });
                      const data = await resp.json();
                      if (!resp.ok) throw new Error(data.error || 'No se pudo registrar firma');
                      toast.success('Firma de director registrada');
                      setDirectorSignFile(null);
                      fetchThesis();
                    } catch (e:any) {
                      toast.error(e.message || 'Error registrando firma');
                    }
                  }}
                >
                  Firmar acta como director
                </Button>
              </div>
            </div>

            <div className="border-t pt-3 mt-3">
              <p className="text-sm font-medium mb-2">Firma del Director del Programa</p>
              {actaStatus.programDirectorSignature && (
                <div className="text-sm mb-2 text-green-600">
                  ✓ Firmado por: <strong>{actaStatus.programDirectorSignature.signer_name}</strong>{' '}
                  <a className="text-accent hover:underline" href={`${API_BASE}${actaStatus.programDirectorSignature.file_url}`} target="_blank" rel="noreferrer">ver firma</a>
                </div>
              )}
              <input
                className="border rounded px-2 py-1 text-sm mb-2 w-full"
                placeholder="Nombre del director del programa"
                value={programDirectorName}
                onChange={(e) => setProgramDirectorName(e.target.value)}
              />
              <input type="file" accept="image/*" onChange={(e) => setProgramDirectorSignFile(e.target.files?.[0] || null)} className="mb-2" />
              <div className="flex gap-2 flex-wrap">
                <Button
                  disabled={!programDirectorSignFile}
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const form = new FormData();
                      if (programDirectorSignFile) form.append('signature', programDirectorSignFile);
                      if (programDirectorName) form.append('program_director_name', programDirectorName);
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/sign-program-director`, {
                        method: 'POST',
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                        body: form,
                      });
                      const data = await resp.json();
                      if (!resp.ok) throw new Error(data.error || 'No se pudo registrar firma');
                      toast.success('Firma del director del programa registrada');
                      setProgramDirectorSignFile(null);
                      setProgramDirectorName("");
                      fetchThesis();
                    } catch (e:any) {
                      toast.error(e.message || 'Error registrando firma');
                    }
                  }}
                >
                  Firmar como director del programa
                </Button>
              </div>
            </div>

            <div className="border-t pt-3 mt-3">
              <p className="text-sm font-medium mb-2">Exportar Acta</p>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" onClick={async () => {
                  try {
                    const token = localStorage.getItem('token');
                    const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/export?format=word`, {
                      headers: { Authorization: token ? `Bearer ${token}` : '' },
                    });
                    if (!resp.ok) {
                      const errorData = await resp.json().catch(() => ({}));
                      throw new Error(errorData.message || errorData.error || 'No se pudo exportar');
                    }
                    const blob = await resp.blob();
                    const contentDisposition = resp.headers.get('content-disposition') || '';
                    const fileNameMatch = contentDisposition.match(/filename="?([^\"]+)"?/i);
                    const fileName = fileNameMatch?.[1] || `acta_${thesis.id}.doc`;
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.click();
                    window.URL.revokeObjectURL(url);
                  } catch (e: any) {
                    toast.error(e.message || 'Error al exportar');
                  }
                }}>
                  Exportar Word
                </Button>
                <Button variant="outline" onClick={async () => {
                  try {
                    const token = localStorage.getItem('token');
                    const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/export?format=pdf`, {
                      headers: { Authorization: token ? `Bearer ${token}` : '' },
                    });
                    if (!resp.ok) {
                      const errorData = await resp.json().catch(() => ({}));
                      throw new Error(errorData.message || errorData.error || 'No se pudo exportar');
                    }
                    const blob = await resp.blob();
                    const disposition = resp.headers.get('Content-Disposition') || '';
                    const filenameMatch = disposition.match(/filename="?([^";\n]+)"?/);
                    const fileName = filenameMatch ? filenameMatch[1] : `acta_${thesis.id}.pdf`;
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.click();
                    window.URL.revokeObjectURL(url);
                  } catch (e: any) {
                    toast.error(e.message || 'Error al exportar');
                  }
                }}>
                  Exportar PDF
                </Button>
              </div>
            </div>
          </div>
        )}

        {(thesis.status === 'revision_minima' || thesis.status === 'revision_cuidados') && (
          <div className="mb-6 border p-4 rounded bg-warning/10">
            <h3 className="font-semibold mb-2">Enviar retroalimentación al estudiante</h3>
            <textarea
              className="w-full border p-2 mb-2"
              placeholder="Comentario para el estudiante"
              value={comment}
              onChange={(e)=>setComment(e.target.value)}
            />
            <input type="file" onChange={(e)=>{
              const files=e.target.files; if(files&&files[0]){
                const form=new FormData(); form.append('file', files[0]);
                const token=localStorage.getItem('token');
                fetch(`${API_BASE}/theses/${thesis.id}/feedback`,{method:'POST',headers:{Authorization:token?`Bearer ${token}`:''},body: form}).then(()=>toast.success('Feedback enviado'));
              }
            }} />
            <div className="mt-4 flex gap-2">
              <Button onClick={async () => {
                const token=localStorage.getItem('token');
                await fetch(`${API_BASE}/theses/${thesis.id}/decision`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: token?`Bearer ${token}`:'' },
                  body: JSON.stringify({ action: 'sustentacion', comment }),
                });
                toast.success('Tesis movida a sustentación');
                fetchThesis && fetchThesis();
              }}>Aprobar para Sustentación</Button>
              <Button variant="destructive" onClick={async () => {
                const token=localStorage.getItem('token');
                await fetch(`${API_BASE}/theses/${thesis.id}/decision`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: token?`Bearer ${token}`:'' },
                  body: JSON.stringify({ action: 'reject', comment }),
                });
                toast.success('Tesis regresada a borrador');
                fetchThesis && fetchThesis();
              }}>Regresar a borrador</Button>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
