# Source snapshots

RastChin was consolidated as a clean source snapshot rather than by grafting
unrelated Git histories into the public monorepo. The original repositories
remain the historical record for work before consolidation.

| Application | Source branch | Imported commit |
| --- | --- | --- |
| Browser extension | `HotFix/Github` | `bfd2c23dd95cab57e4cf5f3e4cc43bf4999def68` |
| VS Code extension | `rewrite/versioned-agent-patcher` | `1119327049bae5acb83daef59f66a58187885fdb` |
| Website | `feat/refresh-supported-products` | `23d55a5c06d360daea291dbf7314faa7827a5b60` |
| Desktop integrator | `main` | `afd2cbb7815d9c6da3fbf19a8ce85de97de5c566` |

The retained OmegaForge engineering foundation came from commit
`81f964181be92e0ce31d04502fc421199f52d1a1`, tagged `v0.9.0`.

## Import policy

- Source code, tests, maintained documentation, brand assets, store material,
  and packaging inputs were imported.
- Nested `.git` directories, dependency directories, npm lockfiles, caches,
  static exports, unpacked extensions, VSIX files, desktop packages, and other
  generated artifacts were not imported.
- Obsolete private-repository decisions, internal backlogs, and historical AI
  prompt files remain recoverable from their source commits but are not part of
  the public project contract.
- The source repositories were not modified, deleted, or rewritten.
