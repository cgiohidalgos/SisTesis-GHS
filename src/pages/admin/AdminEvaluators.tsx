import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();
import AppLayout from "@/components/layout/AppLayout";
import { User, Mail, BookOpen, Plus, EyeOff, UserPlus, Send, AlertTriangle, RefreshCw } from "lucide-react";
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
  cedula?: string;
  specialty: string;
  theses: number;
}

interface EvaluatedThesis {
  id: string;
  title: string;
  status: string;
  assigned_at: number;
  due_date?: number;
  is_blind: number;
  student_names?: string;
}

export default function AdminEvaluators() {
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [loadingEvaluators, setLoadingEvaluators] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [selectedEvaluatorId, setSelectedEvaluatorId] = useState<string | null>(null);
  const [evaluatedTheses, setEvaluatedTheses] = useState<EvaluatedThesis[]>([]);
  const [loadingEvaluatedTheses, setLoadingEvaluatedTheses] = useState(false);
  const [thesisId, setThesisId] = useState<string | null>(null);
  const [thesisInfo, setThesisInfo] = useState<any>(null);
  const [newEval, setNewEval] = useState({ name: "", institutionalEmail: "", specialty: "", password: "", cedula: "" });
  const [filter, setFilter] = useState("");
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>([]);
  const [isBlind, setIsBlind] = useState(true);
  const [dueDate, setDueDate] = useState<string>("");
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const handleRegister = async () => {
    if (!newEval.name || !newEval.institutionalEmail) {
      toast.error("Nombre y correo institucional son obligatorios");
      return;
    }
    if (!editingId && !newEval.cedula) {
      toast.error("Cédula es obligatoria para registrar un evaluador");
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
        // only include cedula if explicitly provided to avoid overwriting existing value
        if (newEval.cedula) payload.cedula = newEval.cedula;
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
            full_name: newEval.name,
            specialty: newEval.specialty,
            cedula: newEval.cedula,
          }),
        });
      }
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || (editingId ? 'Error actualizando evaluador' : 'Error creando evaluador'));
      }
      const created = await resp.json();
      await fetchEvaluators();
      setNewEval({ name: "", institutionalEmail: "", specialty: "", password: "", cedula: "" });
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
    setLoadingEvaluators(true);
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
        cedula: u.cedula || '',
        specialty: u.specialty || '',
        theses: u.theses || 0,
      }));
      if (mapped.length) {
        setEvaluators(mapped);
      }
    } catch (err) {
      console.error('fetchEvaluators', err);
      setEvaluators(simulatedEvaluators);
    } finally {
      setLoadingEvaluators(false);
    }
  };

  const fetchEvaluatedTheses = async (evaluatorId: string) => {
    setLoadingEvaluatedTheses(true);
    setSelectedEvaluatorId(evaluatorId);
    setEvaluatedTheses([]);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/evaluator/${evaluatorId}/evaluated-theses`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) {
        const errorBody = await resp.json().catch(() => null);
        throw new Error(errorBody?.error || 'No se pudieron cargar los proyectos de grado evaluados');
      }
      const list = await resp.json();
      setEvaluatedTheses(list);
    } catch (err: any) {
      console.error('fetchEvaluatedTheses', err);
      toast.error(err?.message || 'Error cargando los proyectos de grado evaluados');
    } finally {
      setLoadingEvaluatedTheses(false);
    }
  };

  const handleAssign = async () => {
    if (selectedEvaluators.length !== 2) {
      toast.error("Debe seleccionar exactamente 2 evaluadores");
      return;
    }
    if (!dueDate) {
      toast.error("La fecha límite es obligatoria");
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
    toast.success(`${names} asignados al proyecto de grado${isBlind ? " (par ciego)" : ""}`);
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
      cedula: u.cedula || "",
    });
    setShowRegister(true);
  };

  const filteredEvaluators = evaluators.filter((ev) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return [ev.name, ev.institutionalEmail, ev.cedula, ev.specialty]
      .some((field) => field?.toLowerCase().includes(q));
  });

  const [sendingCredentials, setSendingCredentials] = useState<string | null>(null);

  const handleSendCredentials = async (ev: Evaluator) => {
    if (!confirm(`¿Enviar credenciales de acceso a ${ev.name} (${ev.institutionalEmail})?`)) return;
    setSendingCredentials(ev.id);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/users/${ev.id}/send-credentials`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || 'Error enviando credenciales');
      }
      toast.success(`Credenciales enviadas a ${ev.institutionalEmail}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSendingCredentials(null);
    }
  };

  const [deleteEvalModal, setDeleteEvalModal] = useState<{ id: string; name: string } | null>(null);
  const [evalCaptchaCode, setEvalCaptchaCode] = useState('');
  const [evalCaptchaInput, setEvalCaptchaInput] = useState('');
  const [evalDeleting, setEvalDeleting] = useState(false);
  const evalCanvasRef = useRef<HTMLCanvasElement>(null);

  const generateEvalCaptcha = useCallback(() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setEvalCaptchaCode(code);
    setEvalCaptchaInput('');
    setTimeout(() => {
      const canvas = evalCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = `hsl(${Math.random()*360},50%,60%)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.stroke();
      }
      const fonts = ['bold 28px monospace', 'bold 26px serif', 'bold 28px sans-serif'];
      for (let i = 0; i < code.length; i++) {
        ctx.save();
        ctx.font = fonts[i % fonts.length];
        ctx.fillStyle = `hsl(${Math.random()*60+200},60%,35%)`;
        ctx.translate(20 + i * 30, 38);
        ctx.rotate((Math.random() - 0.5) * 0.4);
        ctx.fillText(code[i], 0, 0);
        ctx.restore();
      }
    }, 0);
  }, []);

  const openDeleteEvalModal = (ev: Evaluator) => {
    setDeleteEvalModal({ id: ev.id, name: ev.name });
    generateEvalCaptcha();
  };

  const handleDeleteEvaluator = async () => {
    if (!deleteEvalModal) return;
    if (evalCaptchaInput.toUpperCase() !== evalCaptchaCode) {
      toast.error('El código ingresado no coincide. Intenta de nuevo.');
      generateEvalCaptcha();
      return;
    }
    setEvalDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/users/${deleteEvalModal.id}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('Error eliminando evaluador');
      toast.success('Evaluador eliminado');
      setDeleteEvalModal(null);
      fetchEvaluators();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setEvalDeleting(false);
    }
  };

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground mb-1">Evaluadores</h2>
            <p className="text-sm text-muted-foreground">
              Profesores registrados como evaluadores de proyectos de grado.
            </p>
          </div>
          <div className="flex gap-2">
            {/* Register new evaluator */}
            <Dialog open={showRegister} onOpenChange={(open) => {
              setShowRegister(open);
              if (!open) {
                // reset when dialog closes
                setNewEval({ name: "", institutionalEmail: "", specialty: "", password: "", cedula: "" });
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
                    <Label>Cédula</Label>
                    <Input value={newEval.cedula} onChange={(e) => setNewEval({ ...newEval, cedula: e.target.value })} placeholder="12345678" />
                    {!editingId && (
                      <p className="text-xs text-muted-foreground mt-1">
                        La contraseña se generará automáticamente como <span className="font-mono">primer_nombre+cedula</span> y se enviará al correo.
                      </p>
                    )}
                  </div>
                  {editingId && (
                    <div>
                      <Label>Contraseña (dejar en blanco para no cambiar)</Label>
                      <Input type="password" value={newEval.password} onChange={(e) => setNewEval({ ...newEval, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
                    </div>
                  )}
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
                  Asignar al proyecto de grado
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
                <div className="mb-4">
                  <h3 className="font-heading text-2xl font-bold">Evaluadores</h3>
                  <p className="text-sm text-muted-foreground">Profesores registrados como evaluadores de proyectos de grado.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setShowRegister(true)}>
                      Registrar
                    </Button>
                    <Button size="sm" onClick={handleAssign} disabled={selectedEvaluators.length !== 2}>
                      Asignar al proyecto de grado
                    </Button>
                  </div>
                </div>

                <DialogHeader>
                  <DialogTitle className="font-heading">
                    Asignar Evaluadores {thesisInfo ? `a: ${thesisInfo.title}` : 'al proyecto de grado'}
                  </DialogTitle>
                </DialogHeader>
                <div className="mt-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Seleccione exactamente 2 evaluadores ({selectedEvaluators.length}/2)
                  </p>

                  <Input
                    placeholder="Buscar evaluadores..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="w-full"
                  />

                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {filteredEvaluators.map((ev) => {
                      const isSelected = selectedEvaluators.includes(ev.id);
                      const directorNamesUpper = (thesisInfo?.directors || []).map((d: any) => (typeof d === 'string' ? d : d?.name || '').toUpperCase());
                      const isDirector = directorNamesUpper.includes((ev.name || '').toUpperCase());
                      return (
                        <button
                          key={ev.id}
                          onClick={() => !isDirector && toggleEvaluatorSelection(ev.id)}
                          disabled={isDirector}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                            isDirector
                              ? "border-red-200 bg-red-50 opacity-60 cursor-not-allowed"
                              : isSelected
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
                            {isDirector && (
                              <p className="text-xs text-red-500 font-medium mt-0.5">Director(a) de esta tesis — no puede ser evaluador(a)</p>
                            )}
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
                      <Label>Fecha límite <span className="text-destructive">*</span></Label>
                      <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} className={`border px-2 py-1 rounded ${!dueDate ? 'border-destructive' : ''}`} />
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
                    disabled={selectedEvaluators.length !== 2 || !dueDate}
                  >
                    Asignar Evaluadores
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="mb-4">
          <Input
            placeholder="Buscar evaluador..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {loadingEvaluators ? (
          <div className="text-center py-10">Cargando evaluadores...</div>
        ) : evaluators.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm text-muted-foreground">No hay evaluadores registrados.</p>
            <p className="text-sm text-muted-foreground">Puedes registrar uno usando el botón "Registrar".</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredEvaluators.map((ev) => (
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
                  <button 
                    onClick={() => fetchEvaluatedTheses(ev.id)}
                    className="status-badge bg-secondary text-secondary-foreground hover:bg-secondary/80 cursor-pointer transition-colors"
                  >
                    {ev.theses} proyectos
                  </button>
                </div>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => handleEditEvaluator(ev)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                    disabled={sendingCredentials === ev.id}
                    onClick={() => handleSendCredentials(ev)}
                  >
                    <Send className="w-3 h-3 mr-1" />
                    {sendingCredentials === ev.id ? 'Enviando...' : 'Enviar acceso'}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => openDeleteEvalModal(ev)}>
                    Eliminar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal para mostrar proyectos evaluados */}
        <Dialog open={selectedEvaluatorId !== null} onOpenChange={(open) => {
          if (!open) setSelectedEvaluatorId(null);
        }}>
          <DialogContent className="max-w-2xl w-[calc(100vw-2rem)]">
            <DialogHeader>
              <DialogTitle className="font-heading">
                Proyectos evaluados por {evaluators.find(e => e.id === selectedEvaluatorId)?.name || 'Evaluador'}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
              {loadingEvaluatedTheses ? (
                <p className="text-sm text-muted-foreground text-center py-4">Cargando proyectos...</p>
              ) : evaluatedTheses.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay proyectos evaluados aún
                </p>
              ) : (
                evaluatedTheses.map((thesis) => (
                  <div key={thesis.id} className="border rounded-lg p-4 hover:bg-secondary/50 transition-colors">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-foreground text-sm flex-1">{thesis.title}</h4>
                        <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary whitespace-nowrap">
                          {thesis.status}
                        </span>
                      </div>
                      {thesis.student_names && (
                        <p className="text-xs text-muted-foreground">
                          <strong>Estudiante:</strong> {thesis.student_names}
                        </p>
                      )}
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          Asignada: {new Date(thesis.assigned_at * 1000).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        {thesis.is_blind === 1 && (
                          <span className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-700 dark:text-yellow-300">
                            Par Ciego
                          </span>
                        )}
                      </div>
                      {thesis.due_date && (
                        <p className="text-xs text-muted-foreground">
                          <strong>Fecha límite:</strong> {new Date(thesis.due_date * 1000).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de confirmación con captcha para eliminar evaluador */}
        {deleteEvalModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="bg-card border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center gap-3 text-destructive">
                <AlertTriangle className="w-7 h-7 shrink-0" />
                <h3 className="text-lg font-bold">¿Eliminar este evaluador?</h3>
              </div>
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm space-y-1">
                <p className="font-semibold text-destructive">⚠️ Esta acción es irreversible.</p>
                <p className="text-muted-foreground">Se eliminará permanentemente a <strong>{deleteEvalModal.name}</strong> y toda su información asociada:</p>
                <ul className="list-disc list-inside text-muted-foreground space-y-0.5 mt-1">
                  <li>Cuenta de acceso al sistema</li>
                  <li>Historial de evaluaciones realizadas</li>
                  <li>Asignaciones a proyectos activos</li>
                  <li>Firmas de actas registradas</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Escribe el código que aparece para confirmar:</p>
                <div className="flex items-center gap-2">
                  <canvas ref={evalCanvasRef} width={210} height={54} className="rounded border bg-slate-100" />
                  <button type="button" onClick={generateEvalCaptcha} className="p-1.5 rounded hover:bg-muted" title="Nuevo código">
                    <RefreshCw className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                <Input
                  value={evalCaptchaInput}
                  onChange={e => setEvalCaptchaInput(e.target.value.toUpperCase())}
                  placeholder="Escribe el código aquí"
                  className="font-mono tracking-widest uppercase"
                  maxLength={6}
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') handleDeleteEvaluator(); }}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="outline" className="flex-1" onClick={() => { setDeleteEvalModal(null); setEvalCaptchaInput(''); }} disabled={evalDeleting}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDeleteEvaluator}
                  disabled={evalDeleting || evalCaptchaInput.length < 6}
                >
                  {evalDeleting ? 'Eliminando…' : 'Eliminar definitivamente'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
