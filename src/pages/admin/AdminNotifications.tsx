import { useState, useEffect } from 'react';
import { getApiBase } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, RefreshCw, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import AppLayout from '@/components/layout/AppLayout';

const EVENT_LABELS: Record<string, string> = {
  submitted:            'Proyecto de grado enviado',
  admin_feedback:       'Feedback del admin',
  admin_decision:       'Decisión del admin',
  evaluators_assigned:  'Evaluadores asignados',
  review_ok:            'Revisión aprobada',
  review_fail:          'Revisión con observaciones',
  revision_submitted:   'Revisión del estudiante',
  evaluation_submitted: 'Evaluación enviada',
  defense_scheduled:    'Sustentación programada',
  act_signature:        'Firma de acta',
  status_changed:       'Estado actualizado',
  reminder:             'Recordatorio automático',
  custom:               'Mensaje personalizado',
};

interface Notification {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  event_type: string;
  subject: string;
  body?: string;
  sent_at: number | null;
  error: string | null;
  created_at: number;
  related_thesis_id: string | null;
}

const PAGE_SIZE = 50;

export default function AdminNotifications() {
  const API_BASE = getApiBase();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'sent' | 'failed'>('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalSent, setTotalSent] = useState(0);
  const [totalFailed, setTotalFailed] = useState(0);

  // View modal
  const [viewingNotif, setViewingNotif] = useState<Notification | null>(null);

  // Custom message modal
  const [customTarget, setCustomTarget] = useState<Notification | null>(null);
  const [customSubject, setCustomSubject] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => { load(page); }, [page]);

  const load = async (p: number = page) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${API_BASE}/admin/notifications?limit=${PAGE_SIZE}&offset=${(p - 1) * PAGE_SIZE}`,
        { headers: { Authorization: token ? `Bearer ${token}` : '' } }
      );
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setTotal(data.total ?? 0);
        setTotalSent(data.totalSent ?? 0);
        setTotalFailed(data.totalFailed ?? 0);
      }
    } finally {
      setLoading(false);
    }
  };

  const filtered = notifications.filter(n => {
    if (filter === 'sent' && !n.sent_at) return false;
    if (filter === 'failed' && !n.error) return false;
    if (eventFilter !== 'all' && n.event_type !== eventFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const eventTypes = Object.keys(EVENT_LABELS);

  const handleResend = async (id: string) => {
    setResending(id);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/admin/notifications/${id}/resend`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || 'Error reenviando');
      }
      toast.success('Notificación reenviada');
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResending(null);
    }
  };

  const openCustom = (n: Notification) => {
    setCustomTarget(n);
    setCustomSubject(n.subject || '');
    setCustomBody('');
  };

  const handleSendCustom = async () => {
    if (!customTarget || !customSubject.trim() || !customBody.trim()) return;
    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/admin/notifications/send-custom`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: customTarget.user_id, subject: customSubject, body: customBody }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || 'Error enviando mensaje');
      }
      toast.success(`Mensaje enviado a ${customTarget.full_name}`);
      setCustomTarget(null);
      load();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AppLayout role="admin">
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Historial de Notificaciones</h1>
          <p className="text-sm text-muted-foreground">
            {totalSent} enviadas · {totalFailed} fallidas · {total} total
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(page)}>Actualizar</Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'sent', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm border transition-colors ${
              filter === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
            }`}
          >
            {{ all: 'Todas', sent: 'Enviadas', failed: 'Fallidas' }[f]}
          </button>
        ))}
        <select
          value={eventFilter}
          onChange={e => setEventFilter(e.target.value)}
          className="px-3 py-1 rounded-full text-sm border border-border bg-background"
        >
          <option value="all">Todos los eventos</option>
          {eventTypes.map(t => (
            <option key={t} value={t}>{EVENT_LABELS[t] || t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No hay notificaciones.</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Destinatario</th>
                  <th className="text-left px-4 py-3 font-medium">Evento</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Asunto</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(n => (
                  <tr key={n.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                      {new Date(n.created_at * 1000).toLocaleString('es-CO', {
                        day: '2-digit', month: '2-digit', year: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{n.full_name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{n.email || ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="whitespace-nowrap">
                        {EVENT_LABELS[n.event_type] || n.event_type}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-muted-foreground max-w-xs truncate">
                      {n.subject}
                    </td>
                    <td className="px-4 py-3">
                      {n.error ? (
                        <Badge variant="destructive">Fallida</Badge>
                      ) : n.sent_at ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Enviada</Badge>
                      ) : (
                        <Badge variant="outline">Pendiente</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Ver mensaje"
                          onClick={() => setViewingNotif(n)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Reenviar mensaje"
                          onClick={() => handleResend(n.id)}
                          disabled={resending === n.id}
                        >
                          <RefreshCw className={`h-4 w-4 ${resending === n.id ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title="Escribir mensaje personalizado"
                          onClick={() => openCustom(n)}
                        >
                          <PenLine className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1 py-2">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} · {total} notificaciones
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>

    {/* Modal: Ver mensaje */}
    <Dialog open={!!viewingNotif} onOpenChange={() => setViewingNotif(null)}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Mensaje enviado</DialogTitle>
        </DialogHeader>
        {viewingNotif && (
          <div className="space-y-3 text-sm">
            <div>
              <span className="font-medium text-muted-foreground">Para: </span>
              <span>{viewingNotif.full_name} &lt;{viewingNotif.email}&gt;</span>
            </div>
            <div>
              <span className="font-medium text-muted-foreground">Asunto: </span>
              <span>{viewingNotif.subject}</span>
            </div>
            <div className="border rounded p-3 bg-muted/30 whitespace-pre-wrap max-h-80 overflow-y-auto">
              {viewingNotif.body || <span className="text-muted-foreground italic">Sin contenido registrado</span>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setViewingNotif(null)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Modal: Mensaje personalizado */}
    <Dialog open={!!customTarget} onOpenChange={() => setCustomTarget(null)}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Mensaje personalizado</DialogTitle>
        </DialogHeader>
        {customTarget && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              Destinatario: <span className="font-medium text-foreground">{customTarget.full_name}</span> &lt;{customTarget.email}&gt;
            </p>
            <div className="space-y-1">
              <Label htmlFor="custom-subject">Asunto</Label>
              <Input
                id="custom-subject"
                value={customSubject}
                onChange={e => setCustomSubject(e.target.value)}
                placeholder="Asunto del mensaje"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="custom-body">Mensaje</Label>
              <Textarea
                id="custom-body"
                value={customBody}
                onChange={e => setCustomBody(e.target.value)}
                placeholder="Escribe el contenido del mensaje..."
                rows={6}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setCustomTarget(null)}>Cancelar</Button>
          <Button
            onClick={handleSendCustom}
            disabled={sending || !customSubject.trim() || !customBody.trim()}
          >
            {sending ? 'Enviando…' : 'Enviar mensaje'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </AppLayout>
  );
}
