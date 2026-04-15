<#
.SYNOPSIS
    Denjoy IT Platform — Zero Trust Assessment Engine
.DESCRIPTION
    Wrapper rond de officiële Microsoft ZeroTrustAssessment PowerShell-module.
    Actions: get-status | install-module | run | get-results
    Uitvoer: logs gevolgd door ##RESULT## en een JSON-object.
.PARAMETER Action
    get-status | run | get-results
.PARAMETER TenantId
    Tenant GUID of .onmicrosoft.com domein
.PARAMETER ClientId
    App-registratie Client ID
.PARAMETER CertThumbprint
    Certificaat thumbprint voor app-gebaseerde authenticatie
.PARAMETER OutputFolder
    Map waar het rapport wordt opgeslagen (default: temp)
.PARAMETER ForceInteractive
    Forceert interactieve browser-login en negeert app-cert authenticatie.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("get-status", "install-module", "run", "get-results")]
    [string]$Action,

    [Parameter(Mandatory = $false)]
    [string]$TenantId,

    [Parameter(Mandatory = $false)]
    [string]$ClientId,

    [Parameter(Mandatory = $false)]
    [string]$CertThumbprint,

    [Parameter(Mandatory = $false)]
    [string]$OutputFolder = "",

    [Parameter(Mandatory = $false)]
    [switch]$ForceInteractive
)

$ErrorActionPreference = "Stop"
$script:LogLines = [System.Collections.Generic.List[string]]::new()

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $line = "[$Level] $Message"
    Write-Host $line
    $script:LogLines.Add($line) | Out-Null
}

function Write-Result {
    param([hashtable]$Data)
    $json = $Data | ConvertTo-Json -Depth 10 -Compress
    Write-Host "##RESULT##$json"
}

# ── Detect module ──────────────────────────────────────────────────────────────
function Get-ZtModuleInfo {
    $mod = Get-Module -ListAvailable -Name ZeroTrustAssessment -ErrorAction SilentlyContinue |
           Sort-Object Version -Descending | Select-Object -First 1
    if ($mod) {
        return @{ installed = $true; version = [string]$mod.Version; path = [string]$mod.ModuleBase }
    }
    return @{ installed = $false; version = $null; path = $null }
}

function Ensure-ZtModule {
    $modInfo = Get-ZtModuleInfo
    if ($modInfo.installed) {
        Write-Log "ZeroTrustAssessment module al aanwezig (v$($modInfo.version))" "INFO"
        return $modInfo
    }

    Write-Log "ZeroTrustAssessment module niet gevonden. Installeren..." "INFO"
    try {
        Set-PSRepository -Name PSGallery -InstallationPolicy Trusted -ErrorAction SilentlyContinue
    } catch {}

    try {
        Install-Module ZeroTrustAssessment -Scope CurrentUser -Force -AllowClobber -SkipPublisherCheck -ErrorAction Stop
        $modInfo = Get-ZtModuleInfo
        if (-not $modInfo.installed) {
            throw "Module installatie gaf geen bruikbaar resultaat terug."
        }
        Write-Log "✓ Module geïnstalleerd" "INFO"
        return $modInfo
    } catch {
        throw $_
    }
}

function Open-MicrosoftSignIn {
    param(
        [string]$Url = "https://login.microsoftonline.com/"
    )
    try {
        Write-Log "Microsoft aanmeldscherm openen: $Url" "INFO"
        Start-Process $Url -ErrorAction Stop | Out-Null
        Write-Log "✓ Browser geopend voor Microsoft login" "INFO"
    } catch {
        Write-Log "Kon browser niet automatisch openen. Open handmatig: $Url" "WARNING"
    }
}

function New-ExoRuntimePaths {
    param(
        [string]$BaseFolder
    )

    $root = if ($BaseFolder) {
        Join-Path $BaseFolder ".exo-runtime"
    } else {
        Join-Path ([System.IO.Path]::GetTempPath()) "denjoy-zerotrust-exo"
    }

    $moduleBase = Join-Path $root "module"
    $logBase = Join-Path $root "logs"
    New-Item -ItemType Directory -Path $moduleBase -Force | Out-Null
    New-Item -ItemType Directory -Path $logBase -Force | Out-Null

    return @{
        Root       = $root
        ModuleBase = $moduleBase
        LogBase    = $logBase
    }
}

