// Devuelve la URL base de la API según el entorno (docker o local)
export function getApiBase() {
  const envBase = import.meta.env.VITE_API_BASE;

  // En desarrollo local (localhost), siempre usar el backend local en el puerto 4000.
  // Esto evita que devserver (o variables de entorno en docker) dirijan a nombres no resolubles como "backend".
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return 'http://localhost:4000';
  }

  return envBase || '';
}
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
