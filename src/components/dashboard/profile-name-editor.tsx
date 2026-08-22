import { useMutation } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { applyAuthUser, type AuthUser } from "@/hooks/use-auth";
import { updateAccountProfile } from "@/lib/api";

export function ProfileNameEditor({ user }: { user: AuthUser }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);

  const save = useMutation({
    mutationFn: () => updateAccountProfile(user.email, name),
    onSuccess: (account) => {
      applyAuthUser({
        name: account.name,
        email: account.email,
        picture: account.picture,
        role: account.role,
      });
      setName(account.name);
      setEditing(false);
      toast.success("Name updated");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update your name"),
  });

  if (!editing) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-soft">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Display name
          </p>
          <p className="mt-1 truncate font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => {
            setName(user.name);
            setEditing(true);
          }}
        >
          <Pencil className="size-3.5" /> Edit name
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="space-y-1.5">
        <Label htmlFor="profile-name">Full name</Label>
        <Input
          id="profile-name"
          className="h-11 rounded-xl uppercase"
          autoCapitalize="characters"
          value={name}
          onChange={(e) => setName(e.target.value.toLocaleUpperCase("en-US"))}
          placeholder="YOUR NAME"
        />
        <p className="text-xs text-muted-foreground">
          Correct how your name appears on bookings and your dashboard.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="hero"
          className="rounded-full"
          disabled={save.isPending || name.trim().length < 2}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save name"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={save.isPending}
          onClick={() => {
            setName(user.name);
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
