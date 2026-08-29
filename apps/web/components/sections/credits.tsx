import { Section, Eyebrow } from "@/components/ui/section";
import type { Dictionary } from "@/content/dictionaries/types";
import type { CreditPerson } from "@/content/types";
import { credits } from "@/content/credits";
import { ExternalLinkIcon } from "@/components/ui/icons";

function CreditCard({
  person,
  roleLabel,
  linkedinLabel,
}: {
  person: CreditPerson;
  roleLabel: string;
  linkedinLabel: string;
}) {
  return (
    <a
      data-reveal="fade-up"
      href={person.linkedinUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${linkedinLabel}: ${person.name}`}
      className="group flex min-h-36 flex-col justify-between rounded-lg border border-hairline bg-surface p-5 transition-colors hover:border-crimson/40 hover:bg-surface-2/70"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-crimson">{roleLabel}</p>
          <h3
            dir="ltr"
            className="mt-2 text-left font-display text-xl font-bold leading-tight text-text"
          >
            {person.name}
          </h3>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-hairline bg-bg/55 text-muted transition-colors group-hover:text-crimson">
          <ExternalLinkIcon className="size-5" />
        </span>
      </div>

      <span dir="ltr" className="mt-5 text-left text-sm text-muted transition-colors group-hover:text-text">
        LinkedIn
      </span>
    </a>
  );
}

export function Credits({ dict }: { dict: Dictionary }) {
  return (
    <Section
      id="credits"
      className="border-y border-hairline bg-gradient-to-b from-bg to-surface/70"
    >
      <div>
        <div data-reveal-stagger className="mx-auto max-w-3xl text-center">
          <div data-reveal>
            <Eyebrow>{dict.credits.eyebrow}</Eyebrow>
          </div>
          <h2 data-reveal className="mt-4 font-display text-3xl font-bold md:text-4xl">
            {dict.credits.title}
          </h2>
          <p data-reveal className="mt-4 text-lg text-muted text-pretty">
            {dict.credits.sub}
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {credits.map((person) => (
            <CreditCard
              key={person.id}
              person={person}
              roleLabel={
                person.role === "developer"
                  ? dict.credits.developerRole
                  : dict.credits.contributorRole
              }
              linkedinLabel={dict.credits.linkedinLabel}
            />
          ))}
        </div>
      </div>
    </Section>
  );
}
