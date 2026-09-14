'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { TARGETS } = require('../targets/registry');
const { summarizeTargets: summarizeForPlatform } = require('./discoverySummary');

const execFileAsync = promisify(execFile);

const WINDOWS_MSIX_PRIVATE_PIPE_BLOCKED = 'نسخهٔ Microsoft Store/MSIX فعلی ChatGPT/Codex مسیر اجرای امن لازم برای پایپ خصوصی راست‌چین را ارائه نمی‌کند. این نصب شناسایی شده است، اما تا زمانی که بستهٔ رسمی App Execution Alias سازگار ارائه نکند، فعال‌سازی نمی‌شود.';

function powershellDiscoveryScript() {
    const targetJson = JSON.stringify(TARGETS.map(target => ({
        id: target.id,
        executableNames: target.executableNames,
        packagePatterns: target.packagePatterns,
        processNames: target.processNames
    })));

    return `
$ErrorActionPreference = 'SilentlyContinue'
$targets = ConvertFrom-Json @'
${targetJson}
'@
$results = @()

function Add-RastChinResult {
    param($TargetId, $Source, $Name, $Version, $Executable, $PackageFamilyName, $PackageFullName, $PackageApplicationId, $PackageExecutable, $IsRunning)
    if (-not $TargetId) { return }
    $script:results += [PSCustomObject]@{
        targetId = [string]$TargetId
        source = [string]$Source
        name = [string]$Name
        version = [string]$Version
        executable = [string]$Executable
        packageFamilyName = [string]$PackageFamilyName
        packageFullName = [string]$PackageFullName
        packageApplicationId = [string]$PackageApplicationId
        packageExecutable = [string]$PackageExecutable
        isRunning = [bool]$IsRunning
    }
}

foreach ($target in $targets) {
    $running = $false
    foreach ($processName in $target.processNames) {
        if (Get-Process -Name $processName -ErrorAction SilentlyContinue) { $running = $true; break }
    }

    $pattern = ($target.packagePatterns | ForEach-Object { [Regex]::Escape($_) }) -join '|'
    $packages = Get-AppxPackage | Where-Object {
        $_.Name -match $pattern -or $_.PackageFamilyName -match $pattern -or $_.PublisherDisplayName -match $pattern
    }

    foreach ($package in $packages) {
        $manifestPath = Join-Path $package.InstallLocation 'AppxManifest.xml'
        if (Test-Path $manifestPath) {
            try {
                [xml]$manifest = Get-Content -LiteralPath $manifestPath
                foreach ($application in @($manifest.Package.Applications.Application)) {
                    if (-not $application.Executable) { continue }
                    $packageExecutable = Join-Path $package.InstallLocation ([string]$application.Executable)
                    $packageExecutableName = [IO.Path]::GetFileName($packageExecutable)
                    if (-not (Test-Path -LiteralPath $packageExecutable)) { continue }
                    if ($target.executableNames -notcontains $packageExecutableName) { continue }

                    $aliases = @($application.SelectNodes('.//*[local-name()="ExecutionAlias"]') | ForEach-Object {
                        [string]$_.Alias
                    } | Where-Object {
                        $_ -and ($target.executableNames -contains [IO.Path]::GetFileName($_))
                    })
                    $launchAliases = @($aliases | ForEach-Object {
                        $candidate = Join-Path (Join-Path $env:LOCALAPPDATA 'Microsoft\\WindowsApps') ([IO.Path]::GetFileName($_))
                        if (Test-Path -LiteralPath $candidate) { $candidate }
                    } | Select-Object -Unique)

                    if ($launchAliases.Count -eq 0) {
                        Add-RastChinResult $target.id 'msix' $package.Name $package.Version '' $package.PackageFamilyName $package.PackageFullName $application.Id $packageExecutable $running
                    } else {
                        foreach ($launchAlias in $launchAliases) {
                            Add-RastChinResult $target.id 'msix' $package.Name $package.Version $launchAlias $package.PackageFamilyName $package.PackageFullName $application.Id $packageExecutable $running
                        }
                    }
                }
            } catch {}
        }
    }

    $candidateRoots = @(
        (Join-Path $env:LOCALAPPDATA 'Programs'),
        (Join-Path $env:LOCALAPPDATA 'Applications'),
        (Join-Path $env:ProgramFiles ''),
        (Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) '')
    ) | Where-Object { $_ -and (Test-Path $_) }

    foreach ($root in $candidateRoots) {
        foreach ($exeName in $target.executableNames) {
            $directCandidates = @(
                (Join-Path $root $exeName),
                (Join-Path (Join-Path $root ([IO.Path]::GetFileNameWithoutExtension($exeName))) $exeName),
                (Join-Path (Join-Path $root $target.id) $exeName)
            )
            if ($target.id -eq 'claude') { $directCandidates += (Join-Path (Join-Path $root 'Claude') $exeName) }
            if ($target.id -eq 'chatgpt') {
                $directCandidates += (Join-Path (Join-Path $root 'ChatGPT') $exeName)
                $directCandidates += (Join-Path (Join-Path $root 'OpenAI') $exeName)
            }
            foreach ($candidate in ($directCandidates | Select-Object -Unique)) {
                if (-not (Test-Path -LiteralPath $candidate)) { continue }
                $info = (Get-Item -LiteralPath $candidate).VersionInfo
                Add-RastChinResult $target.id 'desktop' $info.ProductName $info.ProductVersion $candidate '' '' '' '' $running
            }
        }
    }
}

$results |
    Sort-Object targetId, executable, packageFullName -Unique |
    ConvertTo-Json -Depth 5 -Compress
`;
}

