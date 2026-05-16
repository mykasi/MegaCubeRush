
import os

walkthrough_path = r'C:\Users\mykasi\.gemini\antigravity\brain\c5732edd-1166-44e9-96e3-e943feb818bf\walkthrough.md.resolved'
output_path = r'c:\Users\mykasi\Desktop\MGProject\scratch\recovered_premium_helpui.tsx'

with open(walkthrough_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# The code seems to start at line 10507 (1-indexed) in the previous view_file output.
# That output showed 10507: import React ...
# Let's find the start and end of that code block.

start_idx = -1
for i, line in enumerate(lines):
    if i >= 10500 and 'import React' in line and 'useGamepad' in lines[i+1]:
        start_idx = i
        break

if start_idx != -1:
    code_lines = []
    # Collect lines until we hit 'export default HelpUI;' or end of file
    for i in range(start_idx, len(lines)):
        line = lines[i]
        # Remove line number prefix if it exists (the view_file output added it, but the raw file shouldn't have it)
        # Wait, walkthrough.md.resolved is a raw file, it shouldn't have line numbers unless the AI wrote them there.
        # But grep showed it as raw markdown.
        code_lines.append(line)
        if 'export default HelpUI;' in line:
            break
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.writelines(code_lines)
    print(f"Recovered {len(code_lines)} lines to {output_path}")
else:
    print("Could not find the start of the code block.")
