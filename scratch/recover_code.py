
import json
import os

log_path = r'C:\Users\mykasi\.gemini\antigravity\brain\c0b9e3fe-a8ce-4047-b68b-1ee402d61dab\.system_generated\logs\overview.txt'
output_path = r'c:\Users\mykasi\Desktop\MGProject\scratch\recovered_helpui.tsx'

with open(log_path, 'r', encoding='utf-8') as f:
    max_len = 0
    best_content = None
    for line in f:
        try:
            data = json.loads(line)
            # Look for view_file or write_to_file or replace_file_content that might have the content
            # Actually, view_file results are in the 'content' field if it's a MODEL response?
            # No, view_file results are in the 'content' field of the TOOL output.
            
            if data.get('type') == 'TOOL_RESPONSE' and 'File Path: `file:///c:/Users/mykasi/Desktop/MGProject/src/components/HelpUI.tsx`' in data.get('content', ''):
                content = data['content']
                if len(content) > max_len:
                    max_len = len(content)
                    best_content = content
        except:
            continue

if best_content:
    # Extract the code between <original_line> and the end, removing line numbers
    lines = best_content.split('\n')
    code_lines = []
    start_collecting = False
    for line in lines:
        if 'The following code has been modified' in line or 'Showing lines' in line:
            start_collecting = True
            continue
        if start_collecting:
            if ': ' in line:
                code_lines.append(line.split(': ', 1)[1])
            else:
                code_lines.append(line)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(code_lines))
    print(f"Recovered {len(code_lines)} lines to {output_path}")
else:
    print("Could not find suitable content in logs.")
