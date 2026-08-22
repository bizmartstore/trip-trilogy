import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<BookingStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  approved: "bg-primary/15 text-primary",
  confirmed: "bg-success/15 text-success",
  completed: "bg-muted text-muted-foreground",
  partial_payment: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  completed_payment: "bg-success/15 text-success",
  cancelled: "bg-destructive/12 text-destructive",
  rejected: "bg-destructive/12 text-destructive",
};

const labels: Partial<Record<BookingStatus, string>> = {
  partial_payment: "Partially paid",
  completed_payment: "Fully paid",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge className={cn("rounded-full border-0 capitalize", styles[status])}>
      {labels[status] ?? status}
    </Badge>
  );
}
