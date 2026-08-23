import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PolicyPage } from "@/components/legal/policy-page";
import { fetchSettings } from "@/lib/api";

const description = "Review the terms governing accounts, reservations, payments, and acceptable use of Nexora.";

export const Route = createFileRoute("/terms-of-service")({
  head: () => ({ meta: [
    { title: "Terms of Service | Nexora" }, { name: "description", content: description },
    { property: "og:title", content: "Terms of Service | Nexora" }, { property: "og:description", content: description },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: TermsOfService,
});

function TermsOfService() {
  const { data: settings } = useQuery({ queryKey: ["hub-settings"], queryFn: fetchSettings });
  return <PolicyPage eyebrow="Marketplace agreement" title="Terms of service" intro="By using Nexora, you agree to these terms and to the specific conditions shown by each travel, accommodation, or dining provider." custom={settings?.policyTerms} sections={[
    { title: "Marketplace role", paragraphs: ["Nexora helps travellers discover and request services from independent businesses. Providers remain responsible for the accuracy, availability, safety, and delivery of their listings, subject to applicable law."] },
    { title: "Accounts and reservations", paragraphs: ["You must provide accurate information and safeguard access to your account. A submitted reservation is a request until it is approved. Prices, inclusions, schedules, guest limits, and cancellation terms shown at booking form part of the reservation."] },
    { title: "Acceptable use", paragraphs: ["You may not misuse the platform, impersonate others, submit fraudulent reservations or reviews, interfere with security, scrape protected information, or use Nexora for unlawful activity."] },
    { title: "Changes and disputes", paragraphs: ["We may update these terms as the service evolves. Material changes will be presented through the platform where appropriate. Contact Nexora first so booking concerns can be reviewed with the relevant provider."] },
  ]} />;
}