<#
.SYNOPSIS
    Denjoy IT Platform — Conditional Access engine (Fase 6)

.DESCRIPTION
    Beheert Conditional Access policies via Microsoft Graph:
    - list-policies         : alle CA policies (id, naam, staat, conditie-samenvatting)
    - get-policy            : volledige policy detail
    - enable-policy         : policy inschakelen
    - disable-policy        : policy uitschakelen
    - list-named-locations  : alle named locations (IP / country)

    Vereiste Graph API permissies (Application):
      Policy.Read.All
      Policy.ReadWrite.ConditionalAccess

    Output: logs → ##RESULT## → JSON
#>

param(
    [Parameter(Mandatory)][ValidateSet(
        'list-policies','get-policy','enable-policy','disable-policy','list-named-locations'
    )]
    [string]$Action,

    [Parameter(Mandatory)][string]$TenantId,
    [Parameter(Mandatory)][string]$ClientId,
    [string]$CertThumbprint,
    [string]$ClientSecret,
    [string]$ParamsJson = '{}',
    [switch]$DryRun
)

Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Modules\Authentication.psm1') -Force -ErrorAction Stop
$ErrorActionPreference = 'Stop'

function Format-PolicySummary {
    param($pol)
    # Gebruikers samenvatting
    $users = $pol.conditions.users
    $inclUsers = @()
    if ($users.includeUsers -contains 'All') { $inclUsers += 'Alle gebruikers' }
    elseif ($users.includeUsers) { $inclUsers += "$($users.includeUsers.Count) gebruiker(s)" }
    if ($users.includeGroups) { $inclUsers += "$($users.includeGroups.Count) groep(en)" }
    if ($users.includeRoles)  { $inclUsers += "$($users.includeRoles.Count) rol(len)" }

    # Apps samenvatting
    $apps = $pol.conditions.applications
    $inclApps = if ($apps.includeApplications -contains 'All') { 'Alle apps' }
                elseif ($apps.includeApplications -contains 'Office365') { 'Office 365' }
                elseif ($apps.includeApplications) { "$($apps.includeApplications.Count) app(s)" }
                else { '—' }

    # Grant controls
    $grant = if ($pol.grantControls) {
        $ctrls = $pol.grantControls.builtInControls -join ', '
        if ($pol.grantControls.operator) { "$($pol.grantControls.operator): $ctrls" } else { $ctrls }
    } else { 'Geen' }

    return @{
        id           = $pol.id
        displayName  = $pol.displayName
        state        = $pol.state
        createdAt    = $pol.createdDateTime
        modifiedAt   = $pol.modifiedDateTime
        userScope    = ($inclUsers -join ', ')
        appScope     = $inclApps
        grantControl = $grant
        sessionCtrl  = if ($pol.sessionControls) { 'Ja' } else { 'Nee' }
    }
}

$params = $ParamsJson | ConvertFrom-Json

try {
    $token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -CertThumbprint $CertThumbprint -ClientSecret $ClientSecret
    $base  = 'https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies'
    $selectFields = 'id,displayName,state,createdDateTime,modifiedDateTime,conditions,grantControls,sessionControls'

    $result = switch ($Action) {

        'list-policies' {
            $policies = Invoke-Graph -Token $token -Uri "$base`?`$select=$selectFields" -AllPages
            $items = $policies | ForEach-Object { Format-PolicySummary $_ }
            @{ ok=$true; policies=$items; count=$items.Count }
        }

        'get-policy' {
            $policyId = $params.policy_id
            if (-not $policyId) { throw "policy_id vereist" }
            $pol = Invoke-Graph -Token $token -Uri "$base/$policyId"
            $summary = Format-PolicySummary $pol
            $summary['conditions']  = $pol.conditions
            $summary['grantControls'] = $pol.grantControls
            $summary['sessionControls'] = $pol.sessionControls
            @{ ok=$true; policy=$summary }
        }

        'enable-policy' {
            $policyId = $params.policy_id
            if (-not $policyId) { throw "policy_id vereist" }
            if ($DryRun) {
                @{ ok=$true; dry_run=$true; message="DryRun: policy $policyId zou worden ingeschakeld" }
            } else {
                Invoke-Graph -Token $token -Method PATCH -Uri "$base/$policyId" -Body @{state='enabled'} | Out-Null
                @{ ok=$true; policy_id=$policyId; new_state='enabled' }
            }
        }

        'disable-policy' {
            $policyId = $params.policy_id
            if (-not $policyId) { throw "policy_id vereist" }
            if ($DryRun) {
                @{ ok=$true; dry_run=$true; message="DryRun: policy $policyId zou worden uitgeschakeld" }
            } else {
                Invoke-Graph -Token $token -Method PATCH -Uri "$base/$policyId" -Body @{state='disabled'} | Out-Null
                @{ ok=$true; policy_id=$policyId; new_state='disabled' }
            }
        }

        'list-named-locations' {
            $locs = Invoke-Graph -Token $token -Uri 'https://graph.microsoft.com/v1.0/identity/conditionalAccess/namedLocations' -AllPages
            $items = $locs | ForEach-Object {
                $isTrusted = $false
                if ($_.PSObject.Properties.Match('isTrusted').Count -gt 0 -and $null -ne $_.isTrusted) {
                    $isTrusted = [bool]$_.isTrusted
                }
                @{
                    id          = $_.id
                    displayName = $_.displayName
                    type        = if ($_.'@odata.type' -match 'ip') { 'ipRange' } else { 'country' }
                    isTrusted   = $isTrusted
                    detail      = if ($_.ipRanges) { "$($_.ipRanges.Count) IP-range(s)" }
                                  elseif ($_.countriesAndRegions) { "$($_.countriesAndRegions.Count) land(en)" }
                                  else { '—' }
                    createdAt   = $_.createdDateTime
                }
            }
            @{ ok=$true; locations=$items; count=$items.Count }
        }
    }

    Write-Host "##RESULT##$(ConvertTo-Json $result -Depth 10 -Compress)"
} catch {
    Write-Host "##RESULT##$(ConvertTo-Json @{ok=$false;error=$_.Exception.Message} -Compress)"
    exit 1
}
