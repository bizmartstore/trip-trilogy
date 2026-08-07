/**
 * Client API — all reads/writes go through Cloudflare Worker server functions.
 * Images are text (data URLs). Cheap revision polling powers realtime UI updates.
 */
import { allTags } from "@/data/catalog";
import {
  addTestimonialFn,
  createBookingFn,
  createListingFn,
  deleteListingFn,
  deleteTestimonialFn,
  fetchHubSnapshotFn,
  fetchRevisionFn,
  fetchSettingsFn,
  inviteAdminFn,
  listAdminsFn,
  oauthSignInFn,
  registerFn,
  removeAdminInviteFn,
  searchListingsFn,
  signInFn,
  updateBookingStatusFn,
  updateListingFn,
  updateSettingsFn,
} from "@/lib/hub.functions";
import type {
  Booking,
  HubSettings,
  BookingStatus,
  Destination,
  Listing,
  ListingInput,
  ListingKind,
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

export async function fetchBookingsForEmail(email: string): Promise<Booking[]> {
  const s = await snapshot(true);
  const e = email.trim().toLowerCase();
  return s.bookings.filter(
    (b) =>
      b.customerEmail?.toLowerCase() === e ||
      b.customer.toLowerCase() === e.split("@")[0].toLowerCase(),
  );
}

export interface CreateBookingInput {
  listing: Listing;
  guests: number;
  date: string;
  total: number;
  customer: string;
  customerEmail?: string;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const booking = await createBookingFn({
    data: {
      listingId: input.listing.id,
      guests: input.guests,
      date: input.date,
      total: input.total,
      customer: input.customer,
      customerEmail: input.customerEmail,
    },
  });
  invalidateApiCache();
  return booking;
}

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
): Promise<{ id: string; status: BookingStatus }> {
  const result = await updateBookingStatusFn({ data: { id, status } });
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

export async function registerAccount(input: {
  name: string;
  email: string;
  password: string;
}) {
  return registerFn({ data: input });
}

export async function signInAccount(input: { email: string; password: string }) {
  return signInFn({ data: input });
}

export async function oauthSignIn(input: {
  name: string;
  email: string;
  picture?: string;
}) {
  return oauthSignInFn({ data: input });
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

export function tagOptions() {
  return allTags;
}

export function destinationOptions() {
  if (cache?.listings?.length) {
    return Array.from(new Set(cache.listings.map((l) => l.destination))).sort();
  }
  return ["El Nido", "Coron", "Puerto Princesa", "Port Barton", "San Vicente", "Balabac"];
}

export async function fetchSettings(): Promise<HubSettings> {
  return fetchSettingsFn();
}

export async function updateSettings(actorEmail: string, patch: Partial<HubSettings>) {
  const settings = await updateSettingsFn({ data: { actorEmail, patch } });
  invalidateApiCache();
  return settings;
}
