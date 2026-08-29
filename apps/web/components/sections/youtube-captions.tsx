import { Section } from "@/components/ui/section";
import type { Dictionary } from "@/content/dictionaries/types";
import { YouTubeCaptionsDemo } from "@/components/sections/youtube-captions-demo";

export function YouTubeCaptions({ dict }: { dict: Dictionary }) {
  return (
    <Section id="youtube">
      <YouTubeCaptionsDemo labels={dict.youtube} />
    </Section>
  );
}
