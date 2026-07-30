import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ListingCard, ListingCardSkeleton } from "@/components/listings/listing-card";
import { SearchBar } from "@/components/search/search-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { defaultFilters, destinationOptions, searchListings, tagOptions } from "@/lib/api";
import type { ListingKind, SearchFilters } from "@/lib/types";
import { peso } from "@/lib/utils";

type ExploreSearch = {
  q?: string;
  kind?: ListingKind | "all";
  destination?: string;
};

export const Route = createFileRoute("/explore")({
  validateSearch: (search: Record<string, unknown>): ExploreSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    kind: ["all", "tour", "stay", "restaurant"].includes(String(search.kind))
      ? (search.kind as ListingKind | "all")
      : undefined,
    destination: typeof search.destination === "string" ? search.destination : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Explore Tours, Stays & Restaurants | ExploreHub" },
      {
        name: "description",
        content:
          "Search thousands of verified tour packages, hotels, resorts and restaurants. Filter by price, rating, amenities, destination and travel style.",
      },
      { property: "og:title", content: "Explore Tours, Stays & Restaurants | ExploreHub" },
      {
        property: "og:description",
        content: "Search verified tours, stays and restaurants with advanced filters.",
      },
    ],
  }),
  component: Explore,
});

function Explore() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/explore" });

  const [priceRange, setPriceRange] = useState<[number, number]>([0, 50000]);
  const [minRating, setMinRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SearchFilters["sort"]>("popular");

  const filters: SearchFilters = useMemo(
    () => ({
      ...defaultFilters,
      q: search.q ?? "",
      kind: search.kind ?? "all",
      destination: search.destination ?? "all",
      minPrice: priceRange[0],
      maxPrice: priceRange[1],
      minRating,
      tags,
      sort,
    }),
    [search.q, search.kind, search.destination, priceRange, minRating, tags, sort],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["search", filters],
    queryFn: () => searchListings(filters),
  });

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const reset = () => {
    setPriceRange([0, 50000]);
    setMinRating(0);
    setTags([]);
    setSort("popular");
    navigate({ search: { kind: "all" } });
  };

  const activeCount =
    tags.length + (minRating > 0 ? 1 : 0) + (priceRange[0] > 0 || priceRange[1] < 50000 ? 1 : 0);

  const FilterPanel = (
    <div className="space-y-8">
      <div>
        <Label className="text-sm font-semibold">Destination</Label>
        <Select
          value={search.destination ?? "all"}
          onValueChange={(v) => navigate({ search: (p: ExploreSearch) => ({ ...p, destination: v }) })}
        >
          <SelectTrigger className="mt-3 h-11 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-2xl">
            <SelectItem value="all">Anywhere</SelectItem>
            {destinationOptions().map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Price range</Label>
          <span className="text-sm text-muted-foreground">
            {peso(priceRange[0])} – {peso(priceRange[1])}
          </span>
        </div>
        <Slider
          className="mt-5"
          value={priceRange}
          min={0}
          max={50000}
          step={500}
          onValueChange={(v) => setPriceRange([v[0], v[1]] as [number, number])}
        />
      </div>

      <div>
        <Label className="text-sm font-semibold">Minimum rating</Label>
        <div className="mt-3 flex flex-wrap gap-2">
          {[0, 4, 4.5, 4.8].map((r) => (
            <Button
              key={r}
              type="button"
              size="sm"
              variant={minRating === r ? "default" : "outline"}
              className="rounded-full"
              onClick={() => setMinRating(r)}
            >
              {r === 0 ? "Any" : `${r}+`}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-sm font-semibold">Travel style</Label>
        <div className="mt-3 space-y-2.5">
          {tagOptions().map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-3 text-sm capitalize">
              <Checkbox checked={tags.includes(t)} onCheckedChange={() => toggleTag(t)} />
              {t}
            </label>
          ))}
        </div>
      </div>

      <Button variant="outline" className="w-full rounded-full" onClick={reset}>
        <X className="size-4" /> Clear all filters
      </Button>
    </div>
  );

  return (
    <div className="pt-28">
      <div className="container-x">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-semibold sm:text-4xl">Explore ExploreHub</h1>
          <p className="mt-2 text-muted-foreground">
            One search across tour packages, hotels, resorts, restaurants and destinations.
          </p>
          <div className="mt-6">
            <SearchBar compact />
          </div>
        </motion.div>

        <Tabs
          value={search.kind ?? "all"}
          onValueChange={(v) => navigate({ search: (p: ExploreSearch) => ({ ...p, kind: v as ListingKind | "all" }) })}
          className="mt-8"
        >
          <TabsList className="rounded-full">
            <TabsTrigger value="all" className="rounded-full">All</TabsTrigger>
            <TabsTrigger value="tour" className="rounded-full">Tours</TabsTrigger>
            <TabsTrigger value="stay" className="rounded-full">Stays</TabsTrigger>
            <TabsTrigger value="restaurant" className="rounded-full">Dining</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-8 grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-28 rounded-3xl border border-border bg-card p-6 shadow-soft">
              {FilterPanel}
            </div>
          </aside>

          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <p className="min-w-0 truncate text-sm text-muted-foreground">
                {isLoading ? "Searching…" : `${data?.length ?? 0} results`}
                {isFetching && !isLoading ? " · updating" : ""}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" className="rounded-full lg:hidden">
                      <SlidersHorizontal className="size-4" />
                      Filters
                      {activeCount ? (
                        <Badge className="ml-1 rounded-full">{activeCount}</Badge>
                      ) : null}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto p-6">
                    <h2 className="mb-6 mt-4 font-display text-xl font-semibold">Filters</h2>
                    {FilterPanel}
                  </SheetContent>
                </Sheet>

                <Select value={sort} onValueChange={(v) => setSort(v as SearchFilters["sort"])}>
                  <SelectTrigger className="h-9 w-40 rounded-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="popular">Most popular</SelectItem>
                    <SelectItem value="rating">Highest rated</SelectItem>
                    <SelectItem value="price-asc">Price: low to high</SelectItem>
                    <SelectItem value="price-desc">Price: high to low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <ListingCardSkeleton key={i} />)
                : data?.map((l, i) => <ListingCard key={l.id} listing={l} index={i} />)}
            </div>

            {!isLoading && data?.length === 0 ? (
              <div className="mt-16 rounded-3xl border border-dashed border-border py-20 text-center">
                <h3 className="font-display text-xl font-semibold">Nothing matches yet</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
                  Try widening your price range, lowering the rating filter or removing a travel
                  style.
                </p>
                <Button variant="outline" className="mt-6 rounded-full" onClick={reset}>
                  Clear filters
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
