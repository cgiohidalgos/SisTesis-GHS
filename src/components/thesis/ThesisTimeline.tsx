import { Check, Clock, Circle, FileText, User, Shield, Download, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/lib/mock-data";

interface ThesisTimelineProps {
  events: TimelineEvent[];
  evaluatorFiles?: { name: string; url: string }[];
  evaluatorRecommendations?: string;
  isBlindReview?: boolean;
}

const actorIcons = {
  admin: Shield,
  evaluator: User,
  system: FileText,
};

export default function ThesisTimeline({ events, evaluatorFiles, evaluatorRecommendations, isBlindReview }: ThesisTimelineProps) {
  return (
    <div className="relative">
      {events.map((event, index) => {
        const ActorIcon = actorIcons[event.actorRole];
        const isConceptIssued = event.status === "concept_issued";

        return (
          <div
            key={event.id}
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
                  {event.label}
                </h4>
                {event.date && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{event.date}</span>
                )}
              </div>

              {event.actor && !isBlindReview && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <ActorIcon className="w-3 h-3" />
                  <span>{event.actor}</span>
                </div>
              )}

              {event.actor && isBlindReview && event.actorRole === "evaluator" && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                  <User className="w-3 h-3" />
                  <span>Evaluador (Par ciego)</span>
                </div>
              )}

              {event.observations && (
                <p className="text-sm text-muted-foreground leading-relaxed">{event.observations}</p>
              )}

              {/* Show evaluator recommendations and files on concept_issued */}
              {isConceptIssued && event.completed && (
                <div className="mt-3 space-y-3">
                  {evaluatorRecommendations && (
                    <div className="bg-secondary/50 rounded-md p-3">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground mb-1.5">
                        <MessageSquare className="w-3 h-3" />
                        Recomendaciones del Evaluador
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {evaluatorRecommendations}
                      </p>
                    </div>
                  )}

                  {evaluatorFiles && evaluatorFiles.length > 0 && (
                    <div className="bg-secondary/50 rounded-md p-3">
                      <p className="text-xs font-medium text-foreground mb-2">Archivos del Evaluador</p>
                      <div className="space-y-1.5">
                        {evaluatorFiles.map((file, i) => (
                          <a
                            key={i}
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-accent hover:underline"
                          >
                            <Download className="w-3 h-3" />
                            {file.name}
                          </a>
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
    </div>
  );
}
