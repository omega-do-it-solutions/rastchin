'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(root, '../..');
const required = [
    'package.json', 'LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md', 'README.md',
    'docs/WINDOWS-SMOKE.md',
    'docs/MACOS-SMOKE.md', 'docs/LINUX-SMOKE.md',
    'assets/icon.png', 'assets/fonts/Vazirmatn-Regular.woff2',
    'assets/fonts/Vazirmatn-Bold.woff2', 'assets/fonts/Vazirmatn-OFL.txt',
    'assets/targets/chatgpt.png', 'assets/targets/claude.png',
    'src/main/index.js', 'src/main/preload.js', 'src/main/buildPolicy.js',
    'src/main/services/windowsDiscovery.js',
    'src/main/services/macDiscovery.js', 'src/main/services/linuxDiscovery.js',
    'src/main/services/platformDiscovery.js', 'src/main/services/discoverySummary.js',
    'src/main/services/macTrust.js', 'src/main/services/linuxTrust.js',
    'src/main/services/runtime/experimentalRuntime.js',
    'src/injected/core/rtl-engine.js', 'src/injected/core/auto-direction.js',
    'src/injected/platforms/desktop-fallback-rtl.js',
    'src/injected/platforms/chatgpt-rtl.js',
    'src/injected/platforms/codex-question-card-rtl.js',
    'src/injected/platforms/claude-rtl.js',
    'src/renderer/index.html', 'src/renderer/app.js', 'src/renderer/styles.css'
];
const requiredRepositoryFiles = [
    'LICENSE', 'NOTICE', 'TRADEMARK.md',
    '.github/workflows/ci.yml',
    '.github/workflows/package-desktop.yml',
    '.github/workflows/release-desktop-macos.yml',
    '.github/workflows/release-github.yml'
];

const failures = [];
for (const relative of required) {
    if (!fs.existsSync(path.join(root, relative))) failures.push(`Missing ${relative}`);
}
for (const relative of requiredRepositoryFiles) {
    if (!fs.existsSync(path.join(repositoryRoot, relative))) {
        failures.push(`Missing repository file ${relative}`);
    }
}

const discovery = fs.readFileSync(path.join(root, 'src/main/services/windowsDiscovery.js'), 'utf8');
for (const forbidden of ['Remove-AppxPackage', 'Set-Content', 'Add-Content', 'Remove-Item', 'takeown.exe', 'icacls.exe']) {
    if (discovery.includes(forbidden)) failures.push(`Windows discovery contains forbidden mutation: ${forbidden}`);
}

for (const relative of ['src/main/services/macDiscovery.js', 'src/main/services/linuxDiscovery.js']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const forbidden of ['writeFile', 'unlink', 'chmod', 'chown', 'rmSync']) {
        if (source.includes(forbidden)) failures.push(`${relative} contains forbidden mutation: ${forbidden}`);
    }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (packageJson.private !== true) failures.push('The desktop application package must remain private.');
