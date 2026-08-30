# Third-party notices for the RastChin website

RastChin first-party source code is licensed under the Apache License 2.0. This
file identifies material in this application that remains subject to separate
licenses or third-party rights.

## Vazirmatn

The website bundles the Vazirmatn font in:

- `public/fonts/Vazirmatn-Variable.woff2`
- `lib/og/Vazirmatn-700.ttf`

Copyright 2015 The Vazirmatn Project Authors.

Vazirmatn is licensed under the SIL Open Font License, Version 1.1. The complete
license is preserved at `public/fonts/OFL.txt`. The Apache License does not
replace or relicense the font.

## GSAP

The production website bundles GSAP 3.15.0 under the package author's
[GSAP Standard "no charge" License](https://gsap.com/standard-license/). GSAP
is not relicensed under the RastChin Apache-2.0 license. Redistribution and
modified use remain subject to the GSAP terms.

## Other JavaScript and CSS dependencies

The application uses third-party packages including Next.js, React, Tailwind
CSS, daisyUI, Lenis, and next-themes. The Next.js build graph also installs
`sharp`/`libvips` components under Apache-2.0 and LGPL-3.0-or-later and
`caniuse-lite` data under CC-BY-4.0. The static website artifact does not
distribute the native `libvips` build package.

Each dependency remains under the license published with that package. The
root `pnpm-lock.yaml` records the exact resolved dependency graph; installed
package metadata contains the applicable license and copyright notices.

## Product names and logos

Files under `public/logos/`, product screenshots, marketplace links, and copy may
refer to third-party services solely to identify environments that RastChin can
support. Names and logos such as Chrome, Chrome Web Store, Google, YouTube,
Gmail, Gemini, Microsoft, Visual Studio Code, GitHub, ChatGPT, OpenAI, Claude,
Anthropic, Notion, Trello, Atlassian, Perplexity, DeepSeek, Qwen, and other
displayed services are trademarks of their respective owners.

Their presence does not imply sponsorship, endorsement, certification, or
ownership by Omega Do IT Solutions. No third-party trademark permission is
granted by the RastChin Apache license or trademark policy.
