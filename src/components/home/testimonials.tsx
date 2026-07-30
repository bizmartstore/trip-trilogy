import { motion } from "motion/react";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Amara Devi",
    role: "Solo traveller, Singapore",
    body: "I booked a three-day Kyoto itinerary, two hotel nights and a tasting menu in under ten minutes. Everything synced to one dashboard with a countdown to departure.",
    rating: 5,
  },
  {
    name: "Tomas Reyes",
    role: "Family of four, Madrid",
    body: "The trip planner suggested a combination we'd never have found ourselves and came in under our budget. The kids still talk about the sandbar lunch.",
    rating: 5,
  },
  {
    name: "Lena Fischer",
    role: "Business owner, Bali",
    body: "As a partner, the booking dashboard is the cleanest I've used. Approvals, analytics and guest messages all in one place — my occupancy is up 34%.",
    rating: 5,
  },
];

export function Testimonials() {
  return (
    <section className="section bg-secondary/50">
      <div className="container-x">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Loved by travellers
          </span>
          <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">
            38,000 trips planned and counting
          </h2>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.figure
              key={t.name}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
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
                  {t.name.charAt(0)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{t.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.role}</span>
                </span>
              </figcaption>
            </motion.figure>
          ))}
        </div>
      </div>
    </section>
  );
}
