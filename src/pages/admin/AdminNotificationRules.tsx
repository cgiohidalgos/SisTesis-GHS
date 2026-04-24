import { useEffect, useRef, useState } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

// ── Constantes ────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  submitted:            "Tesis enviada a revisión",
  admin_feedback:       "Comentario del administrador",
  admin_decision:       "Decisión del administrador",
  evaluators_assigned:  "Evaluadores asignados",
  review_ok:            "Revisión aprobada",
  review_fail:          "Revisión con observaciones",
  revision_submitted:   "Estudiante envió revisión",
  evaluation_submitted: "Evaluación enviada por evaluador",
  defense_scheduled:    "Sustentación programada",
  act_signature:        "Firma de acta registrada",
  status_changed:       "Estado de la tesis actualizado",
  evaluator_removed:    "Evaluador removido",
  evaluator_replaced:   "Evaluador reemplazado",
};

const ROLES = [
  { key: "student",   label: "Estudiante" },
  { key: "admin",     label: "Admin" },
  { key: "evaluator", label: "Evaluador" },
  { key: "director",  label: "Director(es)" },
];

const VARIABLES = [
  { key: "destinatario_nombre",  label: "Nombre del destinatario" },
  { key: "titulo_tesis",         label: "Título de la tesis" },
  { key: "descripcion",          label: "Descripción del evento" },
  { key: "nombres_estudiantes",  label: "Nombre(s) del estudiante" },
  { key: "correos_estudiantes",  label: "Correo(s) del estudiante" },
  { key: "nombres_evaluadores",  label: "Nombre(s) del evaluador" },
  { key: "programa",             label: "Programa académico" },
  { key: "fecha",                label: "Fecha actual" },
  { key: "fecha_sustentacion",   label: "Fecha de sustentación" },
  { key: "lugar_sustentacion",   label: "Lugar de sustentación" },
  { key: "info_sustentacion",    label: "Info adicional sustentación" },
];

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Rule     = { event_type: string; role: string; enabled: number };
type Template = { event_type: string; subject: string; body_html: string };
type RulesMap = Record<string, Record<string, boolean>>;
type TplMap   = Record<string, { subject: string; body_html: string }>;

// ── Componente de evento expandible ──────────────────────────────────────────

