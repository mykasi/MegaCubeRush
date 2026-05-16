const fs = require('fs');

let content = fs.readFileSync('SettingsUI.tsx', 'utf-8');

// 1. SettingsUIProps
content = content.replace(
  /  setInventoryDisplayLimit: \(v: number\) => void;\n  isGamepadActive: boolean;\n\}/g,
  "  setInventoryDisplayLimit: (v: number) => void;\n  isGamepadActive: boolean;\n  singleStickModeSetting: 'manual' | 'always_on' | 'always_off';\n  setSingleStickModeSetting: (v: 'manual' | 'always_on' | 'always_off') => void;\n}"
);

// 2. component signature
content = content.replace(
  /  setShowInventoryMainAll, setShowInventorySubAll, setInventoryDisplayLimit,\n  isGamepadActive\n}\) => \{/g,
  "  setShowInventoryMainAll, setShowInventorySubAll, setInventoryDisplayLimit,\n  isGamepadActive, singleStickModeSetting, setSingleStickModeSetting\n}) => {"
);

// 3. activeTab
content = content.replace(
  /const \[activeTab, setActiveTab\] = useState<'audio' \| 'inventory'>\('audio'\);/g,
  "const [activeTab, setActiveTab] = useState<'audio' | 'inventory' | 'control'>('audio');"
);

// 4. menuCount
content = content.replace(
  /  const AUDIO_ITEMS = 5; \/\/ Master, BGM, SE, Reset, Back\n  const INVENTORY_ITEMS = 5; \/\/ Main, Sub, Limit, Reset, Back\n  const menuCount = activeTab === 'audio' \? AUDIO_ITEMS : INVENTORY_ITEMS;/g,
  "  const AUDIO_ITEMS = 5;\n  const INVENTORY_ITEMS = 5;\n  const CONTROL_ITEMS = 2;\n  const menuCount = activeTab === 'audio' ? AUDIO_ITEMS : (activeTab === 'inventory' ? INVENTORY_ITEMS : CONTROL_ITEMS);"
);

// 5. switchTab
content = content.replace(
  /const tabs: Array\<'audio' \| 'inventory'\> = \['audio', 'inventory'\];/g,
  "const tabs: Array<'audio' | 'inventory' | 'control'> = ['audio', 'inventory', 'control'];"
);

// 6. Left control
content = content.replace(
  /            \} else \{\n              if \(activeIndex === 0\) \{ setShowInventoryMainAll\(!showInventoryMainAll\); playSound\('ui_move'\); \}\n              if \(activeIndex === 1\) \{ setShowInventorySubAll\(!showInventorySubAll\); playSound\('ui_move'\); \}\n              if \(activeIndex === 2\) \{ setInventoryDisplayLimit\(Math\.max\(12, inventoryDisplayLimit - 1\)\); playSound\('ui_move'\); \}\n            \}/g,
  "            } else if (activeTab === 'inventory') {\n              if (activeIndex === 0) { setShowInventoryMainAll(!showInventoryMainAll); playSound('ui_move'); }\n              if (activeIndex === 1) { setShowInventorySubAll(!showInventorySubAll); playSound('ui_move'); }\n              if (activeIndex === 2) { setInventoryDisplayLimit(Math.max(12, inventoryDisplayLimit - 1)); playSound('ui_move'); }\n            } else if (activeTab === 'control') {\n              if (activeIndex === 0) { setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_off' : (singleStickModeSetting === 'always_off' ? 'always_on' : 'manual')); playSound('ui_move'); }\n            }"
);

// 7. Left repeat
content = content.replace(
  /            \} else \{\n              if \(activeIndex === 2\) \{ setInventoryDisplayLimit\(Math\.max\(12, inventoryDisplayLimit - 1\)\); playSound\('ui_move'\); \}\n            \}/g,
  "            } else if (activeTab === 'inventory') {\n              if (activeIndex === 2) { setInventoryDisplayLimit(Math.max(12, inventoryDisplayLimit - 1)); playSound('ui_move'); }\n            }"
);

// 8. Right control
content = content.replace(
  /            \} else \{\n              if \(activeIndex === 0\) \{ setShowInventoryMainAll\(!showInventoryMainAll\); playSound\('ui_move'\); \}\n              if \(activeIndex === 1\) \{ setShowInventorySubAll\(!showInventorySubAll\); playSound\('ui_move'\); \}\n              if \(activeIndex === 2\) \{ setInventoryDisplayLimit\(Math\.min\(120, inventoryDisplayLimit \+ 1\)\); playSound\('ui_move'\); \}\n            \}/g,
  "            } else if (activeTab === 'inventory') {\n              if (activeIndex === 0) { setShowInventoryMainAll(!showInventoryMainAll); playSound('ui_move'); }\n              if (activeIndex === 1) { setShowInventorySubAll(!showInventorySubAll); playSound('ui_move'); }\n              if (activeIndex === 2) { setInventoryDisplayLimit(Math.min(120, inventoryDisplayLimit + 1)); playSound('ui_move'); }\n            } else if (activeTab === 'control') {\n              if (activeIndex === 0) { setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_move'); }\n            }"
);

