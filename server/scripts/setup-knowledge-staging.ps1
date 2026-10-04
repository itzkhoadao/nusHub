param([string]$Docker = 'docker', [int]$Port = 55432)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Choose a port between 1024 and 65535.' }
$serverDirectory = Split-Path $PSScriptRoot -Parent
$privateFile = Join-Path $serverDirectory '.env.staging'
$composeFile = Join-Path $serverDirectory 'compose.knowledge-staging.yaml'
if (-not (Test-Path -LiteralPath $privateFile)) {
  $randomBytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
  $password = [Convert]::ToHexString($randomBytes).ToLowerInvariant()
  $privateContent = "STAGING_POSTGRES_PASSWORD=$password`nSTAGING_POSTGRES_PORT=$Port`nSTAGING_DATABASE_URL=postgresql://nushub_staging:$password@127.0.0.1:${Port}/nushub_knowledge_staging`n"
  [System.IO.File]::WriteAllText($privateFile, $privateContent)
  # Restrict the private staging file to its owner on Windows.
  if ($IsWindows -or $env:OS -eq 'Windows_NT') {
    $owner = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls $privateFile /inheritance:r /grant:r "${owner}:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict staging credential file permissions.' }
  }
}
$probeStart = [System.Diagnostics.ProcessStartInfo]::new()
$probeStart.FileName = $Docker
$probeStart.Arguments = 'info --format {{.ServerVersion}}'
$probeStart.UseShellExecute = $false
$probeStart.CreateNoWindow = $true
$probeStart.RedirectStandardOutput = $true
$probeStart.RedirectStandardError = $true
$probe = [System.Diagnostics.Process]::Start($probeStart)
try {
  if (-not $probe.WaitForExit(15000)) {
    $probe.Kill()
    throw 'Docker engine did not respond within 15 seconds. Check Docker Desktop engine health and retry.'
  }
  if ($probe.ExitCode -ne 0) { throw 'Docker engine is unavailable. Start Docker Desktop and retry.' }
} finally { $probe.Dispose() }
$dockerExecutable = (Get-Command $Docker -CommandType Application).Source
$stagingOriginalPath = $env:PATH
try {
  # Docker Desktop's credential helper is next to docker.exe when its directory is not on PATH.
  $env:PATH = "$(Split-Path $dockerExecutable -Parent)$([System.IO.Path]::PathSeparator)$stagingOriginalPath"
  & $Docker compose --project-name nushub-knowledge-staging --env-file $privateFile -f $composeFile up -d --wait --wait-timeout 90
  if ($LASTEXITCODE -ne 0) { throw 'Staging container startup failed. Private configuration was preserved for retry.' }
} finally { $env:PATH = $stagingOriginalPath }
Push-Location $serverDirectory
try {
  & npm run ai:staging:prepare
  if ($LASTEXITCODE -ne 0) { throw 'Staging migration or pgvector validation failed.' }
} finally { Pop-Location }
Write-Host 'Isolated staging is ready. Credentials are stored locally and were not printed.'
