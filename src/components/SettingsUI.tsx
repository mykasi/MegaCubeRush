import React, { useState, useEffect, useRef } from 'react';
import { useGamepad } from '../hooks/useGamepad';
import { playSound } from '../game/soundBus';
import { getSaveData, saveGameData } from '../game/saveData';

interface SettingsUIProps {
  onClose: () => void;
  bgmVolume: number;
  seVolume: number;
  masterVolume: number;
  setBgmVolume: (v: number) => void;
  setSeVolume: (v: number) => void;
  setMasterVolume: (v: number) => void;
  showInventoryMainAll: boolean;
  showInventorySubAll: boolean;
  inventoryDisplayLimit: number;
  setShowInventoryMainAll: (v: boolean) => void;
  setShowInventorySubAll: (v: boolean) => void;
  setInventoryDisplayLimit: (v: number) => void;
  isGamepadActive: boolean;
  // ※コード上の singleStickModeSetting は「シンクロモード」の設定に対応します
  singleStickModeSetting: 'manual' | 'always_on' | 'always_off';
  setSingleStickModeSetting: (v: 'manual' | 'always_on' | 'always_off') => void;
  playerSkinSetting: 'default' | 'sphere' | 'crystal' | 'armor' | 'satellite';
  setPlayerSkinSetting: (v: 'default' | 'sphere' | 'crystal' | 'armor' | 'satellite') => void;
}

