import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import { getApiBase } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import DigitalSignSection from "@/components/thesis/DigitalSignSection";

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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err: any) {
    alert(err.message || 'No se pudo descargar el archivo');
  }
}

function normalizePersonName(person: any): string {
  if (typeof person === 'string' || typeof person === 'number') return String(person);
  if (!person) return '';
  const candidate = person.name ?? person.user_id;
  if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
  if (typeof candidate === 'object' && candidate !== null) return String(candidate.name ?? candidate.user_id ?? '');
  return '';
}

function normalizePersonKey(person: any): string {
  if (typeof person === 'string') return person;
  if (!person) return '';
  if (person.user_id) return String(person.user_id);
  if (person.id) return String(person.id);
  if (person.name) return String(person.name);
  try { return JSON.stringify(person, Object.keys(person).sort()); } catch { return String(person); }
}

export default function DirectorThesisDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [thesis, setThesis] = useState<any>(null);
  const [weights, setWeights] = useState<{ doc: number; presentation: number }>({ doc: 70, presentation: 30 });
  const [actaStatus, setActaStatus] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/theses/${id}`, { headers: { Authorization: token ? `Bearer ${token}` : '' } })
      .then(r => r.json())
      .then(data => setThesis(data))
      .catch(() => toast.error('No se pudo cargar la tesis'));

    fetch(`${API_BASE}/admin/weights`, { headers: { Authorization: token ? `Bearer ${token}` : '' } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setWeights({ doc: data.doc ?? 70, presentation: data.presentation ?? 30 }); })
      .catch(() => {});
    
    fetch(`${API_BASE}/theses/${id}/acta/digital-signature-status`, { headers: { Authorization: token ? `Bearer ${token}` : '' } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setActaStatus(data); })
      .catch(() => {});
  }, [id]);

  const consolidated = (() => {
    if (!thesis?.evaluations?.length) return null;
    const docScores = thesis.evaluations.filter((e: any) => e.evaluation_type !== 'presentation').map((e: any) => e.final_score).filter((n: any) => n != null);
    const presScores = thesis.evaluations.filter((e: any) => e.evaluation_type === 'presentation').map((e: any) => e.final_score).filter((n: any) => n != null);
    const docAvg = docScores.length ? docScores.reduce((a: number, b: number) => a + b, 0) / docScores.length : 0;
    const presAvg = presScores.length ? presScores.reduce((a: number, b: number) => a + b, 0) / presScores.length : 0;
    let finalWeighted = thesis.defense_date
      ? (docAvg * (weights.doc / 100)) + (presAvg * (weights.presentation / 100))
      : docAvg;
    if (thesis.status === 'finalized' && thesis.final_weighted_override != null) {
      finalWeighted = thesis.final_weighted_override;
    }
    const byEvaluator: Record<string, { doc: number | null; pres: number | null; name?: string }> = {};
    thesis.evaluations.forEach((ev: any) => {
      const key = normalizePersonKey(ev.evaluator_name || ev);
      const name = normalizePersonName(ev.evaluator_name || ev) || 'Evaluador';
      if (!byEvaluator[key]) byEvaluator[key] = { doc: null, pres: null };
      if (ev.evaluation_type === 'presentation') byEvaluator[key].pres = ev.final_score;
      else byEvaluator[key].doc = ev.final_score;
      if (!byEvaluator[key].name) byEvaluator[key].name = name;
    });
    return { docAvg, presAvg, finalWeighted, byEvaluator };
  })();

  if (!thesis) {
    return (
      <AppLayout role="evaluator">
        <div className="max-w-4xl mx-auto px-4 py-8 text-muted-foreground">Cargando...</div>
      </AppLayout>
    );
  }

  const safeStr = (v: any) => {
    if (v == null) return '';
    if (typeof v === 'string' || typeof v === 'number') return String(v);
    if (Array.isArray(v)) return v.map(safeStr).join(', ');
    return v.name ?? v.user_id ?? JSON.stringify(v);
  };

  return (
    <AppLayout role="evaluator">
      <div className="max-w-4xl mx-auto px-4 sm:px-0">
        <div className="mb-4">
          <Button variant="outline" size="sm" onClick={() => navigate('/evaluator/my-students')}>
            ← Mis Estudiantes
          </Button>
        </div>

        {/* Thesis info */}
        <div className="mb-6 bg-card p-6 rounded-lg shadow-card">
          <h2 className="font-heading text-2xl font-bold mb-3">Detalle de Tesis</h2>
          <p className="text-sm text-muted-foreground mb-2"><strong>Estado:</strong> <span className="capitalize">{safeStr(thesis.status)}</span></p>
          {thesis.title && <p className="text-lg font-semibold mb-2"><strong>Título:</strong> {safeStr(thesis.title)}</p>}
          {thesis.students && thesis.students.length > 0 && (
            <div className="mb-3">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Autor{thesis.students.length > 1 ? 'es' : ''}:</strong> {thesis.students.map((s: any) => safeStr(s.name || s.full_name || s)).join(', ')}
              </p>
              {thesis.students.map((student: any, idx: number) => (
                <div key={idx} className="ml-4 text-xs text-muted-foreground space-y-0.5 mb-2">
                  {student.student_code && <p><strong>Código:</strong> {student.student_code}</p>}
                  {student.cedula && <p><strong>Cédula:</strong> {student.cedula}</p>}
                  {student.institutional_email && <p><strong>Correo institucional:</strong> {student.institutional_email}</p>}
                  {student.email && student.email !== student.institutional_email && <p><strong>Correo personal:</strong> {student.email}</p>}
                  {student.cvlac && <p><strong>CVLAC:</strong> {student.cvlac}</p>}
                </div>
              ))}
            </div>
          )}
          {!thesis.students?.length && thesis.student_name && (
            <p className="text-sm text-muted-foreground mb-1"><strong>Estudiante:</strong> {safeStr(thesis.student_name)}</p>
          )}
          {thesis.directors?.length > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              <strong>Director{thesis.directors.length > 1 ? 'es' : ''}:</strong> {thesis.directors.map((d: any) => safeStr(d)).join(', ')}
            </p>
          )}
          {thesis.programs?.length > 0 && (
            <p className="text-sm text-muted-foreground mb-1">
              <strong>Programa{thesis.programs.length > 1 ? 's' : ''}:</strong> {thesis.programs.map((p: any) => safeStr(p)).join(', ')}
            </p>
          )}
          {!thesis.programs?.length && thesis.program_name && (
            <p className="text-sm text-muted-foreground mb-1"><strong>Programa:</strong> {safeStr(thesis.program_name)}</p>
          )}
        </div>

        {/* Documentos enviados */}
        {thesis.files && thesis.files.length > 0 && (
          <div className="mb-6">
            <h3 className="font-heading text-lg font-bold text-foreground mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              Documentos enviados
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {thesis.files.map((f: any, fi: number) => {
                const isUrl = f.file_url?.startsWith('http://') || f.file_url?.startsWith('https://') ||
                              f.file_name?.startsWith('http://') || f.file_name?.startsWith('https://');
                const isPdf = f.file_name?.toLowerCase().endsWith('.pdf');
                const isDoc = f.file_name?.toLowerCase().match(/\.(doc|docx)$/);
                const urlToOpen = isUrl ? (f.file_url?.startsWith('http') ? f.file_url : f.file_name) : null;
                return (
                  <div key={fi} className="group relative flex items-center gap-3 p-4 rounded-lg border border-border bg-card hover:bg-accent/5 hover:border-accent/50 transition-all duration-200 shadow-sm hover:shadow-md">
                    <div className="flex-shrink-0">
                      {isUrl ? (
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                        </div>
                      ) : isPdf ? (
                        <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                          <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        </div>
                      ) : isDoc ? (
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isUrl ? (
                        <a href={urlToOpen} target="_blank" rel="noopener noreferrer" className="block w-full group-hover:text-accent transition-colors">
                          <p className="font-medium text-sm truncate">{f.file_name}</p>
                          {urlToOpen !== f.file_name && <p className="text-xs text-muted-foreground truncate mt-0.5">{urlToOpen}</p>}
                        </a>
                      ) : (
                        <button type="button" className="text-left w-full group-hover:text-accent transition-colors" onClick={() => downloadFile(f.file_url, f.file_name)}>
                          <p className="font-medium text-sm truncate">{f.file_name}</p>
                        </button>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      {isUrl ? (
                        <a href={urlToOpen} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full hover:bg-accent/10 transition-colors inline-block" title="Abrir enlace">
                          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </a>
                      ) : (
                        <button type="button" onClick={() => downloadFile(f.file_url, f.file_name)} className="p-2 rounded-full hover:bg-accent/10 transition-colors" title="Descargar">
                          <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Evaluators */}
        {thesis.evaluators?.length > 0 && (
          <div className="mb-6 bg-white dark:bg-slate-950 rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Evaluadores</h3>
            </div>
            <div className="p-6 space-y-3">
              {thesis.evaluators.map((ev: any, idx: number) => {
                const docSent = thesis.evaluations?.some((x: any) => x.evaluator_id === ev.id && x.evaluation_type !== 'presentation');
                const presSent = thesis.evaluations?.some((x: any) => x.evaluator_id === ev.id && x.evaluation_type === 'presentation');
                const docEval = thesis.evaluations?.find((x: any) => x.evaluator_id === ev.id && x.evaluation_type !== 'presentation');
                const presEval = thesis.evaluations?.find((x: any) => x.evaluator_id === ev.id && x.evaluation_type === 'presentation');
                return (
                  <div key={ev.id || idx} className="border border-border rounded-lg p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="font-medium">{ev.name || ev.full_name}</span>
                      <span className="text-xs text-muted-foreground">{ev.email}</span>
                      {ev.due_date && <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">Límite: {ev.due_date}</span>}
                      {ev.is_blind && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Par Ciego</span>}
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className={docSent ? 'text-success' : 'text-muted-foreground'}>
                        Documento: {docSent ? `✓ ${docEval?.final_score?.toFixed(1) ?? ''}` : 'Pendiente'}
                      </span>
                      <span className={presSent ? 'text-success' : 'text-muted-foreground'}>
                        Sustentación: {presSent ? `✓ ${presEval?.final_score?.toFixed(1) ?? ''}` : 'Pendiente'}
                      </span>
                    </div>
                    {ev.revisionFiles?.length > 0 && (
                      <div className="mt-2">
                        <span className="text-xs font-semibold text-muted-foreground">Archivos del Evaluador:</span>
                        <div className="flex flex-wrap gap-2 mt-1">
                          {ev.revisionFiles.map((f: any, fi: number) => (
                            <button
                              key={fi}
                              onClick={() => downloadFile(f.url, f.name)}
                              className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded border border-blue-200 dark:border-blue-700 hover:bg-blue-100 transition-colors"
                            >
                              {f.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Calificaciones del documento */}
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

        {/* Calificación consolidada */}
        {consolidated && (
          <div className="mb-6 bg-white dark:bg-slate-950 rounded-2xl border border-border shadow-sm overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-border">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Calificación Consolidada</h3>
            </div>
            <div className="p-6 space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <p className="text-4xl font-black text-primary">
                    {consolidated.finalWeighted.toFixed(1)}
                    <span className="text-lg text-muted-foreground font-medium ml-1">/ 5.00</span>
                  </p>
                  <p className="text-sm font-medium text-success mt-1">Nota Final Ponderada</p>
                </div>
                <div className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-800 p-3 rounded-lg font-mono">
                  Cálculo: ({consolidated.docAvg.toFixed(1)} x {weights.doc}%)
                  {thesis.defense_date ? ` + (${consolidated.presAvg.toFixed(1)} x ${weights.presentation}%)` : ''}
                  {' '}= {consolidated.finalWeighted.toFixed(1)}
                </div>
              </div>
              <div className="text-sm">
                {Object.entries(consolidated.byEvaluator).map(([key, scores], idx) => {
                  const docScore = scores.doc;
                  const presScore = scores.pres;
                  const displayName = scores.name || key;
                  const totalScore = thesis.defense_date
                    ? ((docScore || 0) * (weights.doc / 100) + (presScore || 0) * (weights.presentation / 100))
                    : docScore;
                  return (
                    <div key={`${key}-${idx}`} className="mb-2">
                      <strong>{displayName}</strong>: documento {docScore != null ? docScore.toFixed(1) : '-'}, sustentación {presScore != null ? presScore.toFixed(1) : '-'}, total {totalScore != null ? (totalScore as number).toFixed(1) : '-'}
                      <div className="text-xs text-muted-foreground">
                        ({docScore != null ? `${docScore.toFixed(1)} x ${weights.doc}%` : '0'}
                        {thesis.defense_date ? ` + ${presScore != null ? `${presScore.toFixed(1)} x ${weights.presentation}%` : '0'}` : ''})
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        {thesis.timeline?.length > 0 && (
          <div className="mb-6">
            <h3 className="font-semibold mb-2">Historial</h3>
            <ThesisTimeline events={thesis.timeline} isAdmin={true} />
          </div>
        )}


        {id && user && thesis?.defense_date && (
          <DigitalSignSection
            thesisId={id}
            userName={user.full_name || ""}
            myRole="director"
            myUserId={user.id}
            showAllPending={true}
            canDelete={true}
          />
        )}
      </div>
    </AppLayout>
  );
}
