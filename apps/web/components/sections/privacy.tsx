import type { Dictionary } from "@/content/dictionaries/types";
import { Section } from "@/components/ui/section";
import { PrivacyDemo } from "@/components/sections/privacy-demo";

export function Privacy({ dict }: { dict: Dictionary }) {
  return (
    <Section id="privacy">
      <PrivacyDemo privacy={dict.privacy} />
    </Section>
  );
}
