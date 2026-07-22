param(
    [string]$Version = '0.1.2'
)

$ErrorActionPreference = 'Stop'

$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $repo
try {
    & npm.cmd run desktop:build-worker
    if ($LASTEXITCODE -ne 0) { throw "Desktop worker build failed with exit code $LASTEXITCODE." }
    $publish = Join-Path $repo 'artifacts\MyJobFinder-windows-x64'
    if (Test-Path $publish) { Remove-Item -LiteralPath $publish -Recurse -Force }
    & dotnet publish 'apps\windows\MyJobFinder\MyJobFinder.csproj' `
        -c Release `
        -r win-x64 `
        --self-contained true `
        -p:Platform=x64 `
        -p:WindowsAppSDKSelfContained=true `
        -p:Version=$Version `
        -p:AssemblyVersion="$Version.0" `
        -p:FileVersion="$Version.0" `
        -o $publish
    if ($LASTEXITCODE -ne 0) { throw "Windows publish failed with exit code $LASTEXITCODE." }

    $engine = Join-Path $publish 'engine'
    New-Item -ItemType Directory -Force -Path (Join-Path $engine 'dist') | Out-Null
    Copy-Item -LiteralPath 'package.json' -Destination $engine
    Copy-Item -LiteralPath 'package-lock.json' -Destination $engine
    Copy-Item -Path 'dist\*' -Destination (Join-Path $engine 'dist') -Recurse
    Copy-Item -LiteralPath (Get-Command node.exe).Source -Destination (Join-Path $engine 'node.exe')
    Push-Location $engine
    try {
        & npm.cmd install --omit=dev --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "Worker dependency install failed with exit code $LASTEXITCODE." }
        $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $engine 'ms-playwright'
        & npx.cmd playwright install --only-shell chromium
        if ($LASTEXITCODE -ne 0) { throw "Bundled PDF browser install failed with exit code $LASTEXITCODE." }
    } finally { Pop-Location }
    Write-Host "Built $publish"
} finally {
    Pop-Location
}