export const SettingsUI: React.FC<SettingsUIProps> = ({
  onClose, bgmVolume, seVolume, masterVolume, setBgmVolume, setSeVolume, setMasterVolume,
  showInventoryMainAll, showInventorySubAll, inventoryDisplayLimit,
  setShowInventoryMainAll, setShowInventorySubAll, setInventoryDisplayLimit,
  isGamepadActive, singleStickModeSetting, setSingleStickModeSetting,
  playerSkinSetting, setPlayerSkinSetting
}) => {
  const [activeTab, setActiveTab] = useState<'audio' | 'inventory' | 'control'>('audio');
  const [activeIndex, setActiveIndex] = useState(0); 
  const skins: Array<'default' | 'sphere' | 'crystal' | 'armor' | 'satellite'> = ['default', 'sphere', 'crystal', 'armor', 'satellite']; 
  const [isBgmMuted, setIsBgmMuted] = useState(bgmVolume === 0);
  const [isSeMuted, setIsSeMuted] = useState(seVolume === 0);
  const [isMasterMuted, setIsMasterMuted] = useState(masterVolume === 0);

  // ミュート解除時に戻すための音量保持用
  const prevBgmVolumeRef = useRef(bgmVolume > 0 ? bgmVolume : 0.2);
  const prevSeVolumeRef = useRef(seVolume > 0 ? seVolume : 0.5);
  const prevMasterVolumeRef = useRef(masterVolume > 0 ? masterVolume : 0.5);

  const { poll } = useGamepad();
  
  // 各タブの項目数
  const AUDIO_ITEMS = 5;
  const INVENTORY_ITEMS = 5;
  const CONTROL_ITEMS = 3;
  const menuCount = activeTab === 'audio' ? AUDIO_ITEMS : (activeTab === 'inventory' ? INVENTORY_ITEMS : CONTROL_ITEMS);

  // カーソル移動用のタメとリピート管理
  const REPEAT_DELAY = 400;
  const REPEAT_INTERVAL = 80;

  const lastDpadUp = useRef(false);
  const lastDpadDown = useRef(false);
  const lastDpadLeft = useRef(false);
  const lastDpadRight = useRef(false);
  const lastLB = useRef(false);
  const lastRB = useRef(false);
  const nextUpTime = useRef(0);
  const nextDownTime = useRef(0);
  const nextLeftTime = useRef(0);
  const nextRightTime = useRef(0);
  const lastA = useRef(false);
  const lastB = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleToggleMute = (type: 'bgm' | 'se' | 'master') => {
    if (type === 'bgm') {
      if (!isBgmMuted) {
        prevBgmVolumeRef.current = bgmVolume;
        setBgmVolume(0);
        setIsBgmMuted(true);
        playSound('ui_cancel');
      } else {
        setBgmVolume(prevBgmVolumeRef.current || 0.1);
        setIsBgmMuted(false);
        playSound('ui_select');
      }
    } else if (type === 'se') {
      if (!isSeMuted) {
        prevSeVolumeRef.current = seVolume;
        setSeVolume(0);
        setIsSeMuted(true);
        playSound('ui_cancel');
      } else {
        setSeVolume(prevSeVolumeRef.current || 0.3);
        setIsSeMuted(false);
        playSound('ui_select');
      }
    } else {
      if (!isMasterMuted) {
        prevMasterVolumeRef.current = masterVolume;
        setMasterVolume(0);
        setIsMasterMuted(true);
        playSound('ui_cancel');
      } else {
        setMasterVolume(prevMasterVolumeRef.current || 1.0);
        setIsMasterMuted(false);
        playSound('ui_select');
      }
    }
  };

  const handleResetAudio = () => {
    setMasterVolume(0.5);
    setBgmVolume(0.2);
    setSeVolume(0.5);
    setIsMasterMuted(false);
    setIsBgmMuted(false);
    setIsSeMuted(false);
    playSound('ui_select');
    setShowResetConfirm(false);
  };

  const handleResetInventory = () => {
    setShowInventoryMainAll(false);
    setShowInventorySubAll(true);
    setInventoryDisplayLimit(60);
    playSound('ui_select');
    setShowResetConfirm(false);
  };

  const handleClose = () => {
    const data = getSaveData();
    data.bgmVolume = bgmVolume;
    data.seVolume = seVolume;
    data.masterVolume = masterVolume;
    data.showInventoryMainAll = showInventoryMainAll;
    data.showInventorySubAll = showInventorySubAll;
    data.inventoryDisplayLimit = inventoryDisplayLimit;
    // ※コード上の singleStickModeSetting = シンクロモード設定
    data.singleStickModeSetting = singleStickModeSetting;
    data.playerSkinSetting = playerSkinSetting;
    saveGameData(data);

    playSound('ui_cancel');
    onClose();
  };

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetConfirmIndex, setResetConfirmIndex] = useState(1); // 0: はい, 1: いいえ
  const resetConfirmIndexRef = useRef(1);
  useEffect(() => { resetConfirmIndexRef.current = resetConfirmIndex; }, [resetConfirmIndex]);

  const keysPressed = useRef<Record<string, boolean>>({});
  useEffect(() => {
    const down = (e: KeyboardEvent) => { keysPressed.current[e.key] = true; };
    const up = (e: KeyboardEvent) => { keysPressed.current[e.key] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);

    const { mainDevice } = poll();
    if (mainDevice) {
      lastA.current = mainDevice.buttons[0] > 0.5;
      lastB.current = mainDevice.buttons[1] > 0.5;
      lastLB.current = mainDevice.buttons[4] > 0.5;
      lastRB.current = mainDevice.buttons[5] > 0.5;
      lastDpadUp.current = mainDevice.buttons[12] > 0.5;
      lastDpadDown.current = mainDevice.buttons[13] > 0.5;
      lastDpadLeft.current = mainDevice.buttons[14] > 0.5;
      lastDpadRight.current = mainDevice.buttons[15] > 0.5;
    }

    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const switchTab = (dir: number) => {
    const tabs: Array<'audio' | 'inventory' | 'control'> = ['audio', 'inventory', 'control'];
    const currentIdx = tabs.indexOf(activeTab);
    const nextIdx = (currentIdx + dir + tabs.length) % tabs.length;
    setActiveTab(tabs[nextIdx]);
    setActiveIndex(0);
    playSound('ui_tab_large');
  };

  // 入力ループ
  useEffect(() => {
    let frameId: number;

    const loop = () => {
      const { mainDevice } = poll();
      const now = Date.now();

      const kb = keysPressed.current;
      const up = ((mainDevice?.buttons[12] ?? 0) > 0.5) || kb['ArrowUp'] || kb['w'] || kb['W'];
      const down = ((mainDevice?.buttons[13] ?? 0) > 0.5) || kb['ArrowDown'] || kb['s'] || kb['S'];
      const left = ((mainDevice?.buttons[14] ?? 0) > 0.5) || kb['ArrowLeft'] || kb['a'] || kb['A'];
      const right = ((mainDevice?.buttons[15] ?? 0) > 0.5) || kb['ArrowRight'] || kb['d'] || kb['D'];
      const btnA = ((mainDevice?.buttons[0] ?? 0) > 0.5) || kb['Enter'] || kb[' '];
      const btnB = ((mainDevice?.buttons[1] ?? 0) > 0.5) || kb['Escape'] || kb['Backspace'];
      const lb = ((mainDevice?.buttons[4] ?? 0) > 0.5) || kb['q'] || kb['Q'];
      const rb = ((mainDevice?.buttons[5] ?? 0) > 0.5) || kb['e'] || kb['E'];

      // Tab 切り替え
      if (!showResetConfirm) {
        if (lb && !lastLB.current) switchTab(-1);
        if (rb && !lastRB.current) switchTab(1);

        // PageUp / PageDown
        if (kb['PageUp']) {
          scrollRef.current?.scrollBy({ top: -300, behavior: 'smooth' });
          kb['PageUp'] = false; // 簡易的なトリガー
        }
        if (kb['PageDown']) {
          scrollRef.current?.scrollBy({ top: 300, behavior: 'smooth' });
          kb['PageDown'] = false;
        }

        // 右スティックでスクロール
        const rsY = mainDevice?.axes[3];
        if (rsY && Math.abs(rsY) > 0.2) {
          scrollRef.current?.scrollBy({ top: rsY * 15 });
        }
      }
      lastLB.current = lb;
      lastRB.current = rb;

      // Up 制御
      if (!showResetConfirm && up) {
        if (!lastDpadUp.current) {
          setActiveIndex((prev) => (prev - 1 + menuCount) % menuCount);
          playSound('ui_move');
          nextUpTime.current = now + REPEAT_DELAY;
        } else if (now >= nextUpTime.current) {
          setActiveIndex((prev) => (prev - 1 + menuCount) % menuCount);
          playSound('ui_move');
          nextUpTime.current = now + REPEAT_INTERVAL;
        }
      }
      lastDpadUp.current = up;

      // Down 制御
      if (!showResetConfirm && down) {
        if (!lastDpadDown.current) {
          setActiveIndex((prev) => (prev + 1) % menuCount);
          playSound('ui_move');
          nextDownTime.current = now + REPEAT_DELAY;
        } else if (now >= nextDownTime.current) {
          setActiveIndex((prev) => (prev + 1) % menuCount);
          playSound('ui_move');
          nextDownTime.current = now + REPEAT_INTERVAL;
        }
      }
      lastDpadDown.current = down;

      // Left 制御
      if (left) {
        if (!lastDpadLeft.current) {
          if (showResetConfirm) {
            if (resetConfirmIndexRef.current !== 0) playSound('ui_move');
            setResetConfirmIndex(0);
          } else {
            if (activeTab === 'audio') {
              if (activeIndex === 0) { setMasterVolume(Math.max(0, masterVolume - 0.01)); setIsMasterMuted(false); }
              if (activeIndex === 1) { setBgmVolume(Math.max(0, bgmVolume - 0.01)); setIsBgmMuted(false); }
              if (activeIndex === 2) { setSeVolume(Math.max(0, seVolume - 0.01)); setIsSeMuted(false); playSound('ui_move'); }
            } else if (activeTab === 'inventory') {
              if (activeIndex === 0) { setShowInventoryMainAll(!showInventoryMainAll); playSound('ui_move'); }
              if (activeIndex === 1) { setShowInventorySubAll(!showInventorySubAll); playSound('ui_move'); }
              if (activeIndex === 2) { setInventoryDisplayLimit(Math.max(12, inventoryDisplayLimit - 1)); playSound('ui_move'); }
            } else if (activeTab === 'control') {
              if (activeIndex === 0) { setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_off' : (singleStickModeSetting === 'always_off' ? 'always_on' : 'manual')); playSound('ui_move'); }
              if (activeIndex === 1) {
                const currentIdx = skins.indexOf(playerSkinSetting);
                const nextIdx = (currentIdx - 1 + skins.length) % skins.length;
                setPlayerSkinSetting(skins[nextIdx]);
                playSound('ui_move');
              }
            }
          }
          nextLeftTime.current = now + REPEAT_DELAY;
        } else if (now >= nextLeftTime.current) {
          if (!showResetConfirm) {
            if (activeTab === 'audio') {
              if (activeIndex === 0) { setMasterVolume(Math.max(0, masterVolume - 0.01)); setIsMasterMuted(false); }
              if (activeIndex === 1) { setBgmVolume(Math.max(0, bgmVolume - 0.01)); setIsBgmMuted(false); }
              if (activeIndex === 2) { setSeVolume(Math.max(0, seVolume - 0.01)); setIsSeMuted(false); playSound('ui_move'); }
            } else if (activeTab === 'inventory') {
              if (activeIndex === 2) { setInventoryDisplayLimit(Math.max(12, inventoryDisplayLimit - 1)); playSound('ui_move'); }
            }
          }
          nextLeftTime.current = now + REPEAT_INTERVAL;
        }
      }
      lastDpadLeft.current = left;

      // Right 制御
      if (right) {
        if (!lastDpadRight.current) {
          if (showResetConfirm) {
            if (resetConfirmIndexRef.current !== 1) playSound('ui_move');
            setResetConfirmIndex(1);
          } else {
            if (activeTab === 'audio') {
              if (activeIndex === 0) { setMasterVolume(Math.min(1.0, masterVolume + 0.01)); setIsMasterMuted(false); }
              if (activeIndex === 1) { setBgmVolume(Math.min(1.0, bgmVolume + 0.01)); setIsBgmMuted(false); }
              if (activeIndex === 2) { setSeVolume(Math.min(1.0, seVolume + 0.01)); setIsSeMuted(false); playSound('ui_move'); }
            } else if (activeTab === 'inventory') {
              if (activeIndex === 0) { setShowInventoryMainAll(!showInventoryMainAll); playSound('ui_move'); }
              if (activeIndex === 1) { setShowInventorySubAll(!showInventorySubAll); playSound('ui_move'); }
              if (activeIndex === 2) { setInventoryDisplayLimit(Math.min(120, inventoryDisplayLimit + 1)); playSound('ui_move'); }
            } else if (activeTab === 'control') {
              if (activeIndex === 0) { setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_move'); }
              if (activeIndex === 1) {
                const currentIdx = skins.indexOf(playerSkinSetting);
                const nextIdx = (currentIdx + 1) % skins.length;
                setPlayerSkinSetting(skins[nextIdx]);
                playSound('ui_move');
              }
            }
          }
          nextRightTime.current = now + REPEAT_DELAY;
        } else if (now >= nextRightTime.current) {
          if (!showResetConfirm) {
            if (activeTab === 'audio') {
              if (activeIndex === 0) { setMasterVolume(Math.min(1.0, masterVolume + 0.01)); setIsMasterMuted(false); }
              if (activeIndex === 1) { setBgmVolume(Math.min(1.0, bgmVolume + 0.01)); setIsBgmMuted(false); }
              if (activeIndex === 2) { setSeVolume(Math.min(1.0, seVolume + 0.01)); setIsSeMuted(false); playSound('ui_move'); }
            } else if (activeTab === 'inventory') {
              if (activeIndex === 2) { setInventoryDisplayLimit(Math.min(120, inventoryDisplayLimit + 1)); playSound('ui_move'); }
            }
          }
          nextRightTime.current = now + REPEAT_INTERVAL;
        }
      }
      lastDpadRight.current = right;

      if (btnA && !lastA.current) {
        if (showResetConfirm) {
          if (resetConfirmIndexRef.current === 0) {
            if (activeTab === 'audio') handleResetAudio();
            else handleResetInventory();
          } else {
            playSound('ui_cancel');
            setShowResetConfirm(false);
          }
        } else {
          // Back ボタン
          if (activeIndex === menuCount - 1) {
            handleClose();
          } 
          // Reset ボタン
          else if (activeIndex === 3) {
            setResetConfirmIndex(1);
            setShowResetConfirm(true);
            playSound('ui_select');
          } 
          // 項目アクション
          else {
            if (activeTab === 'audio') {
              if (activeIndex === 0) handleToggleMute('master');
              else if (activeIndex === 1) handleToggleMute('bgm');
              else if (activeIndex === 2) handleToggleMute('se');
            } else if (activeTab === 'inventory') {
              if (activeIndex === 0) { setShowInventoryMainAll(!showInventoryMainAll); playSound('ui_select'); }
              else if (activeIndex === 1) { setShowInventorySubAll(!showInventorySubAll); playSound('ui_select'); }
            } else if (activeTab === 'control') {
              if (activeIndex === 0) { setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_select'); }
              if (activeIndex === 1) {
                const currentIdx = skins.indexOf(playerSkinSetting);
                const nextIdx = (currentIdx + 1) % skins.length;
                setPlayerSkinSetting(skins[nextIdx]);
                playSound('ui_select');
              }
            }
          }
        }
      }
      if (btnB && !lastB.current) {
        if (showResetConfirm) {
          playSound('ui_cancel');
          setShowResetConfirm(false);
        } else {
          handleClose();
        }
      }

      lastA.current = btnA;
      lastB.current = btnB;
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [
    poll, activeIndex, activeTab, bgmVolume, seVolume, masterVolume, isBgmMuted, isSeMuted, isMasterMuted,
    showInventoryMainAll, showInventorySubAll, inventoryDisplayLimit, showResetConfirm, menuCount,
    setBgmVolume, setSeVolume, setMasterVolume, setShowInventoryMainAll, setShowInventorySubAll, setInventoryDisplayLimit,
    singleStickModeSetting, setSingleStickModeSetting, playerSkinSetting, setPlayerSkinSetting
  ]);

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <h2 className="settings-title">Settings</h2>

        {/* タブヘッダー */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
          <div 
            onClick={() => { setActiveTab('audio'); setActiveIndex(0); playSound('ui_tab_large'); }}
            style={{ 
              padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold',
              border: `2px solid ${activeTab === 'audio' ? '#00e5ff' : '#444'}`,
              background: activeTab === 'audio' ? 'rgba(0, 229, 255, 0.2)' : 'rgba(0,0,0,0.3)',
              color: activeTab === 'audio' ? '#00e5ff' : '#666',
              transition: 'all 0.2s'
            }}
          >
            🔊 AUDIO
          </div>
          <div 
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
              border: `2px solid ${activeTab === 'control' ? '#00e5ff' : '#444'}`,
              background: activeTab === 'control' ? 'rgba(0, 229, 255, 0.2)' : 'rgba(0,0,0,0.3)',
              color: activeTab === 'control' ? '#00e5ff' : '#666',
              transition: 'all 0.2s'
            }}
          >
            🎮 PLAYER
          </div>
        </div>

        <div className="settings-content" ref={scrollRef}>
          {activeTab === 'audio' && (
            <>
              {/* マスター音量 */}
              <div className={`settings-item ${activeIndex === 0 ? 'active' : ''} ${isMasterMuted ? 'muted' : ''}`} onMouseDown={() => setActiveIndex(0)}>
                <div className="settings-label" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); handleToggleMute('master'); }} style={{ cursor: 'pointer' }}>マスター音量</div>
                <div className="settings-control">
                  <div className="settings-bar-bg">
                    <div className="settings-bar-fill" style={{ width: `${(isMasterMuted ? prevMasterVolumeRef.current : masterVolume) * 100}%`, opacity: isMasterMuted ? 0.3 : 1 }}></div>
                    <input type="range" min="0" max="1" step="0.01" value={isMasterMuted ? prevMasterVolumeRef.current : masterVolume} onChange={(e) => { setMasterVolume(parseFloat(e.target.value)); if (parseFloat(e.target.value) > 0) setIsMasterMuted(false); }} className="settings-range-input" />
                  </div>
                  <span className="settings-value" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); handleToggleMute('master'); }} style={{ cursor: 'pointer', minWidth: '80px', textAlign: 'right' }}>{isMasterMuted ? 'ミュート' : `${Math.round(masterVolume * 100)}%`}</span>
                </div>
              </div>

              {/* BGM音量 */}
              <div className={`settings-item ${activeIndex === 1 ? 'active' : ''} ${isBgmMuted ? 'muted' : ''}`} onMouseDown={() => setActiveIndex(1)}>
                <div className="settings-label" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(1); handleToggleMute('bgm'); }} style={{ cursor: 'pointer' }}>BGM音量</div>
                <div className="settings-control">
                  <div className="settings-bar-bg">
                    <div className="settings-bar-fill" style={{ width: `${(isBgmMuted ? prevBgmVolumeRef.current : bgmVolume) * 100}%`, opacity: isBgmMuted ? 0.3 : 1 }}></div>
                    <input type="range" min="0" max="1" step="0.01" value={isBgmMuted ? prevBgmVolumeRef.current : bgmVolume} onChange={(e) => { setBgmVolume(parseFloat(e.target.value)); if (parseFloat(e.target.value) > 0) setIsBgmMuted(false); }} className="settings-range-input" />
                  </div>
                  <span className="settings-value" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(1); handleToggleMute('bgm'); }} style={{ cursor: 'pointer', minWidth: '80px', textAlign: 'right' }}>{isBgmMuted ? 'ミュート' : `${Math.round(bgmVolume * 100)}%`}</span>
                </div>
              </div>

              {/* SE音量 */}
              <div className={`settings-item ${activeIndex === 2 ? 'active' : ''} ${isSeMuted ? 'muted' : ''}`} onMouseDown={() => setActiveIndex(2)}>
                <div className="settings-label" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(2); handleToggleMute('se'); }} style={{ cursor: 'pointer' }}>SE音量</div>
                <div className="settings-control">
                  <div className="settings-bar-bg">
                    <div className="settings-bar-fill" style={{ width: `${(isSeMuted ? prevSeVolumeRef.current : seVolume) * 100}%`, opacity: isSeMuted ? 0.3 : 1 }}></div>
                    <input type="range" min="0" max="1" step="0.01" value={isSeMuted ? prevSeVolumeRef.current : seVolume} onChange={(e) => { setSeVolume(parseFloat(e.target.value)); if (parseFloat(e.target.value) > 0) setIsSeMuted(false); }} className="settings-range-input" />
                  </div>
                  <span className="settings-value" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(2); handleToggleMute('se'); }} style={{ cursor: 'pointer', minWidth: '80px', textAlign: 'right' }}>{isSeMuted ? 'ミュート' : `${Math.round(seVolume * 100)}%`}</span>
                </div>
              </div>

              <div className={`settings-item ${activeIndex === 3 ? 'active' : ''}`} onMouseDown={() => { setActiveIndex(3); setResetConfirmIndex(1); setShowResetConfirm(true); playSound('ui_select'); }}>
                <div className="settings-label" style={{ textAlign: 'center', width: '100%', cursor: 'pointer', color: '#ff5252' }}>音量設定をデフォルトに戻す</div>
              </div>
            </>
          )}

          {activeTab === 'inventory' && (
            <>
              <div className={`settings-item ${activeIndex === 0 ? 'active' : ''}`} onMouseDown={() => setActiveIndex(0)}>
                <div className="settings-label" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); setShowInventoryMainAll(!showInventoryMainAll); playSound('ui_select'); }} style={{ cursor: 'pointer' }}>インベントリ大項目 「全て」タブ表示</div>
                <div className="settings-control" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', marginRight: 'auto', gap: '1px' }}>
                    {[0, 1].map((idx) => {
                      const isCurrent = (showInventoryMainAll ? 1 : 0) === idx;
                      return (
                        <span 
                          key={idx}
                          onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); setShowInventoryMainAll(idx === 1); playSound('ui_select'); }}
                          style={{ cursor: 'pointer', color: '#00e5ff', fontSize: '14px', padding: '2px 2px', userSelect: 'none' }}
                        >
                          {isCurrent ? '■' : '□'}
                        </span>
                      );
                    })}
                  </div>
                  <span 
                    className="settings-value" 
                    onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); setShowInventoryMainAll(!showInventoryMainAll); playSound('ui_select'); }}
                    style={{ cursor: 'pointer', textAlign: 'right', minWidth: '80px' }}
                  >
                    {showInventoryMainAll ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              <div className={`settings-item ${activeIndex === 1 ? 'active' : ''}`} onMouseDown={() => setActiveIndex(1)}>
                <div className="settings-label" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(1); setShowInventorySubAll(!showInventorySubAll); playSound('ui_select'); }} style={{ cursor: 'pointer' }}>インベントリ小項目 「ALL」タブ表示</div>
                <div className="settings-control" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', marginRight: 'auto', gap: '1px' }}>
                    {[0, 1].map((idx) => {
                      const isCurrent = (showInventorySubAll ? 1 : 0) === idx;
                      return (
                        <span 
                          key={idx}
                          onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(1); setShowInventorySubAll(idx === 1); playSound('ui_select'); }}
                          style={{ cursor: 'pointer', color: '#00e5ff', fontSize: '14px', padding: '2px 2px', userSelect: 'none' }}
                        >
                          {isCurrent ? '■' : '□'}
                        </span>
                      );
                    })}
                  </div>
                  <span 
                    className="settings-value" 
                    onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(1); setShowInventorySubAll(!showInventorySubAll); playSound('ui_select'); }}
                    style={{ cursor: 'pointer', textAlign: 'right', minWidth: '80px' }}
                  >
                    {showInventorySubAll ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              <div className={`settings-item ${activeIndex === 2 ? 'active' : ''}`} onMouseDown={() => setActiveIndex(2)}>
                <div className="settings-label">インベントリ小項目 最大アイテム表示数</div>
                <div className="settings-control">
                  <div className="settings-bar-bg">
                    <div className="settings-bar-fill" style={{ width: `${((inventoryDisplayLimit - 12) / (120 - 12)) * 100}%` }}></div>
                    <input type="range" min="12" max="120" step="1" value={inventoryDisplayLimit} onChange={(e) => setInventoryDisplayLimit(parseInt(e.target.value, 10))} className="settings-range-input" />
                  </div>
                  <span className="settings-value" style={{ minWidth: '60px', textAlign: 'right' }}>{inventoryDisplayLimit}</span>
                </div>
              </div>

              <div className={`settings-item ${activeIndex === 3 ? 'active' : ''}`} onMouseDown={() => { setActiveIndex(3); setResetConfirmIndex(1); setShowResetConfirm(true); playSound('ui_select'); }}>
                <div className="settings-label" style={{ textAlign: 'center', width: '100%', cursor: 'pointer', color: '#ff5252' }}>インベントリ設定をデフォルトに戻す</div>
              </div>
            </>
          )}

          {activeTab === 'control' && (
            <>
              <div className={`settings-item ${activeIndex === 0 ? 'active' : ''}`} onMouseDown={() => setActiveIndex(0)}>
                {/* ※コード上の singleStickModeSetting = シンクロモード設定 */}
                <div className="settings-label" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_select'); }} style={{ cursor: 'pointer' }}>シンクロモード</div>
                <div className="settings-control" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', marginRight: 'auto', gap: '1px' }}>
                    {(['manual', 'always_on', 'always_off'] as const).map((mode, idx) => {
                      const isCurrent = singleStickModeSetting === mode;
                      return (
                        <span 
                          key={mode}
                          onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); setSingleStickModeSetting(mode); playSound('ui_select'); }}
                          style={{ cursor: 'pointer', color: '#00e5ff', fontSize: '14px', padding: '2px 2px', userSelect: 'none' }}
                        >
                          {isCurrent ? '■' : '□'}
                        </span>
                      );
                    })}
                  </div>
                  <span 
                    className="settings-value" 
                    onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(0); setSingleStickModeSetting(singleStickModeSetting === 'manual' ? 'always_on' : (singleStickModeSetting === 'always_on' ? 'always_off' : 'manual')); playSound('ui_select'); }}
                    style={{ cursor: 'pointer', textAlign: 'right', color: '#00e5ff', minWidth: '150px' }}
                  >
                    {singleStickModeSetting === 'manual' ? 'マニュアル' : (singleStickModeSetting === 'always_on' ? '常時ON' : '常時OFF')}
                  </span>
                </div>
              </div>

              <div className={`settings-item ${activeIndex === 1 ? 'active' : ''}`} onMouseDown={() => setActiveIndex(1)}>
                <div className="settings-label" onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(1); const nextIdx = (skins.indexOf(playerSkinSetting) + 1) % skins.length; setPlayerSkinSetting(skins[nextIdx]); playSound('ui_select'); }} style={{ cursor: 'pointer' }}>プレイヤースキン</div>
                <div className="settings-control" style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <div style={{ display: 'flex', marginRight: 'auto', gap: '1px' }}>
                    {skins.map((skinName, idx) => {
                      const isCurrent = playerSkinSetting === skinName;
                      return (
                        <span 
                          key={skinName}
                          onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(1); setPlayerSkinSetting(skinName); playSound('ui_select'); }}
                          style={{ cursor: 'pointer', color: '#00e5ff', fontSize: '14px', padding: '2px 2px', userSelect: 'none' }}
                        >
                          {isCurrent ? '■' : '□'}
                        </span>
                      );
                    })}
                  </div>
                  <span 
                    className="settings-value" 
                    onMouseDown={(e) => { e.stopPropagation(); setActiveIndex(1); const nextIdx = (skins.indexOf(playerSkinSetting) + 1) % skins.length; setPlayerSkinSetting(skins[nextIdx]); playSound('ui_select'); }}
                    style={{ cursor: 'pointer', color: '#00e5ff', textAlign: 'right', minWidth: '150px' }}
                  >
                    {playerSkinSetting === 'default' ? 'プロトタイプ' : 
                     (playerSkinSetting === 'sphere' ? 'サイバー・スフィア' : 
                      (playerSkinSetting === 'crystal' ? 'ネオ・クリスタル' : 
                       (playerSkinSetting === 'armor' ? 'ガーディアン・アーマー' : 'サテライト・エナジー')))}
                  </span>
                </div>
              </div>
            </>
          )}

          <div className={`settings-item ${activeIndex === menuCount - 1 ? 'active' : ''}`} onMouseDown={handleClose}>
            <div className="settings-label" style={{ textAlign: 'center', width: '100%', cursor: 'pointer' }}>戻る</div>
          </div>
        </div>

        {/* デバイスに応じた操作ガイド */}
        <div style={{ marginTop: '20px', color: '#888', fontSize: '14px', textAlign: 'center', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '4px', fontFamily: 'GenEiLateMin, serif' }}>
          {isGamepadActive ? (
            <div className="gp-btn-container" style={{ justifyContent: 'center' }}>
              <div style={{ display: 'flex', gap: '0' }}>
                <span className="gp-btn gp-btn-side">LB</span><span className="gp-btn gp-btn-side">RB</span>
              </div>
              <span className="gp-label">タブ切替</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <span style={{ fontSize: '18px', verticalAlign: 'middle' }}>✜</span>
              <span className="gp-label">選択・調整</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <span className="gp-btn gp-btn-b">B</span>
              <span className="gp-label">戻る</span>
            </div>
          ) : (
            <div className="gp-btn-container" style={{ justifyContent: 'center', fontFamily: 'GenEiLateMin, serif' }}>
              <div style={{ display: 'flex', gap: '0' }}>
                <kbd className="gp-kbd">Q</kbd><kbd className="gp-kbd">E</kbd>
              </div>
              <span className="gp-label">タブ切替</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <div style={{ display: 'flex', gap: '0' }}>
                <kbd className="gp-kbd">←</kbd><kbd className="gp-kbd">↑</kbd><kbd className="gp-kbd">↓</kbd><kbd className="gp-kbd">→</kbd>
              </div>
              <span className="gp-label">選択・調整</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <kbd className="gp-kbd">Esc</kbd>
              <span className="gp-label">戻る</span>
            </div>
          )}
        </div>
      </div>

      {showResetConfirm && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 300, borderRadius: '12px' }}>
          <div style={{ background: 'rgba(20, 20, 40, 0.95)', border: '2px solid #ff5252', borderRadius: '15px', padding: '40px', textAlign: 'center', boxShadow: '0 0 30px rgba(255, 82, 82, 0.3)', width: '440px' }}>
            <h2 style={{ marginBottom: '30px', color: '#fff', fontSize: '20px' }}>
              {activeTab === 'audio' ? '音量設定' : 'インベントリ設定'}を<br/>デフォルトに戻しますか？
            </h2>
            
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '30px' }}>
              <div 
                onClick={activeTab === 'audio' ? handleResetAudio : handleResetInventory} 
                onMouseEnter={() => setResetConfirmIndex(0)}
                style={{ 
                  flex: 1, padding: '15px', borderRadius: '10px', cursor: 'pointer',
                  border: `2px solid ${resetConfirmIndex === 0 ? '#ff5252' : '#444'}`,
                  backgroundColor: resetConfirmIndex === 0 ? 'rgba(255, 82, 82, 0.2)' : 'rgba(0,0,0,0.3)',
                  transition: 'all 0.2s', transform: resetConfirmIndex === 0 ? 'scale(1.05)' : 'scale(1)'
                }}
              >
                <div style={{ color: resetConfirmIndex === 0 ? '#ff5252' : '#888', fontWeight: 'bold', fontSize: '18px' }}>はい</div>
              </div>
              
              <div 
                onClick={() => { playSound('ui_cancel'); setShowResetConfirm(false); }} 
                onMouseEnter={() => setResetConfirmIndex(1)}
                style={{ 
                  flex: 1, padding: '15px', borderRadius: '10px', cursor: 'pointer',
                  border: `2px solid ${resetConfirmIndex === 1 ? '#ff5252' : '#444'}`,
                  backgroundColor: resetConfirmIndex === 1 ? 'rgba(255, 82, 82, 0.2)' : 'rgba(0,0,0,0.3)',
                  transition: 'all 0.2s', transform: resetConfirmIndex === 1 ? 'scale(1.05)' : 'scale(1)'
                }}
              >
                <div style={{ color: resetConfirmIndex === 1 ? '#ff5252' : '#888', fontWeight: 'bold', fontSize: '18px' }}>いいえ</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {isGamepadActive ? (
                <div className="gp-btn-container" style={{ justifyContent: 'center', fontFamily: 'GenEiLateMin, serif' }}>
                  <span style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: '4px' }}>✜</span>
                  <span className="gp-label">選択</span>
                  <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                  <span className="gp-btn gp-btn-a">A</span>
                  <span className="gp-label">決定</span>
                  <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                  <span className="gp-btn gp-btn-b">B</span>
                  <span className="gp-label">キャンセル</span>
                </div>
              ) : (
                <div className="gp-btn-container" style={{ justifyContent: 'center', color: '#888', fontSize: '14px', fontFamily: 'GenEiLateMin, serif', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: '0' }}>
                    <kbd className="gp-kbd">←</kbd><kbd className="gp-kbd">→</kbd>
                  </div>
                  <span className="gp-label">選択</span>
                  <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                  <kbd className="gp-kbd">Enter</kbd>
                  <span className="gp-label">決定</span>
                  <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                  <kbd className="gp-kbd">Esc</kbd>
                  <span className="gp-label">キャンセル</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
