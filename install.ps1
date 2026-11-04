param (
    [string]$ExtensionId = ""
)

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host " IIT Kharagpur ERP Auto-Login Installer" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NativeHostDir = Join-Path $ScriptDir "native-host"
$BatPath = Join-Path $NativeHostDir "run_host.bat"
$ManifestPath = Join-Path $NativeHostDir "com.iitkgp.erp_auto_login.json"
$HostName = "com.iitkgp.erp_auto_login"

# 1. Prompt for Extension ID if not passed
if ([string]::IsNullOrWhiteSpace($ExtensionId)) {
    Write-Host "`nPlease enter your Extension ID." -ForegroundColor Yellow
    Write-Host "To find it:" -ForegroundColor Gray
    Write-Host " 1. Go to brave://extensions (or chrome://extensions / edge://extensions)" -ForegroundColor Gray
    Write-Host " 2. Enable 'Developer mode' (top right)" -ForegroundColor Gray
    Write-Host " 3. Click 'Load unpacked' and select:" -ForegroundColor Gray
    Write-Host "    $ScriptDir\extension" -ForegroundColor Gray
    Write-Host " 4. Copy the 32-character ID shown on the extension card.`n" -ForegroundColor Gray

    $ExtensionId = Read-Host "Paste Extension ID here"
    $ExtensionId = $ExtensionId.Trim()
}

if ([string]::IsNullOrWhiteSpace($ExtensionId)) {
    Write-Host "`n[ERROR] Extension ID is required. Exiting." -ForegroundColor Red
    exit 1
}

# 2. Generate Native Messaging Host JSON Manifest
$AllowedOrigins = @(
    "chrome-extension://$ExtensionId/"
)

$EscapedBatPath = $BatPath.Replace('\', '\\')

$ManifestContent = @"
{
  "name": "$HostName",
  "description": "IIT KGP ERP Auto-Login Native Messaging Host",
  "path": "$EscapedBatPath",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$ExtensionId/"
  ]
}
"@

[System.IO.File]::WriteAllText($ManifestPath, $ManifestContent)
Write-Host "`n[+] Generated Native Host Manifest at: $ManifestPath" -ForegroundColor Green

# 3. Register in Windows Registry for Chrome, Brave, and Edge
$RegistryPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
)

foreach ($regPath in $RegistryPaths) {
    try {
        if (-not (Test-Path $regPath)) {
            New-Item -Path $regPath -Force | Out-Null
        }
        Set-ItemProperty -Path $regPath -Name "(Default)" -Value $ManifestPath -Force
        Write-Host "[+] Registered in Windows Registry: $regPath" -ForegroundColor Green
    } catch {
        Write-Host "[-] Note: Could not write $regPath ($($_.Exception.Message))" -ForegroundColor Gray
    }
}

# 4. Self-test ping
Write-Host "`n[*] Running communication self-test..." -ForegroundColor Cyan
$testPy = @"
import subprocess, struct, json, sys

p = subprocess.Popen([r'$BatPath'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
msg = json.dumps({'cmd': 'ping'}).encode('utf-8')
p.stdin.write(struct.pack('<I', len(msg)))
p.stdin.write(msg)
p.stdin.flush()

raw_len = p.stdout.read(4)
if len(raw_len) == 4:
    resp_len = struct.unpack('<I', raw_len)[0]
    raw_resp = p.stdout.read(resp_len)
    resp = json.loads(raw_resp.decode('utf-8'))
    print(resp.get('status'))
else:
    print('failed')
p.terminate()
"@

$testResult = python -c "$testPy"
if ($testResult -match "success") {
    Write-Host "[+] Self-test passed! Host is communicating properly." -ForegroundColor Green
} else {
    Write-Host "[!] Self-test warning: Could not verify host response. Check native-host\host_debug.log" -ForegroundColor Yellow
}

Write-Host "`n=============================================" -ForegroundColor Cyan
Write-Host " Setup Complete!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor White
Write-Host "1. Edit your credentials & security answers in:" -ForegroundColor White
Write-Host "   $NativeHostDir\config.env" -ForegroundColor Yellow
Write-Host "2. Open https://erp.iitkgp.ac.in/ and enjoy zero-click login!`n" -ForegroundColor Green
