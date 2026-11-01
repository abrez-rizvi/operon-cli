<#
.SYNOPSIS
    Detects and cleans up temporary [DEBUG-...] instrumentation logs from the codebase.
.DESCRIPTION
    Scans the repository using git grep for tagged debugging logs (e.g., [DEBUG-a1b2]).
    Prevents temporary debug instrumentation from accidentally leaking into commits.
.PARAMETER Tag
    The debug prefix to search for. Defaults to "DEBUG-".
.PARAMETER Purge
    If specified, automatically deletes matching lines from source files. Otherwise performs a dry run.
#>
[CmdletBinding()]
param(
    [string]$Tag = "DEBUG-",
    [switch]$Purge
)

$ErrorActionPreference = "Stop"

$isGit = $false
try {
    $null = & git rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -eq 0) {
        $isGit = $true
        $repoRoot = & git rev-parse --show-toplevel 2>$null
    }
} catch {
    $isGit = $false
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "      DEBUG INSTRUMENTATION SCAN & CLEANUP        " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$rawHits = if ($isGit) {
    git grep -n -I -E "\[$Tag[a-zA-Z0-9_\-]+\]" -- ":(exclude)operon" ":(exclude).agents" ":(exclude)*.md" ":(exclude)*.ps1" ":(exclude)*.sh" 2>$null
} else {
    Get-ChildItem -Recurse -File | Where-Object { 
        $_.FullName -notmatch '[\\/]\.git' -and 
        $_.FullName -notmatch 'reference-repos' -and 
        $_.FullName -notmatch '[\\/]operon' -and 
        $_.FullName -notmatch '[\\/]\.agents' -and 
        $_.Extension -notmatch '^\.(md|ps1|sh|pptx|docx|pdf|zip|tar|gz|exe|dll|bin|png|jpg|jpeg|gif|webp|ico|mp4|webm|apk|jar|db|pbtxt)$' 
    } | Select-String -Pattern "\[$Tag[a-zA-Z0-9_\-]+\]" | ForEach-Object {
        $rel = Resolve-Path -Relative $_.Path
        "$($rel):$($_.LineNumber):$($_.Line)"
    }
}

if (-not $rawHits) {
    Write-Host "`nNo temporary debug logs detected. Clean codebase!`n" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Cyan
    exit 0
}

$fileMap = @{}
$totalHits = 0

foreach ($hit in $rawHits) {
    if ($hit -match '^([^:]+):(\d+):(.*)$') {
        $file = $matches[1]
        $lineNum = [int]$matches[2]
        $content = $matches[3].Trim()

        if (-not $fileMap.ContainsKey($file)) {
            $fileMap[$file] = @()
        }
        $fileMap[$file] += [PSCustomObject]@{
            Line = $lineNum
            Content = $content
        }
        $totalHits++
    }
}

Write-Host "`nFound $totalHits temporary debug log(s) across $($fileMap.Keys.Count) file(s):`n" -ForegroundColor Yellow

foreach ($f in $fileMap.Keys) {
    Write-Host "  File: $f" -ForegroundColor White
    foreach ($entry in $fileMap[$f]) {
        Write-Host "    L$($entry.Line): $($entry.Content)" -ForegroundColor Gray
    }
}

if ($Purge) {
    Write-Host "`nPurging debug logs..." -ForegroundColor Cyan
    foreach ($f in $fileMap.Keys) {
        $fullPath = Join-Path $repoRoot $f
        if (Test-Path $fullPath) {
            $lines = Get-Content $fullPath
            $filteredLines = $lines | Where-Object { $_ -notmatch "\[$Tag[a-zA-Z0-9_\-]+\]" }
            Set-Content -Path $fullPath -Value $filteredLines
            Write-Host "  [CLEANED] $f" -ForegroundColor Green
        }
    }
    Write-Host "`nAll temporary debug logs purged successfully!" -ForegroundColor Green
} else {
    Write-Host "`nDry-run complete. Run with -Purge to automatically remove these lines." -ForegroundColor Yellow
}

Write-Host "==================================================" -ForegroundColor Cyan
