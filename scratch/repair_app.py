import os
import re

app_path = r'c:\Users\mykasi\Desktop\MGProject\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Reconstruct everything from Line 1100 to 1600 to be safe
# But we don't have the whole file. 

# Let's try to find and replace the major mess.
content = "".join(lines)

# Fix the renderCurrentStatusPanels mess
bad_block_start = "activeSkills.map(r => ("
bad_block_end = "Press Gamepad [A] / [Start] to select'}"
# We'll search for this pair and replace whatever is in between.

def repair():
    global content
    
    # 1. Restore Gamepad Title Loop with titleMenuIndex
    gamepad_old = """        const aPressed = mainDevice.buttons[0] > 0.5; // A繝懊ち繝ｳ
        const startPressed = mainDevice.buttons[9] > 0.5; // Start繝懊ち繝ｳ
 
        if ((aPressed && !lastAPressed) || (startPressed && !lastStartPressed)) {
          if (Date.now() - titleEnterTimeRef.current > 500) {
            handleStartGame();
            return; // 繧ｲ繝ｼ繝髢句ｧ九＠縺溘ｉ逶｣隕悶ｒ謚懊￠繧
          }
        }"""
    
    gamepad_new = """        const aPressed = mainDevice.buttons[0] > 0.5; // Aボタン
        const startPressed = mainDevice.buttons[9] > 0.5; // Startボタン
        const upPressed = mainDevice.buttons[12] > 0.5 || (mainDevice.axes[9] !== undefined && mainDevice.axes[9] < -0.7) || (mainDevice.axes[7] !== undefined && mainDevice.axes[7] < -0.5);
        const downPressed = mainDevice.buttons[13] > 0.5 || (mainDevice.axes[9] !== undefined && mainDevice.axes[9] > 0.1) || (mainDevice.axes[7] !== undefined && mainDevice.axes[7] > 0.5);

        if (upPressed && !lastDpadUp.current) setTitleMenuIndex(0);
        if (downPressed && !lastDpadDown.current) setTitleMenuIndex(1);
        lastDpadUp.current = upPressed;
        lastDpadDown.current = downPressed;

        if ((aPressed && !lastAPressed) || (startPressed && !lastStartPressed)) {
          if (Date.now() - titleEnterTimeRef.current > 500) {
            if (titleMenuIndex === 0) handleStartGame();
            else setIsUpdateScreen(true);
            return; // ゲーム開始したら監視を抜ける
          }
        }"""
        
    # Since characters are garbled, we might need a regex approach or find unique anchors.
    content = re.sub(r'const aPressed = mainDevice\.buttons\[0\] > 0\.5;.*?lastStartPressed = startPressed;', gamepad_new + "\n        lastAPressed = aPressed;\n        lastStartPressed = startPressed;", content, flags=re.DOTALL)

    # 2. Fix renderCurrentStatusPanels
    status_fix = """                    {activeSkills.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: '16px' }}>{getRewardIcon(r.id)}</span>
                        <span style={{ fontSize: '12px', color: '#fff' }}>{r.name} <span style={{ color: '#ffeb3b', fontWeight: 'bold' }}>Lv.{r.count}</span></span>
                      </div>
                    ))}
                  </div>
                )}
                {passiveSkills.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {passiveSkills.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: '16px' }}>{getRewardIcon(r.id)}</span>
                        <span style={{ fontSize: '12px', color: '#fff' }}>{r.name} <span style={{ color: '#ffeb3b', fontWeight: 'bold' }}>Lv.{r.count}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : <span style={{ color: '#aaa', fontSize: '12px' }}>取得済みリワードなし</span>}
          </div>
        </div>
      </div>
    );
  };"""
    
    # Replace from activeSkills.map(r => ( to the end of the messy block
    content = re.sub(r'\{activeSkills\.map\(r => \(.*?Press Gamepad \[A\] / \[Start\] to select\'\}', status_fix, content, flags=re.DOTALL)

    # 3. Fix Title Overlay at the end
    title_overlay = """      {/* 【修正】タイトル画面のオーバーレイ */}
      {isTitleScreen && (
        <div className="title-overlay" style={{
          position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at center, #1a1a2e 0%, #06060f 100%)',
          color: '#fff', userSelect: 'none', overflow: 'hidden'
        }}>
          {isUpdateScreen ? (
            <UpdateUI onClose={() => setIsUpdateScreen(false)} />
          ) : (
            <>
              {/* 背景のワイヤーフレームキューブ */}
              <div style={{
                position: 'absolute', inset: 0, zIndex: -1, opacity: 0.2,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <div className="rotating-wireframe-cube" style={{ width: '300px', height: '300px' }}>
                  <div className="cube-face" style={{ transform: 'translateZ(150px)' }} />
                  <div className="cube-face" style={{ transform: 'translateZ(-150px) rotateY(180deg)' }} />
                  <div className="cube-face" style={{ transform: 'translateY(150px) rotateX(90deg)' }} />
                  <div className="cube-face" style={{ transform: 'translateY(-150px) rotateX(-90deg)' }} />
                  <div className="cube-face" style={{ transform: 'translateX(150px) rotateY(90deg)' }} />
                  <div className="cube-face" style={{ transform: 'translateX(-150px) rotateY(-90deg)' }} />
                </div>
              </div>

              {/* ロゴ画像 */}
              <img src="/logo.png" alt="MEGA CUBE RUSH" className="neon-flicker" style={{
                width: '80%', maxWidth: '500px', height: 'auto', marginBottom: '8px',
                filter: 'drop-shadow(0 0 15px rgba(167,139,250,0.8))'
              }} />

              {/* サブタイトル */}
              <div style={{ fontSize: '24px', letterSpacing: '4px', color: '#fff', textShadow: '0 0 8px rgba(255,255,255,0.5)', marginBottom: '32px' }}>
                メガキューブ・ラッシュ
              </div>

              <div style={{ marginTop: '64px', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
                <button onClick={handleStartGame} style={{
                  padding: '16px 48px', fontSize: '24px', fontWeight: 'bold', background: titleMenuIndex === 0 ? 'rgba(0,229,255,0.2)' : 'transparent',
                  color: '#00e5ff', border: '2px solid #00e5ff', borderRadius: '8px', cursor: 'pointer',
                  boxShadow: titleMenuIndex === 0 ? '0 0 25px rgba(0,229,255,0.6), inset 0 0 15px rgba(0,229,255,0.4)' : '0 0 15px rgba(0,229,255,0.3), inset 0 0 10px rgba(0,229,255,0.2)', transition: 'all 0.3s',
                  animation: titleMenuIndex === 0 ? 'pulse 2s infinite' : 'none'
                }}
                  onMouseOver={() => setTitleMenuIndex(0)}
                >
                  START GAME
                </button>

                <button onClick={() => setIsUpdateScreen(true)} style={{
                  padding: '12px 36px', fontSize: '20px', fontWeight: 'bold', background: titleMenuIndex === 1 ? 'rgba(213,0,249,0.2)' : 'transparent',
                  color: '#d500f9', border: '2px solid #d500f9', borderRadius: '8px', cursor: 'pointer',
                  boxShadow: titleMenuIndex === 1 ? '0 0 25px rgba(213,0,249,0.6), inset 0 0 15px rgba(213,0,249,0.4)' : '0 0 15px rgba(213,0,249,0.3), inset 0 0 10px rgba(213,0,249,0.2)', transition: 'all 0.3s'
                }}
                  onMouseOver={() => setTitleMenuIndex(1)}
                >
                  UPDATE
                </button>
              </div>

              {/* 操作説明 */}
              <div style={{ marginTop: '24px', color: '#888', fontSize: '14px' }}>
                {activeDevice === 'keyboard' ? 'Press [Enter] / [Space] to select' : 'Press Gamepad [A] / [Start] to select'}
              </div>
            </>
          )}
        </div>
      )}"""

    # We need to find the old title screen block. It usually starts with {isTitleScreen && ( and ends with {!isTitleScreen && (
    content = re.sub(r'\{\/\* 【修正】タイトル画面のオーバーレイ \*\/\}.*?(?=\{!isTitleScreen && \()', title_overlay + "\n      ", content, flags=re.DOTALL)

    with open(app_path, 'w', encoding='utf-8') as f:
        f.write(content)

repair()
