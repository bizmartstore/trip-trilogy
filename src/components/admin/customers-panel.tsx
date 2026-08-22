import { useMemo, useState } from "react";
import { Loader2, Search, Trash2, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type CustomerRow = {
  name: string;
  email: string;
  picture?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "N";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function CustomersPanel({
  customers,
  loading,
  isMainAdmin,
  removingEmail,
  onRemove,
}: {
  customers: CustomerRow[];
  loading?: boolean;
  isMainAdmin?: boolean;
  removingEmail?: string | null;
  onRemove?: (customer: CustomerRow) => void;
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [customers, query]);

  const applySearch = () => setQuery(draft);
  const showRemove = Boolean(isMainAdmin && onRemove);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          applySearch();
        }}
      >
        <Input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search by full name or email"
          className="h-11 rounded-xl"
          aria-label="Search customers"
        />
        <Button type="submit" variant="hero" className="rounded-full">
          <Search className="size-4" /> Search
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        {loading
          ? "Loading customers…"
          : `${filtered.length} of ${customers.length} registered customer${
              customers.length === 1 ? "" : "s"
            }`}
        {isMainAdmin ? " · Only the main admin can remove accounts." : " · Removal is reserved for the main admin."}
      </p>

      <div className="max-h-[min(560px,60vh)] overflow-y-auto overscroll-contain rounded-2xl border border-border [scrollbar-gutter:stable]">
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow>
                <TableHead>Full name</TableHead>
                <TableHead>Email address</TableHead>
                {showRemove ? <TableHead className="text-right">Remove</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length ? (
                filtered.map((c) => {
                  const busy = removingEmail === c.email;
                  return (
                    <TableRow key={c.email}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar className="size-9 border border-border">
                            {c.picture ? <AvatarImage src={c.picture} alt="" /> : null}
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                              {initials(c.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate font-medium">{c.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.email}</TableCell>
                      {showRemove ? (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="rounded-full text-destructive"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  `Remove ${c.name} (${c.email})? They will no longer be able to sign in.`,
                                )
                              ) {
                                onRemove?.(c);
                              }
                            }}
                          >
                            {busy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                            Remove
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={showRemove ? 3 : 2}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    {customers.length ? (
                      "No customers match that search."
                    ) : (
                      <span className="inline-flex flex-col items-center gap-2">
                        <Users className="size-5 text-muted-foreground/70" />
                        No registered customers yet.
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
