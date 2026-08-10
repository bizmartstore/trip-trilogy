import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  addTestimonialRecord,
  createBookingRecord,
  createListingRecord,
  deleteListingRecord,
  deleteTestimonialRecord,
  getRevision,
  getSettings,
  getBookingFeed,
  getSnapshot,
  inviteAdmin,
  listAdminInvites,
  registerAccount,
  removeAdminInvite,
  setBookingStatus,
  signInAccount,
  updateListingRecord,
  updateNotifyPreferences,
  updateSettings,
  upsertOAuthAccount,
} from "@/lib/store.server";
import type { ListingInput, SearchFilters } from "@/lib/types";

const emailSchema = z.string().trim().email().max(160);
const passwordSchema = z.string().min(8).max(72);

const listingInputSchema = z.object({
  kind: z.enum(["tour", "stay", "restaurant"]),
  title: z.string().trim().min(2).max(120),
  tagline: z.string().trim().min(2).max(180),
  description: z.string().trim().min(10).max(8000),
  destination: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80),
  category: z.string().trim().min(2).max(80),
  price: z.number().min(0),
  unit: z.string().trim().min(1).max(40),
  images: z.array(z.string().min(1)).min(1).max(8),
  amenities: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  businessName: z.string().trim().min(1).max(120),
  featured: z.boolean().optional(),
  status: z.enum(["pending", "approved", "suspended", "rejected"]).optional(),
  durationDays: z.number().optional(),
  seatsLeft: z.number().optional(),
  discountPct: z.number().optional(),
  inclusions: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  cancellationPolicy: z.string().optional(),
});

export const fetchRevisionFn = createServerFn({ method: "GET" }).handler(async () => {
  return { revision: await getRevision() };
});

export const fetchHubSnapshotFn = createServerFn({ method: "GET" }).handler(async () => {
  const state = await getSnapshot();
  return {
    revision: state.revision,
    listings: state.listings,
    bookings: state.bookings,
    destinations: state.destinations,
    testimonials: state.testimonials,
    adminInvites: state.adminInvites,
    settings: state.settings,
  };
});

export const registerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        email: emailSchema,
        password: passwordSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => registerAccount(data));

export const signInFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        email: emailSchema,
        password: passwordSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => signInAccount(data));

export const oauthSignInFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
        email: emailSchema,
        picture: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    upsertOAuthAccount({
      name: data.name,
      email: data.email,
      picture: data.picture || undefined,
    }),
  );

export const inviteAdminFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        inviteEmail: emailSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => inviteAdmin(data.actorEmail, data.inviteEmail));

export const removeAdminInviteFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        inviteEmail: emailSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => removeAdminInvite(data.actorEmail, data.inviteEmail));

export const listAdminsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ actorEmail: emailSchema }).parse(data))
  .handler(async ({ data }) => listAdminInvites(data.actorEmail));

export const createBookingFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        listingId: z.string().min(1),
        guests: z.number().int().min(1).max(40),
        date: z.string().min(1),
        total: z.number().min(0),
        customer: z.string().trim().min(2).max(80),
        customerEmail: z.string().email().optional(),
        customerPhone: z.string().trim().max(40).optional(),
        notifyPreference: z.enum(["call", "sms", "email", "any"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => createBookingRecord(data));

export const updateBookingStatusFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().min(1),
        status: z.enum([
          "pending",
          "approved",
          "confirmed",
          "completed",
          "cancelled",
          "rejected",
        ]),
        note: z.string().trim().max(500).optional(),
        actorEmail: emailSchema.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    setBookingStatus(data.id, data.status, { note: data.note, actorEmail: data.actorEmail }),
  );

export const bookingFeedFn = createServerFn({ method: "GET" }).handler(async () =>
  getBookingFeed(25),
);

export const updateNotifyPrefsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        email: emailSchema,
        notifyPreference: z.enum(["call", "sms", "email", "any"]),
        contactNumber: z.string().trim().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => updateNotifyPreferences(data));

export const createListingFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        listing: listingInputSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => createListingRecord(data.actorEmail, data.listing as ListingInput));

export const updateListingFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        id: z.string().min(1),
        patch: listingInputSchema.partial(),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    updateListingRecord(data.actorEmail, data.id, data.patch as Partial<ListingInput>),
  );

export const deleteListingFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        id: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => deleteListingRecord(data.actorEmail, data.id));

export const addTestimonialFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        author: z.string().trim().min(2).max(80),
        email: emailSchema,
        role: z.string().trim().max(80).optional(),
        body: z.string().trim().min(20).max(600),
        rating: z.number().min(1).max(5),
      })
      .parse(data),
  )
  .handler(async ({ data }) => addTestimonialRecord(data));

export const deleteTestimonialFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        id: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => deleteTestimonialRecord(data.actorEmail, data.id));

export const searchListingsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        q: z.string().optional(),
        kind: z.enum(["tour", "stay", "restaurant", "all"]).optional(),
        destination: z.string().optional(),
        minPrice: z.number().optional(),
        maxPrice: z.number().optional(),
        minRating: z.number().optional(),
        tags: z.array(z.string()).optional(),
        sort: z.enum(["popular", "price-asc", "price-desc", "rating"]).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }) => {
    const state = await getSnapshot();
    const filters: SearchFilters = {
      q: data.q ?? "",
      kind: data.kind ?? "all",
      destination: data.destination ?? "all",
      minPrice: data.minPrice ?? 0,
      maxPrice: data.maxPrice ?? 50000,
      minRating: data.minRating ?? 0,
      tags: data.tags ?? [],
      sort: data.sort ?? "popular",
    };
    const q = filters.q.trim().toLowerCase();
    const result = state.listings.filter((l) => {
      if (l.status !== "approved") return false;
      if (filters.kind !== "all" && l.kind !== filters.kind) return false;
      if (filters.destination !== "all" && l.destination !== filters.destination) return false;
      if (l.price < filters.minPrice || l.price > filters.maxPrice) return false;
      if (l.rating < filters.minRating) return false;
      if (filters.tags.length && !filters.tags.every((t) => l.tags.includes(t))) return false;
      if (q) {
        const haystack = [
          l.title,
          l.tagline,
          l.description,
          l.destination,
          l.country,
          l.category,
          l.businessName,
          ...l.tags,
          ...l.amenities,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    switch (filters.sort) {
      case "price-asc":
        return result.sort((a, b) => a.price - b.price);
      case "price-desc":
        return result.sort((a, b) => b.price - a.price);
      case "rating":
        return result.sort((a, b) => b.rating - a.rating);
      default:
        return result.sort((a, b) => b.reviewCount - a.reviewCount);
    }
  });

export const fetchSettingsFn = createServerFn({ method: "GET" }).handler(async () => getSettings());

export const updateSettingsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        patch: z
          .object({
            contactPhone: z.string().trim().max(40).optional(),
            contactMobile: z.string().trim().max(40).optional(),
            contactEmail: z.string().trim().max(160).optional(),
            officeHours: z.string().trim().max(120).optional(),
            bookingNotice: z.string().trim().max(400).optional(),
          })
          .partial(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => updateSettings(data.actorEmail, data.patch));

/** Keep-alive: tiny Supabase read that stops the database from idling out. */
export const keepAliveFn = createServerFn({ method: "GET" }).handler(async () => {
  const { pingSupabase, supabaseConfigured } = await import("@/lib/supabase-rest.server");
  if (!supabaseConfigured()) return { ok: false as const, reason: "not-configured" };
  try {
    return await pingSupabase();
  } catch {
    return { ok: false as const, reason: "unreachable" };
  }
});
