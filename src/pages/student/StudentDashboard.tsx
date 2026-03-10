import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

export default function StudentDashboard() {
  const [theses, setTheses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTheses = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`${API_BASE}/theses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) throw new Error("Error consultando tesis");
        const data = await resp.json();
        setTheses(data);
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
      <div className="max-w-3xl mx-auto px-4 sm:px-0">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
          Mi Tesis
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Consulta el estado y seguimiento de tu trabajo de grado.
        </p>

        {loading ? (
          <div className="text-center py-8">Cargando...</div>
        ) : theses.length === 0 ? (
          <div className="text-center py-8">
            <p className="mb-4">Aún no has registrado ninguna tesis.</p>
            <Button onClick={() => navigate("/student/register-thesis")}>Registrar Nueva Tesis</Button>
          </div>
        ) : (
          <>
            <ThesisCard thesis={theses[0]} linkTo="/student/timeline" />
            {theses[0].status === "draft" && (
              <div className="flex flex-wrap gap-3 mt-4">
                <Button
                  variant="default"
                  className="bg-green-600 hover:bg-green-700 text-white font-semibold"
                  onClick={async () => {
                    try {
                      const token = localStorage.getItem("token");
                      const resp = await fetch(`${API_BASE}/theses/${theses[0].id}/submit`, {
                        method: "PUT",
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      if (!resp.ok) throw new Error("Error enviando tesis");
                      toast.success("Tesis enviada a evaluación");
                      // recargar
                      setLoading(true);
                      const r2 = await fetch(`${API_BASE}/theses`, {
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      setTheses(await r2.json());
                    } catch (e:any) {
                      toast.error(e.message);
                    } finally {
                      setLoading(false);
                    }
                  }}
                >Enviar a evaluar</Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/student/register-thesis", { state: { thesis: theses[0] } })}
                >Modificar</Button>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (!confirm("¿Eliminar tesis? Esta acción no se puede deshacer.")) return;
                    try {
                      const token = localStorage.getItem("token");
                      const resp = await fetch(`${API_BASE}/theses/${theses[0].id}`, {
                        method: "DELETE",
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      if (!resp.ok) throw new Error("Error eliminando tesis");
                      toast.success("Tesis eliminada");
                      setTheses([]);
                    } catch (e:any) {
                      toast.error(e.message);
                    }
                  }}
                >Eliminar tesis</Button>
              </div>
            )}
            {/* Quick info (puedes adaptar según datos reales) */}
            {/* <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
              {[
                { label: "Estado", value: theses[0].status },
                { label: "Evaluadores", value: "2" },
                { label: "Enviada", value: theses[0].created_at },
                { label: "Eventos", value: "-" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-card rounded-lg border shadow-card p-4 text-center"
                >
                  <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
                  <p className="font-heading font-bold text-foreground">{stat.value}</p>
                </div>
              ))}
            </div> */}
          </>
        )}
      </div>
    </AppLayout>
  );
}
