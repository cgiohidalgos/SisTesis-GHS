import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface Weights {
  doc: number;
  presentation: number;
}

export default function SuperWeights() {
  const [weights, setWeights] = useState<Weights>({ doc: 70, presentation: 30 });
  const [loading, setLoading] = useState(false);

  const fetchWeights = async () => {
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:4000'}/super/weights`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Error cargando pesos");
      const data = await resp.json();
      setWeights({ doc: data.doc, presentation: data.presentation });
    } catch (err: any) {
      toast.error(err.message || "No se pudo obtener los pesos");
    }
  };

  useEffect(() => {
    fetchWeights();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:4000'}/super/weights`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(weights),
      });
      if (!resp.ok) throw new Error("Error guardando pesos");
      await resp.json();
      toast.success("Pesos actualizados");
    } catch (err: any) {
      toast.error(err.message || "No se pudo guardar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout role="superadmin">
      <div className="max-w-md mx-auto">
        <h2 className="font-heading text-2xl font-bold mb-4">Pesos de Evaluación</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Ajusta el porcentaje que corresponde a la evaluación del documento y a la
          exposición. La suma idealmente debe ser 100%.
        </p>
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
        <Button onClick={handleSave} disabled={loading}>Guardar</Button>
      </div>
    </AppLayout>
  );
}
