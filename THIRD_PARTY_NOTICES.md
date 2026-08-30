# Third-party notices

RastChin contains and interacts with third-party software, fonts, services, and
product identities. First-party RastChin source is licensed under Apache-2.0;
third-party material remains under its own terms.

## OmegaForge

The retained engineering foundation under `AGENTS.md`, `.agents/skills/`, and
`docs/ai/` originates from OmegaForge and is licensed under Apache-2.0. Its
required attribution is preserved in [`NOTICE`](NOTICE).

## Persian RTL Chat

Parts of the VS Code integration derive from Persian RTL Chat 9.0.0 by AmirReza
Nasiri under the MIT License. The vendored source and full license terms are
preserved under:

```text
apps/vscode-extension/third_party/persian-rtl-chat-9.0.0/
apps/vscode-extension/THIRD_PARTY_NOTICES.md
```

## Vazirmatn

RastChin distributes Vazirmatn font files under the SIL Open Font License 1.1.
The full terms accompany each application that distributes the font:

```text
apps/web/public/fonts/OFL.txt
apps/browser-extension/src/assets/fonts/OFL.txt
apps/vscode-extension/media/fonts/Vazirmatn-OFL.txt
apps/desktop-integrator/assets/fonts/Vazirmatn-OFL.txt
```

## Website runtime and build dependencies

The website bundles GSAP 3.15.0 under the package author's
[GSAP Standard "no charge" License](https://gsap.com/standard-license/). GSAP
is not relicensed under Apache-2.0, and anyone redistributing or modifying that
dependency must follow its separate terms.

The resolved Next.js build graph also installs `sharp`/`libvips` components
under Apache-2.0 and LGPL-3.0-or-later, and `caniuse-lite` data under CC-BY-4.0.
The current website release is a static export and does not distribute the
native `libvips` build package. Exact package versions and the other MIT, ISC,
BSD, Apache, and compatible dependency licenses are recorded in
`pnpm-lock.yaml` and their installed package metadata.

## Service and platform identities

Product names and logos used to explain compatibility—including OpenAI,
ChatGPT, Codex, Anthropic, Claude, Google, Chrome, Chromium, Microsoft, Visual
Studio Code, GitHub, Electron, browsers, operating systems, and supported
websites—belong to their respective owners. Their inclusion does not imply
affiliation, sponsorship, or endorsement.

Application-specific notices contain the detailed material shipped in each
artifact. JavaScript dependencies and their resolved versions are recorded in
`pnpm-lock.yaml` and remain subject to the licenses published by their authors.
