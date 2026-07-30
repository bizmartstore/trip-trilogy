import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { Loader2, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { fetchTestimonials, submitTestimonial } from "@/lib/api";

export function Testimonials() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: testimonials = [], isLoading } = useQuery({
    queryKey: ["testimonials"],
    queryFn: fetchTestimonials,
  });

  const [body, setBody] = useState("");
  const [role, setRole] = useState("");
  const [rating, setRating] = useState(5);

  const submit = useMutation({
    mutationFn: () =>
      submitTestimonial({
        author: user!.name,
        email: user!.email,
        role: role.trim() || "Traveller",
        body: body.trim(),
        rating,
      }),
    onSuccess: () => {
      toast.success("Thanks for your feedback");
      setBody("");
      setRole("");
      setRating(5);
      void qc.invalidateQueries({ queryKey: ["testimonials"] });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Could not save feedback");
    },
  });

  return (
    <section className="section bg-secondary/50">
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Loved by travellers
          </span>
          <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">
            Feedback from people who booked
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Signed-in travellers can share their experience — it appears here for everyone.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {isLoading ? (
            <p className="col-span-full text-center text-sm text-muted-foreground">Loading…</p>
          ) : null}
          {!isLoading && testimonials.length === 0 ? (
            <p className="col-span-full rounded-3xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
              No traveller feedback yet. Be the first after you sign in.
            </p>
          ) : null}
          {testimonials.map((t, i) => (
            <motion.figure
              key={t.id}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="hover-lift flex flex-col rounded-3xl border border-border bg-card p-7 shadow-soft"
            >
              <div className="flex gap-0.5">
                {Array.from({ length: t.rating }).map((_, s) => (
                  <Star key={s} className="size-4 fill-gold text-gold" />
                ))}
              </div>
              <blockquote className="mt-5 flex-1 text-base leading-relaxed text-foreground/90">
                “{t.body}”
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary">
                  {t.author.charAt(0)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{t.author}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.role}</span>
                </span>
              </figcaption>
            </motion.figure>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-xl rounded-3xl border border-border bg-card p-6 shadow-soft">
          <h3 className="font-display text-lg font-semibold">Share your trip</h3>
          {user ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (body.trim().length < 20) {
                  toast.error("Write at least 20 characters");
                  return;
                }
                submit.mutate();
              }}
            >
              <Input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Solo traveller, Manila"
                className="h-11 rounded-xl"
                maxLength={80}
              />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="What did you love about booking with ExploreHub?"
                className="min-h-28 rounded-xl"
                maxLength={600}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const value = i + 1;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-label={`${value} stars`}
                        onClick={() => setRating(value)}
                        className="p-1"
                      >
                        <Star
                          className={
                            value <= rating
                              ? "size-5 fill-gold text-gold"
                              : "size-5 text-muted-foreground"
                          }
                        />
                      </button>
                    );
                  })}
                </div>
                <Button type="submit" variant="hero" className="rounded-full" disabled={submit.isPending}>
                  {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : "Post feedback"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              <Link to="/auth" className="font-medium text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>{" "}
              to leave feedback that other travellers can read.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
