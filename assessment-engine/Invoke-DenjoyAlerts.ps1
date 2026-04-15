<#
.SYNOPSIS
    Denjoy IT Platform — Alerts & Audit Logs engine (Fase 8)

.DESCRIPTION
    Haalt M365 audit- en beveiligingsgegevens op:
    - list-audit-logs   : recent directory audit log (Entra ID audit events)
    - get-secure-score  : Microsoft Secure Score voor de tenant
    - list-sign-ins     : recente aanmeldpogingen (risico + locatie)

    Vereiste Graph API permissies (Application):
      AuditLog.Read.All
      SecurityEvents.Read.All  (voor Secure Score)
      Policy.Read.All

    Output: logs → ##RESULT## → JSON
#>

param(
    [Parameter(Mandatory)][ValidateSet('list-audit-logs','get-secure-score','list-sign-ins')]
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

$params = $ParamsJson | ConvertFrom-Json

try {
    $token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -CertThumbprint $CertThumbprint -ClientSecret $ClientSecret

    $result = switch ($Action) {

        'list-audit-logs' {
            $limit  = if ($params.limit) { [int]$params.limit } else { 100 }
            $filter = if ($params.filter) { "&`$filter=$($params.filter)" } else { '' }
            $auditSelect = 'id,activityDateTime,activityDisplayName,category,result,initiatedBy,targetResources'
            $uri    = "https://graph.microsoft.com/v1.0/auditLogs/directoryAudits?`$top=$limit&`$orderby=activityDateTime desc&`$select=$auditSelect$filter"
            $logs = Invoke-Graph -Token $token -Uri $uri
            $items = @($logs.value) | ForEach-Object {
                @{
                    id               = $_.id
                    activityDateTime = $_.activityDateTime
                    activityDisplayName = $_.activityDisplayName
                    category         = $_.category
                    result           = $_.result
                    initiatedBy      = if ($_.initiatedBy.user.userPrincipalName) { $_.initiatedBy.user.userPrincipalName }
                                       elseif ($_.initiatedBy.app.displayName) { $_.initiatedBy.app.displayName }
                                       else { '—' }
                    targetResources  = if ($_.targetResources) {
                                           ($_.targetResources | Select-Object -First 2 | ForEach-Object { $_.displayName }) -join ', '
                                       } else { '—' }
                }
            }
            @{ ok=$true; items=$items; count=$items.Count }
        }

        'get-secure-score' {
            $uri = 'https://graph.microsoft.com/v1.0/security/secureScores?$top=1'
            $resp = Invoke-Graph -Token $token -Uri $uri
            $score = if ($resp.value) { $resp.value[0] } else { $null }
            if (-not $score) {
                @{ ok=$true; score=$null; message='Geen Secure Score data beschikbaar' }
            } else {
                $pct = if ($score.maxScore -gt 0) { [math]::Round(($score.currentScore / $score.maxScore) * 100, 1) } else { 0 }
                # Top verbeterpunten (max 10)
                $improvements = @()
                if ($score.controlScores) {
                    $improvements = @($score.controlScores |
                        Where-Object { $_.scoreInPercentage -lt 100 } |
                        Sort-Object { $_.total - $_.scoreInPercentage } -Descending |
                        Select-Object -First 10 |
                        ForEach-Object {
                            @{
                                control     = $_.controlName
                                category    = $_.controlCategory
                                current     = [math]::Round($_.scoreInPercentage, 1)
                                description = $_.description
                            }
                        })
                }
                @{
                    ok           = $true
                    currentScore = $score.currentScore
                    maxScore     = $score.maxScore
                    percentage   = $pct
                    createdAt    = $score.createdDateTime
                    improvements = $improvements
                }
            }
        }

        'list-sign-ins' {
            $limit  = if ($params.limit) { [int]$params.limit } else { 50 }
            $signInSelect = 'id,createdDateTime,userPrincipalName,appDisplayName,ipAddress,location,riskLevelDuringSignIn,riskLevelAggregated,status'
            $uri    = "https://graph.microsoft.com/v1.0/auditLogs/signIns?`$top=$limit&`$select=$signInSelect&`$orderby=createdDateTime desc&`$filter=riskLevelDuringSignIn ne 'none' or riskLevelAggregated ne 'none'"
            try {
                $resp = Invoke-Graph -Token $token -Uri $uri
                $items = @($resp.value) | ForEach-Object {
                    @{
                        id               = $_.id
                        createdDateTime  = $_.createdDateTime
                        userPrincipalName = $_.userPrincipalName
                        appDisplayName   = $_.appDisplayName
                        ipAddress        = $_.ipAddress
                        location         = if ($_.location.city) { "$($_.location.city), $($_.location.countryOrRegion)" } else { $_.location.countryOrRegion }
                        riskLevel        = $_.riskLevelDuringSignIn
                        status           = $_.status.errorCode
                        statusDetail     = $_.status.failureReason
                    }
                }
                @{ ok=$true; items=$items; count=$items.Count }
            } catch {
                # Fallback zonder risicofilter
                $uri2 = "https://graph.microsoft.com/v1.0/auditLogs/signIns?`$top=$limit&`$orderby=createdDateTime desc"
                $resp2 = Invoke-Graph -Token $token -Uri $uri2
                $items2 = @($resp2.value) | ForEach-Object {
                    @{
                        id               = $_.id
                        createdDateTime  = $_.createdDateTime
                        userPrincipalName = $_.userPrincipalName
                        appDisplayName   = $_.appDisplayName
                        ipAddress        = $_.ipAddress
                        location         = if ($_.location.city) { "$($_.location.city), $($_.location.countryOrRegion)" } else { $_.location.countryOrRegion }
                        riskLevel        = if ($_.riskLevelDuringSignIn) { $_.riskLevelDuringSignIn } else { 'none' }
                        status           = $_.status.errorCode
                    }
                }
                @{ ok=$true; items=$items2; count=$items2.Count }
            }
        }
    }

    Write-Host "##RESULT##$(ConvertTo-Json $result -Depth 10 -Compress)"
} catch {
    Write-Host "##RESULT##$(ConvertTo-Json @{ok=$false;error=$_.Exception.Message} -Compress)"
    exit 1
}
