<#
.SYNOPSIS
    Authentication module for M365 Baseline Assessment

.DESCRIPTION
    Provides authentication and logging functionality for M365 Baseline Assessment.
    Contains Connect-M365Services for Microsoft Graph authentication and 
    Write-AssessmentLog for consistent logging across all modules.

.NOTES
    Author: Denjoy-IT - Dennis Schiphorst
    Version: 3.0.4
    Date: 2025-12-13
    Dependencies: Microsoft.Graph modules
#>

<#
.SYNOPSIS
    Writes a timestamped log message with color coding based on level.

.DESCRIPTION
    Helper function for consistent logging across all assessment phases.
    
.PARAMETER Message
    The message to log
    
.PARAMETER Level
    The severity level (Info, Success, Warning, Error)
#>
function Write-AssessmentLog {
    param(
        [string]$Message,
        [ValidateSet('Info', 'Success', 'Warning', 'Error')]
        [string]$Level = 'Info'
    )
    
    # Ensure UTF-8 output to prevent character corruption (e.g., "reYistration")
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $timestamp = Get-Date -Format 'HH:mm:ss'
    $color = switch ($Level) {
        'Success' { 'Green' }
        'Warning' { 'Yellow' }
        'Error' { 'Red' }
        default { 'Cyan' }
    }
    
    Write-Host "[$timestamp] $Message" -ForegroundColor $color
}

<#
.SYNOPSIS
    Connects to Microsoft Graph with required scopes for M365 assessment.

.DESCRIPTION
    Establishes connection to Microsoft Graph with all necessary permissions
    for complete M365 tenant assessment. Handles existing connections and
    tenant validation.
    
.PARAMETER TenantId
    Optional tenant ID to connect to. If not specified, uses current context.
    
.PARAMETER ClientId
    Optional client ID for app-based authentication.
    
.PARAMETER ClientSecret
    Optional client secret for app-based authentication.
    
.PARAMETER CertThumbprint
    Optional certificate thumbprint for certificate-based authentication.

.NOTES
    Sets script:TenantInfo hashtable with tenant details
