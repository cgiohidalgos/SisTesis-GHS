import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { RefreshCw, Users, GraduationCap, Search, ChevronDown, ChevronUp, Wifi } from "lucide-react";
import { toast } from "sonner";

function getApiBase() {
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:4000"
    : "/api";
}

function formatDate(ts: number | null) {
  if (!ts) return null;
  return new Date(ts * 1000).toLocaleString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(ts: number | null): string {
  if (!ts) return "Nunca";
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return "Hace un momento";
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `Hace ${Math.floor(diff / 86400)} días`;
  return formatDate(ts) ?? "Nunca";
}

interface EvaluatorRow {
  id: string;
  full_name: string;
  institutional_email: string;
  specialty: string | null;
  last_login: number | null;
}

interface StudentRow {
  id: string;
  full_name: string;
  institutional_email: string;
  student_code: string | null;
  last_login: number | null;
}

type ConnectionFilter = "all" | "today" | "week" | "never";

function connectionLabel(filter: ConnectionFilter) {
  return { all: "Todos", today: "Hoy", week: "Esta semana", never: "Nunca" }[filter];
}

function matchesFilter(ts: number | null, filter: ConnectionFilter) {
  if (filter === "all") return true;
  if (filter === "never") return !ts;
  if (!ts) return false;
  const now = Math.floor(Date.now() / 1000);
  if (filter === "today") return now - ts < 86400;
  if (filter === "week") return now - ts < 604800;
  return true;
}

interface SectionProps<T> {
  title: string;
  icon: React.ReactNode;
  rows: T[];
  total: number;
  loading: boolean;
  search: string;
  onSearch: (v: string) => void;
  filter: ConnectionFilter;
  onFilter: (v: ConnectionFilter) => void;
  columns: { label: string; className?: string; render: (row: T) => React.ReactNode }[];
  emptyMsg: string;
}

function Section<T extends { id: string }>({
  title, icon, rows, total, loading, search, onSearch, filter, onFilter, columns, emptyMsg,
}: SectionProps<T>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Accordion header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
      >
        <span className="text-primary">{icon}</span>
        <span className="font-semibold text-base">{title}</span>
        <span className="ml-1 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          {total}
        </span>
        <span className="ml-auto text-muted-foreground">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
      </button>

      {open && (
        <>
          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-border bg-background">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Buscar por nombre o correo…"
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-1">
              {(["all", "today", "week", "never"] as ConnectionFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => onFilter(f)}
                  className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {connectionLabel(f)}
                </button>
              ))}
            </div>
            {rows.length !== total && (
              <span className="text-xs text-muted-foreground">
                {rows.length} resultado{rows.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/20 border-t border-border">
                <tr>
                  {columns.map((col) => (
                    <th key={col.label} className={`text-left px-5 py-3 font-medium text-muted-foreground ${col.className ?? ""}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length} className="text-center py-10 text-muted-foreground">
                      Cargando…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="text-center py-10 text-muted-foreground">
                      {emptyMsg}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} className="border-t border-border hover:bg-muted/20 transition-colors">
                      {columns.map((col) => (
                        <td key={col.label} className={`px-5 py-3 ${col.className ?? ""}`}>
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function ConnectionBadge({ ts }: { ts: number | null }) {
  if (!ts) return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">Nunca</span>;
  const diff = Math.floor(Date.now() / 1000) - ts;
  const color = diff < 86400 ? "bg-green-500/15 text-green-700" : diff < 604800 ? "bg-yellow-500/15 text-yellow-700" : "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex flex-col gap-0 text-xs px-2 py-1 rounded-lg ${color}`}>
      <span className="font-medium">{timeAgo(ts)}</span>
      <span className="opacity-70">{formatDate(ts)}</span>
    </span>
  );
}

export default function AdminConnections() {
  const { isSuper } = useAuth();
  const [evaluators, setEvaluators] = useState<EvaluatorRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [evalSearch, setEvalSearch] = useState("");
  const [evalFilter, setEvalFilter] = useState<ConnectionFilter>("all");
  const [studSearch, setStudSearch] = useState("");
  const [studFilter, setStudFilter] = useState<ConnectionFilter>("all");

  const load = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${getApiBase()}/admin/connections`, {
        headers: { Authorization: token ? `Bearer ${token}` : "" },
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEvaluators(data.evaluators ?? []);
      setStudents(data.students ?? []);
    } catch {
      toast.error("No se pudieron cargar las conexiones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filteredEvaluators = useMemo(() => {
    const q = evalSearch.toLowerCase();
    return evaluators.filter(
      (e) =>
        matchesFilter(e.last_login, evalFilter) &&
        ((e.full_name ?? "").toLowerCase().includes(q) ||
          (e.institutional_email ?? "").toLowerCase().includes(q) ||
          (e.specialty ?? "").toLowerCase().includes(q))
    );
  }, [evaluators, evalSearch, evalFilter]);

  const filteredStudents = useMemo(() => {
    const q = studSearch.toLowerCase();
    return students.filter(
      (s) =>
        matchesFilter(s.last_login, studFilter) &&
        ((s.full_name ?? "").toLowerCase().includes(q) ||
          (s.institutional_email ?? "").toLowerCase().includes(q) ||
          (s.student_code ?? "").toLowerCase().includes(q))
    );
  }, [students, studSearch, studFilter]);

  return (
    <AppLayout role={isSuper ? "superadmin" : "admin"}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold flex items-center gap-2">
              <Wifi className="w-6 h-6 text-primary" />
              Conexiones
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Última conexión registrada de evaluadores y estudiantes
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Actualizar
          </button>
        </div>

        <Section
          title="Evaluadores"
          icon={<Users className="w-5 h-5" />}
          rows={filteredEvaluators}
          total={evaluators.length}
          loading={loading}
          search={evalSearch}
          onSearch={setEvalSearch}
          filter={evalFilter}
          onFilter={setEvalFilter}
          emptyMsg="Sin resultados"
          columns={[
            {
              label: "Nombre",
              render: (ev) => <span className="font-medium">{ev.full_name}</span>,
            },
            {
              label: "Correo institucional",
              className: "hidden md:table-cell text-muted-foreground",
              render: (ev) => ev.institutional_email || "—",
            },
            {
              label: "Especialidad",
              className: "hidden lg:table-cell text-muted-foreground",
              render: (ev) => ev.specialty || "—",
            },
            {
              label: "Última conexión",
              render: (ev) => <ConnectionBadge ts={ev.last_login} />,
            },
          ]}
        />

        <Section
          title="Estudiantes"
          icon={<GraduationCap className="w-5 h-5" />}
          rows={filteredStudents}
          total={students.length}
          loading={loading}
          search={studSearch}
          onSearch={setStudSearch}
          filter={studFilter}
          onFilter={setStudFilter}
          emptyMsg="Sin resultados"
          columns={[
            {
              label: "Nombre",
              render: (st) => <span className="font-medium">{st.full_name}</span>,
            },
            {
              label: "Correo institucional",
              className: "hidden md:table-cell text-muted-foreground",
              render: (st) => st.institutional_email || "—",
            },
            {
              label: "Código",
              className: "hidden lg:table-cell text-muted-foreground",
              render: (st) => st.student_code || "—",
            },
            {
              label: "Última conexión",
              render: (st) => <ConnectionBadge ts={st.last_login} />,
            },
          ]}
        />
      </div>
    </AppLayout>
  );
}
