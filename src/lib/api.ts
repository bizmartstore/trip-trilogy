/**
 * Client API — all reads/writes go through Cloudflare Worker server functions.
 * Images are text (data URLs). Cheap revision polling powers realtime UI updates.
 */
import { allTags } from "@/data/catalog";
import {
  addListingReviewFn,
  addTestimonialFn,
  bookingFeedFn,
  broadcastNotificationFn,
  createBookingFn,
  createDestinationFn,
  createListingFn,
  createPackageFn,
  deleteDestinationFn,
  deleteListingFn,
  deletePackageFn,
  deleteTestimonialFn,
  fetchAdminBookingsFn,
  fetchBookingByReferenceFn,
  fetchBookingsForEmailFn,
  fetchHubSnapshotFn,
  fetchRevisionFn,
  fetchSettingsFn,
  inviteAdminFn,
  listAdminsFn,
  listCustomersFn,
  listFavoritesFn,
  listNotificationsFn,
  markAllNotificationsReadFn,
  markNotificationReadFn,
  oauthSignInFn,
  registerFn,
  removeAdminInviteFn,
  removeCustomerFn,
  removeListingReviewFn,
   reorderPackagesFn,
   recordBookingPaymentFn,
   resetRevenueFn,
  searchListingsFn,
  signInFn,
  testAdminPushFn,
  toggleFavoriteFn,
  updateBookingStatusFn,
  updateDestinationFn,
  updateListingFn,
  updateNotifyPrefsFn,
  updatePackageFn,
  updateSettingsFn,
} from "@/lib/hub.functions";
import type {
  Booking,
  NotifyPreference,
  HubNotification,
  HubSettings,
  BookingStatus,
  Destination,
  DestinationInput,
  Listing,
  ListingInput,
  ListingKind,
  ListingPackage,
  PackageInput,
  Review,
  SearchFilters,
  Testimonial,
} from "@/lib/types";

export const defaultFilters: SearchFilters = {
  q: "",
  kind: "all",
  destination: "all",
  minPrice: 0,
  maxPrice: 50000,
  minRating: 0,
  tags: [],
  sort: "popular",
};

let cache: Awaited<ReturnType<typeof fetchHubSnapshotFn>> | null = null;

async function snapshot(force = false) {
  if (!force && cache) return cache;
  cache = await fetchHubSnapshotFn();
  return cache;
}

export function invalidateApiCache() {
  cache = null;
}

export async function fetchRevision() {
  return fetchRevisionFn();
}

export async function fetchDestinations(): Promise<Destination[]> {
  const s = await snapshot();
  return s.destinations;
}

export async function createDestination(actorEmail: string, destination: DestinationInput) {
  const created = await createDestinationFn({ data: { actorEmail, destination } });
  invalidateApiCache();
  return created;
}

export async function updateDestination(
  actorEmail: string,
  id: string,
  patch: Partial<DestinationInput>,
) {
  const updated = await updateDestinationFn({ data: { actorEmail, id, patch } });
  invalidateApiCache();
  return updated;
}

export async function deleteDestination(actorEmail: string, id: string) {
  const result = await deleteDestinationFn({ data: { actorEmail, id } });
  invalidateApiCache();
  return result;
}

export async function fetchPackages(): Promise<ListingPackage[]> {
  const s = await snapshot();
  return s.packages ?? [];
}

export async function createPackage(actorEmail: string, pkg: PackageInput) {
  const created = await createPackageFn({ data: { actorEmail, package: pkg } });
  invalidateApiCache();
  return created;
}

export async function updatePackage(actorEmail: string, id: string, patch: Partial<PackageInput>) {
  const updated = await updatePackageFn({ data: { actorEmail, id, patch } });
  invalidateApiCache();
  return updated;
}

export async function deletePackage(actorEmail: string, id: string) {
  const result = await deletePackageFn({ data: { actorEmail, id } });
  invalidateApiCache();
  return result;
}

export async function reorderPackages(actorEmail: string, orderedIds: string[]) {
  const result = await reorderPackagesFn({ data: { actorEmail, orderedIds } });
  invalidateApiCache();
  return result;
}

export async function fetchFeatured(): Promise<Listing[]> {
  const s = await snapshot();
  return s.listings.filter((l) => l.featured && l.status === "approved");
}

export async function fetchTrending(kind?: ListingKind): Promise<Listing[]> {
  const s = await snapshot();
  return s.listings
    .filter((l) => l.status === "approved" && (!kind || l.kind === kind))
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, 8);
}

