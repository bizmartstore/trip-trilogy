import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface PolicySection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

/**
 * Parse the admin-editable policy text into sections. Supported structure:
 * - Blank lines separate blocks.
 * - A block starting with "## " uses the rest of that line as its heading.
 * - Lines starting with "- " inside a block render as bullets.
 */
export function parseCustomPolicy(raw: string): PolicySection[] {
  const sections: PolicySection[] = [];
  const blocks = raw
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    let title = "";
    const paragraphs: string[] = [];
    const bullets: string[] = [];
    for (const line of lines) {
      if (line.startsWith("## ") && !title && !paragraphs.length && !bullets.length) {
        title = line.slice(3).trim();
      } else if (line.startsWith("- ")) {
        bullets.push(line.slice(2).trim());
      } else {
        paragraphs.push(line);
      }
    }
    if (!title) title = paragraphs.shift() ?? bullets.shift() ?? "";
    if (title || paragraphs.length || bullets.length) {
      sections.push({ title, paragraphs, bullets: bullets.length ? bullets : undefined });
    }
  }
  return sections;
}

export function PolicyPage({
  eyebrow,
  title,
  intro,
  sections,
  custom,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: PolicySection[];
  /** Admin-authored content — replaces the default sections when non-empty. */
  custom?: string;
}) {
  const content = custom?.trim() ? parseCustomPolicy(custom) : sections;
  return (
    <article className="container-x pb-20 pt-32 lg:pt-40">
      <div className="mx-auto max-w-3xl">
        <Button asChild variant="ghost" className="mb-8 rounded-full">
          <Link to="/">
            <ArrowLeft className="size-4" /> Back to Nexora
          </Link>
        </Button>
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">{eyebrow}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold text-foreground sm:text-5xl">{title}</h1>
        <p className="mt-5 text-base leading-8 text-muted-foreground">{intro}</p>
        <div className="mt-12 space-y-10 border-t border-border pt-10">
          {content.map((section) => (
            <section key={section.title}>
              <h2 className="font-display text-2xl font-semibold text-foreground">{section.title}</h2>
              <div className="mt-3 space-y-3 text-sm leading-7 text-muted-foreground">
                {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets?.length ? (
                  <ul className="list-disc space-y-2 pl-5">
                    {section.bullets.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}