function Connect-OptionalExoServices {
    param(
        [hashtable]$RuntimePaths
    )

    $moduleBase = [string]$RuntimePaths.ModuleBase
    $logBase = [string]$RuntimePaths.LogBase
    $supportsExoModuleBasePath = $false
    $supportsExoLogDirectoryPath = $false
    $supportsIppsModuleBasePath = $false
    $supportsIppsLogDirectoryPath = $false
    try {
        $exoParams = (Get-Command Connect-ExchangeOnline -ErrorAction Stop).Parameters.Keys
        $supportsExoModuleBasePath = $exoParams -contains 'EXOModuleBasePath'
        $supportsExoLogDirectoryPath = $exoParams -contains 'LogDirectoryPath'
    } catch {}
    try {
        $ippsParams = (Get-Command Connect-IPPSSession -ErrorAction Stop).Parameters.Keys
        $supportsIppsModuleBasePath = $ippsParams -contains 'EXOModuleBasePath'
        $supportsIppsLogDirectoryPath = $ippsParams -contains 'LogDirectoryPath'
    } catch {}

    # Oudere ExchangeOnlineManagement-versies gebruiken intern temp/scripts-paden.
    # Zorg dat procesniveau temp naar een schrijfbare tenantmap wijst.
    $env:TMPDIR = $moduleBase
    $env:TEMP = $moduleBase
    $env:TMP = $moduleBase

    $graphContext = $null
    try { $graphContext = Get-MgContext -ErrorAction SilentlyContinue } catch {}
    $upn = ""
    if ($graphContext -and $graphContext.Account) {
        $upn = [string]$graphContext.Account
    }

    try {
        Write-Log "Connecting to Exchange Online via lokale runtime-map: $moduleBase" "INFO"
        $exoParams = @{
            ShowBanner        = $false
            ErrorAction       = 'Stop'
        }
        if ($supportsExoModuleBasePath) { $exoParams.EXOModuleBasePath = $moduleBase }
        if ($supportsExoLogDirectoryPath) { $exoParams.LogDirectoryPath = $logBase }
        if ($TenantId -and $ClientId -and $CertThumbprint) {
            $exoParams.AppId = $ClientId
            $exoParams.Organization = $TenantId
            $exoParams.CertificateThumbprint = $CertThumbprint
        } elseif ($upn) {
            $exoParams.UserPrincipalName = $upn
            $exoParams.DisableWAM = $true
        } else {
            $exoParams.DisableWAM = $true
        }
        Connect-ExchangeOnline @exoParams | Out-Null
        Write-Log "✓ Exchange Online verbonden via eigen runtime-pad" "INFO"
    } catch {
        Write-Log "Exchange Online verbinding niet gelukt: $($_.Exception.Message)" "WARNING"
    }

    try {
        Write-Log "Connecting to Security & Compliance via lokale runtime-map: $moduleBase" "INFO"
        $ippsParams = @{
            ShowBanner        = $false
            ErrorAction       = 'Stop'
        }
        if ($supportsIppsModuleBasePath) { $ippsParams.EXOModuleBasePath = $moduleBase }
        if ($supportsIppsLogDirectoryPath) { $ippsParams.LogDirectoryPath = $logBase }
        if ($TenantId -and $ClientId -and $CertThumbprint) {
            $ippsParams.AppId = $ClientId
            $ippsParams.Organization = $TenantId
            $ippsParams.CertificateThumbprint = $CertThumbprint
        } elseif ($upn) {
            $ippsParams.UserPrincipalName = $upn
            $ippsParams.DisableWAM = $true
        } else {
            $ippsParams.DisableWAM = $true
        }
        Connect-IPPSSession @ippsParams | Out-Null
        Write-Log "✓ Security & Compliance verbonden via eigen runtime-pad" "INFO"
    } catch {
        Write-Log "Security & Compliance verbinding niet gelukt: $($_.Exception.Message)" "WARNING"
    }
}

