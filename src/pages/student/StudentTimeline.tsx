import AppLayout from "@/components/layout/AppLayout";
import ThesisTimeline from "@/components/thesis/ThesisTimeline";
import StatusBadge from "@/components/thesis/StatusBadge";
import { mockTheses } from "@/lib/mock-data";

export default function StudentTimeline() {
  const thesis = mockTheses[0];

  // Mock evaluator data that student would see at concept_issued
  const evaluatorRecommendations =
    "Se recomienda mejorar la sección de análisis de resultados, incluyendo una comparación más detallada con los trabajos del estado del arte. Adicionalmente, revisar las referencias bibliográficas para completar las citas faltantes en el capítulo de marco teórico.";

  const evaluatorFiles = [
    { name: "Correcciones_Cap3.pdf", url: "#" },
    { name: "Observaciones_Generales.docx", url: "#" },
  ];

  return (
    <AppLayout role="student">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="font-heading text-2xl font-bold text-foreground">
              Seguimiento de mi Tesis
            </h2>
            <StatusBadge status={thesis.status} />
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2">
            {thesis.title}
          </p>
        </div>

        <ThesisTimeline
          events={thesis.timeline}
          evaluatorRecommendations={evaluatorRecommendations}
          evaluatorFiles={evaluatorFiles}
        />
      </div>
    </AppLayout>
  );
}
