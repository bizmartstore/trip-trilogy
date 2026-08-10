import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, MessageSquare, Phone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchSettings, updateNotifyPreferences } from "@/lib/api";
import type { NotifyPreference } from "@/lib/types";

export function NotificationPreferences({ email }: { email: string }) {
  const [preference, setPreference] = useState<NotifyPreference>("call");
  const [number, setNumber] = useState("");
  const settings = useQuery({ queryKey: ["hub-settings"], queryFn: fetchSettings });

  const save = useMutation({
    mutationFn: () =>
      updateNotifyPreferences({ email, notifyPreference: preference, contactNumber: number }),
    onSuccess: () => toast.success("Notification preferences saved"),
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not save your preferences"),
  });

  const tel = settings.data?.contactPhone?.replace(/[^+\d]/g, "") ?? "";
  const sms = settings.data?.contactMobile?.replace(/[^+\d]/g, "") ?? "";

  return (
    <div className="rounded-3xl border border-border bg-card p-6 shadow-soft">
      <p className="font-display text-lg font-semibold">Notification preferences</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Email delivery isn't always available — choose how our team should reach you about booking
        approvals.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Preferred channel</Label>
          <Select value={preference} onValueChange={(v) => setPreference(v as NotifyPreference)}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="call">Phone call</SelectItem>
              <SelectItem value="sms">Text / SMS message</SelectItem>
              <SelectItem value="email">Email when available</SelectItem>
              <SelectItem value="any">Any channel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="notify-number">Contact number</Label>
          <Input
            id="notify-number"
            placeholder="+63 917 000 0000"
            className="h-11 rounded-xl"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
      </div>

      <Button
        variant="hero"
        className="mt-4 rounded-full"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save preferences"}
      </Button>

      <Separator className="my-5" />

      <p className="text-sm font-semibold">Reach the admin team directly</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {settings.data?.officeHours ?? "Daily · 7:00 AM – 9:00 PM (PHT)"}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        {tel ? (
          <Button asChild variant="outline" className="flex-1 rounded-full">
            <a href={`tel:${tel}`}>
              <Phone className="size-4" /> Call {settings.data?.contactPhone}
            </a>
          </Button>
        ) : null}
        {sms ? (
          <Button asChild variant="outline" className="flex-1 rounded-full">
            <a href={`sms:${sms}`}>
              <MessageSquare className="size-4" /> Text admin
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
