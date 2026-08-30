# Third-Party Notices

RastChin for VS Code includes or is derived from the third-party software
identified below. Those components remain under their own licenses, independently
of RastChin's Apache-2.0 license.

## persian-rtl-chat 9.0.0

Portions of RastChin's original implementation were built from a reviewed
snapshot of the following extension:

- Name: `persian-rtl-chat`
- Display name: `Persian RTL Chat`
- Version: `9.0.0`
- Publisher: `AmirRezaNasiri`
- Upstream repository recorded by its manifest:
  <https://github.com/AmirReza-Nasiri/persian-tools>
- Copyright: 2025 AmirReza Nasiri
- License: MIT

The provenance snapshot is retained in the source repository at
`third_party/persian-rtl-chat-9.0.0/`. Its complete MIT license text is in
`third_party/persian-rtl-chat-9.0.0/LICENSE.txt` and is also included in the
VSIX. The other provenance-only source files are excluded from the VSIX.

## Vazirmatn

The Persian UI font shipped with this extension is **Vazirmatn**:

- Project: <https://github.com/rastikerdar/vazirmatn>
- Copyright: 2015 The Vazirmatn Project Authors
- License: SIL Open Font License, Version 1.1 (OFL-1.1)
- Full license text: `media/fonts/Vazirmatn-OFL.txt`
- Bundled files:
  - `media/fonts/Vazirmatn-Regular.woff2`
  - `media/fonts/Vazirmatn-Bold.woff2`

The font and its full OFL text are included in the VSIX. Vazirmatn is loaded
locally; no font-service request is required. Code and diff surfaces continue
to use a monospace stack.

Earlier legacy builds used IRANYekan. Those files are not present in this
source tree or current package, so the current extension has no IRANYekan
runtime dependency.
