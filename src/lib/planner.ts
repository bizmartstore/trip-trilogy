import { listings as allListings } from "@/data/catalog";
import type { Listing } from "@/lib/types";

export interface PlanInput {
  destination: string;
  nights: number;
  travellers: number;
  budget: number;
  interests: string[];
}

export interface PlanResult {
  items: Listing[];
  total: number;
  fits: boolean;
  utilisation: number;
}

export interface PlanSuggestion {
  label: string;
  detail: string;
  total: number;
  patch: Partial<PlanInput>;
  items: Listing[];
}

export interface PlanOutput {
  best: PlanResult | null;
  suggestions: PlanSuggestion[];
  cheapestTotal: number | null;
}

export const unitPrice = (l: Listing) =>
  l.discountPct ? l.price * (1 - l.discountPct / 100) : l.price;

export const lineCost = (l: Listing, nights: number, travellers: number) =>
  l.kind === "stay" ? unitPrice(l) * nights : unitPrice(l) * travellers;

const interestScore = (l: Listing, interests: string[]) =>
  interests.length ? l.tags.filter((t) => interests.includes(t)).length / interests.length : 0;

function combos<T>(items: T[], min: number, max: number): T[][] {
  const out: T[][] = [];
  const walk = (start: number, acc: T[]) => {
    if (acc.length >= min) out.push([...acc]);
    if (acc.length === max) return;
    for (let i = start; i < items.length; i++) walk(i + 1, [...acc, items[i]]);
  };
  walk(0, []);
  return out;
}

/** Rank listings by interest fit, keep a manageable candidate pool per kind. */
function pool(destination: string, kind: Listing["kind"], interests: string[], limit = 7) {
  return allListings
    .filter((l) => l.destination === destination && l.kind === kind)
    .sort(
      (a, b) =>
        interestScore(b, interests) - interestScore(a, interests) || b.rating - a.rating,
    )
    .slice(0, limit);
}

/** Exhaustive-ish search for the combination that gets closest to (but not over) budget. */
export function buildPlan(input: PlanInput): PlanOutput {
  const { destination, nights, travellers, budget, interests } = input;

  const stays = pool(destination, "stay", interests);
  const tours = pool(destination, "tour", interests);
  const restaurants = pool(destination, "restaurant", interests);

  const stayOptions: Listing[][] = stays.length ? stays.map((s) => [s]) : [[]];
  const tourOptions = tours.length ? combos(tours, 1, Math.min(3, tours.length)) : [[]];
  const foodOptions = restaurants.length
    ? combos(restaurants, 1, Math.min(3, restaurants.length))
    : [[]];

  let best: PlanResult | null = null;
  let cheapest: PlanResult | null = null;

  for (const s of stayOptions) {
    for (const t of tourOptions) {
      for (const f of foodOptions) {
        const items = [...s, ...t, ...f];
        if (!items.length) continue;
        const total = items.reduce((sum, l) => sum + lineCost(l, nights, travellers), 0);
        const candidate: PlanResult = {
          items,
          total,
          fits: total <= budget,
          utilisation: budget > 0 ? total / budget : 0,
        };

        if (!cheapest || total < cheapest.total) cheapest = candidate;

        if (candidate.fits) {
          const score =
            candidate.utilisation * 100 +
            items.reduce((s2, l) => s2 + interestScore(l, interests), 0) * 6 +
            items.reduce((s2, l) => s2 + l.rating, 0) * 0.4;
          const bestScore = best
            ? best.utilisation * 100 +
              best.items.reduce((s2, l) => s2 + interestScore(l, interests), 0) * 6 +
              best.items.reduce((s2, l) => s2 + l.rating, 0) * 0.4
            : -Infinity;
          if (score > bestScore) best = candidate;
        }
      }
    }
  }

  const suggestions: PlanSuggestion[] = best ? [] : buildSuggestions(input, cheapest);

  return { best, suggestions, cheapestTotal: cheapest?.total ?? null };
}

