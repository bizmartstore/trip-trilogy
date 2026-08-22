import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, MapPin, Search, Users } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchDestinations, namesFromDestinationCatalog } from "@/lib/api";
import type { ListingKind } from "@/lib/types";

const kinds: { value: ListingKind | "all"; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "tour", label: "Tours" },
  { value: "stay", label: "Stays" },
  { value: "restaurant", label: "Dining" },
  { value: "package", label: "Packages" },
];

export function SearchBar({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<ListingKind | "all">("all");
  const [destination, setDestination] = useState("all");
  const destinations = useQuery({ queryKey: ["destinations"], queryFn: fetchDestinations });
  const destinationNames = namesFromDestinationCatalog(destinations.data);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate({ to: "/explore", search: { q, kind, destination } });
  };

  return (
    <form
      onSubmit={submit}
      className={
        compact
          ? "flex flex-col gap-2 rounded-3xl border border-border bg-card p-3 shadow-soft sm:flex-row"
          : "glass flex flex-col gap-2 rounded-[1.75rem] p-3 shadow-lift sm:flex-row sm:items-center"
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl px-3">
        <Search className="size-4.5 shrink-0 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tours, packages, hotels, restaurants, cities…"
          aria-label="Search"
          className="h-12 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="hidden h-8 w-px bg-border sm:block" />

      <Select value={destination} onValueChange={setDestination}>
        <SelectTrigger
          aria-label="Destination"
          className="h-12 w-full gap-2 rounded-2xl border-0 bg-transparent px-3 text-base shadow-none focus:ring-0 sm:w-44"
        >
          <MapPin className="size-4.5 shrink-0 text-muted-foreground" />
          <SelectValue placeholder="Anywhere" />
        </SelectTrigger>
        <SelectContent className="rounded-2xl">
          <SelectItem value="all">Anywhere</SelectItem>
          {destinationNames.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="hidden h-8 w-px bg-border sm:block" />

      <Select value={kind} onValueChange={(v) => setKind(v as ListingKind | "all")}>
        <SelectTrigger
          aria-label="Category"
          className="h-12 w-full gap-2 rounded-2xl border-0 bg-transparent px-3 text-base shadow-none focus:ring-0 sm:w-40"
        >
          <Users className="size-4.5 shrink-0 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="rounded-2xl">
          {kinds.map((k) => (
            <SelectItem key={k.value} value={k.value}>
              {k.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button type="submit" variant="hero" size="xl" className="w-full shrink-0 sm:w-auto">
        <CalendarDays className="size-4.5" />
        Search
      </Button>
    </form>
  );
}
