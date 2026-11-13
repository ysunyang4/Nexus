param(
  [ValidateSet("desktop","server","bridge","agent")]
  [string]$Mode = "desktop"
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
Set-Location $root

# Process-scoped only: cannot alter the global settings of Nexus v1.3.7.
$env:NEXUS_OPEN_SECURE_OAUTH = "1"
$env:NEXUS_OPEN_SECURE_SECRETS = "1"

if ($env:NEXUS_OAUTH_STORAGE_PATH -and -not $env:NEXUS_OAUTH_STORAGE_PATH.EndsWith(".enc")) {
  throw "Secure OAuth needs an isolated .enc path; unset NEXUS_OAUTH_STORAGE_PATH or use a new one."
}

# Only locally spawned Bridge needs its own bearer token. The Cloud Agent uses
# DPAPI-sealed device credentials and never reads the Cloudflare root or admin key.
if ($Mode -ne "agent") {
$tokenFile = Join-Path $root "apps\nexus-open-cloud\.local-bridge-token"
  if (-not (Test-Path $tokenFile)) {
    $bytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    $token = [BitConverter]::ToString($bytes).Replace("-","").ToLowerInvariant()
    [System.IO.File]::WriteAllText($tokenFile, $token, (New-Object System.Text.UTF8Encoding($false)))
  }
  $localToken = [System.IO.File]::ReadAllText($tokenFile).Trim()
  if ($localToken.Length -lt 32) { throw "Invalid local token file" }
  $env:NEXUS_BRIDGE_TOKEN = $localToken
  $env:NEXUS_LOCAL_MCP_TOKEN = $localToken
}

if ($Mode -eq "server" -or $Mode -eq "desktop") {
  if (Get-NetTCPConnection -LocalPort 18080 -State Listen -ErrorAction SilentlyContinue) {
    throw "Port 18080 already in use. Close the other Nexus version first; this launcher will not interfere."
  }
}
if ($Mode -eq "bridge" -or $Mode -eq "desktop") {
  if (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue) {
    throw "Port 8787 already in use. Close the other Nexus version first; this launcher will not interfere."
  }
}
Write-Host "Nexus v1.3.1 OPEN edition | Mode: $Mode | Secure stores: enabled"
Write-Host "Local execution tools require an explicit NEXUS_REMOTE_ALLOWED_TOOLS allowlist."

switch ($Mode) {
  "server"  { pnpm --dir apps/server start }
  "bridge"  { pnpm --dir apps/bridge start }
  "desktop" { pnpm --dir apps/desktop tauri dev }
  "agent"   { node apps/nexus-open-cloud/local/agent.mjs }
}