if (packageJson.license !== 'Apache-2.0') failures.push('package.json must declare Apache-2.0.');
if (packageJson.repository?.url !== 'git+https://github.com/omega-do-it-solutions/rastchin.git'
    || packageJson.repository?.directory !== 'apps/desktop-integrator') {
    failures.push('package.json must point to the desktop directory in the public monorepo.');
}
if (packageJson.engines?.node !== '>=24.18.1 <25') {
    failures.push('Desktop development must remain on the approved Node.js 24 line.');
}
for (const script of ['test', 'verify', 'package:win', 'package:mac', 'package:mac:release', 'package:linux']) {
    if (!packageJson.scripts?.[script]) failures.push(`Required script is missing: ${script}`);
}
for (const legalFile of ['LICENSE', 'NOTICE', 'THIRD_PARTY_NOTICES.md']) {
    if (!packageJson.build?.files?.includes(legalFile)) {
        failures.push(`Packaged applications must include ${legalFile}.`);
    }
}
if (packageJson.build?.win?.icon !== 'assets/icon.png') failures.push('Windows package icon is not configured.');
if (packageJson.build?.mac?.icon !== 'assets/icon.png') failures.push('macOS package icon is not configured.');
if (packageJson.build?.linux?.icon !== 'assets/icon.png') failures.push('Linux package icon is not configured.');
if (packageJson.desktopName !== 'rastchin-desktop-integrator') {
    failures.push('Linux desktopName must be a stable application id.');
}
if (packageJson.build?.linux?.syncDesktopName !== true) {
    failures.push('Linux packages must synchronize the desktop file name with Electron app_id.');
}
if (!String(packageJson.build?.linux?.maintainer || '').includes('@')) {
    failures.push('Linux package maintainer metadata must include a contact email.');
}
if (!packageJson.scripts?.['package:mac:release']?.includes('forceCodeSigning=true')
    || !packageJson.scripts?.['package:mac:release']?.includes('notarize=true')) {
    failures.push('macOS release packaging must require signing and notarization.');
}
const macPreviewScript = packageJson.scripts?.['package:mac'] || '';
if (!macPreviewScript.includes('mac.identity=-')
    || !macPreviewScript.includes('mac.hardenedRuntime=false')) {
    failures.push('macOS ad-hoc packaging must use a launchable signature without hardened runtime.');
}
if (packageJson.scripts?.['package:mac:release']?.includes('mac.identity=-')
    || packageJson.scripts?.['package:mac:release']?.includes('mac.hardenedRuntime=false')) {
    failures.push('macOS release packaging must not inherit ad-hoc signing options.');
}
for (const script of ['package:win', 'package:mac', 'package:mac:release', 'package:linux']) {
    if (!packageJson.scripts?.[script]?.includes('--publish never')) {
        failures.push(`${script} must disable electron-builder implicit CI publishing.`);
    }
}
const desktopWorkflowPath = path.join(repositoryRoot, '.github/workflows/package-desktop.yml');
const desktopWorkflow = fs.existsSync(desktopWorkflowPath)
    ? fs.readFileSync(desktopWorkflowPath, 'utf8')
    : '';
if (!desktopWorkflow.includes('codesign --verify --deep --strict')
    || !desktopWorkflow.includes('hdiutil attach')
    || !desktopWorkflow.includes('Signature=adhoc')) {
    failures.push('macOS ad-hoc workflow must verify the app bundle and the app inside each DMG.');
}
if (!desktopWorkflow.includes('pnpm install --frozen-lockfile')
    || desktopWorkflow.includes('npm ci')
    || desktopWorkflow.includes('npm run')) {
    failures.push('Desktop packaging workflow must use the frozen pnpm workspace.');
}
for (const marker of [
    'push:', 'branches: [main]', 'workflow_dispatch:',
    '"apps/desktop-integrator/**"',
    'windows:', 'runs-on: windows-2022', 'package:win',
    'name: rastchin-desktop-windows',
    'macos:', 'runs-on: macos-14', 'package:mac',
    'name: rastchin-desktop-macos-adhoc',
    'linux:', 'runs-on: ubuntu-24.04', 'package:linux',
    'name: rastchin-desktop-linux'
]) {
    if (!desktopWorkflow.includes(marker)) {
        failures.push(`Desktop packaging workflow is missing required cross-platform control: ${marker}`);
    }
}
const signedWorkflowPath = path.join(repositoryRoot, '.github/workflows/release-desktop-macos.yml');
const signedWorkflow = fs.existsSync(signedWorkflowPath)
    ? fs.readFileSync(signedWorkflowPath, 'utf8')
    : '';
for (const marker of [
    'MACOS_CSC_LINK', 'MACOS_CSC_KEY_PASSWORD', 'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID', 'package:mac:release',
    'codesign --verify --deep --strict', 'xcrun stapler validate'
]) {
    if (!signedWorkflow.includes(marker)) {
        failures.push(`Signed macOS workflow is missing required control: ${marker}`);
    }
}
const githubReleaseWorkflowPath = path.join(repositoryRoot, '.github/workflows/release-github.yml');
const githubReleaseWorkflow = fs.existsSync(githubReleaseWorkflowPath)
    ? fs.readFileSync(githubReleaseWorkflowPath, 'utf8')
    : '';
