import AppLayout from "@/components/layout/AppLayout";
import StatusBadge from "@/components/thesis/StatusBadge";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiBase } from "@/lib/utils";
import { Users } from "lucide-react";

const API_BASE = getApiBase();

export default function EvaluatorMyStudents() {
  const navigate = useNavigate();
  const [theses, setTheses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/theses/directed`, {
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    })
      .then((r) => r.json())
      .then((data) => setTheses(Array.isArray(data) ? data : []))
      .catch(() => setTheses([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout role="evaluator">
      <div className="max-w-3xl mx-auto px-4 sm:px-0">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">Mis estudiantes</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Vista de seguimiento de los proyectos de tus estudiantes.
        </p>

        {loading ? (
          <p className="text-center text-muted-foreground">Cargando…</p>
        ) : theses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tienes estudiantes asignados por el momento.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {theses.map((thesis) => {
              const studentNames = Array.isArray(thesis.students)
                ? thesis.students.map((s: any) => s.name || s.full_name).filter(Boolean).join(", ")
                : "";
              return (
                <button
                  key={thesis.id}
                  className="w-full text-left border rounded-xl p-4 bg-white dark:bg-slate-950 hover:border-primary/60 hover:shadow-sm transition-all"
                  onClick={() => navigate(`/evaluator/directed-thesis/${thesis.id}`)}
                >
                  <div className="flex flex-wrap items-start gap-2 mb-1">
                    <p className="font-semibold text-sm line-clamp-2 flex-1">{thesis.title}</p>
                    {thesis.status && <StatusBadge status={thesis.status} />}
                  </div>
                  {studentNames && (
                    <p className="text-xs text-muted-foreground">
                      <strong>Estudiante{thesis.students?.length > 1 ? "s" : ""}:</strong> {studentNames}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
