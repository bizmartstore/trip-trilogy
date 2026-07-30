import { useCountUp } from "@/hooks/use-count-up";

const stats = [
  { value: 12400, suffix: "+", label: "Verified experiences" },
  { value: 3200, suffix: "+", label: "Partner businesses" },
  { value: 186, suffix: "", label: "Destinations covered" },
  { value: 98, suffix: "%", label: "Would book again" },
];

function Stat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { ref, display } = useCountUp(value);
  return (
    <div className="text-center">
      <p className="font-display text-4xl font-semibold text-primary sm:text-5xl">
        <span ref={ref}>{display.toLocaleString()}</span>
        {suffix}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function StatsStrip() {
  return (
    <section className="container-x">
      <div className="grid grid-cols-2 gap-8 rounded-[2rem] border border-border bg-card px-6 py-12 shadow-soft lg:grid-cols-4">
        {stats.map((s) => (
          <Stat key={s.label} {...s} />
        ))}
      </div>
    </section>
  );
}
