
$log = 'C:\Users\mykasi\.gemini\antigravity\brain\c0b9e3fe-a8ce-4047-b68b-1ee402d61dab\.system_generated\logs\overview.txt'
$out = 'c:\Users\mykasi\Desktop\MGProject\scratch\recovered_helpui.json'
Get-Content $log | Where-Object { $_ -match 'HelpUI.tsx' } | Sort-Object Length -Descending | Select-Object -First 1 | Out-File $out
