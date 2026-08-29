# Persian RTL Chat for VS Code

Automatic RTL direction, the **IRANYekan** font, and **arrow-mirroring** — across VS Code chat, **Claude Code**, **Codex (ChatGPT for VS Code)**, **Copilot Chat**, and **Markdown Preview**. Zero manual configuration.

---

## Headline features

### Persian / RTL rendering
- **Auto-detects Persian text** and applies RTL direction per message / per paragraph
- Bundled **IRANYekan** font — no download, no external dependency
- English text untouched, keeps VS Code's default font
- Code blocks stay **LTR** even inside RTL messages
- **Directional arrows** (`→ ← ⟶ ⟵ ⇒ ⇐ ➜ ➔ ➤ ➞`) are visually mirrored inside Persian context — `File → Open Folder` reads naturally as `Open Folder ← File` in RTL flow. Logical Unicode char preserved (copy-paste and screen readers see the original character).

### Surfaces covered
| Surface | What's patched | Class used |
|---|---|---|
| **VS Code Chat / Copilot Chat** | `workbench.html` injects script targeting `.rendered-markdown` | `[dir="rtl"]` |
| **Claude Code chat (regular)** | `webview/index.css` + `webview/index.js` | `YBYrtl` |
| **Claude Code Plan Preview** | inline HTML template inside Claude Code's `extension.js` | `fa-rtl` |
| **Codex / ChatGPT for VS Code** | drops CSS/JS bundle next to `webview/index.html` | `YBYrtl` |
| **VS Code Markdown Preview** | official `markdown.previewStyles` / `previewScripts` API (no file patching) | `fa-rtl` |

All five surfaces share the same `bidi-arrow-mirror` span/CSS contract. React reconciliation loops are guarded with a `WeakMap` attempt counter (max 10 wrap attempts per node, reset every 30 seconds).

---

## Install

Drag the latest `.vsix` onto the **Extensions** panel in VS Code, or:

```bash
code --install-extension persian-rtl-chat-8.0.0.vsix
```

The extension patches the relevant files on first run and reloads VS Code once.

---

## Commands

When to use each:

| Command | Use when… |
|---|---|
| `Persian RTL: Enable` | First install / after `Disable` — applies all patches and reloads |
| `Persian RTL: Disable` | Want to remove every patch and restore originals (then reload) |
| `Persian RTL: Re-apply patches now` | **After Claude Code / Codex / Copilot got upgraded** by VS Code — re-patches without disable cycle |
| `Persian RTL: Status` | Quick check: which surfaces are currently patched |
| `Reload Window` (VS Code built-in) | Re-load EVERYTHING — covers all of the above for cosmetic-CSS changes |

**Rule of thumb**: After an extension upgrade → `Re-apply patches now`. Otherwise → just `Reload Window`.

---

## How patching works (architecture)

**Workbench layer (covers Copilot Chat + VS Code Chat):** Patches `workbench.html` to inject `persian-rtl.js`. The script targets `.rendered-markdown` (the universal class used by VS Code's chat APIs and Copilot Chat). Tags Persian paragraphs with `dir="rtl"` and font-family, wraps directional arrows.

**Claude Code regular chat:** Patches `webview/index.css` and `webview/index.js` in the Claude Code extension. Adds `@font-face` for IRANYekan and a MutationObserver that adds `.YBYrtl` to Persian message bubbles. Wraps arrows with `<span class="bidi-arrow-mirror">` (with WeakMap attempt counter to avoid React reconciliation loops).

**Claude Code Plan Preview:** Patches the HTML template inside Claude Code's `extension.js` (in-place edit using **function-callback** form of `String.prototype.replace` — string form would expand `$&` in injected JS and corrupt it; v7.2.27 had this bug, v7.2.28 fixed it; M86 regression test pins the contract).

**Codex / ChatGPT for VS Code:** Drops a CSS / JS bundle next to `webview/index.html` (under `webview/persian-rtl/`) and adds two `<link>` and `<script>` tags. CSP already allows `'self'` for script/style/font; no nonce or data-URI needed.

**Markdown Preview:** Uses the official VS Code API (`contributes.markdown.previewStyles/previewScripts`) — no file patching. Tags Persian elements with `fa-rtl` and wraps arrows with `<span class="bidi-arrow-mirror">`.

Font files are either copied next to the target webview's assets, or embedded as base64 inside CSP-restricted templates, so loading never fails because of Content-Security-Policy.

---

## Defensive engineering

Every injected script (workbench, Claude Code chat, Plan Preview, Codex, Markdown Preview) is wrapped in an outer `try/catch`. If anything ever throws, it logs to console and never crashes the host.

The patcher itself uses **function callbacks** for every `String.prototype.replace` that injects JS, so `$&`, `$1`, etc. inside the injected text are never expanded as regex backreferences. Test M86 pins this contract.

---

## Notes

- Enable / Disable requires a window reload — the extension prompts you.
- VS Code may show **"[Unsupported]"** in the title bar after patching — this is expected and harmless.
- If VS Code shows **"Your Code installation appears to be corrupt"**, run VS Code as **Administrator** once so the extension can update the integrity checksum.
- After **updating VS Code itself**, run `Persian RTL: Enable` again.
- After **updating Claude Code / Codex / Copilot Chat**, run `Persian RTL: Re-apply patches now` (or just `Reload Window`).
- The Extension Details README (shown inside the Extensions panel) is rendered in an isolated VS Code webview that does **not** load `markdown.previewStyles` or `previewScripts` from any extension — this is a VS Code architectural limit, so RTL cannot be applied there. Open a `.md` file directly and use **Ctrl+Shift+V** to see Persian content rendered with full RTL + arrow mirroring.

---

## Uninstall

Run `Persian RTL: Disable` first, reload VS Code, then remove the extension. The extension also cleans up Claude Code and Codex patches automatically when it is uninstalled.

---

## License

MIT
