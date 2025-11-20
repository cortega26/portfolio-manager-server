<#
  Build-Last-20.ps1
  Iterate last N commits, run production build per commit, produce clean logs and a rich CSV summary.

  Usage (examples):
    pwsh scripts/Build-Last20.ps1 -Limit 20 -Branch main
    pwsh scripts/Build-Last20.ps1 -Limit 20 -Branch main -Strict -AlwaysInstall -ForceRebuild
    pwsh scripts/Build-Last20.ps1 -Limit 30 -Branch HEAD~200 -PurgeNodeModules

  Flags:
    -Strict           : Do NOT load .env files and do NOT seed %VITE_*% from index.html (except VITE_BASE).
                        Use this to reproduce "true" build breaks due to missing envs.
    -AlwaysInstall    : Run `npm ci` on every commit regardless of lock hash (slow but deterministic).
    -PurgeNodeModules : Delete node_modules before each commit (slowest, most isolated).
    -ForceRebuild     : Append `-- --force` to build script to bypass Vite caches.

  Outputs:
    build-history-logs\<sha>.txt          (colorless, install+build)
    build-history-summary.csv             (sha,date,subject,... metrics)
#>

[CmdletBinding()]
Param(
    [int]$Limit = 20,
    [string]$Branch = "HEAD",
    [switch]$Strict,
    [switch]$AlwaysInstall,
    [switch]$PurgeNodeModules,
    [switch]$ForceRebuild
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# --- Paths / outputs
$logDir = "build-history-logs"
$summary = "build-history-summary.csv"
$tmpDir = ".tmp-build-worktree"

New-Item -Path $logDir -ItemType Directory -Force | Out-Null
"sha,date,subject,parent_sha,changed_files,cmd,strict,always_install,purge_node_modules,force_rebuild,install_exit,build_exit,duration_ms,dist_files,dist_bytes,dist_fingerprint,warnings,log" |
Out-File $summary -Encoding utf8

# Clean stale worktree if exists, then create fresh
if ((git worktree list) -match [regex]::Escape($tmpDir)) { git worktree remove --force $tmpDir | Out-Null }
git worktree add -f $tmpDir $Branch | Out-Null

# ---------------- Helpers ----------------

function Remove-Ansi {
    param([Parameter(Mandatory)][string]$Text)
    $ansi = [regex]'\x1B\[[0-9;?]*[ -/]*[@-~]'
    return $ansi.Replace($Text, '')
}

function Invoke-LoggedNative {
    param(
        [Parameter(Mandatory)][string]$CommandLine,
        [Parameter(Mandatory)][string]$LogPath
    )
    # Force colorless output
    $env:NO_COLOR = "1"
    $env:FORCE_COLOR = "0"
    $env:npm_config_color = "false"
    $env:CI = "1"   # normalize some tool behaviors

    $tmpOut = [System.IO.Path]::GetTempFileName()
    $tmpErr = [System.IO.Path]::GetTempFileName()

    try {
        "[[ CMD: $CommandLine ]]" | Out-File -FilePath $LogPath -Append -Encoding utf8
        $args = "/d /s /c $CommandLine"
        $p = Start-Process -FilePath "cmd.exe" -ArgumentList $args -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $tmpOut -RedirectStandardError $tmpErr

        $out = if (Test-Path $tmpOut) { Get-Content $tmpOut -Raw } else { "" }
        $err = if (Test-Path $tmpErr) { Get-Content $tmpErr -Raw } else { "" }

        if ($out.Length) { Remove-Ansi $out | Out-File -FilePath $LogPath -Append -Encoding utf8 }
        if ($err.Length) {
            "`n[[ STDERR ]]" | Out-File -FilePath $LogPath -Append -Encoding utf8
            Remove-Ansi $err | Out-File -FilePath $LogPath -Append -Encoding utf8
        }
        return $p.ExitCode
    }
    finally {
        if (Test-Path $tmpOut) { Remove-Item $tmpOut -Force -ErrorAction SilentlyContinue }
        if (Test-Path $tmpErr) { Remove-Item $tmpErr -Force -ErrorAction SilentlyContinue }
    }
}

function Get-LockHash {
    if (Test-Path package-lock.json) { return (Get-FileHash package-lock.json -Algorithm SHA1).Hash }
    return ""
}

function Load-DotEnvFiles {
    param([string[]]$Files)
    foreach ($f in $Files) {
        if (-not (Test-Path $f)) { continue }
        foreach ($line in Get-Content $f) {
            if ($line -match '^\s*#') { continue }
            if ($line -match '^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)\s*$') {
                $name = $Matches[1]
                $val = $Matches[2].Trim()
                if ($val.Length -ge 2 -and (
                        ($val.StartsWith('"') -and $val.EndsWith('"')) -or
                        ($val.StartsWith("'") -and $val.EndsWith("'"))
                    )) { $val = $val.Substring(1, $val.Length - 2) }
                Set-Item -Path "Env:$name" -Value $val
            }
        }
    }
}

function Clear-ViteEnv {
    # Clears all VITE_* except VITE_BASE (we keep base to emulate GH Pages path)
    Get-ChildItem Env: | Where-Object { $_.Name -like 'VITE_*' -and $_.Name -ne 'VITE_BASE' } |
    ForEach-Object { Remove-Item "Env:$($_.Name)" -ErrorAction SilentlyContinue }
}

function Seed-MissingViteTokens {
    if (-not $env:VITE_BASE) { $env:VITE_BASE = "/portfolio-manager-server/" }
    if (-not (Test-Path "index.html")) { return }
    $html = Get-Content "index.html" -Raw
    $matches = [regex]::Matches($html, '%(VITE_[A-Z0-9_]+)%')
    $names = $matches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
    foreach ($name in $names) {
        if (Test-Path "Env:$name") { continue }
        if ($Strict) {
            # Strict mode: do NOT seed missing tokens (except VITE_BASE above) → will reproduce failures
            continue
        }
        switch ($name) {
            "VITE_APP_CSP" {
                Set-Item Env:VITE_APP_CSP "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src *; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self';"
            }
            default {
                Set-Item "Env:$name" ""
            }
        }
    }
}

function Get-BuildCommand {
    if (-not (Test-Path package.json)) { throw "package.json not found" }
    $pkg = Get-Content package.json -Raw | ConvertFrom-Json
    $names = if ($pkg.scripts) { $pkg.scripts.PSObject.Properties.Name } else { @() }
    $base = if ($names -contains 'verify:build') { "npm run -s verify:build" }
    elseif ($names -contains 'build') { "npm run -s build" }
    else { throw "No 'build' or 'verify:build' script in package.json" }
    if ($ForceRebuild) { return "$base -- --force" } else { return $base }
}

function Get-ChangedFilesCount {
    param([string]$Sha)
    # if first commit, diff will fail; handle gracefully
    $parent = (git rev-list --parents -n 1 $Sha).Split(' ')[1]
    if (-not $parent) { return 0 }
    $cnt = (git diff --name-only "$parent" "$Sha" | Measure-Object).Count
    return $cnt
}

function Get-DistFingerprint {
    if (-not (Test-Path dist)) { return "" }
    $lines = @()
    Get-ChildItem -Recurse -File dist | Sort-Object FullName | ForEach-Object {
        $rel = $_.FullName.Substring( (Resolve-Path "dist").Path.Length ).TrimStart('\', '/')
        $size = $_.Length
        # hash each file for robustness (heavy but accurate on small sites)
        $sha1 = (Get-FileHash $_.FullName -Algorithm SHA1).Hash
        $lines += "$rel|$size|$sha1"
    }
    $joined = [string]::Join("`n", $lines)
    if ($joined.Length -eq 0) { return "" }
    # hash the manifest of files
    return ( [System.BitConverter]::ToString( (New-Object -TypeName System.Security.Cryptography.SHA1Managed).ComputeHash([System.Text.Encoding]::UTF8.GetBytes($joined)) ).Replace("-", "") )
}

# ---------------- Main ----------------

try {
    Push-Location $tmpDir

    # Align Node if you have nvm + .nvmrc
    $hasNvm = (Get-Command nvm -ErrorAction SilentlyContinue) -ne $null
    if ( (Test-Path ".nvmrc") -and $hasNvm ) { nvm use | Out-Null }

    $commits = git rev-list --first-parent $Branch -n $Limit
    $lastLock = ""

    foreach ($sha in $commits) {
        git switch --detach $sha | Out-Null

        $date = git show -s --format=%ci $sha
        $subject = (git show -s --format=%s $sha) -replace ',', ';'
        $parentSha = (git rev-list --parents -n 1 $sha).Split(' ')[1]
        $changedCnt = Get-ChangedFilesCount -Sha $sha

        $log = "../$logDir/$sha.txt"
        "[[ COMMIT $sha | $date ]]" | Out-File -FilePath $log -Encoding utf8
        "[[ SUBJECT $subject ]]"    | Out-File -FilePath $log -Append -Encoding utf8
        "[[ STRICT=$Strict ALWAYS_INSTALL=$AlwaysInstall PURGE_NODE_MODULES=$PurgeNodeModules FORCE_REBUILD=$ForceRebuild ]]" |
        Out-File -FilePath $log -Append -Encoding utf8

        if ($PurgeNodeModules -and (Test-Path node_modules)) {
            Remove-Item -Recurse -Force node_modules
        }

        $lock = Get-LockHash
        $needsInstall = $AlwaysInstall -or (-not (Test-Path node_modules)) -or ($lock -ne $lastLock)

        $installExit = ""
        if ($needsInstall) {
            $installExit = Invoke-LoggedNative -CommandLine "npm ci" -LogPath $log
            if ($installExit -ne 0) {
                "$sha,$date,$subject,$parentSha,$changedCnt,""npm ci"",$Strict,$AlwaysInstall,$PurgeNodeModules,$ForceRebuild,$installExit,125,0,0,0,,0,$log" |
                Out-File $summary -Append -Encoding utf8
                $lastLock = $lock
                continue
            }
        }
        else {
            $installExit = 0
        }
        $lastLock = $lock

        if ($Strict) {
            Clear-ViteEnv
            # Keep only VITE_BASE to emulate GH Pages path
            if (-not $env:VITE_BASE) { $env:VITE_BASE = "/portfolio-manager-server/" }
        }
        else {
            # Lenient: load envs and seed tokens
            Load-DotEnvFiles @(".env", ".env.production", ".env.local")
            Seed-MissingViteTokens
        }

        $cmd = Get-BuildCommand

        if (Test-Path dist) { Remove-Item -Recurse -Force dist }

        $start = Get-Date
        "`n[[ BUILD START @ $($start.ToString('s')) ]]" | Out-File -FilePath $log -Append -Encoding utf8
        $buildExit = Invoke-LoggedNative -CommandLine $cmd -LogPath $log
        $end = Get-Date
        "[[ BUILD END   @ $($end.ToString('s')) ]]`n"    | Out-File -FilePath $log -Append -Encoding utf8
        $durationMs = [int]([DateTimeOffset]$end - [DateTimeOffset]$start).TotalMilliseconds

        $distFiles = 0; $distBytes = 0
        if (Test-Path dist) {
            $files = Get-ChildItem -Recurse -File dist
            $distFiles = ($files | Measure-Object).Count
            $distBytes = ($files | Measure-Object -Sum Length).Sum
        }
        $finger = Get-DistFingerprint
        $warnings = (Select-String -Path $log -Pattern '(?i)\bwarning\b' -AllMatches -ErrorAction SilentlyContinue | Measure-Object).Count

        "$sha,$date,$subject,$parentSha,$changedCnt,""$cmd"",$Strict,$AlwaysInstall,$PurgeNodeModules,$ForceRebuild,$installExit,$buildExit,$durationMs,$distFiles,$distBytes,$finger,$warnings,$log" |
        Out-File $summary -Append -Encoding utf8
    }
}
finally {
    if ( (Get-Location).Path -like "*$tmpDir" ) { Pop-Location }
    git worktree remove --force $tmpDir | Out-Null
}

Write-Host "Done. Summary: $summary  |  Logs: $logDir\"
