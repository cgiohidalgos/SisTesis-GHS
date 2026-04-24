import AppLayout from "@/components/layout/AppLayout";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiBase } from "@/lib/utils";
import { Users, Calendar } from "lucide-react";
import StatusBadge from "@/components/thesis/StatusBadge";

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
      <div className="max-w-4xl mx-auto px-4 sm:px-0">
        <div className="mb-6">
          <h2 className="font-heading text-2xl font-bold text-foreground mb-1">Mis estudiantes</h2>
          <p className="text-sm text-muted-foreground">
            Vista de seguimiento de los proyectos de tus estudiantes.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Cargando…</div>
        ) : theses.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tienes estudiantes asignados por el momento.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {theses.map((thesis) => {
              const studentNames = Array.isArray(thesis.students)
                ? thesis.students
                    .map((s: any) => (s.name || s.full_name || "").split(" ").slice(0, 2).join(" "))
                    .filter(Boolean)
                    .join(", ")
                : "";
              const programNames = Array.isArray(thesis.programs)
                ? thesis.programs.map((p: any) => p.name).join(", ")
                : "";
              return (
                <button
                  key={thesis.id}
                  className="w-full text-left bg-card rounded-lg border shadow-card hover:shadow-elevated transition-all duration-300 group"
                  onClick={() => navigate(`/evaluator/directed-thesis/${thesis.id}`)}
                >
                  <div className="p-5">
                    <div className="mb-3">
                      <h3 className="font-heading font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-2">
                        {thesis.title}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <StatusBadge status={thesis.status} />
                      {studentNames && (
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" />
                          {studentNames}
                        </span>
                      )}
                      {programNames && (
                        <span className="flex items-center gap-1.5">
                          📚 {programNames}
                        </span>
                      )}
                      {thesis.created_at && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {new Date(
                            thesis.created_at > 1e12
                              ? thesis.created_at
                              : thesis.created_at * 1000
                          ).toLocaleDateString("es-CO")}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