# ── Find last report ───────────────────────────────────────────────────────────
function Get-LastReportInfo {
    param([string]$Folder)
    $searchPaths = @(
        $Folder,
        (Join-Path $env:HOME "ZeroTrustReport"),
        (Join-Path $PSScriptRoot "ZeroTrustReport"),
        (Join-Path ([System.IO.Path]::GetTempPath()) "ZeroTrustReport")
    ) | Where-Object { $_ -and (Test-Path $_) }

    foreach ($p in $searchPaths) {
        # Zoek eerst het exacte bestand (module genereert altijd ZeroTrustAssessmentReport.html)
        $exactHtml = Join-Path $p "ZeroTrustAssessmentReport.html"
        if (Test-Path $exactHtml) {
            $f = Get-Item $exactHtml
            $jsonPath = Join-Path $p "ZeroTrustAssessmentReport.json"
            return @{
                path      = $f.FullName
                json_path = $(if (Test-Path $jsonPath) { $jsonPath } else { $null })
                folder    = $f.DirectoryName
                date      = $f.LastWriteTime.ToString("o")
                size_kb   = [int]($f.Length / 1024)
            }
        }
        # Fallback: wildcardzoeken voor oudere versies
        $report = Get-ChildItem -Path $p -Filter "ZeroTrustAssessmentReport*.html" -Recurse -ErrorAction SilentlyContinue |
                  Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($report) {
            $jsonPath = Join-Path $report.DirectoryName "ZeroTrustAssessmentReport.json"
            return @{
                path      = $report.FullName
                json_path = $(if (Test-Path $jsonPath) { $jsonPath } else { $null })
                folder    = $report.DirectoryName
                date      = $report.LastWriteTime.ToString("o")
                size_kb   = [int]($report.Length / 1024)
            }
        }
    }
    return $null
}

