<#
.SYNOPSIS
    Denjoy IT Platform — Exchange & Email module engine (Fase 9)

.DESCRIPTION
    Mailbox-beheer en e-mail-inzichten via Microsoft Graph:
    - list-mailboxes       : alle gebruikers met mailbox (quota, type, archive)
    - get-mailbox          : volledig mailbox detail (instellingen, statistieken, forwarding)
    - list-mailbox-rules   : inbox regels per tenant (alle gebruikers, max 200 mailboxen)
    - list-forwarding      : overzicht van alle actieve forwarding-instellingen
    - list-shared-mailboxes: gedeelde mailboxen met permissies-samenvatting

    Let op: transport rules, spam filter en quarantine vereisen Exchange Online PS.
    Dit script werkt volledig via Microsoft Graph.

    Vereiste Graph API permissies (Application):
      User.Read.All
      Mail.ReadBasic.All
      MailboxSettings.Read

    Output: logs → ##RESULT## → JSON
#>

param(
    [Parameter(Mandatory)][ValidateSet(
        'list-mailboxes','get-mailbox','list-mailbox-rules','list-forwarding','list-shared-mailboxes'
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

function Format-Bytes {
    param([long]$Bytes)
    if ($Bytes -ge 1GB) { return "$([math]::Round($Bytes/1GB,2)) GB" }
    if ($Bytes -ge 1MB) { return "$([math]::Round($Bytes/1MB,1)) MB" }
    return "$([math]::Round($Bytes/1KB)) KB"
}

$params = $ParamsJson | ConvertFrom-Json

try {
    $token = Get-GraphToken -TenantId $TenantId -ClientId $ClientId -CertThumbprint $CertThumbprint -ClientSecret $ClientSecret

    $result = switch ($Action) {

        'list-mailboxes' {
            $selectFields = 'id,displayName,userPrincipalName,mail,mailboxSettings,assignedLicenses,accountEnabled,userType,onPremisesSyncEnabled'
            try {
                $users = Invoke-Graph -Token $token -Uri "https://graph.microsoft.com/v1.0/users?`$select=$selectFields&`$filter=assignedLicenses/`$count ne 0&`$count=true&`$top=999" -AllPages
            }
            catch {
                Write-Host "[WARN] mailboxSettings niet beschikbaar, probeer basis-mailboxlijst zonder mailboxinstellingen."
                $fallbackSelectFields = 'id,displayName,userPrincipalName,mail,assignedLicenses,accountEnabled,userType,onPremisesSyncEnabled'
                $users = Invoke-Graph -Token $token -Uri "https://graph.microsoft.com/v1.0/users?`$select=$fallbackSelectFields&`$filter=assignedLicenses/`$count ne 0&`$count=true&`$top=999" -AllPages
            }
            $items = $users | Where-Object { $_.mail } | ForEach-Object {
                $settings = $null
                if ($_.PSObject.Properties.Match('mailboxSettings').Count -gt 0) { $settings = $_.mailboxSettings }
                $lang = $null
                if ($settings -and $settings.language) { $lang = $settings.language.displayName }
                $replyStatus = $null
                if ($settings -and $settings.automaticRepliesSetting) { $replyStatus = $settings.automaticRepliesSetting.status }
                @{
                    id               = $_.id
                    displayName      = $_.displayName
                    upn              = $_.userPrincipalName
                    mail             = $_.mail
                    accountEnabled   = $_.accountEnabled
                    userType         = if ($_.userType) { $_.userType } else { 'Member' }
                    timezone         = if ($settings -and $settings.timeZone) { $settings.timeZone } else { '—' }
                    language         = if ($lang) { $lang } else { '—' }
                    autoReplyEnabled = if ($replyStatus -eq 'alwaysEnabled' -or $replyStatus -eq 'scheduled') { $true } else { $false }
                    onPremSync       = if ($_.onPremisesSyncEnabled) { $true } else { $false }
                }
            }
            @{ ok=$true; mailboxes=$items; count=$items.Count }
        }

        'get-mailbox' {
            $uid = $params.user_id
            if (-not $uid) { throw "user_id vereist" }
            $user     = Invoke-Graph -Token $token -Uri "https://graph.microsoft.com/v1.0/users/$uid`?`$select=id,displayName,userPrincipalName,mail,mailboxSettings,aboutMe,officeLocation,mobilePhone,businessPhones,department,jobTitle,accountEnabled,userType,onPremisesSyncEnabled"
            $settings = $user.mailboxSettings

            # Forwarding via mailboxSettings
            $fwdAddr    = $settings.automaticForwardingSettings.forwardingSmtpAddress
            $fwdEnabled = $settings.automaticForwardingSettings.isForwardingEnabled

            @{
                ok          = $true
                id          = $user.id
                displayName = $user.displayName
                upn         = $user.userPrincipalName
                mail        = $user.mail
                accountEnabled = $user.accountEnabled
                recipientTypeDetails = 'UserMailbox'
                userType     = if ($user.userType) { $user.userType } else { 'Member' }
                department  = $user.department
                jobTitle    = $user.jobTitle
                office      = $user.officeLocation
                mobile      = $user.mobilePhone
                timezone    = $settings.timeZone
                language    = $settings.language.displayName
                onPremSync  = if ($user.onPremisesSyncEnabled) { $true } else { $false }
                autoReply   = @{
                    status        = $settings.automaticRepliesSetting.status
                    internalMsg   = $settings.automaticRepliesSetting.internalReplyMessage
                    externalMsg   = $settings.automaticRepliesSetting.externalReplyMessage
                }
                forwarding  = @{
                    enabled  = if ($fwdEnabled) { $true } else { $false }
                    address  = if ($fwdAddr) { $fwdAddr } else { $null }
                }
                archiveFolder = $settings.archiveFolder
                delegateMeetingMessageDeliveryOptions = $settings.delegateMeetingMessageDeliveryOptions
            }
        }

        'list-mailbox-rules' {
            # Haal gebruikers op en controleer inbox regels (beperkt tot eerste 150 voor performance)
            $users = Invoke-Graph -Token $token `
                -Uri "https://graph.microsoft.com/v1.0/users?`$select=id,displayName,userPrincipalName,mail&`$filter=assignedLicenses/`$count ne 0&`$count=true&`$top=150" `
                -AllPages
            $users = @($users | Where-Object { $_.mail })
            $tokenVal = $token

            # Parallel ophalen via ForEach-Object -Parallel (PS 7+), sequential fallback voor PS 5
            $fetchBlock = {
                param($uid, $uname, $uupn, $tok)
                $headers = @{Authorization="Bearer $tok";'Content-Type'='application/json'}
                try {
                    $resp = Invoke-RestMethod -Method GET `
                        -Uri "https://graph.microsoft.com/v1.0/users/$uid/mailFolders/inbox/messageRules" `
                        -Headers $headers -ErrorAction Stop
                    @{ userId=$uid; userName=$uname; userUpn=$uupn; rules=@($resp.value); ok=$true }
                } catch {
                    @{ userId=$uid; userName=$uname; userUpn=$uupn; rules=@(); ok=$false }
                }
            }

            if ($PSVersionTable.PSVersion.Major -ge 7) {
                $jobResults = $users | ForEach-Object -ThrottleLimit 20 -Parallel {
                    $u = $_; $tok = $using:tokenVal
                    $headers = @{Authorization="Bearer $tok";'Content-Type'='application/json'}
                    try {
                        $resp = Invoke-RestMethod -Method GET `
                            -Uri "https://graph.microsoft.com/v1.0/users/$($u.id)/mailFolders/inbox/messageRules" `
                            -Headers $headers -ErrorAction Stop
                        @{ userId=$u.id; userName=$u.displayName; userUpn=$u.userPrincipalName; rules=@($resp.value); ok=$true }
                    } catch {
                        @{ userId=$u.id; userName=$u.displayName; userUpn=$u.userPrincipalName; rules=@(); ok=$false }
                    }
                }
            } else {
                $jobResults = $users | ForEach-Object {
                    & $fetchBlock $_.id $_.displayName $_.userPrincipalName $tokenVal
                }
            }

            $allRules = @()
            foreach ($jr in @($jobResults)) {
                if (-not $jr.ok) { continue }
                foreach ($rule in @($jr.rules)) {
                    $suspiciousFlags = @()
                    if ($rule.actions.forwardTo)      { $suspiciousFlags += 'Doorstuurt e-mail' }
                    if ($rule.actions.forwardAsAttachmentTo) { $suspiciousFlags += 'Stuurt als bijlage door' }
                    if ($rule.actions.redirectTo)     { $suspiciousFlags += 'Redirect' }
                    if ($rule.actions.delete)         { $suspiciousFlags += 'Verwijdert berichten' }
                    if ($rule.actions.moveToFolder -and $rule.conditions.senderContains) { $suspiciousFlags += 'Verplaatst berichten op basis van afzender' }
                    $allRules += @{
                        userName    = $jr.userName
                        userUpn     = $jr.userUpn
                        ruleName    = $rule.displayName
                        enabled     = $rule.isEnabled
                        sequence    = $rule.sequence
                        suspicious  = $suspiciousFlags.Count -gt 0
                        flags       = $suspiciousFlags
                        forwardTo   = if ($rule.actions.forwardTo) { ($rule.actions.forwardTo | ForEach-Object { $_.emailAddress.address }) -join ', ' } else { $null }
                        deleteMsgs  = if ($rule.actions.delete) { $true } else { $false }
                    }
                }
            }
            @{ ok=$true; rules=$allRules; total=$allRules.Count; usersChecked=$users.Count; suspicious=($allRules | Where-Object { $_.suspicious }).Count }
        }

        'list-forwarding' {
            $users = Invoke-Graph -Token $token `
                -Uri "https://graph.microsoft.com/v1.0/users?`$select=id,displayName,userPrincipalName,mail,mailboxSettings&`$filter=assignedLicenses/`$count ne 0&`$count=true&`$top=999" `
                -AllPages
            $fwdList = @($users | Where-Object { $_.mail } | ForEach-Object {
                $fwd = $_.mailboxSettings.automaticForwardingSettings
                if ($fwd -and $fwd.isForwardingEnabled) {
                    @{
                        displayName = $_.displayName
                        upn         = $_.userPrincipalName
                        forwardTo   = $fwd.forwardingSmtpAddress
                        enabled     = $true
                    }
                }
            } | Where-Object { $_ })
            @{ ok=$true; forwarding=$fwdList; count=$fwdList.Count }
        }

        'list-shared-mailboxes' {
            # Shared mailboxen zijn Guest-type of specifiek gefilterd
            $selectFields = 'id,displayName,userPrincipalName,mail,accountEnabled,mailboxSettings,userType'
            $users = Invoke-Graph -Token $token `
                -Uri "https://graph.microsoft.com/v1.0/users?`$select=$selectFields&`$top=999" `
                -AllPages
            # Shared mailboxen hebben geen licentie maar wel mail - heuristiek via userType of UPN
            $shared = @($users | Where-Object { $_.mail -and -not $_.accountEnabled } | ForEach-Object {
                @{
                    id          = $_.id
                    displayName = $_.displayName
                    mail        = $_.mail
                    upn         = $_.userPrincipalName
                    userType    = $_.userType
                    autoReply   = if ($_.mailboxSettings.automaticRepliesSetting.status -eq 'alwaysEnabled') { $true } else { $false }
                }
            })
            @{ ok=$true; mailboxes=$shared; count=$shared.Count }
        }
    }

    Write-Host "##RESULT##$(ConvertTo-Json $result -Depth 10 -Compress)"
} catch {
    Write-Host "##RESULT##$(ConvertTo-Json @{ok=$false;error=$_.Exception.Message} -Compress)"
    exit 1
}
