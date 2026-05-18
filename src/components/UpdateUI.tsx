import React, { useEffect, useRef, useState } from 'react';
import { getSaveData, saveGameData } from '../game/saveData';
import { useGamepad } from '../hooks/useGamepad';
import type { SaveData } from '../game/saveData';
import { UPGRADE_ITEMS, getUpgradeCostInfo } from '../game/upgradeData';
import { playSound } from '../game/soundBus';

interface UpdateUIProps {
  onClose: () => void;
  isGamepadActive?: boolean;
}

export const UpdateUI: React.FC<UpdateUIProps> = ({ onClose, isGamepadActive = false }) => {
  const [data, setData] = useState<SaveData>(() => getSaveData());
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmTarget, setConfirmTarget] = useState<'none' | 'close' | 'reset'>('none');
  const [confirmIndex, setConfirmIndex] = useState(1); // 0: はい, 1: いいえ

  const { poll } = useGamepad();
  const mountTimeRef = useRef(Date.now());
  const selectedIndexRef = useRef(0);
  const confirmIndexRef = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);

  // ボタンのエッジトリガー（押しっぱなし暴発防止）用
  const lastDpadUp = useRef(false);
  const lastDpadDown = useRef(false);
  const lastAPressed = useRef(false);
  const lastXPressed = useRef(false);
  const lastYPressed = useRef(false);
  const lastBPressed = useRef(false);
  const lastRTPressed = useRef(false);
  const lastSelectPressed = useRef(false);
  const lastStartPressed = useRef(false);

  // 十字キーのリピート速度管理用
  const nextMoveTimeRef = useRef(0);

  const saveAndSet = (newData: SaveData) => {
    setData(newData);
    saveGameData(newData);
  };

  const renderDescription = (desc: string) => {
    if (!desc.includes('[HEAL_BTN]') && !desc.includes('[MAGNET_BTN]')) return desc;

    const parts = desc.split(/(\[HEAL_BTN\]|\[MAGNET_BTN\])/);
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px', verticalAlign: 'middle', fontFamily: 'sans-serif' }}>
        {parts.map((part, i) => {
          if (part === '[HEAL_BTN]') {
            return isGamepadActive ? (
              <span key={i} className="gp-btn-side" style={{ fontSize: '10px', height: '16px', minWidth: '24px', margin: '0 2px' }}>LB</span>
            ) : (
              <kbd key={i} className="gp-kbd" style={{ margin: '0 2px' }}>Q</kbd>
            );
          }
          if (part === '[MAGNET_BTN]') {
            return isGamepadActive ? (
              <span key={i} className="gp-btn gp-btn-b" style={{ fontSize: '10px', width: '16px', height: '16px', margin: '0 2px' }}>B</span>
            ) : (
              <kbd key={i} className="gp-kbd" style={{ margin: '0 2px' }}>V</kbd>
            );
          }
          return <span key={i} style={{ verticalAlign: 'middle' }}>{part}</span>;
        })}
      </span>
    );
  };

  const handleBuy = (id: string) => {
    const item = UPGRADE_ITEMS.find((u) => u.id === id);
    if (!item) return;

    const currentSave = getSaveData();
    const currentLv = currentSave.upgradeLevels[id] || 0;
    if (currentLv >= item.maxLevel) return;

    const { cost, currency } = getUpgradeCostInfo(item.id, currentLv);

    if (currency === 'energy') {
      if (currentSave.totalEnergyCubes >= cost) {
        currentSave.totalEnergyCubes -= cost;
        currentSave.upgradeLevels[id] = currentLv + 1;
        saveAndSet(currentSave);
        playSound('ui_buy');
      }
    } else {
      if (currentSave.hyperCubes >= cost) {
        currentSave.hyperCubes -= cost;
        currentSave.upgradeLevels[id] = currentLv + 1;
        saveAndSet(currentSave);
        playSound('ui_buy');
      }
    }
  };

  const handleMaxUpgrade = (id: string) => {
    const item = UPGRADE_ITEMS.find((u) => u.id === id);
    if (!item) return;

    const currentSave = getSaveData();
    let currentLv = currentSave.upgradeLevels[id] || 0;
    if (currentLv >= item.maxLevel) return;

    let upgraded = false;
    while (currentLv < item.maxLevel) {
      const { cost, currency } = getUpgradeCostInfo(item.id, currentLv);
      if (currency === 'energy') {
        if (currentSave.totalEnergyCubes >= cost) {
          currentSave.totalEnergyCubes -= cost;
          currentLv++;
          upgraded = true;
        } else {
          break;
        }
      } else {
        if (currentSave.hyperCubes >= cost) {
          currentSave.hyperCubes -= cost;
          currentLv++;
          upgraded = true;
        } else {
          break;
        }
      }
    }

    if (upgraded) {
      currentSave.upgradeLevels[id] = currentLv;
      saveAndSet(currentSave);
      playSound('ui_buy');
    }
  };

  const handleSell = (id: string) => {
    const item = UPGRADE_ITEMS.find((u) => u.id === id);
    if (!item) return;

    const currentSave = getSaveData();
    const currentLv = currentSave.upgradeLevels[id] || 0;
    if (currentLv <= 0) return;

    const { cost: refund, currency } = getUpgradeCostInfo(item.id, currentLv - 1);

    if (currency === 'energy') {
      currentSave.totalEnergyCubes += refund;
    } else {
      currentSave.hyperCubes += refund;
    }

    currentSave.upgradeLevels[id] = currentLv - 1;
    saveAndSet(currentSave);
    playSound('ui_sell');
  };

  const handleSingleReset = (id: string) => {
    const item = UPGRADE_ITEMS.find((u) => u.id === id);
    if (!item) return;

    const currentSave = getSaveData();
    let currentLv = currentSave.upgradeLevels[id] || 0;
    if (currentLv <= 0) return;

    while (currentLv > 0) {
      const { cost: refund, currency } = getUpgradeCostInfo(item.id, currentLv - 1);
      if (currency === 'energy') {
        currentSave.totalEnergyCubes += refund;
      } else {
        currentSave.hyperCubes += refund;
      }
      currentLv--;
      currentSave.upgradeLevels[id] = currentLv;
    }
    saveAndSet(currentSave);
    playSound('ui_sell');
  };

  const handleReset = () => {
    const currentSave = getSaveData();
    const lvls = currentSave.upgradeLevels || {};
    let hasSomethingToReset = false;

    UPGRADE_ITEMS.forEach(item => {
      if ((lvls[item.id] || 0) > 0) hasSomethingToReset = true;
    });

    if (hasSomethingToReset) {
      setConfirmIndex(1);
      confirmIndexRef.current = 1;
      setConfirmTarget('reset');
    }
  };

  const executeReset = () => {
    const currentSave = getSaveData();
    const lvls = currentSave.upgradeLevels || {};
    let energyRefund = 0;
    let hyperRefund = 0;

    UPGRADE_ITEMS.forEach(item => {
      const currentLevel = lvls[item.id] || 0;
      for (let i = 0; i < currentLevel; i++) {
        const { cost, currency } = getUpgradeCostInfo(item.id, i);
        if (currency === 'hyper') {
          hyperRefund += cost;
        } else {
          energyRefund += cost;
        }
      }
    });

    currentSave.totalEnergyCubes += energyRefund;
    currentSave.hyperCubes += hyperRefund;
    currentSave.upgradeLevels = {};
    saveAndSet(currentSave);
    playSound('ui_sell');
    setConfirmTarget('none');
  };

  const addDebugCubes = () => {
    const currentSave = getSaveData();
    currentSave.totalEnergyCubes += 100000000;
    saveAndSet(currentSave);
  };

  const addDebugHyperCubes = () => {
    const currentSave = getSaveData();
    currentSave.hyperCubes += 10;
    saveAndSet(currentSave);
  };

  const clearDebugCubes = () => {
    const currentSave = getSaveData();
    currentSave.totalEnergyCubes = 0;
    currentSave.hyperCubes = 0;
    saveAndSet(currentSave);
  };

  // 入力ループ用の安定した参照
  const onCloseRef = useRef(onClose);
  const handleBuyRef = useRef(handleBuy);
  const handleMaxUpgradeRef = useRef(handleMaxUpgrade);
  const handleSellRef = useRef(handleSell);
  const handleResetRef = useRef(handleReset);
  const executeResetRef = useRef(executeReset);
  const handleSingleResetRef = useRef(handleSingleReset);
  const addDebugCubesRef = useRef(addDebugCubes);
  const addDebugHyperCubesRef = useRef(addDebugHyperCubes);
  const clearDebugCubesRef = useRef(clearDebugCubes);

  useEffect(() => {
    onCloseRef.current = onClose;
    handleBuyRef.current = handleBuy;
    handleMaxUpgradeRef.current = handleMaxUpgrade;
    handleSellRef.current = handleSell;
    handleResetRef.current = handleReset;
    executeResetRef.current = executeReset;
    handleSingleResetRef.current = handleSingleReset;
    addDebugCubesRef.current = addDebugCubes;
    addDebugHyperCubesRef.current = addDebugHyperCubes;
    clearDebugCubesRef.current = clearDebugCubes;
  });

  // キーボードとゲームパッドの入力監視ループ
  useEffect(() => {
    const moveCursor = (delta: number) => {
      let next = selectedIndexRef.current + delta;
      next = Math.max(0, Math.min(UPGRADE_ITEMS.length - 1, next));
      if (next !== selectedIndexRef.current) playSound('ui_move');
      selectedIndexRef.current = next;
      setSelectedIndex(next);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (Date.now() - mountTimeRef.current < 500) return;

      if (confirmTarget !== 'none') {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
          if (confirmIndexRef.current !== 0) playSound('ui_move');
          setConfirmIndex(0);
          confirmIndexRef.current = 0;
        } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          if (confirmIndexRef.current !== 1) playSound('ui_move');
          setConfirmIndex(1);
          confirmIndexRef.current = 1;
        } else if (e.key === 'Enter') {
          if (confirmIndexRef.current === 0) {
            if (confirmTarget === 'close') {
              playSound('ui_select');
              onCloseRef.current();
            } else if (confirmTarget === 'reset') {
              executeResetRef.current();
            }
          } else {
            playSound('ui_cancel');
            setConfirmTarget('none');
          }
        } else if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'x' || e.key === 'X' || e.key === 'b' || e.key === 'B') {
          playSound('ui_cancel');
          setConfirmTarget('none');
        }
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        moveCursor(-1);
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        moveCursor(1);
      } else if (e.key === 'Enter') {
        const item = UPGRADE_ITEMS[selectedIndexRef.current];
        if (item) handleBuyRef.current(item.id);
      } else if (e.key === ' ') {
        const item = UPGRADE_ITEMS[selectedIndexRef.current];
        if (item) handleMaxUpgradeRef.current(item.id);
        e.preventDefault();
      } else if (e.key === 'Backspace') {
        const item = UPGRADE_ITEMS[selectedIndexRef.current];
        if (item) handleSellRef.current(item.id);
      } else if (e.key === 'Delete') {
        const item = UPGRADE_ITEMS[selectedIndexRef.current];
        if (item) handleSingleResetRef.current(item.id);
      } else if (e.key === 'r' || e.key === 'R') {
        handleResetRef.current();
      } else if (e.key === 'Escape') {
        playSound('ui_select');
        setConfirmIndex(1);
        confirmIndexRef.current = 1;
        setConfirmTarget('close');
      } else if (e.key === 'F9') {
        addDebugCubesRef.current();
      } else if (e.key === 'PageUp') {
        listRef.current?.scrollBy({ top: -400, behavior: 'smooth' });
        e.preventDefault();
      } else if (e.key === 'PageDown') {
        listRef.current?.scrollBy({ top: 400, behavior: 'smooth' });
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    let frameId: number;
    const checkGamepad = () => {
      const { mainDevice } = poll();
      if (mainDevice) {
        const now = Date.now();
        const up = mainDevice.buttons[12] > 0.5 || (mainDevice.axes[9] !== undefined && mainDevice.axes[9] <= -0.7);
        const down = mainDevice.buttons[13] > 0.5 || (mainDevice.axes[9] !== undefined && mainDevice.axes[9] >= 0.1 && mainDevice.axes[9] <= 0.2);
        const aBtn = mainDevice.buttons[0] > 0.5;
        const bBtn = mainDevice.buttons[1] > 0.5;
        const xBtn = mainDevice.buttons[2] > 0.5;
        const yBtn = mainDevice.buttons[3] > 0.5;
        const rtBtn = mainDevice.buttons[7] > 0.5;
        const selectBtn = mainDevice.buttons[8] > 0.5;
        const startBtn = (mainDevice.buttons[9] && mainDevice.buttons[9] > 0.5) || false;

        // クールダウン中はフラグ同期のみ行い、処理は中断する
        if (now - mountTimeRef.current < 500) {
          lastDpadUp.current = up; lastDpadDown.current = down;
          lastAPressed.current = aBtn; lastBPressed.current = bBtn;
          lastXPressed.current = xBtn; lastYPressed.current = yBtn;
          lastRTPressed.current = rtBtn; lastSelectPressed.current = selectBtn;
          lastStartPressed.current = startBtn;
          frameId = requestAnimationFrame(checkGamepad);
          return;
        }

        // ダイアログ表示中の入力制御
        if (confirmTarget !== 'none') {
          const left = mainDevice.buttons[14] > 0.5 || (mainDevice.axes[0] !== undefined && mainDevice.axes[0] <= -0.5);
          const right = mainDevice.buttons[15] > 0.5 || (mainDevice.axes[0] !== undefined && mainDevice.axes[0] >= 0.5);

          if (left) {
            setConfirmIndex(0);
            confirmIndexRef.current = 0;
          } else if (right) {
            setConfirmIndex(1);
            confirmIndexRef.current = 1;
          }

          if (aBtn && !lastAPressed.current) {
            if (confirmIndexRef.current === 0) {
              if (confirmTarget === 'close') {
                onCloseRef.current();
              } else if (confirmTarget === 'reset') {
                executeResetRef.current();
              }
            } else {
              setConfirmTarget('none');
            }
          }
          if ((bBtn && !lastBPressed.current) || (startBtn && !lastStartPressed.current)) {
            setConfirmTarget('none');
          }
          // 同期
          lastDpadUp.current = up; lastDpadDown.current = down;
          lastAPressed.current = aBtn; lastBPressed.current = bBtn;
          lastXPressed.current = xBtn; lastYPressed.current = yBtn;
          lastRTPressed.current = rtBtn; lastSelectPressed.current = selectBtn;
          lastStartPressed.current = startBtn;
          frameId = requestAnimationFrame(checkGamepad);
          return;
        }

        // D-padの移動と押しっぱなし(リピート)処理
        if (up) {
          if (!lastDpadUp.current) {
            moveCursor(-1);
            nextMoveTimeRef.current = now + 400; // 初回は0.4秒後にリピート開始
          } else if (now >= nextMoveTimeRef.current) {
            moveCursor(-1);
            nextMoveTimeRef.current = now + 80; // 以降は0.08秒間隔でリピート
          }
        }
        if (down) {
          if (!lastDpadDown.current) {
            moveCursor(1);
            nextMoveTimeRef.current = now + 400;
          } else if (now >= nextMoveTimeRef.current) {
            moveCursor(1);
            nextMoveTimeRef.current = now + 80;
          }
        }

        // 右スティックでスクロール
        const rsY = mainDevice.axes[3];
        if (Math.abs(rsY) > 0.2) {
          listRef.current?.scrollBy({ top: rsY * 15 });
        }

        // 各種ボタン処理 (エッジトリガーで確実に1回だけ発火)
        if (aBtn && !lastAPressed.current) {
          const item = UPGRADE_ITEMS[selectedIndexRef.current];
          if (item) handleBuyRef.current(item.id);
        }
        if (xBtn && !lastXPressed.current) {
          const item = UPGRADE_ITEMS[selectedIndexRef.current];
          if (item) handleMaxUpgradeRef.current(item.id);
        }
        if (yBtn && !lastYPressed.current) {
          const item = UPGRADE_ITEMS[selectedIndexRef.current];
          if (item) handleSingleResetRef.current(item.id);
        }
        if (rtBtn && !lastRTPressed.current) handleResetRef.current();
        if (bBtn && !lastBPressed.current) {
          const item = UPGRADE_ITEMS[selectedIndexRef.current];
          if (item) handleSellRef.current(item.id);
        }
        if (startBtn && !lastStartPressed.current) {
          setConfirmIndex(1);
          confirmIndexRef.current = 1;
          setConfirmTarget('close');
        }
        if (selectBtn && !lastSelectPressed.current) addDebugCubesRef.current();

        // 今回のボタン状態を記録
        lastDpadUp.current = up; lastDpadDown.current = down;
        lastAPressed.current = aBtn; lastBPressed.current = bBtn;
        lastXPressed.current = xBtn; lastYPressed.current = yBtn;
        lastRTPressed.current = rtBtn; lastSelectPressed.current = selectBtn;
        lastStartPressed.current = startBtn;
      }
      frameId = requestAnimationFrame(checkGamepad);
    };

    window.addEventListener('keydown', handleKeyDown);
    frameId = requestAnimationFrame(checkGamepad);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(frameId);
    };
  }, [poll, confirmTarget]); // Dependency fixed: confirmTarget needed here

  // カーソル移動時の自動スクロール
  useEffect(() => {
    const el = document.getElementById(`upgrade-item-${selectedIndex}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'transparent', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', zIndex: 100, fontFamily: "'GenEiLateMin', 'Helvetica', sans-serif" }}>
      <h1 style={{
        color: '#fff',
        textShadow: '0 0 20px rgba(0, 229, 255, 0.9), 0 0 40px rgba(0, 229, 255, 0.5)',
        marginBottom: '32px',
        fontFamily: "'ZenDots', sans-serif",
        fontSize: '48px',
        letterSpacing: '12px',
        fontWeight: 'normal',
        background: 'linear-gradient(180deg, #fff 0%, #00e5ff 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        filter: 'drop-shadow(0 0 10px rgba(0, 229, 255, 0.5))'
      }}>Meta Progression</h1>



      <div style={{ display: 'flex', gap: '30px', marginBottom: '30px', fontSize: '20px', fontWeight: 'bold' }}>
        <div style={{ border: '1px solid #7c4dff', padding: '10px 20px', borderRadius: '8px', background: 'rgba(124, 77, 255, 0.2)', boxShadow: '0 0 10px rgba(124, 77, 255, 0.5)' }}>
          <span style={{ color: '#aaa', marginRight: '10px', fontSize: '14px' }}>ENERGY CUBES</span>
          {data.totalEnergyCubes.toLocaleString()}
        </div>
        <div style={{ border: '1px solid #d500f9', padding: '10px 20px', borderRadius: '8px', background: 'rgba(213, 0, 249, 0.2)', boxShadow: '0 0 10px rgba(213, 0, 249, 0.5)' }}>
          <span style={{ color: '#aaa', marginRight: '10px', fontSize: '14px' }}>HYPER CUBES</span>
          {data.hyperCubes.toLocaleString()}
        </div>
      </div>

      <div
        ref={listRef}
        style={{ width: '80%', maxWidth: '800px', maxHeight: '60vh', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '12px', padding: '20px', display: 'grid', gridTemplateColumns: '1fr', gap: '10px', backgroundColor: 'rgba(0, 0, 0, 0.4)' }}>
        {UPGRADE_ITEMS.map((item, index) => {
          const lv = data.upgradeLevels[item.id] || 0;
          const isMax = lv >= item.maxLevel;
          const currentCostInfo = getUpgradeCostInfo(item.id, lv);
          const cost = currentCostInfo.cost;
          const displayCurrency = currentCostInfo.currency;

          const refundInfo = lv > 0 ? getUpgradeCostInfo(item.id, lv - 1) : null;
          const refund = refundInfo ? refundInfo.cost : 0;
          const refundCurrency = refundInfo ? refundInfo.currency : 'energy';
          const canBuy = isMax ? false : (displayCurrency === 'energy' ? data.totalEnergyCubes >= cost : data.hyperCubes >= cost);
          const isSelected = index === selectedIndex;
          const isHovered = hoveredItemId === item.id || isSelected;

          return (
            <div key={item.id} id={`upgrade-item-${index}`} onMouseEnter={() => setHoveredItemId(item.id)} onMouseLeave={() => setHoveredItemId(null)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 20px', border: `2px solid ${isSelected ? '#00e5ff' : (isHovered ? 'rgba(0,229,255,0.5)' : 'rgba(255,255,255,0.1)')}`, borderRadius: '8px', backgroundColor: isSelected ? 'rgba(0, 229, 255, 0.2)' : (isHovered ? 'rgba(0, 229, 255, 0.1)' : 'rgba(0,0,0,0.5)'), transition: 'all 0.1s ease', transform: isSelected ? 'scale(1.02)' : 'scale(1)', position: 'relative' }}>
              {isSelected && <div style={{ position: 'absolute', left: '-25px', color: '#00e5ff', fontSize: '24px' }}>▶</div>}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: displayCurrency === 'hyper' ? '#d500f9' : '#fff' }}>
                  {item.name} <span style={{ color: '#00e5ff', marginLeft: '10px' }}>Lv.{lv}/{item.maxLevel}</span>
                </div>
                <div style={{ color: '#aaa', fontSize: '14px', marginTop: '5px', display: 'flex', alignItems: 'center', minHeight: '1.2em', fontFamily: 'sans-serif' }}>{renderDescription(item.desc)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', justifyContent: 'flex-end', flex: 1 }}>
                {!isMax ? (
                  <button onClick={() => handleBuy(item.id)} disabled={!canBuy} style={{ background: canBuy ? 'rgba(0, 229, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)', border: `1px solid ${canBuy ? '#00e5ff' : '#666'}`, color: canBuy ? '#00e5ff' : '#666', padding: '5px 15px', borderRadius: '5px', cursor: canBuy ? 'pointer' : 'not-allowed' }}>強化 ({cost.toLocaleString()} {displayCurrency === 'hyper' ? 'Hyper' : 'Cubes'})</button>
                ) : <div style={{ color: '#ffeb3b', fontWeight: 'bold' }}>MAX LEVEL</div>}
                {lv > 0 && <button onClick={() => handleSell(item.id)} style={{ background: 'rgba(255, 82, 82, 0.2)', border: '1px solid #ff5252', color: '#ff5252', padding: '5px 15px', borderRadius: '5px', cursor: 'pointer' }}>売却 (+{refund.toLocaleString()} {refundCurrency === 'hyper' ? 'Hyper' : 'Cubes'})</button>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '20px', marginTop: '30px' }}>
        <button onClick={handleReset} style={{ background: 'rgba(255, 82, 82, 0.2)', border: '1px solid #ff5252', color: '#ff5252', padding: '10px 30px', borderRadius: '5px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 10px rgba(255, 82, 82, 0.3)' }}>全リセット (初期化して全額返還)</button>
        <button onClick={() => {
          setConfirmIndex(1);
          confirmIndexRef.current = 1;
          setConfirmTarget('close');
        }} style={{ background: 'rgba(0, 229, 255, 0.2)', border: '1px solid #00e5ff', color: '#00e5ff', padding: '10px 30px', borderRadius: '5px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 10px rgba(0, 229, 255, 0.3)' }}>タイトルへ戻る</button>
      </div>

      <div style={{ marginTop: '30px', color: '#888', fontSize: '14px', textAlign: 'center', background: 'rgba(0,0,0,0.4)', padding: '12px 24px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
        {isGamepadActive ? (
          <div className="gp-btn-container" style={{ justifyContent: 'center' }}>
            <span style={{ fontSize: '18px', verticalAlign: 'middle' }}>✜</span>
            <span className="gp-label">選択</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <span className="gp-btn gp-btn-a">A</span>
            <span className="gp-label">強化</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <span className="gp-btn gp-btn-x">X</span>
            <span className="gp-label">最大強化</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <span className="gp-btn gp-btn-b">B</span>
            <span className="gp-label">売却</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <span className="gp-btn gp-btn-y">Y</span>
            <span className="gp-label">個別リセット</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <span className="gp-btn gp-btn-side">RT</span>
            <span className="gp-label">全リセット</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <span className="gp-btn gp-btn-start" style={{ fontSize: '12px' }}>☰</span>
            <span className="gp-label">タイトルへ</span>
          </div>
        ) : (
          <div className="gp-btn-container" style={{ justifyContent: 'center', color: '#888', fontSize: '14px', fontFamily: 'GenEiLateMin, serif', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0' }}>
              <kbd className="gp-kbd">↑</kbd><kbd className="gp-kbd">↓</kbd>
            </div>
            <span className="gp-label">選択</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <kbd className="gp-kbd">Enter</kbd>
            <span className="gp-label">強化</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <kbd className="gp-kbd">Space</kbd>
            <span className="gp-label">最大強化</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <kbd className="gp-kbd">Backspace</kbd>
            <span className="gp-label">売却</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <kbd className="gp-kbd">Delete</kbd>
            <span className="gp-label">個別リセット</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <kbd className="gp-kbd">R</kbd>
            <span className="gp-label">全リセット</span>
            <span style={{ margin: '0 8px', color: '#444' }}>|</span>
            <kbd className="gp-kbd">Esc</kbd>
            <span className="gp-label">タイトルへ</span>
          </div>
        )}
      </div>

      {confirmTarget !== 'none' && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'transparent', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 200 }}>
          <div style={{ background: 'rgba(20, 20, 40, 0.95)', border: `2px solid ${confirmTarget === 'reset' ? '#ff5252' : '#00e5ff'}`, borderRadius: '15px', padding: '40px', textAlign: 'center', boxShadow: `0 0 30px ${confirmTarget === 'reset' ? 'rgba(255, 82, 82, 0.3)' : 'rgba(0, 229, 255, 0.3)'}`, width: '440px' }}>
            <h2 style={{ marginBottom: '30px', color: '#fff', fontSize: '20px' }}>
              {confirmTarget === 'reset' ? (
                <>全アップグレードをリセットしますか？<br /><span style={{ fontSize: '14px', color: '#ff8a80' }}>（全額払い戻されます）</span></>
              ) : (
                <>タイトルに戻りますか？<br /><span style={{ fontSize: '14px', color: '#aaa' }}>（変更は保存されています）</span></>
              )}
            </h2>

            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', marginBottom: '30px' }}>
              <div
                onClick={() => confirmTarget === 'reset' ? executeResetRef.current() : onCloseRef.current()}
                onMouseEnter={() => { setConfirmIndex(0); confirmIndexRef.current = 0; }}
                style={{
                  flex: 1, padding: '15px', borderRadius: '10px', cursor: 'pointer',
                  border: `2px solid ${confirmIndex === 0 ? (confirmTarget === 'reset' ? '#ff5252' : '#00e5ff') : '#444'}`,
                  backgroundColor: confirmIndex === 0 ? (confirmTarget === 'reset' ? 'rgba(255, 82, 82, 0.2)' : 'rgba(0, 229, 255, 0.2)') : 'rgba(0,0,0,0.3)',
                  transition: 'all 0.2s', transform: confirmIndex === 0 ? 'scale(1.05)' : 'scale(1)'
                }}
              >
                <div style={{ color: confirmIndex === 0 ? (confirmTarget === 'reset' ? '#ff5252' : '#00e5ff') : '#888', fontWeight: 'bold', fontSize: '18px' }}>はい</div>
              </div>

              <div
                onClick={() => setConfirmTarget('none')}
                onMouseEnter={() => { setConfirmIndex(1); confirmIndexRef.current = 1; }}
                style={{
                  flex: 1, padding: '15px', borderRadius: '10px', cursor: 'pointer',
                  border: `2px solid ${confirmIndex === 1 ? (confirmTarget === 'reset' ? '#ff5252' : '#00e5ff') : '#444'}`,
                  backgroundColor: confirmIndex === 1 ? (confirmTarget === 'reset' ? 'rgba(255, 82, 82, 0.2)' : 'rgba(0, 229, 255, 0.2)') : 'rgba(0,0,0,0.3)',
                  transition: 'all 0.2s', transform: confirmIndex === 1 ? 'scale(1.05)' : 'scale(1)'
                }}
              >
                <div style={{ color: confirmIndex === 1 ? (confirmTarget === 'reset' ? '#ff5252' : '#00e5ff') : '#888', fontWeight: 'bold', fontSize: '18px' }}>いいえ</div>
              </div>
            </div>

            <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'center' }}>
              {isGamepadActive ? (
                <div className="gp-btn-container" style={{ justifyContent: 'center', fontFamily: 'GenEiLateMin, serif' }}>
                  <span style={{ fontSize: '18px', verticalAlign: 'middle' }}>✜</span>
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