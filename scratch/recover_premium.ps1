
$walkthrough = 'C:\Users\mykasi\.gemini\antigravity\brain\c5732edd-1166-44e9-96e3-e943feb818bf\walkthrough.md.resolved'
$out = 'c:\Users\mykasi\Desktop\MGProject\scratch\recovered_premium_helpui.tsx'
$lines = Get-Content $walkthrough
$start = -1
for ($i=10500; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match 'import React' -and $lines[$i+1] -match 'useGamepad') {
        $start = $i
        break
    }
}
if ($start -ne -1) {
    $code = @()
    for ($i=$start; $i -lt $lines.Count; $i++) {
        $code += $lines[$i]
        if ($lines[$i] -match 'export default HelpUI;') { break }
    }
    $code | Out-File $out -Encoding utf8
    Write-Output "Recovered $($code.Count) lines"
} else {
    Write-Output "Not found"
}
