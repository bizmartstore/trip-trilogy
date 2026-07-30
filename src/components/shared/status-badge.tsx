import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<BookingStatus, string> = {
  pending: "bg-warning/20 text-warning-foreground",
  approved: "bg-primary/15 text-primary",
  confirmed: "bg-success/15 text-success",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/12 text-destructive",
  rejected: "bg-destructive/12 text-destructive",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge className={cn("rounded-full border-0 capitalize", styles[status])}>{status}</Badge>
  );
}
