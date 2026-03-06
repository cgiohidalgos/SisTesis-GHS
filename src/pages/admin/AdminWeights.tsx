import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Weights {
  doc: number;
  presentation: number;
}

import { getApiBase } from "@/lib/utils";
const API_BASE = getApiBase();

export default function AdminWeights() {
  const { user, isSuper } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const [weights, setWeights] = useState<Weights>({ doc: 70, presentation: 30 });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load programs (filtered by user's affiliation)
  useEffect(() => {
    const loadPrograms = async () => {
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`${API_BASE}/programs`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (resp.ok) {
          let data = await resp.json();
          
          // Filter programs: show all if superadmin, otherwise only programs where user is admin
          if (!isSuper && user?.id) {
            data = data.filter((p: any) =>
              Array.isArray(p.admin_user_ids) && p.admin_user_ids.includes(user.id)
            );
          }
          
          setPrograms(data);
          if (data.length > 0) {
            setSelectedProgram(data[0].id);
          }
        }
      } catch (err) {
        console.error("Error loading programs:", err);
      }
    };
    loadPrograms();
  }, [user, isSuper]);

  // Load weights for selected program
  useEffect(() => {
    if (!selectedProgram) return;
    const loadWeights = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`${API_BASE}/admin/program-weights/${selectedProgram}`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (resp.ok) {
          const data = await resp.json();
          setWeights({ doc: data.doc, presentation: data.presentation });
        } else {
          toast.error("Error cargando pesos");
        }
      } catch (err: any) {
        toast.error(err.message || "Error");
      } finally {
        setLoading(false);
      }
    };
    loadWeights();
  }, [selectedProgram]);

  const handleSave = async () => {
    if (!selectedProgram) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/admin/program-weights/${selectedProgram}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify(weights),
      });
      if (!resp.ok) throw new Error("Error guardando pesos");
      await resp.json();
      toast.success("Pesos actualizados");
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout role="admin">
      <div className="max-w-md mx-auto">
        <h2 className="font-heading text-2xl font-bold mb-2">Pesos de Evaluación</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Ajusta el porcentaje que corresponde a la evaluación del documento y a la
          exposición para este programa. La suma idealmente debe ser 100%.
        </p>

        {/* Program Selector */}
        {programs.length > 0 ? (
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">Programa</label>
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value)}
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
            >
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* Weights Inputs */}
        {loading ? (
          <p className="text-xs text-muted-foreground">Cargando...</p>
        ) : (
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-1">Porcentaje documento</label>
              <Input
                type="number"
                value={weights.doc}
                onChange={(e) => setWeights((w) => ({ ...w, doc: Number(e.target.value) }))}
                min={0}
                max={100}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Porcentaje exposición</label>
              <Input
                type="number"
                value={weights.presentation}
                onChange={(e) => setWeights((w) => ({ ...w, presentation: Number(e.target.value) }))}
                min={0}
                max={100}
              />
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving || !selectedProgram}>
          {saving ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </AppLayout>
  );
}