const macReleaseJob = githubReleaseWorkflow.match(/\n  desktop-macos:\n([\s\S]*?)\n  desktop-linux:/)?.[1] || '';
const macReleaseJobHeader = macReleaseJob.split('\n    steps:\n', 1)[0];
for (const marker of [
    "if: env.MACOS_RELEASE_MODE == 'ad-hoc'",
    'CSC_IDENTITY_AUTO_DISCOVERY: "false"',
    "if: env.MACOS_RELEASE_MODE == 'signed'",
    'CSC_LINK: ${{ secrets.MACOS_CSC_LINK }}',
    'pnpm --filter rastchin-desktop-integrator package:mac:release'
]) {
    if (!macReleaseJob.includes(marker)) {
        failures.push(`GitHub macOS release job is missing required mode isolation: ${marker}`);
    }
}
for (const secretName of [
    'CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'
]) {
    if (macReleaseJobHeader.includes(`${secretName}:`)) {
        failures.push(`GitHub macOS release job must not expose ${secretName} to ad-hoc steps.`);
    }
}
const bakedPolicy = packageJson.build?.extraMetadata?.rastchinBuild;
if (!['preview', 'stable'].includes(bakedPolicy?.channel)) {
    failures.push('Packaged builds must declare a preview or stable RastChin channel.');
}
if (bakedPolicy?.channel === 'preview' && bakedPolicy.runtimeInjectionEnabled !== true) {
    failures.push('Preview package does not enable runtime integration.');
}
if (bakedPolicy?.channel === 'stable' && bakedPolicy.runtimeInjectionEnabled !== true) {
    failures.push('Stable package does not enable runtime integration.');
}
const shippedPlatforms = bakedPolicy?.runtimeInjectionPlatforms || [];
for (const platform of ['win32', 'darwin', 'linux']) {
    if (!shippedPlatforms.includes(platform)) failures.push(`Packaged runtime does not allow ${platform}.`);
}
const installerName = packageJson.build?.nsis?.artifactName;
const portableName = packageJson.build?.portable?.artifactName;
if (!installerName || !portableName || installerName === portableName) {
    failures.push('Installer and portable artifacts must have distinct names.');
}
if (!installerName?.includes('Setup') || !portableName?.includes('Portable')) {
    failures.push('Windows artifact names must identify Setup and Portable builds.');
}
const macName = packageJson.build?.mac?.artifactName || '';
if (!macName.includes('macOS') || !macName.includes('${arch}')) {
    failures.push('macOS artifact names must identify platform and architecture.');
}
const linuxName = packageJson.build?.linux?.artifactName || '';
if (!linuxName.includes('Linux') || !linuxName.includes('${arch}')) {
    failures.push('Linux artifact names must identify platform and architecture.');
}
for (const target of ['AppImage', 'deb', 'rpm']) {
    if (!packageJson.build?.linux?.target?.includes(target)) failures.push(`Linux target is missing: ${target}`);
}

const fontLicense = fs.readFileSync(path.join(root, 'assets/fonts/Vazirmatn-OFL.txt'), 'utf8');
if (!/SIL OPEN FONT LICENSE/i.test(fontLicense)) failures.push('Vazirmatn OFL text is invalid.');

const applicationLicense = fs.readFileSync(path.join(root, 'LICENSE'));
const repositoryLicense = fs.readFileSync(path.join(repositoryRoot, 'LICENSE'));
if (!applicationLicense.equals(repositoryLicense)) {
    failures.push('Desktop LICENSE must exactly match the repository Apache-2.0 license.');
}

if (failures.length) {
    failures.forEach(failure => console.error(`FAIL: ${failure}`));
    process.exit(1);
}

console.log(`Verified ${required.length + requiredRepositoryFiles.length} required files and fail-closed cross-platform safety rules.`);
