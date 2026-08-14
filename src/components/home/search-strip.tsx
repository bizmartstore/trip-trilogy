import { Search } from "lucide-react";
import { useState } from "react";

import { SearchBar } from "@/components/search/search-bar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Replaces the old hardcoded stats strip — search is the primary action here. */
export function SearchStrip() {
  const [open, setOpen] = useState(false);

  return (
    <section className="container-x">
      <div className="rounded-[2rem] border border-border bg-card px-4 py-5 shadow-soft sm:px-6 sm:py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Find your next stop
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Search tours, stays and dining across Palawan.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="rounded-full sm:hidden">
                <Search className="size-4" />
                Open search
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-3xl sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="font-display">Search Nexora</DialogTitle>
                <DialogDescription>
                  Filter by destination and category, then jump into results.
                </DialogDescription>
              </DialogHeader>
              <SearchBar compact />
            </DialogContent>
          </Dialog>
        </div>
        <div className="hidden sm:block">
          <SearchBar compact />
        </div>
      </div>
    </section>
  );
}
