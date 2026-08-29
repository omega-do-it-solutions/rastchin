import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const defaults = {
  sourceDir: "out",
  host: "",
  user: "",
  port: "",
  remotePath: "",
  secretFile: ".local-secrets/hetzner-access.md",
  knownHostsFile: ".local-secrets/known_hosts",
};

function printHelp() {
  console.log(`Usage: node scripts/deploy-hetzner.mjs [options]

Deploys the verified out/ artifact to a configured Hetzner public root over SSH.

Options:
  --source <path>          Local source directory (default: out)
  --host <host>            SSH host
  --user <user>            SSH username
  --port <port>            SSH port
  --remote-path <path>     Remote public root
  --secret-file <path>     Local ignored secret file
  --known-hosts <path>     Local known_hosts file
  --dry-run                Print rsync changes without writing to the host
  --skip-delete            Do not delete files on the host that are absent locally
  --no-verify              Skip post-deploy SSH verification
  --help, -h               Show this help

Environment overrides:
  HETZNER_HOST, HETZNER_USER, HETZNER_PORT, HETZNER_REMOTE_PATH
  HETZNER_PASSWORD, HETZNER_SSH_KEY, HETZNER_SECRET_FILE,
  HETZNER_KNOWN_HOSTS
`);
}

function fail(message) {
  console.error(`deploy failed: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = {
    sourceDir: defaults.sourceDir,
    host: process.env.HETZNER_HOST || "",
    user: process.env.HETZNER_USER || "",
    port: process.env.HETZNER_PORT || "",
    remotePath: process.env.HETZNER_REMOTE_PATH || "",
    password: process.env.HETZNER_PASSWORD || "",
    identityFile: process.env.HETZNER_SSH_KEY || "",
    secretFile: process.env.HETZNER_SECRET_FILE || defaults.secretFile,
    knownHostsFile: process.env.HETZNER_KNOWN_HOSTS || defaults.knownHostsFile,
    dryRun: false,
    delete: true,
    verify: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") {
      options.sourceDir = argv[++i] || "";
    } else if (arg === "--host") {
      options.host = argv[++i] || "";
    } else if (arg === "--user") {
      options.user = argv[++i] || "";
    } else if (arg === "--port") {
      options.port = argv[++i] || "";
    } else if (arg === "--remote-path") {
      options.remotePath = argv[++i] || "";
    } else if (arg === "--secret-file") {
      options.secretFile = argv[++i] || "";
    } else if (arg === "--known-hosts") {
      options.knownHostsFile = argv[++i] || "";
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--skip-delete") {
      options.delete = false;
    } else if (arg === "--no-verify") {
      options.verify = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      fail(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function cleanValue(value) {
  return value
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function readSecretFile(path) {
  if (!path || !existsSync(path)) return {};

  const aliases = {
    host: ["host", "server", "sshserver", "ftpserver"],
    user: ["user", "username", "login", "loginname", "sshuser", "ftpuser"],
    password: ["password", "pass", "sshpassword", "ftppassword"],
    port: ["port", "sshport"],
    remotePath: ["remotepath", "path", "publicroot", "publichtml", "webroot"],
    identityFile: ["identityfile", "sshkey", "privatekey", "keyfile"],
  };
  const aliasLookup = Object.fromEntries(
    Object.entries(aliases).flatMap(([target, keys]) => keys.map((key) => [key, target])),
  );
  const result = {};

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.replace(/^\s*[-*]\s*/, "").trim();
    const match = line.match(/^([^:=]+)\s*[:=]\s*(.+)$/);
    if (!match) continue;

    const target = aliasLookup[normalizeKey(match[1])];
    if (target && !result[target]) {
      result[target] = cleanValue(match[2]);
    }
  }

  return result;
}

function commandExists(command) {
  return spawnSync("sh", ["-c", 'command -v "$1" >/dev/null 2>&1', "sh", command], {
    stdio: "ignore",
  }).status === 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: options.env || process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim();
    fail(`${command} ${args.join(" ")} failed${detail ? `\n${detail}` : ""}`);
  }

  return result.stdout || "";
}

function ensureDeployableSource(sourceDir) {
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    fail(`source directory not found: ${sourceDir}`);
  }

  for (const requiredFile of ["index.html", "api/feedback.php"]) {
    if (!existsSync(resolve(sourceDir, requiredFile))) {
      fail(`${sourceDir} must contain ${requiredFile}`);
    }
  }
}

function ensureNoDsStore(dir) {
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      ensureNoDsStore(path);
    } else if (name === ".DS_Store") {
      fail(`remove ${path} before deploy`);
    }
  }
}

function quoteForRemote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function quoteForLocalShell(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

const options = parseArgs(process.argv.slice(2));
const secret = readSecretFile(options.secretFile);
const host = options.host || secret.host || defaults.host;
const user = options.user || secret.user || defaults.user;
const port = options.port || secret.port || defaults.port;
const remotePath = options.remotePath || secret.remotePath || defaults.remotePath;
const password = options.password || secret.password || "";
const identityFile = options.identityFile || secret.identityFile || "";
const sourceDir = resolve(options.sourceDir);
const knownHostsFile = resolve(options.knownHostsFile);

if (!host || !user || !port || !remotePath) {
  fail("host, user, port, and remote path are required through environment variables, CLI flags, or an ignored secret file");
}

if (!/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535) {
  fail("port must be an integer from 1 to 65535");
}

if (!remotePath.startsWith("/") || remotePath === "/") {
  fail("remote path must be an absolute application directory and cannot be /");
}

if (!password && !identityFile) {
  fail(`no SSH password or identity file found. Set HETZNER_PASSWORD or add password to ${options.secretFile}`);
}

ensureDeployableSource(sourceDir);
ensureNoDsStore(sourceDir);
mkdirSync(dirname(knownHostsFile), { recursive: true });

const sshArgs = [
  "ssh",
  "-p",
  String(port),
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  `UserKnownHostsFile=${knownHostsFile}`,
];

if (identityFile) {
  sshArgs.push("-i", resolve(identityFile));
}

const rsyncSshCommand = [
  "ssh",
  "-p",
  String(port),
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  `UserKnownHostsFile=${quoteForLocalShell(knownHostsFile)}`,
  ...(identityFile ? ["-i", quoteForLocalShell(resolve(identityFile))] : []),
].join(" ");

const env = { ...process.env };
let runner = "rsync";
let sshCommand = "ssh";
let sshCommandArgsPrefix = sshArgs.slice(1);

if (password) {
  if (!commandExists("sshpass")) {
    fail("sshpass is required for password-based deploy. Install it or use HETZNER_SSH_KEY.");
  }

  env.SSHPASS = password;
  runner = "sshpass";
  sshCommand = "sshpass";
  sshCommandArgsPrefix = ["-e", ...sshArgs];
}

const rsyncArgs = [
  ...(password ? ["-e", "rsync"] : []),
  "-az",
  ...(options.delete ? ["--delete"] : []),
  ...(options.dryRun ? ["--dry-run", "--itemize-changes"] : []),
  "--chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r",
  "--exclude",
  ".DS_Store",
  "-e",
  rsyncSshCommand,
  withTrailingSlash(sourceDir),
  `${user}@${host}:${withTrailingSlash(remotePath)}`,
];

console.log(`${options.dryRun ? "dry-run deploy" : "deploy"}: ${options.sourceDir} -> ${user}@${host}:${remotePath}`);
run(runner, rsyncArgs, { env });

if (options.verify && !options.dryRun) {
  const remoteCheck = [
    `test -f ${quoteForRemote(`${remotePath}/index.html`)}`,
    `test -f ${quoteForRemote(`${remotePath}/changelog/index.html`)}`,
    `test -f ${quoteForRemote(`${remotePath}/privacy/index.html`)}`,
    `test -f ${quoteForRemote(`${remotePath}/feedback/index.html`)}`,
    `php -l ${quoteForRemote(`${remotePath}/api/feedback.php`)} >/dev/null`,
  ].join(" && ");

  const sshCommandArgs = [
    ...sshCommandArgsPrefix,
    `${user}@${host}`,
    remoteCheck,
  ];
  run(sshCommand, sshCommandArgs, { env });
  console.log("remote verification passed");
}
