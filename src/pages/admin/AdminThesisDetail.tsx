import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import { useAuth } from "@/hooks/useAuth";
import { defaultRubric, presentationRubric } from "@/lib/mock-data";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import RubricEvaluation from "@/components/thesis/RubricEvaluation";
import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

async function downloadFile(url: string, fileName: string) {
  try {
    const backendBase = API_BASE || `${window.location.protocol}//${window.location.hostname}:4000`;
    const token = localStorage.getItem('token');
    const resp = await fetch(`${backendBase}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!resp.ok) throw new Error(`Error descargando archivo (${resp.status})`);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(blobUrl);
  } catch (err: any) {
    console.error('downloadFile error', err);
    alert(err.message || 'No se pudo descargar el archivo');
  }
}

export default function AdminThesisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [thesis, setThesis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [reviewItems, setReviewItems] = useState<{id:string,label:string}[]>([]);
  const [programDocRubric, setProgramDocRubric] = useState<any[] | null>(null);
  const [programPresRubric, setProgramPresRubric] = useState<any[] | null>(null);
  const [weights, setWeights] = useState<{doc:number;presentation:number}>({doc:70,presentation:30});
  const [actaStatus, setActaStatus] = useState<any>(null);
  const [overrideScore, setOverrideScore] = useState<number | null>(null);
  const [savingOverride, setSavingOverride] = useState(false);
  
  // Estado para firma digital con certificado
  const [digitalSignStatus, setDigitalSignStatus] = useState<any>(null);
  const [digitalSignFile, setDigitalSignFile] = useState<File | null>(null);
  const [digitalSignerRole, setDigitalSignerRole] = useState<string>("");
  const [digitalSignerName, setDigitalSignerName] = useState<string>("");
  const [digitalSignerTitle, setDigitalSignerTitle] = useState<string>("");
  const [loadingDigitalSign, setLoadingDigitalSign] = useState(false);
  const [digitalProgDirectorName, setDigitalProgDirectorName] = useState<string>(() =>
    id ? (localStorage.getItem(`acta_progdir_${id}`) || '') : ''
  );
  const [manualSignFile, setManualSignFile] = useState<File | null>(null);
  const [uploadingManual, setUploadingManual] = useState(false);

  // Estado para carta meritoria
  const [meritoriaStatus, setMeritoriaStatus] = useState<any>(null);
  const [meritoriaSignFile, setMeritoriaSignFile] = useState<File | null>(null);
  const [meritoriaSignerName, setMeritoriaSignerName] = useState<string>("");
  const [meritoriaSignerTitle, setMeritoriaSignerTitle] = useState<string>("");
  const [loadingMeritoria, setLoadingMeritoria] = useState(false);
  const [editingDueDate, setEditingDueDate] = useState<Record<string, string>>({});
  const [savingDueDate, setSavingDueDate] = useState<string | null>(null);
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [isAddingEvaluator, setIsAddingEvaluator] = useState(false);
  const [replacingEvaluator, setReplacingEvaluator] = useState<any | null>(null);
  const [availableEvaluators, setAvailableEvaluators] = useState<any[]>([]);
  const [selectedReplacementId, setSelectedReplacementId] = useState<string | null>(null);
  const [loadingAvailableEvaluators, setLoadingAvailableEvaluators] = useState(false);
  const [replacingEvaluatorLoading, setReplacingEvaluatorLoading] = useState(false);
  const [evaluatorSearchQuery, setEvaluatorSearchQuery] = useState("");

  // Estado para enlaces de firma compartibles
  const [generatedSigningLinks, setGeneratedSigningLinks] = useState<Record<string, {url: string; copied: boolean}>>({});
  // Títulos académicos por firmante (key = normalizePersonKey) — persistido en localStorage
  const [signerTitles, setSignerTitles] = useState<Record<string, string>>(() => {
    try { return id ? JSON.parse(localStorage.getItem(`acta_titles_${id}`) || '{}') : {}; } catch { return {}; }
  });

  // compute consolidated averages and breakdown for display
  const consolidated = (() => {
    if (!thesis || !thesis.evaluations || thesis.evaluations.length === 0) {
      return null;
    }
    const docScores = thesis.evaluations
      .filter((e:any) => e.evaluation_type !== 'presentation')
      .map((e:any) => e.final_score)
      .filter((n:any) => n != null);
    const presScores = thesis.evaluations
      .filter((e:any) => e.evaluation_type === 'presentation')
      .map((e:any) => e.final_score)
      .filter((n:any) => n != null);
    const docAvg = docScores.length ? docScores.reduce((a:number,b:number)=>a+b,0)/docScores.length : 0;
    const presAvg = presScores.length ? presScores.reduce((a:number,b:number)=>a+b,0)/presScores.length : 0;
    let finalWeighted = thesis.defense_date
      ? ((docAvg * (weights.doc/100)) + (presAvg * (weights.presentation/100)))
      : docAvg;
    // apply override if present and thesis finalized
    if (thesis.status === 'finalized' && thesis.final_weighted_override != null) {
      finalWeighted = thesis.final_weighted_override;
    }
    const byEvaluator: Record<string,{doc:number|null;pres:number|null}> = {};
    thesis.evaluations.forEach((ev:any)=>{
      const person = ev.evaluator_name || ev;
      const key = normalizePersonKey(person);
      const name = normalizePersonName(person) || 'Evaluador';
      if (!byEvaluator[key]) byEvaluator[key] = {doc:null,pres:null};
      if (ev.evaluation_type === 'presentation') {
        byEvaluator[key].pres = ev.final_score;
      } else {
        byEvaluator[key].doc = ev.final_score;
      }
      // keep a user-friendly name in case key is a stringified object
      if (!byEvaluator[key].name) {
        (byEvaluator as any)[key].name = name;
      }
    });
    return {docAvg,presAvg,finalWeighted,byEvaluator};
  })();

  const { isSuper } = useAuth();

  function normalizePersonName(person: any) {
    if (typeof person === 'string' || typeof person === 'number' || typeof person === 'boolean') {
      return String(person);
    }
    if (!person) return '';

    const candidate = person.name ?? person.user_id;
    if (typeof candidate === 'string' || typeof candidate === 'number' || typeof candidate === 'boolean') {
      return String(candidate);
    }

    // In case name is unexpectedly an object (e.g. {name: {name: ..., user_id: ...}})
    if (typeof candidate === 'object' && candidate !== null) {
      return String(candidate.name ?? candidate.user_id ?? JSON.stringify(candidate));
    }

    return '';
  }

  function normalizePersonKey(person: any) {
    if (typeof person === 'string') return person;
    if (!person) return '';

    // Prefer stable ids/names when available
    if (person.user_id) return String(person.user_id);
    if (person.id) return String(person.id);
    if (person.name) return String(person.name);

    // Fallback to a JSON representation (stable key for objects)
    try {
      return JSON.stringify(person, Object.keys(person).sort());
    } catch {
      return String(person);
    }
  }

  const safeRender = (value: any) => {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.map(safeRender).join(', ');
    if (typeof value === 'object') return value.name ?? value.user_id ?? JSON.stringify(value);
    return String(value);
  };

  const saveDueDate = async (ev: any) => {
    const newDate = editingDueDate[ev.id];
    if (!newDate) return;
    setSavingDueDate(ev.id);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/evaluators/${ev.id}/due-date`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ due_date: newDate }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => null))?.error || 'Error');
      toast.success('Fecha límite actualizada');
      setEditingDueDate(prev => { const n = { ...prev }; delete n[ev.id]; return n; });
      fetchThesis();
    } catch (err: any) {
      toast.error(err.message || 'No se pudo actualizar la fecha');
    } finally {
      setSavingDueDate(null);
    }
  };

  const openReplaceEvaluatorDialog = async (ev: any) => {
    setReplacingEvaluator(ev);
    setIsAddingEvaluator(false);
    setShowReplaceDialog(true);
    setSelectedReplacementId(null);
    setEvaluatorSearchQuery("");
    setLoadingAvailableEvaluators(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/users?role=evaluator`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('No se pudieron cargar evaluadores disponibles');
      const list = await resp.json();
      // Exclude currently assigned evaluators except the one we're replacing
      const assignedIds = new Set((thesis?.evaluators || []).map((x: any) => x.id));
      assignedIds.delete(ev.id);
      // Exclude directors of this thesis
      const dirNamesUpper = (thesis?.directors || []).map((d: any) => normalizePersonName(d).toUpperCase());
      setAvailableEvaluators(list.filter((u: any) => !assignedIds.has(u.id)).map((u: any) => ({
        ...u,
        _isDirector: dirNamesUpper.includes((u.full_name || '').toUpperCase()),
      })));
    } catch (err: any) {
      console.error('load evaluators for replace', err);
      toast.error(err.message || 'Error cargando evaluadores disponibles');
    } finally {
      setLoadingAvailableEvaluators(false);
    }
  };

  const openAddEvaluatorDialog = async () => {
    setReplacingEvaluator(null);
    setIsAddingEvaluator(true);
    setShowReplaceDialog(true);
    setSelectedReplacementId(null);
    setEvaluatorSearchQuery("");
    setLoadingAvailableEvaluators(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/users?role=evaluator`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('No se pudieron cargar evaluadores disponibles');
      const list = await resp.json();
      const assignedIds = new Set((thesis?.evaluators || []).map((x: any) => x.id));
      // Exclude directors of this thesis
      const dirNamesUpper = (thesis?.directors || []).map((d: any) => normalizePersonName(d).toUpperCase());
      setAvailableEvaluators(list.filter((u: any) => !assignedIds.has(u.id)).map((u: any) => ({
        ...u,
        _isDirector: dirNamesUpper.includes((u.full_name || '').toUpperCase()),
      })));
    } catch (err: any) {
      console.error('load evaluators for add', err);
      toast.error(err.message || 'Error cargando evaluadores disponibles');
    } finally {
      setLoadingAvailableEvaluators(false);
    }
  };

  const performReplaceEvaluator = async () => {
    if (!id || !replacingEvaluator || !selectedReplacementId) return;
    setReplacingEvaluatorLoading(true);
    try {
      const token = localStorage.getItem('token');

      const body: any = {
        old_evaluator_id: replacingEvaluator.id,
        new_evaluator_id: selectedReplacementId,
      };

      const resp = await fetch(`${API_BASE}/theses/${id}/replace-evaluator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || 'Error reemplazando evaluador');
      }

      toast.success('Evaluador reemplazado');
      setShowReplaceDialog(false);
      fetchThesis();
    } catch (err: any) {
      toast.error(err.message || 'Error reemplazando evaluador');
    } finally {
      setReplacingEvaluatorLoading(false);
    }
  };

  const performAddEvaluator = async () => {
    if (!id || !selectedReplacementId) return;
    setReplacingEvaluatorLoading(true);
    try {
      const token = localStorage.getItem('token');
      const body: any = { evaluator_id: selectedReplacementId };
      const resp = await fetch(`${API_BASE}/theses/${id}/assign-evaluator`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || 'Error asignando evaluador');
      }
      toast.success('Evaluador agregado');
      setShowReplaceDialog(false);
      fetchThesis();
    } catch (err: any) {
      toast.error(err.message || 'Error agregando evaluador');
    } finally {
      setReplacingEvaluatorLoading(false);
    }
  };

  const saveOverride = async () => {
    if (!id) return;
    setSavingOverride(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/admin/theses/${id}/final-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ override: overrideScore }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || 'Error guardando nota');
      }
      toast.success('Nota final actualizada');
      fetchThesis();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingOverride(false);
    }
  };

  const fetchThesis = async () => {
    if (!id) return;
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${id}`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('No se pudo cargar la tesis');
      const data = await resp.json();
      // keep timeline dates as raw values (they will be formatted in the timeline component)
      if (data.timeline && Array.isArray(data.timeline)) {
        data.timeline = data.timeline.map((e: any) => ({
          ...e,
          date: e.date ?? undefined,
        }));
      }
      setThesis(data);
      setOverrideScore(data.final_weighted_override ?? null);

      const actaResp = await fetch(`${API_BASE}/theses/${id}/acta/status`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (actaResp.ok) {
        const acta = await actaResp.json();
        setActaStatus(acta);
      }

      // Cargar estado de firma digital
      try {
        const digitalResp = await fetch(`${API_BASE}/theses/${id}/acta/digital-signature-status`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (digitalResp.ok) {
          const digitalData = await digitalResp.json();
          setDigitalSignStatus(digitalData);
        } else {
          const errText = await digitalResp.text();
          console.error('digital-signature-status error:', digitalResp.status, errText);
          setDigitalSignStatus({ allSigned: false, digitalSignatures: [], pendingSigners: [], _error: true });
        }
      } catch (digitalErr) {
        console.error('digital-signature-status fetch failed:', digitalErr);
        setDigitalSignStatus({ allSigned: false, digitalSignatures: [], pendingSigners: [], _error: true });
      }

      // Cargar estado carta meritoria
      try {
        const merResp = await fetch(`${API_BASE}/theses/${id}/meritoria/status`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (merResp.ok) {
          const merData = await merResp.json();
          setMeritoriaStatus(merData);
        }
      } catch {}
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // Generar enlace de firma compartible
  // Normaliza la URL reemplazando el origen del servidor por el del navegador actual
  const normalizeSignUrl = (signUrl: string) => {
    try {
      const parsed = new URL(signUrl);
      const browserBase = `${window.location.protocol}//${window.location.host}`;
      return browserBase + parsed.pathname + parsed.search + parsed.hash;
    } catch {
      return signUrl;
    }
  };

  const handleGenerateSigningLink = async (key: string, signerName: string, signerRole: string) => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${id}/generate-signing-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ signerName, signerRole }),
      });
      if (!resp.ok) throw new Error('Error generando enlace');
      const { signUrl } = await resp.json();
      setGeneratedSigningLinks(prev => ({
        ...prev,
        [key]: { url: normalizeSignUrl(signUrl), copied: false }
      }));
      toast.success(`Enlace generado para ${signerName}`);
    } catch (e: any) {
      toast.error(e.message || 'Error generando enlace');
    }
  };

  // Copiar enlace al portapapeles
  const handleCopyLink = (signerName: string) => {
    const link = generatedSigningLinks[signerName]?.url;
    if (!link) return;
    const markCopied = () => {
      setGeneratedSigningLinks(prev => ({
        ...prev,
        [signerName]: { ...prev[signerName], copied: true }
      }));
      setTimeout(() => {
        setGeneratedSigningLinks(prev => ({
          ...prev,
          [signerName]: { ...prev[signerName], copied: false }
        }));
      }, 2000);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(link).then(markCopied).catch(() => fallbackCopy(link, markCopied));
    } else {
      fallbackCopy(link, markCopied);
    }
  };

  const fallbackCopy = (text: string, onSuccess: () => void) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      onSuccess();
    } catch { /* ignore */ } finally {
      document.body.removeChild(ta);
    }
  };

  // Generar enlace de firma compartible para meritoria
  const handleGenerateMeritoriaLink = async (signerName: string) => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${id}/meritoria/generate-signing-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: token ? `Bearer ${token}` : '',
        },
        body: JSON.stringify({ signerName, signerRole: 'director' }),
      });
      if (!resp.ok) throw new Error('Error generando enlace');
      const { signUrl } = await resp.json();
      setGeneratedSigningLinks(prev => ({
        ...prev,
        [signerName]: { url: normalizeSignUrl(signUrl), copied: false }
      }));
      toast.success(`Enlace generado para ${signerName}`);
    } catch (e: any) {
      toast.error(e.message || 'Error generando enlace');
    }
  };

  useEffect(() => {
    fetchThesis();
    // load review checklist per-program (loaded after thesis fetch via separate effect)
    // also load evaluation weights if superadmin
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE}/super/weights`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (resp.ok) {
          const data = await resp.json();
          setWeights({ doc: data.doc, presentation: data.presentation });
        }
      } catch (e) {
        console.error('failed to load weights', e);
      }
    })();
  }, [id]);

  // Load review items for the thesis's program once thesis is available
  useEffect(() => {
    if (!thesis) return;
    const programId = thesis.programs?.[0]?.id;
    if (!programId) return;
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE}/admin/program-review-items/${programId}`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (resp.ok) {
          const items = await resp.json();
          setReviewItems(items);
          const init: Record<string, boolean> = {};
          items.forEach((it: any) => { init[it.id] = false; });
          setChecklist(init);
        }
      } catch (e) {
        console.error('failed to load review items', e);
      }
      // Load program rubric so admin sees the same rubric used by evaluators
      try {
        const token = localStorage.getItem('token');
        const rubricResp = await fetch(`${API_BASE}/admin/program-rubrics/${programId}`, {
          headers: { Authorization: token ? `Bearer ${token}` : '' },
        });
        if (rubricResp.ok) {
          const rubrics = await rubricResp.json();
          const docR = rubrics.find((r: any) => r.evaluation_type === 'document');
          const presR = rubrics.find((r: any) => r.evaluation_type === 'presentation');
          if (docR) setProgramDocRubric(docR.sections_json);
          if (presR) setProgramPresRubric(presR.sections_json);
        }
      } catch (e) {
        console.error('failed to load program rubric', e);
      }
    })();
  }, [thesis?.programs?.[0]?.id]);

  const markNonCompliant = async () => {
    if (!thesis) return;
    if (!comment.trim()) {
      toast.error('Ingrese un comentario');
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/theses/${thesis.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
        body: JSON.stringify({ ok: false, comment }),
      });
      toast.success('Tesis regresada al estudiante');
      navigate('/admin/theses');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const assignEvaluators = () => {
    if (!thesis) return;
    navigate(`/admin/evaluators?thesis=${thesis.id}`);
  };

  // component for scheduling the defense date/location
  const DefenseScheduler = ({ thesis, onScheduled }: any) => {
    const [date, setDate] = useState<string>(thesis.defense_date ? new Date(thesis.defense_date * 1000).toISOString().slice(0,16) : '');
    const [location, setLocation] = useState<string>(thesis.defense_location || '');
    const [info, setInfo] = useState<string>(thesis.defense_info || '');
    const [saving, setSaving] = useState(false);
    const handleSave = async () => {
      if (!date || !location) {
        toast.error('Ingrese fecha y lugar');
        return;
      }
      setSaving(true);
      try {
        const token = localStorage.getItem('token');
        await fetch(`${API_BASE}/theses/${thesis.id}/schedule`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token?`Bearer ${token}`:'' },
          body: JSON.stringify({ date, location, info }),
        });
        toast.success('Sustentación programada');
        onScheduled();
      } catch (e:any) {
        toast.error(e.message);
      } finally {
        setSaving(false);
      }
    };
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Fecha y hora</label>
          <input
            type="datetime-local"
            className="border p-2 w-full"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Lugar</label>
          <input
            type="text"
            className="border p-2 w-full"
            placeholder="Ej. Sala 101"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Información adicional</label>
          <textarea
            className="border p-2 w-full"
            placeholder="Detalles adicionales, enlace virtual, etc."
            value={info}
            onChange={(e) => setInfo(e.target.value)}
          />
        </div>
        <Button onClick={handleSave} disabled={saving || !date || !location}>
          Guardar programación
        </Button>
      </div>
    );
  };

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resetModalTarget, setResetModalTarget] = useState<{ url: string; label: string; successMessage: string } | null>(null);
  const [captchaCode, setCaptchaCode] = useState('');
  const [captchaInput, setCaptchaInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const generateCaptcha = useCallback(() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setCaptchaCode(code);
    setCaptchaInput('');
    // Dibujar en canvas en el siguiente tick
    setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Fondo
      ctx.fillStyle = '#f1f5f9';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Líneas de ruido
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = `hsl(${Math.random()*360},50%,60%)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.stroke();
      }
      // Letras
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

  const openDeleteModal = () => {
    setDeleteModalOpen(true);
    generateCaptcha();
  };

  const openResetModal = (url: string, label: string, successMessage: string) => {
    setResetModalTarget({ url, label, successMessage });
    setResetModalOpen(true);
    generateCaptcha();
  };

  const handleDelete = async () => {
    if (!thesis) return;
    if (captchaInput.toUpperCase() !== captchaCode) {
      toast.error('El código ingresado no coincide. Intenta de nuevo.');
      generateCaptcha();
      return;
    }
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${thesis.id}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('Error eliminando tesis');
      toast.success('Tesis eliminada');
      navigate('/admin/theses');
    } catch (e:any) {
      toast.error(e.message);
      setDeleting(false);
    }
  };

  const handleResetEvaluation = async () => {
    if (!resetModalTarget) return;
    if (captchaInput.toUpperCase() !== captchaCode) {
      toast.error('El código ingresado no coincide. Intenta de nuevo.');
      generateCaptcha();
      return;
    }
    setResetting(true);
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}${resetModalTarget.url}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.error || 'Error al resetear');
      }
      toast.success(resetModalTarget.successMessage);
      setResetModalOpen(false);
      setCaptchaInput('');
      fetchThesis();
    } catch (e:any) {
      toast.error(e.message);
      setResetting(false);
    }
  };

  if (!thesis) return null;

  const uniqueReviewItems = (() => {
    const seen = new Set<string>();
    return reviewItems.filter((item) => {
      const label = String(item?.label ?? '').trim().toLowerCase();
      if (!label || seen.has(label)) return false;
      seen.add(label);
      return true;
    });
  })();

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto px-4 sm:px-0">
        <div className="mb-6 bg-card p-6 rounded-lg shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
            <h2 className="font-heading text-2xl font-bold">Detalle de Tesis</h2>
            <Button variant="destructive" size="sm" onClick={openDeleteModal}>Eliminar tesis</Button>
          </div>
          <p className="text-sm text-muted-foreground mb-2">
            <strong>Estado:</strong> <span className="capitalize">{safeRender(thesis.status)}</span>
          </p>
          <p className="text-lg font-semibold mb-2">
            <strong>Título:</strong> {safeRender(thesis.title)}
          </p>

          {/* Modal de confirmación con captcha */}
          {deleteModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
              <div className="bg-card border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-center gap-3 text-destructive">
                  <AlertTriangle className="w-7 h-7 shrink-0" />
                  <h3 className="text-lg font-bold">¿Eliminar esta tesis?</h3>
                </div>
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm space-y-1">
                  <p className="font-semibold text-destructive">⚠️ Esta acción es irreversible.</p>
                  <p className="text-muted-foreground">Se perderá permanentemente toda la información asociada:</p>
                  <ul className="list-disc list-inside text-muted-foreground space-y-0.5 mt-1">
                    <li>Documentos y archivos subidos</li>
                    <li>Evaluaciones y rúbricas</li>
                    <li>Línea de tiempo e historial</li>
                    <li>Firmas de acta</li>
                    <li>Notificaciones y comentarios</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Escribe el código que aparece para confirmar:</p>
                  <div className="flex items-center gap-2">
                    <canvas ref={canvasRef} width={210} height={54} className="rounded border bg-slate-100" />
                    <button type="button" onClick={generateCaptcha} className="p-1.5 rounded hover:bg-muted" title="Nuevo código">
                      <RefreshCw className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  <Input
                    value={captchaInput}
                    onChange={e => setCaptchaInput(e.target.value.toUpperCase())}
                    placeholder="Escribe el código aquí"
                    className="font-mono tracking-widest uppercase"
                    maxLength={6}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleDelete(); }}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => { setDeleteModalOpen(false); setCaptchaInput(''); }} disabled={deleting}>
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleDelete}
                    disabled={deleting || captchaInput.length < 6}
                  >
                    {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {resetModalOpen && resetModalTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
              <div className="bg-card border rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
                <div className="flex items-center gap-3 text-destructive">
                  <AlertTriangle className="w-7 h-7 shrink-0" />
                  <h3 className="text-lg font-bold">¿Resetear {resetModalTarget.label}?</h3>
                </div>
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm space-y-1">
                  <p className="font-semibold text-destructive">⚠️ Esta acción no se puede deshacer.</p>
                  <p className="text-muted-foreground">El evaluador podrá volver a llenar esta rúbrica, pero el envío actual se perderá.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Escribe el código que aparece para confirmar:</p>
                  <div className="flex items-center gap-2">
                    <canvas ref={canvasRef} width={210} height={54} className="rounded border bg-slate-100" />
                    <button type="button" onClick={generateCaptcha} className="p-1.5 rounded hover:bg-muted" title="Nuevo código">
                      <RefreshCw className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  <Input
                    value={captchaInput}
                    onChange={e => setCaptchaInput(e.target.value.toUpperCase())}
                    placeholder="Escribe el código aquí"
                    className="font-mono tracking-widest uppercase"
                    maxLength={6}
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleResetEvaluation(); }}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" className="flex-1" onClick={() => { setResetModalOpen(false); setCaptchaInput(''); }} disabled={resetting}>
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={handleResetEvaluation}
                    disabled={resetting || captchaInput.length < 6}
                  >
                    {resetting ? 'Reseteando…' : 'Resetear definitivamente'}
                  </Button>
                </div>
              </div>
            </div>
          )}
          {thesis.students && thesis.students.length > 0 && (
            <div className="mb-3">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Autor{thesis.students.length>1?'es':''}:</strong> {thesis.students.map((s:any)=>normalizePersonName(s)).join(', ')}
              </p>
              {thesis.students.map((student: any, idx: number) => (
                <div key={idx} className="ml-4 text-xs text-muted-foreground space-y-0.5 mb-2">
                  {student.student_code && (
                    <p><strong>Código:</strong> {student.student_code}</p>
                  )}
                  {student.cedula && (
                    <p><strong>Cédula:</strong> {student.cedula}</p>
                  )}
                  {student.institutional_email && (
                    <p><strong>Correo institucional:</strong> {student.institutional_email}</p>
                  )}
                  {student.email && student.email !== student.institutional_email && (
                    <p><strong>Correo personal:</strong> {student.email}</p>
                  )}
                  {student.cvlac && (
                    <p><strong>CVLAC:</strong> {student.cvlac}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {thesis.directors && thesis.directors.length > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              <strong>Director{thesis.directors.length>1?'es':''}:</strong> {thesis.directors.map(normalizePersonName).join(', ')}
            </p>
          )}
          {thesis.programs && thesis.programs.length > 0 && (
            <p className="text-sm text-muted-foreground">
              <strong>Programas:</strong> {thesis.programs.map((p:any)=>normalizePersonName(p)).join(', ')}
            </p>
          )}
        </div>
        {thesis.keywords && (
          <div className="mb-4">
            <strong>Palabras clave:</strong> {safeRender(thesis.keywords)}
          </div>
        )}
        {thesis.evaluators && thesis.evaluators.length > 0 && (
          <div className="mb-6">
            <strong>Evaluadores asignados:</strong>{' '}

            {thesis.evaluators.length < 2 && (
              <div className="mt-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
                <strong>Atención:</strong> Se requiere al menos dos evaluadores asignados. Agrega otro evaluador antes de intentar reemplazar.
                <div className="mt-2">
                  <Button size="sm" onClick={openAddEvaluatorDialog}>
                    Agregar evaluador
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-1">
              {thesis.evaluators.map((e:any) => {
                const hasSubmitted = thesis.evaluations?.some((x:any) => x.evaluator_id === e.id);
                return (
                  <span key={e.id} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm">
                    <span>{normalizePersonName(e)}{e.is_blind ? ' (par ciego)' : ''}{e.institutional_email ? ` — ${e.institutional_email}` : ''}</span>
                    {!hasSubmitted && (
                      <button
                        className="text-xs text-destructive hover:text-destructive/80"
                        type="button"
                        onClick={() => openReplaceEvaluatorDialog(e)}
                        title="Reemplazar evaluador"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
            <div className="mt-2 space-y-1">
              {thesis.evaluators.map((e:any) => (
                <div key={e.id} className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="text-muted-foreground font-medium">{normalizePersonName(e)}:</span>
                  {e.id in editingDueDate ? (
                    <>
                      <input
                        type="date"
                        className="border rounded px-2 py-0.5 text-xs"
                        value={editingDueDate[e.id]}
                        onChange={ev => setEditingDueDate(prev => ({ ...prev, [e.id]: ev.target.value }))}
                      />
                      <button
                        className="text-xs px-2 py-0.5 rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                        disabled={savingDueDate === e.id}
                        onClick={() => saveDueDate(e)}
                      >
                        {savingDueDate === e.id ? 'Guardando…' : 'Guardar'}
                      </button>
                      <button
                        className="text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200"
                        onClick={() => setEditingDueDate(prev => { const n = { ...prev }; delete n[e.id]; return n; })}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">
                        {e.due_date
                          ? new Date(e.due_date > 1e12 ? e.due_date : e.due_date * 1000).toLocaleDateString('es-CO')
                          : 'Sin fecha'}
                      </span>
                      <button
                        className="text-xs px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200"
                        onClick={() => {
                          const ms = e.due_date > 1e12 ? e.due_date : e.due_date * 1000;
                          const iso = e.due_date ? new Date(ms).toISOString().slice(0, 10) : '';
                          setEditingDueDate(prev => ({ ...prev, [e.id]: iso }));
                        }}
                      >
                        ✏️ Editar fecha límite
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* per-evaluator status accordions */}
            <Accordion type="single" collapsible className="mt-4 w-full border rounded-xl overflow-hidden bg-white dark:bg-slate-950">
              {thesis.evaluators.map((ev:any, index:number) => {
                const docSent = thesis.evaluations?.some((x:any) => x.evaluator_id===ev.id && x.evaluation_type!=='presentation');
                const presSent = thesis.evaluations?.some((x:any) => x.evaluator_id===ev.id && x.evaluation_type==='presentation');
                // pull the actual evaluation objects to show later
                const docEval = thesis.evaluations?.find((x:any) => x.evaluator_id===ev.id && x.evaluation_type!=='presentation');
                const presEval = thesis.evaluations?.find((x:any) => x.evaluator_id===ev.id && x.evaluation_type==='presentation');
                // compute due-date status badge when evaluation still pending
                let dueStatus: JSX.Element | null = null;
                const evalPending = !(docSent && (thesis.defense_date ? docSent && presSent : docSent));
                if (evalPending) {
                  if (ev.due_date) {
                    const now = new Date();
                    const duems = ev.due_date > 1e12 ? ev.due_date : ev.due_date * 1000;
                    const due = new Date(duems);
                    const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
                    if (diff < 0) {
                      dueStatus = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-100 text-red-600 border border-red-200">
                          Atrasado
                        </span>
                      );
                    } else if (diff <= 4) {
                      dueStatus = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-yellow-100 text-yellow-700 border border-yellow-200">
                          Casi vence
                        </span>
                      );
                    } else {
                      dueStatus = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-100 text-red-700 border border-red-200">
                          Pendiente
                        </span>
                      );
                    }
                  } else {
                    dueStatus = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-red-100 text-red-700 border border-red-200">
                        Pendiente
                      </span>
                    );
                  }
                }
                const canChangeEvaluator = !docSent;
                return (
                  <AccordionItem
                    key={
                      `${
                        typeof ev.id === 'object' && ev.id !== null
                          ? JSON.stringify(ev.id)
                          : String(ev.id)
                      }-${index}`
                    }
                    value={String(ev.id)}
                    className="border-b px-2"
                  >
                    <AccordionTrigger className="hover:no-underline py-4 flex justify-between items-center">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span>{ev.name}{ev.is_blind ? ' (par ciego)' : ''}{ev.institutional_email ? ` — ${ev.institutional_email}` : ''}</span>
                        {docEval?.concept === 'accepted' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-success/10 text-success border border-success/20">Aceptado para Sustentación</span>
                        )}
                        {docEval?.concept === 'minor_changes' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-yellow-100 text-yellow-700 border border-yellow-200">Cambios Menores</span>
                        )}
                        {docEval?.concept === 'major_changes' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-100 text-purple-700 border border-purple-200">Cambios Mayores</span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        {canChangeEvaluator && (
                          <button
                            className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-300"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm('¿Cambiar este evaluador? Se eliminará la asignación actual.')) return;
                              try {
                                const token = localStorage.getItem('token');
                                const resp = await fetch(`${API_BASE}/theses/${thesis.id}/evaluators/${ev.id}`, {
                                  method: 'DELETE',
                                  headers: { Authorization: token ? `Bearer ${token}` : '' },
                                });
                                if (!resp.ok) {
                                  const err = await resp.json().catch(() => null);
                                  throw new Error(err?.error || 'No se pudo quitar evaluador');
                                }
                                toast.success('Evaluador removido. Asigne un reemplazo.');
                                fetchThesis();
                                navigate(`/admin/evaluators?thesis=${thesis.id}`);
                              } catch (err: any) {
                                toast.error(err.message || 'Error cambiando evaluador');
                              }
                            }}
                          >
                            Cambiar evaluador
                          </button>
                        )}
                        {dueStatus}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-4 space-y-4">
                      {/* document rubric accordion if sent*/}
                      {docSent && docEval && (
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={`${ev.id}-doc`} className="border-b px-2">
                            <AccordionTrigger className="hover:no-underline py-2 flex justify-between items-center">
                              <span>Rúbrica de Documento</span>
                              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <button
                                  className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 hover:bg-green-200 font-medium"
                                  title="Descargar rúbrica llena (XLSX)"
                                  onClick={() => downloadFile(`/admin/theses/${thesis.id}/rubric-xlsx?evaluator_id=${ev.id}&evaluation_type=document`, `Rubrica_Documento_${(ev.name || 'evaluador').replace(/\s+/g,'_')}.xlsx`)}
                                >
                                  📥 XLSX
                                </button>
                                <button
                                  className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                                  title="Resetear rúbrica para que el evaluador la vuelva a llenar"
                                  onClick={() => openResetModal(`/theses/${thesis.id}/evaluators/${ev.id}/reset-evaluation?evaluation_type=document`, `rúbrica de documento de ${ev.name || 'este evaluador'}`, 'Rúbrica reseteada. El evaluador puede volver a enviarla.')}
                                >
                                  🔄 Resetear
                                </button>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-success/10 text-success border border-success/20">Enviada</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4">
                              <RubricEvaluation
                                thesis={thesis}
                                readOnly={true}
                                submitDisabled={true}
                                showConcept={false}
                                showFiles={false}
                                initialConcept={docEval.concept || null}
                                initialFinalScore={docEval.final_score}
                                initialSections={docEval ? (programDocRubric ?? defaultRubric).map((s: any) => ({
                                  ...s,
                                  criteria: s.criteria.map((c: any) => {
                                    const sc = docEval.scores?.find((x: any) => x.section_id === s.id && x.criterion_id === c.id);
                                    return { ...c, score: sc?.score ?? undefined, observations: sc?.observations || "" };
                                  })
                                })) : undefined}
                                initialGeneralObs={docEval.general_observations || ""}
                                initialFiles={docEval.files || []}
                              />
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}

                      {/* presentation rubric accordion if sent*/}
                      {presSent && presEval && (
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value={`${ev.id}-pres`} className="border-b px-2">
                            <AccordionTrigger className="hover:no-underline py-2 flex justify-between items-center">
                              <span>Rúbrica de Sustentación</span>
                              <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                <button
                                  className="text-xs px-2 py-1 rounded bg-green-100 text-green-800 hover:bg-green-200 font-medium"
                                  title="Descargar rúbrica llena (XLSX)"
                                  onClick={() => downloadFile(`/admin/theses/${thesis.id}/rubric-xlsx?evaluator_id=${ev.id}&evaluation_type=presentation`, `Rubrica_Sustentacion_${(ev.name || 'evaluador').replace(/\s+/g,'_')}.xlsx`)}
                                >
                                  📥 XLSX
                                </button>
                                <button
                                  className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                                  title="Resetear rúbrica para que el evaluador la vuelva a llenar"
                                  onClick={() => openResetModal(`/theses/${thesis.id}/evaluators/${ev.id}/reset-evaluation?evaluation_type=presentation`, `rúbrica de sustentación de ${ev.name || 'este evaluador'}`, 'Rúbrica reseteada. El evaluador puede volver a enviarla.')}
                                >
                                  🔄 Resetear
                                </button>
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase bg-success/10 text-success border border-success/20">Enviada</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4">
                              <RubricEvaluation
                                thesis={thesis}
                                readOnly={true}
                                submitDisabled={true}
                                showConcept={false}
                                showFiles={false}
                                initialConcept={presEval.concept || null}
                                initialFinalScore={presEval.final_score}
                                initialSections={presEval ? (programPresRubric ?? presentationRubric).map((s: any) => ({
                                  ...s,
                                  criteria: s.criteria.map((c: any) => {
                                    const sc = presEval.scores?.find((x: any) => x.section_id === s.id && x.criterion_id === c.id);
                                    return { ...c, score: sc?.score ?? undefined, observations: sc?.observations || "" };
                                  })
                                })) : undefined}
                                initialGeneralObs={presEval.general_observations || ""}
                                initialFiles={presEval.files || []}
                              />
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </div>
        )}
        {thesis.files && thesis.files.length > 0 && (
          <div className="mb-6">
            <h3 className="font-heading text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Documentos enviados
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {thesis.files.map((f:any) => {
                const isUrl = f.file_url?.startsWith('http://') || f.file_url?.startsWith('https://') || 
                              f.file_name?.startsWith('http://') || f.file_name?.startsWith('https://');
                const isPdf = f.file_name?.toLowerCase().endsWith('.pdf');
                const isDoc = f.file_name?.toLowerCase().match(/\.(doc|docx)$/);
                const urlToOpen = isUrl ? (f.file_url?.startsWith('http') ? f.file_url : f.file_name) : null;
                
                return (
                  <div
                    key={typeof f.id === 'object' && f.id !== null ? JSON.stringify(f.id) : String(f.id)}
                    className="group relative flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/5 hover:border-accent/50 transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    <div className="flex-shrink-0">
                      {isUrl ? (
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        </div>
                      ) : isPdf ? (
                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                          <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                      ) : isDoc ? (
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isUrl ? (
                        <a
                          href={urlToOpen}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full group-hover:text-accent transition-colors"
                        >
                          <p className="font-medium text-sm truncate">{f.file_name}</p>
                          {urlToOpen !== f.file_name && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{urlToOpen}</p>
                          )}
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="text-left w-full group-hover:text-accent transition-colors"
                          onClick={() => downloadFile(f.file_url, f.file_name)}
                        >
                          <p className="font-medium text-sm truncate">{f.file_name}</p>
                        </button>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {isUrl ? (
                        <a
                          href={urlToOpen}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-full hover:bg-accent/10 transition-colors inline-block"
                          title="Abrir enlace en nueva pestaña"
                        >
                          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => downloadFile(f.file_url, f.file_name)}
                          className="p-2 rounded-full hover:bg-accent/10 transition-colors"
                          title="Descargar"
                        >
                          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* defense card like evaluator */}
        {thesis.defense_date && (
          <div className="mb-6 p-4 rounded-xl bg-blue-50/50 border border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30">
            <h3 className="text-sm font-bold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
              Información de la Sustentación
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Fecha y Hora</p>
                <p className="text-sm font-medium">{new Date(thesis.defense_date * 1000).toLocaleString()}</p>
              </div>
              {thesis.defense_location && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Lugar</p>
                  <p className="text-sm font-medium">{safeRender(thesis.defense_location)}</p>
                </div>
              )}
            </div>
            {thesis.defense_info && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-1">Observaciones generales</p>
                <p className="text-sm font-medium whitespace-pre-wrap">{safeRender(thesis.defense_info)}</p>
              </div>
            )}
          </div>
        )}

        {thesis?.status === 'finalized' && (
          <div className="mb-6">
            <h3 className="text-sm font-bold">Ajuste de Nota Final Ponderada</h3>
            <div className="flex items-center gap-2 mt-2">
              <input
                type="number"
                step="0.01"
                min="0"
                max="5"
                value={overrideScore !== null ? overrideScore : ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setOverrideScore(v === '' ? null : parseFloat(v));
                }}
                className="border p-1 rounded w-24"
                disabled={savingOverride}
              />
              <Button size="sm" onClick={saveOverride} disabled={savingOverride}>
                {savingOverride ? 'Guardando...' : 'Guardar'}
              </Button>
              {overrideScore !== null && (
                <Button size="sm" variant="ghost" onClick={() => setOverrideScore(null)} disabled={savingOverride}>
                  Restablecer
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {overrideScore !== null
                ? 'Valor manual aplicado al cálculo.'
                : 'Se usa el cálculo automático según evaluaciones.'}
            </p>
          </div>
        )}
        {/* Calificaciones del Documento */}
        {thesis.evaluations?.filter((e: any) => e.evaluation_type !== 'presentation').length > 0 && (
          <div className="mb-6 bg-white dark:bg-slate-950 rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calificaciones del Documento</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {thesis.evaluations.filter((e: any) => e.evaluation_type !== 'presentation').map((ev: any, idx: number) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-border">
                    <p className="text-sm text-muted-foreground font-medium mb-1">{ev.evaluator_name || `Evaluador ${idx + 1}`}</p>
                    <p className="text-3xl font-black text-primary">{ev.final_score != null ? ev.final_score.toFixed(1) : '-'}<span className="text-sm text-muted-foreground font-normal ml-1">/ 5.00</span></p>
                    {ev.concept && <p className="text-xs mt-1 capitalize text-muted-foreground">{ev.concept.replace(/_/g, ' ')}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Calificaciones de Sustentación */}
        {thesis.evaluations?.filter((e: any) => e.evaluation_type === 'presentation').length > 0 && (
          <div className="mb-6 bg-white dark:bg-slate-950 rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calificaciones de Sustentación</h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {thesis.evaluations.filter((e: any) => e.evaluation_type === 'presentation').map((ev: any, idx: number) => (
                  <div key={idx} className="bg-slate-50 dark:bg-slate-900 rounded-xl p-4 border border-border">
                    <p className="text-sm text-muted-foreground font-medium mb-1">{ev.evaluator_name || `Evaluador ${idx + 1}`}</p>
                    <p className="text-3xl font-black text-primary">{ev.final_score != null ? ev.final_score.toFixed(1) : '-'}<span className="text-sm text-muted-foreground font-normal ml-1">/ 5.00</span></p>
                    {ev.concept && <p className="text-xs mt-1 capitalize text-muted-foreground">{ev.concept.replace(/_/g, ' ')}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* consolidated score for admin */}
        {consolidated && (
          <div className="mb-6 bg-white dark:bg-slate-950 rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calificación Consolidada</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <p className="text-4xl font-black text-primary">
                      {consolidated.finalWeighted.toFixed(1)}
                      <span className="text-lg text-muted-foreground font-medium ml-1">/ 5.00</span>
                    </p>
                    <p className="text-sm font-medium text-success mt-1">Nota Final Ponderada</p>
                  </div>
                  <div className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 p-3 rounded-lg font-mono">
                    {overrideScore != null ? (
                      <>Nota fijada manualmente: {overrideScore.toFixed(1)}</>
                    ) : (
                      <>Cálculo: ({consolidated.docAvg.toFixed(1)} x {weights.doc}%) {thesis.defense_date ? `+ (${consolidated.presAvg.toFixed(1)} x ${weights.presentation}%)` : ''} = {consolidated.finalWeighted.toFixed(1)}</>
                    )}
                  </div>
                </div>
                <div className="text-sm">
                  {Object.entries(consolidated.byEvaluator).map(([key, scores], idx) => {
                    const docScore = scores.doc != null ? scores.doc : null;
                    const presScore = scores.pres != null ? scores.pres : null;
                    const displayName = (scores as any).name || normalizePersonName(key);
                    const totalScore = thesis.defense_date
                      ? ((docScore||0)*(weights.doc/100) + (presScore||0)*(weights.presentation/100))
                      : docScore;
                    return (
                      <div key={`${key}-${idx}`} className="mb-2">
                        <strong>{displayName}</strong>: documento {docScore!==null?docScore.toFixed(1):'-'}, sustentación {presScore!==null?presScore.toFixed(1):'-'}, total {totalScore!==null?totalScore.toFixed(1):'-'}
                        <div className="text-xs text-muted-foreground">
                          ({docScore!==null?`${docScore.toFixed(1)} x ${weights.doc}%`:'0'}{thesis.defense_date?` + ${presScore!==null?`${presScore.toFixed(1)} x ${weights.presentation}%`:'0'}`:''})
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* only show revision checklist if there are no evaluators yet */}
        {(!thesis.evaluators || thesis.evaluators.length === 0) && (
          <div className="mb-4">
            <strong>Revisión</strong>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
              {uniqueReviewItems.map((item, index) => (
                <label key={`${item.id}-${index}`} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!checklist[item.id]}
                    onChange={() => setChecklist((c) => ({ ...c, [item.id]: !c[item.id] }))}
                    className="form-checkbox"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        )}
        {thesis.timeline && thesis.timeline.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Historial</h3>
            <ThesisTimeline events={thesis.timeline} isAdmin={true} programDocRubric={programDocRubric ?? undefined} programPresRubric={programPresRubric ?? undefined} />
          </div>
        )}
        {thesis.status === 'submitted' && (
          <>
            <div className="mb-4">
              {uniqueReviewItems.length > 0 && uniqueReviewItems.every(it => checklist[it.id]) ? (
                <Button
                  onClick={assignEvaluators}
                  disabled={loading}
                >
                  Cumple todo
                </Button>
              ) : (
                <>
                  <textarea
                    className="w-full border p-2 mb-2"
                    placeholder="Comentario al regresar"
                    value={comment}
                    onChange={(e)=>setComment(e.target.value)}
                  />
                  <Button variant="destructive" onClick={markNonCompliant} disabled={loading}>Regresar al estudiante</Button>
                </>
              )}
            </div>

          </>
        )}
        {/* schedule defense when status indicates sustentación */}
        {thesis.status === 'sustentacion' && (
          <div className="mb-6 border p-4 rounded bg-info/10">
            <h3 className="font-semibold mb-2">Programar Sustentación</h3>
            {thesis.defense_date ? (
              <div className="space-y-2">
                <p>
                  <strong>Fecha y hora:</strong>{' '}{new Date(thesis.defense_date * 1000).toLocaleString()}
                </p>
                {thesis.defense_location && (
                  <p><strong>Lugar:</strong> {thesis.defense_location}</p>
                )}
                {thesis.defense_info && (
                  <p><strong>Información adicional:</strong> {thesis.defense_info}</p>
                )}
                <Button size="sm" variant="outline" onClick={() => {
                  // clear to allow reschedule
                  setThesis((t:any) => ({ ...t, defense_date: null, defense_location: '', defense_info: '' }));
                }}>
                  Modificar
                </Button>
              </div>
            ) : (
              <DefenseScheduler thesis={thesis} onScheduled={fetchThesis} />
            )}
          </div>
        )}
        {thesis?.status === 'finalized' && actaStatus?.allEvaluatorsDone && (
          <div className="mb-6 border p-4 rounded bg-success/5">
            <h3 className="font-semibold mb-2">🔐 Firma Digital del Acta</h3>

            {/* Estado de firmas */}
            <div className="mb-3 space-y-1">
              <p className="text-xs font-medium">Estado de firmas:</p>
              {digitalSignStatus?.digitalSignatures?.length > 0 ? (
                digitalSignStatus.digitalSignatures.map((sig: any, idx: number) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-green-600 flex-1">
                      ✓ {(sig.signer_role === 'evaluator' || sig.signer_role === 'evaluador') ? 'Evaluador' : sig.signer_role === 'director' ? 'Director' : sig.signer_role === 'program_director' ? 'Dir. Programa' : sig.signer_role}: {sig.signer_name}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 h-5 px-1 text-xs"
                      onClick={async () => {
                        if (!confirm(`¿Eliminar firma de ${sig.signer_name}?`)) return;
                        const token = localStorage.getItem('token');
                        await fetch(`${API_BASE}/theses/${thesis.id}/acta/delete-signature`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' },
                          body: JSON.stringify({ signer_name: sig.signer_name, signer_role: sig.signer_role }),
                        });
                        fetchThesis();
                      }}
                    >
                      🗑
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No hay firmas digitales registradas aún.</p>
              )}
              {!digitalSignStatus?.allSigned && digitalSignStatus?.pendingSigners?.length > 0 && (
                <p className="text-xs text-orange-600 mt-1">
                  Pendientes: {digitalSignStatus.pendingSigners.map((p: any) => normalizePersonName(p)).join(', ')}
                </p>
              )}
            </div>

            {/* Si todas las firmas están completas */}
            {digitalSignStatus?.allSigned && (
              <div className="bg-green-50 border border-green-200 rounded p-3 mb-3">
                <p className="text-sm font-medium text-green-700 mb-2">✅ Todas las firmas han sido registradas</p>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/download-final-signed`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `acta-final-firmada-${thesis.id}.pdf`;
                      a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) {
                      toast.error(e.message || 'Error al descargar');
                    }
                  }}>
                    📄 Descargar PDF final firmado
                  </Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/export?format=word`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `acta-${thesis.id}.docx`;
                      a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) {
                      toast.error(e.message || 'Error al descargar Word');
                    }
                  }}>
                    📝 Descargar Word
                  </Button>
                </div>
              </div>
            )}

            {digitalSignStatus?.allSigned && (
              <div className="border rounded-xl p-6 bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20 mb-3">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-green-900 dark:text-green-100 mb-2">
                      ¡Proceso de sustentación completado!
                    </h3>
                    <p className="text-sm text-green-800 dark:text-green-200 mb-4">
                      Todas las firmas han sido registradas y el proceso ha concluido exitosamente. 
                      A continuación puede descargar todos los documentos relacionados con esta tesis en un solo archivo.
                    </p>
                    <button
                      className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium flex items-center gap-2 transition-colors shadow-md"
                      onClick={async () => {
                        try {
                          const token = localStorage.getItem('token');
                          const resp = await fetch(`${API_BASE}/theses/${thesis.id}/download-complete-package`, {
                            headers: { Authorization: token ? 'Bearer ' + token : '' },
                          });
                          if (!resp.ok) {
                            const err = await resp.json().catch(() => ({ error: 'Error al descargar' }));
                            throw new Error(err.error || 'Error al descargar');
                          }
                          const disposition = resp.headers.get('Content-Disposition') || '';
                          const match = disposition.match(/filename="?([^"]+)"?/);
                          const filename = match ? match[1] : 'Tesis_Completa.zip';
                          const blob = await resp.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = decodeURIComponent(filename);
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          URL.revokeObjectURL(url);
                          toast.success('Paquete completo descargado');
                        } catch (e: any) {
                          toast.error(e.message || 'Error al descargar el paquete completo');
                        }
                      }}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      Descargar Paquete Completo (.zip)
                    </button>
                    <p className="text-xs text-green-700 dark:text-green-300 mt-3">
                      El archivo incluye: todos los documentos enviados, acta de sustentación (PDF y Word), y rúbricas completas (XLSX) de todos los evaluadores.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!digitalSignStatus?.allSigned && <div className="space-y-4">
              {/* Opción 1: Firmar manualmente y subir */}
              <div className="border rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium">Opción 1: Firma manual</p>
                <p className="text-xs text-muted-foreground">
                  Descargue el acta, recoja las firmas físicas o con Adobe Acrobat y súbala de vuelta. Al subir el PDF firmado quedará completo el proceso.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const url = new URL(`${API_BASE}/theses/${thesis.id}/acta/download-for-signing`);
                      const resp = await fetch(url.toString(), {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const dlUrl = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = dlUrl;
                      a.download = `acta-${thesis.id}-para-firmar.pdf`;
                      a.click();
                      window.URL.revokeObjectURL(dlUrl);
                    } catch (e: any) {
                      toast.error(e.message || 'Error al descargar');
                    }
                  }}>
                    📥 Descargar PDF para firmar
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setManualSignFile(e.target.files?.[0] || null)}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={!manualSignFile || uploadingManual}
                    onClick={async () => {
                      if (!manualSignFile) return;
                      setUploadingManual(true);
                      try {
                        const token = localStorage.getItem('token');
                        const form = new FormData();
                        form.append('signed_pdf', manualSignFile);
                        const resp = await fetch(`${API_BASE}/theses/${thesis.id}/acta/upload-manual-signed`, {
                          method: 'POST',
                          headers: { Authorization: token ? `Bearer ${token}` : '' },
                          body: form,
                        });
                        const data = await resp.json();
                        if (!resp.ok) throw new Error(data.error || 'No se pudo subir');
                        toast.success('Acta firmada subida correctamente');
                        setManualSignFile(null);
                        fetchThesis();
                      } catch (e: any) {
                        toast.error(e.message || 'Error al subir');
                      } finally {
                        setUploadingManual(false);
                      }
                    }}
                  >
                    {uploadingManual ? 'Subiendo...' : '📤 Subir acta firmada'}
                  </Button>
                </div>
              </div>

              {/* Opción 2: Firma digital con enlaces */}
              {digitalSignStatus?.pendingSigners?.length > 0 && (
              <div className="border rounded-lg p-4">
                <p className="text-sm font-medium mb-1">Opción 2: Firma digital sin login</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Genere enlaces para que cada firmante firme digitalmente desde su dispositivo sin necesidad de iniciar sesión.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
                  <p className="text-xs font-medium text-blue-900 mb-2">🔗 Generar enlaces de firma sin login:</p>
                  {(() => {
                    const anyLinkGenerated = Object.keys(generatedSigningLinks).length > 0;
                    const progDirPending = digitalSignStatus.pendingSigners.find((p: any) => (typeof p === 'string' ? 'director' : p?.role) === 'program_director');
                    const progDirNameMissing = progDirPending && !digitalProgDirectorName.trim();
                    return digitalSignStatus.pendingSigners.map((pending: any, idx: number) => {
                      const name = normalizePersonName(pending);
                      const key = normalizePersonKey(pending);
                      const role = typeof pending === 'string' ? 'director' : (pending?.role || 'director');
                      const isProgDir = role === 'program_director';
                      const displayName = isProgDir && digitalProgDirectorName.trim() ? digitalProgDirectorName.trim() : name;
                      const selectedTitle = signerTitles[key] || '';
                      const fullName = selectedTitle ? `${selectedTitle} ${displayName}` : displayName;
                      return (
                        <div key={`${key}-${idx}`}>
                          {isProgDir && (
                            <div className="mb-1">
                              <input
                                className="border rounded px-2 py-1 text-xs w-full"
                                placeholder="Nombre del Director del Programa (obligatorio)"
                                value={digitalProgDirectorName}
                                onChange={(e) => { const v = e.target.value.toUpperCase(); setDigitalProgDirectorName(v); if (id) localStorage.setItem(`acta_progdir_${id}`, v); }}
                                disabled={anyLinkGenerated}
                              />
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0 text-xs space-y-1">
                              <div className="flex items-center gap-2">
                                <select
                                  className="border rounded px-1 py-0.5 text-xs w-28"
                                  value={selectedTitle}
                                  onChange={(e) => { const next = { ...signerTitles, [key]: e.target.value }; setSignerTitles(next); if (id) localStorage.setItem(`acta_titles_${id}`, JSON.stringify(next)); }}
                                >
                                  <option value="">Título...</option>
                                  <option value="Profesional">Profesional</option>
                                  <option value="Esp.">Especialista</option>
                                  <option value="Mg.">Magíster</option>
                                  <option value="PhD.">PhD</option>
                                  <option value="Dr.">Doctor</option>
                                </select>
                                <p className="font-medium">{fullName}</p>
                              </div>
                              <p className="text-muted-foreground">{role === 'evaluator' ? 'Evaluador' : role === 'director' ? 'Director' : 'Director del Programa'}</p>
                            </div>
                            {generatedSigningLinks[key]?.url ? (
                              <Button variant="outline" size="sm" onClick={() => handleCopyLink(key)} className="whitespace-nowrap">
                                {generatedSigningLinks[key].copied ? '✅ Copiado!' : '📋 Copiar enlace'}
                              </Button>
                            ) : (
                              <Button
                                variant="outline" size="sm"
                                disabled={!selectedTitle || progDirNameMissing}
                                onClick={() => handleGenerateSigningLink(key, fullName, role)}
                                className="whitespace-nowrap"
                                title={progDirNameMissing ? 'Ingrese el nombre del Director del Programa' : !selectedTitle ? 'Seleccione un título académico' : ''}
                              >
                                🔗 Generar enlace
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
              )}
            </div>}
          </div>
        )}

        {/* CARTA MERITORIA — visible solo si nota >= 4.8 y tesis aprobada para sustentación o finalizada */}
        {meritoriaStatus?.qualifies && (thesis?.status === 'sustentacion' || thesis?.status === 'finalized') && (
          <div className="mb-6 border p-4 rounded bg-yellow-50">
            <h3 className="font-semibold mb-1">🏅 Carta de Recomendación Meritoria</h3>
            <p className="text-xs text-muted-foreground mb-3">
              La tesis obtuvo una nota de <strong>{Number(meritoriaStatus.score).toFixed(1)}</strong>, por lo que requiere carta de recomendación meritoria firmada por los evaluadores.
            </p>

            {/* Estado de firmas */}
            <div className="mb-3 space-y-1">
              <p className="text-xs font-medium">Firmas de evaluadores:</p>
              {meritoriaStatus.directors.map((d: any, idx: number) => {
                const name = normalizePersonName(d);
                const key = normalizePersonKey(d);
                const signed = meritoriaStatus.signatures.some((s: any) => s.signer_name.toLowerCase() === name.toLowerCase());
                return (
                  <div key={`${key}-${idx}`} className={`text-xs ${signed ? 'text-green-600' : 'text-orange-500'}`}>
                    {signed ? '✓' : '○'} {name}
                  </div>
                );
              })}
            </div>

            {/* Sección de enlaces compartibles para meritoria */}
            {!meritoriaStatus.allSigned && meritoriaStatus.pendingDirectors?.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3 space-y-2">
                <p className="text-xs font-medium text-blue-900 mb-2">🔗 Generar enlaces de firma sin login:</p>
                {meritoriaStatus.pendingDirectors.map((pending: any, idx: number) => {
                  const name = normalizePersonName(pending);
                  const key = normalizePersonKey(pending);
                  return (
                    <div key={`${key}-${idx}`} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0 text-xs">
                        <p className="font-medium">{name}</p>
                        <p className="text-muted-foreground">Evaluador</p>
                      </div>
                      {generatedSigningLinks[key]?.url ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyLink(key)}
                          className="whitespace-nowrap"
                        >
                          {generatedSigningLinks[key].copied ? '✅ Copiado!' : '📋 Copiar enlace'}
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleGenerateMeritoriaLink(key)}
                          className="whitespace-nowrap"
                        >
                          🔗 Generar enlace
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Banner firmada completa */}
            {meritoriaStatus.allSigned && (
              <div className="bg-green-50 border border-green-200 rounded p-3 mb-3">
                <p className="text-sm font-medium text-green-700 mb-2">✅ Carta firmada por todos los evaluadores</p>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/meritoria/download-final?format=pdf`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      a.download = `carta-meritoria-${thesis.id}.pdf`; a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) { toast.error(e.message || 'Error'); }
                  }}>📄 Descargar PDF firmado</Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/meritoria/download-final?format=word`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      a.download = `carta-meritoria-${thesis.id}.docx`; a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) { toast.error(e.message || 'Error'); }
                  }}>📝 Descargar Word</Button>
                </div>
              </div>
            )}

            {/* Formulario subida y descarga para firmar */}
            {!meritoriaStatus.allSigned && (
              <div>
                <div className="flex gap-2 flex-wrap mb-3">
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/meritoria/download-for-signing?format=pdf`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      a.download = `carta-meritoria-${thesis.id}-para-firmar.pdf`; a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) { toast.error(e.message || 'Error'); }
                  }}>📥 Descargar PDF para firmar</Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      const token = localStorage.getItem('token');
                      const resp = await fetch(`${API_BASE}/theses/${thesis.id}/meritoria/download-for-signing`, {
                        headers: { Authorization: token ? `Bearer ${token}` : '' },
                      });
                      if (!resp.ok) throw new Error('No se pudo descargar');
                      const blob = await resp.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a'); a.href = url;
                      a.download = `carta-meritoria-${thesis.id}-para-firmar.docx`; a.click();
                      window.URL.revokeObjectURL(url);
                    } catch (e: any) { toast.error(e.message || 'Error'); }
                  }}>📥 Descargar Word para firmar</Button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium">Subir PDF firmado por director:</p>
                  <select
                    className="border rounded px-2 py-1 text-sm w-full"
                    value={meritoriaSignerName}
                    onChange={(e) => { setMeritoriaSignerName(e.target.value); setMeritoriaSignerTitle(""); }}
                  >
                    <option value="">Seleccione director...</option>
                    {meritoriaStatus.pendingDirectors.map((d: any, idx: number) => {
                      const name = normalizePersonName(d);
                      const key = normalizePersonKey(d);
                      return (
                        <option key={`${key}-${idx}`} value={name}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                  {meritoriaSignerName && (
                    <select
                      className="border rounded px-2 py-1 text-sm w-full"
                      value={meritoriaSignerTitle}
                      onChange={(e) => setMeritoriaSignerTitle(e.target.value)}
                    >
                      <option value="">Título académico...</option>
                      <option value="Profesional">Profesional</option>
                      <option value="Esp.">Especialista</option>
                      <option value="Mg.">Magíster</option>
                      <option value="PhD.">PhD</option>
                      <option value="Dr.">Doctor</option>
                    </select>
                  )}
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setMeritoriaSignFile(e.target.files?.[0] || null)}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    disabled={!meritoriaSignFile || !meritoriaSignerName || loadingMeritoria}
                    onClick={async () => {
                      if (!meritoriaSignFile || !meritoriaSignerName) return;
                      setLoadingMeritoria(true);
                      try {
                        const token = localStorage.getItem('token');
                        const form = new FormData();
                        form.append('signed_pdf', meritoriaSignFile);
                        const fullMeritoriaName = meritoriaSignerTitle && meritoriaSignerName
                          ? `${meritoriaSignerTitle} ${meritoriaSignerName}`
                          : meritoriaSignerName;
                        form.append('signer_name', fullMeritoriaName);
                        const resp = await fetch(`${API_BASE}/theses/${thesis.id}/meritoria/upload-signed`, {
                          method: 'POST',
                          headers: { Authorization: token ? `Bearer ${token}` : '' },
                          body: form,
                        });
                        const data = await resp.json();
                        if (!resp.ok) throw new Error(data.error || 'No se pudo subir');
                        toast.success('Firma registrada en carta meritoria');
                        setMeritoriaSignFile(null);
                        setMeritoriaSignerName('');
                        setMeritoriaSignerTitle('');
                        fetchThesis();
                      } catch (e: any) {
                        toast.error(e.message || 'Error al subir');
                      } finally {
                        setLoadingMeritoria(false);
                      }
                    }}
                  >
                    {loadingMeritoria ? 'Subiendo...' : '📤 Registrar firma'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {(thesis.status === 'revision_minima' || thesis.status === 'revision_cuidados') && (
          <div className="mb-6 border p-4 rounded bg-warning/10">
            <h3 className="font-semibold mb-2">Enviar retroalimentación al estudiante</h3>
            <textarea
              className="w-full border p-2 mb-2"
              placeholder="Comentario para el estudiante"
              value={comment}
              onChange={(e)=>setComment(e.target.value)}
            />
            <input type="file" onChange={(e)=>{
              const files=e.target.files; if(files&&files[0]){
                const form=new FormData(); form.append('file', files[0]);
                const token=localStorage.getItem('token');
                fetch(`${API_BASE}/theses/${thesis.id}/feedback`,{method:'POST',headers:{Authorization:token?`Bearer ${token}`:''},body: form}).then(()=>toast.success('Feedback enviado'));
              }
            }} />
            <div className="mt-4 flex gap-2">
              <Button onClick={async () => {
                const token=localStorage.getItem('token');
                await fetch(`${API_BASE}/theses/${thesis.id}/decision`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: token?`Bearer ${token}`:'' },
                  body: JSON.stringify({ action: 'sustentacion', comment }),
                });
                toast.success('Tesis movida a sustentación');
                fetchThesis && fetchThesis();
              }}>Aprobar para Sustentación</Button>
              <Button variant="destructive" onClick={async () => {
                const token=localStorage.getItem('token');
                await fetch(`${API_BASE}/theses/${thesis.id}/decision`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: token?`Bearer ${token}`:'' },
                  body: JSON.stringify({ action: 'reject', comment }),
                });
                toast.success('Tesis regresada a borrador');
                fetchThesis && fetchThesis();
              }}>Regresar a borrador</Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
        <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
          <DialogHeader>
            <DialogTitle>{isAddingEvaluator ? 'Agregar evaluador' : 'Reemplazar evaluador'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {isAddingEvaluator
                ? 'Selecciona un evaluador para agregar a esta tesis.'
                : (
                    <>
                      Selecciona el evaluador que reemplazará a <strong>{normalizePersonName(replacingEvaluator)}</strong>.
                    </>
                  )}
            </p>
            {loadingAvailableEvaluators ? (
              <p className="text-sm text-muted-foreground">Cargando evaluadores...</p>
            ) : (
              <>
                <Input
                  placeholder="Buscar evaluadores..."
                  value={evaluatorSearchQuery}
                  onChange={(e) => setEvaluatorSearchQuery(e.target.value)}
                  className="w-full"
                />
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableEvaluators.filter((ev: any) => {
                    const q = evaluatorSearchQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (ev.full_name || '').toLowerCase().includes(q) ||
                      (ev.institutional_email || '').toLowerCase().includes(q) ||
                      (ev.specialty || '').toLowerCase().includes(q);
                  }).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay evaluadores disponibles.</p>
                  ) : (
                    availableEvaluators.filter((ev: any) => {
                      const q = evaluatorSearchQuery.trim().toLowerCase();
                      if (!q) return true;
                      return (ev.full_name || '').toLowerCase().includes(q) ||
                        (ev.institutional_email || '').toLowerCase().includes(q) ||
                        (ev.specialty || '').toLowerCase().includes(q);
                    }).map((ev: any) => (
                      <button
                        key={ev.id}
                        onClick={() => !ev._isDirector && setSelectedReplacementId(ev.id)}
                        disabled={ev._isDirector}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                          ev._isDirector
                            ? 'border-red-200 bg-red-50 opacity-60 cursor-not-allowed'
                            : selectedReplacementId === ev.id
                            ? 'border-accent bg-accent/10'
                            : 'border-border hover:border-accent/30'
                        }`}
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{ev.full_name || ev.institutional_email}</p>
                          <p className="text-xs text-muted-foreground truncate">{ev.specialty || ev.institutional_email}</p>
                          {ev._isDirector && (
                            <p className="text-xs text-red-500 font-medium mt-0.5">Director(a) de esta tesis — no puede ser evaluador(a)</p>
                          )}
                        </div>
                        {selectedReplacementId === ev.id && (
                          <span className="text-xs font-bold text-accent">✓</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowReplaceDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={isAddingEvaluator ? performAddEvaluator : performReplaceEvaluator}
                disabled={!selectedReplacementId || replacingEvaluatorLoading}
              >
                {replacingEvaluatorLoading ? (isAddingEvaluator ? 'Agregando...' : 'Reemplazando...') : (isAddingEvaluator ? 'Agregar' : 'Reemplazar')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
