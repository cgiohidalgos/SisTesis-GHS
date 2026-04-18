import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";

import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

export default function StudentRegister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    studentCode: "",
    cedula: "",
    institutionalEmail: "",
  });
    const [errors, setErrors] = useState<{ studentCode?: string; cedula?: string; institutionalEmail?: string }>({});
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // clear timer on unmount to avoid leaks
    useEffect(() => {
      return () => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
      };
    }, []);
    const checkUnique = async (field: 'studentCode' | 'cedula' | 'institutionalEmail', value: string) => {
    if (!value) return;
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (field === 'studentCode') params.set('student_code', value);
        else if (field === 'cedula') params.set('cedula', value);
        else if (field === 'institutionalEmail') params.set('institutional_email', value);
      const resp = await fetch(`${API_BASE}/users/check?${params.toString()}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (field === 'studentCode' && data.student_code) {
        setErrors((e) => ({ ...e, studentCode: 'Código ya registrado' }));
      } else if (field === 'studentCode') {
        setErrors((e) => ({ ...e, studentCode: undefined }));
      }
      if (field === 'cedula' && data.cedula) {
        setErrors((e) => ({ ...e, cedula: 'Cédula ya registrada' }));
      } else if (field === 'cedula') {
        setErrors((e) => ({ ...e, cedula: undefined }));
      }
      if (field === 'institutionalEmail' && data.institutional_email) {
        setErrors((e) => ({ ...e, institutionalEmail: 'Correo institucional ya registrado' }));
      } else if (field === 'institutionalEmail') {
        setErrors((e) => ({ ...e, institutionalEmail: undefined }));
      }
    } catch (e) {
      console.error('checkUnique error', e);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.studentCode || !form.cedula || !form.institutionalEmail) {
      toast.error("Todos los campos son obligatorios, incluido el correo institucional");
      return;
    }
    if (errors.studentCode || errors.cedula || errors.institutionalEmail) {
      toast.error("Corrige los errores antes de enviar");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          institutional_email: form.institutionalEmail,
          full_name: form.fullName,
          student_code: form.studentCode,
          cedula: form.cedula,
        }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'Error al registrarse');
      }
      const { user, token } = await resp.json();
      if (token) localStorage.setItem('token', token);
      toast.success("Registro exitoso. Bienvenido(a).");
      window.location.href = '/';
    } catch (error: any) {
      toast.error(error.message || "Error al registrarse");
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
            Registro Estudiante
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Crea tu cuenta para enviar y hacer seguimiento de tu proyecto de grado
          </p>
        </div>

        <form onSubmit={handleRegister} className="bg-card border rounded-xl shadow-card p-6 space-y-4">
          <div>
            <Label htmlFor="fullName">Nombre y Apellidos <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-semibold">Completo</span></Label>
            <Input
              id="fullName"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value.toUpperCase() })}
              placeholder="NOMBRE1 NOMBRE2 APELLIDO1 APELLIDO2"
            />
          </div>
          <div>
            <Label htmlFor="studentCode">Código Estudiantil <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-semibold">Completo</span></Label>
            <Input
              id="studentCode"
              value={form.studentCode}
              onChange={(e) => {
                const val = e.target.value;
                setForm({ ...form, studentCode: val });
                if (debounceTimer.current) clearTimeout(debounceTimer.current);
                debounceTimer.current = setTimeout(() => checkUnique('studentCode', val), 500);
              }}
              placeholder="30000088712"
            />
            {errors.studentCode && (
              <p className="text-red-500 text-sm mt-1">{errors.studentCode}</p>
            )}
          </div>
          <div>
            <Label htmlFor="cedula">Número de Cédula</Label>
            <Input
              id="cedula"
              value={form.cedula}
              onChange={(e) => {
                const val = e.target.value;
                setForm({ ...form, cedula: val });
                if (debounceTimer.current) clearTimeout(debounceTimer.current);
                debounceTimer.current = setTimeout(() => checkUnique('cedula', val), 500);
              }}
              placeholder="1098765432"
            />
            {errors.cedula && (
              <p className="text-red-500 text-sm mt-1">{errors.cedula}</p>
            )}
          </div>
          <div>
            <Label htmlFor="instEmail">Correo institucional</Label>
            <Input
              id="instEmail"
              type="email"
              value={form.institutionalEmail}
              onChange={(e) => {
                const val = e.target.value;
                setForm({ ...form, institutionalEmail: val });
                if (debounceTimer.current) clearTimeout(debounceTimer.current);
                debounceTimer.current = setTimeout(() => checkUnique('institutionalEmail', val), 500);
              }}
              placeholder="nombre@correo.usbcali.edu.co"
            />
            <p className="text-xs text-muted-foreground mt-2">
              La contraseña se enviará automáticamente a tu correo institucional.
            </p>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={loading || !!errors.studentCode || !!errors.cedula || !!errors.institutionalEmail}
          >
            {loading ? "Registrando..." : "Registrarse"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link to="/login/student" className="text-accent hover:underline font-medium">
              Inicia sesión
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
