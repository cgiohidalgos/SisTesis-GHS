import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import StatusBadge from "@/components/thesis/StatusBadge";
import { getApiBase } from "@/lib/utils";
import { Users, BookOpen } from "lucide-react";

const API_BASE = getApiBase();

export default function AdminDirectedTheses() {
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
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto px-4 sm:px-0">
        <div className="mb-6">
          <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
            Mis Estudiantes
          </h2>
          <p className="text-sm text-muted-foreground">
            Proyectos de grado en los que estás asignado como director.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Cargando…</div>
        ) : theses.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tienes estudiantes asignados como director.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {theses.map((thesis) => {
              const studentNames = Array.isArray(thesis.students)
                ? thesis.students.map((s: any) => s.name || s.full_name).filter(Boolean).join(", ")
                : "";
              const programNames = Array.isArray(thesis.programs)
                ? thesis.programs.map((p: any) => p.name).join(", ")
                : "";
              return (
                <button
                  key={thesis.id}
                  className="w-full text-left border rounded-xl p-4 bg-card hover:border-primary/60 hover:shadow-sm transition-all"
                  onClick={() => navigate(`/admin/directed-thesis/${thesis.id}`)}
                >
                  <div className="flex flex-wrap items-start gap-2 mb-1">
                    <p className="font-semibold text-sm line-clamp-2 flex-1">{thesis.title}</p>
                    {thesis.status && <StatusBadge status={thesis.status} />}
                  </div>
                  {studentNames && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3 shrink-0" />
                      <strong>Estudiante{thesis.students?.length > 1 ? "s" : ""}:</strong>&nbsp;{studentNames}
                    </p>
                  )}
                  {programNames && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <BookOpen className="w-3 h-3 shrink-0" />
                      {programNames}
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
