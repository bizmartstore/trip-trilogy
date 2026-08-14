import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage } from "@/components/legal/policy-page";

const description = "Get help with Nexora reservations, payments, account access, and travel support across Palawan.";

export const Route = createFileRoute("/help-centre")({
  head: () => ({ meta: [
    { title: "Help Centre | Nexora Palawan" },
    { name: "description", content: description },
    { property: "og:title", content: "Help Centre | Nexora Palawan" },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: HelpCentre,
});

function HelpCentre() {
  return <PolicyPage eyebrow="Traveller support" title="How can we help?" intro="Find quick answers about booking tours, stays, and dining experiences through Nexora." sections={[
    { title: "Reservations", paragraphs: ["After you submit a reservation, it remains pending until an administrator reviews it. Your dashboard shows its latest status and any admin note."], bullets: ["Pending means your request is awaiting review.", "Approved means the provider has accepted the reservation.", "Rejected means the request could not be accommodated; review the admin note for details."] },
    { title: "Contact and follow-up", paragraphs: ["Nexora administrators maintain the current call, text, email, and office details shown in the footer and on booking confirmations. Use those details to follow up on an urgent reservation."], bullets: ["Include your booking reference when calling or texting.", "Never send passwords or full payment credentials by message."] },
    { title: "Account help", paragraphs: ["Sign in with the same email address used for your reservation to review booking history and notification preferences. If you lose access, contact support using the details in the footer."] },
  ]} />;
}