import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
import AppLayout from "@/components/layout/AppLayout";
import { User, Mail, BookOpen, Plus, EyeOff, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface Evaluator {
  id: string;
  name: string;
  institutionalEmail: string;
  specialty: string;
  theses: number;
}

// start with empty list; actual evaluators come from backend
const initialEvaluators: Evaluator[] = [];

export default function AdminEvaluators() {
  const [evaluators, setEvaluators] = useState<Evaluator[]>(initialEvaluators);
  const [showRegister, setShowRegister] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [thesisId, setThesisId] = useState<string | null>(null);
  const [thesisInfo, setThesisInfo] = useState<any>(null);
  const [newEval, setNewEval] = useState({ name: "", institutionalEmail: "", specialty: "", password: "" });
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>([]);
  const [isBlind, setIsBlind] = useState(false);
  const [dueDate, setDueDate] = useState<string>("");
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const handleRegister = async () => {
    if (!newEval.name || !newEval.institutionalEmail || (!editingId && !newEval.password)) {
      toast.error("Nombre, correo institucional y contraseña (para nuevo) son obligatorios");
      return;
    }
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No autorizado, inicia sesión de nuevo');
      let resp;
      if (editingId) {
        // update existing evaluator
        const payload: any = {
          full_name: newEval.name,
          institutional_email: newEval.institutionalEmail,
          specialty: newEval.specialty,
        };
        if (newEval.password) payload.password = newEval.password;
        resp = await fetch(`${API_BASE}/users/${editingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify(payload),
        });
      } else {
        resp = await fetch(`${API_BASE}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : '',
          },
          body: JSON.stringify({
            institutional_email: newEval.institutionalEmail,
            password: newEval.password,
            full_name: newEval.name,
            specialty: newEval.specialty,
          }),
        });
      }
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || (editingId ? 'Error actualizando evaluador' : 'Error creando evaluador'));
      }
      const created = await resp.json();
      await fetchEvaluators();
      setNewEval({ name: "", institutionalEmail: "", specialty: "", password: "" });
      setEditingId(null);
      setShowRegister(false);
      toast.success(editingId ? "Evaluador actualizado" : `Evaluador ${created.full_name || newEval.name} registrado exitosamente`);
    } catch (e: any) {
      toast.error(e.message || (editingId ? 'Error actualizando evaluador' : 'Error creando evaluador'));
    }
  };

  const toggleEvaluatorSelection = (id: string) => {
    setSelectedEvaluators((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : prev.length < 2 ? [...prev, id] : prev
    );
  };

  const fetchEvaluators = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/users?role=evaluator`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('No se pudieron cargar evaluadores');
      const list = await resp.json();
      // map to Evaluator interface
      const mapped: Evaluator[] = list.map((u: any) => ({
        id: u.id,
        name: u.full_name || '',
        institutionalEmail: u.institutional_email || '',
        specialty: u.specialty || '',
        theses: u.theses || 0,
      }));
      setEvaluators(mapped);
    } catch (err) {
      console.error('fetchEvaluators', err);
    }
  };

  const handleAssign = async () => {
    if (selectedEvaluators.length !== 2) {
      toast.error("Debe seleccionar exactamente 2 evaluadores");
      return;
    }
    if (thesisId) {
      // use batch assignment endpoint
      try {
        const token = localStorage.getItem('token');
        const payload: any = { evaluator_ids: selectedEvaluators, is_blind: isBlind ? 1 : 0 };
        if (dueDate) payload.due_date = dueDate;
        const resp = await fetch(`${API_BASE}/theses/${thesisId}/assign-evaluators`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error('assignment failed');
        toast.success('Evaluadores asignados');
        setSelectedEvaluators([]);
        setIsBlind(false);
        setDueDate("");
        setShowAssign(false);
        navigate('/admin/theses', { state: { msg: 'Evaluadores asignados' } });
      } catch (e: any) {
        toast.error(e.message);
      }
      return;
    }
    const names = selectedEvaluators.map((id) => evaluators.find((e) => e.id === id)?.name).join(" y ");
    toast.success(`${names} asignados a la tesis${isBlind ? " (par ciego)" : ""}`);
    setSelectedEvaluators([]);
    setIsBlind(false);
    setShowAssign(false);
  };

  useEffect(() => {
    // load evaluators list initially
    fetchEvaluators();
    const tid = search.get('thesis');
    if (tid) {
      setThesisId(tid);
      setShowAssign(true);
      // optionally fetch thesis info for display
      fetch(`${API_BASE}/theses/${tid}`, { headers: { Authorization: localStorage.getItem('token') ? `Bearer ${localStorage.getItem('token')}` : '' } })
        .then(r => r.json())
        .then(setThesisInfo)
        .catch(() => {});
    }
  }, [search]);

  const handleEditEvaluator = (u: Evaluator) => {
    setEditingId(u.id);
    setNewEval({
      name: u.name,
      institutionalEmail: u.institutionalEmail,
      specialty: u.specialty,
      password: "",
    });
    setShowRegister(true);
  };

  const handleDeleteEvaluator = async (id: string) => {
    if (!confirm("¿Eliminar este evaluador? Esta acción no se puede deshacer.")) return;
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('Error eliminando evaluador');
      toast.success('Evaluador eliminado');
      fetchEvaluators();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground mb-1">Evaluadores</h2>
            <p className="text-sm text-muted-foreground">
              Profesores registrados como evaluadores de tesis.
            </p>
          </div>
          <div className="flex gap-2">
            {/* Register new evaluator */}
            <Dialog open={showRegister} onOpenChange={(open) => {
              setShowRegister(open);
              if (!open) {
                // reset when dialog closes
                setNewEval({ name: "", institutionalEmail: "", specialty: "", password: "" });
                setEditingId(null);
              }
            }}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <UserPlus className="w-4 h-4 mr-1" />
                  {editingId ? 'Editar' : 'Registrar'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-heading">{editingId ? 'Editar Evaluador' : 'Registrar Nuevo Evaluador'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Nombre Completo</Label>
                    <Input value={newEval.name} onChange={(e) => setNewEval({ ...newEval, name: e.target.value })} placeholder="Dr. Juan Pérez" />
                  </div>
                  <div>
                    <Label>Correo Institucional</Label>
                    <Input type="email" value={newEval.institutionalEmail} onChange={(e) => setNewEval({ ...newEval, institutionalEmail: e.target.value })} placeholder="jperez@univ.edu" />
                  </div>
                  <div>
                    <Label>{editingId ? 'Contraseña (dejar en blanco para no cambiar)' : 'Contraseña'}</Label>
                    <Input type="password" value={newEval.password} onChange={(e) => setNewEval({ ...newEval, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
                  </div>
                  <div>
                    <Label>Especialidad</Label>
                    <Input value={newEval.specialty} onChange={(e) => setNewEval({ ...newEval, specialty: e.target.value })} placeholder="Redes y Seguridad" />
                  </div>
                  <Button onClick={handleRegister} className="w-full">{editingId ? 'Guardar cambios' : 'Registrar Evaluador'}</Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Assign evaluators */}
            <Dialog open={showAssign} onOpenChange={setShowAssign}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="w-4 h-4 mr-1" />
                  Asignar a Tesis
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle className="font-heading">
                    Asignar Evaluadores {thesisInfo ? `a: ${thesisInfo.title}` : 'a Tesis'}
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Seleccione exactamente 2 evaluadores ({selectedEvaluators.length}/2)
                  </p>

                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {evaluators.map((ev) => {
                      const isSelected = selectedEvaluators.includes(ev.id);
                      return (
                        <button
                          key={ev.id}
                          onClick={() => toggleEvaluatorSelection(ev.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                            isSelected
                              ? "border-accent bg-accent/10"
                              : "border-border hover:border-accent/30"
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{ev.name}</p>
                            <p className="text-xs text-muted-foreground">{ev.specialty || ev.institutionalEmail}</p>
                          </div>
                          {isSelected && (
                            <span className="text-xs font-medium text-accent">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Due date and blind review toggle */}
                  <div className="flex items-center gap-4">
                    <div>
                      <Label>Fecha límite</Label>
                      <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className="border px-2 py-1 rounded" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-3 mt-2">
                    <div className="flex items-center gap-2">
                      <EyeOff className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium text-foreground">Par Ciego</p>
                        <p className="text-xs text-muted-foreground">El estudiante no sabrá quién lo evaluó</p>
                      </div>
                    </div>
                    <Switch checked={isBlind} onCheckedChange={setIsBlind} />
                  </div>

                  <Button
                    onClick={handleAssign}
                    className="w-full"
                    disabled={selectedEvaluators.length !== 2}
                  >
                    Asignar Evaluadores
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {evaluators.map((ev) => (
            <div
              key={ev.id}
              className="bg-card rounded-lg border shadow-card p-5 hover:shadow-elevated transition-shadow"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-heading font-semibold text-foreground text-sm">{ev.name}</h4>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {ev.institutionalEmail}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  {ev.specialty}
                </span>
                <span className="status-badge bg-secondary text-secondary-foreground">{ev.theses} tesis</span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleEditEvaluator(ev)}>
                  Editar
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleDeleteEvaluator(ev.id)}>
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
