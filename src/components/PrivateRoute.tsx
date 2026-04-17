import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface PrivateRouteProps {
  role?: 'student' | 'evaluator' | 'admin';
}

export default function PrivateRoute({ role }: PrivateRouteProps) {
  const { user, role: userRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-muted-foreground">
        Cargando...
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  if (role && userRole !== role) return <Navigate to="/" replace />;

  return <Outlet />;
}
