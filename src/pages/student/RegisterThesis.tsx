import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

export default function RegisterThesis() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialThesis = location.state?.thesis;
  const { user } = useAuth();

  const [thesis, setThesis] = useState<any>(initialThesis || null);
  const existing = thesis;
  const [projectName, setProjectName] = useState(initialThesis?.title || "");
  const [abstract, setAbstract] = useState(initialThesis?.abstract || "");
  const [keywords, setKeywords] = useState(initialThesis?.keywords || "");
  const [projectDocument, setProjectDocument] = useState<File | null>(null);
  const [endorsement, setEndorsement] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [existingDoc, setExistingDoc] = useState<{file_name:string; file_url:string}|null>(null);
  const [existingEndorsement, setExistingEndorsement] = useState<{file_name:string; file_url:string}|null>(null);

  const backendBase = API_BASE || `${window.location.protocol}//${window.location.hostname}:4000`;

  const downloadFile = async (fileUrl: string, fileName: string) => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${backendBase}${fileUrl}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!resp.ok) throw new Error(`Error descargando archivo (${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || 'No se pudo descargar el archivo');
    }
  };
  const [loading, setLoading] = useState(false);

  const [evaluators, setEvaluators] = useState<{id: string; full_name: string; institutional_email?: string}[]>([]);
  const [evaluatorsError, setEvaluatorsError] = useState<string | null>(null);
  const [directorFilter, setDirectorFilter] = useState<string>('');
  const [selectedDirectorIds, setSelectedDirectorIds] = useState<string[]>([]);

  const simulatedEvaluators = [
    { id: 'sim-1', full_name: 'Carlos Giovanny Hidalgo Suarez', institutional_email: 'carlos.hidalgo@usbcali.edu.co' },
    { id: 'sim-2', full_name: 'María Fernanda López', institutional_email: 'maria.lopez@usbcali.edu.co' },
    { id: 'sim-3', full_name: 'Luis Alberto Ramírez', institutional_email: 'luis.ramirez@usbcali.edu.co' },
    { id: 'sim-4', full_name: 'Ana Sofía Pérez', institutional_email: 'ana.perez@usbcali.edu.co' },
    { id: 'sim-5', full_name: 'Juan Diego Rodríguez', institutional_email: 'juan.rodriguez@usbcali.edu.co' },
    { id: 'sim-6', full_name: 'Andrés Felipe Morales', institutional_email: 'andres.morales@usbcali.edu.co' },
    { id: 'sim-7', full_name: 'Natalia Jiménez García', institutional_email: 'natalia.jimenez@usbcali.edu.co' },
    { id: 'sim-8', full_name: 'Sofía Camila Torres', institutional_email: 'sofia.torres@usbcali.edu.co' },
    { id: 'sim-9', full_name: 'David Alejandro Castro', institutional_email: 'david.castro@usbcali.edu.co' },
    { id: 'sim-10', full_name: 'Laura Valentina Herrera', institutional_email: 'laura.herrera@usbcali.edu.co' },
  ];

  // companion information
  const [hasCompanion, setHasCompanion] = useState(false);
  const [companion, setCompanion] = useState<{ full_name: string; student_code: string; cedula: string; institutional_email: string }>({
    full_name: "",
    student_code: "",
    cedula: "",
    institutional_email: "",
  });

  // programs
  const [availablePrograms, setAvailablePrograms] = useState<{ id: string; name: string; reception_start?: string; reception_end?: string }[]>([]);
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>(
    existing?.programs ? existing.programs.map((p: any) => p.id) : []
  );

  const isEditable = !existing || existing.status === 'draft';

  useEffect(() => {
    // fetch list of programs + list of available evaluators (directors)
    (async () => {
      try {
        const token = localStorage.getItem('token');
        const [progResp, evalResp] = await Promise.all([
          fetch(`${API_BASE}/programs`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch(`${API_BASE}/evaluators`, { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (progResp.ok) {
          const progs = await progResp.json();
          setAvailablePrograms(progs);
        }
        if (evalResp.ok) {
          const evals = await evalResp.json();
          if (!evals || !evals.length) {
            setEvaluators(simulatedEvaluators);
          } else {
            setEvaluators(evals);
          }
        } else {
          const text = await evalResp.text().catch(() => '');
          setEvaluatorsError(`No se pudo cargar la lista de directores (${evalResp.status}).`);
          console.error('evaluators load failed', evalResp.status, text);
          setEvaluators(simulatedEvaluators);
        }
      } catch (err) {
        console.error('failed to load programs or evaluators', err);
        setEvaluatorsError('No se pudo cargar la lista de directores.');
      }
    })();

    // If we are on the thesis edit page but the thesis data was not passed via navigation state
    // (e.g. page refresh), load the student's thesis to be able to edit it.
    const loadExistingThesis = async () => {
      if (thesis) return;
      if (!user) return;
      try {
        const token = localStorage.getItem('token');
        const resp = await fetch(`${API_BASE}/theses`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) return;
        const list = await resp.json();
        if (Array.isArray(list) && list.length === 1) {
          const t = list[0];
          setThesis(t);
          setProjectName(t.title || "");
          setAbstract(t.abstract || "");
          setKeywords(t.keywords || "");
          setSelectedPrograms(t.programs ? t.programs.map((p: any) => p.id) : []);

          // companion
          const other = t.students?.find((s: any) => s.id !== user?.id);
          if (other) {
            setHasCompanion(true);
            setCompanion({
              full_name: other.name || "",
              student_code: other.student_code || "",
              cedula: other.cedula || "",
              institutional_email: other.institutional_email || "",
            });
          }

          // existing files
          if (t.files && t.files.length > 0) {
            const docFile = t.files.find((f: any) => f.file_type === 'document');
            const endorseFile = t.files.find((f: any) => f.file_type === 'endorsement');
            const urlFile = t.files.find((f: any) => f.file_type === 'url');
            if (docFile) setExistingDoc({ file_name: docFile.file_name, file_url: docFile.file_url });
            if (endorseFile) setExistingEndorsement({ file_name: endorseFile.file_name, file_url: endorseFile.file_url });
            if (urlFile) setUrl(urlFile.file_name || "");
          }
        }
      } catch (err) {
        console.error('failed to load existing thesis', err);
      }
    };

    loadExistingThesis();

    if (existing) {
      // if editing and there is a second student (companion)
      const other = existing.students?.find((s: any) => s.id !== user?.id);
      if (other) {
        setHasCompanion(true);
        setCompanion({
          full_name: other.name || "",
          student_code: other.student_code || "",
          cedula: other.cedula || "",
          institutional_email: other.institutional_email || "",
        });
      }
      // load existing files
      if (existing.files && existing.files.length > 0) {
        const docFile = existing.files.find((f: any) => f.file_type === 'document');
        const endorseFile = existing.files.find((f: any) => f.file_type === 'endorsement');
        const urlFile = existing.files.find((f: any) => f.file_type === 'url');
        if (docFile) setExistingDoc({ file_name: docFile.file_name, file_url: docFile.file_url });
        if (endorseFile) setExistingEndorsement({ file_name: endorseFile.file_name, file_url: endorseFile.file_url });
        if (urlFile) setUrl(urlFile.file_name || "");
      }
      if (existing.programs) {
        setSelectedPrograms(existing.programs.map((p: any) => p.id));
      }
    }
  }, [existing, thesis, user]);


  const isProgramOpen = (prog: { reception_start?: string; reception_end?: string }) => {
    const now = Date.now();
    if (prog.reception_start && now < Date.parse(prog.reception_start)) return false;
    if (prog.reception_end && now > Date.parse(prog.reception_end)) return false;
    return true;
  };

  // When evaluators list loads, try to map existing director names to evaluator ids
  useEffect(() => {
    if (!evaluators.length || !existing) return;
    if (!existing.directors || !Array.isArray(existing.directors)) return;
    const mapped = existing.directors
      .map((d: any) => {
        // director can be stored as { name, user_id } or just name string
        const id = typeof d === 'object' ? d.user_id : null;
        if (id) return id;
        const name = typeof d === 'string' ? d : d.name;
        return evaluators.find((e) => e.full_name === name)?.id;
      })
      .filter(Boolean) as string[];
    setSelectedDirectorIds(mapped);
  }, [evaluators, existing]);

  const closedPrograms = availablePrograms.filter((p) => !isProgramOpen(p));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) {
      // already processing a submit, ignore duplicate
      return;
    }
    // document only required when creating a new thesis
    if (!projectName.trim() || !abstract.trim() || (!projectDocument && !existing)) {
      toast.error(
        existing
          ? "Nombre y resumen son obligatorios"
          : "Nombre, resumen y documento del proyecto de grado son obligatorios"
      );
      return;
    }

    if (!existing && selectedPrograms.length > 0) {
      const closed = selectedPrograms
        .map((id) => availablePrograms.find((p) => p.id === id))
        .filter(Boolean)
        .filter((p) => !isProgramOpen(p as any)) as any[];
      if (closed.length) {
        toast.error(`No se puede registrar el proyecto de grado en el/los programa(s) cerrados: ${closed.map((p) => p.name).join(', ')}`);
        setLoading(false);
        return;
      }
    }
    if (hasCompanion && (!companion.full_name || !companion.student_code || !companion.cedula)) {
      toast.error("Los datos del compañero (nombre, código y cédula) son obligatorios");
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      let thesis;
      const body: any = { title: projectName, abstract };
      if (keywords.trim()) body.keywords = keywords.trim();
      if (!existing && hasCompanion && companion.full_name && companion.student_code) {
        body.companion = {
          full_name: companion.full_name,
          student_code: companion.student_code,
          cedula: companion.cedula || undefined,
          institutional_email: companion.institutional_email || undefined,
        } as any;
      }      if (selectedDirectorIds.length) {
        body.director_ids = selectedDirectorIds;
      }
      if (existing) {
        // actualizar
        if (selectedPrograms.length) body.program_ids = selectedPrograms;
        console.log('updating thesis with', body);
        const resp = await fetch(`${API_BASE}/theses/${existing.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => null);
          throw new Error(errData?.error || "Error actualizando proyecto de grado");
        }
        // PUT returns {ok:true}; keep the id for subsequent file upload
        thesis = { ...existing, title: projectName, abstract, keywords };
      } else {
        // 1. Crear el proyecto de grado (POST /theses)
        if (selectedPrograms.length) body.program_ids = selectedPrograms;
        console.log('creating thesis with', body);
        const resp = await fetch(`${API_BASE}/theses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });
        if (!resp.ok) {
          const errData = await resp.json().catch(() => null);
          console.error('thesis POST failed', resp.status, errData, body);
          throw new Error(errData?.error || "Error creando proyecto de grado");
        }
        thesis = await resp.json();
      }
      // 2. Subir archivos y directores (POST /theses/:id/files)
      const form = new FormData();
      form.append("project_name", projectName);
      form.append("abstract", abstract);
      const selectedDirectorNames = selectedDirectorIds
        .map((id) => evaluators.find((e) => e.id === id)?.full_name)
        .filter(Boolean);
      form.append("directors", JSON.stringify(selectedDirectorNames));
      form.append("director_ids", JSON.stringify(selectedDirectorIds));
      if (projectDocument) form.append("document", projectDocument);
      if (endorsement) form.append("endorsement", endorsement);
      if (url) form.append("url", url);
      const uploadResp = await fetch(`${API_BASE}/theses/${thesis.id}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!uploadResp.ok) {
        // Si es un proyecto de grado nuevo, eliminarlo para evitar dejarlo incompleto
        if (!existing) {
          await fetch(`${API_BASE}/theses/${thesis.id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
        const errData = await uploadResp.json().catch(() => null);
        throw new Error(errData?.error || "Error subiendo archivos. Intenta de nuevo.");
      }

      const uploadData = await uploadResp.json().catch(() => null);
      // Actualizar vista con nuevos archivos cargados sin necesidad de recargar la página
      const savedFiles = Array.isArray(uploadData?.files) ? uploadData.files : [];
      const savedDoc = savedFiles.find((f: any) => f.file_type === 'document');
      const savedEndorse = savedFiles.find((f: any) => f.file_type === 'endorsement');
      if (savedDoc) {
        setExistingDoc({ file_name: savedDoc.file_name, file_url: `/uploads/${savedDoc.file_path}` });
        setProjectDocument(null);
      }
      if (savedEndorse) {
        setExistingEndorsement({ file_name: savedEndorse.file_name, file_url: `/uploads/${savedEndorse.file_path}` });
        setEndorsement(null);
      }

      toast.success(existing ? "Proyecto de grado actualizado" : "Proyecto de grado registrado correctamente");
      navigate("/student");
    } catch (err: any) {
      console.error('handleSubmit caught', err);
      toast.error(err.message || "Error al registrar el proyecto de grado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4 sm:px-6">
      <h1 className="font-heading text-2xl font-bold mb-4">
        {existing ? (isEditable ? 'Modificar proyecto de grado' : 'Detalle del proyecto de grado') : 'Registrar nuevo proyecto de grado'}
      </h1>
      {existing && !isEditable && (
        <p className="text-sm text-red-500 mb-4">El proyecto de grado ya fue enviado y no puede modificarse.</p>
      )}
      <form onSubmit={handleSubmit} className="space-y-4 bg-card border rounded-xl shadow-card p-4 sm:p-6">
        <div>
          <Label>Nombre del Proyecto</Label>
          <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} required disabled={!isEditable} />
        </div>
        <div>
          <Label>Resumen</Label>
          <Textarea value={abstract} onChange={(e) => setAbstract(e.target.value)} required disabled={!isEditable} />
        </div>
        <div>
          <Label>Palabras clave (separadas por coma)</Label>
          <Input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="Machine learning, Deep Learning, Gestión de Procesos"
            disabled={!isEditable}
          />
        </div>
        {/* companion section */}
        <div>
          <label className="inline-flex items-center">
            <input
              type="checkbox"
              checked={hasCompanion}
              onChange={() => {
                // Only allow toggling companion while creating (no existing thesis yet)
                if (!existing) setHasCompanion(!hasCompanion);
              }}
              disabled={!isEditable || !!existing}
              className="form-checkbox"
            />
            <span className="ml-2">Agregar/editar compañero</span>
          </label>
          {existing && hasCompanion && (
            <p className="text-xs text-muted-foreground mt-1">
              Los datos del compañero no pueden modificarse después de crear el proyecto de grado.
            </p>
          )}
        </div>
        {hasCompanion && (
          <div className="space-y-2 border p-4 rounded">
            <div>
              <Label>Nombre del compañero</Label>
              <Input
                value={companion.full_name}
                onChange={(e) => setCompanion((c) => ({ ...c, full_name: e.target.value }))}
                required={isEditable && !existing}
                disabled={!isEditable || !!existing}
              />
            </div>
            <div>
              <Label>Código del compañero</Label>
              <Input
                value={companion.student_code}
                onChange={(e) => setCompanion((c) => ({ ...c, student_code: e.target.value }))}
                required={isEditable && !existing}
                disabled={!isEditable || !!existing}
              />
            </div>
            <div>
              <Label>Cédula del compañero</Label>
              <Input
                value={companion.cedula}
                onChange={(e) => setCompanion((c) => ({ ...c, cedula: e.target.value }))}
                required={hasCompanion && isEditable && !existing}
                disabled={!isEditable || !!existing}
              />
            </div>
            <div>
              <Label>Correo institucional del compañero</Label>
              <Input
                type="email"
                placeholder="correo@usbcali.edu.co"
                value={companion.institutional_email}
                onChange={(e) => setCompanion((c) => ({ ...c, institutional_email: e.target.value }))}
                disabled={!isEditable || !!existing}
              />
            </div>
          </div>
        )}
        <div>
          <Label>Programa(s)</Label>
          <div className="text-sm text-muted-foreground mb-2">
            Selecciona el/los programa(s) a los que pertenece tu proyecto de grado. Si el período de recepción está cerrado, no podrás seleccionar ese programa.
          </div>
          {closedPrograms.length > 0 && (
            <div className="mb-2 p-2 rounded bg-red-50 border border-red-200 text-sm text-red-700">
              <strong>Recepción cerrada para:</strong> {closedPrograms.map((p) => p.name).join(', ')}.
            </div>
          )}
          <div className="space-y-1">
            {availablePrograms.map((p) => {
              const open = isProgramOpen(p);
              return (
                <label key={p.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!isEditable || !open}
                    checked={selectedPrograms.includes(p.id)}
                    onChange={() => {
                      if (selectedPrograms.includes(p.id)) {
                        setSelectedPrograms((prev) => prev.filter((id) => id !== p.id));
                      } else {
                        setSelectedPrograms((prev) => [...prev, p.id]);
                      }
                    }}
                  />
                  <span className={open ? undefined : 'text-muted-foreground'}>
                    {p.name}
                    {p.reception_start && p.reception_end ? (
                      <span className="text-xs ml-2">({p.reception_start} → {p.reception_end})</span>
                    ) : null}
                    {!open && (
                      <span className="text-xs text-red-500 ml-2">(cerrado)</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div>
          <Label>Directores</Label>
          <div className="text-sm text-muted-foreground mb-2">
            Selecciona uno o más directores de la lista (evaluadores registrados).
          </div>
          {evaluatorsError ? (
            <p className="text-sm text-red-500">{evaluatorsError}</p>
          ) : evaluators.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay evaluadores registrados aún.</p>
          ) : (
            <>
              <Input
                value={directorFilter}
                onChange={(e) => setDirectorFilter(e.target.value)}
                placeholder="Buscar director..."
                disabled={!isEditable}
                className="mb-2"
              />
              <div className="max-h-56 overflow-auto rounded border border-border p-2">
                {evaluators
                  .filter((ev) => ev.full_name.toLowerCase().includes(directorFilter.toLowerCase()))
                  .map((ev) => (
                    <label key={ev.id} className="flex items-center gap-2 py-1">
                      <input
                        type="checkbox"
                        checked={selectedDirectorIds.includes(ev.id)}
                        onChange={() => {
                          if (selectedDirectorIds.includes(ev.id)) {
                            setSelectedDirectorIds((prev) => prev.filter((id) => id !== ev.id));
                          } else {
                            setSelectedDirectorIds((prev) => [...prev, ev.id]);
                          }
                        }}
                        disabled={!isEditable}
                      />
                      <span>{ev.full_name}</span>
                    </label>
                  ))}
                {evaluators.filter((ev) => ev.full_name.toLowerCase().includes(directorFilter.toLowerCase())).length === 0 && (
                  <p className="text-sm text-muted-foreground">No se encontraron evaluadores.</p>
                )}
              </div>
            </>
          )}
        </div>
        <div>
          <Label>Documento del proyecto de grado (PDF/DOCX)</Label>
          {projectDocument ? (
            <p className="text-sm text-blue-600 mb-1">📄 Archivo seleccionado: {projectDocument.name}</p>
          ) : existingDoc ? (
            <p className="text-sm text-blue-600 mb-1">
              📄 Archivo actual: <button type="button" className="underline text-left p-0" onClick={() => downloadFile(existingDoc.file_url, existingDoc.file_name)}>{existingDoc.file_name}</button>
            </p>
          ) : null}
          <Input type="file" accept=".pdf,.docx,.doc" onChange={(e) => setProjectDocument(e.target.files?.[0] || null)} required={!existing && !existingDoc} disabled={!isEditable} />
        </div>
        <div>
          <Label>Carta de Aval (PDF/DOCX)</Label>
          {endorsement ? (
            <p className="text-sm text-blue-600 mb-1">📄 Archivo seleccionado: {endorsement.name}</p>
          ) : existingEndorsement ? (
            <p className="text-sm text-blue-600 mb-1">
              📄 Archivo actual: <button type="button" className="underline text-left p-0" onClick={() => downloadFile(existingEndorsement.file_url, existingEndorsement.file_name)}>{existingEndorsement.file_name}</button>
            </p>
          ) : null}
          <Input type="file" accept=".pdf,.docx,.doc" onChange={(e) => setEndorsement(e.target.files?.[0] || null)} disabled={!isEditable} />
        </div>
        <div>
          <Label>Enlace URL (opcional)</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/..." disabled={!isEditable} />
        </div>
        <Button type="submit" className="w-full" disabled={loading || !isEditable}>
          {loading ? "Registrando..." : existing ? "Guardar cambios" : "Registrar proyecto de grado"}
        </Button>
      </form>
    </div>
  );
}
