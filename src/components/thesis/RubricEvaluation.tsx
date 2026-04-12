import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { defaultRubric, type RubricSection, type EvaluatorConcept } from "@/lib/mock-data";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertTriangle, XCircle, Upload, FileText, X } from "lucide-react";

import { getApiBase } from "@/lib/utils";
const API_BASE = getApiBase();

interface UploadedFile {
  name: string;
  file: File;
}

interface EvalFile {
  id: string;
  file_name: string;
  file_url: string;
}

interface RubricEvaluationProps {
  thesis?: any;
  onSubmit?: (data: { score: number | null; observations: string; concept?: EvaluatorConcept | null; sections?: RubricSection[]; files?: File[] }) => Promise<void>;
  /** callback to upload files to an existing (already submitted) evaluation */
  onUploadFiles?: (files: File[]) => Promise<void>;
  initialConcept?: EvaluatorConcept | null;
  initialSections?: RubricSection[];
  initialGeneralObs?: string;
  initialFiles?: EvalFile[];
  /** final score already calculated by backend – used when displaying readOnly forms */
  initialFinalScore?: number | null;
  submitDisabled?: boolean;
  readOnly?: boolean;
  /** whether to show the concept selection block */
  showConcept?: boolean;
  /** whether to allow uploading files */
  showFiles?: boolean;
}

