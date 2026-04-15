<#
.SYNOPSIS
    Denjoy IT Platform — Remediation Engine
.DESCRIPTION
    Voert beveiligingsherstelacties uit via Microsoft Graph API.
    Aangeroepen vanuit de Denjoy backend (app.py) met app-only authenticatie.
    Output: platte tekst logs gevolgd door "##RESULT##" + JSON-resultaat.
.PARAMETER RemediationId
    ID van de te uitvoeren remediation (zie REMEDIATION_CATALOG in app.py).
.PARAMETER TenantId
    Azure AD Tenant ID (GUID).
.PARAMETER ClientId
    App-registratie Client ID.
.PARAMETER CertThumbprint
    Certificaat thumbprint (aanbevolen). Als leeg: gebruik $env:M365_CLIENT_SECRET.
.PARAMETER ParamsJson
    JSON-string met remediation-specifieke parameters.
.PARAMETER DryRun
    Simuleer de actie zonder daadwerkelijk iets te wijzigen.
#>
param(
    [Parameter(Mandatory)] [string] $RemediationId,
    [Parameter(Mandatory)] [string] $TenantId,
    [Parameter(Mandatory)] [string] $ClientId,
    [string] $CertThumbprint = "",
    [string] $ParamsJson      = "{}",
    [switch] $DryRun
)

Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'Modules\Authentication.psm1') -Force -ErrorAction Stop
$ErrorActionPreference = "Stop"

# ─────────────────────────────────────────────────────────────
# HULPFUNCTIES
# ─────────────────────────────────────────────────────────────

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $stamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$stamp][$Level] $Message"
}

function Write-Result {
    param([hashtable]$Data)
    Write-Host ""
    Write-Host "##RESULT##"
    Write-Host ($Data | ConvertTo-Json -Depth 10 -Compress)
}

function Exit-WithError {
    param([string]$Message)
    Write-Log $Message "ERROR"
    Write-Result @{ success = $false; message = $Message }
    exit 1
}

# ─────────────────────────────────────────────────────────────
# TOKEN OPHALEN — client_credentials flow
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# GRAPH API AANROEP
# ─────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────
# REMEDIATIONS
# ─────────────────────────────────────────────────────────────

function Invoke-EnableSecurityDefaults {
    param([string]$Token, [bool]$DryRun)
    Write-Log "Remediation: Security Defaults inschakelen (dry_run=$DryRun)"

    $current = Invoke-Graph -Token $Token -Method GET `
                   -Path "policies/identitySecurityDefaultsEnforcementPolicy"

    if ($DryRun) {
        return @{
            success      = $true
            dry_run      = $true
            current      = @{ isEnabled = $current.isEnabled }
            would_change = @{ isEnabled = $true }
            message      = "Security Defaults is nu $(if($current.isEnabled){'ingeschakeld'}else{'uitgeschakeld'}). Bij uitvoering: inschakelen."
        }
    }

    if ($current.isEnabled -eq $true) {
        return @{ success = $true; already_correct = $true; message = "Security Defaults was al ingeschakeld — geen actie vereist." }
    }

    Invoke-Graph -Token $Token -Method PATCH `
        -Path "policies/identitySecurityDefaultsEnforcementPolicy" `
        -Body @{ isEnabled = $true } | Out-Null

    return @{ success = $true; message = "Security Defaults succesvol ingeschakeld." }
}


function Invoke-BlockLegacyAuth {
    param([string]$Token, [bool]$DryRun)
    Write-Log "Remediation: Legacy authenticatie blokkeren (dry_run=$DryRun)"

    $policyName = "Denjoy - Blokkeer Legacy Authenticatie"

    # Controleer of policy al bestaat
    $existing = Invoke-Graph -Token $Token -Method GET -Path "identity/conditionalAccess/policies"
    $found = $existing.value | Where-Object { $_.displayName -eq $policyName }

    if ($DryRun) {
        $msg = if ($found) {
            "Policy '$policyName' bestaat al (status: $($found.state)). Geen actie nodig."
        } else {
            "Policy '$policyName' bestaat nog niet. Bij uitvoering: aanmaken en inschakelen."
        }
        return @{
            success      = $true
            dry_run      = $true
            policy_exists = [bool]$found
            message      = $msg
        }
    }

    if ($found) {
        return @{ success = $true; already_correct = $true; message = "Policy '$policyName' bestaat al." }
    }

    $policy = @{
        displayName = $policyName
        state       = "enabled"
        conditions  = @{
            users            = @{ includeUsers = @("All") }
            applications     = @{ includeApplications = @("All") }
            clientAppTypes   = @("exchangeActiveSync", "other")
        }
        grantControls = @{
            operator        = "OR"
            builtInControls = @("block")
        }
    }

    $result = Invoke-Graph -Token $Token -Method POST `
                  -Path "identity/conditionalAccess/policies" -Body $policy

    return @{
        success    = $true
        policy_id  = $result.id
        message    = "CA policy '$policyName' succesvol aangemaakt en ingeschakeld."
    }
}


