import re

with open('SettingsUI.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. SettingsUIProps
content = re.sub(
    r'  setInventoryDisplayLimit: \(v: number\) => void;\n  isGamepadActive: boolean;\n}',
    r"  setInventoryDisplayLimit: (v: number) => void;\n  isGamepadActive: boolean;\n  singleStickModeSetting: 'manual' | 'always_on' | 'always_off';\n  setSingleStickModeSetting: (v: 'manual' | 'always_on' | 'always_off') => void;\n}",
    content
)

# 2. component signature
content = re.sub(
    r'  setShowInventoryMainAll, setShowInventorySubAll, setInventoryDisplayLimit,\n  isGamepadActive\n}\) => {',
    r'  setShowInventoryMainAll, setShowInventorySubAll, setInventoryDisplayLimit,\n  isGamepadActive, singleStickModeSetting, setSingleStickModeSetting\n}) => {',
    content
)

# 3. activeTab
content = re.sub(
    r"const \[activeTab, setActiveTab\] = useState<'audio' \| 'inventory'>\('audio'\);",
    r"const [activeTab, setActiveTab] = useState<'audio' | 'inventory' | 'control'>('audio');",
    content
)

# 4. menuCount
content = re.sub(
    r'  const AUDIO_ITEMS = 5; // Master, BGM, SE, Reset, Back\n  const INVENTORY_ITEMS = 5; // Main, Sub, Limit, Reset, Back\n  const menuCount = activeTab === \'audio\' \? AUDIO_ITEMS : INVENTORY_ITEMS;',
    r"  const AUDIO_ITEMS = 5;\n  const INVENTORY_ITEMS = 5;\n  const CONTROL_ITEMS = 2;\n  const menuCount = activeTab === 'audio' ? AUDIO_ITEMS : (activeTab === 'inventory' ? INVENTORY_ITEMS : CONTROL_ITEMS);",
    content
)

# 5. switchTab
content = re.sub(
    r"const tabs: Array<'audio' \| 'inventory'> = \['audio', 'inventory'\];",
    r"const tabs: Array<'audio' | 'inventory' | 'control'> = ['audio', 'inventory', 'control'];",
    content
)

# 6. Left control
content = re.sub(
    r"""            } else \{
              if \(activeIndex === 0\) \{ setShowInventoryMainAll\(!showInventoryMainAll\); playSound\('ui_move'\); \}
              if \(activeIndex === 1\) \{ setShowInventorySubAll\(!showInventorySubAll\); playSound\('ui_move'\); \}
              if \(activeIndex === 2\) \{ setInventoryDisplayLimit\(Math.max\(12, inventoryDisplayLimit - 1\)\); playSound\('ui_move'\); \}
            \}""",
    r"""            } else if (activeTab === 'inventory') {
              if (activeIndex === 0) { setShowInventoryMainAll(!showInventoryMainAll); playSound('ui_move'); }
              if (activeIndex === 1) { setShowInventorySubAll(!showInventorySubAll); playSound('ui_move'); }
              if (activeIndex === 2) { setInventoryDisplayLimit(Math.max(12, inventoryDisplayLimit - 1)); playSound('ui_move'); }
            } else if (activeTab === 'control') {
              if (activeIndex === 0) { setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_off' : (singleStickModeSetting === 'always_off' ? 'always_on' : 'manual')); playSound('ui_move'); }
            }""",
    content
)

# 7. Left repeat
content = re.sub(
    r"""            \} else \{
              if \(activeIndex === 2\) \{ setInventoryDisplayLimit\(Math.max\(12, inventoryDisplayLimit - 1\)\); playSound\('ui_move'\); \}
            \}""",
    r"""            } else if (activeTab === 'inventory') {
              if (activeIndex === 2) { setInventoryDisplayLimit(Math.max(12, inventoryDisplayLimit - 1)); playSound('ui_move'); }
            }""",
    content
)

# 8. Right control
content = re.sub(
    r"""            \} else \{
              if \(activeIndex === 0\) \{ setShowInventoryMainAll\(!showInventoryMainAll\); playSound\('ui_move'\); \}
              if \(activeIndex === 1\) \{ setShowInventorySubAll\(!showInventorySubAll\); playSound\('ui_move'\); \}
              if \(activeIndex === 2\) \{ setInventoryDisplayLimit\(Math.min\(120, inventoryDisplayLimit \+ 1\)\); playSound\('ui_move'\); \}
            \}""",
    r"""            } else if (activeTab === 'inventory') {
              if (activeIndex === 0) { setShowInventoryMainAll(!showInventoryMainAll); playSound('ui_move'); }
              if (activeIndex === 1) { setShowInventorySubAll(!showInventorySubAll); playSound('ui_move'); }
              if (activeIndex === 2) { setInventoryDisplayLimit(Math.min(120, inventoryDisplayLimit + 1)); playSound('ui_move'); }
            } else if (activeTab === 'control') {
              if (activeIndex === 0) { setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_move'); }
            }""",
    content
)

# 9. Right repeat
content = re.sub(
    r"""            \} else \{
              if \(activeIndex === 2\) \{ setInventoryDisplayLimit\(Math.min\(120, inventoryDisplayLimit \+ 1\)\); playSound\('ui_move'\); \}
            \}""",
    r"""            } else if (activeTab === 'inventory') {
              if (activeIndex === 2) { setInventoryDisplayLimit(Math.min(120, inventoryDisplayLimit + 1)); playSound('ui_move'); }
            }""",
    content
)

# 10. Btn A
content = re.sub(
    r"""            \} else \{
              if \(activeIndex === 0\) \{ setShowInventoryMainAll\(!showInventoryMainAll\); playSound\('ui_select'\); \}
              else if \(activeIndex === 1\) \{ setShowInventorySubAll\(!showInventorySubAll\); playSound\('ui_select'\); \}
            \}""",
    r"""            } else if (activeTab === 'inventory') {
              if (activeIndex === 0) { setShowInventoryMainAll(!showInventoryMainAll); playSound('ui_select'); }
              else if (activeIndex === 1) { setShowInventorySubAll(!showInventorySubAll); playSound('ui_select'); }
            } else if (activeTab === 'control') {
              if (activeIndex === 0) { setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_select'); }
            }""",
    content
)

# 11. handleClose
content = re.sub(
    r'    data\.inventoryDisplayLimit = inventoryDisplayLimit;\n    saveGameData\(data\);',
    r'    data.inventoryDisplayLimit = inventoryDisplayLimit;\n    data.singleStickModeSetting = singleStickModeSetting;\n    saveGameData(data);',
    content
)

# 12. Tabs header
content = re.sub(
    r"""          <div \n            onClick=\{\(\) => \{ setActiveTab\('inventory'\); setActiveIndex\(0\); playSound\('ui_tab_large'\); \}\}
            style=\{\{ 
              padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
              border: `2px solid \$\{activeTab === 'inventory' \? '#a78bfa' : '#444'\}`,
              background: activeTab === 'inventory' \? 'rgba\(167, 139, 250, 0\.2\)' : 'rgba\(0,0,0,0\.3\)',
              color: activeTab === 'inventory' \? '#a78bfa' : '#666',
              transition: 'all 0\.2s'
            \}\}
          >
            🎒 INVENTORY
          </div>
        </div>""",
    r"""          <div 
            onClick={() => { setActiveTab('inventory'); setActiveIndex(0); playSound('ui_tab_large'); }}
            style={{ 
              padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
              border: `2px solid ${activeTab === 'inventory' ? '#a78bfa' : '#444'}`,
              background: activeTab === 'inventory' ? 'rgba(167, 139, 250, 0.2)' : 'rgba(0,0,0,0.3)',
              color: activeTab === 'inventory' ? '#a78bfa' : '#666',
              transition: 'all 0.2s'
            }}
          >
            🎒 INVENTORY
          </div>
          <div 
            onClick={() => { setActiveTab('control'); setActiveIndex(0); playSound('ui_tab_large'); }}
            style={{ 
              padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
              border: `2px solid ${activeTab === 'control' ? '#ff9800' : '#444'}`,
              background: activeTab === 'control' ? 'rgba(255, 152, 0, 0.2)' : 'rgba(0,0,0,0.3)',
              color: activeTab === 'control' ? '#ff9800' : '#666',
              transition: 'all 0.2s'
            }}
          >
            🕹️ CONTROL
          </div>
        </div>""",
    content
)

# 13. activeIndex === 4 -> activeIndex === menuCount - 1
content = re.sub(
    r"""          // Back ボタン
          if \(activeIndex === 4\) \{""",
    r"""          // Back ボタン
          if (activeIndex === menuCount - 1) {""",
    content
)

content = re.sub(
    r'<div className=\{`settings-item \$\{activeIndex === 4 \? \'active\' : \'\'\}`\} onMouseDown=\{handleClose\}>',
    r'<div className={`settings-item ${activeIndex === menuCount - 1 ? \'active\' : \'\'}`} onMouseDown={handleClose}>',
    content
)

# 14. Add control tab content
content = re.sub(
    r"""          <div className=\{`settings-item \$\{activeIndex === menuCount - 1 \? 'active' : ''\}`\} onMouseDown=\{handleClose\}>""",
    r"""          {activeTab === 'control' && (
            <>
              <div className={`settings-item ${activeIndex === 0 ? 'active' : ''}`} onMouseDown={() => setActiveIndex(0)}>
                <div className="settings-label" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_select'); }} style={{ cursor: 'pointer' }}>シングルスティックモード</div>
                <div className="settings-control">
                  <span className="settings-value" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_select'); }} style={{ cursor: 'pointer', width: '100%', textAlign: 'right', color: singleStickModeSetting === 'manual' ? '#fff' : (singleStickModeSetting === 'always_on' ? '#00e5ff' : '#aaa') }}>
                    {singleStickModeSetting === 'manual' ? 'マニュアル' : (singleStickModeSetting === 'always_on' ? '常時ON' : '常時OFF')}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className={`settings-item ${activeIndex === menuCount - 1 ? 'active' : ''}`} onMouseDown={handleClose}>""",
    content
)


with open('SettingsUI.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
