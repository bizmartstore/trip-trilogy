import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage } from "@/components/legal/policy-page";

const description = "Understand cancellation, refund, and no-show rules for Nexora bookings in Palawan.";

export const Route = createFileRoute("/cancellation-policy")({
  head: () => ({ meta: [
    { title: "Cancellation Policy | Nexora" }, { name: "description", content: description },
    { property: "og:title", content: "Cancellation Policy | Nexora" }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: CancellationPolicy,
});

function CancellationPolicy() {
  return <PolicyPage eyebrow="Booking policies" title="Cancellation policy" intro="Cancellation terms can vary by tour, accommodation, restaurant, and provider. The policy shown on the listing at the time of booking applies to your reservation." sections={[
    { title: "Before approval", paragraphs: ["You may request cancellation while a reservation is pending. Because no provider approval has been issued, the administrator will close the request without a cancellation charge unless a listing clearly states otherwise."] },
    { title: "After approval", paragraphs: ["Contact Nexora as soon as possible and quote your booking reference. Eligibility, fees, and refund timing follow the cancellation window displayed on the booked listing."], bullets: ["Weather or safety cancellations initiated by a provider may qualify for rescheduling or a refund.", "Late cancellations and no-shows may be non-refundable.", "Third-party payment processing fees may be excluded where permitted by law."] },
    { title: "Refund timing", paragraphs: ["Approved refunds are returned to the original payment method when possible. Processing time depends on the payment provider and bank. Nexora will communicate the decision and available next steps through your selected contact method."] },
  ]} />;
}