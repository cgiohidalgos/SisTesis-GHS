import { useState } from "react";
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
  email: string;
  specialty: string;
  theses: number;
}

const initialEvaluators: Evaluator[] = [
  { id: "1", name: "Dr. Carlos Pérez", email: "cperez@univ.edu", specialty: "Redes y Seguridad", theses: 3 },
  { id: "2", name: "Dra. Ana Rodríguez", email: "arodriguez@univ.edu", specialty: "Machine Learning", theses: 2 },
  { id: "3", name: "Dr. Roberto Sánchez", email: "rsanchez@univ.edu", specialty: "Sistemas de Información", theses: 4 },
  { id: "4", name: "Dra. Patricia Méndez", email: "pmendez@univ.edu", specialty: "IA en Salud", theses: 1 },
];

export default function AdminEvaluators() {
  const [evaluators, setEvaluators] = useState<Evaluator[]>(initialEvaluators);
  const [showRegister, setShowRegister] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [newEval, setNewEval] = useState({ name: "", email: "", specialty: "", password: "" });
  const [selectedEvaluators, setSelectedEvaluators] = useState<string[]>([]);
  const [isBlind, setIsBlind] = useState(false);

  const handleRegister = () => {
    if (!newEval.name || !newEval.email || !newEval.password) {
      toast.error("Nombre, correo y contraseña son obligatorios");
      return;
    }
    const ev: Evaluator = {
      id: String(evaluators.length + 1),
      name: newEval.name,
      email: newEval.email,
      specialty: newEval.specialty,
      theses: 0,
    };
    setEvaluators((prev) => [...prev, ev]);
    setNewEval({ name: "", email: "", specialty: "", password: "" });
    setShowRegister(false);
    toast.success(`Evaluador ${ev.name} registrado exitosamente`);
  };

  const toggleEvaluatorSelection = (id: string) => {
    setSelectedEvaluators((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : prev.length < 2 ? [...prev, id] : prev
    );
  };

  const handleAssign = () => {
    if (selectedEvaluators.length !== 2) {
      toast.error("Debe seleccionar exactamente 2 evaluadores");
      return;
    }
    const names = selectedEvaluators.map((id) => evaluators.find((e) => e.id === id)?.name).join(" y ");
    toast.success(`${names} asignados a la tesis${isBlind ? " (par ciego)" : ""}`);
    setSelectedEvaluators([]);
    setIsBlind(false);
    setShowAssign(false);
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
            <Dialog open={showRegister} onOpenChange={setShowRegister}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <UserPlus className="w-4 h-4 mr-1" />
                  Registrar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-heading">Registrar Nuevo Evaluador</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div>
                    <Label>Nombre Completo</Label>
                    <Input value={newEval.name} onChange={(e) => setNewEval({ ...newEval, name: e.target.value })} placeholder="Dr. Juan Pérez" />
                  </div>
                  <div>
                    <Label>Correo Institucional</Label>
                    <Input type="email" value={newEval.email} onChange={(e) => setNewEval({ ...newEval, email: e.target.value })} placeholder="jperez@univ.edu" />
                  </div>
                  <div>
                    <Label>Contraseña</Label>
                    <Input type="password" value={newEval.password} onChange={(e) => setNewEval({ ...newEval, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
                  </div>
                  <div>
                    <Label>Especialidad</Label>
                    <Input value={newEval.specialty} onChange={(e) => setNewEval({ ...newEval, specialty: e.target.value })} placeholder="Redes y Seguridad" />
                  </div>
                  <Button onClick={handleRegister} className="w-full">Registrar Evaluador</Button>
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
                  <DialogTitle className="font-heading">Asignar Evaluadores a Tesis</DialogTitle>
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
                            <p className="text-xs text-muted-foreground">{ev.specialty || ev.email}</p>
                          </div>
                          {isSelected && (
                            <span className="text-xs font-medium text-accent">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Blind review toggle */}
                  <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-3">
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
                    {ev.email}
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
            </div>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