export async function fetchRecent(): Promise<Listing[]> {
  const s = await snapshot();
  return [...s.listings]
    .filter((l) => l.status === "approved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
}

export async function searchListings(filters: SearchFilters): Promise<Listing[]> {
  return searchListingsFn({ data: filters });
}

export async function fetchListingBySlug(slug: string): Promise<Listing | null> {
  const s = await snapshot(true);
  return s.listings.find((l) => l.slug === slug) ?? null;
}

export async function fetchRelated(listing: Listing): Promise<Listing[]> {
  const s = await snapshot();
  return s.listings
    .filter(
      (l) =>
        l.id !== listing.id &&
        l.status === "approved" &&
        (l.destination === listing.destination || l.kind === listing.kind),
    )
    .slice(0, 3);
}

export async function fetchAllListingsAdmin(): Promise<Listing[]> {
  const s = await snapshot(true);
  return s.listings;
}

export async function fetchBookings(): Promise<Booking[]> {
  const s = await snapshot(true);
  return s.bookings;
}

export async function fetchAdminBookings(): Promise<Booking[]> {
  return fetchAdminBookingsFn();
}

export async function resetRevenue(actorEmail: string, code: string) {
  const result = await resetRevenueFn({ data: { actorEmail, code } });
  invalidateApiCache();
  return result;
}

export async function fetchBookingsForEmail(email: string): Promise<Booking[]> {
  return fetchBookingsForEmailFn({ data: { email } });
}

export async function fetchBookingByReference(reference: string): Promise<Booking | null> {
  return fetchBookingByReferenceFn({ data: { reference } });
}

export interface CreateBookingInput {
  listing: Listing;
  guests: number;
  date: string;
  endDate?: string;
  packageId?: string;
  total?: number;
  customer: string;
  customerEmail?: string;
  customerPhone?: string;
  notifyPreference?: NotifyPreference;
  guestCheckout?: boolean;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const booking = await createBookingFn({
    data: {
      listingId: input.listing.id,
      guests: input.guests,
      date: input.date,
      endDate: input.endDate,
      packageId: input.packageId,
      total: input.total,
      customer: input.customer,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      notifyPreference: input.notifyPreference,
      guestCheckout: input.guestCheckout,
    },
  });
  invalidateApiCache();
  return booking;
}

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
  options: { note?: string; actorEmail?: string } = {},
) {
  const result = await updateBookingStatusFn({
    data: { id, status, note: options.note, actorEmail: options.actorEmail },
  });
  invalidateApiCache();
  return result;
}

/** Tourist selected a payment gateway (e.g. PayMaya) for an approved reservation. */
export async function recordBookingPayment(id: string, method: string) {
  const result = await recordBookingPaymentFn({ data: { id, method } });
  invalidateApiCache();
  return result;
}

/** Live booking feed read straight from Supabase. */
export async function fetchBookingFeed() {
  return bookingFeedFn();
}

export async function updateNotifyPreferences(input: {
  email: string;
  notifyPreference: NotifyPreference;
  contactNumber?: string;
}) {
  const result = await updateNotifyPrefsFn({ data: input });
  invalidateApiCache();
  return result;
}

export async function fetchPendingBusinesses(): Promise<Listing[]> {
  const s = await snapshot(true);
  return s.listings.filter((l) => l.status === "pending");
}

export async function createListing(actorEmail: string, listing: ListingInput) {
  const created = await createListingFn({ data: { actorEmail, listing } });
  invalidateApiCache();
  return created;
}

export async function updateListing(
  actorEmail: string,
  id: string,
  patch: Partial<ListingInput>,
) {
  const updated = await updateListingFn({ data: { actorEmail, id, patch } });
  invalidateApiCache();
  return updated;
}

export async function deleteListing(actorEmail: string, id: string) {
  const result = await deleteListingFn({ data: { actorEmail, id } });
  invalidateApiCache();
  return result;
}

export async function fetchTestimonials(): Promise<Testimonial[]> {
  const s = await snapshot();
  return s.testimonials;
}

export async function submitTestimonial(input: {
  author: string;
  email: string;
  role?: string;
  body: string;
  rating: number;
}) {
  const t = await addTestimonialFn({ data: input });
  invalidateApiCache();
  return t;
}

export async function removeTestimonial(actorEmail: string, id: string) {
  const result = await deleteTestimonialFn({ data: { actorEmail, id } });
  invalidateApiCache();
  return result;
}

async function postAuthJson<T>(
  path: string,
  body: unknown,
  init?: { headers?: Record<string, string> },
): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...init?.headers,
    },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      res.ok
        ? "Unexpected auth response."
        : "Sign-in is temporarily unavailable. Please try again shortly.",
    );
  }
  return parsed as T;
}

export async function registerAccount(input: {
  name: string;
  email: string;
  password: string;
}) {
  return postAuthJson<Awaited<ReturnType<typeof registerFn>>>("/api/auth/register", input);
}

export async function signInAccount(input: { email: string; password: string }) {
  return postAuthJson<Awaited<ReturnType<typeof signInFn>>>("/api/auth/sign-in", input);
}

