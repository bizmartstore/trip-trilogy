import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fetchSettings, updateSettings } from "@/lib/api";
import type { HubSettings } from "@/lib/types";

const empty: Pick<
  HubSettings,
  | "policyTerms"
  | "policyPrivacy"
  | "policyCancellation"
  | "policyHelp"
  | "cancellationNotice"
> = {
  policyTerms: "",
  policyPrivacy: "",
  policyCancellation: "",
  policyHelp: "",
  cancellationNotice: "",
};

/**
 * Admin editors for the public legal / help pages. Content is plain text with
 * light structure: blank lines start a new block, a line beginning with "## "
 * becomes a section heading, and lines beginning with "- " render as bullets.
 * Saved through the same persistent settings pipeline as contact details.
 */
export function PolicyContentSettings({ actorEmail }: { actorEmail: string }) {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["hub-settings"], queryFn: fetchSettings });
  const [form, setForm] = useState(empty);

  useEffect(() => {
    if (settings.data) {
      setForm({
        policyTerms: settings.data.policyTerms ?? "",
        policyPrivacy: settings.data.policyPrivacy ?? "",
        policyCancellation: settings.data.policyCancellation ?? "",
        policyHelp: settings.data.policyHelp ?? "",
        cancellationNotice: settings.data.cancellationNotice ?? "",
      });
    }
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => updateSettings(actorEmail, form),
    onSuccess: () => {
      toast.success("Policies saved — public pages and reservations updated");
      void qc.invalidateQueries({ queryKey: ["hub-settings"] });
    },
    onError: () => toast.error("Could not save. Admins only."),
  });

  if (settings.isLoading) return <Skeleton className="h-64 w-full rounded-3xl" />;

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          These pages are linked in the site footer. Leave a page blank to keep the built-in
          default content. Formatting tips: start a line with{" "}
          <code className="rounded bg-muted px-1">##</code> for a section title, start lines with{" "}
          <code className="rounded bg-muted px-1">-</code> for bullet points, and use blank lines
          between blocks.
        </p>
      </div>

      <PolicyField
        label="Cancellation & refund notice at reservation"
        hint="Short text shown in the booking sidebar, booking dialog, and listing FAQ. Falls back to each listing's own cancellation line when left blank."
      >
        <Input
          className="h-11 rounded-xl"
          value={form.cancellationNotice}
          onChange={(e) => setForm({ ...form, cancellationNotice: e.target.value })}
          placeholder="Free cancellation up to 48 hours before departure."
        />
      </PolicyField>

      <PolicyField
        label="Terms of service page"
        hint="Shown at /terms-of-service"
        href="/terms-of-service"
      >
        <Textarea
          className="min-h-48 rounded-xl font-mono text-xs"
          value={form.policyTerms}
          onChange={(e) => setForm({ ...form, policyTerms: e.target.value })}
          placeholder={"## Marketplace role\nNexora helps travellers discover…"}
        />
      </PolicyField>

      <PolicyField
        label="Privacy policy page"
        hint="Shown at /privacy-policy"
        href="/privacy-policy"
      >
        <Textarea
          className="min-h-48 rounded-xl font-mono text-xs"
          value={form.policyPrivacy}
          onChange={(e) => setForm({ ...form, policyPrivacy: e.target.value })}
          placeholder={"## Information we collect\nWe may collect…"}
        />
      </PolicyField>

      <PolicyField
        label="Cancellation & refund policy page"
        hint="Shown at /cancellation-policy — the full refund rules travellers can open before booking"
        href="/cancellation-policy"
      >
        <Textarea
          className="min-h-48 rounded-xl font-mono text-xs"
          value={form.policyCancellation}
          onChange={(e) => setForm({ ...form, policyCancellation: e.target.value })}
          placeholder={"## Before approval\nYou may request cancellation while pending…\n\n## Refund timing\nApproved refunds are returned…"}
        />
      </PolicyField>

      <PolicyField label="Help centre page" hint="Shown at /help-centre" href="/help-centre">
        <Textarea
          className="min-h-48 rounded-xl font-mono text-xs"
          value={form.policyHelp}
          onChange={(e) => setForm({ ...form, policyHelp: e.target.value })}
          placeholder={"## Reservations\nPending means awaiting review…"}
        />
      </PolicyField>

      <Button variant="hero" className="rounded-full" disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Save policies
      </Button>
    </div>
  );
}

function PolicyField({
  label,
  hint,
  href,
  children,
}: {
  label: string;
  hint?: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>{label}</Label>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View live page <ExternalLink className="size-3" />
          </a>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