function Invoke-RequireMfaAllUsers {
    param([string]$Token, [bool]$DryRun)
    Write-Log "Remediation: MFA vereisen voor alle gebruikers (dry_run=$DryRun)"

    $policyName = "Denjoy - MFA Vereist voor Alle Gebruikers"

    $existing = Invoke-Graph -Token $Token -Method GET -Path "identity/conditionalAccess/policies"
    $found = $existing.value | Where-Object { $_.displayName -eq $policyName }

    if ($DryRun) {
        $msg = if ($found) {
            "Policy '$policyName' bestaat al (status: $($found.state))."
        } else {
            "Policy '$policyName' bestaat nog niet. Bij uitvoering: aanmaken voor alle gebruikers en alle cloud-apps."
        }
        return @{
            success       = $true
            dry_run       = $true
            policy_exists = [bool]$found
            message       = $msg
        }
    }

    if ($found) {
        return @{ success = $true; already_correct = $true; message = "Policy '$policyName' bestaat al." }
    }

    $policy = @{
        displayName = $policyName
        state       = "enabled"
        conditions  = @{
            users        = @{ includeUsers = @("All") }
            applications = @{ includeApplications = @("All") }
        }
        grantControls = @{
            operator        = "OR"
            builtInControls = @("mfa")
        }
    }

    $result = Invoke-Graph -Token $Token -Method POST `
                  -Path "identity/conditionalAccess/policies" -Body $policy

    return @{
        success   = $true
        policy_id = $result.id
        message   = "CA policy '$policyName' succesvol aangemaakt en ingeschakeld."
    }
}


function Invoke-RevokeUserSessions {
    param([string]$Token, [bool]$DryRun, [hashtable]$Params)
    $upn = ($Params["user_upn"] -replace "'","").Trim()
    if (-not $upn) { Exit-WithError "user_upn is verplicht." }
    Write-Log "Remediation: Sessies intrekken voor $upn (dry_run=$DryRun)"

    # Gebruiker opzoeken
    $encodedUpn = [Uri]::EscapeDataString($upn)
    try {
        $user = Invoke-Graph -Token $Token -Method GET -Path "users/$encodedUpn"
    }
    catch {
        Exit-WithError "Gebruiker '$upn' niet gevonden: $_"
    }

    if ($DryRun) {
        return @{
            success  = $true
            dry_run  = $true
            user     = @{ displayName = $user.displayName; upn = $user.userPrincipalName; id = $user.id }
            message  = "Gebruiker '$($user.displayName)' gevonden. Bij uitvoering: alle actieve sessies intrekken."
        }
    }

    Invoke-Graph -Token $Token -Method POST -Path "users/$($user.id)/revokeSignInSessions" | Out-Null

    return @{
        success = $true
        user    = @{ displayName = $user.displayName; upn = $user.userPrincipalName }
        message = "Alle sessies succesvol ingetrokken voor $($user.displayName) ($upn)."
    }
}


function Invoke-DisableUser {
    param([string]$Token, [bool]$DryRun, [hashtable]$Params)
    $upn = ($Params["user_upn"] -replace "'","").Trim()
    if (-not $upn) { Exit-WithError "user_upn is verplicht." }
    Write-Log "Remediation: Account blokkeren voor $upn (dry_run=$DryRun)"

    $encodedUpn = [Uri]::EscapeDataString($upn)
    try {
        $user = Invoke-Graph -Token $Token -Method GET -Path "users/$encodedUpn"
    }
    catch {
        Exit-WithError "Gebruiker '$upn' niet gevonden: $_"
    }

    if ($DryRun) {
        return @{
            success  = $true
            dry_run  = $true
            user     = @{ displayName = $user.displayName; upn = $user.userPrincipalName; accountEnabled = $user.accountEnabled }
            message  = "Account '$($user.displayName)' is momenteel $(if($user.accountEnabled){'actief'}else{'al geblokkeerd'}). Bij uitvoering: blokkeren."
        }
    }

    if ($user.accountEnabled -eq $false) {
        return @{ success = $true; already_correct = $true; message = "Account '$($user.displayName)' was al geblokkeerd." }
    }

    Invoke-Graph -Token $Token -Method PATCH -Path "users/$($user.id)" `
        -Body @{ accountEnabled = $false } | Out-Null

    return @{
        success = $true
        user    = @{ displayName = $user.displayName; upn = $user.userPrincipalName }
        message = "Account '$($user.displayName)' succesvol geblokkeerd."
    }
}


