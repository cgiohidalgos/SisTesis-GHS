import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();
const TITLES = ["PhD.", "Mg.", "Esp.", "Dr.", "Profesional"];

function stripTitle(name: string): string {
  if (!name) return "";
  let n = name.trim().toLowerCase();
  for (const t of ["profesional", "esp.", "mg.", "phd.", "dr."]) {
    if (n.startsWith(t + " ")) { n = n.slice(t.length + 1).trim(); break; }
  }
  return n;
}

function personName(p: any): string {
  if (!p) return "";
  if (typeof p === "string") return p;
  return p.name ?? p.user_id ?? "";
}

function personRole(p: any): string {
  if (!p || typeof p === "string") return "";
  return p.role ?? "";
}

function roleLabel(role: string) {
  if (role === "evaluator") return "Evaluador";
  if (role === "director") return "Director";
  if (role === "program_director") return "Dir. Programa";
  return role;
}

function personKey(p: any): string {
  if (typeof p === "string") return p;
  if (!p) return "";
  if (p.user_id) return String(p.user_id);
  if (p.name) return String(p.name);
  return JSON.stringify(p);
}

interface Props {
  thesisId: string;
  userName: string;
  myRole: "evaluator" | "director";
  myUserId?: string | number | null;
  /** Directors see all pending signers; evaluators only see their own */
  showAllPending?: boolean;
  canDelete?: boolean;
}

