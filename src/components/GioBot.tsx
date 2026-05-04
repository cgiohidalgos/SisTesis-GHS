import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { getApiBase } from "@/lib/utils";

function mdToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = escaped.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Table
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|[-| :]+\|/)) {
      const headers = line.trim().split("|").filter(Boolean).map(h => h.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim().split("|").filter(Boolean).map(c => c.trim()));
        i++;
      }
      const ths = headers.map(h => `<th style="border:1px solid #ccc;padding:3px 8px;background:#f5f5f5;text-align:left">${inline(h)}</th>`).join("");
      const trs = rows.map(r => `<tr>${r.map(c => `<td style="border:1px solid #ccc;padding:3px 8px">${inline(c)}</td>`).join("")}</tr>`).join("");
      out.push(`<div style="overflow-x:auto;margin:6px 0"><table style="border-collapse:collapse;font-size:12px;width:100%"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`);
      continue;
    }

    if (line.startsWith("### ")) { out.push(`<p style="font-weight:600;margin:6px 0 2px">${inline(line.slice(4))}</p>`); i++; continue; }
    if (line.startsWith("## ")) { out.push(`<p style="font-weight:700;margin:8px 0 3px;border-bottom:1px solid rgba(0,0,0,0.15);padding-bottom:2px">${inline(line.slice(3))}</p>`); i++; continue; }
    if (line.startsWith("# ")) { out.push(`<p style="font-weight:700;font-size:1.05em;margin:8px 0 3px">${inline(line.slice(2))}</p>`); i++; continue; }
    if (line.trim() === "---") { out.push(`<hr style="border:none;border-top:1px solid rgba(0,0,0,0.15);margin:6px 0">`); i++; continue; }

    if (line.trim().match(/^[-*] /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().match(/^[-*] /)) { items.push(lines[i].trim().slice(2)); i++; }
      out.push(`<ul style="margin:4px 0;padding-left:18px">${items.map(it => `<li style="margin:1px 0">${inline(it)}</li>`).join("")}</ul>`);
      continue;
    }

    if (line.trim().match(/^\d+\. /)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().match(/^\d+\. /)) { items.push(lines[i].trim().replace(/^\d+\. /, "")); i++; }
      out.push(`<ol style="margin:4px 0;padding-left:18px">${items.map(it => `<li style="margin:1px 0">${inline(it)}</li>`).join("")}</ol>`);
      continue;
    }

    if (line.trim() === "") { out.push(`<br>`); i++; continue; }
    out.push(`<p style="margin:2px 0">${inline(line)}</p>`);
    i++;
  }
  return out.join("");
}

function inline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, `<code style="background:rgba(0,0,0,0.1);border-radius:3px;padding:0 3px;font-size:11px">$1</code>`);
}

function AttachCartaButton({ thesisId, pdfFileName }: { thesisId: string; pdfFileName: string }) {
  const [status, setStatus] = React.useState<"idle" | "loading" | "done" | "error">("idle");

  async function attach() {
    setStatus("loading");
    try {
      const token = localStorage.getItem("token");
      const r = await fetch(`${getApiBase()}/theses/${thesisId}/attach-carta-aval`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ pdfFileName }),
      });
      if (!r.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") return (
    <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium w-fit">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      Adjuntada al proyecto
    </span>
  );

  return (
    <button
      onClick={attach}
      disabled={status === "loading"}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition-colors w-fit disabled:opacity-60"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
      {status === "loading" ? "Adjuntando..." : status === "error" ? "Error, reintentar" : "Adjuntar al proyecto"}
    </button>
  );
}

interface Message {
  role: "user" | "assistant";
  content: string;
  downloadUrl?: string;
  cartaThesisId?: string;
  pdfFileName?: string;
}

