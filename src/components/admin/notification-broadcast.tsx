import { useMutation } from "@tanstack/react-query";
import { Loader2, Megaphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { broadcastNotification } from "@/lib/api";

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
      toast.success(`Message sent to ${result.sent} traveller${result.sent === 1 ? "" : "s"}`);
      setTitle("");
      setBody("");
      setTargetEmail("");
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not send message"),
  });

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-dashed border-border bg-secondary/40 p-4 text-sm text-muted-foreground">
        <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          Send a promotional offer, trip reminder or announcement. Leave the recipient blank to
          message every registered traveller. Booking status updates are sent automatically.
        </p>
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
            placeholder="Leave blank for all travellers"
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
        Send notification
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
