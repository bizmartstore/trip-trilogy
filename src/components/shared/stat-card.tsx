import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  index = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta?: string;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.07 }}
      className="rounded-3xl border border-border bg-card p-6 shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        {delta ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold",
              delta.startsWith("-")
                ? "bg-destructive/10 text-destructive"
                : "bg-success/12 text-success",
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
      <p className="mt-5 font-display text-3xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </motion.div>
  );
}