function getContext(pathname: string): { thesisId?: string; contextType: "single" | "list" | "none" | "admin" } {
  const singlePatterns = [
    /^\/evaluator\/directed-thesis\/([^/]+)/,
    /^\/evaluator\/student\/([^/]+)/,
    /^\/evaluator\/rubric\/([^/]+)/,
    /^\/admin\/rubric\/([^/]+)/,
    /^\/admin\/theses\/([^/]+)/,
  ];
  for (const re of singlePatterns) {
    const m = pathname.match(re);
    if (m) return { thesisId: m[1], contextType: "single" };
  }
  const listPaths = [
    "/evaluator/my-students",
    "/evaluator",
    "/admin/theses",
    "/admin/my-students",
  ];
  if (listPaths.some(p => pathname === p || pathname.startsWith(p + "?"))) {
    return { contextType: "list" };
  }
  const adminPaths = [
    "/admin",
    "/admin/evaluators",
    "/admin/programs",
    "/admin/rubrics",
    "/admin/weights",
    "/admin/review-items",
    "/admin/notifications",
    "/admin/evaluations",
    "/admin/reports",
    "/admin/users",
    "/admin/smtp-config",
    "/admin/notification-rules",
    "/admin/as-evaluator",
  ];
  if (adminPaths.some(p => pathname === p || pathname.startsWith(p + "/"))) {
    return { contextType: "admin" };
  }
  return { contextType: "none" };
}

const POLL_INTERVAL = 3 * 60 * 1000; // 3 minutes

