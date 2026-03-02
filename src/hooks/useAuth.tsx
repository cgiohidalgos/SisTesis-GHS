import { createContext, useContext, useEffect, useState, ReactNode } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [role, setRole] = useState<AppRole | null>(null);
  const [isSuper, setIsSuper] = useState(false);
  const [profile, setProfile] = useState<AuthContextType["profile"]>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = async (userId: string) => {
    try {
      const rolesResp = await fetch(`${API_BASE}/user_roles?user_id=${encodeURIComponent(userId)}`);
      const ro = await rolesResp.json();
      setRoles(ro || []);
      setIsSuper(Array.isArray(ro) && ro.includes('superadmin'));
      if (ro && Array.isArray(ro)) {
        // se da prioridad a roles de mayor privilegio
        if (ro.includes('superadmin') || ro.includes('admin')) {
          setRole('admin');
        } else if (ro.includes('evaluator')) {
          setRole('evaluator');
        } else if (ro.includes('student')) {
          setRole('student');
        } else {
          setRole(null);
        }
      }

      const profileResp = await fetch(`${API_BASE}/profiles/${encodeURIComponent(userId)}`);
      if (profileResp.ok) {
        const profileData = await profileResp.json();
        setProfile(profileData as AuthContextType["profile"]);
      }
    } catch (err) {
      console.error('fetchUserData error', err);
    }
  };

  useEffect(() => {
    // Simple session check against local API using token from localStorage
    (async () => {
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
          fetchUserData(sess.user.id);
        } else {
          setRole(null);
          setProfile(null);
        }
      } catch (err) {
        console.error('session check error', err);
      } finally {
        setLoading(false);
      }
    })();
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
    <AuthContext.Provider value={{ user, session, roles, role, isSuper, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
