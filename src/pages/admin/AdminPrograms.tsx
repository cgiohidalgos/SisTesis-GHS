import { useEffect, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, EyeOff, Users, CalendarRange, GraduationCap, ChevronRight, X, Check } from "lucide-react";
import { getApiBase } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

const API_BASE = getApiBase();

interface Program {
  id: string;
  name: string;
  admin_user_ids?: string[];
  reception_start?: string;
  reception_end?: string;
  max_evaluators?: number;
  hidden?: boolean;
}

interface Admin {
  id: string;
  full_name: string;
  institutional_email: string;
}

const EMPTY_FORM = { name: "", adminIds: [] as string[], receptionStart: null as string | null, receptionEnd: null as string | null, maxEvaluators: 2 };

export default function AdminPrograms() {
  const { user, isSuper } = useAuth();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showAdminPicker, setShowAdminPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchPrograms = async () => {
    try {
      const token = localStorage.getItem("token");
      const headers = { Authorization: `Bearer ${token}` };
      const [r1, r2] = await Promise.all([
        fetch(`${API_BASE}/programs`, { headers }),
        fetch(`${API_BASE}/users?role=admin`, { headers }),
      ]);
      if (r2.ok) setAdmins(await r2.json());
      if (!r1.ok) throw new Error("Error cargando programas");
      const data: Program[] = await r1.json();
      setPrograms(data);
    } catch (err: any) {
      toast.error(err.message || "Error al cargar programas");
    }
  };

  useEffect(() => { fetchPrograms(); }, [user, isSuper]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  };

  const openEdit = (p: Program) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      adminIds: p.admin_user_ids || [],
      receptionStart: p.reception_start || null,
      receptionEnd: p.reception_end || null,
      maxEvaluators: p.max_evaluators || 2,
    });
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const payload: any = {
        name: form.name.trim(),
        reception_start: form.receptionStart,
        reception_end: form.receptionEnd,
        max_evaluators: form.maxEvaluators,
      };
      if (form.adminIds.length) payload.admin_user_ids = form.adminIds;
      const url = editingId ? `${API_BASE}/programs/${editingId}` : `${API_BASE}/programs`;
      const method = editingId ? "PUT" : "POST";
      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || "Error guardando programa");
      }
      const prog: Program = await resp.json();
      if (editingId) {
        setPrograms(ps => ps.map(p => p.id === prog.id ? prog : p));
        toast.success("Programa actualizado");
      } else {
        setPrograms(ps => [...ps, prog]);
        toast.success("Programa creado");
      }
      closePanel();
    } catch (err: any) {
      toast.error(err.message || "Error al guardar programa");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleHidden = async (id: string) => {
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/programs/${id}/toggle-hidden`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Error actualizando visibilidad");
      const { hidden } = await resp.json();
      setPrograms(ps => ps.map(p => p.id === id ? { ...p, hidden } : p));
      toast.success(hidden ? "Programa ocultado" : "Programa visible");
    } catch (err: any) {
      toast.error(err.message || "Error al cambiar visibilidad");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este programa? Esta acción no se puede deshacer.")) return;
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/programs/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error("Error eliminando programa");
      setPrograms(ps => ps.filter(p => p.id !== id));
      toast.success("Programa eliminado");
      if (editingId === id) closePanel();
    } catch (err: any) {
      toast.error(err.message || "Error al eliminar programa");
    }
  };

  const toggleAdmin = (id: string) =>
    setForm(f => ({ ...f, adminIds: f.adminIds.includes(id) ? f.adminIds.filter(x => x !== id) : [...f.adminIds, id] }));

  const isReceptionOpen = (p: Program) => {
    if (!p.reception_start || !p.reception_end) return null;
    const now = new Date().toISOString().slice(0, 10);
    if (now < p.reception_start) return "upcoming";
    if (now > p.reception_end) return "closed";
    return "open";
  };

  return (
    <AppLayout role="admin">
      <div className="max-w-3xl mx-auto px-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground">Programas</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {programs.length} programa{programs.length !== 1 ? "s" : ""} configurado{programs.length !== 1 ? "s" : ""}
            </p>
          </div>
          {isSuper && (
            <Button onClick={openCreate} className="gap-2">
              <Plus className="w-4 h-4" />
              Nuevo programa
            </Button>
          )}
        </div>

        {/* Program cards */}
        {programs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-12 text-center">
            <GraduationCap className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-muted-foreground">
              {isSuper ? "No hay programas creados aún." : "No estás asignado a ningún programa."}
            </p>
            {isSuper && (
              <Button onClick={openCreate} variant="outline" size="sm" className="mt-4 gap-2">
                <Plus className="w-3.5 h-3.5" /> Crear el primero
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {programs.map(p => {
              const reception = isReceptionOpen(p);
              const assignedAdmins = (p.admin_user_ids || []).map(id => admins.find(a => a.id === id)).filter(Boolean) as Admin[];
              return (
                <div
                  key={p.id}
                  className={`group bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden ${p.hidden ? "opacity-60" : ""}`}
                >
                  <div className="flex items-start gap-4 p-4">
                    {/* Icon */}
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <GraduationCap className="w-5 h-5 text-primary" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground text-sm">{p.name}</h3>
                        {p.hidden && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Oculto</span>
                        )}
                        {reception === "open" && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success/15 text-success border border-success/30">Recepción abierta</span>
                        )}
                        {reception === "upcoming" && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-info/15 text-info border border-info/30">Próxima apertura</span>
                        )}
                        {reception === "closed" && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Recepción cerrada</span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          {p.max_evaluators ?? 2} evaluadores
                        </span>
                        {p.reception_start && p.reception_end && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarRange className="w-3 h-3" />
                            {p.reception_start} → {p.reception_end}
                          </span>
                        )}
                      </div>

                      {assignedAdmins.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {assignedAdmins.map(a => (
                            <span key={a.id} className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent-foreground border border-accent/20">
                              {a.full_name || a.institutional_email}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleToggleHidden(p.id)}
                        title={p.hidden ? "Mostrar" : "Ocultar"}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        {p.hidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => openEdit(p)}
                        title="Editar"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {isSuper && (
                        <button
                          onClick={() => handleDelete(p.id)}
                          title="Eliminar"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 ml-1" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit / Create panel (Dialog) */}
      <Dialog open={panelOpen} onOpenChange={open => { if (!open) closePanel(); }}>
        <DialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg">
              {editingId ? "Editar programa" : "Nuevo programa"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Nombre del programa</label>
              <Input
                placeholder="Ej. Ingeniería de Sistemas"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && handleSave()}
                autoFocus
              />
            </div>

            {/* Max evaluators */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Cantidad de evaluadores</label>
              <div className="flex gap-2">
                {[2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setForm(f => ({ ...f, maxEvaluators: n }))}
                    className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                      form.maxEvaluators === n
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Reception period */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Período de recepción</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Inicio</p>
                  <DatePicker
                    value={form.receptionStart}
                    onChange={val => setForm(f => ({ ...f, receptionStart: val }))}
                    placeholder="Fecha inicio"
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fin</p>
                  <DatePicker
                    value={form.receptionEnd}
                    onChange={val => setForm(f => ({ ...f, receptionEnd: val }))}
                    placeholder="Fecha fin"
                  />
                </div>
              </div>
            </div>

            {/* Admins */}
            {isSuper && admins.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Administradores asignados</label>
                <div
                  className="border border-border rounded-lg p-1 cursor-pointer hover:border-primary/40 transition-colors"
                  onClick={() => setShowAdminPicker(true)}
                >
                  {form.adminIds.length === 0 ? (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      Seleccionar administradores...
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 p-1">
                      {form.adminIds.map(id => {
                        const a = admins.find(x => x.id === id);
                        return (
                          <span key={id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20">
                            {a?.full_name || a?.institutional_email || id}
                            <X
                              className="w-3 h-3 cursor-pointer hover:text-destructive"
                              onClick={e => { e.stopPropagation(); toggleAdmin(id); }}
                            />
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={loading || !form.name.trim()} className="flex-1">
                {loading ? "Guardando..." : editingId ? "Guardar cambios" : "Crear programa"}
              </Button>
              <Button variant="outline" onClick={closePanel}>
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin picker dialog */}
      <Dialog open={showAdminPicker} onOpenChange={setShowAdminPicker}>
        <DialogContent className="max-w-sm w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle className="font-heading">Seleccionar administradores</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 mt-2 max-h-72 overflow-y-auto">
            {admins.map(a => {
              const selected = form.adminIds.includes(a.id);
              return (
                <button
                  key={a.id}
                  onClick={() => toggleAdmin(a.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 transition-all text-left ${
                    selected ? "border-primary bg-primary/8" : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary">
                      {(a.full_name || a.institutional_email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{a.full_name || a.institutional_email}</p>
                    {a.full_name && <p className="text-xs text-muted-foreground truncate">{a.institutional_email}</p>}
                  </div>
                  {selected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                </button>
              );
            })}
          </div>
          <Button className="w-full mt-3" onClick={() => setShowAdminPicker(false)}>
            Confirmar selección
          </Button>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
