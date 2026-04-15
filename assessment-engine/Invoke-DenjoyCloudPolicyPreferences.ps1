<#
.SYNOPSIS
    Denjoy Cloud Policy Preferences agent.

.DESCRIPTION
    Haalt Policy Preferences op uit de Denjoy backend en past ondersteunde
    voorkeuren lokaal toe:
    - DriveMap
    - Registry
    - Shortcut

    De download-endpoint in de portal vervangt automatisch de placeholders
    __DENJOY_POLICY_URL__ en __DENJOY_TENANT_ID__ met tenant-specifieke waarden.
#>

[CmdletBinding()]
param(
    [string]$PolicyUrl = '__DENJOY_POLICY_URL__',
    [string]$TenantId = '__DENJOY_TENANT_ID__',
    [string]$DeviceId = $env:COMPUTERNAME,
    [string]$BearerToken,
    [switch]$WhatIf,
    [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-DenjoyApi {
    param(
        [Parameter(Mandatory)][string]$Url,
        [string]$Token
    )

    $headers = @{}
    if ($Token) { $headers['Authorization'] = "Bearer $Token" }

    $uri = if ($Url -match '\?') {
        '{0}&device_id={1}' -f $Url, [uri]::EscapeDataString($DeviceId)
    } else {
        '{0}?device_id={1}' -f $Url, [uri]::EscapeDataString($DeviceId)
    }
    return Invoke-RestMethod -Method GET -Uri $uri -Headers $headers
}

function Ensure-RegistryValue {
    param([hashtable]$Policy)

    $path = $Policy.path
    $name = $Policy.name
    $value = $Policy.value
    $propertyType = if ($Policy.propertyType) { $Policy.propertyType } else { 'String' }

    if (-not (Test-Path -LiteralPath $path)) {
        if (-not $WhatIf) {
            New-Item -Path $path -Force | Out-Null
        }
    }

    if (-not $WhatIf) {
        New-ItemProperty -Path $path -Name $name -Value $value -PropertyType $propertyType -Force | Out-Null
    }

    return @{
        name = $Policy.name
        type = 'Registry'
        target = $path
        changed = (-not $WhatIf)
        status = 'applied'
    }
}

function Ensure-DriveMap {
    param([hashtable]$Policy)

    $driveLetter = [string]$Policy.driveLetter
    $remotePath = [string]$Policy.remotePath
    if (-not $driveLetter -or -not $remotePath) {
        throw "DriveMap policy mist driveLetter of remotePath."
    }

    $existing = Get-PSDrive -Name $driveLetter -ErrorAction SilentlyContinue
    if (-not $existing -and -not $WhatIf) {
        New-PSDrive -Name $driveLetter -PSProvider FileSystem -Root $remotePath -Persist | Out-Null
    }

    return @{
        name = $Policy.name
        type = 'DriveMap'
        target = "$driveLetter`: -> $remotePath"
        changed = (-not $existing -and -not $WhatIf)
        status = if ($existing) { 'present' } else { 'applied' }
    }
}

function Resolve-ShortcutFolder {
    param([string]$Location)

    switch ($Location) {
        'StartMenu' { return [Environment]::GetFolderPath('StartMenu') }
        'Taskbar'   { return (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar') }
        default     { return [Environment]::GetFolderPath('Desktop') }
    }
}

function Ensure-Shortcut {
    param([hashtable]$Policy)

    $shortcutName = [string]$Policy.shortcutName
    $targetPath = [string]$Policy.targetPath
    $location = if ($Policy.location) { [string]$Policy.location } else { 'Desktop' }
    if (-not $shortcutName -or -not $targetPath) {
        throw "Shortcut policy mist shortcutName of targetPath."
    }

    $folder = Resolve-ShortcutFolder -Location $location
    if (-not (Test-Path -LiteralPath $folder) -and -not $WhatIf) {
        New-Item -ItemType Directory -Path $folder -Force | Out-Null
    }
    $shortcutPath = Join-Path $folder ("{0}.url" -f $shortcutName)

    if (-not $WhatIf) {
        @(
            '[InternetShortcut]'
            "URL=$targetPath"
        ) | Set-Content -LiteralPath $shortcutPath -Encoding UTF8
    }

    return @{
        name = $Policy.name
        type = 'Shortcut'
        target = $shortcutPath
        changed = (-not $WhatIf)
        status = 'applied'
    }
}

function ConvertTo-PolicyHashtable {
    param([object]$Item)
    $map = @{}
    foreach ($prop in $Item.PSObject.Properties) {
        $map[$prop.Name] = $prop.Value
    }
    return $map
}

Write-Host "[CPP] Policies ophalen voor tenant $TenantId / device $DeviceId..." -ForegroundColor Cyan
$response = Invoke-DenjoyApi -Url $PolicyUrl -Token $BearerToken
$policies = @($response.policies)
$results = New-Object System.Collections.Generic.List[object]

foreach ($rawPolicy in $policies) {
    $policy = ConvertTo-PolicyHashtable -Item $rawPolicy
    try {
        switch ($policy.type) {
            'Registry' { $result = Ensure-RegistryValue -Policy $policy }
            'DriveMap' { $result = Ensure-DriveMap -Policy $policy }
            'Shortcut' { $result = Ensure-Shortcut -Policy $policy }
            default {
                $result = @{
                    name = $policy.name
                    type = $policy.type
                    target = $policy.target
                    changed = $false
                    status = 'skipped'
                    reason = 'Niet ondersteund door deze agent.'
                }
            }
        }
        $results.Add($result) | Out-Null
    } catch {
        $results.Add(@{
            name = $policy.name
            type = $policy.type
            target = $policy.target
            changed = $false
            status = 'failed'
            reason = $_.Exception.Message
        }) | Out-Null
    }
}

$summary = @{
    ok = $true
    tenantId = $TenantId
    deviceId = $DeviceId
    whatIf = [bool]$WhatIf
    policyCount = $policies.Count
    appliedCount = @($results | Where-Object { $_.status -eq 'applied' }).Count
    failedCount = @($results | Where-Object { $_.status -eq 'failed' }).Count
    results = @($results)
}

if ($AsJson) {
    $summary | ConvertTo-Json -Depth 8
} else {
    Write-Host "[CPP] $($summary.policyCount) policies verwerkt. Applied: $($summary.appliedCount), Failed: $($summary.failedCount)." -ForegroundColor Green
    $summary.results | Format-Table name, type, status, target -AutoSize
}