export default function DigitalSignSection({ thesisId, userName, myRole, myUserId, showAllPending, canDelete }: Props) {
  const [status, setStatus] = useState<any>(null);
  const [generatedLinks, setGeneratedLinks] = useState<Record<string, { url: string; copied: boolean }>>({});
  const [signerTitles, setSignerTitles] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem(`acta_titles_${thesisId}`) || "{}"); } catch { return {}; }
  });
  const [progDirName, setProgDirName] = useState<string>(() =>
    localStorage.getItem(`acta_progdir_${thesisId}`) || ""
  );
  const [loadingLink, setLoadingLink] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingWord, setDownloadingWord] = useState(false);

  const fetchStatus = async () => {
    try {
      const token = localStorage.getItem("token");
      const r = await fetch(`${API_BASE}/theses/${thesisId}/acta/digital-signature-status`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (r.ok) setStatus(await r.json());
      else setStatus({ digitalSignatures: [], pendingSigners: [], requiredSigners: [], allSigned: false });
    } catch {
      setStatus({ digitalSignatures: [], pendingSigners: [], requiredSigners: [], allSigned: false });
    }
  };

  useEffect(() => { if (thesisId) fetchStatus(); }, [thesisId]);

  if (!status || (status.requiredSigners?.length === 0 && status.digitalSignatures?.length === 0)) return null;

  const normalizeSignUrl = (url: string) => {
    try {
      const u = new URL(url, window.location.origin);
      return `${window.location.protocol}//${window.location.host}/sign/token/${u.pathname.split("/").pop()}`;
    } catch { return url; }
  };

  const handleGenerate = async (pending: any) => {
    const key = personKey(pending);
    setLoadingLink(key);
    try {
      const token = localStorage.getItem("token");
      const isProgDir = personRole(pending) === "program_director";
      const baseName = isProgDir && progDirName.trim() ? progDirName.trim() : stripTitle(personName(pending));
      const title = signerTitles[key] || "";
      const signerName = title ? `${title} ${baseName}`.trim() : baseName;
      const signerRole = personRole(pending) || myRole;
      const resp = await fetch(`${API_BASE}/theses/${thesisId}/generate-signing-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ signerName, signerRole }),
      });
      if (!resp.ok) throw new Error((await resp.json().catch(() => ({}))).error || "Error");
      const data = await resp.json();
      setGeneratedLinks(prev => ({ ...prev, [key]: { url: normalizeSignUrl(data.signUrl), copied: false } }));
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setLoadingLink(null);
    }
  };

  const handleDownload = async (format: "pdf" | "word") => {
    format === "pdf" ? setDownloadingPdf(true) : setDownloadingWord(true);
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${API_BASE}/theses/${thesisId}/acta/export?format=${format}`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!resp.ok) throw new Error("Error al descargar");
      const disposition = resp.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const ext = format === "pdf" ? "pdf" : "docx";
      const filename = match ? match[1] : `acta-${thesisId}.${ext}`;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      format === "pdf" ? setDownloadingPdf(false) : setDownloadingWord(false);
    }
  };

  // Which pending signers to show generate buttons for
  const pendingToShow = showAllPending
    ? (status.pendingSigners ?? [])
    : (status.pendingSigners ?? []).filter((p: any) => {
        const role = personRole(p);
        if (role !== myRole) return false;
        if (myUserId && p.user_id && String(p.user_id) === String(myUserId)) return true;
        return stripTitle(personName(p)) === stripTitle(userName);
      });

  return (
    <div className="mt-6 border p-4 rounded bg-success/5">
      <h3 className="font-semibold mb-2">🔐 Firma Digital del Acta</h3>

      {/* Estado de firmas */}
      <div className="mb-3 space-y-1">
        <p className="text-xs font-medium">Estado de firmas:</p>
        {(status.digitalSignatures ?? []).length > 0 ? (
          (status.digitalSignatures as any[]).map((sig: any, idx: number) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-green-600 flex-1">
                ✓ {roleLabel(sig.signer_role)}: {sig.signer_name}
              </span>
              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-700 h-5 px-1 text-xs"
                  onClick={async () => {
                    if (!confirm(`¿Eliminar firma de ${sig.signer_name}?`)) return;
                    const token = localStorage.getItem("token");
                    await fetch(`${API_BASE}/theses/${thesisId}/acta/delete-signature`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
                      body: JSON.stringify({ signer_name: sig.signer_name, signer_role: sig.signer_role }),
                    });
                    fetchStatus();
                  }}
                >
                  🗑
                </Button>
              )}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No hay firmas digitales registradas aún.</p>
        )}
        {!status.allSigned && (status.pendingSigners ?? []).length > 0 && (
          <p className="text-xs text-orange-600 mt-1">
            Pendientes: {(status.pendingSigners as any[]).map(personName).join(", ")}
          </p>
        )}
      </div>

      {/* Si todas las firmas están completas */}
      {status.allSigned && (
        <div className="bg-green-50 border border-green-200 rounded p-3 mb-3">
          <p className="text-sm font-medium text-green-700 mb-2">✅ Todas las firmas han sido registradas</p>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => handleDownload("pdf")} disabled={downloadingPdf}>
              {downloadingPdf ? "Descargando..." : "📄 Descargar PDF final firmado"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleDownload("word")} disabled={downloadingWord}>
              {downloadingWord ? "Descargando..." : "📝 Descargar Word"}
            </Button>
          </div>
        </div>
      )}

      {status.allSigned && (
        <div className="border rounded-xl p-6 bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20 mb-3">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-green-900 dark:text-green-100 mb-2">¡Proceso de sustentación completado!</h3>
              <p className="text-sm text-green-800 dark:text-green-200 mb-4">
                Todas las firmas han sido registradas y el proceso ha concluido exitosamente.
                A continuación puede descargar todos los documentos relacionados con esta tesis en un solo archivo.
              </p>
              <button
                className="px-6 py-3 rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium flex items-center gap-2 transition-colors shadow-md"
                onClick={async () => {
                  try {
                    const token = localStorage.getItem("token");
                    const resp = await fetch(`${API_BASE}/theses/${thesisId}/download-complete-package`, {
                      headers: { Authorization: token ? `Bearer ${token}` : "" },
                    });
                    if (!resp.ok) throw new Error("Error al descargar");
                    const disposition = resp.headers.get("Content-Disposition") || "";
                    const match = disposition.match(/filename="?([^"]+)"?/);
                    const filename = match ? decodeURIComponent(match[1]) : "Tesis_Completa.zip";
                    const blob = await resp.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = filename;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                  } catch (e: any) { alert(e.message || "Error al descargar"); }
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

      {/* Generate links for pending signers */}
      {!status.allSigned && pendingToShow.length > 0 && (
        <div className="border rounded-lg p-3 space-y-3 bg-blue-50 border-blue-200">
          <p className="text-xs font-medium text-blue-900">🔗 Generar enlaces de firma sin login:</p>

          {showAllPending && (status.pendingSigners ?? []).some((p: any) => personRole(p) === "program_director") && (
            <div className="space-y-1">
              <p className="text-xs text-blue-800 font-medium">Nombre del Director del Programa:</p>
              <input
                className="border rounded px-2 py-1 text-xs w-full"
                placeholder="Nombre completo en mayúsculas"
                value={progDirName}
                onChange={e => { const v = e.target.value.toUpperCase(); setProgDirName(v); localStorage.setItem(`acta_progdir_${thesisId}`, v); }}
              />
            </div>
          )}

          {(pendingToShow as any[]).map((pending: any) => {
            const key = personKey(pending);
            const isProgDir = personRole(pending) === "program_director";
            const baseName = isProgDir && progDirName.trim() ? progDirName.trim() : stripTitle(personName(pending));
            const title = signerTitles[key] || "";
            const genLink = generatedLinks[key];
            const missingProgDir = isProgDir && !progDirName.trim();
            const missingTitle = !title;

            return (
              <div key={key} className="border-t border-blue-200 pt-2 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="border rounded px-1 py-0.5 text-xs w-24"
                    value={title}
                    onChange={e => {
                      const next = { ...signerTitles, [key]: e.target.value };
                      setSignerTitles(next);
                      localStorage.setItem(`acta_titles_${thesisId}`, JSON.stringify(next));
                    }}
                  >
                    <option value="">Título...</option>
                    {TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <span className="text-xs font-medium">{baseName}</span>
                  <span className="text-xs text-muted-foreground">{roleLabel(personRole(pending))}</span>
                </div>
                {!genLink ? (
                  <Button
                    size="sm"
                    disabled={missingTitle || missingProgDir || loadingLink === key}
                    title={missingProgDir ? "Ingrese el nombre del Director del Programa" : missingTitle ? "Seleccione un título académico" : ""}
                    onClick={() => handleGenerate(pending)}
                  >
                    {loadingLink === key ? "Generando..." : "🔗 Generar enlace"}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input readOnly value={genLink.url} className="flex-1 text-xs border rounded px-2 py-1 bg-white font-mono" />
                    <Button size="sm" variant="outline" onClick={() => {
                      navigator.clipboard.writeText(genLink.url);
                      setGeneratedLinks(prev => ({ ...prev, [key]: { ...genLink, copied: true } }));
                      setTimeout(() => setGeneratedLinks(prev => ({ ...prev, [key]: { ...prev[key], copied: false } })), 2000);
                    }}>
                      {genLink.copied ? "✓" : "📋"}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
