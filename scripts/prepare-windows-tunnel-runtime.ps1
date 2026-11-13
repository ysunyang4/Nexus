# Downloads a pinned upstream tunnel-client runtime for repeatable Windows installer builds.
# No private machine paths or credentials are included in the published repository.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = 'v0.0.14'
$name = 'tunnel-client-runtime-cloudflared-v0.0.14-windows-amd64.zip'
$downloadUrl = "https://github.com/openai/tunnel-client/releases/download/$version/$name"
$expectedSha256 = 'b225e23bdb3dc33b41ac1e7bd3197b5c9d628508880bee643c1682cd69ee7f9c'
$tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("nexus-tunnel-" + [Guid]::NewGuid().ToString('N'))
$archive = Join-Path $tempDir $name
$extractDir = Join-Path $tempDir 'unpacked'
$destination = Join-Path $repoRoot 'apps/desktop/src-tauri/resources/tunnel'
$required = @('tunnel-client-runtime-cloudflared.exe', 'cloudflared.exe', 'LICENSE')

try {
  New-Item -ItemType Directory -Path $tempDir, $extractDir -Force | Out-Null
  Write-Host "Downloading pinned upstream tunnel runtime $version"
  Invoke-WebRequest -Uri $downloadUrl -OutFile $archive -MaximumRedirection 10
  $actual = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $expectedSha256) {
    throw "Tunnel archive SHA256 mismatch; refusing unsigned or modified release contents."
  }
  Expand-Archive -LiteralPath $archive -DestinationPath $extractDir -Force
  $contents = @(Get-ChildItem -Path $extractDir -Recurse -File)
  foreach ($filename in $required) {
    if (-not @($contents | Where-Object { $_.Name -ceq $filename }).Count) {
      throw "Required tunnel runtime component absent from archive: $filename"
    }
  }
  New-Item -ItemType Directory -Path $destination -Force | Out-Null
  foreach ($file in $contents) {
    if ($file.Name -match '^[A-Za-z0-9._-]+$') {
      Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $destination $file.Name) -Force
    }
  }
  foreach ($filename in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $destination $filename) -PathType Leaf)) {
      throw "Verified tunnel component missing from package destination: $filename"
    }
  }
  Write-Host 'Verified upstream tunnel runtime and license are staged for Tauri packaging.'
} finally {
  Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
}