// 9. Right repeat
content = content.replace(
  /            \} else \{\n              if \(activeIndex === 2\) \{ setInventoryDisplayLimit\(Math\.min\(120, inventoryDisplayLimit \+ 1\)\); playSound\('ui_move'\); \}\n            \}/g,
  "            } else if (activeTab === 'inventory') {\n              if (activeIndex === 2) { setInventoryDisplayLimit(Math.min(120, inventoryDisplayLimit + 1)); playSound('ui_move'); }\n            }"
);

// 10. Btn A
content = content.replace(
  /            \} else \{\n              if \(activeIndex === 0\) \{ setShowInventoryMainAll\(!showInventoryMainAll\); playSound\('ui_select'\); \}\n              else if \(activeIndex === 1\) \{ setShowInventorySubAll\(!showInventorySubAll\); playSound\('ui_select'\); \}\n            \}/g,
  "            } else if (activeTab === 'inventory') {\n              if (activeIndex === 0) { setShowInventoryMainAll(!showInventoryMainAll); playSound('ui_select'); }\n              else if (activeIndex === 1) { setShowInventorySubAll(!showInventorySubAll); playSound('ui_select'); }\n            } else if (activeTab === 'control') {\n              if (activeIndex === 0) { setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_select'); }\n            }"
);

// 11. handleClose
content = content.replace(
  /    data\.inventoryDisplayLimit = inventoryDisplayLimit;\n    saveGameData\(data\);/g,
  "    data.inventoryDisplayLimit = inventoryDisplayLimit;\n    data.singleStickModeSetting = singleStickModeSetting;\n    saveGameData(data);"
);

// 12. Tabs header
content = content.replace(
  /          <div \n            onClick=\{\(\) => \{ setActiveTab\('inventory'\); setActiveIndex\(0\); playSound\('ui_tab_large'\); \}\}\n            style=\{\{ \n              padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',\n              border: `2px solid \$\{activeTab === 'inventory' \? '#a78bfa' : '#444'\}`,\n              background: activeTab === 'inventory' \? 'rgba\\(167, 139, 250, 0\.2\\)' : 'rgba\\(0,0,0,0\.3\\)',\n              color: activeTab === 'inventory' \? '#a78bfa' : '#666',\n              transition: 'all 0\.2s'\n            \}\}\n          >\n            🎒 INVENTORY\n          <\/div>\n        <\/div>/g,
  "          <div \n            onClick={() => { setActiveTab('inventory'); setActiveIndex(0); playSound('ui_tab_large'); }}\n            style={{ \n              padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',\n              border: `2px solid ${activeTab === 'inventory' ? '#a78bfa' : '#444'}`,\n              background: activeTab === 'inventory' ? 'rgba(167, 139, 250, 0.2)' : 'rgba(0,0,0,0.3)',\n              color: activeTab === 'inventory' ? '#a78bfa' : '#666',\n              transition: 'all 0.2s'\n            }}\n          >\n            🎒 INVENTORY\n          </div>\n          <div \n            onClick={() => { setActiveTab('control'); setActiveIndex(0); playSound('ui_tab_large'); }}\n            style={{ \n              padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',\n              border: `2px solid ${activeTab === 'control' ? '#ff9800' : '#444'}`,\n              background: activeTab === 'control' ? 'rgba(255, 152, 0, 0.2)' : 'rgba(0,0,0,0.3)',\n              color: activeTab === 'control' ? '#ff9800' : '#666',\n              transition: 'all 0.2s'\n            }}\n          >\n            🕹️ CONTROL\n          </div>\n        </div>"
);

// 13. activeIndex === 4 -> activeIndex === menuCount - 1
content = content.replace(
  /          \/\/ Back ボタン\n          if \(activeIndex === 4\) \{/g,
  "          // Back ボタン\n          if (activeIndex === menuCount - 1) {"
);

content = content.replace(
  /<div className=\{`settings-item \$\{activeIndex === 4 \? 'active' : ''\}`\} onMouseDown=\{handleClose\}>/g,
  "<div className={`settings-item ${activeIndex === menuCount - 1 ? 'active' : ''}`} onMouseDown={handleClose}>"
);

// 14. Add control tab content
content = content.replace(
  /          <div className=\{`settings-item \$\{activeIndex === menuCount - 1 \? 'active' : ''\}`\} onMouseDown=\{handleClose\}>/g,
  "          {activeTab === 'control' && (\n            <>\n              <div className={`settings-item ${activeIndex === 0 ? 'active' : ''}`} onMouseDown={() => setActiveIndex(0)}>\n                <div className=\"settings-label\" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_select'); }} style={{ cursor: 'pointer' }}>シングルスティックモード</div>\n                <div className=\"settings-control\">\n                  <span className=\"settings-value\" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_select'); }} style={{ cursor: 'pointer', width: '100%', textAlign: 'right', color: singleStickModeSetting === 'manual' ? '#fff' : (singleStickModeSetting === 'always_on' ? '#00e5ff' : '#aaa') }}>\n                    {singleStickModeSetting === 'manual' ? 'マニュアル' : (singleStickModeSetting === 'always_on' ? '常時ON' : '常時OFF')}\n                  </span>\n                </div>\n              </div>\n            </>\n          )}\n\n          <div className={`settings-item ${activeIndex === menuCount - 1 ? 'active' : ''}`} onMouseDown={handleClose}>"
);

fs.writeFileSync('SettingsUI.tsx', content, 'utf-8');
console.log('Update completed');
