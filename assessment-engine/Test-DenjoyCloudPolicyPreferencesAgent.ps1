[CmdletBinding()]
param(
    [string]$AgentPath = "$env:ProgramData\Denjoy\CloudPolicyPreferences\Invoke-DenjoyCloudPolicyPreferences.ps1",
    [string]$TaskName = 'Denjoy Cloud Policy Preferences'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$exists = Test-Path -LiteralPath $AgentPath

if ($exists -or $task) {
    Write-Host 'Denjoy CPP agent aanwezig.'
    exit 0
}

Write-Host 'Denjoy CPP agent niet gevonden.'
exit 1
