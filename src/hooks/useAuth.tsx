import { createContext, useContext, useEffect, useState, ReactNode } from "react";
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
  signOut: () => Promise<void>;
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

  useEffect(() => {
    refreshSession();
  }, []);

  const signOut = async () => {
    try {
      const token = localStorage.getItem('token');
      await fetch(`${API_BASE}/auth/logout`, {
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
  };

  return (
    <AuthContext.Provider value={{ user, session, roles, role, isSuper, profile, loading, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
