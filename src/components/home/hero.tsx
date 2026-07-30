import { motion, useScroll, useTransform } from "motion/react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Play, Star } from "lucide-react";
import { useRef } from "react";

import heroImage from "@/assets/hero.jpg";
import { SearchBar } from "@/components/search/search-bar";
import { Button } from "@/components/ui/button";

export function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "22%"]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.15]);
  const fade = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-[92vh] overflow-hidden">
      <motion.div style={{ y, scale }} className="absolute inset-0">
        <img
          src={heroImage}
          alt="Aerial view of tropical limestone islands at golden hour"
          width={1920}
          height={1088}
          className="size-full object-cover"
        />
      </motion.div>
      <div className="absolute inset-0 bg-[image:var(--gradient-hero)]" />

      {/* animated ambient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-float-slow absolute -left-24 top-1/4 size-96 rounded-full bg-primary/25 blur-3xl" />
        <div className="animate-drift absolute -right-16 top-1/3 size-[28rem] rounded-full bg-gold/20 blur-3xl" />
      </div>

      <motion.div
        style={{ opacity: fade }}
        className="container-x relative flex min-h-[92vh] flex-col justify-center pb-16 pt-32"
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-3xl"
        >
          <span className="glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-deep-foreground">
            <Star className="size-3.5 fill-gold text-gold" />
            Rated 4.9 by 38,000 travellers
          </span>

          <h1 className="mt-6 text-balance text-5xl font-semibold leading-[1.05] text-deep-foreground sm:text-6xl lg:text-7xl">
            The whole trip.
            <br />
            <span className="text-gradient-gold">One marketplace.</span>
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-deep-foreground/85">
            Discover verified tours, hand-picked stays and tables worth flying for — then plan,
            book and manage every reservation from a single dashboard.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="sand" size="xl">
              <Link to="/explore" search={{ kind: "all" }}>
                Start exploring
                <ArrowRight className="size-4.5" />
              </Link>
            </Button>
            <Button asChild variant="glass" size="xl" className="text-deep-foreground">
              <Link to="/planner">
                <Play className="size-4.5" />
                Plan my trip
              </Link>
            </Button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="mt-14 w-full max-w-5xl"
        >
          <SearchBar />
        </motion.div>
      </motion.div>
    </section>
  );
}
