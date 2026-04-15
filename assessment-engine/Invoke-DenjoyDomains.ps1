<#
.SYNOPSIS
    Denjoy IT Platform — Domains Analyser engine (Fase 7)

.DESCRIPTION
    Analyseert DNS-records per tenant:
    - list-domains    : alle domeinen van de tenant (via Graph)
    - analyse-domain  : SPF / DKIM / DMARC / MX / DNSSEC check + score

    Score systeem (max 100):
      SPF aanwezig        +15
      SPF hard fail (-all)+10
      DMARC aanwezig      +20
      DMARC policy=reject +15
      DMARC policy=quarantine +8
      DMARC pct=100       +5
      DKIM (M365 default) +15
      MX aanwezig         +20

    Vereiste Graph API permissies (Application):
      Domain.Read.All

    Output: logs → ##RESULT## → JSON
#>

param(
    [Parameter(Mandatory)][ValidateSet('list-domains','analyse-domain')]
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

function Resolve-Dns {
    param([string]$Name, [string]$Type)
    try {
        $r = Resolve-DnsName -Name $Name -Type $Type -ErrorAction Stop -DnsOnly
        return $r
    } catch { return $null }
}

function Get-TxtRecord {
    param([string]$Domain, [string]$Prefix='')
    $name = if ($Prefix) { "$Prefix.$Domain" } else { $Domain }
    $r = Resolve-Dns -Name $name -Type TXT
    if (-not $r) { return @() }
    return @($r | Where-Object { $_.Strings } | ForEach-Object { $_.Strings -join '' })
}

function Analyse-Domain {
    param([string]$Domain)

    $score    = 0
    $checks   = @()

    # ── MX ────────────────────────────────────────────────────────────────────
    $mx = Resolve-Dns -Name $Domain -Type MX
    $mxPresent = $mx -and $mx.Count -gt 0
    if ($mxPresent) { $score += 20 }
    $checks += @{
        name    = 'MX'
        status  = if ($mxPresent) { 'ok' } else { 'missing' }
        score   = if ($mxPresent) { 20 } else { 0 }
        maxScore = 20
        detail  = if ($mxPresent) { ($mx | Select-Object -First 3 | ForEach-Object { "$($_.NameExchange) (prio $($_.Preference))" }) -join ', ' } else { 'Geen MX record gevonden' }
    }

    # ── SPF ───────────────────────────────────────────────────────────────────
    $txtAll   = Get-TxtRecord -Domain $Domain
    $spfRec   = $txtAll | Where-Object { $_ -match '^v=spf1' } | Select-Object -First 1
    $spfPresent  = $null -ne $spfRec
    $spfHardFail = $spfRec -match '-all'
    $spfSoftFail = $spfRec -match '~all'
    if ($spfPresent)  { $score += 15 }
    if ($spfHardFail) { $score += 10 }
    $spfStatus = if (-not $spfPresent) { 'missing' } elseif ($spfHardFail) { 'ok' } elseif ($spfSoftFail) { 'warn' } else { 'warn' }
    $checks += @{
        name    = 'SPF'
        status  = $spfStatus
        score   = if ($spfPresent) { if ($spfHardFail) { 25 } else { 15 } } else { 0 }
        maxScore = 25
        detail  = if ($spfRec) { $spfRec } else { 'Geen SPF TXT record' }
        hint    = if ($spfSoftFail) { 'Gebruik -all (hard fail) in plaats van ~all' } else { $null }
    }

    # ── DMARC ─────────────────────────────────────────────────────────────────
    $dmarcRecs  = Get-TxtRecord -Domain $Domain -Prefix '_dmarc'
    $dmarcRec   = $dmarcRecs | Where-Object { $_ -match '^v=DMARC1' } | Select-Object -First 1
    $dmarcPresent = $null -ne $dmarcRec
    $dmarcPolicy  = if ($dmarcRec -match 'p=([^;]+)') { $Matches[1].Trim() } else { 'none' }
    $dmarcPct     = if ($dmarcRec -match 'pct=(\d+)') { [int]$Matches[1] } else { 100 }
    if ($dmarcPresent)                        { $score += 20 }
    if ($dmarcPolicy -eq 'reject')            { $score += 15 }
    elseif ($dmarcPolicy -eq 'quarantine')    { $score += 8  }
    if ($dmarcPct -eq 100 -and $dmarcPresent) { $score += 5  }
    $dmarcStatus = if (-not $dmarcPresent) { 'missing' }
                   elseif ($dmarcPolicy -eq 'none') { 'warn' }
                   elseif ($dmarcPolicy -eq 'quarantine') { 'warn' }
                   else { 'ok' }
    $checks += @{
        name    = 'DMARC'
        status  = $dmarcStatus
        score   = if ($dmarcPresent) { 20 + (if ($dmarcPolicy -eq 'reject') {15} elseif ($dmarcPolicy -eq 'quarantine') {8} else {0}) + (if ($dmarcPct -eq 100) {5} else {0}) } else { 0 }
        maxScore = 40
        detail  = if ($dmarcRec) { $dmarcRec } else { 'Geen DMARC TXT record' }
        policy  = $dmarcPolicy
        pct     = $dmarcPct
        hint    = if ($dmarcPolicy -eq 'none') { 'Verhoog policy naar quarantine of reject' }
                  elseif ($dmarcPolicy -eq 'quarantine') { 'Overweeg policy=reject voor maximale bescherming' }
                  else { $null }
    }

    # ── DKIM (M365 standaard selectors) ───────────────────────────────────────
    $dkimSelectors = @('selector1', 'selector2')
    $dkimFound = $false
    $dkimDetail = @()
    foreach ($sel in $dkimSelectors) {
        $dkimRec = Resolve-Dns -Name "$sel._domainkey.$Domain" -Type CNAME
        if (-not $dkimRec) { $dkimRec = Resolve-Dns -Name "$sel._domainkey.$Domain" -Type TXT }
        if ($dkimRec) {
            $dkimFound = $true
            $dkimDetail += "${sel}: aanwezig"
        } else {
            $dkimDetail += "${sel}: ontbreekt"
        }
    }
    if ($dkimFound) { $score += 15 }
    $checks += @{
        name    = 'DKIM'
        status  = if ($dkimFound) { 'ok' } else { 'missing' }
        score   = if ($dkimFound) { 15 } else { 0 }
        maxScore = 15
        detail  = $dkimDetail -join ' | '
        hint    = if (-not $dkimFound) { 'Activeer DKIM in het Microsoft 365 Defender portal' } else { $null }
    }

    # ── Score label ───────────────────────────────────────────────────────────
    $label = if ($score -ge 85) { 'Uitstekend' } elseif ($score -ge 65) { 'Goed' } elseif ($score -ge 40) { 'Matig' } else { 'Zwak' }

    return @{
        ok      = $true
        domain  = $Domain
        score   = $score
        maxScore = 100
        label   = $label
        checks  = $checks
        analysedAt = (Get-Date -Format 'o')
    }
}

$params = $ParamsJson | ConvertFrom-Json

try {
    $token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -CertThumbprint $CertThumbprint -ClientSecret $ClientSecret

    $result = switch ($Action) {

        'list-domains' {
            $domains = Invoke-Graph -Token $token -Uri 'https://graph.microsoft.com/v1.0/domains' -AllPages
            $items = $domains | ForEach-Object {
                @{
                    id              = $_.id
                    isDefault       = $_.isDefault
                    isVerified      = $_.isVerified
                    isInitial       = $_.isInitial
                    supportedServices = $_.supportedServices
                }
            }
            @{ ok=$true; domains=$items; count=$items.Count }
        }

        'analyse-domain' {
            $domain = $params.domain
            if (-not $domain) { throw "domain parameter vereist" }
            Analyse-Domain -Domain $domain
        }
    }

    Write-Host "##RESULT##$(ConvertTo-Json $result -Depth 10 -Compress)"
} catch {
    Write-Host "##RESULT##$(ConvertTo-Json @{ok=$false;error=$_.Exception.Message} -Compress)"
    exit 1
}
