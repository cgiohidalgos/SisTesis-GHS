// Devuelve la URL base de la API según el entorno (docker o local)
export function getApiBase() {
  const envBase = import.meta.env.VITE_API_BASE;
  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      // when running the dev server locally we proxy requests,
      // so use a relative base path (empty string) to let Vite
      // forward through /auth, /user_roles, etc.
      return '';
    }
  }
  return envBase || '';
}
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
