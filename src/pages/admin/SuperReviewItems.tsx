import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface ReviewItem {
  id: string;
  label: string;
  sort_order: number;
}

import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

export default function SuperReviewItems() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/super/review-items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Error cargando elementos");
      const data = await resp.json();
      setItems(data);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar");
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleAdd = async () => {
    if (!newLabel.trim()) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/super/review-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label: newLabel.trim() }),
      });
      if (!resp.ok) throw new Error("Error creando elemento");
      const item = await resp.json();
      setItems((prev) => [...prev, item]);
      setNewLabel("");
    } catch (err: any) {
      toast.error(err.message || "Error al agregar");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id: string, label: string) => {
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/super/review-items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ label }),
      });
      if (!resp.ok) throw new Error("Error actualizando");
      await resp.json();
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, label } : it)));
    } catch (err: any) {
      toast.error(err.message || "Error al actualizar");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este elemento de revisión?")) return;
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/super/review-items/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Error eliminando");
      setItems((prev) => prev.filter((it) => it.id !== id));
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar");
    }
  };

  return (
    <AppLayout role="superadmin">
      <div className="max-w-md mx-auto">
        <h2 className="font-heading text-2xl font-bold mb-4">Checklist de Revisión</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Elementos que aparecen en la sección "Revisión" de la vista de proyectos de grado. Los administradores verán estas casillas.
        </p>
        <div className="space-y-3 mb-6">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-2">
              <Input
                value={it.label}
                onChange={(e) => handleUpdate(it.id, e.target.value)}
                className="flex-1"
              />
              <Button variant="destructive" size="sm" onClick={() => handleDelete(it.id)}>
                Eliminar
              </Button>
            </div>
          ))}
          {items.length === 0 && <p className="text-xs text-muted-foreground">No hay elementos definidos</p>}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Nuevo elemento"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <Button onClick={handleAdd} disabled={loading || !newLabel.trim()}>
            Agregar
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
