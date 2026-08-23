import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { applyListingMapFlags } from "@/lib/listing-map";
import {
  addListingReview,
  addTestimonialRecord,
  broadcastNotification,
  createBookingRecord,
  createDestinationRecord,
  createListingRecord,
  createPackageRecord,
  deleteDestinationRecord,
  deleteListingRecord,
  deletePackageRecord,
  deleteTestimonialRecord,
  getAdminBookings,
  getBookingByReference,
  getBookingsForEmail,
  getRevision,
  getSettings,
  getBookingFeed,
  getSnapshot,
  inviteAdmin,
  listAdminInvites,
  listCustomers,
  listFavorites,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerAccount,
  reorderPackagesRecord,
  resetRevenueRecords,
  removeAdminInvite,
  removeCustomer,
  removeListingReview,
   setBookingPaymentMethod,
   setBookingStatus,
   signInAccount,
  toggleFavorite,
  updateDestinationRecord,
  updateListingRecord,
  updateNotifyPreferences,
  updateAccountProfile,
  updatePackageRecord,
  updateSettings,
  upsertOAuthAccount,
} from "@/lib/store.server";
import { verifyGoogleIdToken } from "@/lib/google-id-token.server";
import type { ListingInput, PackageInput, SearchFilters } from "@/lib/types";

const emailSchema = z.string().trim().email().max(160);
const passwordSchema = z.string().min(8).max(72);

const listingPackageSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(600).optional().default(""),
  price: z.number().min(0),
  inclusions: z.array(z.string()).default([]),
  exclusions: z.array(z.string()).optional(),
  guestLimit: z.number().int().min(1).max(80).optional(),
  image: z.string().optional(),
  active: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
  durationDays: z.number().int().min(1).max(60).optional(),
  durationNights: z.number().int().min(0).max(60).optional(),
  pricingType: z.enum(["per_person", "per_night"]).optional(),
});

const packageInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(600).optional().default(""),
  price: z.number().min(0),
  inclusions: z.array(z.string()).default([]),
  exclusions: z.array(z.string()).optional(),
  guestLimit: z.number().int().min(1).max(80).optional().nullable(),
  image: z.string().optional().nullable(),
  active: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  durationDays: z.number().int().min(1).max(60).optional().nullable(),
  durationNights: z.number().int().min(0).max(60).optional().nullable(),
  pricingType: z.enum(["per_person", "per_night"]).optional(),
});

const listingInputSchema = z.object({
  kind: z.enum(["tour", "stay", "restaurant", "package"]),
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
  durationNights: z.number().optional(),
  startTime: z.string().trim().max(8).optional(),
  endTime: z.string().trim().max(8).optional(),
  autoEndDate: z.boolean().optional(),
  pricingType: z.enum(["per_person", "per_night", "per_package"]).optional(),
  packageIds: z.array(z.string().min(1)).optional(),
  packages: z.array(listingPackageSchema).optional(),
  seatsLeft: z.number().optional(),
  discountPct: z.number().min(0).max(90).optional().nullable(),
  inclusions: z.array(z.string()).optional(),
  exclusions: z.array(z.string()).optional(),
  cancellationPolicy: z.string().optional(),
  coords: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullable()
    .optional(),
  showMap: z.boolean().optional(),
  mapHidden: z.boolean().optional(),
  available: z.boolean().optional(),
  unavailableReason: z.string().trim().max(200).optional().nullable(),
});

export const fetchRevisionFn = createServerFn({ method: "GET" }).handler(async () => {
  return { revision: await getRevision() };
});

export const fetchHubSnapshotFn = createServerFn({ method: "GET" }).handler(async () => {
  const state = await getSnapshot();
  return {
    revision: state.revision,
    listings: state.listings.map((listing) => applyListingMapFlags({ ...listing })),
    bookings: state.bookings,
    destinations: state.destinations,
    packages: state.packages,
    testimonials: state.testimonials,
    adminInvites: state.adminInvites,
    settings: state.settings,
  };
});

