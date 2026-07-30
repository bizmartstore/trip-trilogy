export type ListingKind = "tour" | "stay" | "restaurant";

export type UserRole = "visitor" | "tourist" | "admin";

export type BookingStatus =
  | "pending"
  | "approved"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rejected";

export type BusinessStatus = "pending" | "approved" | "suspended" | "rejected";

export interface Destination {
  id: string;
  name: string;
  country: string;
  image: string;
  listings: number;
  tagline: string;
}

export interface Review {
  id: string;
  author: string;
  avatar: string;
  rating: number;
  date: string;
  body: string;
}

export interface ItineraryDay {
  day: number;
  title: string;
  detail: string;
}

export interface RoomType {
  name: string;
  capacity: number;
  price: number;
  beds: string;
}

export interface MenuItem {
  name: string;
  category: string;
  price: number;
  description: string;
  bestSeller?: boolean;
}

export interface Listing {
  id: string;
  slug: string;
  kind: ListingKind;
  title: string;
  tagline: string;
  description: string;
  destination: string;
  country: string;
  category: string;
  price: number;
  currency: string;
  unit: string;
  rating: number;
  reviewCount: number;
  /** Image URLs or compact data-URL text (renders as images in the browser). */
  images: string[];
  amenities: string[];
  tags: string[];
  durationDays?: number;
  seatsLeft?: number;
  discountPct?: number;
  featured?: boolean;
  status: BusinessStatus;
  businessName: string;
  createdAt: string;
  coords: { lat: number; lng: number };
  inclusions?: string[];
  exclusions?: string[];
  itinerary?: ItineraryDay[];
  rooms?: RoomType[];
  menu?: MenuItem[];
  faqs?: { q: string; a: string }[];
  cancellationPolicy?: string;
  reviews?: Review[];
}

export interface Booking {
  id: string;
  reference: string;
  listingId: string;
  listingTitle: string;
  kind: ListingKind;
  image: string;
  guests: number;
  date: string;
  total: number;
  status: BookingStatus;
  paid: boolean;
  customer: string;
  customerEmail?: string;
  createdAt?: string;
}

export interface Testimonial {
  id: string;
  author: string;
  email: string;
  role: string;
  body: string;
  rating: number;
  createdAt: string;
}

export interface HubAccount {
  email: string;
  name: string;
  passwordHash: string;
  role: "tourist" | "admin";
  picture?: string;
  createdAt: string;
}

export interface SearchFilters {
  q: string;
  kind: ListingKind | "all";
  destination: string;
  minPrice: number;
  maxPrice: number;
  minRating: number;
  tags: string[];
  sort: "popular" | "price-asc" | "price-desc" | "rating";
}

export interface ListingInput {
  kind: ListingKind;
  title: string;
  tagline: string;
  description: string;
  destination: string;
  country: string;
  category: string;
  price: number;
  unit: string;
  images: string[];
  amenities: string[];
  tags: string[];
  businessName: string;
  featured?: boolean;
  status?: BusinessStatus;
  durationDays?: number;
  seatsLeft?: number;
  discountPct?: number;
  inclusions?: string[];
  exclusions?: string[];
  itinerary?: ItineraryDay[];
  rooms?: RoomType[];
  menu?: MenuItem[];
  cancellationPolicy?: string;
}
