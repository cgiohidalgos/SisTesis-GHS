import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import { FileText, Users, CheckCircle2, Clock } from "lucide-react";
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

export default function AdminDashboard() {
  const [stats, setStats] = useState<any[]>([]);
  const [theses, setTheses] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [sresp, tresp] = await Promise.all([
        fetch(`${API_BASE}/admin/stats`, { headers: { Authorization: token ? `Bearer ${token}` : '' } }),
        fetch(`${API_BASE}/theses`, { headers: { Authorization: token ? `Bearer ${token}` : '' } }),
      ]);
      if (sresp.ok) {
        const sjson = await sresp.json();
        setStats([
          { label: 'Total Tesis', value: sjson.totalTheses, icon: FileText, color: 'text-info' },
          { label: 'En Evaluación', value: sjson.inEvaluation, icon: Clock, color: 'text-warning' },
          { label: 'Finalizadas', value: sjson.finalized, icon: CheckCircle2, color: 'text-success' },
          { label: 'Evaluadores', value: sjson.evaluators, icon: Users, color: 'text-accent' },
        ]);
      }
      if (tresp.ok) {
        const tjson = await tresp.json();
        setTheses(tjson);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
          Panel de Administración
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Gestión integral del proceso de evaluación de tesis.
        </p>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="bg-card rounded-lg border shadow-card p-5"
            >
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-heading font-bold text-foreground">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Recent Theses */}
        <h3 className="font-heading text-lg font-semibold text-foreground mb-4">
          Tesis Recientes
        </h3>
        <div className="space-y-4">
          {theses.map((thesis) => (
            <ThesisCard
              key={thesis.id}
              thesis={thesis}
              linkTo="/admin/theses"
            />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
