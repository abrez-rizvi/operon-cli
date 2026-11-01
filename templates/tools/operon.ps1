<#
.SYNOPSIS
    Operon Unified CLI Dispatcher
.DESCRIPTION
    Single root entry point for all deterministic Operon host scripts.
    Usage:
        .\tools\operon.ps1 diff [ref]
        .\tools\operon.ps1 clean [-Purge]
        .\tools\operon.ps1 scan [path]
        .\tools\operon.ps1 helpers <query>
        .\tools\operon.ps1 validate
        .\tools\operon.ps1 tokens [path]
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet("diff", "clean", "scan", "helpers", "validate", "tokens", "help")]
    [string]$Command,

    [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
    [string[]]$ArgsList
)

$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $toolsDir

switch ($Command) {
    "diff" {
        if ($ArgsList -and $ArgsList.Count -gt 0) {
            & "$repoRoot\skills\ponytail\scripts\diff-metrics.ps1" @ArgsList
        } else {
            & "$repoRoot\skills\ponytail\scripts\diff-metrics.ps1"
        }
    }
    "clean" {
        if ($ArgsList -and $ArgsList.Count -gt 0) {
            & "$repoRoot\skills\systematic-debugging\scripts\clean-debug-logs.ps1" @ArgsList
        } else {
            & "$repoRoot\skills\systematic-debugging\scripts\clean-debug-logs.ps1"
        }
    }
    "scan" {
        if ($ArgsList -and $ArgsList.Count -gt 0) {
            & "$repoRoot\skills\ponytail\scripts\scan-debt.ps1" @ArgsList
        } else {
            & "$repoRoot\skills\ponytail\scripts\scan-debt.ps1"
        }
    }
    "helpers" {
        & "$repoRoot\skills\ponytail\scripts\find-helpers.ps1" @ArgsList
    }
    "validate" {
        & python "$toolsDir\validate-okf.py" "$repoRoot"
    }
    "tokens" {
        if ($ArgsList -and $ArgsList.Count -gt 0) {
            & "$toolsDir\count-tokens.ps1" @ArgsList
        } else {
            & "$toolsDir\count-tokens.ps1"
        }
    }
    "help" {
        Write-Host "Operon CLI Dispatcher:" -ForegroundColor Cyan
        Write-Host "  .\tools\operon.ps1 diff [ref]       Check LOC delta, dependency bloat & >600 LOC ceiling"
        Write-Host "  .\tools\operon.ps1 clean [-Purge]   Detect & purge temporary [DEBUG-...] instrumentation"
        Write-Host "  .\tools\operon.ps1 scan [path]      Scan for // shortcut: markers & technical debt"
        Write-Host "  .\tools\operon.ps1 helpers <query>  Search existing helpers to prevent duplication"
        Write-Host "  .\tools\operon.ps1 validate         Validate OKF conformance across Operon catalog"
        Write-Host "  .\tools\operon.ps1 tokens [path]    Audit token footprint across skills and workflows"
    }
}
