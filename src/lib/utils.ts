// Devuelve la URL base de la API según el entorno (docker o local)
export function getApiBase() {
  // Override en runtime para ngrok/dev sin necesidad de rebuild.
  // Úsalo desde la consola del navegador:
  //   localStorage.setItem('__api_base__', 'https://TU-BACKEND.ngrok-free.app')
  if (typeof window !== 'undefined') {
    const override = localStorage.getItem('__api_base__');
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (override) {
      const overrideIsLocal = override.includes('localhost') || override.includes('127.0.0.1');
      if (overrideIsLocal && !isLocalhost) {
        localStorage.removeItem('__api_base__');
      } else {
        return override;
      }
    }
  }

  // En desarrollo local (localhost) y SIN variable de entorno definida, usar el backend local en el puerto 4000.
  // Si VITE_API_BASE está definido (producción), ignorar el hostname y usar siempre esa URL.
  const apiBase = import.meta.env.VITE_API_BASE;
  if (apiBase) return apiBase;

  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:4000';
  }

  return '';
}
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