function Invoke-EnableModernAuth {
    param([string]$Token, [bool]$DryRun)
    Write-Log "Remediation: Modern authenticatie controleren via Graph (dry_run=$DryRun)"
    # Moderne auth status ophalen via org settings
    $org = Invoke-Graph -Token $Token -Method GET -Path "organization"
    $orgName = ($org.value | Select-Object -First 1).displayName

    if ($DryRun) {
        return @{
            success  = $true
            dry_run  = $true
            org_name = $orgName
            message  = "Org: '$orgName'. Modern auth voor Exchange Online vereist Exchange PowerShell (Set-OrganizationConfig -OAuth2ClientProfileEnabled). Handmatige stap vereist."
            manual   = $true
        }
    }

    return @{
        success  = $true
        manual   = $true
        org_name = $orgName
        message  = "Modern auth vereist Exchange Online PowerShell. Gebruik: Set-OrganizationConfig -OAuth2ClientProfileEnabled `$true. Voer dit uit via Exchange Admin Center of PowerShell."
    }
}


function Invoke-SetOutboundSpamFilter {
    param([string]$Token, [bool]$DryRun)
    Write-Log "Remediation: Uitgaand spamfilter — Exchange Online PowerShell vereist"

    if ($DryRun) {
        return @{
            success = $true
            dry_run = $true
            manual  = $true
            message = "Uitgaand spamfilter vereist Exchange Online PowerShell (Set-HostedOutboundSpamFilterPolicy). Niet uitvoerbaar via Graph API alleen."
        }
    }

    return @{
        success = $true
        manual  = $true
        message = "Configureer via Exchange Admin Center > Anti-spam > Outbound spam filter policy, of via PowerShell: Set-HostedOutboundSpamFilterPolicy."
    }
}

function Invoke-RestrictGuestInvitations {
    param([string]$Token, [bool]$DryRun)
    Write-Log "Remediation: Gastuitnodigingen beperken tot admins (dry_run=$DryRun)"

    $current = Invoke-Graph -Token $Token -Method GET -Path "policies/authorizationPolicy"
    $currentSetting = $current.allowInvitesFrom

    if ($DryRun) {
        return @{
            success         = $true
            dry_run         = $true
            current_setting = $currentSetting
            would_change    = @{ allowInvitesFrom = "adminsAndGuestInviters" }
            message         = "Huidige instelling: '$currentSetting'. Bij uitvoering: beperken tot 'adminsAndGuestInviters'."
        }
    }

    if ($currentSetting -eq "adminsAndGuestInviters" -or $currentSetting -eq "adminsOnly") {
        return @{ success = $true; already_correct = $true; message = "Gastuitnodigingen zijn al beperkt (instelling: $currentSetting)." }
    }

    Invoke-Graph -Token $Token -Method PATCH -Path "policies/authorizationPolicy" `
        -Body @{ allowInvitesFrom = "adminsAndGuestInviters" } | Out-Null

    return @{
        success = $true
        message = "Gastuitnodigingen succesvol beperkt tot beheerders en Guest Inviters."
    }
}


function Invoke-EnableSspr {
    param([string]$Token, [bool]$DryRun)
    Write-Log "Remediation: Self-Service Password Reset inschakelen (dry_run=$DryRun)"

    if ($DryRun) {
        return @{
            success = $true
            dry_run = $true
            message = "SSPR-registratie wordt aangestuurd via Microsoft Entra. Bij uitvoering: registratiecampagne instellen voor alle gebruikers."
        }
    }

    $body = @{
        registrationEnforcement = @{
            authenticationMethodsRegistrationCampaign = @{
                snoozeDurationInDays = 0
                enforceRegistrationAfterAllowedSnoozes = $true
                state = "enabled"
                includeTargets = @(
                    @{
                        id = "all_users"
                        targetType = "group"
                        targetedAuthenticationMethod = "microsoftAuthenticator"
                    }
                )
            }
        }
    }

    try {
        Invoke-Graph -Token $Token -Method PATCH -Path "policies/authenticationMethodsPolicy" -Body $body | Out-Null
        return @{
            success = $true
            message = "SSPR-registratiecampagne succesvol ingeschakeld voor alle gebruikers."
        }
    }
    catch {
        return @{
            success = $false
            message = "Fout bij instellen SSPR-campagne: $_. Controleer of de tenant P1/P2-licenties heeft."
        }
    }
}


function Invoke-RequireMfaAdmins {
    param([string]$Token, [bool]$DryRun)
    Write-Log "Remediation: MFA vereisen voor beheerders (dry_run=$DryRun)"

    $policyName = "Denjoy - MFA Vereist voor Beheerders"

    $existing = Invoke-Graph -Token $Token -Method GET -Path "identity/conditionalAccess/policies"
    $found = $existing.value | Where-Object { $_.displayName -eq $policyName }

    if ($DryRun) {
        $msg = if ($found) {
            "Policy '$policyName' bestaat al (status: $($found.state))."
        } else {
            "Policy '$policyName' bestaat nog niet. Bij uitvoering: aanmaken voor alle beheerdersrollen."
        }
        return @{
            success       = $true
            dry_run       = $true
            policy_exists = [bool]$found
            message       = $msg
        }
    }

    if ($found) {
        return @{ success = $true; already_correct = $true; message = "Policy '$policyName' bestaat al." }
    }

    # Standaard Azure AD beheerdersrollen
    $adminRoles = @(
        "62e90394-69f5-4237-9190-012177145e10", # Global Administrator
        "194ae4cb-b126-40b2-bd5b-6091b380977d", # Security Administrator
        "f28a1f50-f6e7-4571-818b-6a12f2af6b6c", # SharePoint Administrator
        "29232cdf-9323-42fd-ade2-1d097af3e4de", # Exchange Administrator
        "b0f54661-2d74-4c50-afa3-1ec803f12efe", # Billing Administrator
        "fe930be7-5e62-47db-91af-98c3a49a38b1", # User Administrator
        "9b895d92-2cd3-44c7-9d02-a6ac2d5ea5c3"  # Application Administrator
    )

    $policy = @{
        displayName = $policyName
        state       = "enabled"
        conditions  = @{
            users        = @{
                includeRoles = $adminRoles
            }
            applications = @{ includeApplications = @("All") }
        }
        grantControls = @{
            operator        = "OR"
            builtInControls = @("mfa")
        }
    }

    $result = Invoke-Graph -Token $Token -Method POST `
                  -Path "identity/conditionalAccess/policies" -Body $policy

    return @{
        success   = $true
        policy_id = $result.id
        message   = "CA policy '$policyName' succesvol aangemaakt voor $($adminRoles.Count) beheerdersrollen."
    }
}


