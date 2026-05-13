import { cn } from "@/lib/utils";
import { statusLabels, statusColors, type ThesisStatus } from "@/lib/mock-data";

interface StatusBadgeProps {
  status: ThesisStatus;
}

const colorClasses: Record<string, string> = {
  info: "bg-info/20 text-info border border-info/50",
  warning: "bg-warning/20 text-warning border border-warning/50",
  accent: "bg-accent/20 text-accent-foreground border border-accent/50",
  destructive: "bg-destructive/20 text-destructive border border-destructive/50",
  success: "bg-success/20 text-success border border-success/50",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const colorKey = statusColors[status];
  return (
    <span className={cn("status-badge", colorClasses[colorKey])}>
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          colorKey === "success" && "bg-success",
          colorKey === "warning" && "bg-warning",
          colorKey === "info" && "bg-info",
          colorKey === "destructive" && "bg-destructive",
          colorKey === "accent" && "bg-accent"
        )}
      />
      {statusLabels[status]}
    </span>
  );
}
