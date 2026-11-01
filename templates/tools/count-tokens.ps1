<#
.SYNOPSIS
    Audits token overhead and context footprint across all skills in the repository.
.DESCRIPTION
    Analyzes each skill across three key architectural tiers:
      1. Discovery / Catalog Overhead (Always in context via system prompt)
      2. Active Execution Overhead (Loaded when skill is invoked)
      3. Deep Reference Overhead (Loaded on-demand via progressive disclosure)
      4. Deterministic Scripts (0 context tokens)
#>
[CmdletBinding()]
param(
    [string]$SkillsDir = "skills"
)

$ErrorActionPreference = "Stop"

$workspaceRoot = $PSScriptRoot
if ($workspaceRoot -match '[\\/]tools$') {
    $workspaceRoot = Split-Path $workspaceRoot -Parent
}

$targetPath = Join-Path $workspaceRoot $SkillsDir

if (-not (Test-Path $targetPath)) {
    Write-Error "Skills directory not found at: $targetPath"
    exit 1
}

function Estimate-Tokens {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return 0 }
    # Standard multi-tokenizer average (Gemini/Claude/GPT-4): ~3.8 characters per token for English/Code
    return [math]::Round($Text.Length / 3.8)
}

function Extract-Frontmatter {
    param([string]$Content)
    if ($Content -match '(?s)^---\r?\n(.*?)\r?\n---') {
        return $matches[1]
    }
    return ""
}

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "                  SKILLS & WORKFLOWS TOKEN OVERHEAD AUDIT                      " -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

$skills = Get-ChildItem -Path $targetPath -Directory
$totalDiscoveryTokens = 0
$totalActiveTokens = 0
$totalReferenceTokens = 0

$rows = @()

foreach ($skill in $skills) {
    $skillMd = Join-Path $skill.FullName "SKILL.md"
    $refDir = Join-Path $skill.FullName "references"
    $scriptDir = Join-Path $skill.FullName "scripts"

    $discoveryTokens = 0
    $activeTokens = 0
    $refTokens = 0
    $scriptCount = 0

    if (Test-Path $skillMd) {
        $content = Get-Content $skillMd -Raw
        $frontmatter = Extract-Frontmatter $content
        $body = if ($frontmatter) { $content.Substring($content.IndexOf("---", 3) + 3) } else { $content }

        $discoveryTokens = Estimate-Tokens $frontmatter
        $activeTokens = Estimate-Tokens $body
    }

    if (Test-Path $refDir) {
        $refFiles = Get-ChildItem -Path $refDir -Filter "*.md"
        foreach ($rf in $refFiles) {
            $refTokens += Estimate-Tokens (Get-Content $rf.FullName -Raw)
        }
    }

    if (Test-Path $scriptDir) {
        $scriptFiles = Get-ChildItem -Path $scriptDir -File
        $scriptCount = $scriptFiles.Count
    }

    $totalDiscoveryTokens += $discoveryTokens
    $totalActiveTokens += $activeTokens
    $totalReferenceTokens += $refTokens

    $rows += [PSCustomObject]@{
        "Skill Name"        = $skill.Name
        "Discovery (Always)"= "~$discoveryTokens tok"
        "Active (On-Demand)"= "~$activeTokens tok"
        "References (Deep)" = "~$refTokens tok"
        "Scripts (0-Tok)"   = "$scriptCount script(s)"
    }
}

$rows | Format-Table -AutoSize

Write-Host "--------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host "OVERHEAD BUDGET SUMMARY:" -ForegroundColor White
Write-Host "  1. Discovery Overhead (Injected into Agent System Prompt):" -ForegroundColor White
$summaryColor = if ($totalDiscoveryTokens -le 1000) { "Green" } else { "Red" }
Write-Host "     Total: ~$totalDiscoveryTokens tokens across $($skills.Count) skill(s)" -ForegroundColor $summaryColor
Write-Host "     Target Budget: <= 60 tokens per skill (Max 1,200 tokens for 20 skills)" -ForegroundColor DarkGray

Write-Host "`n  2. Active Execution (Loaded only when activated):" -ForegroundColor White
Write-Host "     Target Budget: <= 600 - 800 tokens per skill" -ForegroundColor DarkGray

Write-Host "`n  3. Deterministic Scripts:" -ForegroundColor White
Write-Host "     Context Cost: 0 TOKENS (Executes externally, returns only 3-5 line stdout)" -ForegroundColor Green
Write-Host "================================================================================" -ForegroundColor Cyan
