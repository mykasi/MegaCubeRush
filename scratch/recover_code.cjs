
const fs = require('fs');
const path = require('path');

const logPath = 'C:\\Users\\mykasi\\.gemini\\antigravity\\brain\\c0b9e3fe-a8ce-4047-b68b-1ee402d61dab\\.system_generated\\logs\\overview.txt';
const outputPath = 'c:\\Users\\mykasi\\Desktop\\MGProject\\scratch\\recovered_helpui.json';

const content = fs.readFileSync(logPath, 'utf8');
const lines = content.split('\n');

let maxLen = 0;
let bestLine = '';

for (const line of lines) {
    if (line.includes('HelpUI.tsx') && line.length > maxLen) {
        maxLen = line.length;
        bestLine = line;
    }
}

if (bestLine) {
    fs.writeFileSync(outputPath, bestLine);
    console.log(`Found line with length ${maxLen}`);
} else {
    console.log('Not found');
}