function minimalPlan(input: PlanInput): PlanResult | null {
  const kinds: Listing["kind"][] = ["stay", "tour", "restaurant"];
  const items: Listing[] = [];
  for (const k of kinds) {
    const cheap = allListings
      .filter((l) => l.destination === input.destination && l.kind === k)
      .sort(
        (a, b) =>
          lineCost(a, input.nights, input.travellers) -
          lineCost(b, input.nights, input.travellers),
      )[0];
    if (cheap) items.push(cheap);
  }
  if (!items.length) return null;
  const total = items.reduce((s, l) => s + lineCost(l, input.nights, input.travellers), 0);
  return { items, total, fits: total <= input.budget, utilisation: total / input.budget };
}

/** When nothing fits, propose the nearest achievable variations. */
function buildSuggestions(input: PlanInput, cheapest: PlanResult | null): PlanSuggestion[] {
  const out: PlanSuggestion[] = [];

  // 1. Fewer nights in the same destination
  for (let n = input.nights - 1; n >= 1; n--) {
    const p = buildBestOnly({ ...input, nights: n });
    if (p) {
      out.push({
        label: `Stay ${n} night${n > 1 ? "s" : ""} instead of ${input.nights}`,
        detail: `Same destination and interests, trimmed by ${input.nights - n} night${
          input.nights - n > 1 ? "s" : ""
        }.`,
        total: p.total,
        patch: { nights: n },
        items: p.items,
      });
      break;
    }
  }

  // 2. Fewer travellers
  for (let t = input.travellers - 1; t >= 1; t--) {
    const p = buildBestOnly({ ...input, travellers: t });
    if (p) {
      out.push({
        label: `Travel with ${t} instead of ${input.travellers}`,
        detail: "Per-person tours and dining scale down with group size.",
        total: p.total,
        patch: { travellers: t },
        items: p.items,
      });
      break;
    }
  }

  // 3. Other Palawan destinations that fit the same budget
  const others = Array.from(new Set(allListings.map((l) => l.destination))).filter(
    (d) => d !== input.destination,
  );
  const alt = others
    .map((d) => ({ d, plan: buildBestOnly({ ...input, destination: d }) }))
    .filter((x) => x.plan)
    .sort((a, b) => b.plan!.utilisation - a.plan!.utilisation)[0];
  if (alt) {
    out.push({
      label: `Go to ${alt.d} instead`,
      detail: `Fits your ${input.nights}-night, ${input.travellers}-traveller budget with the same interests.`,
      total: alt.plan!.total,
      patch: { destination: alt.d },
      items: alt.plan!.items,
    });
  }

  // 4. Lowest-cost plan in the chosen destination (budget stretch)
  const minimal = minimalPlan(input);
  if (minimal && !minimal.fits) {
    out.push({
      label: `Raise budget to ${Math.ceil(minimal.total / 500) * 500}`,
      detail: "Cheapest possible stay, tour and restaurant for this destination and dates.",
      total: minimal.total,
      patch: { budget: Math.ceil(minimal.total / 500) * 500 },
      items: minimal.items,
    });
  } else if (cheapest && !cheapest.fits) {
    out.push({
      label: `Raise budget to ${Math.ceil(cheapest.total / 500) * 500}`,
      detail: "Closest achievable itinerary for these exact settings.",
      total: cheapest.total,
      patch: { budget: Math.ceil(cheapest.total / 500) * 500 },
      items: cheapest.items,
    });
  }

  return out.slice(0, 4);
}

function buildBestOnly(input: PlanInput): PlanResult | null {
  const stays = pool(input.destination, "stay", input.interests, 5);
  const tours = pool(input.destination, "tour", input.interests, 5);
  const restaurants = pool(input.destination, "restaurant", input.interests, 5);
  let best: PlanResult | null = null;
  const stayOpts = stays.length ? stays.map((s) => [s]) : [[]];
  const tourOpts = tours.length ? tours.map((t) => [t]) : [[]];
  const foodOpts = restaurants.length ? restaurants.map((r) => [r]) : [[]];
  for (const s of stayOpts)
    for (const t of tourOpts)
      for (const f of foodOpts) {
        const items = [...s, ...t, ...f];
        if (!items.length) continue;
        const total = items.reduce((x, l) => x + lineCost(l, input.nights, input.travellers), 0);
        if (total > input.budget) continue;
        const cand: PlanResult = { items, total, fits: true, utilisation: total / input.budget };
        if (!best || cand.total > best.total) best = cand;
      }
  return best;
}
