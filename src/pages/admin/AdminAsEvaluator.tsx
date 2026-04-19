import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import StatusBadge from "@/components/thesis/StatusBadge";
import { getApiBase } from "@/lib/utils";
import { FileText, Users, Calendar, Clock, Eye, EyeOff } from "lucide-react";

const API_BASE = getApiBase();

export default function AdminAsEvaluator() {
  const navigate = useNavigate();
  const [theses, setTheses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    fetch(`${API_BASE}/theses/as-evaluator`, {
      headers: { Authorization: token ? `Bearer ${token}` : "" },
    })
      .then((r) => r.json())
      .then((data) => setTheses(Array.isArray(data) ? data : []))
      .catch(() => setTheses([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto px-4 sm:px-0">
        <div className="mb-6">
          <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
            Por Evaluar
          </h2>
          <p className="text-sm text-muted-foreground">
            Proyectos de grado en los que estás asignado como evaluador.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Cargando…</div>
        ) : theses.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tienes proyectos asignados para evaluar.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {theses.map((thesis) => (
              <button
                key={thesis.id}
                onClick={() => navigate(`/admin/theses/${thesis.id}`)}
                className="w-full text-left bg-card rounded-lg border shadow-card hover:shadow-elevated transition-all duration-300 group"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-heading font-semibold text-foreground group-hover:text-accent transition-colors line-clamp-2">
                      {thesis.title}
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                      {thesis.is_blind ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded">
                          <EyeOff className="w-3 h-3" /> Par ciego
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded">
                          <Eye className="w-3 h-3" /> Abierto
                        </span>
                      )}
                      <StatusBadge status={thesis.status} />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    {thesis.students?.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        {thesis.students
                          .map((s: any) => s.name?.split(" ").slice(0, 2).join(" "))
                          .filter(Boolean)
                          .join(", ")}
                      </span>
                    )}
                    {thesis.programs?.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        📚 {thesis.programs.map((p: any) => p.name).join(", ")}
                      </span>
                    )}
                    {thesis.due_date && (
                      <span className="flex items-center gap-1.5 text-amber-600">
                        <Clock className="w-3.5 h-3.5" />
                        Fecha límite:{" "}
                        {new Date(
                          thesis.due_date > 1e12 ? thesis.due_date : thesis.due_date * 1000
                        ).toLocaleDateString("es-CO")}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {thesis.created_at
                        ? new Date(
                            thesis.created_at > 1e12
                              ? thesis.created_at
                              : thesis.created_at * 1000
                          ).toLocaleDateString("es-CO")
                        : ""}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
