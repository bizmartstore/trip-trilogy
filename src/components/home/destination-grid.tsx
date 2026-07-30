import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { ArrowUpRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import type { Destination } from "@/lib/types";

export function DestinationGrid({
  destinations,
  isLoading,
}: {
  destinations?: Destination[];
  isLoading: boolean;
}) {
  if (isLoading || !destinations) {
    return (
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[5/4] rounded-3xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {destinations.map((d, i) => (
        <motion.div
          key={d.id}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          <Link
            to="/explore"
            search={{ destination: d.name, kind: "all" }}
            className="group relative block aspect-[5/4] overflow-hidden rounded-3xl shadow-soft"
          >
            <img
              src={d.image}
              alt={`${d.name}, ${d.country}`}
              loading="lazy"
              width={1200}
              height={960}
              className="size-full object-cover transition-transform duration-[1000ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-deep/85 via-deep/25 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-deep-foreground">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-sand">
                {d.country}
              </p>
              <h3 className="mt-1 flex items-center gap-2 font-display text-2xl font-semibold">
                {d.name}
                <ArrowUpRight className="size-5 transition-transform duration-500 group-hover:translate-x-1 group-hover:-translate-y-1" />
              </h3>
              <p className="mt-1 text-sm text-deep-foreground/80">{d.tagline}</p>
              <p className="mt-3 text-xs text-deep-foreground/70">{d.listings} listings</p>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
