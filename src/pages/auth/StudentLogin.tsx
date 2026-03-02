import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";

export default function StudentLogin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [studentCode, setStudentCode] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentCode || !password) {
      toast.error("Ingrese su código, cédula o correo y contraseña");
      return;
    }

    setLoading(true);
    try {
      // send the raw identifier (correo institucional, código o cédula)
      const resp = await fetch(`${import.meta.env.VITE_API_BASE || 'http://localhost:4000'}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: studentCode, password }),
      });
      if (!resp.ok) throw new Error('invalid credentials');
      const data = await resp.json();
      if (data.token) localStorage.setItem('token', data.token);
      toast.success("Bienvenido(a)");
      navigate("/student");
      // reload after navigation so AuthProvider picks up roles for current route
      window.location.reload();
    } catch (error: any) {
      toast.error("Código o contraseña incorrectos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl gradient-accent mb-4">
            <GraduationCap className="w-7 h-7 text-accent-foreground" />
          </div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Acceso Estudiante
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ingresa con tu código, cédula o correo
          </p>
        </div>

        <form onSubmit={handleLogin} className="bg-card border rounded-xl shadow-card p-6 space-y-4">
          <div>
            <Label htmlFor="code">Correo/Código/Cédula</Label>
            <Input
              id="code"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value)}
              placeholder="2020134567 o correo@uni.edu"
            />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Tu contraseña"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Ingresando..." : "Ingresar"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link to="/register/student" className="text-accent hover:underline font-medium">
              Regístrate aquí
            </Link>
          </p>
        </form>

        <div className="mt-4 text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
