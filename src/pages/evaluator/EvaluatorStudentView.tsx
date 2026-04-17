import AppLayout from "@/components/layout/AppLayout";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import StatusBadge from "@/components/thesis/StatusBadge";
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

function ScoreCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-xl p-4 bg-white dark:bg-slate-950 space-y-3">
      <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">{label}</h3>
      {children}
    </div>
  );
}

export default function EvaluatorStudentView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [thesis, setThesis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [weights, setWeights] = useState<{ doc: number; presentation: number }>({ doc: 70, presentation: 30 });

  useEffect(() => {
    if (!id) return;
    const fetchThesis = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`${API_BASE}/theses/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error("Error consultando proyecto de grado");
        const data = await resp.json();
        if (data.timeline && Array.isArray(data.timeline)) {
          data.timeline = data.timeline.map((e: any) => ({ ...e, date: e.date ?? undefined }));
        }
        setThesis(data);
      } catch (err: any) {
        toast.error(err.message || "Error consultando proyecto de grado");
      } finally {
        setLoading(false);
      }
    };
    fetchThesis();

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
  }, [id]);

  return (
    <AppLayout role="evaluator">
      <div className="max-w-2xl mx-auto px-4 sm:px-0">
        <button
          className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
          onClick={() => navigate("/evaluator")}
        >
          ← Volver
        </button>

        {loading ? (
          <div className="text-center py-8">Cargando...</div>
        ) : !thesis ? (
          <div className="text-center py-8">No se encontró el proyecto de grado.</div>
        ) : (
          <>
            <div className="mb-8">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-2">
                <h2 className="font-heading text-2xl font-bold text-foreground">
                  Seguimiento del proyecto de grado
                </h2>
                {thesis.revision_round > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Ronda de revisión: {thesis.revision_round}
                  </p>
                )}
                <StatusBadge status={thesis.status} />
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{thesis.title}</p>
              {thesis.students && thesis.students.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Autor{thesis.students.length > 1 ? "es" : ""}:</strong>{" "}
                  {thesis.students.map((s: any) => s.name).join(", ")}
                </p>
              )}
              {thesis.directors && thesis.directors.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Director{thesis.directors.length > 1 ? "es" : ""}:</strong>{" "}
                  {thesis.directors
                    .map((d: any) => (typeof d === "string" ? d : d?.name || d?.user_id || ""))
                    .filter(Boolean)
                    .join(", ")}
                </p>
              )}
              {thesis.evaluators && thesis.evaluators.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Evaluadores asignados:</strong>{" "}
                  {thesis.evaluators.some((e: any) => e.is_blind) ? (
                    <em>pares ciegos</em>
                  ) : (
                    thesis.evaluators.map((e: any) => e.name).join(", ")
                  )}
                </p>
              )}
              {thesis.defense_date && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Sustentación:</strong>{" "}
                  {new Date(thesis.defense_date * 1000).toLocaleString()}
                  {thesis.defense_location ? ` en ${thesis.defense_location}` : ""}
                  {thesis.defense_info && ` – ${thesis.defense_info}`}
                </p>
              )}
            </div>

            <ThesisTimeline
              events={thesis.timeline || []}
              isBlindReview={thesis.evaluators && thesis.evaluators.some((e: any) => e.is_blind)}
              isAdmin={false}
            />

            {/* Score summaries */}
            {(() => {
              const evals: any[] = thesis.evaluations || [];
              const isBlind = thesis.evaluators?.some((e: any) => e.is_blind);
              const docEvals = evals.filter(
                (e: any) => e.evaluation_type !== "presentation" && e.final_score != null
              );
              const presEvals = evals.filter(
                (e: any) => e.evaluation_type === "presentation" && e.final_score != null
              );
              const w = weights;
              const docAvg = docEvals.length
                ? docEvals.reduce((a: number, b: any) => a + Number(b.final_score), 0) / docEvals.length
                : null;
              const presAvg = presEvals.length
                ? presEvals.reduce((a: number, b: any) => a + Number(b.final_score), 0) / presEvals.length
                : null;

              const evaluatorIds = [...new Set(evals.map((e: any) => e.evaluator_id))];
              const perEvaluator = evaluatorIds.map((eid) => {
                const evName = isBlind
                  ? null
                  : evals.find((e: any) => e.evaluator_id === eid)?.evaluator_name || "Evaluador";
                const doc = evals.find(
                  (e: any) => e.evaluator_id === eid && e.evaluation_type !== "presentation"
                );
                const pres = evals.find(
                  (e: any) => e.evaluator_id === eid && e.evaluation_type === "presentation"
                );
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
                assignedEvaluatorIds.every((eid: any) => presentationEvaluatorIds.has(eid));

              const shouldShowConsolidated =
                docAvg != null &&
                finalScore != null &&
                (!hasDefense || (hasDefense && allEvaluatedPresentation));

              return (
                <div className="space-y-4 mt-6">
                  {docEvals.length > 0 && (
                    <ScoreCard label="Calificaciones del Documento">
                      <p className="text-xs text-muted-foreground mb-2">
                        Esta evaluación vale <strong>{w.doc}%</strong> de la nota final.
                      </p>
                      {docEvals.map((ev: any, i: number) => (
                        <div key={ev.id || i} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {isBlind ? `Evaluador ${i + 1}` : ev.evaluator_name}
                          </span>
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
                  )}

                  {presEvals.length > 0 && (
                    <ScoreCard label="Calificaciones de la Sustentación">
                      <p className="text-xs text-muted-foreground mb-2">
                        Esta evaluación vale <strong>{w.presentation}%</strong> de la nota final.
                      </p>
                      {presEvals.map((ev: any, i: number) => (
                        <div key={ev.id || i} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {isBlind ? `Evaluador ${i + 1}` : ev.evaluator_name}
                          </span>
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

                  {shouldShowConsolidated && (
                    <ScoreCard label="Calificación Consolidada">
                      <div className="text-center mb-3">
                        <span className="text-3xl font-black text-primary">
                          {Number(finalScore).toFixed(1)}
                        </span>
                        <span className="text-lg text-muted-foreground"> / 5.0</span>
                      </div>
                      <div className="text-sm text-center font-semibold text-muted-foreground mb-2">
                        Nota Final Ponderada
                      </div>
                      {hasDefense && allEvaluatedPresentation ? (
                        <p className="text-sm text-center text-muted-foreground break-words">
                          Cálculo: ({docAvg!.toFixed(1)} × {w.doc}%) + ({presAvg?.toFixed(1)} × {w.presentation}%) ={" "}
                          {Number(finalScore).toFixed(1)}
                        </p>
                      ) : (
                        <p className="text-sm text-center text-muted-foreground break-words">
                          Cálculo: promedio documento = {docAvg!.toFixed(1)}
                        </p>
                      )}
                      {perEvaluator.length > 0 && (
                        <div className="border-t pt-3 mt-3 space-y-2">
                          {perEvaluator.map((pe, i) => (
                            <div key={i} className="text-sm text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {pe.name || `Evaluador ${i + 1}`}:
                              </span>{" "}
                              {pe.docScore != null && <>documento {pe.docScore.toFixed(1)}</>}
                              {pe.presScore != null && <>, sustentación {pe.presScore.toFixed(1)}</>}
                              {pe.total != null && (
                                <>, total <span className="font-semibold text-foreground">{pe.total.toFixed(1)}</span></>
                              )}
                              {pe.docScore != null && pe.presScore != null && (
                                <div className="text-xs ml-4 text-muted-foreground/70">
                                  ({pe.docScore.toFixed(1)} × {w.doc}% + {pe.presScore.toFixed(1)} × {w.presentation}%)
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </ScoreCard>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </div>
    </AppLayout>
  );
}
