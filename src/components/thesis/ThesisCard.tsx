import { Link } from "react-router-dom";
import { FileText, Users, Calendar, AlertTriangle, Clock } from "lucide-react";
import StatusBadge from "./StatusBadge";
import type { Thesis } from "@/lib/mock-data";

interface ThesisCardProps {
  thesis: Thesis;
  linkTo: string;
  evaluated?: boolean;
  evalCompleted?: boolean;
  hasActa?: boolean;
  showAssignedBy?: boolean;
}

export default function ThesisCard({ thesis, linkTo, evaluated, evalCompleted, hasActa, showAssignedBy }: ThesisCardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let urgency: 'overdue' | 'soon' | null = null;
  for (const e of thesis.evaluators) {
    if (!e.due_date) continue;
    const due = new Date((e.due_date as any) > 1e12 ? (e.due_date as any) : (e.due_date as any) * 1000);
    due.setHours(0, 0, 0, 0);
    const diffDays = (due.getTime() - today.getTime()) / 86400000;
    if (diffDays < 0) { urgency = 'overdue'; break; }
    if (diffDays <= 3) urgency = urgency === 'overdue' ? 'overdue' : 'soon';
  }

  return (
    <Link
      to={linkTo}
      className="block bg-card rounded-lg border shadow-card hover:shadow-elevated transition-all duration-300 group"
    >
      <div className="p-5">
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
          {thesis.evaluators.length > 0 && (
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              {thesis.evaluators.length} evaluador(es)
            </span>
          )}
          {thesis.evaluators.some(e=>e.due_date) && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {thesis.evaluators
                .map(e => e.due_date)
                .filter(Boolean)
                .map(d => {
                  const ms = d! > 1e12 ? d! : d! * 1000;
                  return new Date(ms).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
                })
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(", ")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
