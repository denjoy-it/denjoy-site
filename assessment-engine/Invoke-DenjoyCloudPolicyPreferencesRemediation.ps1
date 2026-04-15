[CmdletBinding()]
param(
    [string]$BootstrapUrl = '__DENJOY_BOOTSTRAP_URL__',
    [string]$TenantId = '__DENJOY_TENANT_ID__',
    [string]$TempPath = "$env:TEMP\Install-DenjoyCloudPolicyPreferencesAgent.ps1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "[CPP Remediation] Bootstrap downloaden voor tenant $TenantId..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $BootstrapUrl -OutFile $TempPath -UseBasicParsing

Write-Host "[CPP Remediation] Bootstrap uitvoeren..." -ForegroundColor Cyan
pwsh -NoProfile -ExecutionPolicy Bypass -File $TempPath -RegisterScheduledTask | Out-Null

Write-Host '[CPP Remediation] Klaar.' -ForegroundColor Green
