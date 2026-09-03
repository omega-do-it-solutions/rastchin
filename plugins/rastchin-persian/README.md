# RastChin Persian agent plugin

RastChin Persian is a portable skill for translating, reviewing, and localizing
application interfaces into natural modern Persian. The same
[`SKILL.md`](skills/rastchin-persian/SKILL.md) is packaged for Codex and Claude;
the vendor manifests are thin installation wrappers around that shared source.

It is deliberately a skill-only plugin. It installs no MCP server, executable,
hook, browser extension, account, or telemetry. RastChin does not receive the
text you localize. Codex or Claude may process prompts and files under the terms
and privacy controls of the provider and account you choose.

## What it does

- translates UI labels, messages, errors, onboarding, settings, and product copy;
- reviews existing Persian for literal wording, grammar, word order, typography,
  tone, and consistency;
- localizes JSON, YAML, source modules, ICU MessageFormat, HTML, and Markdown;
- preserves placeholders, code, links, markup, keys, shortcuts, paths, product
  names, and other technical tokens;
- leaves already-natural Persian alone instead of rewriting it unnecessarily.

This is not an RTL layout engine or a certified legal, medical, or literary
translation service.

## Install the plugin

The commands below work after this repository is available at its documented
public GitHub address. Restart or open a new agent session after installation.

### Codex

```bash
codex plugin marketplace add omega-do-it-solutions/rastchin
codex plugin add rastchin-persian@rastchin
```

You can also open `/plugins` in Codex CLI, select the `rastchin` marketplace,
and install **RastChin Persian**.

### Claude Code

```bash
claude plugin marketplace add omega-do-it-solutions/rastchin
claude plugin install rastchin-persian@rastchin --scope user
```

Claude Code exposes the installed skill as
`/rastchin-persian:rastchin-persian`. It can also select the skill automatically
from a natural-language localization request.

Claude Desktop can use installed plugins in supported local or SSH sessions.
Cloud and Cowork sessions require the plugin to be enabled for the user's
claude.ai account or declared for that environment. Inclusion in an official
public directory is a separate future submission and is not implied by these
source files.

## Install only the raw skill

Users who do not want a marketplace plugin can copy
`skills/rastchin-persian/` into one of these personal skill directories:

| Host | Personal skill directory |
| --- | --- |
| Codex | `~/.codex/skills/rastchin-persian/` |
| Claude Code | `~/.claude/skills/rastchin-persian/` |

Copy the whole skill directory, including `references/` and `agents/`. Do not
copy only `SKILL.md`, because structured-file and style guidance lives in those
references.

## Use it

Examples:

```text
Use $rastchin-persian to translate these checkout errors into natural Persian.
```

```text
Use $rastchin-persian to review this Persian settings page. Change only text
that is unnatural or incorrect.
```

```text
Use $rastchin-persian to localize src/locales/en.json into Persian. Preserve
every key, placeholder, value type, and ICU selector, then validate the JSON.
```

In Claude Code, the explicit slash-command form is also available:

```text
/rastchin-persian:rastchin-persian Localize these interface strings into Persian.
```

## Develop and verify

From the repository root:

```bash
pnpm verify:agent-plugin
pnpm check
```

The repository verifier checks both manifests and marketplaces, the portable
skill structure, legal files, reference links, and deterministic invariants in
the evaluation corpus. Platform-native checks are documented in
[`evals/README.md`](evals/README.md).

## License and marks

The plugin source and first-party documentation are provided under
[Apache-2.0](LICENSE), with attribution in [NOTICE](NOTICE). The license does not
grant permission to present a modified distribution as an official RastChin
release or to use RastChin marks outside the repository's
[trademark policy](https://github.com/omega-do-it-solutions/rastchin/blob/main/TRADEMARK.md).
