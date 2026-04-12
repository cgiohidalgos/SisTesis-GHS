import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { getApiBase } from "@/lib/utils";

interface ReviewItem {
  id: string;
  label: string;
  sort_order: number;
}

const API_BASE = getApiBase();

export default function AdminReviewItems() {
  const { user, isSuper } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<string>("");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [addingItem, setAddingItem] = useState(false);
  const [editingLabels, setEditingLabels] = useState<Record<string, string>>({});

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

  // Load review items for selected program
  useEffect(() => {
    if (!selectedProgram) return;
    const loadItems = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");
        const resp = await fetch(`${API_BASE}/admin/program-review-items/${selectedProgram}`, {
          headers: { Authorization: token ? `Bearer ${token}` : "" },
        });
        if (resp.ok) {
          const data = await resp.json();
          setItems(data);
          setEditingLabels(Object.fromEntries(data.map((i: ReviewItem) => [i.id, i.label])));
        } else {
          toast.error("Error cargando elementos");
        }
      } catch (err: any) {
        toast.error(err.message || "Error");
      } finally {
        setLoading(false);
      }
    };
    loadItems();
  }, [selectedProgram]);

  const handleAddItem = async () => {
    if (!newLabel.trim() || !selectedProgram) return;
    setAddingItem(true);
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/admin/program-review-items/${selectedProgram}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ label: newLabel.trim(), sort_order: items.length }),
      });
      if (!resp.ok) throw new Error("Error creando elemento");
      const item = await resp.json();
      setItems((prev) => [...prev, item]);
      setEditingLabels((prev) => ({ ...prev, [item.id]: item.label }));
      setNewLabel("");
      toast.success("Elemento agregado");
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setAddingItem(false);
    }
  };

  const handleUpdateItem = async (id: string) => {
    const label = editingLabels[id];
    if (label === undefined) return;
    const original = items.find((it) => it.id === id)?.label;
    if (label === original) return;
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/admin/program-review-items/${selectedProgram}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ label }),
      });
      if (!resp.ok) throw new Error("Error actualizando");
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, label } : it)));
      toast.success("Actualizado");
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("¿Eliminar este elemento?")) return;
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/admin/program-review-items/${selectedProgram}/${id}`, {
        method: "DELETE",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!resp.ok) throw new Error("Error eliminando");
      setItems((prev) => prev.filter((it) => it.id !== id));
      toast.success("Eliminado");
    } catch (err: any) {
      toast.error(err.message || "Error");
    }
  };

  return (
    <AppLayout role="admin">
      <div className="max-w-2xl mx-auto">
        <h2 className="font-heading text-2xl font-bold mb-2">Elementos de Revisión</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Define los elementos de revisión que los evaluadores verán para este programa.
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

        {/* Items List */}
        <div className="space-y-3 mb-6">
          {loading ? (
            <p className="text-xs text-muted-foreground">Cargando...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground">No hay elementos definidos</p>
          ) : (
            items.map((it) => (
              <div key={it.id} className="flex items-center gap-2">
                <Input
                  value={editingLabels[it.id] ?? it.label}
                  onChange={(e) => setEditingLabels((prev) => ({ ...prev, [it.id]: e.target.value }))}
                  onBlur={() => handleUpdateItem(it.id)}
                  className="flex-1 text-sm"
                />
                <Button variant="destructive" size="sm" onClick={() => handleDeleteItem(it.id)}>
                  Eliminar
                </Button>
              </div>
            ))
          )}
        </div>

        {/* Add New Item */}
        <div className="flex gap-2">
          <Input
            placeholder="Nuevo elemento"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleAddItem} disabled={addingItem || !newLabel.trim() || !selectedProgram}>
            {addingItem ? "Agregando..." : "Agregar"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
