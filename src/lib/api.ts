/**
 * API layer.
 *
 * Every read/write in the app goes through these functions. They currently
 * resolve against the bundled catalog so the UI is fully interactive before a
 * backend is attached. Each function is a 1:1 match for the Supabase query it
 * will run once the project's Supabase instance is connected — swap the body,
 * keep the signature, and the whole app keeps working.
 */
import { allTags, demoBookings, destinations, listings } from "@/data/catalog";
import type {
  Booking,
  BookingStatus,
  Destination,
  Listing,
  ListingKind,
  SearchFilters,
} from "@/lib/types";

const latency = (ms = 260) => new Promise((r) => setTimeout(r, ms));

export const defaultFilters: SearchFilters = {
  q: "",
  kind: "all",
  destination: "all",
  minPrice: 0,
  maxPrice: 1000,
  minRating: 0,
  tags: [],
  sort: "popular",
};

export async function fetchDestinations(): Promise<Destination[]> {
  await latency(120);
  return destinations;
}

export async function fetchFeatured(): Promise<Listing[]> {
  await latency(160);
  return listings.filter((l) => l.featured && l.status === "approved");
}

export async function fetchTrending(kind?: ListingKind): Promise<Listing[]> {
  await latency(160);
  return listings
    .filter((l) => l.status === "approved" && (!kind || l.kind === kind))
    .sort((a, b) => b.reviewCount - a.reviewCount)
    .slice(0, 8);
}

export async function fetchRecent(): Promise<Listing[]> {
  await latency(140);
  return [...listings]
    .filter((l) => l.status === "approved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
}

export async function searchListings(filters: SearchFilters): Promise<Listing[]> {
  await latency(340);
  const q = filters.q.trim().toLowerCase();

  const result = listings.filter((l) => {
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
}

export async function fetchListingBySlug(slug: string): Promise<Listing | null> {
  await latency(200);
  return listings.find((l) => l.slug === slug) ?? null;
}

export async function fetchRelated(listing: Listing): Promise<Listing[]> {
  await latency(120);
  return listings
    .filter((l) => l.id !== listing.id && (l.destination === listing.destination || l.kind === listing.kind))
    .slice(0, 3);
}

export async function fetchBookings(): Promise<Booking[]> {
  await latency(220);
  return demoBookings;
}

export interface CreateBookingInput {
  listing: Listing;
  guests: number;
  date: string;
  total: number;
  customer: string;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  await latency(700);
  const ref = `EXH-${Math.floor(1000 + Math.random() * 8999)}-${input.listing.destination
    .slice(0, 3)
    .toUpperCase()}`;
  return {
    id: crypto.randomUUID(),
    reference: ref,
    listingId: input.listing.id,
    listingTitle: input.listing.title,
    kind: input.listing.kind,
    image: input.listing.images[0],
    guests: input.guests,
    date: input.date,
    total: input.total,
    status: "pending",
    paid: false,
    customer: input.customer,
  };
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<{ id: string; status: BookingStatus }> {
  await latency(420);
  return { id, status };
}

export async function fetchPendingBusinesses(): Promise<Listing[]> {
  await latency(200);
  return listings.slice(0, 3).map((l) => ({ ...l, status: "pending" as const }));
}

export function tagOptions() {
  return allTags;
}

export function destinationOptions() {
  return Array.from(new Set(listings.map((l) => l.destination))).sort();
}
