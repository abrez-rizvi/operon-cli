<#
.SYNOPSIS
    Searches the codebase for existing helper functions and utilities before reinventing them.
.DESCRIPTION
    Enforces Step 2 of the Ponytail Decision Ladder ("Already in this codebase?").
    Scans utility folders and codebase declarations for existing symbols matching the query.
.PARAMETER Query
    The keyword, function name, or regex pattern to search for (e.g., "date", "slug", "retry").
.PARAMETER Broad
    If set, searches all code files rather than prioritizing helper/util directories.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Query,
    [switch]$Broad
)

$ErrorActionPreference = "Stop"

$isGit = $false
$repoRoot = $null
try {
    $null = & git rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -eq 0) {
        $isGit = $true
        $repoRoot = (& git rev-parse --show-toplevel 2>$null).Trim()
    }
} catch {
    $isGit = $false
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "      PONYTAIL CODEBASE HELPER DISCOVERY          " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Searching for existing utilities matching: '$Query'...`n" -ForegroundColor White

# 1. Search in recognized helper directories
$helperPaths = @("utils*", "lib*", "helper*", "common*", "shared*", "service*", "core*", "tools*")
$helperPathArgs = $helperPaths | ForEach-Object { ":(glob)**/$_/**" }

$declarationRegex = "(function|def|class|const|let|var|func|pub fn|fn|type|interface)\s+([a-zA-Z0-9_]*$Query[a-zA-Z0-9_]*)"

$hits = @()

if ($isGit) {
    if (-not $Broad) {
        # Targeted search in helper paths first
        $rawHelperHits = git -c core.safecrlf=false grep -n -I -i -E $declarationRegex -- $helperPaths 2>$null
        if ($rawHelperHits) {
            $hits += $rawHelperHits
        }
    }

    # If no helper-directory hits or Broad search requested, scan the whole tree
    if ($hits.Count -eq 0 -or $Broad) {
        $rawHits = git -c core.safecrlf=false grep -n -I -i -E $declarationRegex -- ":(exclude)operon" ":(exclude).agents" ":(exclude)reference-repos" 2>$null
        if ($rawHits) {
            $hits += $rawHits
        }
    }
} else {
    $rawFiles = Get-ChildItem -Recurse -File | Where-Object { 
        $_.FullName -notmatch '[\\/]\.git' -and 
        $_.FullName -notmatch 'reference-repos' -and 
        $_.FullName -notmatch '[\\/]operon' -and 
        $_.FullName -notmatch '[\\/]\.agents' -and 
        $_.Extension -notmatch '^\.(pptx|docx|pdf|zip|tar|gz|exe|dll|bin|png|jpg|jpeg|gif|webp|ico|mp4|webm|apk|jar|db|pbtxt)$' 
    }
    foreach ($file in $rawFiles) {
        $matches = Select-String -Path $file.FullName -Pattern $declarationRegex -AllMatches
        foreach ($m in $matches) {
            $rel = Resolve-Path -Relative $file.FullName
            $hits += "$($rel):$($m.LineNumber):$($m.Line.Trim())"
        }
    }
}

# Deduplicate
$uniqueHits = $hits | Select-Object -Unique

if ($uniqueHits.Count -eq 0) {
    Write-Host "No matching helper declarations found for '$Query'." -ForegroundColor Yellow
    Write-Host "Tip: Try a broader or related keyword, or run standard platform check." -ForegroundColor DarkGray
    Write-Host "==================================================" -ForegroundColor Cyan
    exit 0
}

Write-Host "Found $($uniqueHits.Count) potential match(es):`n" -ForegroundColor Green

foreach ($hit in $uniqueHits | Select-Object -First 25) {
    if ($hit -match '^([^:]+):(\d+):(.*)$') {
        $file = $matches[1]
        $lineNum = $matches[2]
        $content = $matches[3].Trim()

        Write-Host "  $file" -NoNewline -ForegroundColor Cyan
        Write-Host ":$lineNum" -ForegroundColor Gray
        Write-Host "    $content" -ForegroundColor White
    }
}

if ($uniqueHits.Count -gt 25) {
    Write-Host "`n  ... and $($uniqueHits.Count - 25) more matches." -ForegroundColor DarkGray
}

Write-Host "`nUse existing functions where possible instead of writing new code!" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan
