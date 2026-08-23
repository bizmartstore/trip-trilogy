import type { BookingStatus } from "@/lib/types";

/** One reservation as reported by the chat assistant's booking-status tool. */
export interface ChatBookingStatus {
  reference: string;
  listingTitle: string;
  kind: string;
  status: BookingStatus;
  statusLabel: string;
  guests: number;
  startDate?: string;
  endDate?: string;
  total: number;
  totalLabel: string;
  paid: boolean;
  bookedAt?: string;
  adminNote?: string;
}

/** Result payload of the checkBookingStatus tool. */
export interface ChatBookingLookup {
  found: boolean;
  email: string;
  bookings: ChatBookingStatus[];
  totalMatches: number;
  message?: string;
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "Pending admin approval",
  approved: "Approved",
  confirmed: "Confirmed",
  completed: "Completed",
  partial_payment: "Partially paid",
  completed_payment: "Fully paid",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const formatPeso = (n: number) => `₱${Math.round(n).toLocaleString("en-PH")}`;
