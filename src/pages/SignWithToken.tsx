import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiBase } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const API = getApiBase();

export default function SignWithToken() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawn signature
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Upload signed PDF
  const [signFile, setSignFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  useEffect(() => {
    fetch(`${API}/sign/token/${token}`)
      .then(r => { if (!r.ok) throw new Error('Token inválido o expirado'); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [data]);

  const getCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0];
      return { x: (t.clientX - rect.left) * sx, y: (t.clientY - rect.top) * sy };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getCoords]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, getCoords]);

  const stopDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(false);
  }, []);

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setHasSignature(false);
  };

  const handleDownload = async () => {
    setLoadingPdf(true);
    try {
      const res = await fetch(`${API}/sign/token/${token}/download-pdf`);
      if (!res.ok) throw new Error('Error descargando PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `acta-${data?.thesisId || 'acta'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setLoadingPdf(false);
    }
  };

  // Flow A: drawn signature → send directly, no PDF needed
  const handleSubmitDrawing = async () => {
    if (!hasSignature || !canvasRef.current) return;
    const sigDataUrl = canvasRef.current.toDataURL('image/png');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('signature_image_data', sigDataUrl);
      const res = await fetch(`${API}/sign/token/${token}/sign-drawing`, {
        method: 'POST',
        body: form,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Error al enviar firma');
      }
      navigate('/sign-success');
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  // Flow B: upload externally signed PDF (with optional drawing)
  const handleUploadPdf = async () => {
    if (!signFile) { alert('Selecciona el PDF firmado'); return; }
    setUploading(true);
    const formData = new FormData();
    formData.append('signed_pdf', signFile);
    if (hasSignature && canvasRef.current) {
      formData.append('signature_image_data', canvasRef.current.toDataURL('image/png'));
    }
    try {
      const res = await fetch(`${API}/sign/token/${token}/upload-signed`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Error subiendo PDF');
      }
      navigate('/sign-success');
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando...</div>;
  if (error) return <div className="p-8 text-center text-red-600">Error: {error}</div>;
  if (!data) return <div className="p-8 text-center">No se encontraron datos</div>;

  return (
    <div className="max-w-xl mx-auto p-4 sm:p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Firma del Acta de Sustentacion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p><strong>Titulo:</strong> {data.thesis?.title}</p>
          <p><strong>Estudiantes:</strong> {data.students?.map((s: any) => s.name).join(', ')}</p>
          <p><strong>Firmando como:</strong> {data.signerName}</p>
        </CardContent>
      </Card>

      {/* Signature canvas */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <p className="font-semibold text-sm">Dibuje su firma</p>
          <div
            className="border-2 border-dashed border-blue-300 rounded-lg bg-white relative select-none"
            style={{ touchAction: 'none' }}
          >
            <canvas
              ref={canvasRef}
              width={600}
              height={180}
              className="w-full cursor-crosshair rounded-lg"
              style={{ maxHeight: '180px' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
            {!hasSignature && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400 text-sm">
                Dibuje su firma aqui
              </div>
            )}
          </div>
          {hasSignature && (
            <Button variant="outline" size="sm" onClick={clearSignature}>
              Borrar firma
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Flow A: drawn → submit directly */}
      {hasSignature && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="pt-4 space-y-3">
            <p className="text-sm font-semibold text-green-800">Firma lista — enviar directamente</p>
            <p className="text-xs text-green-700">
              Su firma sera registrada y el proceso quedara completo. No necesita descargar ni subir ningun PDF.
            </p>
            <Button
              className="w-full"
              disabled={uploading}
              onClick={handleSubmitDrawing}
            >
              {uploading ? 'Enviando...' : '✅ Enviar firma y completar'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Flow B: download → Adobe sign → upload PDF */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <p className="text-sm font-semibold">
            {hasSignature ? 'O si prefiere: firma digital con Adobe' : 'Firma digital con Adobe'}
          </p>
          <p className="text-xs text-muted-foreground">
            Descargue el acta, firmela en Adobe Acrobat y suba el PDF firmado.
          </p>
          <Button variant="outline" className="w-full" onClick={handleDownload} disabled={loadingPdf}>
            {loadingPdf ? 'Descargando...' : '📥 Descargar acta'}
          </Button>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => setSignFile(e.target.files?.[0] || null)}
              className="flex-1 rounded border border-border p-2 text-sm"
            />
            <Button
              onClick={handleUploadPdf}
              disabled={!signFile || uploading}
              className="w-full sm:w-auto"
            >
              {uploading ? 'Subiendo...' : '📤 Subir PDF firmado'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
