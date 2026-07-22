param(
    [string]$Version = '0.1.0',
    [switch]$SkipAppBuild
)

$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$release = Join-Path $repo 'artifacts\MyJobFinder-windows-x64'
$installerScript = Join-Path $PSScriptRoot 'installer\MyJobFinder.iss'
$output = Join-Path $repo 'artifacts'

if (-not $SkipAppBuild) {
    & (Join-Path $PSScriptRoot 'build-release.ps1') -Version $Version
    if ($LASTEXITCODE -ne 0) { throw "Application release build failed with exit code $LASTEXITCODE." }
}

if (-not (Test-Path (Join-Path $release 'MyJobFinder.exe'))) {
    throw "The Windows release folder is missing. Run apps\windows\build-release.ps1 first."
}

$compilerCandidates = @(
    (Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
) | Where-Object { $_ -and (Test-Path $_) }
$compiler = $compilerCandidates | Select-Object -First 1

if (-not $compiler) {
    throw "Inno Setup 6 is required. Install it with: winget install --id JRSoftware.InnoSetup --exact"
}

New-Item -ItemType Directory -Force -Path $output | Out-Null
& $compiler `
    "/DAppVersion=$Version" `
    "/DSourceDir=$release" `
    "/DOutputDir=$output" `
    $installerScript
if ($LASTEXITCODE -ne 0) { throw "Installer compilation failed with exit code $LASTEXITCODE." }

$installer = Join-Path $output 'MyJobFinder-Setup.exe'
if (-not (Test-Path $installer)) { throw "Installer output was not created at $installer." }
Write-Host "Built $installer"
