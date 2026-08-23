export type ListingKind = "tour" | "stay" | "restaurant" | "package";

export type PricingType = "per_person" | "per_night" | "per_package";

/** How a package tier bills once selected (not the listing-level pricing mode). */
export type PackageBillingType = "per_person" | "per_night";

export interface ListingPackage {
  id: string;
  name: string;
  description: string;
  price: number;
  inclusions: string[];
  exclusions?: string[];
  guestLimit?: number;
  image?: string;
  active: boolean;
  position: number;
  /** Days this tier occupies on the calendar (e.g. Standard = 2). */
  durationDays?: number;
  /** Nights this tier occupies (e.g. Standard = 1 for 2D1N). */
  durationNights?: number;
  /** Bill price × guests or price × nights for this tier. */
  pricingType?: PackageBillingType;
}

export type UserRole = "visitor" | "tourist" | "admin";

export type BookingStatus =
  | "pending"
  | "approved"
  | "confirmed"
  | "completed"
  | "partial_payment"
  | "completed_payment"
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
  coords?: { lat: number; lng: number };
}

export interface DestinationInput {
  name: string;
  country: string;
  tagline: string;
  image?: string;
  coords?: { lat: number; lng: number } | null;
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
  durationNights?: number;
  /** HH:mm, used as the reservation start time. */
  startTime?: string;
  /** HH:mm, used as the reservation end time. */
  endTime?: string;
  /** When true (default), end date is start date + duration. */
  autoEndDate?: boolean;
  pricingType?: PricingType;
  /**
   * IDs of reusable catalog packages available for this listing.
   * When set, package details are resolved from the hub package catalog.
   */
  packageIds?: string[];
  /** Resolved / legacy embedded package tiers (hydrated from catalog when possible). */
  packages?: ListingPackage[];
  seatsLeft?: number;
  discountPct?: number;
  featured?: boolean;
  status: BusinessStatus;
  businessName: string;
  createdAt: string;
  coords?: { lat: number; lng: number };
  /** When false, the public listing hides the location map. Defaults to shown. */
  showMap?: boolean;
  /** Positive hide flag so “map off” still persists if `false` is stripped. */
  mapHidden?: boolean;
  inclusions?: string[];
  exclusions?: string[];
  itinerary?: ItineraryDay[];
  rooms?: RoomType[];
  menu?: MenuItem[];
  faqs?: { q: string; a: string }[];
  cancellationPolicy?: string;
  reviews?: Review[];
  /**
   * When false, the listing stays visible but cannot be opened/booked.
   * Defaults to available (undefined / true).
   */
  available?: boolean;
  /** Shown on cards when `available === false` (e.g. “Fully booked”). */
  unavailableReason?: string;
}

/** Public listings are bookable unless explicitly marked unavailable. */
export function isListingAvailable(listing: Pick<Listing, "available">) {
  return listing.available !== false;
}

export interface Booking {
  id: string;
  reference: string;
  listingId: string;
  listingTitle: string;
  kind: ListingKind;
  image: string;
  guests: number;
  /** Start date (YYYY-MM-DD). Kept for historical single-day bookings. */
  date: string;
  startDate?: string;
  startTime?: string;
  endDate?: string;
  endTime?: string;
  durationDays?: number;
  durationNights?: number;
  pricingType?: PricingType;
  packageId?: string;
  packageNameSnapshot?: string;
  packagePriceSnapshot?: number;
  packageSnapshot?: ListingPackage;
  subtotal?: number;
  total: number;
  status: BookingStatus;
  paid: boolean;
  /** Payment gateway the tourist chose (e.g. "paymaya"). */
  paymentMethod?: string;
  /** When the admin confirmed a (partial / full) payment was received. */
  paidAt?: string;
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
  /** True when the reservation was submitted without a registered account (guest checkout). */
  guestCheckout?: boolean;
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
  /**
   * Admin-editable policy pages (Admin → Policies). Empty string means the
   * built-in default content is shown on the public page.
   */
  policyTerms?: string;
  policyPrivacy?: string;
  policyCancellation?: string;
  policyHelp?: string;
  /**
   * Short cancellation / refund notice shown wherever reservation terms are
   * displayed (listing sidebar, booking dialog, listing FAQ). Falls back to
   * the listing's own cancellationPolicy when blank.
   */
  cancellationNotice?: string;
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
  durationNights?: number;
  startTime?: string;
  endTime?: string;
  autoEndDate?: boolean;
  pricingType?: PricingType;
  packageIds?: string[];
  packages?: ListingPackage[];
  seatsLeft?: number;
  discountPct?: number;
  inclusions?: string[];
  exclusions?: string[];
  itinerary?: ItineraryDay[];
  rooms?: RoomType[];
  menu?: MenuItem[];
  cancellationPolicy?: string;
  coords?: { lat: number; lng: number } | null;
  showMap?: boolean;
  mapHidden?: boolean;
  available?: boolean;
  unavailableReason?: string;
}

/** Admin create/update payload for the global travel package catalog. */
export interface PackageInput {
  name: string;
  description: string;
  price: number;
  inclusions: string[];
  exclusions?: string[];
  /** `null` clears a previously saved guest limit. */
  guestLimit?: number | null;
  image?: string | null;
  active?: boolean;
  position?: number;
  durationDays?: number | null;
  durationNights?: number | null;
  pricingType?: PackageBillingType;
}
