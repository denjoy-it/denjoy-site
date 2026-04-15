<#
.SYNOPSIS
    Bootstrap installer voor Denjoy Cloud Policy Preferences agent.

.DESCRIPTION
    Downloadt de tenant-specifieke CPP agent vanuit de Denjoy backend en plaatst
    deze lokaal. Optioneel wordt ook een Scheduled Task geregistreerd zodat de
    agent periodiek opnieuw draait.

    De backend vervangt __DENJOY_AGENT_URL__ en __DENJOY_TENANT_ID__ automatisch
    in de downloadvariant van dit script.
#>

[CmdletBinding()]
param(
    [string]$AgentUrl = '__DENJOY_AGENT_URL__',
    [string]$TenantId = '__DENJOY_TENANT_ID__',
    [string]$InstallPath = "$env:ProgramData\Denjoy\CloudPolicyPreferences",
    [string]$TaskName = 'Denjoy Cloud Policy Preferences',
    [switch]$RegisterScheduledTask,
    [int]$RepeatMinutes = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}

$agentPath = Join-Path $InstallPath 'Invoke-DenjoyCloudPolicyPreferences.ps1'
Write-Host "[CPP Bootstrap] Agent downloaden voor tenant $TenantId..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $AgentUrl -OutFile $agentPath -UseBasicParsing
Write-Host "[CPP Bootstrap] Agent opgeslagen op $agentPath" -ForegroundColor Green

if ($RegisterScheduledTask) {
    $action = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$agentPath`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
    $trigger.Repetition = New-ScheduledTaskRepetitionSettings -Interval (New-TimeSpan -Minutes $RepeatMinutes) -Duration ([TimeSpan]::MaxValue)
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host "[CPP Bootstrap] Scheduled Task '$TaskName' geregistreerd." -ForegroundColor Green
}

[pscustomobject]@{
    ok = $true
    tenantId = $TenantId
    agentPath = $agentPath
    scheduledTask = [bool]$RegisterScheduledTask
}
