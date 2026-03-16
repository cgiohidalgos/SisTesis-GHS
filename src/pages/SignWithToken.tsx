import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiBase } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

  // Signature pad state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [signatureMode, setSignatureMode] = useState<'draw' | 'upload'>('draw');
  const [signatureImageFile, setSignatureImageFile] = useState<File | null>(null);

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

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [data, signatureMode]);

  const getCanvasCoords = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getCanvasCoords]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  }, [isDrawing, getCanvasCoords]);

  const stopDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
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
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setHasSignature(false);
  };

  const getSignatureDataUrl = (): string | null => {
    if (signatureMode === 'draw') {
      if (!hasSignature || !canvasRef.current) return null;
      return canvasRef.current.toDataURL('image/png');
    }
    return null;
  };

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

    // Validate signature
    const sigDataUrl = getSignatureDataUrl();
    if (signatureMode === 'draw' && !hasSignature) {
      alert('Debe dibujar su firma en el recuadro antes de subir el PDF.');
      return;
    }
    if (signatureMode === 'upload' && !signatureImageFile) {
      alert('Debe subir una imagen de su firma.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('signed_pdf', signFile);

    if (signatureMode === 'draw' && sigDataUrl) {
      formData.append('signature_image_data', sigDataUrl);
    } else if (signatureMode === 'upload' && signatureImageFile) {
      formData.append('signature_image', signatureImageFile);
    }

    try {
      const res = await fetch(`${getApiBase()}/sign/token/${token}/upload-signed`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Error subiendo PDF');
      }
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
          <CardTitle>Firma del Acta de Sustentacion</CardTitle>
          <CardDescription>Use este formulario para descargar el acta, firmarla y subirla nuevamente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="text-sm mb-1"><strong>Titulo:</strong> {data.thesis.title}</p>
              <p className="text-sm mb-1"><strong>Estudiantes:</strong> {data.students.map((s: any) => s.name).join(', ')}</p>
              <p className="text-sm"><strong>Firmando como:</strong> {data.signerName}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="font-semibold mb-2">Instrucciones importantes</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Descargue el acta con el boton inferior.</li>
                <li>Abrala en <strong>Adobe Acrobat Reader</strong>.</li>
                <li>Use la opcion <strong>"Firmar digitalmente"</strong>.</li>
                <li>Guarde el PDF firmado en su computador.</li>
                <li>Dibuje su firma en el recuadro de abajo.</li>
                <li>Suba el PDF firmado usando el boton de abajo.</li>
              </ol>
              <p className="mt-2 text-xs text-orange-700 font-medium">
                Si ya existe una version firmada, la descarga incluira esas firmas.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <Button onClick={handleDownloadPdf} disabled={loadingPdf} className="w-full">
              {loadingPdf ? 'Descargando...' : '1. Descargar acta (version actual)'}
            </Button>

            {/* Signature section */}
            <div className="border-t pt-4">
              <p className="font-semibold mb-2">2. Su firma (aparecera en el acta generada)</p>
              <div className="flex gap-2 mb-3">
                <Button
                  variant={signatureMode === 'draw' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSignatureMode('draw')}
                >
                  Dibujar firma
                </Button>
                <Button
                  variant={signatureMode === 'upload' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSignatureMode('upload')}
                >
                  Subir imagen de firma
                </Button>
              </div>

              {signatureMode === 'draw' ? (
                <div>
                  <div className="border-2 border-dashed border-gray-400 rounded-lg bg-white relative" style={{ touchAction: 'none' }}>
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={200}
                      className="w-full cursor-crosshair rounded-lg"
                      style={{ maxHeight: '200px' }}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                    {!hasSignature && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-400">
                        Dibuje su firma aqui
                      </div>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={clearSignature} className="mt-2">
                    Borrar firma
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Suba una imagen PNG o JPG de su firma (fondo blanco preferiblemente).</p>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={(e) => setSignatureImageFile(e.target.files?.[0] || null)}
                    className="rounded border border-border p-2 w-full"
                  />
                  {signatureImageFile && (
                    <div className="mt-2 border rounded p-2 bg-white">
                      <img
                        src={URL.createObjectURL(signatureImageFile)}
                        alt="Vista previa de firma"
                        className="max-h-24 mx-auto"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Upload signed PDF */}
            <div className="border-t pt-4">
              <p className="font-semibold mb-2">3. Subir PDF firmado</p>
              <p className="text-sm text-muted-foreground mb-3">Seleccione el PDF que guardo despues de firmarlo en Adobe.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={(e) => setSignFile(e.target.files?.[0] || null)}
                  className="flex-1 rounded border border-border p-2"
                />
                <Button
                  onClick={handleUpload}
                  disabled={!signFile || uploading || (signatureMode === 'draw' && !hasSignature) || (signatureMode === 'upload' && !signatureImageFile)}
                  className="w-full sm:w-auto"
                >
                  {uploading ? 'Subiendo...' : 'Subir PDF firmado'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
