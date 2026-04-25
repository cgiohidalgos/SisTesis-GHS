import { Link } from "react-router-dom";
import { FileText, Users, Calendar, AlertTriangle, Clock, UserCheck, Eye, EyeOff, Mail, ChevronDown } from "lucide-react";
import StatusBadge from "./StatusBadge";
import type { Thesis } from "@/lib/mock-data";
import { useState } from "react";

interface ThesisCardProps {
  thesis: Thesis;
  linkTo: string;
  evaluated?: boolean;
  evalCompleted?: boolean;
  hasActa?: boolean;
  showAssignedBy?: boolean;
  showEvaluatorAccordion?: boolean;
}

export default function ThesisCard({ thesis, linkTo, evaluated, evalCompleted, hasActa, showAssignedBy, showEvaluatorAccordion }: ThesisCardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [accordionOpen, setAccordionOpen] = useState(false);
  const [visibleEvaluators, setVisibleEvaluators] = useState<Record<number, boolean>>({});

  let urgency: 'overdue' | 'soon' | null = null;
  for (const e of thesis.evaluators) {
    if (!e.due_date) continue;
    const due = new Date((e.due_date as any) > 1e12 ? (e.due_date as any) : (e.due_date as any) * 1000);
    due.setHours(0, 0, 0, 0);
    const diffDays = (due.getTime() - today.getTime()) / 86400000;
    if (diffDays < 0) { urgency = 'overdue'; break; }
    if (diffDays <= 3) urgency = urgency === 'overdue' ? 'overdue' : 'soon';
  }

  const hasEvaluators = showEvaluatorAccordion && thesis.evaluators && thesis.evaluators.length > 0;

  return (
    <div className="bg-card rounded-lg border shadow-card hover:shadow-elevated transition-all duration-300 group">
      <Link to={linkTo} className="block p-5">
        {showAssignedBy && thesis.assigned_by_name && (
          <p className="text-[11px] text-muted-foreground mb-1.5">
            Asignado por: <span className="font-medium text-foreground">{thesis.assigned_by_name}</span>
          </p>
        )}
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-heading font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-2">
            {thesis.title}
          </h3>
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            {urgency === 'overdue' && (
              <span className="inline-flex items-center gap-1 text-xs bg-destructive/15 text-destructive px-2 py-0.5 rounded font-medium">
                <AlertTriangle className="w-3 h-3" />
                Vencido
              </span>
            )}
            {urgency === 'soon' && (
              <span className="inline-flex items-center gap-1 text-xs bg-warning/15 text-warning px-2 py-0.5 rounded font-medium">
                <Clock className="w-3 h-3" />
                Vence pronto
              </span>
            )}
            {evalCompleted ? (
              <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded">{hasActa ? 'Terminada con Acta' : 'Evaluación terminada'}</span>
            ) : evaluated ? (
              <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded">Evaluado</span>
            ) : null}
            {!evalCompleted && <StatusBadge status={thesis.status} />}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {thesis.students.map((s) => {
              if (!s.name) return '';
              return s.name.split(" ").slice(0, 2).join(" ");
            }).filter(Boolean).join(", ")}
          </span>
          {thesis.programs && thesis.programs.length > 0 && (
            <span className="flex items-center gap-1.5">
              📚
              {thesis.programs.map((p) => p.name).join(", ")}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {thesis.created_at
              ? new Date(
                  thesis.created_at > 1e12 ? thesis.created_at : thesis.created_at * 1000
                ).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
              : thesis.submittedAt}
          </span>
          {!showEvaluatorAccordion && thesis.evaluators.length > 0 && (
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              {thesis.evaluators.length} evaluador(es)
            </span>
          )}
          {!showEvaluatorAccordion && thesis.evaluators.some(e => e.due_date) && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {thesis.evaluators
                .map(e => e.due_date)
                .filter(Boolean)
                .map(d => {
                  const ms = (d as any) > 1e12 ? (d as any) : (d as any) * 1000;
                  return new Date(ms).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
                })
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", ")}
            </span>
          )}
        </div>
      </Link>

      {hasEvaluators && (
        <div className="px-5 pb-4 border-t border-border">
          <button
            onClick={() => setAccordionOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors w-full text-left pt-3"
          >
            <UserCheck className="w-3.5 h-3.5" />
            Evaluadores asignados ({thesis.evaluators.length})
            <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${accordionOpen ? "rotate-180" : ""}`} />
          </button>
          {accordionOpen && (
            <div className="mt-2 space-y-1.5">
              {thesis.evaluators.map((ev, i) => {
                const visible = !!visibleEvaluators[i];
                return (
                  <div key={i} className="text-xs text-muted-foreground pl-5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <button
                      onClick={() => setVisibleEvaluators(prev => ({ ...prev, [i]: !prev[i] }))}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      Ver datos del evaluador
                    </button>
                    {visible && (
                      <>
                        <span className="font-medium text-foreground">{ev.name}</span>
                        {(ev as any).institutional_email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" />
                            {(ev as any).institutional_email}
                          </span>
                        )}
                      </>
                    )}
                    {ev.due_date && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span style={{ color: (ev as any).has_evaluated ? "#16a34a" : "#e85d04" }} className="font-semibold">Fecha límite:</span>{" "}
                        {new Date((ev.due_date as any) > 1e12 ? (ev.due_date as any) : (ev.due_date as any) * 1000)
                          .toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