export const registerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        name: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .transform((value) => value.replace(/\s+/g, " ").toLocaleUpperCase("en-US")),
        email: emailSchema,
        password: passwordSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { syncEnvFromGlobal } = await import("@/lib/worker-env");
    syncEnvFromGlobal();
    return registerAccount(data);
  });

export const signInFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        email: emailSchema,
        password: passwordSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { syncEnvFromGlobal } = await import("@/lib/worker-env");
    syncEnvFromGlobal();
    return signInAccount(data);
  });

export const oauthSignInFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        idToken: z.string().min(20),
        name: z.string().trim().min(1).max(80).optional(),
        email: emailSchema.optional(),
        picture: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { syncEnvFromGlobal } = await import("@/lib/worker-env");
    syncEnvFromGlobal();
    const verified = await verifyGoogleIdToken(data.idToken);
    return upsertOAuthAccount({
      name: verified.name || data.name || "Traveller",
      email: verified.email,
      picture: verified.picture || data.picture || undefined,
    });
  });

export const updateAccountProfileFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        email: emailSchema,
        name: z
          .string()
          .trim()
          .min(2)
          .max(80)
          .transform((value) => value.replace(/\s+/g, " ").toLocaleUpperCase("en-US")),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { syncEnvFromGlobal } = await import("@/lib/worker-env");
    syncEnvFromGlobal();
    return updateAccountProfile(data);
  });

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

export const listCustomersFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ actorEmail: emailSchema }).parse(data))
  .handler(async ({ data }) => listCustomers(data.actorEmail));

export const removeCustomerFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        customerEmail: emailSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) => removeCustomer(data.actorEmail, data.customerEmail));

export const createBookingFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        listingId: z.string().min(1),
        guests: z.number().int().min(1).max(40),
        date: z.string().min(1),
        endDate: z.string().min(1).optional(),
        packageId: z.string().min(1).optional(),
        total: z.number().min(0).optional(),
        customer: z.string().trim().min(2).max(80),
        customerEmail: z.string().email().optional(),
        customerPhone: z.string().trim().max(40).optional(),
        notifyPreference: z.enum(["call", "sms", "email", "any"]).optional(),
        guestCheckout: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { syncEnvFromGlobal } = await import("@/lib/worker-env");
    syncEnvFromGlobal();
    return createBookingRecord(data);
  });

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
          "partial_payment",
          "completed_payment",
          "cancelled",
          "rejected",
        ]),
        note: z.string().trim().max(500).optional(),
        actorEmail: emailSchema.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { syncEnvFromGlobal } = await import("@/lib/worker-env");
    syncEnvFromGlobal();
    return setBookingStatus(data.id, data.status, {
      note: data.note,
      actorEmail: data.actorEmail,
    });
  });

export const bookingFeedFn = createServerFn({ method: "GET" }).handler(async () =>
  getBookingFeed(25),
);

export const recordBookingPaymentFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        id: z.string().min(1),
        method: z.string().trim().min(1).max(40),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { syncEnvFromGlobal } = await import("@/lib/worker-env");
    syncEnvFromGlobal();
    return setBookingPaymentMethod(data.id, data.method);
  });

export const fetchAdminBookingsFn = createServerFn({ method: "GET" }).handler(async () =>
  getAdminBookings(),
);

export const resetRevenueFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        code: z.string().trim().min(1).max(20),
      })
      .parse(data),
  )
  .handler(async ({ data }) => resetRevenueRecords(data.actorEmail, data.code));

export const fetchBookingsForEmailFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ email: emailSchema }).parse(data))
  .handler(async ({ data }) => getBookingsForEmail(data.email));

export const fetchBookingByReferenceFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ reference: z.string().trim().min(4).max(40) }).parse(data),
  )
  .handler(async ({ data }) => getBookingByReference(data.reference));

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

const destinationInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(180).optional().default(""),
  image: z.string().max(800_000).optional().default(""),
  coords: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .nullable()
    .optional(),
});

export const createDestinationFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        destination: destinationInputSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    createDestinationRecord(data.actorEmail, data.destination),
  );

