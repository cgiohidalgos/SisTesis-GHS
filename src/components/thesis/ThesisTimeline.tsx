import { useState } from "react";
import { Check, Clock, Circle, FileText, User, Shield, Download, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { defaultRubric, presentationRubric, type TimelineEvent } from "@/lib/mock-data";

import { getApiBase } from "@/lib/utils";
const API_BASE = getApiBase();

async function downloadFile(url: string, fileName: string) {
  try {
    const token = localStorage.getItem('token');
    const resp = await fetch(`${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!resp.ok) throw new Error(`Error ${resp.status}`);
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

// Build lookup maps from rubric definitions
const allRubrics = [...defaultRubric, ...presentationRubric];
const sectionMap: Record<string, string> = {};
const criterionMap: Record<string, { name: string; maxScore: number }> = {};
for (const s of allRubrics) {
  sectionMap[s.id] = s.name;
  for (const c of s.criteria) {
    criterionMap[c.id] = { name: c.name, maxScore: c.maxScore };
  }
}

interface ThesisTimelineProps {
  events: TimelineEvent[];
  evaluatorFiles?: { name: string; url: string }[];
  evaluatorRecommendations?: string;
  isBlindReview?: boolean;
  /** si el componente se muestra en vista de administrador */
  isAdmin?: boolean;
}

const actorIcons = {
  admin: Shield,
  evaluator: User,
  system: FileText,
};

function safeRender(value: any) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(safeRender).join(', ');
  if (typeof value === 'object') {
    return value.name ?? value.user_id ?? JSON.stringify(value);
  }
  return String(value);
}

function normalizeTimestamp(value: unknown) {
  if (value == null) return undefined;
  // Prefer numeric timestamps; if seconds, convert to ms.
  const num = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof num === 'number') {
    return num < 1e12 ? num * 1000 : num;
  }
  return num;
}

function formatTimelineDate(value: unknown) {
  if (value == null) return undefined;
  const normalized = normalizeTimestamp(value);
  const date = typeof normalized === 'number' ? new Date(normalized) : new Date(String(normalized));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export default function ThesisTimeline({ events, evaluatorFiles, evaluatorRecommendations, isBlindReview, isAdmin }: ThesisTimelineProps) {
  return (
    <div className="relative">
      {events.map((event, index) => {
        const ActorIcon = actorIcons[event.actorRole];
        const isConceptIssued = event.status === "concept_issued";
        const showEvaluatorFeedback = (isConceptIssued || event.status === 'evaluation_submitted' || event.status === 'evaluator_thanks') && event.completed;
        const showRevisionFeedback = event.status === 'revision_submitted' && event.completed;

        return (
          <div
            key={
              `${
                typeof event.id === 'object' && event.id !== null
                  ? JSON.stringify(event.id)
                  : String(event.id)
              }-${index}`
            }
            className={cn("relative pl-10 pb-8 last:pb-0", "animate-fade-in")}
            style={{ animationDelay: `${index * 80}ms` }}
          >
            {/* Vertical line */}
            {index < events.length - 1 && (
              <div
                className={cn(
                  "absolute left-[15px] top-8 bottom-0 w-0.5",
                  event.completed ? "bg-success" : "bg-border"
                )}
              />
            )}

            {/* Dot */}
            <div
              className={cn(
                "absolute left-1.5 top-1 w-6 h-6 rounded-full flex items-center justify-center border-2",
                event.completed
                  ? "bg-success border-success text-success-foreground"
                  : event.active
                  ? "bg-accent border-accent text-accent-foreground animate-pulse-glow"
                  : "bg-muted border-border text-muted-foreground"
              )}
            >
              {event.completed ? (
                <Check className="w-3 h-3" />
              ) : event.active ? (
                <Clock className="w-3 h-3" />
              ) : (
                <Circle className="w-2 h-2" />
              )}
            </div>

            {/* Content card */}
            <div
              className={cn(
                "rounded-lg border p-4 transition-all",
                event.active
                  ? "bg-card shadow-elevated border-accent/30"
                  : event.completed
                  ? "bg-card shadow-card border-border"
                  : "bg-muted/50 border-border/50"
              )}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <h4
                  className={cn(
                    "font-heading font-semibold text-sm",
                    event.active ? "text-accent-foreground" : event.completed ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <span className="whitespace-pre-wrap">
                    {safeRender(event.label)}
                  </span>
                </h4>
                {event.date && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimelineDate(event.date)}
                  </span>
                )}
              </div>

              {event.actor && !isBlindReview && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <ActorIcon className="w-3 h-3" />
                  <span>
                    {safeRender(event.actor)}
                  </span>
                </div>
                )}

                {event.actor && isBlindReview && event.actorRole === "evaluator" && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                    <User className="w-3 h-3" />
                    <span>Evaluador (Par ciego)</span>
                  </div>
                )}

                {event.status === 'defense_scheduled' ? (
                <div className="mt-2 p-3 bg-info/10 rounded">
                  {(event.defense_date_display || event.defense_date) && (
                    <p className="text-sm">
                      <strong>Fecha y hora:</strong>{' '}
                      <span className="font-medium">{event.defense_date_display || formatTimelineDate(event.defense_date)}</span>
                    </p>
                  )}
                  {event.defense_location && (
                    <p className="text-sm">
                      <strong>Lugar:</strong>{' '}
                      <span className="font-medium">{safeRender(event.defense_location)}</span>
                    </p>
                  )}
                  {event.defense_info && (
                    <p className="text-sm">
                      <span className="font-medium">{safeRender(event.defense_info)}</span>
                    </p>
                  )}
                </div>
              ) : event.observations && (
                <p className="text-sm text-muted-foreground leading-relaxed">{safeRender(event.observations)}</p>
              )}

              {/* Show evaluator recommendations and files */}
              {showEvaluatorFeedback && (
                <div className="mt-3 space-y-3">
                  {(event.evaluatorRecommendations || evaluatorRecommendations) && (
                    <div className="bg-secondary/50 rounded-md p-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1.5">
                        <MessageSquare className="w-3 h-3" />
                        Recomendaciones del Evaluador
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {event.evaluatorRecommendations || evaluatorRecommendations}
                      </p>
                    </div>
                  )}
                  {(event.evaluatorFiles?.length > 0 || (evaluatorFiles && evaluatorFiles.length > 0)) && (
                    <div className="border border-border rounded-md p-3 bg-card">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2.5">
                        <Download className="w-3.5 h-3.5" />
                        Archivos del Evaluador
                      </div>
                      <div className="space-y-2">
                        {(event.evaluatorFiles || evaluatorFiles || []).map((file, i) => {
                          const isPdf = file.name?.toLowerCase().endsWith('.pdf');
                          const isDoc = file.name?.toLowerCase().match(/\.(doc|docx)$/);
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => downloadFile(file.url, file.name)}
                              className="flex items-center gap-2.5 p-2 rounded-md border border-border bg-secondary/30 hover:bg-accent/10 hover:border-accent/40 transition-all group w-full text-left"
                            >
                              <div className={`w-7 h-7 rounded flex items-center justify-center flex-shrink-0 ${isPdf ? 'bg-red-100 dark:bg-red-900/30' : isDoc ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                <svg className={`w-3.5 h-3.5 ${isPdf ? 'text-red-600 dark:text-red-400' : isDoc ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                              </div>
                              <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors truncate flex-1">{file.name}</span>
                              <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent flex-shrink-0 transition-colors" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* Per-criterion scores and observations */}
                  {event.evaluationScores && event.evaluationScores.length > 0 && (
                    <EvalScoresDetail scores={event.evaluationScores} evaluationType={event.evaluationType} />
                  )}
                </div>
              )}

              {/* Show student revision comments/files */}
              {showRevisionFeedback && (
                <div className="mt-3 space-y-3">
              {event.observations && (
                <div className="bg-secondary/50 rounded-md p-3">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1.5">
                    <MessageSquare className="w-3 h-3" />
                    Comentarios del Estudiante
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {event.observations}
                  </p>
                </div>
              )}
                  {event.revisionFiles && event.revisionFiles.length > 0 && (
                    <div className="border border-border rounded-md p-3 bg-card">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-2.5">
                        <Download className="w-3.5 h-3.5" />
                        Archivos de la revisión
                      </div>
                      <div className="space-y-2">
                        {event.revisionFiles.map((file, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => downloadFile(file.url, file.name)}
                            className="flex items-center gap-2.5 p-2 rounded-md border border-border bg-secondary/30 hover:bg-accent/10 hover:border-accent/40 transition-all group w-full text-left"
                          >
                            <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 bg-gray-100 dark:bg-gray-800">
                              <svg className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <span className="text-sm font-medium text-foreground group-hover:text-accent transition-colors truncate flex-1">{file.name}</span>
                            <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent flex-shrink-0 transition-colors" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {event.attachments && event.attachments.length > 0 && (
                <div className="mt-2 flex gap-2">
                  {event.attachments.map((file, i) => (
                    <span key={i} className="status-badge bg-secondary text-secondary-foreground">
                      <FileText className="w-3 h-3" />
                      {file}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {/* thank you message at completion */}
      {events.length > 0 && events[events.length - 1].status === 'evaluator_thanks' && (
        <div className="relative pl-10 pb-8 last:pb-0 animate-fade-in" style={{ animationDelay: `${events.length * 80}ms` }}>
          <div className="rounded-lg border p-4 bg-secondary/10">
            <p className="text-sm font-medium text-foreground">
              {isAdmin
                ? 'Recuerda a los evaluadores que actualicen su CVLAC tras finalizar sus evaluaciones.'
                : '¡Gracias por completar la evaluación! No olvides subir este trabajo a tu CVLAC.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Collapsible per-criterion scores and observations inside a timeline event */
function EvalScoresDetail({ scores, evaluationType }: { scores: any[]; evaluationType?: string }) {
  const [open, setOpen] = useState(false);
  const rubric = evaluationType === 'presentation' ? presentationRubric : defaultRubric;

  // Group scores by section
  const grouped: Record<string, any[]> = {};
  for (const sc of scores) {
    if (!grouped[sc.section_id]) grouped[sc.section_id] = [];
    grouped[sc.section_id].push(sc);
  }

  return (
    <div className="bg-secondary/50 rounded-md overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between p-3 text-left hover:bg-secondary/70 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xs font-medium text-foreground">Detalle por criterio</span>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {rubric.map((section) => {
            const sectionScores = grouped[section.id] || [];
            if (!sectionScores.length) return null;
            return (
              <div key={section.id}>
                <h5 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">
                  {sectionMap[section.id] || section.id}
                </h5>
                <div className="space-y-1.5">
                  {section.criteria.map((crit) => {
                    const sc = sectionScores.find((s: any) => s.criterion_id === crit.id);
                    if (!sc) return null;
                    const info = criterionMap[crit.id];
                    return (
                      <div key={crit.id} className="pl-2 border-l-2 border-muted">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-foreground">{info?.name || crit.id}</span>
                        </div>
                        {sc.observations && (
                          <div className="flex items-start gap-1 text-sm text-muted-foreground mt-0.5">
                            <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                            <span className="whitespace-pre-wrap">{sc.observations}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
