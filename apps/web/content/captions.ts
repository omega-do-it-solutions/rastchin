import type { CaptionColor } from "./types";

export const captionConfig = {
  sizeDefault: "medium",
  sizes: ["small", "medium"],
  defaultColor: "#ffd400",
  colors: [
    { hex: "#ffd400", label: "زرد" },
    { hex: "#ffffff", label: "سفید" },
  ] satisfies CaptionColor[],
} as const;
