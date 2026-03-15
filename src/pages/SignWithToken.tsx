import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiBase } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SignWithToken() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [signFile, setSignFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch(`${getApiBase()}/sign/token/${token}`);
        if (!res.ok) throw new Error('Token inválido o expirado');
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [token]);

  const handleDownloadPdf = async () => {
    if (!data) return;
    setLoadingPdf(true);
    try {
      const res = await fetch(`${getApiBase()}/sign/token/${token}/download-pdf`);
      if (!res.ok) throw new Error('Error descargando PDF');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acta-${data.thesisId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleUpload = async () => {
    if (!signFile) {
      alert('Selecciona el PDF firmado');
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('signed_pdf', signFile);
    try {
      const res = await fetch(`${getApiBase()}/sign/token/${token}/upload-signed`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) throw new Error('Error subiendo PDF');
      alert('PDF firmado subido exitosamente');
      navigate('/sign-success');
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="p-6 text-center">Cargando...</div>;
  if (error) return <div className="p-6 text-center text-red-600">Error: {error}</div>;
  if (!data) return <div className="p-6 text-center">No se encontraron datos</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <Card>
        <CardHeader>
          <CardTitle>✍️ Firma del Acta de Sustentación</CardTitle>
          <CardDescription>Use este formulario para descargar el acta, firmarla y subirla nuevamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm mb-1"><strong>Título:</strong> {data.thesis.title}</p>
              <p className="text-sm mb-1"><strong>Estudiantes:</strong> {data.students.map((s: any) => s.name).join(', ')}</p>
              <p className="text-sm"><strong>Firmando como:</strong> {data.signerName}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="font-semibold mb-2">⚠️ Instrucciones importantes</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Descargue el acta con el botón inferior.</li>
                <li>Ábrala en <strong>Adobe Acrobat Reader</strong>.</li>
                <li>Use la opción <strong>"Firmar digitalmente"</strong>.</li>
                <li>Guarde el PDF firmado en su computador.</li>
                <li>Suba el PDF firmado usando el botón de abajo.</li>
              </ol>
              <p className="mt-2 text-xs text-orange-700 font-medium">
                Si ya existe una versión firmada, la descarga incluirá esas firmas.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <Button onClick={handleDownloadPdf} disabled={loadingPdf} className="w-full">
              {loadingPdf ? '⏳ Descargando...' : '📥 1. Descargar acta (versión actual)'}
            </Button>

            <div className="border-t pt-4">
              <p className="font-semibold mb-2">📤 2. Subir PDF firmado</p>
              <p className="text-sm text-muted-foreground mb-3">Seleccione el PDF que guardó después de firmarlo en Adobe.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setSignFile(e.target.files?.[0] || null)}
                  className="flex-1 rounded border border-border p-2"
                />
                <Button onClick={handleUpload} disabled={!signFile || uploading} className="w-full sm:w-auto">
                  {uploading ? '⏳ Subiendo...' : '✅ Subir PDF firmado'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
