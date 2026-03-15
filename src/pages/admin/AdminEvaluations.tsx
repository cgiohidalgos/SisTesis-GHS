import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { Table } from "@/components/ui/table"; // if exists otherwise use simple table
import { toast } from "sonner";
import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

export default function AdminEvaluations() {
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [search] = useSearchParams();
  const navigate = useNavigate();

  const dueFilter = search.get('due');

  const fetchEvals = async () => {
    try {
      const token = localStorage.getItem('token');
      const url = new URL(`${API_BASE}/admin/evaluations`);
      if (dueFilter) url.searchParams.set('due', dueFilter);
      const resp = await fetch(url.toString(), {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('Error cargando evaluaciones');
      const list = await resp.json();
      setEvaluations(list);
    } catch (e: any) {
      console.error('fetchEvals', e);
      toast.error(e.message || 'Error');
    }
  };

  useEffect(() => {
    fetchEvals();
  }, [dueFilter]);

  const label = dueFilter === 'overdue' ? 'Vencidas'
    : dueFilter === '7' ? '<7 días'
    : dueFilter === '15' ? '<15 días'
    : dueFilter === '30' ? '<30 días'
    : 'Todas';

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto">
        <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
          Evaluaciones {label}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="p-2">Proyecto</th>
                <th className="p-2">Evaluador</th>
                <th className="p-2">Fecha límite</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.map((e) => (
                <tr key={e.assignment_id} className="border-t">
                  <td className="p-2">{e.thesis_title}</td>
                  <td className="p-2">{e.evaluator_name}</td>
                  <td className="p-2">{e.due_date ? new Date(e.due_date*1000).toLocaleDateString('es-CO') : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}