# Hetzner deployment

The website can be deployed to a PHP-capable Hetzner host over SSH with
`rsync`. Deployment is a manual, owner-authorized operation; normal builds and
CI never contact the host.

## Build the artifact

From the repository root:

```bash
pnpm --filter @rastchin/web build
```

The deployable artifact is `apps/web/out/`. It contains the static website and
`api/feedback.php`. Generated output is ignored and must not be committed or
copied into a second `ready-to-upload` directory.

## Configure the local shell

The repository contains no host, username, port, remote path, password, or key.
Provide the deployment target explicitly in the invoking shell:

```bash
export HETZNER_HOST="your-managed-host.example"
export HETZNER_USER="your-ssh-user"
export HETZNER_PORT="your-ssh-port"
export HETZNER_REMOTE_PATH="/absolute/path/to/site-root"
export HETZNER_SSH_KEY="/absolute/path/to/private-key"
```

`HETZNER_PASSWORD` can be used instead of a key when `sshpass` is installed.
Shell history and process environments can expose passwords, so a key is the
preferred option.

As an alternative, the script can read an ignored
`.local-secrets/hetzner-access.md` file:

```text
host: your-managed-host.example
user: your-ssh-user
port: your-ssh-port
remotePath: /absolute/path/to/site-root
identityFile: /absolute/path/to/private-key
```

Set `HETZNER_SECRET_FILE` to use another ignored local path. Host keys are kept
in `.local-secrets/known_hosts` by default; `HETZNER_KNOWN_HOSTS` overrides it.

## Release flow

```bash
pnpm --filter @rastchin/web sync:release
pnpm --filter @rastchin/web deploy:hetzner:dry-run
pnpm --filter @rastchin/web deploy:hetzner
```

The release-sync command reads `apps/browser-extension` directly, updates the
website's release snapshot, and builds `out/`. The dry run connects to the host
and prints the proposed `rsync` changes without writing them. Review it before
running the real deployment.

The real command uploads `out/` with `rsync --delete`, then verifies the main
routes and runs `php -l` against the deployed endpoint. Use `--skip-delete` only
for an exceptional host-maintenance situation where preserving unrelated remote
files is intentional.

## Guardrails

- Never commit `.env`, `.local-secrets/`, passwords, private keys, or SendGrid
  configuration.
- The deploy script refuses a missing target, an invalid port, and `/` as the
  remote path.
- Deploy only `apps/web/out/`, never the repository root, source files,
  `node_modules/`, or `.next/`.
- Run the dry run first and obtain explicit owner authorization for production.
- Keep the feedback configuration outside the public document root as described
  in [feedback-endpoint.md](feedback-endpoint.md).