export const updateDestinationFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        id: z.string().min(1),
        patch: destinationInputSchema.partial(),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    updateDestinationRecord(data.actorEmail, data.id, data.patch),
  );

export const deleteDestinationFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        id: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => deleteDestinationRecord(data.actorEmail, data.id));

export const createPackageFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        package: packageInputSchema,
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    createPackageRecord(data.actorEmail, {
      name: data.package.name,
      description: data.package.description,
      price: data.package.price,
      inclusions: data.package.inclusions,
      exclusions: data.package.exclusions,
      guestLimit: data.package.guestLimit == null ? undefined : data.package.guestLimit,
      image: data.package.image == null ? undefined : data.package.image,
      active: data.package.active,
      position: data.package.position,
      durationDays: data.package.durationDays == null ? undefined : data.package.durationDays,
      durationNights:
        data.package.durationNights == null ? undefined : data.package.durationNights,
      pricingType: data.package.pricingType,
    }),
  );

export const updatePackageFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        id: z.string().min(1),
        patch: packageInputSchema.partial(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const patch: Partial<PackageInput> = {};
    if (data.patch.name !== undefined) patch.name = data.patch.name;
    if (data.patch.description !== undefined) patch.description = data.patch.description;
    if (data.patch.price !== undefined) patch.price = data.patch.price;
    if (data.patch.inclusions !== undefined) patch.inclusions = data.patch.inclusions;
    if (data.patch.exclusions !== undefined) patch.exclusions = data.patch.exclusions;
    // `null` must survive JSON (unlike `undefined`) so admins can clear guest limits.
    if ("guestLimit" in data.patch) {
      patch.guestLimit = data.patch.guestLimit == null ? null : data.patch.guestLimit;
    }
    if ("image" in data.patch) {
      patch.image = data.patch.image == null ? null : data.patch.image;
    }
    if (data.patch.active !== undefined) patch.active = data.patch.active;
    if (data.patch.position !== undefined) patch.position = data.patch.position;
    if ("durationDays" in data.patch) {
      patch.durationDays = data.patch.durationDays == null ? null : data.patch.durationDays;
    }
    if ("durationNights" in data.patch) {
      patch.durationNights =
        data.patch.durationNights == null ? null : data.patch.durationNights;
    }
    if (data.patch.pricingType !== undefined) patch.pricingType = data.patch.pricingType;
    return updatePackageRecord(data.actorEmail, data.id, patch);
  });

export const deletePackageFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        id: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => deletePackageRecord(data.actorEmail, data.id));

export const reorderPackagesFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        orderedIds: z.array(z.string().min(1)).min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) => reorderPackagesRecord(data.actorEmail, data.orderedIds));

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
        kind: z.enum(["tour", "stay", "restaurant", "package", "all"]).optional(),
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
      const packagePrices = (l.packages ?? [])
        .filter((p) => p.active !== false)
        .map((p) => p.price)
        .filter((n) => Number.isFinite(n) && n >= 0);
      const effectivePrice =
        (l.kind === "package" || l.pricingType === "per_package") && packagePrices.length
          ? Math.min(...packagePrices)
          : l.price;
      if (effectivePrice < filters.minPrice || effectivePrice > filters.maxPrice) return false;
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
            contactAddress: z.string().trim().max(240).optional(),
            contactPhone: z.string().trim().max(40).optional(),
            contactMobile: z.string().trim().max(40).optional(),
            contactEmail: z.string().trim().max(160).optional(),
            officeHours: z.string().trim().max(120).optional(),
            bookingNotice: z.string().trim().max(400).optional(),
            socialInstagram: z.string().trim().max(300).optional(),
            socialTwitter: z.string().trim().max(300).optional(),
            socialFacebook: z.string().trim().max(300).optional(),
            policyTerms: z.string().max(20000).optional(),
            policyPrivacy: z.string().max(20000).optional(),
            policyCancellation: z.string().max(20000).optional(),
            policyHelp: z.string().max(20000).optional(),
            cancellationNotice: z.string().trim().max(600).optional(),
          })
          .partial(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => updateSettings(data.actorEmail, data.patch));

