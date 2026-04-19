import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getApiBase } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { User as UserIcon, Mail, Shield, UserPlus, Pencil, Trash2, IdCard, Hash, Send } from "lucide-react";

interface User {
  id: string;
  full_name: string;
  student_code?: string;
  cedula?: string;
  institutional_email?: string;
  roles: string[];
  program_ids?: string[];
}

const API_BASE = getApiBase();

const ROLE_LABELS: Record<string, string> = {
  student: "Estudiante",
  evaluator: "Evaluador",
  admin: "Admin",
  superadmin: "Superadmin",
};

const ROLE_COLORS: Record<string, string> = {
  student: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  evaluator: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  superadmin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [programs, setPrograms] = useState<{id:string;name:string}[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [filter, setFilter] = useState("");
  const [programSearch, setProgramSearch] = useState("");
  const [form, setForm] = useState<any>({
    password: "",
    full_name: "",
    student_code: "",
    cedula: "",
    institutional_email: "",
    roles: ["student"] as string[],
    program_ids: [] as string[],
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sendingCredentials, setSendingCredentials] = useState<string | null>(null);

  const { isSuper, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/super/users`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (resp.ok) {
        const data = await resp.json();
        setUsers(data);
      } else if (resp.status === 403 || resp.status === 401) {
        toast.error("No autorizado para gestionar usuarios");
        navigate("/admin");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchPrograms = async () => {
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/programs`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (resp.ok) {
        const data = await resp.json();
        setPrograms(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!authLoading && !isSuper) {
      toast.error("Sólo los superadministradores pueden acceder a esta sección");
      navigate("/admin");
    }
  }, [isSuper, authLoading, navigate]);

  useEffect(() => {
    fetchUsers();
    fetchPrograms();
  }, []);

  if (!authLoading && !isSuper) {
    return null;
  }

  const resetForm = () => {
    setForm({
      password: "",
      full_name: "",
      student_code: "",
      cedula: "",
      institutional_email: "",
      roles: ["student"],
      program_ids: [],
    });
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!form.full_name) {
      toast.error("Nombre completo es obligatorio");
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const payload: any = {
        full_name: form.full_name,
        student_code: form.student_code || undefined,
        cedula: form.cedula || undefined,
        institutional_email: form.institutional_email || undefined,
        roles: form.roles,
        program_ids: form.roles.includes('admin') ? (form.program_ids || []) : [],
      };
      if (!editingId || form.password) payload.password = form.password;

      let resp;
      if (editingId) {
        resp = await fetch(`${API_BASE}/super/users/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
          body: JSON.stringify(payload),
        });
      } else {
        payload.password = form.password;
        resp = await fetch(`${API_BASE}/super/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
          body: JSON.stringify(payload),
        });
      }
      if (!resp.ok) {
        if (resp.status === 403 || resp.status === 401) {
          toast.error("No autorizado para modificar usuarios");
          navigate("/admin");
          return;
        }
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || "Error guardando usuario");
      }
      toast.success(editingId ? "Usuario actualizado" : "Usuario creado");
      resetForm();
      setShowDialog(false);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (u: User) => {
    setEditingId(u.id);
    setForm({
      password: "",
      full_name: u.full_name,
      student_code: u.student_code || "",
      cedula: u.cedula || "",
      institutional_email: u.institutional_email || "",
      roles: u.roles.length > 0 ? u.roles : ["student"],
      program_ids: u.program_ids || [],
    });
    setShowDialog(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este usuario? Esta acción es irreversible.")) return;
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/super/users/${id}`, {
        method: "DELETE",
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!resp.ok) {
        if (resp.status === 403 || resp.status === 401) {
          toast.error("No autorizado para eliminar usuarios");
          navigate("/admin");
          return;
        }
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "Error eliminando usuario");
      }
      toast.success("Usuario eliminado");
      fetchUsers();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSendCredentials = async (u: User) => {
    if (!confirm(`¿Enviar credenciales de acceso a ${u.full_name} (${u.institutional_email})?`)) return;
    setSendingCredentials(u.id);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/users/${u.id}/send-credentials`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || 'Error enviando credenciales');
      }
      toast.success(`Credenciales enviadas a ${u.institutional_email}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingCredentials(null);
    }
  };

  const filteredUsers = users.filter((u) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [u.full_name, u.institutional_email, u.cedula, u.student_code, ...u.roles]
      .some((field) => field?.toLowerCase().includes(q));
  });

  return (
    <AppLayout role="superadmin">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground mb-1">Gestión de Usuarios</h2>
            <p className="text-sm text-muted-foreground">
              Administra todos los usuarios del sistema: estudiantes, evaluadores y administradores.
            </p>
          </div>
          <Dialog open={showDialog} onOpenChange={(open) => {
            setShowDialog(open);
            if (!open) { resetForm(); setProgramSearch(""); }
          }}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <UserPlus className="w-4 h-4 mr-1" />
                Crear usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading">
                  {editingId ? "Editar Usuario" : "Crear Nuevo Usuario"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div>
                  <Label>Nombre Completo</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value.toUpperCase() })} placeholder="JUAN PÉREZ" />
                </div>
                <div>
                  <Label>Correo Institucional</Label>
                  <Input type="email" value={form.institutional_email} onChange={(e) => setForm({ ...form, institutional_email: e.target.value })} placeholder="usuario@usbcali.edu.co" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Código</Label>
                    <Input value={form.student_code} onChange={(e) => setForm({ ...form, student_code: e.target.value })} placeholder="2020134567" />
                  </div>
                  <div>
                    <Label>Cédula</Label>
                    <Input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })} placeholder="12345678" />
                  </div>
                </div>
                <div>
                  <Label>{editingId ? "Contraseña (dejar en blanco para no cambiar)" : "Contraseña"}</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingId ? "Sin cambios" : "Contraseña"}
                    required={!editingId}
                  />
                </div>
                <div>
                  <Label>Roles</Label>
                  <div className="flex flex-wrap gap-3 mt-2">
                    {(["student", "evaluator", "admin", "superadmin"] as const).map((r) => (
                      <label key={r} className={`flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 rounded-full border-2 transition-all ${
                        form.roles.includes(r)
                          ? "border-accent bg-accent/10 font-medium"
                          : "border-border hover:border-accent/30"
                      }`}>
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={form.roles.includes(r)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...form.roles, r]
                              : form.roles.filter((x: string) => x !== r);
                            setForm({ ...form, roles: next, program_ids: next.includes('admin') ? form.program_ids : [] });
                          }}
                        />
                        {ROLE_LABELS[r]}
                      </label>
                    ))}
                  </div>
                </div>
                {form.roles.includes('admin') && (
                  <div>
                    <Label>Programas asignados</Label>
                    <div className="mt-2 border rounded-lg overflow-hidden">
                      <div className="p-2 border-b bg-muted/30">
                        <Input
                          placeholder="Buscar programa..."
                          value={programSearch}
                          onChange={(e) => setProgramSearch(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="overflow-y-auto max-h-48 p-2 flex flex-col gap-1">
                        {programs
                          .filter((p) => p.name.toLowerCase().includes(programSearch.toLowerCase()))
                          .map((p) => (
                            <label key={p.id} className={`flex items-center gap-2 cursor-pointer text-sm px-3 py-2 rounded-md border transition-all ${
                              form.program_ids.includes(p.id)
                                ? "border-accent bg-accent/10 font-medium"
                                : "border-transparent hover:bg-muted/50"
                            }`}>
                              <input
                                type="checkbox"
                                className="accent-primary w-4 h-4 shrink-0"
                                checked={form.program_ids.includes(p.id)}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? [...form.program_ids, p.id]
                                    : form.program_ids.filter((x: string) => x !== p.id);
                                  setForm({ ...form, program_ids: next });
                                }}
                              />
                              <span className="leading-tight">{p.name}</span>
                            </label>
                          ))}
                        {programs.filter((p) => p.name.toLowerCase().includes(programSearch.toLowerCase())).length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-3">Sin resultados</p>
                        )}
                      </div>
                      {form.program_ids.length > 0 && (
                        <div className="px-3 py-1.5 border-t bg-muted/20 text-xs text-muted-foreground">
                          {form.program_ids.length} programa{form.program_ids.length !== 1 ? 's' : ''} seleccionado{form.program_ids.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <Button onClick={handleSubmit} className="w-full" disabled={saving}>
                  {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Crear Usuario"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search */}
        <div className="mb-4">
          <Input
            placeholder="Buscar por nombre, correo, cédula, código o rol..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {/* Content */}
        {loadingUsers ? (
          <div className="text-center py-10 text-muted-foreground">Cargando usuarios...</div>
        ) : users.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-muted-foreground">No hay usuarios registrados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredUsers.map((u) => (
              <div
                key={u.id}
                className="bg-card rounded-lg border shadow-card p-5 hover:shadow-elevated transition-shadow"
              >
                {/* Avatar + Name + Email */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserIcon className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-heading font-semibold text-foreground text-sm truncate">{u.full_name}</h4>
                    {u.institutional_email && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Mail className="w-3 h-3 shrink-0" />
                        {u.institutional_email}
                      </p>
                    )}
                  </div>
                </div>

                {/* Details */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                  {u.cedula && (
                    <span className="flex items-center gap-1">
                      <IdCard className="w-3 h-3" />
                      {u.cedula}
                    </span>
                  )}
                  {u.student_code && (
                    <span className="flex items-center gap-1">
                      <Hash className="w-3 h-3" />
                      {u.student_code}
                    </span>
                  )}
                </div>

                {/* Role badges */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {u.roles.map((r) => (
                    <span
                      key={r}
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[r] || "bg-secondary text-secondary-foreground"}`}
                    >
                      {ROLE_LABELS[r] || r}
                    </span>
                  ))}
                  {u.program_ids && u.program_ids.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                      <Shield className="w-3 h-3 inline mr-0.5" />
                      {u.program_ids.map(pid => programs.find(p => p.id === pid)?.name || pid).join(", ")}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => handleEdit(u)}>
                    <Pencil className="w-3 h-3 mr-1" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                    disabled={sendingCredentials === u.id || !u.institutional_email}
                    onClick={() => handleSendCredentials(u)}
                  >
                    <Send className="w-3 h-3 mr-1" />
                    {sendingCredentials === u.id ? 'Enviando...' : 'Enviar acceso'}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(u.id)}>
                    <Trash2 className="w-3 h-3 mr-1" />
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
