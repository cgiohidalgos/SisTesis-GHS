import { useEffect, useState, useMemo } from "react";
import AppLayout from "@/components/layout/AppLayout";
import ThesisCard from "@/components/thesis/ThesisCard";
import { toast } from "sonner";
import { Download, Search, X } from "lucide-react";
import { getApiBase } from "@/lib/utils";
import { statusLabels } from "@/lib/mock-data";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

const API_BASE = getApiBase();
const PAGE_SIZE = 12;

export default function AdminTheses() {
  const [theses, setTheses] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [programFilter, setProgramFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchTheses = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses`, {
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (!resp.ok) throw new Error('Error cargando proyectos de grado');
      const data = await resp.json();
      setTheses(data);
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDeleteThesis = async (id: string) => {
    if (!confirm('¿Eliminar este proyecto de grado? Esta acción no se puede deshacer.')) return;
    setTheses((prev) => prev.filter((t) => t.id !== id));
    try {
      const token = localStorage.getItem('token');
      const resp = await fetch(`${API_BASE}/theses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
      });
      if (resp.ok) {
        toast.success('Proyecto de grado eliminado');
        fetchTheses();
      } else if (resp.status === 404) {
        toast.error('El proyecto de grado ya no existe');
        fetchTheses();
      } else {
        const text = await resp.text().catch(() => '');
        throw new Error(text || 'Error eliminando proyecto de grado');
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    fetchTheses();
  }, []);

  // Unique programs from all theses
  const allPrograms = useMemo(() => {
    const map = new Map<string, string>();
    theses.forEach(t => (t.programs || []).forEach((p: any) => map.set(p.name, p.name)));
    return Array.from(map.values()).sort();
  }, [theses]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return theses
      .filter(t => !q || t.title.toLowerCase().includes(q) || (t.students || []).some((s: any) => s.name?.toLowerCase().includes(q)))
      .filter(t => !statusFilter || t.status === statusFilter)
      .filter(t => !programFilter || (t.programs || []).some((p: any) => p.name === programFilter));
  }, [theses, search, statusFilter, programFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setProgramFilter("");
    setCurrentPage(1);
  };

  const hasFilters = search || statusFilter || programFilter;

  // Reset to page 1 when filters change
  const handleSearch = (v: string) => { setSearch(v); setCurrentPage(1); };
  const handleStatus = (v: string) => { setStatusFilter(v); setCurrentPage(1); };
  const handleProgram = (v: string) => { setProgramFilter(v); setCurrentPage(1); };

  return (
    <AppLayout role="admin">
      <div className="max-w-4xl mx-auto px-4 sm:px-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="font-heading text-2xl font-bold text-foreground mb-1">
              Gestión de Proyectos de Grado
            </h2>
            <p className="text-sm text-muted-foreground">
              Todos los proyectos de grado registrados en el sistema.
            </p>
          </div>
          <a
            href={`${API_BASE}/admin/reports/theses`}
            download
            onClick={(e) => {
              const token = localStorage.getItem('token');
              if (!token) { e.preventDefault(); toast.error('Sin sesión'); return; }
              e.preventDefault();
              fetch(`${API_BASE}/admin/reports/theses`, {
                headers: { Authorization: `Bearer ${token}` },
              }).then(r => r.blob()).then(blob => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `proyecto-de-grado-${Date.now()}.csv`; a.click();
                URL.revokeObjectURL(url);
              }).catch(() => toast.error('Error exportando'));
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </a>
        </div>

        {/* Filters toolbar */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por título o estudiante…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => handleStatus(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="">Todos los estados</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          {allPrograms.length > 0 && (
            <select
              value={programFilter}
              onChange={e => handleProgram(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="">Todos los programas</option>
              {allPrograms.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          )}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-border bg-background hover:bg-muted transition-colors text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar
            </button>
          )}
        </div>

        {/* Count */}
        <p className="text-xs text-muted-foreground mb-3">
          {hasFilters
            ? `Mostrando ${filtered.length} de ${theses.length} proyecto(s)`
            : `${theses.length} proyecto(s) en total`}
        </p>

        {/* List */}
        {paginated.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="mb-2">No se encontraron proyectos con esos filtros.</p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-sm text-accent hover:underline">
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {paginated.map((thesis) => (
              <div key={thesis.id} className="relative overflow-hidden">
                <ThesisCard
                  thesis={thesis}
                  linkTo={`/admin/theses/${thesis.id}`}
                />
                <button
                  onClick={() => handleDeleteThesis(thesis.id)}
                  className="absolute top-2 right-2 text-red-600 hover:text-red-800 bg-white rounded-full p-1 shadow"
                  title="Eliminar proyecto de grado"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={e => { e.preventDefault(); if (safePage > 1) setCurrentPage(safePage - 1); }}
                    className={safePage <= 1 ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
                  if (totalPages <= 7 || p === 1 || p === totalPages || Math.abs(p - safePage) <= 1) {
                    return (
                      <PaginationItem key={p}>
                        <PaginationLink
                          href="#"
                          isActive={p === safePage}
                          onClick={e => { e.preventDefault(); setCurrentPage(p); }}
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  }
                  if (p === safePage - 2 || p === safePage + 2) {
                    return <PaginationItem key={p}><PaginationEllipsis /></PaginationItem>;
                  }
                  return null;
                })}
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={e => { e.preventDefault(); if (safePage < totalPages) setCurrentPage(safePage + 1); }}
                    className={safePage >= totalPages ? "pointer-events-none opacity-50" : ""}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