export const addListingReviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        email: emailSchema,
        name: z.string().trim().min(1).max(80),
        listingId: z.string().min(1),
        rating: z.number().min(1).max(5),
        body: z.string().trim().min(10).max(800),
      })
      .parse(data),
  )
  .handler(async ({ data }) => addListingReview(data));

export const removeListingReviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        listingId: z.string().min(1),
        reviewId: z.string().min(1),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    removeListingReview(data.actorEmail, data.listingId, data.reviewId),
  );

export const toggleFavoriteFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ email: emailSchema, listingId: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => toggleFavorite(data.email, data.listingId));

export const listFavoritesFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ email: emailSchema }).parse(data))
  .handler(async ({ data }) => listFavorites(data.email));

export const listNotificationsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ email: emailSchema }).parse(data))
  .handler(async ({ data }) => listNotifications(data.email));

export const markNotificationReadFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ email: emailSchema, id: z.string().min(1) }).parse(data),
  )
  .handler(async ({ data }) => markNotificationRead(data.email, data.id));

export const markAllNotificationsReadFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ email: emailSchema }).parse(data))
  .handler(async ({ data }) => markAllNotificationsRead(data.email));

export const broadcastNotificationFn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        actorEmail: emailSchema,
        title: z.string().trim().min(2).max(120),
        body: z.string().trim().min(4).max(600),
        link: z.string().trim().max(200).optional(),
        targetEmail: emailSchema.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) =>
    broadcastNotification(data.actorEmail, {
      title: data.title,
      body: data.body,
      link: data.link,
      targetEmail: data.targetEmail,
    }),
  );

/** Admin self-test: send one push to the signed-in admin email (External ID). */
export const testAdminPushFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ actorEmail: emailSchema }).parse(data))
  .handler(async ({ data }) => {
    const { syncEnvFromGlobal } = await import("@/lib/worker-env");
    syncEnvFromGlobal();
    const { ensureStore } = await import("@/lib/store.server");
    const { isMainAdminEmail, normalizeEmail } = await import("@/lib/constants");
    const state = await ensureStore();
    const email = normalizeEmail(data.actorEmail);
    const account = state.accounts.find((a) => a.email === email);
    if (!isMainAdminEmail(email) && account?.role !== "admin") {
      throw new Error("Admin only");
    }
    const { absoluteUrl, sendPushToEmails, sendPushToRole, pushIdempotencyKey } = await import(
      "@/lib/onesignal.server"
    );
    const payload = {
      title: "Nexora push test",
      body: "Admin push works on this device. New bookings will alert you here.",
      url: absoluteUrl("/admin"),
      idempotencyKey: pushIdempotencyKey(`admin-test|${email}|${Date.now()}`),
    };
    try {
      const byEmail = await sendPushToEmails([email], payload);
      if (byEmail.recipients > 0) {
        return {
          ok: true,
          recipients: byEmail.recipients,
          target: email,
          strategy: byEmail.strategy,
          notificationId: byEmail.notificationId ?? null,
        };
      }
      const byRole = await sendPushToRole("admin", {
        ...payload,
        idempotencyKey: pushIdempotencyKey(`admin-test-role|${email}|${Date.now()}`),
      });
      if (byRole.recipients > 0) {
        return {
          ok: true,
          recipients: byRole.recipients,
          target: email,
          strategy: byRole.strategy,
          notificationId: byRole.notificationId ?? null,
        };
      }
      return {
        ok: false,
        recipients: 0,
        target: email,
        error:
          byEmail.error ||
          byRole.error ||
          "External ID exists but has no Subscribed Web Push channel. Tap Re-subscribe, Allow, then confirm Channels = Subscribed in OneSignal.",
        strategy: byEmail.strategy,
      };
    } catch (error) {
      console.error("[onesignal] testAdminPush failed", error);
      return {
        ok: false,
        recipients: 0,
        target: email,
        error: error instanceof Error ? error.message.slice(0, 240) : "test-push-failed",
      };
    }
  });

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
