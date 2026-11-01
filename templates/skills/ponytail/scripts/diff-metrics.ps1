<#
.SYNOPSIS
    Evaluates git diff metrics to verify minimal code changes and detect dependency bloat.
.DESCRIPTION
    Checks uncommitted (staged and unstaged) changes or changes against a specific git ref.
    Outputs net lines added/deleted, file blast radius, and alerts on dependency manifest changes.
.PARAMETER TargetRef
    Optional git reference to compare against (e.g., HEAD~1, main, origin/main). Defaults to working directory diff.
#>
[CmdletBinding()]
param(
    [string]$TargetRef = ""
)

$repoRoot = $null
try {
    $insideGit = & git rev-parse --is-inside-work-tree 2>$null
    if ($LASTEXITCODE -eq 0) {
        $repoRoot = (& git rev-parse --show-toplevel 2>$null).Trim()
    }
} catch {
    $repoRoot = $null
}

if (-not $repoRoot) {
    Write-Host "Notice: Not inside a git repository (or git is unavailable). Skipping diff metrics." -ForegroundColor Yellow
    exit 0
}

# Determine diff target (silencing git CRLF stderr noise)
if ($TargetRef) {
    $diffCmd = "git -c core.safecrlf=false diff --stat $TargetRef"
    $rawDiff = git -c core.safecrlf=false diff $TargetRef 2>$null
    $numstat = git -c core.safecrlf=false diff --numstat $TargetRef 2>$null
} else {
    # Working tree + staged diff
    $diffCmd = "git -c core.safecrlf=false diff HEAD --stat"
    $rawDiff = git -c core.safecrlf=false diff HEAD 2>$null
    $numstat = git -c core.safecrlf=false diff HEAD --numstat 2>$null
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "         PONYTAIL DIFF & BLAST RADIUS METRICS     " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

if (-not $numstat) {
    Write-Host "Working tree is clean. No uncommitted changes detected." -ForegroundColor Green
    exit 0
}

$totalInserted = 0
$totalDeleted = 0
$modifiedFiles = @()
$monolithFiles = @()

$depPatterns = @(
    "package\.json$", "package-lock\.json$", "pnpm-lock\.yaml$", "yarn\.lock$",
    "requirements\.txt$", "pyproject\.toml$", "Pipfile", "Pipfile\.lock$",
    "Cargo\.toml$", "Cargo\.lock$", "go\.mod$", "go\.sum$", "pom\.xml$",
    "build\.gradle.*$", "Gemfile$", "Gemfile\.lock$"
)

$depFilesChanged = @()

foreach ($line in $numstat) {
    $parts = $line -split "`t"
    if ($parts.Count -ge 3) {
        $ins = if ($parts[0] -match '^\d+$') { [int]$parts[0] } else { 0 }
        $del = if ($parts[1] -match '^\d+$') { [int]$parts[1] } else { 0 }
        $file = $parts[2]

        $totalInserted += $ins
        $totalDeleted += $del

        $totalFileLines = 0
        $filePath = Join-Path $repoRoot $file
        if (Test-Path $filePath -PathType Leaf) {
            $totalFileLines = (Get-Content $filePath -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
            if ($totalFileLines -gt 600) {
                $monolithFiles += [PSCustomObject]@{
                    File = $file
                    Lines = $totalFileLines
                }
            }
        }

        $modifiedFiles += [PSCustomObject]@{
            File = $file
            Inserted = $ins
            Deleted = $del
            Delta = ($ins - $del)
            TotalLines = if ($totalFileLines -gt 0) { $totalFileLines } else { "-" }
        }

        foreach ($pat in $depPatterns) {
            if ($file -match $pat) {
                $depFilesChanged += $file
                break
            }
        }
    }
}

$netDelta = $totalInserted - $totalDeleted
$deltaSign = if ($netDelta -ge 0) { "+$netDelta" } else { "$netDelta" }
$color = if ($netDelta -le 0) { "Green" } else { "Yellow" }

Write-Host "`nSummary:" -ForegroundColor White
Write-Host "  Files Changed: $($modifiedFiles.Count)"
Write-Host "  Lines Added:   +$totalInserted" -ForegroundColor Green
Write-Host "  Lines Deleted: -$totalDeleted" -ForegroundColor Red
Write-Host "  Net Delta:     $deltaSign" -ForegroundColor $color

if ($netDelta -le 0) {
    Write-Host "  Verdict:       LEAN WIN (Zero or negative net LOC)" -ForegroundColor Green
} else {
    Write-Host "  Verdict:       EXPANDED (Verify every added line is essential)" -ForegroundColor Yellow
}

# Dependency Bloat Check
Write-Host "`nDependency Bloat Check:" -ForegroundColor White
if ($depFilesChanged.Count -gt 0) {
    Write-Host "  [!] WARNING: Dependency manifest(s) modified:" -ForegroundColor Red
    foreach ($df in ($depFilesChanged | Select-Object -Unique)) {
        Write-Host "      - $df" -ForegroundColor Red
    }
    Write-Host "      Verify if an existing installed library or standard library could do the job." -ForegroundColor Yellow
} else {
    Write-Host "  [OK] No dependency manifests modified. Clean zero-dependency addition." -ForegroundColor Green
}

# Monolith File Check (>600 LOC ceiling)
Write-Host "`nMonolith File Check (>600 LOC Ceiling):" -ForegroundColor White
if ($monolithFiles.Count -gt 0) {
    Write-Host "  [!] WARNING: Large file(s) detected. Ponytail forbids bloated monoliths:" -ForegroundColor Red
    foreach ($mf in $monolithFiles) {
        Write-Host "      - $($mf.File) ($($mf.Lines) lines) - Exceeds 600 LOC. Decompose into focused sibling modules." -ForegroundColor Red
    }
} else {
    Write-Host "  [OK] All modified files remain under the 600 LOC modular ceiling." -ForegroundColor Green
}

# Changed Files Table
Write-Host "`nModified Files Breakdown:" -ForegroundColor White
$modifiedFiles | Format-Table -Property File, Inserted, Deleted, Delta, TotalLines -AutoSize

Write-Host "==================================================" -ForegroundColor Cyan