export default function GioBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = sessionStorage.getItem("giobot_messages_v2");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [alertsRead, setAlertsRead] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  const { thesisId, contextType } = getContext(location.pathname);

  const fetchAlerts = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${getApiBase()}/chat/alerts`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data.alerts?.length > 0) {
        setAlerts(data.alerts);
        setAlertsRead(false);
      }
    } catch {}
  }, []);

  // Poll alerts
  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  // Persist messages in sessionStorage across navigation
  useEffect(() => {
    try {
      sessionStorage.setItem("giobot_messages_v2", JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // When opening chat: mark alerts as read (alerts shown in welcome panel, not injected as messages)
  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
      if (!alertsRead && alerts.length > 0) {
        setAlertsRead(true);
      }
    }
  }, [open, alerts, alertsRead]);

  const sendText = async (text: string) => {
    if (!text.trim() || loading) return;
    const newMessages: Message[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const resp = await fetch(`${getApiBase()}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" },
        body: JSON.stringify({ messages: newMessages, thesisId, contextType }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Error");
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.reply,
        downloadUrl: data.downloadUrl ?? undefined,
        cartaThesisId: data.cartaThesisId ?? undefined,
        pdfFileName: data.pdfFileName ?? undefined,
      }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const send = () => sendText(input);

  const clearChat = () => {
    setMessages([]);
    sessionStorage.removeItem("giobot_messages_v2");
    setAlertsRead(false);
  };

  const contextLabel =
    contextType === "single" ? "tesis específica" :
    contextType === "list" ? "tus tesis" : "sistema";

  const hasUnreadAlerts = alerts.length > 0 && !alertsRead;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 flex items-center justify-center"
        title="GioBot — Asistente IA"
        aria-label="Abrir GioBot"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="10" rx="2"/>
          <path d="M12 3a2 2 0 0 1 2 2v1H10V5a2 2 0 0 1 2-2z"/>
          <line x1="12" y1="6" x2="12" y2="11"/>
          <circle cx="8.5" cy="16" r="1"/>
          <circle cx="15.5" cy="16" r="1"/>
          <path d="M6 11V8a6 6 0 0 1 12 0v3"/>
        </svg>
        {/* Unread alerts badge */}
        {hasUnreadAlerts && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 border-2 border-white text-white text-[10px] font-bold flex items-center justify-center">
            {alerts.length}
          </span>
        )}
        {/* Messages indicator (no unread alerts) */}
        {!hasUnreadAlerts && messages.length > 0 && !open && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-white" />
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-0 right-0 left-0 sm:bottom-24 sm:right-6 sm:left-auto sm:w-96 z-50 flex flex-col sm:rounded-2xl rounded-t-2xl border border-border bg-card shadow-2xl overflow-hidden" style={{ maxHeight: "75vh" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="10" rx="2"/>
                <path d="M12 3a2 2 0 0 1 2 2v1H10V5a2 2 0 0 1 2-2z"/>
                <line x1="12" y1="6" x2="12" y2="11"/>
                <circle cx="8.5" cy="16" r="1"/>
                <circle cx="15.5" cy="16" r="1"/>
                <path d="M6 11V8a6 6 0 0 1 12 0v3"/>
              </svg>
              <span className="font-bold text-sm">GioBot</span>
              <span className="text-xs opacity-70">· {contextLabel}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={clearChat}
                disabled={messages.length === 0}
                className="text-xs opacity-70 hover:opacity-100 underline transition-opacity disabled:opacity-30 disabled:no-underline disabled:cursor-default"
                title="Vaciar conversación"
              >
                Vaciar
              </button>
              <button onClick={() => setOpen(false)} className="opacity-80 hover:opacity-100 transition-opacity" aria-label="Cerrar">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Welcome panel — shown only when chat is empty */}
          {messages.length === 0 && (
            <div className="flex-1 overflow-y-auto px-4 pt-5 pb-4 bg-background space-y-4 text-sm">
              <div>
                <p className="text-xl mb-1">🤖</p>
                <p className="font-semibold text-foreground text-base">¡Hola! Soy GioBot</p>
                <p className="text-xs text-muted-foreground mt-0.5">Asistente inteligente de SisTesis</p>
              </div>

              <p className="text-xs text-foreground leading-relaxed">
                Estoy aquí para ayudarte a consultar información sobre los proyectos de tesis. Puedes preguntarme en lenguaje natural, por ejemplo:
              </p>

              <div className="space-y-2 text-xs text-muted-foreground">
                <div>
                  <p className="font-semibold text-foreground mb-1">📄 Sobre un proyecto</p>
                  <p className="pl-3 leading-relaxed">"¿En qué estado está esta tesis?" · "¿Quién la dirige y quiénes la evalúan?"</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">📊 Calificaciones</p>
                  <p className="pl-3 leading-relaxed">"¿Cuáles son las notas de documento y sustentación?" · "¿Cuál es la nota final?"</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">💬 Comentarios de evaluadores</p>
                  <p className="pl-3 leading-relaxed">"¿Qué comentarios hicieron los evaluadores en sus PDFs?" · "Resume las observaciones del evaluador X"</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">📅 Cronograma</p>
                  <p className="pl-3 leading-relaxed">"¿Qué fechas importantes tiene este proyecto?" · "¿Cuándo es la defensa?"</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">📋 Carta de aval</p>
                  <p className="pl-3 leading-relaxed">"Genera la carta de aval para esta tesis"</p>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">📈 Exportar datos</p>
                  <p className="pl-3 leading-relaxed">"Genera una tabla Excel con nombre, código y título de los proyectos" · "Exporta las calificaciones"</p>
                </div>
              </div>

              {alerts.length > 0 && (
                <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-xs text-yellow-800 space-y-0.5">
                  <p className="font-semibold mb-1">🔔 Tienes notificaciones pendientes</p>
                  {alerts.map((a, i) => <p key={i}>• {a}</p>)}
                </div>
              )}

              <p className="text-xs text-muted-foreground border-t border-border pt-3">
                Escribe tu pregunta abajo y te respondo de inmediato.
              </p>
            </div>
          )}

          {/* Messages */}
          {messages.length > 0 && <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-background" style={{ minHeight: "100px" }}>
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}
                >
                  {m.role === "user" ? m.content : (
                    <>
                      <span dangerouslySetInnerHTML={{ __html: mdToHtml(m.content) }} />
                      {m.downloadUrl && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <a
                            href={`${getApiBase()}${m.downloadUrl}`}
                            download
                            onClick={async (e) => {
                              e.preventDefault();
                              const token = localStorage.getItem("token");
                              const r = await fetch(`${getApiBase()}${m.downloadUrl}`, { headers: { Authorization: token ? `Bearer ${token}` : "" } });
                              if (!r.ok) { alert("Error al descargar"); return; }
                              const blob = await r.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a");
                              const isXlsx = m.downloadUrl!.endsWith('.xlsx');
                              a.href = url;
                              a.download = isXlsx ? "Tabla.xlsx" : "Carta_de_Aval.pdf";
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors w-fit"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            {m.downloadUrl!.endsWith('.xlsx') ? "Descargar Tabla (Excel)" : "Descargar Carta de Aval (PDF)"}
                          </a>
                          {m.cartaThesisId && m.pdfFileName && (
                            <AttachCartaButton thesisId={m.cartaThesisId} pdfFileName={m.pdfFileName} />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-3 py-2 text-sm text-muted-foreground">
                  <span className="inline-flex gap-1">
                    <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                    <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>}

          {/* Input */}
          <div className="flex gap-2 p-3 border-t border-border bg-card">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Escribe tu pregunta..."
              disabled={loading}
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center justify-center"
              aria-label="Enviar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
