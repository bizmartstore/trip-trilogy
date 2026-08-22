import { useMutation } from "@tanstack/react-query";
import { Bell, Loader2, Megaphone, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { broadcastNotification, testAdminPush } from "@/lib/api";
import {
  getPushSubscriptionSnapshot,
  resetPushSubscribePrompt,
} from "@/lib/onesignal-web";

export function NotificationBroadcast({ actorEmail }: { actorEmail: string }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("/dashboard");
  const [targetEmail, setTargetEmail] = useState("");

  const send = useMutation({
    mutationFn: () =>
      broadcastNotification(actorEmail, {
        title,
        body,
        link: link.trim() || "/dashboard",
        targetEmail: targetEmail.trim() || undefined,
      }),
    onSuccess: (result) => {
      const pushPart =
        typeof result.pushRecipients === "number"
          ? ` · ${result.pushRecipients} push device${result.pushRecipients === 1 ? "" : "s"}`
          : "";
      const mode =
        result.pushMode === "single"
          ? " (single email)"
          : " (all subscribed tourists)";
      toast.success(
        `Inbox: ${result.sent} traveller${result.sent === 1 ? "" : "s"}${pushPart}${mode}`,
      );
      setTitle("");
      setBody("");
      setTargetEmail("");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not send message"),
  });

  const testPush = useMutation({
    mutationFn: () => testAdminPush(actorEmail),
    onSuccess: (result) => {
      try {
        if (result.recipients > 0) {
          toast.success("Test push sent — check this device.");
          return;
        }
        const snap = getPushSubscriptionSnapshot();
        const detail =
          typeof result.error === "string" && result.error.trim()
            ? result.error.trim().slice(0, 180)
            : "No subscribed Web Push device for this External ID.";
        toast.error(
          `${detail} (optedIn=${snap.optedIn ? "yes" : "no"}, sub=${snap.subscriptionId ? "yes" : "no"})`,
          { duration: 8000 },
        );
      } catch (err) {
        console.warn("[push] test result UI failed", err);
        toast.error("Test push returned 0 devices. Use Re-subscribe, then try again.");
      }
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message.slice(0, 180) : "Test push failed";
      toast.error(message);
    },
  });

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          Promotional offers go to <strong>subscribed tourists</strong> (tag{" "}
          <code className="text-xs">role=tourist</code>) on PWA and desktop. Leave recipient blank for
          everyone; enter one email to push only that traveller. Booking approve/reject pushes are
          automatic and never block the Bookings tab.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-4">
        <Bell className="size-4 text-primary" />
        <p className="flex-1 text-sm text-muted-foreground">
          Admin devices need Channels = <strong>Subscribed</strong> (Web Push). Use Re-subscribe if a
          test returns 0.
        </p>
        <Button
          type="button"
          variant="ghost"
          className="rounded-full"
          onClick={() => {
            resetPushSubscribePrompt(actorEmail);
            toast.message("Subscribe banner will appear — tap Subscribe, then Allow.");
          }}
        >
          <RefreshCw className="size-4" />
          Re-subscribe
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={testPush.isPending}
          onClick={() => testPush.mutate()}
        >
          {testPush.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          Send test push to me
        </Button>
      </div>

      <Field label="Title">
        <Input
          className="h-11 rounded-xl"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Promotional offer"
        />
      </Field>

      <Field label="Message">
        <Textarea
          className="min-h-28 rounded-xl"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="20% off island hopping this week only."
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Link (optional)">
          <Input
            className="h-11 rounded-xl"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/dashboard"
          />
        </Field>
        <Field label="Single recipient email (optional)">
          <Input
            type="email"
            className="h-11 rounded-xl"
            value={targetEmail}
            onChange={(e) => setTargetEmail(e.target.value)}
            placeholder="Blank = all subscribed tourists"
          />
        </Field>
      </div>

      <Button
        variant="hero"
        className="rounded-full"
        disabled={send.isPending || title.trim().length < 2 || body.trim().length < 4}
        onClick={() => send.mutate()}
      >
        {send.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {targetEmail.trim() ? "Send to this email" : "Send to all tourists"}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
