<#
.SYNOPSIS
    Scans the repository for intentional 'shortcut:' debt markers and audits rot risk.
.DESCRIPTION
    Extracts markers formatted as:
      // shortcut: <known ceiling/limit>, upgrade: <trigger to revisit>
    Flags markers lacking an explicit upgrade trigger to prevent silent rot.
.PARAMETER MarkerWord
    The marker word to search for. Defaults to 'shortcut|ponytail'.
.PARAMETER ShowBlame
    Switch to query git blame for author and commit timestamp per shortcut.
#>
[CmdletBinding()]
param(
    [string]$MarkerWord = "shortcut|ponytail",
    [switch]$ShowBlame
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
Write-Host "            PONYTAIL SHORTCUT DEBT LEDGER         " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

$pattern = "(#|//|/\*|<!--|--)\s*($MarkerWord):\s*(.*)"
$rawHits = if ($isGit) {
    git -c core.safecrlf=false grep -n -I -E "(#|//|/\*|<!--|--)\s*($MarkerWord):" -- ":(exclude)operon" ":(exclude).agents" ":(exclude)reference-repos" 2>$null
} else {
    Get-ChildItem -Recurse -File | Where-Object { 
        $_.FullName -notmatch '[\\/]\.git' -and 
        $_.FullName -notmatch 'reference-repos' -and 
        $_.FullName -notmatch '[\\/]operon' -and 
        $_.FullName -notmatch '[\\/]\.agents' -and 
        $_.Extension -notmatch '^\.(pptx|docx|pdf|zip|tar|gz|exe|dll|bin|png|jpg|jpeg|gif|webp|ico|mp4|webm|apk|jar|db|pbtxt)$' 
    } | Select-String -Pattern "(#|//|/\*|<!--|--)\s*($MarkerWord):" | ForEach-Object {
        $rel = Resolve-Path -Relative $_.Path
        "$($rel):$($_.LineNumber):$($_.Line)"
    }
}

if (-not $rawHits) {
    Write-Host "`nNo shortcut debt detected. Clean ledger!`n" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Cyan
    exit 0
}

$ledger = @()
$rotRiskCount = 0

foreach ($hit in $rawHits) {
    # Match file:line:content
    if ($hit -match '^([^:]+):(\d+):(.*)$') {
        $file = $matches[1]
        $lineNum = $matches[2]
        $content = $matches[3].Trim()

        # Extract text after shortcut:
        $desc = ""
        if ($content -match '(?i)(?:shortcut|ponytail):\s*(.*)') {
            $desc = $matches[1].Trim()
        }

        # Check for upgrade path or trigger
        $hasUpgrade = $desc -match '(?i)(upgrade|trigger|when|revisit):'
        $status = if ($hasUpgrade) { "TRACKED" } else { "ROT RISK (NO TRIGGER)" }
        if (-not $hasUpgrade) { $rotRiskCount++ }

        $author = ""
        $date = ""
        if ($ShowBlame) {
            $blameLine = git blame -L "${lineNum},${lineNum}" --porcelain $file 2>$null
            if ($blameLine -match 'author (.*)') { $author = $matches[1] }
            if ($blameLine -match 'author-time (\d+)') {
                $epoch = [int64]$matches[1]
                $date = [DateTimeOffset]::FromUnixTimeSeconds($epoch).ToString("yyyy-MM-dd")
            }
        }

        $row = [PSCustomObject]@{
            Location = "${file}:${lineNum}"
            Status = $status
            Details = $desc
        }

        if ($ShowBlame) {
            $row | Add-Member -MemberType NoteProperty -Name "Author" -Value $author
            $row | Add-Member -MemberType NoteProperty -Name "Date" -Value $date
        }

        $ledger += $row
    }
}

Write-Host "`nFound $($ledger.Count) shortcut marker(s) ($rotRiskCount with rot risk):`n" -ForegroundColor White

foreach ($item in $ledger) {
    $statusColor = if ($item.Status -eq "TRACKED") { "Green" } else { "Red" }
    Write-Host "  [$($item.Status)] " -NoNewline -ForegroundColor $statusColor
    Write-Host "$($item.Location)" -ForegroundColor White
    Write-Host "      Details: $($item.Details)" -ForegroundColor Gray
    if ($ShowBlame -and $item.Author) {
        Write-Host "      By:      $($item.Author) on $($item.Date)" -ForegroundColor DarkGray
    }
    Write-Host ""
}

Write-Host "Summary:" -ForegroundColor White
Write-Host "  Total Shortcuts: $($ledger.Count)"
Write-Host "  Tracked Safely:  $($ledger.Count - $rotRiskCount)" -ForegroundColor Green
$rotColor = if ($rotRiskCount -gt 0) { "Red" } else { "Green" }
Write-Host "  Rot Risk:        $rotRiskCount" -ForegroundColor $rotColor

Write-Host "==================================================" -ForegroundColor Cyan
