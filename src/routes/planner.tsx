import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Sparkles, Wallet, Users, CalendarRange, MapPin, Loader2, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ListingCard } from "@/components/listings/listing-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { destinationOptions, tagOptions } from "@/lib/api";
import {
  buildPlan,
  
  type PlanInput,
  type PlanOutput,
  type PlanSuggestion,
} from "@/lib/planner";
import { peso } from "@/lib/utils";

export const Route = createFileRoute("/planner")({
  head: () => ({
    meta: [
      { title: "Smart Trip Planner — Build a Costed Itinerary | Nexora" },
      {
        name: "description",
        content:
          "Enter your destination, dates, travellers and budget. Nexora assembles a costed itinerary of tours, stays and restaurants you can customise before booking.",
      },
      { property: "og:title", content: "Smart Trip Planner | Nexora" },
      {
        property: "og:description",
        content: "Auto-build a costed itinerary of tours, stays and restaurants for any budget.",
      },
    ],
  }),
  component: Planner,
});

function Planner() {
  const [destination, setDestination] = useState(destinationOptions()[0]);
  const [nights, setNights] = useState(4);
  const [travellers, setTravellers] = useState(2);
  const [budget, setBudget] = useState(60000);
  const [interests, setInterests] = useState<string[]>(["beach", "food"]);
  const [plan, setPlan] = useState<PlanOutput | null>(null);
  const [building, setBuilding] = useState(false);

  const build = (override?: Partial<PlanInput>) => {
    const input: PlanInput = {
      destination,
      nights,
      travellers,
      budget,
      interests,
      ...override,
    };
    setBuilding(true);
    setTimeout(() => {
      const output = buildPlan(input);
      setPlan(output);
      setBuilding(false);
      if (output.best) {
        toast.success("Itinerary ready", {
          description: `${output.best.items.length} picks for ${input.destination} — ${peso(
            Math.round(output.best.total),
          )} of your ${peso(input.budget)} budget.`,
        });
      } else {
        toast.warning("No itinerary fits this budget", {
          description: "We've suggested the closest alternatives below.",
        });
      }
    }, 700);
  };

  const applySuggestion = (s: PlanSuggestion) => {
    if (s.patch.destination !== undefined) setDestination(s.patch.destination);
    if (s.patch.nights !== undefined) setNights(s.patch.nights);
    if (s.patch.travellers !== undefined) setTravellers(s.patch.travellers);
    if (s.patch.budget !== undefined) setBudget(s.patch.budget);
    build(s.patch);
  };

  const best = plan?.best ?? null;
  const estimate = best?.total ?? 0;
  const withinBudget = !!best;


  return (
    <div className="pt-28">
      <div className="container-x">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Sparkles className="size-3.5" /> Smart Trip Planner
          </span>
          <h1 className="mt-5 text-4xl font-semibold sm:text-5xl">
            Tell us the shape of your trip
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            We'll combine a stay, an experience and a table into a single costed itinerary you can
            adjust before booking.
          </p>
        </motion.div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-soft lg:sticky lg:top-28 lg:self-start">
            <div className="space-y-6">
              <div>
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <MapPin className="size-4" /> Destination
                </Label>
                <Select value={destination} onValueChange={setDestination}>
                  <SelectTrigger className="mt-3 h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    {destinationOptions().map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <CalendarRange className="size-4" /> Nights
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={nights}
                    onChange={(e) => setNights(Math.max(1, Number(e.target.value)))}
                    className="mt-3 h-11 rounded-xl"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <Users className="size-4" /> Travellers
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={travellers}
                    onChange={(e) => setTravellers(Math.max(1, Number(e.target.value)))}
                    className="mt-3 h-11 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <Wallet className="size-4" /> Budget
                  </Label>
                  <span className="text-sm text-muted-foreground">{peso(budget)}</span>
                </div>
                <Slider
                  className="mt-5"
                  value={[budget]}
                  min={300}
                  max={200000}
                  step={500}
                  onValueChange={(v) => setBudget(v[0])}
                />
              </div>

              <div>
                <Label className="text-sm font-semibold">Interests</Label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tagOptions().map((t) => {
                    const active = interests.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() =>
                          setInterests((prev) =>
                            active ? prev.filter((x) => x !== t) : [...prev, t],
                          )
                        }
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button variant="hero" size="lg" className="w-full rounded-full" onClick={() => build()} disabled={building}>
                {building ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Building itinerary…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> Generate itinerary
                  </>
                )}
              </Button>
            </div>
          </div>

          <div>
            {!plan && !building ? (
              <div className="grid min-h-[420px] place-items-center rounded-3xl border border-dashed border-border p-10 text-center">
                <div>
                  <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Sparkles className="size-7" />
                  </span>
                  <h2 className="mt-5 font-display text-xl font-semibold">
                    Your itinerary appears here
                  </h2>
                  <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                    Set your destination, dates and budget on the left, then generate a plan.
                  </p>
                </div>
              </div>
            ) : null}

            {building ? (
              <div className="grid min-h-[420px] place-items-center rounded-3xl border border-border bg-card">
                <div className="text-center">
                  <Loader2 className="mx-auto size-8 animate-spin text-primary" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    Matching {interests.length} interests across {destination}…
                  </p>
                </div>
              </div>
            ) : null}

            {plan && !building ? (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                {best ? (
                  <>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-3xl border border-border bg-card p-6 shadow-soft">
                      <div className="min-w-0">
                        <p className="text-sm text-muted-foreground">Estimated trip cost</p>
                        <p className="font-display text-3xl font-semibold">
                          {peso(Math.round(estimate))}
                        </p>
                        <Badge
                          className={`mt-2 rounded-full border-0 ${
                            withinBudget
                              ? "bg-success text-success-foreground"
                              : "bg-destructive text-destructive-foreground"
                          }`}
                        >
                          {withinBudget
                            ? `${peso(Math.round(budget - estimate))} under budget · ${Math.round(
                                best.utilisation * 100,
                              )}% used`
                            : `${peso(Math.round(estimate - budget))} over budget`}
                        </Badge>
                      </div>
                      <Button
                        variant="outline"
                        className="shrink-0 rounded-full"
                        onClick={() => build()}
                      >
                        <RefreshCw className="size-4" /> Reshuffle
                      </Button>
                    </div>

                    <div className="mt-6 grid gap-6 sm:grid-cols-2">
                      {best.items.map((l, i) => (
                        <ListingCard key={l.id} listing={l} index={i} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
                    <p className="text-sm text-muted-foreground">
                      Nothing in {destination} fits {peso(budget)} for {nights} night
                      {nights > 1 ? "s" : ""} and {travellers} traveller
                      {travellers > 1 ? "s" : ""}.
                      {plan.cheapestTotal
                        ? ` The closest itinerary costs ${peso(Math.round(plan.cheapestTotal))}.`
                        : ""}
                    </p>

                    {plan.suggestions.length ? (
                      <div className="mt-5 space-y-3">
                        <p className="text-sm font-semibold">Closest alternatives</p>
                        {plan.suggestions.map((s) => (
                          <div
                            key={s.label}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4"
                          >
                            <div className="min-w-0">
                              <p className="font-medium">{s.label}</p>
                              <p className="text-sm text-muted-foreground">{s.detail}</p>
                              <p className="mt-1 text-sm font-semibold">
                                {peso(Math.round(s.total))} · {s.items.length} picks
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              className="shrink-0 rounded-full"
                              onClick={() => applySuggestion(s)}
                            >
                              Apply
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm text-muted-foreground">
                        No listings yet in {destination} — try another destination.
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
