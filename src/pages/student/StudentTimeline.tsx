import AppLayout from "@/components/layout/AppLayout";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import StatusBadge from "@/components/thesis/StatusBadge";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function StudentTimeline() {
  const [thesis, setThesis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTheses = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:4000'}/theses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error("Error consultando tesis");
        let data = await resp.json();
        if (data && data[0] && data[0].timeline && Array.isArray(data[0].timeline)) {
          data[0].timeline = data[0].timeline.map((e: any) => ({
            ...e,
            date: e.date ? new Date(e.date).toLocaleString() : undefined,
          }));
        }
        setThesis(data[0] || null);
      } catch (err: any) {
        toast.error(err.message || "Error consultando tesis");
      } finally {
        setLoading(false);
      }
    };
    fetchTheses();
  }, []);

  return (
    <AppLayout role="student">
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="text-center py-8">Cargando...</div>
        ) : !thesis ? (
          <div className="text-center py-8">
            <p className="mb-4">Aún no has registrado ninguna tesis.</p>
            <button className="btn" onClick={() => navigate("/student/register-thesis")}>Registrar Nueva Tesis</button>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="font-heading text-2xl font-bold text-foreground">
                  Seguimiento de mi Tesis
                </h2>
                <StatusBadge status={thesis.status} />
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {thesis.title}
              </p>
              {thesis.students && thesis.students.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Autor{thesis.students.length>1?'es':''}:</strong> {thesis.students.map((s:any)=>s.name).join(', ')}
                </p>
              )}
              {thesis.directors && thesis.directors.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Director{thesis.directors.length>1?'es':''}:</strong> {thesis.directors.join(', ')}
                </p>
              )}
              {thesis.evaluators && thesis.evaluators.length > 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Evaluadores asignados:</strong>{' '}
                  {thesis.evaluators.some((e:any)=>e.is_blind) ? (
                    <em>pares ciegos</em>
                  ) : (
                    thesis.evaluators.map((e:any)=>e.name).join(', ')
                  )}
                </p>
              )}
              {thesis.defense_date && (
                <p className="text-sm text-muted-foreground mt-2">
                  <strong>Sustentación:</strong> {new Date(thesis.defense_date).toLocaleString()} {thesis.defense_location ? `en ${thesis.defense_location}` : ''}
                  {thesis.defense_info && ` – ${thesis.defense_info}`}
                </p>
              )}
              {thesis.status !== 'draft' && (
                <p className="mt-2 text-sm text-red-600">
                  ⚠️ La tesis ya fue enviada a evaluación y no puede modificarse.
                </p>
              )}
            </div>
            {thesis.files && thesis.files.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold mb-2">Documentos enviados</h3>
                <ul className="space-y-1">
                  {thesis.files.map((f:any) => (
                    <li key={f.id}>
                      <a href={`${API_BASE}${f.file_url}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                        {f.file_name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ThesisTimeline
              events={thesis.timeline || []}
              isBlindReview={thesis.evaluators && thesis.evaluators.some((e:any)=>e.is_blind)}
              isAdmin={false}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}
