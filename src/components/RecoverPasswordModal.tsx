import { useState } from "react";
import { getApiBase } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

interface RecoverPasswordModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RecoverPasswordModal({ open, onOpenChange }: RecoverPasswordModalProps) {
  const [cedula, setCedula] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [fullName, setFullName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cedula.trim() || !email.trim()) {
      toast.error("Ingresa tu cédula y correo institucional");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${getApiBase()}/auth/recover-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cedula: cedula.trim(), email: email.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast.error(data?.error || "Error al procesar la solicitud");
        return;
      }
      setSent(true);
      setFullName(data?.fullName || "");
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setCedula("");
      setEmail("");
      setSent(false);
      setFullName("");
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-muted-foreground" />
            <DialogTitle>Recuperar contraseña</DialogTitle>
          </div>
          <DialogDescription>
            Ingresa tu cédula y correo institucional registrado para recibir tus datos de acceso.
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="py-4 text-center space-y-3">
            <p className="text-sm text-foreground font-medium">
              ¡Solicitud enviada!
            </p>
            {fullName && (
              <p className="text-base font-bold tracking-wide uppercase text-foreground">
                {fullName}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Recibirás un correo con tus datos de acceso.
            </p>
            <p className="text-xs text-muted-foreground">
              ⚠️ Si no lo encuentras en tu bandeja de entrada, revisa la carpeta de <strong>spam o correo no deseado</strong>.
            </p>
            <Button className="w-full mt-2" onClick={() => handleClose(false)}>
              Cerrar
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div>
              <Label htmlFor="recover-cedula">Cédula</Label>
              <Input
                id="recover-cedula"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                placeholder="Tu número de cédula"
                autoComplete="off"
              />
            </div>
            <div>
              <Label htmlFor="recover-email">Correo institucional</Label>
              <Input
                id="recover-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@usbcali.edu.co"
                autoComplete="email"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Se enviará una contraseña temporal al correo registrado.
            </p>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" className="flex-1" onClick={() => handleClose(false)} disabled={loading}>
                Cancelar
              </Button>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "Enviando..." : "Enviar"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
