import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Phone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { fetchSettings, updateSettings } from "@/lib/api";
import type { HubSettings } from "@/lib/types";

const empty: HubSettings = {
  contactAddress: "",
  contactPhone: "",
  contactMobile: "",
  contactEmail: "",
  officeHours: "",
  bookingNotice: "",
  socialInstagram: "",
  socialTwitter: "",
  socialFacebook: "",
};

export function ContactSettings({ actorEmail }: { actorEmail: string }) {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["hub-settings"], queryFn: fetchSettings });
  const [form, setForm] = useState<HubSettings>(empty);

  useEffect(() => {
    if (settings.data) setForm(settings.data);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => updateSettings(actorEmail, form),
    onSuccess: () => {
      toast.success("Contact details updated — travellers see them instantly");
      void qc.invalidateQueries({ queryKey: ["hub-settings"] });
    },
    onError: () => toast.error("Could not save. Admins only."),
  });

  if (settings.isLoading) return <Skeleton className="h-64 w-full rounded-3xl" />;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        <Phone className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          These details appear on every booking confirmation and in the traveller dashboard, so
          guests know exactly who to call or text for follow-ups.
        </p>
      </div>

      <Field label="Office address">
        <div className="relative">
          <MapPin className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-10"
            value={form.contactAddress}
            onChange={(e) => setForm({ ...form, contactAddress: e.target.value })}
            placeholder="Palawan, Philippines"
          />
        </div>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hotline (calls)">
          <Input
            className="h-11 rounded-xl"
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            placeholder="+63 917 000 0000"
          />
        </Field>
        <Field label="Mobile (SMS / Viber / WhatsApp)">
          <Input
            className="h-11 rounded-xl"
            value={form.contactMobile}
            onChange={(e) => setForm({ ...form, contactMobile: e.target.value })}
            placeholder="+63 917 000 0000"
          />
        </Field>
        <Field label="Support email">
          <Input
            className="h-11 rounded-xl"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            placeholder="hello@nexora.ph"
          />
        </Field>
        <Field label="Office hours">
          <Input
            className="h-11 rounded-xl"
            value={form.officeHours}
            onChange={(e) => setForm({ ...form, officeHours: e.target.value })}
            placeholder="Daily · 7:00 AM – 9:00 PM (PHT)"
          />
        </Field>
      </div>

      <Field label="Booking confirmation note">
        <Textarea
          className="min-h-24 rounded-xl"
          value={form.bookingNotice}
          onChange={(e) => setForm({ ...form, bookingNotice: e.target.value })}
          placeholder="Our team will call or text you once your reservation is approved."
        />
      </Field>

      <div className="rounded-2xl border border-border bg-secondary/30 p-5">
        <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Social media links
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Leave blank to hide an icon in the footer. Enter the full URL (https://…).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Instagram">
            <Input
              className="h-11 rounded-xl"
              value={form.socialInstagram ?? ""}
              onChange={(e) => setForm({ ...form, socialInstagram: e.target.value })}
              placeholder="https://instagram.com/nexora"
            />
          </Field>
          <Field label="X (Twitter)">
            <Input
              className="h-11 rounded-xl"
              value={form.socialTwitter ?? ""}
              onChange={(e) => setForm({ ...form, socialTwitter: e.target.value })}
              placeholder="https://x.com/nexora"
            />
          </Field>
          <Field label="Facebook">
            <Input
              className="h-11 rounded-xl"
              value={form.socialFacebook ?? ""}
              onChange={(e) => setForm({ ...form, socialFacebook: e.target.value })}
              placeholder="https://facebook.com/nexora"
            />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-secondary/30 p-5">
        <h3 className="font-display text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          NEXI chat assistant
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Free AI questions each visitor gets per day. Quick FAQ answers are always free and
          unlimited. Set 0 to use the default (10).
        </p>
        <div className="mt-4 sm:max-w-48">
          <Field label="Daily AI message limit">
            <Input
              className="h-11 rounded-xl"
              type="number"
              min={0}
              max={200}
              value={form.chatDailyLimit ?? 0}
              onChange={(e) =>
                setForm({ ...form, chatDailyLimit: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </Field>
        </div>
      </div>

      <Button
        variant="hero"
        className="rounded-full"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Save contact details
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
