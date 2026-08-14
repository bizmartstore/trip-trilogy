import { useMutation } from "@tanstack/react-query";
import { Loader2, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitListingReview } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function ReviewForm({
  listingId,
  existingReview,
  onSubmitted,
}: {
  listingId: string;
  existingReview?: boolean;
  onSubmitted?: () => void;
}) {
  const { user } = useAuth();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [hover, setHover] = useState(0);

  const submit = useMutation({
    mutationFn: () =>
      submitListingReview({
        email: user!.email,
        name: user!.name,
        listingId,
        rating,
        body,
      }),
    onSuccess: () => {
      toast.success("Thanks for your rating!");
      setBody("");
      onSubmitted?.();
    },
    onError: (err) =>
      toast.error(err instanceof Error ? err.message : "Could not submit rating"),
  });

  if (!user) {
    return (
      <p className="rounded-2xl border border-dashed border-border bg-secondary/40 p-5 text-sm text-muted-foreground">
        Sign in to rate this listing and share your experience with other travellers.
      </p>
    );
  }

  if (existingReview) {
    return (
      <p className="rounded-2xl border border-border bg-secondary/40 p-5 text-sm text-muted-foreground">
        You already rated this listing. Thank you for your feedback.
      </p>
    );
  }

  return (
    <form
      className="rounded-3xl border border-border bg-card p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim().length < 10) {
          toast.error("Please write at least 10 characters");
          return;
        }
        submit.mutate();
      }}
    >
      <h3 className="font-display text-lg font-semibold">Rate your experience</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Share an honest review to help other travellers decide.
      </p>

      <div className="mt-5 space-y-2">
        <Label>Your rating</Label>
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => {
            const value = i + 1;
            return (
              <button
                key={value}
                type="button"
                aria-label={`Rate ${value} stars`}
                className="rounded p-0.5 transition-transform hover:scale-110"
                onMouseEnter={() => setHover(value)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(value)}
              >
                <Star
                  className={cn(
                    "size-7",
                    (hover || rating) >= value
                      ? "fill-gold text-gold"
                      : "text-muted-foreground/40",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        <Label htmlFor="review-body">Your review</Label>
        <Textarea
          id="review-body"
          className="min-h-24 rounded-xl"
          placeholder="What stood out about this experience?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={800}
        />
      </div>

      <Button
        type="submit"
        variant="hero"
        className="mt-5 rounded-full"
        disabled={submit.isPending}
      >
        {submit.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        Submit rating
      </Button>
    </form>
  );
}
