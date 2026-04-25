import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { getApiBase } from "@/lib/utils";

const API_BASE = getApiBase();

type AppRole = "student" | "evaluator" | "admin";

interface AuthContextType {
  user: any | null;
  session: any | null;
  roles: string[];
  role: AppRole | null;
  isSuper: boolean;
  profile: { full_name: string; student_code?: string; cedula?: string; institutional_email?: string } | null;
  loading: boolean;
  signOut: (options?: { redirect?: boolean }) => Promise<void>;
  refreshSession: () => Promise<AppRole | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  roles: [],
  role: null,
  isSuper: false,
  profile: null,
  loading: true,
  signOut: async () => {},
  refreshSession: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isSuper, setIsSuper] = useState(false);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string): Promise<AppRole | null> => {
    let resolvedRole: AppRole | null = null;
    try {
      const token = localStorage.getItem('token');
      const authHeaders: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

      const rolesResp = await fetch(`${API_BASE}/user_roles?user_id=${encodeURIComponent(userId)}`, { headers: authHeaders });
      const ro = await rolesResp.json();
      setRoles(ro || []);
      setIsSuper(Array.isArray(ro) && ro.includes('superadmin'));
      if (ro && Array.isArray(ro)) {
        if (ro.includes('superadmin') || ro.includes('admin')) {
          resolvedRole = 'admin';
        } else if (ro.includes('evaluator')) {
          resolvedRole = 'evaluator';
        } else if (ro.includes('student')) {
          resolvedRole = 'student';
        }
      }
      setRole(resolvedRole);

      const profileResp = await fetch(`${API_BASE}/profiles/${encodeURIComponent(userId)}`, { headers: authHeaders });
      if (profileResp.ok) {
        const profileData = await profileResp.json();
        setProfile(profileData as AuthContextType["profile"]);
      }
    } catch (err) {
      console.error('fetchUserData error', err);
    }
    return resolvedRole;
  };

  const refreshSession = async (): Promise<AppRole | null> => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/auth/session`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const data = await resp.json();
      if (data?.token) {
        localStorage.setItem('token', data.token);
      }
      const sess = data.session ?? null;
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        return await fetchUserData(sess.user.id);
      } else {
        setRole(null);
        setProfile(null);
      }
    } catch (err) {
      console.error('session check error', err);
    } finally {
      setLoading(false);
    }
    return null;
  };

  const navigate = useNavigate();
  const originalFetchRef = useRef<typeof window.fetch | null>(null);

  useEffect(() => {
    refreshSession();
  }, []);

  const signOut = useCallback(async (options?: { redirect?: boolean }) => {
    const nativeFetch = originalFetchRef.current ?? window.fetch.bind(window);

    try {
      const token = localStorage.getItem('token');
      await nativeFetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
    } catch (err) {
      console.error('signOut error', err);
    }

    localStorage.removeItem('token');
    setUser(null);
    setSession(null);
    setRole(null);
    setProfile(null);

    if (options?.redirect !== false) {
      const loginPath = role === 'admin' || role === 'evaluator' ? '/login/staff' : '/login/student';
      navigate(loginPath, { replace: true });
    }
  }, [navigate, role]);

  const decodeJwtPayload = (token: string): any | null => {
    try {
      const [, payload] = token.split('.');
      if (!payload) return null;
      const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decodeURIComponent(escape(decoded)));
    } catch {
      return null;
    }
  };

  const tokenExpiresSoon = (token: string, thresholdMs = 60 * 60 * 1000) => {
    const payload = decodeJwtPayload(token);
    if (!payload?.exp) return false;
    return payload.exp * 1000 - Date.now() < thresholdMs;
  };

  const updateTokenFromResponse = async (response: Response) => {
    if (!response.ok) return;
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return;

    try {
      const data = await response.clone().json();
      if (data?.token) {
        localStorage.setItem('token', data.token);
        if (data?.session) {
          setSession(data.session);
          setUser(data.session.user ?? null);
        }
      }
    } catch {
      // ignore parse errors
    }
  };

  useEffect(() => {
    originalFetchRef.current = window.fetch.bind(window);
    const originalFetch = originalFetchRef.current;

    window.fetch = async (input: RequestInfo, init?: RequestInit) => {
      const requestUrl = typeof input === 'string' ? input : input.url;
      const token = localStorage.getItem('token');
      const isAuthRefresh = requestUrl.includes('/auth/refresh');
      const isAuthLogout = requestUrl.includes('/auth/logout');

      if (token && !isAuthRefresh && !isAuthLogout && tokenExpiresSoon(token)) {
        try {
          const refreshResponse = await originalFetch(`${API_BASE}/auth/refresh`, {
            headers: { Authorization: `Bearer ${token}` },
          });

          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            if (refreshData?.token) {
              localStorage.setItem('token', refreshData.token);
              if (refreshData?.session) {
                setSession(refreshData.session);
                setUser(refreshData.session.user ?? null);
              }
            }
          } else if (refreshResponse.status === 401) {
            toast.error('Sesión expirada. Inicia sesión de nuevo.');
            await signOut({ redirect: true });
            return refreshResponse;
          }
        } catch (err) {
          console.error('token refresh error', err);
        }
      }

      const headers = new Headers(init?.headers);
      const currentToken = localStorage.getItem('token');
      if (currentToken) {
        headers.set('Authorization', `Bearer ${currentToken}`);
      }

      const finalInit = { ...init, headers };
      const response = await originalFetch(input, finalInit);

      if (response.status === 401) {
        let message = 'Sesión expirada. Inicia sesión de nuevo.';
        try {
          const data = await response.clone().json();
          if (data?.error && typeof data.error === 'string') {
            if (!/invalid token|token.*expir|jwt/i.test(data.error)) {
              message = data.error;
            }
          }
        } catch {
          // ignore parse errors
        }

        toast.error(message);
        await signOut({ redirect: true });
      }

      if (requestUrl.includes('/auth/session') || requestUrl.includes('/auth/refresh')) {
        await updateTokenFromResponse(response);
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [signOut]);

  return (
    <AuthContext.Provider value={{ user, session, roles, role, isSuper, profile, loading, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