export default function RubricEvaluation({ thesis, onSubmit, onUploadFiles, initialConcept, initialSections, initialGeneralObs, initialFiles, initialFinalScore = null, submitDisabled, readOnly = false, showConcept = true, showFiles = true }: RubricEvaluationProps) {
  const [uploading, setUploading] = useState(false);
  const [sections, setSections] = useState<RubricSection[]>(
    initialSections ??
      defaultRubric.map((s) => ({
        ...s,
        criteria: s.criteria.map((c) => ({ ...c, score: undefined, observations: "" })),
      }))
  );

  // keep the local state in sync when parent provides new initialSections
  useEffect(() => {
    if (initialSections) {
      console.debug('RubricEvaluation syncing sections from props', initialSections);
      setSections(initialSections);
    }
  }, [initialSections]);
  const [concept, setConcept] = useState<EvaluatorConcept | null>(initialConcept || null);

  // if parent provides a different initialConcept (e.g. after fetch completes)
  // keep our local state in sync so the correct button is highlighted
  useEffect(() => {
    if (initialConcept !== undefined) {
      console.debug('RubricEvaluation syncing concept from props', initialConcept);
      setConcept(initialConcept);
    }
  }, [initialConcept]);
  const [generalObs, setGeneralObs] = useState(initialGeneralObs || "");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [existingFiles, setExistingFiles] = useState<EvalFile[]>(initialFiles || []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // keep existingFiles in sync when parent provides new initialFiles (e.g. after upload)
  useEffect(() => {
    if (initialFiles) {
      console.debug('RubricEvaluation syncing existingFiles from props', initialFiles);
      setExistingFiles(initialFiles);
    }
  }, [initialFiles]);

  const updateScore = (sectionId: string, criterionId: string, score: number) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, criteria: s.criteria.map((c) => c.id === criterionId ? { ...c, score } : c) }
          : s
      )
    );
  };

  const updateObservations = (sectionId: string, criterionId: string, observations: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.id === sectionId
          ? { ...s, criteria: s.criteria.map((c) => c.id === criterionId ? { ...c, observations } : c) }
          : s
      )
    );
  };

  const getSectionScore = (section: RubricSection) => {
    const scored = section.criteria.filter((c) => c.score !== undefined);
    if (scored.length === 0) return null;
    return scored.reduce((sum, c) => sum + (c.score || 0), 0) / scored.length;
  };

  const getFinalScore = () => {
    let total = 0;
    let totalWeight = 0;
    for (const section of sections) {
      const avg = getSectionScore(section);
      if (avg !== null) {
        total += avg * (section.weight / 100);
        totalWeight += section.weight;
      }
    }
    return totalWeight > 0 ? (total / (totalWeight / 100)) : null;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles: UploadedFile[] = Array.from(files).map((f) => ({ name: f.name, file: f }));

    // In readOnly mode with onUploadFiles, auto-upload immediately
    if (readOnly && onUploadFiles) {
      setUploading(true);
      try {
        await onUploadFiles(newFiles.map(f => f.file));
        // files are now on the server; the parent will refresh initialFiles
      } catch (err: any) {
        console.error('Error uploading files:', err);
        // keep them in the local list so user can retry
        setUploadedFiles((prev) => [...prev, ...newFiles]);
      } finally {
        setUploading(false);
      }
    } else {
      setUploadedFiles((prev) => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const finalScore = getFinalScore();
  // if the rubric is read-only and we weren't able to compute a score (due to missing
  // data) fall back to the value supplied by the server
  const displayFinalScore =
    finalScore !== null
      ? finalScore
      : readOnly && initialFinalScore != null
      ? initialFinalScore
      : null;

  const conceptOptions: { value: EvaluatorConcept; label: string; icon: typeof CheckCircle2; color: string }[] = [
    { value: "accepted", label: "Aceptado para Sustentación", icon: CheckCircle2, color: "bg-success text-success-foreground" },
    { value: "minor_changes", label: "Cambios Menores", icon: AlertTriangle, color: "bg-warning text-warning-foreground" },
    { value: "major_changes", label: "Cambios Mayores", icon: XCircle, color: "bg-destructive text-destructive-foreground" },
  ];

  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const sectionAvg = getSectionScore(section);
        return (
          <div key={section.id} className="bg-card rounded-lg border shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-secondary/50 flex items-center justify-between">
              <div>
                <h3 className="font-heading font-semibold text-foreground">{section.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Ponderación: {section.weight}%</p>
              </div>
              {sectionAvg !== null && (
                <div className="text-right">
                  <span className="text-2xl font-heading font-bold text-accent">{sectionAvg.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground">/5.0</span>
                </div>
              )}
            </div>
            <div className="divide-y divide-border">
              {section.criteria.map((criterion) => (
                <div key={criterion.id} className="px-5 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-foreground">{criterion.name}</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <button
                          key={score}
                          onClick={() => !readOnly && updateScore(section.id, criterion.id, score)}
                          disabled={readOnly}
                          className={cn(
                            "w-9 h-9 rounded-md text-sm font-semibold transition-all",
                            (criterion.score !== undefined && Number(criterion.score) === score)
                              ? "bg-accent text-accent-foreground shadow-md scale-110"
                              : "bg-secondary text-secondary-foreground hover:bg-accent/20",
                            readOnly && "cursor-default"
                          )}
                        >
                          {score}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Per-criterion observations */}
                  <Textarea
                    value={criterion.observations || ""}
                    onChange={(e) => updateObservations(section.id, criterion.id, e.target.value)}
                    placeholder="Observaciones sobre este criterio..."
                    className="min-h-[60px] text-sm"
                    disabled={readOnly}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* File upload & General observations — before Final Score */}
      {showFiles && (
        <div className="bg-card rounded-lg border shadow-card p-6 space-y-5">
          <h3 className="font-heading text-lg font-bold text-foreground">Archivos y Comentarios</h3>

          {/* General observations */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Comentarios / Observaciones</label>
            <Textarea
              value={generalObs}
              onChange={(e) => setGeneralObs(e.target.value)}
              placeholder="Escriba sus comentarios o correcciones sobre el trabajo evaluado..."
              className="min-h-[100px]"
              disabled={readOnly}
            />
          </div>

          {/* Existing files from previous submission */}
          {existingFiles.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">Archivos previamente subidos:</p>
              <ul className="space-y-1">
                {existingFiles.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <a href={`${API_BASE}${f.file_url.startsWith('/') ? '' : '/'}${f.file_url}`} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{f.file_name}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Upload new files */}
          {(!readOnly || onUploadFiles) && (
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Adjuntar documentos de correcciones
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                {readOnly && onUploadFiles
                  ? 'Seleccione archivos para subirlos automáticamente. El estudiante podrá descargarlos.'
                  : 'Suba archivos con correcciones o recomendaciones que el estudiante podrá descargar.'}
              </p>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt,.zip,.rar"
              />

              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="mb-3"
                disabled={uploading}
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? 'Subiendo...' : 'Seleccionar Archivos'}
              </Button>

              {uploadedFiles.length > 0 && (
                <div className="space-y-2">
                  {uploadedFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-secondary/50 rounded-md px-3 py-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground flex-1 truncate">{f.name}</span>
                      {!readOnly && (
                        <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {/* Fallback: manual upload button if auto-upload somehow left pending files */}
                  {readOnly && onUploadFiles && uploadedFiles.length > 0 && (
                    <Button
                      type="button"
                      disabled={uploading}
                      onClick={async () => {
                        setUploading(true);
                        try {
                          await onUploadFiles(uploadedFiles.map(f => f.file));
                          setUploadedFiles([]);
                        } finally {
                          setUploading(false);
                        }
                      }}
                      className="mt-2"
                    >
                      <Upload className="w-4 h-4 mr-2" />
                      {uploading ? 'Subiendo...' : 'Reintentar Subida'}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Final Score */}
      <div className="bg-card rounded-lg border shadow-elevated p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-heading text-lg font-bold text-foreground">Nota Final Ponderada</h3>
          {displayFinalScore !== null ? (
            <div className="text-right">
              <span className="text-4xl font-heading font-bold text-accent">{displayFinalScore.toFixed(1)}</span>
              <span className="text-lg text-muted-foreground">/5.0</span>
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">Sin calificar</span>
          )}
        </div>

        {/* Score breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {sections.map((section) => {
            const avg = getSectionScore(section);
            return (
              <div key={section.id} className="bg-secondary/50 rounded-md p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1 truncate">{section.name}</p>
                <p className="font-heading font-bold text-foreground">{avg !== null ? `${avg.toFixed(1)}` : "—"}</p>
                <p className="text-xs text-muted-foreground">× {section.weight}%</p>
              </div>
            );
          })}
        </div>

        {/* Concept */}
        {showConcept !== false && (
          <div className="mb-6">
            <label className="text-sm font-medium text-foreground mb-3 block">Concepto del Evaluador</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {conceptOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => !readOnly && setConcept(opt.value)}
                  disabled={readOnly}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all text-sm font-medium",
                    concept === opt.value
                      ? `${opt.color} border-transparent shadow-md`
                      : "bg-card border-border text-foreground hover:border-accent/30",
                    readOnly && "cursor-default"
                  )}
                >
                  <opt.icon className="w-4 h-4" />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* General observations (when showFiles is off, keep it here) */}
        {!showFiles && (
          <div className="mb-6">
            <label className="text-sm font-medium text-foreground mb-2 block">Observaciones Generales</label>
            <Textarea
              value={generalObs}
              onChange={(e) => setGeneralObs(e.target.value)}
              placeholder="Escriba sus observaciones sobre el trabajo evaluado..."
              className="min-h-[100px]"
              disabled={readOnly}
            />
          </div>
        )}

        {!readOnly && (
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
            disabled={(showConcept && !concept) || finalScore === null || submitDisabled}
            onClick={async () => {
              if (onSubmit) {
                await onSubmit({
                  score: finalScore,
                  observations: generalObs,
                  concept,
                  sections,
                  files: uploadedFiles.map(f => f.file),
                });
              }
            }}
          >
            Enviar Evaluación
          </Button>
        )}
      </div>
    </div>
  );
}