# ─────────────────────────────────────────────────────────────
# DISPATCHER
# ─────────────────────────────────────────────────────────────

Write-Log "=== Denjoy Remediation Engine ==="
Write-Log "Remediation-ID : $RemediationId"
Write-Log "Tenant         : $TenantId"
Write-Log "Dry-run        : $DryRun"

# Parameters parsen
try {
    $Params = $ParamsJson | ConvertFrom-Json -AsHashtable -ErrorAction Stop
}
catch {
    # Fallback: lege hashtable
    $Params = @{}
}

# Token ophalen (niet nodig bij manual-only remediations)
$manualOnly = @("enable-modern-auth", "set-outbound-spam-filter")
$token = $null
if ($RemediationId -notin $manualOnly) {
    $token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId `
                 -CertThumbprint $CertThumbprint -ClientSecret $env:M365_CLIENT_SECRET
}

# Uitvoeren
try {
    $result = switch ($RemediationId) {
        "enable-security-defaults"    { Invoke-EnableSecurityDefaults    -Token $token -DryRun $DryRun.IsPresent }
        "block-legacy-auth"           { Invoke-BlockLegacyAuth            -Token $token -DryRun $DryRun.IsPresent }
        "require-mfa-all-users"       { Invoke-RequireMfaAllUsers         -Token $token -DryRun $DryRun.IsPresent }
        "revoke-user-sessions"        { Invoke-RevokeUserSessions         -Token $token -DryRun $DryRun.IsPresent -Params $Params }
        "disable-user"                { Invoke-DisableUser                -Token $token -DryRun $DryRun.IsPresent -Params $Params }
        "enable-modern-auth"          { Invoke-EnableModernAuth           -Token $token -DryRun $DryRun.IsPresent }
        "set-outbound-spam-filter"    { Invoke-SetOutboundSpamFilter      -Token $token -DryRun $DryRun.IsPresent }
        "restrict-guest-invitations"  { Invoke-RestrictGuestInvitations   -Token $token -DryRun $DryRun.IsPresent }
        "enable-sspr"                 { Invoke-EnableSspr                 -Token $token -DryRun $DryRun.IsPresent }
        "require-mfa-admins"          { Invoke-RequireMfaAdmins           -Token $token -DryRun $DryRun.IsPresent }
        default                       { Exit-WithError "Onbekende remediation-ID: $RemediationId" }
    }

    Write-Log "Remediation voltooid: $($result.message)"
    Write-Result $result
    exit 0
}
catch {
    Exit-WithError "Fout bij uitvoeren remediation: $($_.Exception.Message)"
}