export async function oauthSignIn(input: {
  idToken: string;
  name?: string;
  email?: string;
  picture?: string;
}) {
  const idToken = String(input.idToken ?? "").trim();
  if (!idToken || idToken.split(".").length < 3) {
    throw new Error("Google sign-in token was missing. Try again.");
  }
  // Send under several keys + Bearer so older caches / parsers still find the JWT.
  const payload = {
    idToken,
    id_token: idToken,
    credential: idToken,
    name: input.name,
    email: input.email,
    picture: input.picture,
  };
  const result = await postAuthJson<
    Awaited<ReturnType<typeof oauthSignInFn>> | { error: string }
  >("/api/auth/oauth", payload, {
    headers: { authorization: `Bearer ${idToken}` },
  });
  if (result && typeof result === "object" && "error" in result && !("email" in result)) {
    throw new Error(String((result as { error: string }).error));
  }
  return result as Awaited<ReturnType<typeof oauthSignInFn>>;
}

export async function updateAccountProfile(_email: string, name: string) {
  const result = await postAuthJson<{ email: string; name: string; role: "tourist" | "admin"; picture?: string } | { error: string }>(
    "/api/auth/profile",
    { name },
  );
  if (result && typeof result === "object" && "error" in result && !("email" in result)) {
    throw new Error(String((result as { error: string }).error));
  }
  return result as { email: string; name: string; role: "tourist" | "admin"; picture?: string };
}

export async function inviteAdmin(actorEmail: string, inviteEmail: string) {
  const result = await inviteAdminFn({ data: { actorEmail, inviteEmail } });
  invalidateApiCache();
  return result;
}

export async function removeAdminInvite(actorEmail: string, inviteEmail: string) {
  const result = await removeAdminInviteFn({ data: { actorEmail, inviteEmail } });
  invalidateApiCache();
  return result;
}

export async function listAdmins(actorEmail: string) {
  return listAdminsFn({ data: { actorEmail } });
}

export async function listCustomers(actorEmail: string) {
  return listCustomersFn({ data: { actorEmail } });
}

export async function removeCustomer(actorEmail: string, customerEmail: string) {
  const result = await removeCustomerFn({ data: { actorEmail, customerEmail } });
  invalidateApiCache();
  return result;
}

export function tagOptions() {
  return allTags;
}

const FALLBACK_DESTINATION_NAMES = [
  "El Nido",
  "Coron",
  "Puerto Princesa",
  "Port Barton",
  "San Vicente",
  "Balabac",
];

export function namesFromDestinationCatalog(
  destinations?: Array<{ name: string }>,
  listings?: Array<{ destination: string }>,
) {
  const names = new Set<string>();
  for (const d of destinations ?? []) {
    const name = d.name.trim();
    if (name) names.add(name);
  }
  for (const l of listings ?? []) {
    const name = l.destination.trim();
    if (name) names.add(name);
  }
  if (names.size) return Array.from(names).sort((a, b) => a.localeCompare(b));
  return [...FALLBACK_DESTINATION_NAMES];
}

export function destinationOptions() {
  return namesFromDestinationCatalog(cache?.destinations, cache?.listings);
}

export async function fetchSettings(): Promise<HubSettings> {
  return fetchSettingsFn();
}

export async function updateSettings(actorEmail: string, patch: Partial<HubSettings>) {
  const settings = await updateSettingsFn({ data: { actorEmail, patch } });
  invalidateApiCache();
  return settings;
}

export async function submitListingReview(input: {
  email: string;
  name: string;
  listingId: string;
  rating: number;
  body: string;
}): Promise<Review> {
  const review = await addListingReviewFn({ data: input });
  invalidateApiCache();
  return review;
}

export async function removeListingReview(
  actorEmail: string,
  listingId: string,
  reviewId: string,
) {
  const result = await removeListingReviewFn({ data: { actorEmail, listingId, reviewId } });
  invalidateApiCache();
  return result;
}

export async function toggleFavorite(email: string, listingId: string) {
  const result = await toggleFavoriteFn({ data: { email, listingId } });
  invalidateApiCache();
  return result;
}

export async function fetchFavorites(email: string): Promise<Listing[]> {
  return listFavoritesFn({ data: { email } });
}

export async function fetchNotifications(email: string): Promise<HubNotification[]> {
  return listNotificationsFn({ data: { email } });
}

export async function markNotificationRead(email: string, id: string) {
  const note = await markNotificationReadFn({ data: { email, id } });
  invalidateApiCache();
  return note;
}

export async function markAllNotificationsRead(email: string) {
  const result = await markAllNotificationsReadFn({ data: { email } });
  invalidateApiCache();
  return result;
}

export async function broadcastNotification(
  actorEmail: string,
  input: { title: string; body: string; link?: string; targetEmail?: string },
) {
  const result = await broadcastNotificationFn({ data: { actorEmail, ...input } });
  invalidateApiCache();
  return result;
}

/** Send a one-off test push to the admin's own External ID. */
export async function testAdminPush(actorEmail: string) {
  return testAdminPushFn({ data: { actorEmail } });
}
