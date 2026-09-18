import os
import glob

files = [
    'src/pages/Overview.js',
    'src/pages/Tenders.js',
    'src/pages/MDMTenders.js'
]

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Remove escaping
    content = content.replace('\\`', '`')
    content = content.replace('\\${', '${')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)

print("Fixed JS syntax errors by removing escaping!")
