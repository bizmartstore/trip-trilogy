import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageSquareQuote, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTestimonials, removeTestimonial } from "@/lib/api";

export function TestimonialsPanel({ actorEmail }: { actorEmail: string }) {
  const qc = useQueryClient();
  const testimonials = useQuery({
    queryKey: ["testimonials"],
    queryFn: fetchTestimonials,
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeTestimonial(actorEmail, id),
    onSuccess: () => {
      toast.success("Feedback removed permanently");
      void qc.invalidateQueries({ queryKey: ["testimonials"] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not remove feedback"),
  });

  if (testimonials.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  const items = testimonials.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Homepage feedback posted by travellers. It is published instantly without approval — remove
        anything inappropriate here and it is deleted permanently.
      </p>

      {items.length ? (
        <ul className="space-y-3">
          {items.map((t) => (
            <li key={t.id} className="rounded-2xl border border-border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{t.author}</p>
                    <span className="text-xs text-muted-foreground">{t.role}</span>
                    <span className="flex gap-0.5">
                      {Array.from({ length: t.rating }).map((_, s) => (
                        <Star key={s} className="size-3.5 fill-gold text-gold" />
                      ))}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t.email}
                    {t.createdAt ? ` · ${new Date(t.createdAt).toLocaleString()}` : ""}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">“{t.body}”</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 rounded-full self-start text-destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (confirm(`Delete this feedback from ${t.author}? This cannot be undone.`)) {
                      remove.mutate(t.id);
                    }
                  }}
                >
                  {remove.isPending && remove.variables === t.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border py-12 text-center">
          <MessageSquareQuote className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No traveller feedback yet.</p>
        </div>
      )}
    </div>
  );
}
