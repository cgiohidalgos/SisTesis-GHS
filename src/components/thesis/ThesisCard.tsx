import { Link } from "react-router-dom";
import { FileText, Users, Calendar } from "lucide-react";
import StatusBadge from "./StatusBadge";
import type { Thesis } from "@/lib/mock-data";

interface ThesisCardProps {
  thesis: Thesis;
  linkTo: string;
  evaluated?: boolean;
  evalCompleted?: boolean;
}

export default function ThesisCard({ thesis, linkTo, evaluated, evalCompleted }: ThesisCardProps) {
  return (
    <Link
      to={linkTo}
      className="block bg-card rounded-lg border shadow-card hover:shadow-elevated transition-all duration-300 group"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-heading font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-2">
            {thesis.title}
          </h3>
          <div className="flex items-center gap-2">
            {evalCompleted ? (
              <>
                <span className="text-xs bg-success/20 text-success px-2 py-0.5 rounded">Evaluación terminada</span>
                {/* when the evaluator has finished, the workflow has already moved past "Aprobada para Sustentación",
                    we don't need to show that status on the card anymore */}
              </>
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
              {thesis.programs.map((p:any) => p.name).join(", ")}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            {thesis.submittedAt}
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
                .map(d => new Date(d!).toLocaleDateString())
                .join(", ")}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