function encodePowerShell(script) {
    return Buffer.from(script, 'utf16le').toString('base64');
}

function normalizeRows(raw) {
    if (!raw || !String(raw).trim()) return [];
    const parsed = JSON.parse(String(raw).trim());
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows.map(row => ({
        targetId: String(row.targetId || ''),
        source: String(row.source || 'unknown'),
        name: String(row.name || ''),
        version: String(row.version || ''),
        executable: String(row.executable || ''),
        packageFamilyName: String(row.packageFamilyName || ''),
        packageFullName: String(row.packageFullName || ''),
        packageApplicationId: String(row.packageApplicationId || ''),
        packageExecutable: String(row.packageExecutable || ''),
        isRunning: Boolean(row.isRunning)
    })).filter(row => row.targetId);
}

function summarizeTargets(rows) {
    return summarizeForPlatform(rows, 'win32').map(target => {
        const onlyBlockedMsix = target.detected
            && target.installations.every(installation => installation.source === 'msix')
            && !target.installations.some(installation => installation.executable);
        if (!onlyBlockedMsix || target.id !== 'chatgpt') return target;
        return {
            ...target,
            compatibility: 'host-blocked',
            runtimeAvailability: 'host-blocked',
            blockedReason: WINDOWS_MSIX_PRIVATE_PIPE_BLOCKED
        };
    });
}

async function discoverWindowsApps(options = {}) {
    const platform = options.platform || process.platform;
    if (platform !== 'win32') {
        return {
            platform,
            supportedPlatform: false,
            targets: summarizeTargets([]),
            diagnostics: ['Windows discovery can only run on Windows.']
        };
    }

    const exec = options.execFile || execFileAsync;
    const encoded = encodePowerShell(powershellDiscoveryScript());
    try {
        const { stdout, stderr } = await exec('powershell.exe', [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy', 'Bypass',
            '-EncodedCommand', encoded
        ], {
            windowsHide: true,
            timeout: 20000,
            maxBuffer: 4 * 1024 * 1024
        });
        const rows = normalizeRows(stdout);
        const diagnostics = [];
        if (stderr && String(stderr).trim()) diagnostics.push(String(stderr).trim());
        return { platform, supportedPlatform: true, targets: summarizeTargets(rows), diagnostics };
    } catch (error) {
        return {
            platform,
            supportedPlatform: true,
            targets: summarizeTargets([]),
            diagnostics: [`Discovery failed: ${error.message}`]
        };
    }
}

module.exports = {
    discoverWindowsApps,
    encodePowerShell,
    normalizeRows,
    powershellDiscoveryScript,
    summarizeTargets,
    WINDOWS_MSIX_PRIVATE_PIPE_BLOCKED
};
