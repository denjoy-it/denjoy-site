<#
.SYNOPSIS
    Denjoy Intune Guardian fetch script.

.DESCRIPTION
    Haalt de recente Guardian-events uit de Denjoy backend en toont ze als
    tabel of JSON. Bedoeld als read-only operator-script of als basis voor
    verdere export/reporting automation.
#>

[CmdletBinding()]
param(
    [ValidateSet('backend','graph-audit')]
    [string]$Action = 'backend',
    [string]$GuardianUrl = '__DENJOY_GUARDIAN_URL__',
    [string]$TenantId = '__DENJOY_TENANT_ID__',
    [string]$ClientId,
    [string]$CertThumbprint,
    [string]$ClientSecret,
    [int]$Limit = 20,
    [string]$BearerToken,
    [switch]$AsJson
)

Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Modules\Authentication.psm1') -Force -ErrorAction Stop
$ErrorActionPreference = 'Stop'

function Get-GuardianEventsFromBackend {
    param(
        [Parameter(Mandatory)][string]$Url,
        [string]$Token,
        [int]$Limit
    )
    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }
    $uri = if ($Url -match '\?') {
        '{0}&limit={1}' -f $Url, $Limit
    } else {
        '{0}?limit={1}' -f $Url, $Limit
    }
    $response = Invoke-RestMethod -Method GET -Uri $uri -Headers $headers
    return @($response.items)
}

function Get-GuardianEventsFromGraph {
    param(
        [Parameter(Mandatory)][string]$TenantId,
        [Parameter(Mandatory)][string]$ClientId,
        [string]$CertThumbprint,
        [string]$ClientSecret,
        [int]$Limit
    )

    $token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -CertThumbprint $CertThumbprint -ClientSecret $ClientSecret
    $uri = "https://graph.microsoft.com/beta/deviceManagement/auditEvents?`$top=$Limit"
    $response = Invoke-Graph -Token $token -Uri $uri
    $items = @($response.value | ForEach-Object {
        @{
            id = $_.id
            severity = if ($_.activityType -match 'delete|remove') { 'risk' } elseif ($_.activityType -match 'assign|update|patch') { 'warn' } else { 'info' }
            category = if ($_.resources[0].resourceType) { $_.resources[0].resourceType } else { 'Audit' }
            title = $_.displayName
            actor = if ($_.actor.userPrincipalName) { $_.actor.userPrincipalName } elseif ($_.actor.applicationDisplayName) { $_.actor.applicationDisplayName } else { 'Onbekend' }
            happened_at = $_.activityDateTime
            detail = $_.activityType
        }
    })
    return $items
}

Write-Host "[Guardian] Events ophalen voor tenant $TenantId..." -ForegroundColor Cyan
$items = switch ($Action) {
    'graph-audit' { Get-GuardianEventsFromGraph -TenantId $TenantId -ClientId $ClientId -CertThumbprint $CertThumbprint -ClientSecret $ClientSecret -Limit $Limit }
    default { Get-GuardianEventsFromBackend -Url $GuardianUrl -Token $BearerToken -Limit $Limit }
}

$output = @{
    ok = $true
    tenantId = $TenantId
    count = $items.Count
    items = $items
}

if ($AsJson) {
    $output | ConvertTo-Json -Depth 8
} else {
    Write-Host "[Guardian] $($items.Count) event(s) ontvangen." -ForegroundColor Green
    $items |
        Select-Object `
            @{ Name = 'When'; Expression = { $_.happened_at } }, `
            @{ Name = 'Severity'; Expression = { $_.severity } }, `
            @{ Name = 'Category'; Expression = { $_.category } }, `
            @{ Name = 'Actor'; Expression = { $_.actor } }, `
            @{ Name = 'Title'; Expression = { $_.title } } |
        Format-Table -AutoSize
}