function EventRow({
  eventType,
  label,
  rules,
  template,
  onToggleRole,
  onChangeTemplate,
  onSaveTemplate,
  saving,
}: {
  eventType: string;
  label: string;
  rules: Record<string, boolean>;
  template: { subject: string; body_html: string };
  onToggleRole: (role: string) => void;
  onChangeTemplate: (field: "subject" | "body_html", value: string) => void;
  onSaveTemplate: () => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef    = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (varKey: string, field: "subject" | "body_html") => {
    const tag = `{{${varKey}}}`;
    const ref = field === "subject" ? subjectRef.current : bodyRef.current;
    if (!ref) {
      onChangeTemplate(field, template[field] + tag);
      return;
    }
    const start = ref.selectionStart ?? template[field].length;
    const end   = ref.selectionEnd   ?? template[field].length;
    const updated = template[field].slice(0, start) + tag + template[field].slice(end);
    onChangeTemplate(field, updated);
    // Restaurar foco y cursor después del tag insertado
    requestAnimationFrame(() => {
      ref.focus();
      const pos = start + tag.length;
      ref.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="border-b last:border-b-0">
      {/* Cabecera */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="font-medium text-sm">{label}</span>
        <div className="flex items-center gap-3">
          {/* Indicadores de roles activos */}
          <div className="flex gap-1">
            {ROLES.map((r) => (
              <span
                key={r.key}
                className={`text-xs px-2 py-0.5 rounded-full ${
                  rules[r.key]
                    ? "bg-primary/10 text-primary font-medium"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {r.label}
              </span>
            ))}
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Contenido expandible */}
      {open && (
        <div className="px-4 pb-5 pt-2 space-y-5 bg-muted/10">

          {/* Roles */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Destinatarios
            </p>
            <div className="flex gap-4">
              {ROLES.map((r) => (
                <label key={r.key} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-primary"
                    checked={!!rules[r.key]}
                    onChange={() => onToggleRole(r.key)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
          </div>

          {/* Variables disponibles */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Variables disponibles — haz clic para insertar en el campo activo
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map((v) => (
                <div key={v.key} className="flex gap-0.5">
                  <button
                    type="button"
                    title={`Insertar en Asunto`}
                    onClick={() => insertVariable(v.key, "subject")}
                    className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-l px-2 py-1 transition-colors"
                  >
                    {v.label}
                  </button>
                  <button
                    type="button"
                    title={`Insertar en Cuerpo`}
                    onClick={() => insertVariable(v.key, "body_html")}
                    className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-r px-1.5 py-1 transition-colors font-mono"
                  >
                    &lt;/&gt;
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              <span className="text-blue-600 font-medium">Nombre</span> inserta en el asunto ·{" "}
              <span className="text-purple-600 font-mono font-medium">&lt;/&gt;</span> inserta en el cuerpo HTML
            </p>
          </div>

          {/* Asunto */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
              Asunto del correo
            </label>
            <input
              ref={subjectRef}
              type="text"
              value={template.subject}
              onChange={(e) => onChangeTemplate("subject", e.target.value)}
              className="w-full px-3 py-2 text-sm border rounded-md bg-background font-mono"
              placeholder="Asunto del correo..."
            />
          </div>

          {/* Cuerpo HTML */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Cuerpo del correo (HTML)
              </label>
              <button
                type="button"
                onClick={() => setPreview((p) => !p)}
                className="text-xs px-2.5 py-1 rounded border border-muted bg-background hover:bg-muted transition-colors text-muted-foreground"
              >
                {preview ? "✏️ Editar" : "👁 Vista previa"}
              </button>
            </div>
            {preview ? (
              <div
                className="w-full min-h-[200px] border rounded-md bg-white p-4 text-sm overflow-auto"
                dangerouslySetInnerHTML={{ __html: template.body_html }}
              />
            ) : (
              <textarea
                ref={bodyRef}
                value={template.body_html}
                onChange={(e) => onChangeTemplate("body_html", e.target.value)}
                rows={10}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background font-mono resize-y"
                placeholder="<p>Cuerpo del correo en HTML...</p>"
              />
            )}
          </div>

          <Button size="sm" onClick={onSaveTemplate} disabled={saving}>
            {saving ? "Guardando..." : "Guardar plantilla"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AdminNotificationRules() {
  const [rules,     setRules]     = useState<RulesMap>({});
  const [templates, setTemplates] = useState<TplMap>({});
  const [loading,   setLoading]   = useState(true);
  const [savingRoles,  setSavingRoles]  = useState(false);
  const [savingTpl,    setSavingTpl]    = useState<string | null>(null);

  const token = localStorage.getItem("token");
  const headers = { Authorization: token ? `Bearer ${token}` : "" };

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/super/notification-rules`,    { headers }).then(r => r.json()),
      fetch(`${API_BASE}/super/notification-templates`, { headers }).then(r => r.json()),
    ])
      .then(([rulesData, tplData]: [Rule[], Template[]]) => {
        const rMap: RulesMap = {};
        for (const r of rulesData) {
          if (!rMap[r.event_type]) rMap[r.event_type] = {};
          rMap[r.event_type][r.role] = !!r.enabled;
        }
        setRules(rMap);

        const tMap: TplMap = {};
        for (const t of tplData) tMap[t.event_type] = { subject: t.subject, body_html: t.body_html };
        setTemplates(tMap);
      })
      .catch(() => toast.error("Error cargando configuración"))
      .finally(() => setLoading(false));
  }, []);

  const toggleRole = (eventType: string, role: string) => {
    setRules(prev => ({
      ...prev,
      [eventType]: { ...prev[eventType], [role]: !prev[eventType]?.[role] },
    }));
  };

  const changeTemplate = (eventType: string, field: "subject" | "body_html", value: string) => {
    setTemplates(prev => ({
      ...prev,
      [eventType]: { ...prev[eventType], [field]: value },
    }));
  };

  const saveAllRoles = async () => {
    setSavingRoles(true);
    const payload: Rule[] = [];
    for (const event_type of Object.keys(EVENT_LABELS)) {
      for (const { key: role } of ROLES) {
        payload.push({ event_type, role, enabled: rules[event_type]?.[role] ? 1 : 0 });
      }
    }
    try {
      const resp = await fetch(`${API_BASE}/super/notification-rules`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ rules: payload }),
      });
      if (!resp.ok) throw new Error();
      toast.success("Destinatarios guardados");
    } catch {
      toast.error("Error guardando destinatarios");
    } finally {
      setSavingRoles(false);
    }
  };

  const saveTemplate = async (eventType: string) => {
    const tpl = templates[eventType];
    if (!tpl) return;
    setSavingTpl(eventType);
    try {
      const resp = await fetch(`${API_BASE}/super/notification-templates/${eventType}`, {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(tpl),
      });
      if (!resp.ok) throw new Error();
      toast.success("Plantilla guardada");
    } catch {
      toast.error("Error guardando plantilla");
    } finally {
      setSavingTpl(null);
    }
  };

  return (
    <AppLayout role="superadmin">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="font-heading text-2xl font-bold mb-1">Notificaciones por evento</h2>
            <p className="text-sm text-muted-foreground">
              Configura quién recibe el correo y personaliza el asunto y cuerpo para cada evento del sistema.
            </p>
          </div>
          <Button onClick={saveAllRoles} disabled={savingRoles || loading} size="sm">
            {savingRoles ? "Guardando..." : "Guardar destinatarios"}
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            {Object.entries(EVENT_LABELS).map(([eventType, label]) => (
              <EventRow
                key={eventType}
                eventType={eventType}
                label={label}
                rules={rules[eventType] ?? {}}
                template={templates[eventType] ?? { subject: "", body_html: "" }}
                onToggleRole={(role) => toggleRole(eventType, role)}
                onChangeTemplate={(field, value) => changeTemplate(eventType, field, value)}
                onSaveTemplate={() => saveTemplate(eventType)}
                saving={savingTpl === eventType}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