#>
function Connect-M365Services {
    param(
        [string]$TenantId,
        [string]$ClientId,
        [SecureString]$ClientSecret,
        [string]$CertThumbprint
    )
    
    Write-AssessmentLog "Connecting to Microsoft Graph..." -Level Info
    
    $requiredScopes = @(
        'User.Read.All',
        'Group.Read.All',
        'Directory.Read.All',
        'AuditLog.Read.All',
        'Policy.Read.All',
        'Sites.Read.All',
        'Team.ReadBasic.All',
        'Organization.Read.All',
        'Reports.Read.All',
        'ReportSettings.Read.All',
        'UserAuthenticationMethod.Read.All',
        'SecurityEvents.Read.All',                    # Secure Score
        'DelegatedAdminRelationship.Read.All',        # GDAP/GSAP
        'DeviceManagementConfiguration.Read.All',     # Intune policies
        'DeviceManagementManagedDevices.Read.All',    # Intune devices
        'Policy.Read.ConditionalAccess'              # CA details (optioneel)
        #'SharePointTenant.Read.All'
    )
    
    $hasTenant = -not [string]::IsNullOrWhiteSpace($TenantId)
    $hasClient = -not [string]::IsNullOrWhiteSpace($ClientId)
    $hasCert = -not [string]::IsNullOrWhiteSpace($CertThumbprint)
    $hasSecret = ($null -ne $ClientSecret)
    $useAppAuth = ($hasTenant -and $hasClient -and ($hasCert -or $hasSecret))

    try {
        if ($useAppAuth) {
            Write-AssessmentLog "Using app-only Graph authentication (non-interactive)." -Level Info

            try { Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null } catch {}

            if ($hasCert) {
                Connect-MgGraph -TenantId $TenantId -ClientId $ClientId -CertificateThumbprint $CertThumbprint -NoWelcome
            } else {
                $clientSecretCredential = [System.Management.Automation.PSCredential]::new($ClientId, $ClientSecret)
                Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $clientSecretCredential -NoWelcome
            }
        } else {
            if ($env:M365_BASELINE_NONINTERACTIVE -eq '1' -or $env:CI -eq '1') {
                Write-AssessmentLog "✗ Non-interactive run zonder volledige app-auth configuratie. Vul TenantId + ClientId + (ClientSecret of CertThumbprint) in." -Level Error
                return $false
            }

            # Check if already connected
            $context = Get-MgContext

            if ($context) {
                Write-AssessmentLog "Already connected to Microsoft Graph" -Level Info
                Write-AssessmentLog "Using existing connection..." -Level Info

                # If TenantId is specified, verify it matches
                if ($TenantId -and $context.TenantId -ne $TenantId) {
                    Write-AssessmentLog "⚠️ Connected to different tenant, reconnecting..." -Level Warning
                    Disconnect-MgGraph
                    if ($TenantId) {
                        Connect-MgGraph -Scopes $requiredScopes -TenantId $TenantId -NoWelcome
                    } else {
                        Connect-MgGraph -Scopes $requiredScopes -NoWelcome
                    }
                    $context = Get-MgContext
                }
            } else {
                # Not connected, make new connection
                if ($TenantId) {
                    Connect-MgGraph -Scopes $requiredScopes -TenantId $TenantId -NoWelcome
                } else {
                    Connect-MgGraph -Scopes $requiredScopes -NoWelcome
                }
                $context = Get-MgContext
            }
        }
        
        # Get the context after connection
        $context = Get-MgContext
        
        # Verify we have a valid context
        if (-not $context) {
            Write-AssessmentLog "✗ Failed to establish Microsoft Graph context" -Level Error
            return $false
        }
        
        # Safely populate tenant info
        try {
            $global:TenantInfo.TenantId = $context.TenantId
            $global:TenantInfo.Account = $context.Account
        } catch {
            Write-AssessmentLog "⚠️ Could not read context properties: $_" -Level Warning
            # Try alternative property access
            if ($context.PSObject.Properties['TenantId']) {
                $global:TenantInfo.TenantId = $context.PSObject.Properties['TenantId'].Value
            }
            if ($context.PSObject.Properties['Account']) {
                $global:TenantInfo.Account = $context.PSObject.Properties['Account'].Value
            }
        }
        
        $org = Get-MgOrganization
        $global:TenantInfo.DisplayName = $org.DisplayName
        $global:TenantInfo.TenantType = $org.TenantType
        $global:TenantInfo.DefaultDomain = $org.VerifiedDomains | Where-Object { $_.IsDefault } | Select-Object -ExpandProperty Name
        
        Write-AssessmentLog "✓ Connected to tenant: $($org.DisplayName) ($($global:TenantInfo.TenantId))" -Level Success
        return $true
    } catch {
        Write-AssessmentLog "✗ Failed to connect: $_" -Level Error
        return $false
    }
}

<#
.SYNOPSIS
    Voert een Graph-scriptblock uit met automatische retry bij 429 (throttling) of 5xx fouten.

.PARAMETER ScriptBlock
    Het scriptblock dat de Graph-aanroep bevat.

.PARAMETER MaxRetries
    Maximaal aantal pogingen (standaard 3).

.PARAMETER OperationName
    Beschrijving van de operatie voor logging.
#>
function Invoke-GraphWithRetry {
    param(
        [Parameter(Mandatory)]
        [scriptblock]$ScriptBlock,
        [int]$MaxRetries = 3,
        [string]$OperationName = "Graph API aanroep"
    )

    $attempt = 0
    $waitSeconds = 1

    while ($attempt -le $MaxRetries) {
        try {
            return & $ScriptBlock
        } catch {
            $statusCode = $null
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            } elseif ($_.Exception.Message -match '429|503|504|502') {
                $statusCode = [int]($_.Exception.Message -replace '.*?(\d{3}).*', '$1')
            }

            $isThrottling = ($statusCode -eq 429 -or $statusCode -ge 500)
            $attempt++

            if ($isThrottling -and $attempt -le $MaxRetries) {
                Write-AssessmentLog "⏳ $OperationName HTTP $statusCode - wacht $waitSeconds seconden (poging $attempt/$MaxRetries)" -Level Warning
                Start-Sleep -Seconds $waitSeconds
                $waitSeconds *= 2
            } else {
                throw
            }
        }
    }
}

