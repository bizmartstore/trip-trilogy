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
  email: string;
  avatar: string;
  rating: number;
  date: string;
  body: string;
}

export type NotificationKind = "booking" | "message" | "system";

export interface HubNotification {
  id: string;
  email: string;
  title: string;
  body: string;
  link?: string;
  read: boolean;
  kind: NotificationKind;
  createdAt: string;
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
  /** Contact number the traveller wants to be reached on. */
  customerPhone?: string;
  /** How the traveller prefers to be notified when email is not available. */
  notifyPreference?: NotifyPreference;
  /** Last status transition timestamp (ISO). */
  statusUpdatedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  /** Admin who performed the last status change. */
  statusBy?: string;
  /** Internal note attached by the admin when approving / rejecting. */
  adminNote?: string;
}

export type NotifyPreference = "call" | "sms" | "email" | "any";

export interface Testimonial {
  id: string;
  author: string;
  email: string;
  role: string;
  body: string;
  rating: number;
  createdAt: string;
}

export interface HubSettings {
  /** Public office or mailing address shown in the footer. */
  contactAddress: string;
  /** Primary number tourists can call for booking follow-ups. */
  contactPhone: string;
  /** Number that accepts SMS / Viber / WhatsApp messages. */
  contactMobile: string;
  contactEmail: string;
  /** Office hours shown next to the contact details. */
  officeHours: string;
  /** Short note shown on the booking confirmation screen. */
  bookingNotice: string;
  /** Footer social links — leave blank to hide the icon. */
  socialInstagram?: string;
  socialTwitter?: string;
  socialFacebook?: string;
}


export interface HubAccount {
  email: string;
  name: string;
  passwordHash: string;
  role: "tourist" | "admin";
  picture?: string;
  createdAt: string;
  notifyPreference?: NotifyPreference;
  contactNumber?: string;
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