# ── Parse report → structured JSON ────────────────────────────────────────────
# ZeroTrustAssessment module JSON veldnamen (v2.2+):
#   TestTitle         = korte titel van de check
#   TestDescription   = uitleg + remediatieactie (markdown)
#   TestResult        = bevindingen (markdown) — bevat de details
#   TestStatus        = "Passed" | "Failed" | "Investigate" | "Planned" | "Skipped"
#   TestPillar        = "Identity" | "Devices" | "Network" | "Data"
#   TestSfiPillar     = SFI pijlernaam (voor intern gebruik)
#   TestCategory      = categorie (bijv. "Application management")
#   TestId            = numeriek ID
#   TestRisk          = "High" | "Medium" | "Low"
#   TestMinimumLicense= "P1" | "P2" | "Free" etc.
#   TestSkipped       = skip-reden (leeg als niet overgeslagen)
#   TestResultSummary = { IdentityPassed, IdentityTotal, DevicesPassed, ... }
function Parse-ZtReport {
    param(
        [string]$HtmlPath,
        [string]$JsonPath = ""
    )
    if (-not (Test-Path $HtmlPath)) { return $null }

    Write-Log "Rapport parsen: $HtmlPath"

    # Converteert TestStatus → genormaliseerde status voor de portal
    function Get-NormStatus([string]$ts) {
        switch ($ts) {
            'Passed'      { return 'Pass' }
            'Failed'      { return 'Fail' }
            'Investigate' { return 'Warning' }
            default       { return 'NA' }
        }
    }

    # Verwerkt een array van test-objecten naar portal formaat
    function Convert-Tests {
        param($tests, $summary)

        $passCount = 0; $failCount = 0; $warnCount = 0; $naCount = 0
        $controls = [System.Collections.Generic.List[hashtable]]::new()

        foreach ($t in $tests) {
            $rawStatus = if ($t.PSObject.Properties['TestStatus']) { [string]$t.TestStatus } else { '' }
            $status = Get-NormStatus $rawStatus
            switch ($status) {
                'Pass'    { $passCount++ }
                'Fail'    { $failCount++ }
                'Warning' { $warnCount++ }
                default   { $naCount++ }
            }
            $skipped = if ($t.PSObject.Properties['TestSkipped']) { [string]$t.TestSkipped } else { '' }

            $controls.Add(@{
                title       = if ($t.PSObject.Properties['TestTitle'])       { [string]$t.TestTitle }       else { [string]$t.TestId }
                description = if ($t.PSObject.Properties['TestDescription']) { [string]$t.TestDescription } else { '' }
                details     = if ($t.PSObject.Properties['TestResult'])      { [string]$t.TestResult }      else { '' }
                pillar      = if ($t.PSObject.Properties['TestPillar'])      { [string]$t.TestPillar }      else { 'Unknown' }
                category    = if ($t.PSObject.Properties['TestCategory'])    { [string]$t.TestCategory }    else { '' }
                status      = $status
                rawStatus   = $rawStatus
                riskLevel   = if ($t.PSObject.Properties['TestRisk'])        { [string]$t.TestRisk }        else { '' }
                license     = if ($t.PSObject.Properties['TestMinimumLicense']) { [string]$t.TestMinimumLicense } else { '' }
                testId      = if ($t.PSObject.Properties['TestId'])          { [string]$t.TestId }          else { '' }
                skipped     = $skipped
            }) | Out-Null
        }

        # Pillar scores — bij voorkeur uit TestResultSummary, anders aggregeren uit tests
        $pillarScores = @{}
        if ($summary -and $summary.PSObject.Properties.Count -gt 0) {
            foreach ($pillar in @('Identity', 'Devices', 'Network', 'Data')) {
                $passed = 0; $total = 0
                $pProp = "${pillar}Passed"; $tProp = "${pillar}Total"
                if ($summary.PSObject.Properties[$pProp]) { $passed = [int]$summary.$pProp }
                if ($summary.PSObject.Properties[$tProp]) { $total  = [int]$summary.$tProp }
                $pillarScores[$pillar] = if ($total -gt 0) { [int](($passed / $total) * 100) } else { $null }
            }
        } else {
            # Fallback: aggregeer uit tests
            $byPillar = @{}
            foreach ($c in $controls) {
                $p = $c.pillar
                if (-not $byPillar.ContainsKey($p)) { $byPillar[$p] = @{pass=0;total=0} }
                $byPillar[$p].total++
                if ($c.status -eq 'Pass') { $byPillar[$p].pass++ }
            }
            foreach ($p in $byPillar.Keys) {
                $bd = $byPillar[$p]
                $pillarScores[$p] = if ($bd.total -gt 0) { [int](($bd.pass / $bd.total) * 100) } else { 0 }
            }
        }

        $total = $passCount + $failCount + $warnCount
        return @{
            ok         = $true
            pillars    = $pillarScores
            controls   = @($controls)
            summary    = @{
                pass    = $passCount
                fail    = $failCount
                warning = $warnCount
                na      = $naCount
                total   = $total
                score   = $(if ($total -gt 0) { [int](($passCount / $total) * 100) } else { 0 })
            }
        }
    }

    # ── Pad 1: lees rechtstreeks uit de ingebedde JSON in de HTML ──
    # De module schrijft geen apart .json exportbestand — alles zit in de HTML als reportData={...}
    $html = Get-Content -Path $HtmlPath -Raw -Encoding UTF8 -ErrorAction Stop

    $markerPos = $html.IndexOf('reportData=')
    if ($markerPos -ge 0) {
        Write-Log "reportData= gevonden in HTML, JSON extraheren via brace-matching..."
        try {
            $jsonStart = $markerPos + 'reportData='.Length
            # Skip whitespace
            while ($jsonStart -lt $html.Length -and $html[$jsonStart] -in @(' ',"`t","`n","`r")) { $jsonStart++ }

            # Vind het einde via brace-diepte tellen
            $depth = 0; $inStr = $false; $esc = $false; $i = $jsonStart
            while ($i -lt $html.Length) {
                $c = $html[$i]
                if ($esc)            { $esc = $false }
                elseif ($c -eq '\' -and $inStr) { $esc = $true }
                elseif ($c -eq '"' -and -not $esc) { $inStr = -not $inStr }
                elseif (-not $inStr) {
                    if ($c -eq '{') { $depth++ }
                    elseif ($c -eq '}') { $depth--; if ($depth -eq 0) { break } }
                }
                $i++
            }

            $jsonStr = $html.Substring($jsonStart, $i - $jsonStart + 1)
            $jsonData = $jsonStr | ConvertFrom-Json -ErrorAction Stop

            $tests   = if ($jsonData.PSObject.Properties['Tests'])   { $jsonData.Tests } else { @() }
            $summary = if ($jsonData.PSObject.Properties['TestResultSummary']) { $jsonData.TestResultSummary } else { $null }

            Write-Log "Parsed $($tests.Count) tests uit HTML JSON"
            $result = Convert-Tests -tests $tests -summary $summary
            # Voeg metadata toe
            $result['tenantName'] = if ($jsonData.PSObject.Properties['TenantName']) { [string]$jsonData.TenantName } else { '' }
            $result['executedAt'] = if ($jsonData.PSObject.Properties['ExecutedAt'])  { [string]$jsonData.ExecutedAt }  else { '' }
            return $result
        } catch {
            Write-Log "HTML JSON extractie mislukt: $($_.Exception.Message)" "WARNING"
        }
    }

    Write-Log "Geen parseerbaar JSON gevonden in rapport" "WARNING"
    return @{ ok = $false; error = "Rapport gevonden maar JSON kon niet worden geëxtraheerd." }
}

# ══════════════════════════════════════════════════════════════════════════════
# Actions
# ══════════════════════════════════════════════════════════════════════════════

switch ($Action) {

    "get-status" {
        $modInfo = Get-ZtModuleInfo
        $report  = Get-LastReportInfo -Folder $OutputFolder
        Write-Result @{
            ok             = $true
            module         = $modInfo
            last_report    = $report
            tenant_id      = $TenantId
        }
    }

    "get-results" {
        $report = Get-LastReportInfo -Folder $OutputFolder
        if (-not $report) {
            Write-Result @{ ok = $false; error = "Geen rapport gevonden. Voer eerst een Zero Trust Assessment uit."; no_report = $true }
            return
        }
        $jsonPath = if ($report.ContainsKey('json_path')) { [string]$report.json_path } else { '' }
        $parsed = Parse-ZtReport -HtmlPath $report.path -JsonPath $jsonPath
        if ($parsed) {
            $parsed.report_date   = $report.date
            $parsed.report_path   = $report.path
            Write-Result $parsed
        } else {
            Write-Result @{ ok = $false; error = "Rapport kon niet worden geparsed."; report_date = $report.date }
        }
    }

    "install-module" {
        try {
            $modInfo = Ensure-ZtModule
            Write-Result @{
                ok      = $true
                module  = $modInfo
                action  = "install-module"
            }
        } catch {
            Write-Result @{
                ok             = $false
                error          = "Module installatie mislukt: $($_.Exception.Message)"
                install_failed = $true
            }
        }
    }

    "run" {
        try {
            $modInfo = Ensure-ZtModule
        } catch {
            Write-Result @{ ok = $false; error = "Module installatie mislukt: $($_.Exception.Message)"; install_failed = $true }
            return
        }

        # Zorg dat de globale Scripts-map bestaat (vereist door ZeroTrustAssessment op macOS/Linux)
        $psScriptsPath = Join-Path $PSHOME 'Scripts'
        if (-not (Test-Path $psScriptsPath)) {
            try {
                New-Item -ItemType Directory -Path $psScriptsPath -Force -ErrorAction Stop | Out-Null
                Write-Log "✓ PowerShell Scripts map aangemaakt: $psScriptsPath" "INFO"
            } catch {
                Write-Log "⚠️ Kan '$psScriptsPath' niet aanmaken (geen rechten). Eenmalige fix: sudo mkdir -p '$psScriptsPath' && sudo chown `$USER '$psScriptsPath'" "WARNING"
                # Fallback: gebruik user-schrijfbare Scripts map
                $userScripts = Join-Path ([System.Environment]::GetFolderPath('UserProfile')) '.local/share/powershell/Scripts'
                New-Item -ItemType Directory -Path $userScripts -Force -ErrorAction SilentlyContinue | Out-Null
            }
        }

        Import-Module ZeroTrustAssessment -Force -ErrorAction Stop
        Import-Module ExchangeOnlineManagement -ErrorAction SilentlyContinue | Out-Null

        $outFolder = $(if ($OutputFolder) { $OutputFolder } else { Join-Path $PSScriptRoot "ZeroTrustReport" })
        if (-not (Test-Path $outFolder)) { New-Item -Path $outFolder -ItemType Directory -Force | Out-Null }
        $exoRuntime = New-ExoRuntimePaths -BaseFolder $outFolder

        # Authenticatie — Graph/Azure via Zero Trust module, EXO/SCC via eigen runtime-map
        try {
            if ($ForceInteractive) {
                Write-Log "Interactieve browser-login afgedwongen. Verwacht Microsoft aanmeldvenster." "INFO"
                Open-MicrosoftSignIn
                if ($TenantId) {
                    Connect-ZtAssessment -TenantId $TenantId -Service Graph,Azure -ErrorAction Stop
                } else {
                    Connect-ZtAssessment -Service Graph,Azure -ErrorAction Stop
                }
            } elseif ($TenantId -and $ClientId -and $CertThumbprint) {
                Write-Log "Verbinden via app-certificaat (TenantId=$TenantId, ClientId=$ClientId)" "INFO"
                # Connect-ZtAssessment gebruikt -Certificate (PSFramework.Parameter.CertificateParameter),
                # niet -CertificateThumbprint. De thumbprint string wordt automatisch omgezet.
                Connect-ZtAssessment -TenantId $TenantId -ClientId $ClientId -Certificate $CertThumbprint -Service Graph,Azure -ErrorAction Stop
            } elseif ($TenantId -and $ClientId) {
                Write-Log "Verbinden via app-registratie zonder certificaat. Microsoft browser-login wordt gebruikt." "INFO"
                Open-MicrosoftSignIn
                Connect-ZtAssessment -TenantId $TenantId -Service Graph,Azure -ErrorAction Stop
            } else {
                Write-Log "Verbinden interactief via Microsoft browser-login (geen app-credentials)" "INFO"
                Open-MicrosoftSignIn
                Connect-ZtAssessment -Service Graph,Azure -ErrorAction Stop
            }
            Connect-OptionalExoServices -RuntimePaths $exoRuntime
            Write-Log "✓ Verbonden" "INFO"
        } catch {
            Write-Result @{ ok = $false; error = "Authenticatie mislukt: $($_.Exception.Message)" }
            return
        }

        # Gebruik een vaste submap als ZT-outputpad zodat onze eigen bestanden
        # (_status.json, zerotrust.log, .exo-runtime) nooit botsen met de module.
        # De module ziet altijd een lege map → geen interactieve vraag.
        $ztReportFolder = Join-Path $outFolder "report"
        if (Test-Path $ztReportFolder) {
            Write-Log "Rapportmap leegmaken: $ztReportFolder" "INFO"
            Remove-Item -Path $ztReportFolder -Recurse -Force -ErrorAction SilentlyContinue
        }
        New-Item -ItemType Directory -Path $ztReportFolder -Force | Out-Null

        Write-Log "Zero Trust Assessment starten → $ztReportFolder (kan uren duren)" "INFO"
        try {
            Invoke-ZtAssessment -Path $ztReportFolder -ErrorAction Stop
            Write-Log "✓ Assessment voltooid" "INFO"
        } catch {
            Write-Result @{ ok = $false; error = "Assessment fout: $($_.Exception.Message)" }
            return
        }

        # Resultaten parsen en teruggeven
        $report = Get-LastReportInfo -Folder $outFolder
        if ($report) {
            $jsonPath = if ($report.ContainsKey('json_path')) { [string]$report.json_path } else { '' }
            $parsed = Parse-ZtReport -HtmlPath $report.path -JsonPath $jsonPath
            if ($parsed) {
                $parsed.report_date = $report.date
                $parsed.report_path = $report.path
                $parsed.ran_now     = $true
                Write-Result $parsed
                return
            }
        }
        Write-Result @{ ok = $true; ran_now = $true; message = "Assessment voltooid maar rapport kon niet worden geparsed."; report = $report }
    }
}