<#
.SYNOPSIS
    Haal een OAuth2 access token op voor Microsoft Graph via client credentials.

.DESCRIPTION
    Ondersteunt twee authenticatiemethodes:
    1. Certificate-based (CertThumbprint): zoekt het certificaat in CurrentUser\My en LocalMachine\My
       en bouwt een JWT client assertion (RS256).
    2. Client secret (ClientSecret): stuurt client_secret als credential.

.PARAMETER TenantId
    Azure AD tenant ID (GUID of domein).

.PARAMETER ClientId
    App Registration client ID.

.PARAMETER CertThumbprint
    Thumbprint van het certificaat in het lokale certificaatarchief.

.PARAMETER ClientSecret
    Gedeeld secret van de App Registration. Wordt genegeerd als CertThumbprint is opgegeven.

.OUTPUTS
    [string] Access token (Bearer).
#>
function Get-GraphToken {
    param(
        [Parameter(Mandatory)][string]$TenantId,
        [Parameter(Mandatory)][string]$ClientId,
        [string]$CertThumbprint,
        [string]$ClientSecret
    )

    $tokenUrl = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
    $scope    = 'https://graph.microsoft.com/.default'

    if (-not [string]::IsNullOrWhiteSpace($CertThumbprint)) {
        # ── Certificate-based authentication (JWT client assertion) ─────────
        $cert = Get-Item "Cert:\CurrentUser\My\$CertThumbprint" -ErrorAction SilentlyContinue
        if (-not $cert) { $cert = Get-Item "Cert:\LocalMachine\My\$CertThumbprint" -ErrorAction SilentlyContinue }
        if (-not $cert) { throw "Certificaat met thumbprint '$CertThumbprint' niet gevonden in CurrentUser\My of LocalMachine\My." }

        $now = [DateTimeOffset]::UtcNow
        $h = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(
            (ConvertTo-Json @{alg='RS256';typ='JWT';x5t=([Convert]::ToBase64String($cert.GetCertHash()))} -Compress)
        )).TrimEnd('=').Replace('+','-').Replace('/','_')
        $p = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(
            (ConvertTo-Json @{
                aud = $tokenUrl
                iss = $ClientId
                sub = $ClientId
                jti = [Guid]::NewGuid().ToString()
                nbf = $now.ToUnixTimeSeconds()
                exp = $now.AddMinutes(10).ToUnixTimeSeconds()
            } -Compress)
        )).TrimEnd('=').Replace('+','-').Replace('/','_')
        $toSign = [Text.Encoding]::UTF8.GetBytes("$h.$p")
        $rsa = [Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
        $sig = [Convert]::ToBase64String(
            $rsa.SignData($toSign, [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
        ).TrimEnd('=').Replace('+','-').Replace('/','_')
        $body = @{
            client_id              = $ClientId
            scope                  = $scope
            grant_type             = 'client_credentials'
            client_assertion_type  = 'urn:ietf:params:oauth:grant-type:jwt-bearer'
            client_assertion       = "$h.$p.$sig"
        }
    } elseif (-not [string]::IsNullOrWhiteSpace($ClientSecret)) {
        # ── Client secret authentication ────────────────────────────────────
        $body = @{
            client_id     = $ClientId
            client_secret = $ClientSecret
            scope         = $scope
            grant_type    = 'client_credentials'
        }
    } else {
        throw "Get-GraphToken vereist CertThumbprint of ClientSecret."
    }

    (Invoke-RestMethod -Method POST -Uri $tokenUrl -Body $body -ContentType 'application/x-www-form-urlencoded').access_token
}

<#
.SYNOPSIS
    Voer een Microsoft Graph REST API aanroep uit.

.DESCRIPTION
    Enkelvoudige Graph API aanroep met optionele paginering (AllPages).
    Ondersteunt GET, POST, PATCH, DELETE en PUT.
    Voegt ConsistencyLevel: eventual toe voor geavanceerde queries ($count, $filter op directory).

.PARAMETER Token
    Bearer access token (van Get-GraphToken).

.PARAMETER Uri
    Volledige Graph API URI.

.PARAMETER Method
    HTTP methode (standaard: GET).

.PARAMETER Body
    Optionele request body (wordt geserialiseerd naar JSON).

.PARAMETER AllPages
    Wanneer opgegeven: haalt automatisch alle pagina's op via @odata.nextLink.

.OUTPUTS
    [object] API response of [array] bij AllPages.
#>
function Invoke-Graph {
    param(
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$Uri,
        [string]$Method  = 'GET',
        [object]$Body    = $null,
        [switch]$AllPages
    )

    $headers = @{
        Authorization    = "Bearer $Token"
        'Content-Type'   = 'application/json'
        ConsistencyLevel = 'eventual'
    }

    $results = [System.Collections.Generic.List[object]]::new()
    $nextUri = $Uri

    do {
        $splat = @{ Method = $Method; Uri = $nextUri; Headers = $headers; ErrorAction = 'Stop' }
        if ($Body -and $Method -ne 'GET') {
            $splat.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
        }

        $resp    = Invoke-RestMethod @splat
        $nextUri = $null

        if ($AllPages) {
            if ($resp.value) { $results.AddRange([object[]]$resp.value) }
            $nl = $resp.PSObject.Properties['@odata.nextLink']
            $nextUri = if ($nl) { $nl.Value } else { $null }
        } else {
            return $resp
        }
    } while ($nextUri)

    return $results
}


<#
.SYNOPSIS
    Haal alle pagina's van een Graph API endpoint op.

.DESCRIPTION
    Wrapper om Invoke-Graph heen die automatisch pagineert tot alle resultaten opgehaald zijn.
    Retourneert een samengevoegde lijst van alle items.

.PARAMETER Token
    Bearer access token (van Get-GraphToken).

.PARAMETER Uri
    Startpunt URI van de Graph API aanroep.

.OUTPUTS
    [System.Collections.Generic.List[object]] Alle resultaten gecombineerd.
#>
function Invoke-GraphPaged {
    param(
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$Uri
    )
    return Invoke-Graph -Token $Token -Uri $Uri -AllPages
}


<#
.SYNOPSIS
    Voer een Graph API aanroep uit; retourneer $null bij fout.

.DESCRIPTION
    Zoals Invoke-Graph maar vangt alle exceptions af en retourneert $null.
    Handig voor optionele data waarbij een fout niet fataal is.

.PARAMETER Token
    Bearer access token (van Get-GraphToken).

.PARAMETER Uri
    Volledige Graph API URI.

.PARAMETER AllPages
    Wanneer opgegeven: haalt automatisch alle pagina's op.

.OUTPUTS
    [object] API response of $null bij fout.
#>
function Invoke-GraphSafe {
    param(
        [Parameter(Mandatory)][string]$Token,
        [Parameter(Mandatory)][string]$Uri,
        [switch]$AllPages
    )
    try {
        return Invoke-Graph -Token $Token -Uri $Uri -AllPages:$AllPages
    } catch {
        Write-Warning "Graph fout [$Uri]: $($_.Exception.Message)"
        return $null
    }
}


Export-ModuleMember -Function `
    Connect-M365Services, `
    Write-AssessmentLog, `
    Invoke-GraphWithRetry, `
    Get-GraphToken, `
    Invoke-Graph, `
    Invoke-GraphPaged, `
    Invoke-GraphSafe
