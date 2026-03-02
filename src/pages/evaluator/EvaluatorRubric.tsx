import AppLayout from "@/components/layout/AppLayout";
import RubricEvaluation from "@/components/thesis/RubricEvaluation";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { defaultRubric, presentationRubric } from "@/lib/mock-data";
import { useAuth } from "@/hooks/useAuth";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function EvaluatorRubric() {
  const { id } = useParams();
  const { user } = useAuth();
  const [thesis, setThesis] = useState<any>(null);
  const [weights, setWeights] = useState<{doc:number;presentation:number}>({doc:70,presentation:30});

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

  // backend returns "evaluation_type" not "type"
  const docEval = thesis.evaluations?.find((ev: any) =>
    (ev.evaluation_type === "document" || ev.type === "document") && // keep defensive check
    ev.evaluator_id === user?.id
  );
  const presEval = thesis.evaluations?.find((ev: any) =>
    (ev.evaluation_type === "presentation" || ev.type === "presentation") &&
    ev.evaluator_id === user?.id
  );
  const wantPresentation = !!thesis.defense_date;

  const submitEvaluation = async (data: { score: number | null; observations: string; concept?: any; sections?: any; files?: File[] }, type: 'document' | 'presentation') => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/evaluations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? 'Bearer ' + token : '' },
        body: JSON.stringify({ thesis_id: thesis.id, evaluation_type: type, ...data }),
      });
      if (!resp.ok) {
        const e = await resp.json();
        throw new Error(e.error || 'failed');
      }
      toast.success('Evaluación enviada');
      // reload thesis to update state
      const r2 = await fetch(`${API_BASE}/theses/${thesis.id}`, {
        headers: { Authorization: token ? 'Bearer ' + token : '' },
      });
      if (r2.ok) {
        setThesis(await r2.json());
      }
    } catch (e:any) {
      toast.error(e.message || 'Error al enviar evaluación');
    }
  };
  // find the evaluator record in thesis for due dates
  const myEvaluator = thesis.evaluators?.find((e: any) => String(e.id) === String(user?.id));

  const docScore = docEval?.final_score ?? 0;
  const presScore = presEval?.final_score ?? 0;
  const finalWeightedScore = wantPresentation 
    ? ((docScore * (weights.doc / 100)) + (presScore * (weights.presentation / 100))) 
    : docScore;

  return (
    <AppLayout role="evaluator">
      <div className="p-6 max-w-4xl mx-auto space-y-8">
        <div className="space-y-4">
          <h2 className="text-3xl font-bold text-primary tracking-tight leading-none">{thesis.title}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Estudiantes</p>
              <div className="flex flex-wrap gap-2">
                {thesis.students?.map((s: any) => (
                  <span key={s.id} className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-secondary text-secondary-foreground border border-border">
                    {s.name}
                  </span>
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
              <div className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 p-3 rounded-lg font-mono">
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
                  Rúbrica de Documento
                  {myEvaluator?.due_date && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (límite: {new Date(myEvaluator.due_date).toLocaleDateString()})
                    </span>
                  )}
                  {docEval ? (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-success/10 text-success border border-success/20">Enviada</span>
                  ) : (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-100 text-red-600 border border-red-200">Pendiente</span>
                  )}
                </AccordionTrigger>
              <AccordionContent className="pb-6">
                <RubricEvaluation
                  thesis={thesis}
                  onSubmit={(data) => submitEvaluation(data, 'document')}
                  readOnly={!!docEval}
                  submitDisabled={!!docEval}
                  showConcept={false}
                  showFiles={false}
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
                  Rúbrica de Sustentación
                  {thesis.defense_date && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (sustentación: {new Date(thesis.defense_date).toLocaleDateString()})
                    </span>
                  )}
                  {presEval ? (
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-success/10 text-success border border-success/20">Enviada</span>
                  ) : (
                    wantPresentation && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-100 text-red-600 border border-red-200">Pendiente</span>
                    )
                  )}
                </AccordionTrigger>
              <AccordionContent className="pb-6">
                <RubricEvaluation
                  thesis={thesis}
                  onSubmit={(data) => submitEvaluation(data, 'presentation')}
                  readOnly={!!presEval}
                  submitDisabled={!!presEval}
                  showConcept={false}
                  showFiles={false}
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
