import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage } from "@/components/legal/policy-page";

const description = "Learn how Nexora collects, uses, protects, and shares personal information for Palawan travel bookings.";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({ meta: [
    { title: "Privacy Policy | Nexora" }, { name: "description", content: description },
    { property: "og:title", content: "Privacy Policy | Nexora" }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PrivacyPolicy,
});

function PrivacyPolicy() {
  return <PolicyPage eyebrow="Your information" title="Privacy policy" intro="Nexora uses personal information only to operate the marketplace, process reservations, support travellers, and keep the platform secure." sections={[
    { title: "Information we collect", paragraphs: ["We may collect your name, email, contact number, account profile, reservation details, communication preferences, reviews, and technical information needed to secure and improve the service."] },
    { title: "How information is used", paragraphs: ["We use information to authenticate accounts, send reservation updates, coordinate with providers, process support requests, prevent abuse, meet legal obligations, and understand platform performance."] },
    { title: "Sharing and retention", paragraphs: ["Relevant reservation details may be shared with the business fulfilling your booking. We do not sell personal information. Records are retained only as long as needed for service, accounting, dispute resolution, security, or legal requirements."] },
    { title: "Your choices", paragraphs: ["You may update notification preferences in your dashboard and request access, correction, or deletion of eligible personal information through the contact details in the footer."] },
  ]} />;
}