import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";
import { toast } from "sonner";

export default function StudentRegister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    studentCode: "",
    cedula: "",
    password: "",
  });

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.studentCode || !form.cedula || !form.password) {
      toast.error("Todos los campos son obligatorios");
      return;
    }

    setLoading(true);
    try {
      // Use student code as email for auth (code@student.local)
      const email = `${form.studentCode}@student.evaltesis.local`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          data: {
            full_name: form.fullName,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        // Update profile with student data
        await supabase.from("profiles").update({
          full_name: form.fullName,
          student_code: form.studentCode,
          cedula: form.cedula,
        }).eq("id", data.user.id);

        // Assign student role
        await supabase.from("user_roles").insert({
          user_id: data.user.id,
          role: "student" as any,
        });

        toast.success("Registro exitoso. Bienvenido(a).");
        navigate("/student");
      }
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
            Crea tu cuenta para enviar y hacer seguimiento de tu tesis
          </p>
        </div>

        <form onSubmit={handleRegister} className="bg-card border rounded-xl shadow-card p-6 space-y-4">
          <div>
            <Label htmlFor="fullName">Nombre Completo</Label>
            <Input
              id="fullName"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="Juan David Martínez López"
            />
          </div>
          <div>
            <Label htmlFor="studentCode">Código Estudiantil</Label>
            <Input
              id="studentCode"
              value={form.studentCode}
              onChange={(e) => setForm({ ...form, studentCode: e.target.value })}
              placeholder="2020134567"
            />
          </div>
          <div>
            <Label htmlFor="cedula">Número de Cédula</Label>
            <Input
              id="cedula"
              value={form.cedula}
              onChange={(e) => setForm({ ...form, cedula: e.target.value })}
              placeholder="1098765432"
            />
          </div>
          <div>
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
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
