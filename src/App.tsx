import React, { useState, useEffect, useRef, useCallback, useMemo, memo, Suspense } from 'react';
import { useGamepad } from './hooks/useGamepad';
import type { GamepadInfo } from './hooks/useGamepad';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Grid } from '@react-three/drei';
import { Vector3 } from 'three';

declare global {
  interface Window {
    __playerPosRef?: React.MutableRefObject<Vector3>;
    __queenPosRef?: React.MutableRefObject<Vector3> | null;
    __isQueenActive?: boolean;
    __isQueenDefeated?: boolean;
    __systemUpgrades?: {
      dropMult: number;
      killReqMult: number;
      overload: number;
      overclock: number;
    };
    __isKingActive?: boolean;
    __kingCenter?: Vector3;
    __kingPosRefs?: React.MutableRefObject<Vector3>[];
    __kingCoreSlots?: number[];
    __isGameClear?: boolean;
    __queenKilled?: boolean;
  }
}
import { Player } from './components/Player';
import { InstancedEnemies, resetEnemySpawner } from './components/InstancedEnemies';
import { Projectiles } from './components/Projectiles';
import { EnemyProjectiles } from './components/EnemyProjectiles';
import { triggerMegaCrush, clearAllEnemyProjectiles } from './game/collisionBus';
import { DroppedItems } from './components/DroppedItems';
import { ExpGems } from './components/ExpGems';
import { InventoryUI, SLOT_LABELS, STAT_LABELS } from './components/InventoryUI';
import { ExpBar } from './components/ExpBar';
import { HpBar, DamageVignette } from './components/HpBar';
import { DamagePopups, spawnActionPopup } from './components/DamagePopups';
import { ComboUI } from './components/ComboUI';
import { BossQueen } from './components/BossQueen';
import { BossKing } from './components/BossKing';
import { BossUI } from './components/BossUI';
import { onPickup, resetDrops, pullAllDrops } from './game/dropBus';
import { resetGems, pullAllGems } from './game/expGemBus';
import { setGlobalGameTime, getGlobalGameTime } from './game/collisionBus';
import type { DroppedItem } from './game/dropBus';
import type { GeneratedItem } from './game/items/itemTypes';
import { EquipSlot, Rarity, StatType } from './game/items/itemTypes';
import { RARITY_CONFIG } from './game/items/itemData';
import { getItemDisplayName } from './game/items/itemGenerator';
import { computeStats, playerStatsRef, EMPTY_EQUIPMENT, addMegaCrushPenalty, resetMegaCrushPenalty, resetPlayerDebuffs, playerDebuffs, dodgeBuffTimer, shifukuBuffAmount, registerStatsUpdateCallback } from './game/playerStats';
import type { EquipmentState, PlayerStats } from './game/playerStats';
import { initPlayerHp, resetPlayerHp, setMaxHp, healPlayer, getPlayerMaxHp, triggerInvincibility } from './game/playerHp';
import { getLevel, resetLevel, getTotalExp, setExpMultiplier } from './game/playerLevel';
import { resetDash, getDashStamina, drainStamina } from './game/playerDash';
import { subscribeProgress, advanceRewardPhase, resetGameProgress } from './game/gameProgress';
import { initAudio, playSound, setMasterSeVolume } from './game/soundBus';
import { initBgm, playBgm, stopBgm, setMasterBgmVolume } from './game/bgmBus';
import { INITIAL_PERMANENT_UPGRADES } from './game/playerStats';
import type { PermanentUpgrades } from './game/playerStats';
import { REWARDS } from './game/rewardData';
import type { Reward } from './game/rewardData';
import { setGlobalEnchantState } from './game/enchantState';
import { getSaveData, saveGameData } from './game/saveData';
import { resetCombo, maxCombo, resetMaxCombo } from './game/comboBus';
import { UpdateUI } from './components/UpdateUI';
import { resetBossHPBus } from './game/bossHPBus';
import { SettingsUI } from './components/SettingsUI';
import HelpUI from './components/HelpUI';
import { ChangelogUI } from './components/ChangelogUI';

/** セーブデータから永続強化を読み込んで PermanentUpgrades 型に変換する */
const loadUpgradesFromSave = (): PermanentUpgrades => {
  const save = getSaveData();
  const lvls = save.upgradeLevels || {};
  const up = { ...INITIAL_PERMANENT_UPGRADES };

  up.maxHp += (lvls['up_hp'] || 0) * 10;
  up.maxSp += (lvls['up_sp'] || 0) * 10;
  up.meleeAttackPower += (lvls['up_melee_atk'] || 0) * 1;
  // Intervalは計算式(x * 0.25)に合わせて逆算。0.4 * 0.25 = 0.1 (10%短縮)
  up.meleeAttackInterval += (lvls['up_melee_spd'] || 0) * 0.4;
  up.rangedAttackPower += (lvls['up_ranged_atk'] || 0) * 1;
  up.rangedAttackInterval += (lvls['up_ranged_spd'] || 0) * 0.4;
  up.magicPower += (lvls['up_magic'] || 0) * 1;
  up.critChance += (lvls['up_crit'] || 0) * 2;
  up.defense += (lvls['up_def'] || 0) * 1;
  up.evasion += (lvls['up_eva'] || 0) * 1;
  up.moveSpeed += (lvls['up_speed'] || 0) * 4; // 実速度は半分の+2になる
  up.pickupRange += (lvls['up_pickup'] || 0) * 2;
  up.hpRegen += (lvls['up_regen'] || 0) * 0.02;
  // 互換性のため、古い 'up_mirage' のレベルも 'resonance' に合算して引き継ぐ
  up.resonance += (lvls['up_mirage'] || 0) * 1 + (lvls['up_resonance'] || 0) * 1;

  // システム系（window.__systemUpgrades）の更新
  const dropMult = 1.0 + (lvls['up_drop_rate'] || 0) * 0.1;
  const killReqMult = Math.max(0.5, 1.0 - (lvls['up_reward_req'] || 0) * 0.1);
  const overload = (lvls['up_overclock'] || 0);
  const overclock = (lvls['up_overdrive'] || 0) * 0.05; // 1レベルにつき上限+5%
  const expMultiplier = Math.max(0.5, 1.0 - (lvls['up_exp_req'] || 0) * 0.1);

  window.__systemUpgrades = { dropMult, killReqMult, overload, overclock };
  setExpMultiplier(expMultiplier);

  // OB/AR アップグレードレベル (PermanentUpgrades 型外だが computeStats 経由でキャッシュに渡す)
  (up as any).up_ob = lvls['up_ob'] || 0;
  (up as any).up_ar = lvls['up_ar'] || 0;

  return up;
};

// ===================================
// ヘルパー: リワードアイコン取得
// ===================================
const getRewardIcon = (id: string) => {
  if (!id) return '🌟';
  const s = id.toLowerCase();
  if (s.includes('enchantfire')) return '🔥';
  if (s.includes('enchantice')) return '❄️';
  if (s.includes('enchantlightning')) return '⚡';
  if (s.includes('lightning')) return '⚡';
  if (s.includes('flame')) return '🔥';
  if (s.includes('frost')) return '❄️';
  if (s.includes('hp')) return '💖';
  if (s.includes('sp')) return '💧';
  if (s.includes('atk') || s.includes('attack') || s.includes('melee') || s.includes('ranged')) return '⚔️';
  if (s.includes('spd') || s.includes('speed') || s.includes('move')) return '💨';
  if (s.includes('range') || s.includes('pierce')) return '☄️';
  if (s.includes('magic')) return '🪄';
  if (s.includes('crit')) return '💥';
  if (s.includes('def')) return '🛡️';
  if (s.includes('eva')) return '🍃';
  if (s.includes('pickup')) return '🧲';
  return '🌟';
};

// ===================================
// カメラ追従コンポーネント
// ===================================
const _cameraTarget = new Vector3();

function CameraFollow() {
  const { camera } = useThree();
  const playerPosRef = useRef(new Vector3());

  useEffect(() => {
    window.__playerPosRef = playerPosRef;
  }, []);

  useFrame(() => {
    const pos = playerPosRef.current;
    _cameraTarget.set(pos.x, 20, pos.z + 12);
    camera.position.lerp(_cameraTarget, 0.08);
    camera.lookAt(pos.x, 0, pos.z);
  });

  return null;
}

// ===================================
// 3Dシーン
// ===================================
function GameScene({
  onGamepadConnect,
  onToggleInventory,
  onCloseInventory,
  onDpadUp,
  onDpadDown,
  onDpadLeft,
  onDpadRight,
  onAButton,
  onXButton,
  isGameOver,
  onPlayerDeath,
  isPaused,
  onTogglePause,
  onRestart,
  onGamepadActive,
  isInventoryOpen,
  onPrevTab,
  onNextTab,
  onPrevSubTab,
  onNextSubTab,
  onSwitchEnchant,
  activeEnchant,
  onResultLB,
  onResultRB,
  onHeal,
  onBButton,
  onMegaCrush,
  isSettingsOpen,
  isSpawning,
  spawnStartTime,
  isHelpOpen,
  isSingleStick,
  onToggleSingleStick,
  playerSkinSetting
}: {
  onGamepadConnect: (c: boolean, d: GamepadInfo[], m: string) => void;
  onToggleInventory: () => void;
  onCloseInventory: () => void;
  onDpadUp: () => void;
  onDpadDown: () => void;
  onDpadLeft: () => void;
  onDpadRight: () => void;
  onAButton: () => void;
  onXButton: () => void;
  isGameOver: boolean;
  onPlayerDeath: () => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onRestart: () => void;
  onGamepadActive: (active: boolean) => void;
  isInventoryOpen: boolean;
  onPrevTab: () => void;
  onNextTab: () => void;
  onPrevSubTab: () => void;
  onNextSubTab: () => void;
  onSwitchEnchant: (type: 'fire' | 'ice' | 'lightning' | 'none') => void;
  activeEnchant: string;
  onResultLB: () => void;
  onResultRB: () => void;
  onHeal: () => void;
  onBButton: () => void;
  onMegaCrush: () => void;
  isSettingsOpen: boolean;
  isSpawning: boolean;
  spawnStartTime: number;
  isHelpOpen: boolean;
  isSingleStick: boolean;
  onToggleSingleStick: () => void;
  playerSkinSetting: 'default' | 'sphere' | 'crystal' | 'armor' | 'satellite';
}) {
  const { poll } = useGamepad();
  const lastYPressed = useRef(false);
  const lastBPressed = useRef(false);
  const lastDpadUp = useRef(false);
  const lastDpadDown = useRef(false);
  const lastDpadLeft = useRef(false);
  const lastDpadRight = useRef(false);
  const lastAPressed = useRef(false);
  const lastXPressed = useRef(false);
  const lastLB = useRef(false);
  const lastRB = useRef(false);
  const lastLT = useRef(false);
  const lastRT = useRef(false);
  const lastStartPressed = useRef(false);
  const dpadUpNextTime = useRef(0);
  const dpadDownNextTime = useRef(0);
  const dpadLeftNextTime = useRef(0);
  const dpadRightNextTime = useRef(0);

  const handlePlayerMove = (pos: Vector3) => {
    if (window.__playerPosRef) {
      window.__playerPosRef.current.copy(pos);
    }
  };

  useFrame((state) => {
    const { mainDevice } = poll();
    if (mainDevice) {
      const bPressed = mainDevice.buttons[1] > 0.5;
      const aPressed = mainDevice.buttons[0] > 0.5;
      const xPressed = mainDevice.buttons[2] > 0.5;
      const yPressed = mainDevice.buttons[3] > 0.5;
      const startPressed = mainDevice.buttons[9] > 0.5;
      const upPressed = mainDevice.buttons[12] > 0.5 || (mainDevice.axes[9] !== undefined && (mainDevice.axes[9] >= -1.0 && mainDevice.axes[9] <= -0.7)) || (mainDevice.axes[7] !== undefined && mainDevice.axes[7] < -0.5);
      const downPressed = mainDevice.buttons[13] > 0.5 || (mainDevice.axes[9] !== undefined && (mainDevice.axes[9] >= 0.1 && mainDevice.axes[9] <= 0.2)) || (mainDevice.axes[7] !== undefined && mainDevice.axes[7] > 0.5);
      const leftPressed = mainDevice.buttons[14] > 0.5 || (mainDevice.axes[9] !== undefined && (mainDevice.axes[9] >= -0.5 && mainDevice.axes[9] <= -0.4)) || (mainDevice.axes[6] !== undefined && mainDevice.axes[6] < -0.5);
      const rightPressed = mainDevice.buttons[15] > 0.5 || (mainDevice.axes[9] !== undefined && (mainDevice.axes[9] >= 0.7 && mainDevice.axes[9] <= 0.8)) || (mainDevice.axes[6] !== undefined && mainDevice.axes[6] > 0.5);

      const rightStickX = mainDevice.axes[2] || 0;
      const rightStickY = mainDevice.axes[3] || 0;
      const stickThreshold = 0.5;

      const rightStickUp = rightStickY < -stickThreshold;
      const rightStickDown = rightStickY > stickThreshold;
      const rightStickLeft = rightStickX < -stickThreshold;
      const rightStickRight = rightStickX > stickThreshold;

      const REPEAT_DELAY = 0.4;
      const REPEAT_INTERVAL = 0.08;
      // ポーズ中に clock.elapsedTime が止まる可能性を考慮し、絶対時間を使用する
      const currentTime = performance.now() / 1000;

      if (!isSettingsOpen && !isHelpOpen) {
        // 入力デバイスの判定
        const hasButtonInput = mainDevice.buttons.some(b => b > 0.1);
        const hasAxisInput = mainDevice.axes.some(a => Math.abs(a) > 0.1);
        if (hasButtonInput || hasAxisInput) {
          onGamepadActive(true);
        }

        // 【修正】タイトル画面時はスタートボタンを無効化（UI側でハンドリングする）
        if (startPressed && !lastStartPressed.current) {
          if (!isGameOver) onTogglePause();
          else onRestart();
        }
        lastStartPressed.current = startPressed;

        if (isInventoryOpen) {
          // インベントリ操作中 (ポーズ状態かどうかに関わらず操作を可能にする)
          const lbPressed = mainDevice.buttons[4] > 0.5;
          const rbPressed = mainDevice.buttons[5] > 0.5;
          const ltPressed = mainDevice.buttons[6] > 0.5;
          const rtPressed = mainDevice.buttons[7] > 0.5;

          if (lbPressed && !lastLB.current) onPrevTab();
          if (rbPressed && !lastRB.current) onNextTab();
          if (ltPressed && !lastLT.current) onPrevSubTab();
          if (rtPressed && !lastRT.current) onNextSubTab();

          lastLB.current = lbPressed;
          lastRB.current = rbPressed;
          lastLT.current = ltPressed;
          lastRT.current = rtPressed;

          if (yPressed && !lastYPressed.current) onToggleInventory();
          if (bPressed && !lastBPressed.current) onToggleInventory(); // Bボタンでも閉じられるように
          lastYPressed.current = yPressed;
          lastBPressed.current = bPressed;

          // シングルスティックモードON時は右スティックでもカーソル移動可能
          const invUp = upPressed || (isSingleStick && rightStickUp);
          const invDown = downPressed || (isSingleStick && rightStickDown);
          const invLeft = leftPressed || (isSingleStick && rightStickLeft);
          const invRight = rightPressed || (isSingleStick && rightStickRight);

          if (invUp) {
            if (!lastDpadUp.current) { onDpadUp(); dpadUpNextTime.current = currentTime + REPEAT_DELAY; }
            else if (currentTime >= dpadUpNextTime.current) { onDpadUp(); dpadUpNextTime.current = currentTime + REPEAT_INTERVAL; }
          }
          lastDpadUp.current = invUp;

          if (invDown) {
            if (!lastDpadDown.current) { onDpadDown(); dpadDownNextTime.current = currentTime + REPEAT_DELAY; }
            else if (currentTime >= dpadDownNextTime.current) { onDpadDown(); dpadDownNextTime.current = currentTime + REPEAT_INTERVAL; }
          }
          lastDpadDown.current = invDown;

          if (invLeft) {
            if (!lastDpadLeft.current) { onDpadLeft(); dpadLeftNextTime.current = currentTime + REPEAT_DELAY; }
            else if (currentTime >= dpadLeftNextTime.current) { onDpadLeft(); dpadLeftNextTime.current = currentTime + REPEAT_INTERVAL; }
          }
          lastDpadLeft.current = invLeft;

          if (invRight) {
            if (!lastDpadRight.current) { onDpadRight(); dpadRightNextTime.current = currentTime + REPEAT_DELAY; }
            else if (currentTime >= dpadRightNextTime.current) { onDpadRight(); dpadRightNextTime.current = currentTime + REPEAT_INTERVAL; }
          }
          lastDpadRight.current = invRight;

          if (aPressed && !lastAPressed.current) onAButton();
          lastAPressed.current = aPressed;

          if (xPressed && !lastXPressed.current) onXButton();
          lastXPressed.current = xPressed;
        } else if (isGameOver) {
          const lbPressed = mainDevice.buttons[4] > 0.5;
          const rbPressed = mainDevice.buttons[5] > 0.5;
          if (lbPressed && !lastLB.current) onResultLB();
          if (rbPressed && !lastRB.current) onResultRB();
          lastLB.current = lbPressed;
          lastRB.current = rbPressed;

          if (upPressed) {
            if (!lastDpadUp.current) { onDpadUp(); dpadUpNextTime.current = currentTime + REPEAT_DELAY; }
            else if (currentTime >= dpadUpNextTime.current) { onDpadUp(); dpadUpNextTime.current = currentTime + REPEAT_INTERVAL; }
          }
          lastDpadUp.current = upPressed;

          if (downPressed) {
            if (!lastDpadDown.current) { onDpadDown(); dpadDownNextTime.current = currentTime + REPEAT_DELAY; }
            else if (currentTime >= dpadDownNextTime.current) { onDpadDown(); dpadDownNextTime.current = currentTime + REPEAT_INTERVAL; }
          }
          lastDpadDown.current = downPressed;
        } else if (isPaused) {
          // 純粋なポーズ画面 or 報酬画面
          if (bPressed && !lastBPressed.current) onBButton();
          if (xPressed && !lastXPressed.current) onXButton();

          lastBPressed.current = bPressed;
          lastXPressed.current = xPressed;

          if (upPressed) {
            if (!lastDpadUp.current) { onDpadUp(); dpadUpNextTime.current = currentTime + REPEAT_DELAY; }
            else if (currentTime >= dpadUpNextTime.current) { onDpadUp(); dpadUpNextTime.current = currentTime + REPEAT_INTERVAL; }
          }
          lastDpadUp.current = upPressed;

          if (downPressed) {
            if (!lastDpadDown.current) { onDpadDown(); dpadDownNextTime.current = currentTime + REPEAT_DELAY; }
            else if (currentTime >= dpadDownNextTime.current) { onDpadDown(); dpadDownNextTime.current = currentTime + REPEAT_INTERVAL; }
          }
          lastDpadDown.current = downPressed;

          if (leftPressed) {
            if (!lastDpadLeft.current) { onDpadLeft(); dpadLeftNextTime.current = currentTime + REPEAT_DELAY; }
            else if (currentTime >= dpadLeftNextTime.current) { onDpadLeft(); dpadLeftNextTime.current = currentTime + REPEAT_INTERVAL; }
          }
          lastDpadLeft.current = leftPressed;

          if (rightPressed) {
            if (!lastDpadRight.current) { onDpadRight(); dpadRightNextTime.current = currentTime + REPEAT_DELAY; }
            else if (currentTime >= dpadRightNextTime.current) { onDpadRight(); dpadRightNextTime.current = currentTime + REPEAT_INTERVAL; }
          }
          lastDpadRight.current = rightPressed;

          if (aPressed && !lastAPressed.current) onAButton();
          lastAPressed.current = aPressed;
        } else {
          const lbPressed = mainDevice.buttons[4] > 0.5;
          const rbPressed = mainDevice.buttons[5] > 0.5;
          const ltPressed = mainDevice.buttons[6] > 0.5;
          const rtPressed = mainDevice.buttons[7] > 0.5;

          // 通常ゲームプレイ
          if (lbPressed && !lastLB.current) onHeal();
          if (rtPressed && !lastRT.current) onMegaCrush();

          // 前回の状態を更新（エッジトリガー用）
          lastLB.current = lbPressed;
          lastRB.current = rbPressed;
          lastLT.current = ltPressed;
          lastRT.current = rtPressed;

          if (yPressed && !lastYPressed.current) onToggleInventory();
          lastYPressed.current = yPressed;

          if (bPressed && !lastBPressed.current) onBButton();
          lastBPressed.current = bPressed;

          if (aPressed && !lastAPressed.current) onAButton();

          if (xPressed && !lastXPressed.current) onXButton();
          lastXPressed.current = xPressed;
          lastAPressed.current = aPressed;

          if (upPressed) {
            if (!lastDpadUp.current) {
              onDpadUp();
              onSwitchEnchant('ice');
              dpadUpNextTime.current = currentTime + REPEAT_DELAY;
            } else if (currentTime >= dpadUpNextTime.current) {
              onDpadUp();
              dpadUpNextTime.current = currentTime + REPEAT_INTERVAL;
            }
          }
          lastDpadUp.current = upPressed;

          if (downPressed) {
            if (!lastDpadDown.current) {
              onDpadDown();
              onSwitchEnchant('none');
              dpadDownNextTime.current = currentTime + REPEAT_DELAY;
            } else if (currentTime >= dpadDownNextTime.current) {
              onDpadDown();
              dpadDownNextTime.current = currentTime + REPEAT_INTERVAL;
            }
          }
          lastDpadDown.current = downPressed;

          if (leftPressed) {
            if (!lastDpadLeft.current) {
              onDpadLeft();
              onSwitchEnchant('fire');
              dpadLeftNextTime.current = currentTime + REPEAT_DELAY;
            } else if (currentTime >= dpadLeftNextTime.current) {
              onDpadLeft();
              dpadLeftNextTime.current = currentTime + REPEAT_INTERVAL;
            }
          }
          lastDpadLeft.current = leftPressed;

          if (rightPressed) {
            if (!lastDpadRight.current) {
              onDpadRight();
              onSwitchEnchant('lightning');
              dpadRightNextTime.current = currentTime + REPEAT_DELAY;
            } else if (currentTime >= dpadRightNextTime.current) {
              onDpadRight();
              dpadRightNextTime.current = currentTime + REPEAT_INTERVAL;
            }
          }
          lastDpadRight.current = rightPressed;
        }
      } else {
        // 設定画面またはヘルプ画面が開いている間も状態を更新し、閉じ際のエッジトリガー誤爆を防ぐ
        lastAPressed.current = aPressed;
        lastBPressed.current = bPressed;
        lastXPressed.current = xPressed;
        lastYPressed.current = yPressed;
        lastStartPressed.current = startPressed;
        lastDpadUp.current = upPressed;
        lastDpadDown.current = downPressed;
        lastDpadLeft.current = leftPressed;
        lastDpadRight.current = rightPressed;

        if (isHelpOpen && bPressed && !lastBPressed.current) {
          onBButton();
        }
      }
    }
  });

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[0, 8, 0]} intensity={0.6} color="#7c4dff" distance={30} />

      <Grid args={[100, 100]} cellSize={1} cellThickness={0.5} cellColor="#1a1a2e" sectionSize={5} sectionThickness={1} sectionColor="#2a2a4e" fadeDistance={50} fadeStrength={1} followCamera={false} position={[0, 0, 0]} />
      <Player
        onPositionUpdate={handlePlayerMove}
        onGamepadConnect={onGamepadConnect}
        isGameOver={isGameOver}
        isPaused={isPaused || isSpawning}
        isInventoryOpen={isInventoryOpen}
        onPlayerDeath={onPlayerDeath}
        activeEnchant={activeEnchant}
        isSpawning={isSpawning}
        spawnStartTime={spawnStartTime}
        isSingleStick={isSingleStick}
        onToggleSingleStick={onToggleSingleStick}
        skinSetting={playerSkinSetting}
      />
      <Projectiles maxCount={200} isGameOver={isGameOver || isPaused || isSpawning} activeEnchant={activeEnchant} />
      <EnemyProjectiles maxCount={50} isGameOver={isGameOver || isPaused || isSpawning} />
      <InstancedEnemies poolSize={2000} isGameOver={isGameOver} isPaused={isPaused || isSpawning} />
      <DroppedItems maxCount={100} />
      <ExpGems />
      <BossQueen isGameOver={isGameOver} isPaused={isPaused || isSpawning} />
      <BossKing isGameOver={isGameOver} isPaused={isPaused || isSpawning} />
      <Suspense fallback={null}>
        <DamagePopups isPaused={isPaused || isGameOver || isSpawning} />
      </Suspense>
      <CameraFollow />
    </>
  );
}

// ===================================
// エンチャント D-pad HUD
// ===================================
const EnchantDpadHUD = memo(function EnchantDpadHUD({ activeEnchant, acquiredRewards }: { activeEnchant: string, acquiredRewards: any[] }) {
  const getEnchantLevel = (id: string) => acquiredRewards.find(r => r.id === id)?.count || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px', marginBottom: '8px' }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: '1px solid #444',
        padding: '6px 12px',
        borderRadius: '4px',
        background: 'rgba(0,0,0,0.5)',
        width: 'fit-content',
        marginLeft: '0'
      }}>
        {/* UP: ICE */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '4px' }}>
          <div style={{ padding: '2px 8px', fontSize: '13px', color: '#00e5ff', border: `1px solid ${activeEnchant === 'ice' ? '#00e5ff' : '#222'}`, borderRadius: '3px', background: activeEnchant === 'ice' ? 'rgba(0,229,255,0.3)' : 'transparent', textAlign: 'center', width: '60px' }}>❄️ 氷</div>
          <div style={{ fontSize: '10px', color: '#00e5ff', marginTop: '1px' }}>Lv.{getEnchantLevel('enchantIce')}</div>
        </div>

        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
          {/* LEFT: FIRE */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ padding: '2px 8px', fontSize: '13px', color: '#ff5252', border: `1px solid ${activeEnchant === 'fire' ? '#ff5252' : '#222'}`, borderRadius: '3px', background: activeEnchant === 'fire' ? 'rgba(255,82,82,0.3)' : 'transparent', textAlign: 'center', width: '60px' }}>🔥 炎</div>
            <div style={{ fontSize: '10px', color: '#ff5252', marginTop: '1px' }}>Lv.{getEnchantLevel('enchantFire')}</div>
          </div>

          {/* CENTER: NONE (無属性) */}
          <div style={{ padding: '2px 8px', fontSize: '13px', color: '#aaa', border: `1px solid ${activeEnchant === 'none' ? '#fff' : '#222'}`, borderRadius: '3px', background: activeEnchant === 'none' ? 'rgba(255,255,255,0.2)' : 'transparent', textAlign: 'center', width: '60px', alignSelf: 'flex-start' }}>⚪ 無</div>

          {/* RIGHT: LIGHTNING */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ padding: '2px 8px', fontSize: '13px', color: '#ffeb3b', border: `1px solid ${activeEnchant === 'lightning' ? '#ffeb3b' : '#222'}`, borderRadius: '3px', background: activeEnchant === 'lightning' ? 'rgba(255,235,59,0.3)' : 'transparent', textAlign: 'center', width: '60px' }}>⚡ 雷</div>
            <div style={{ fontSize: '10px', color: '#ffeb3b', marginTop: '1px' }}>Lv.{getEnchantLevel('enchantLightning')}</div>
          </div>
        </div>
      </div>
    </div>
  );
});

// 常時表示ステータスパネル (HUD)
// ===================================
const StatusHUD = memo(function StatusHUD({
  stats,
  isRewardOpen,
  isPaused,
  isInventoryOpen = false, // 追加
  acquiredRewards,
  activeEnchant,
  healUses,
  magnetUses,
  resilienceUses
}: {
  stats: PlayerStats;
  isRewardOpen?: boolean;
  isPaused?: boolean;
  isInventoryOpen?: boolean; // 追加
  acquiredRewards: any[];
  activeEnchant: string;
  healUses: number;
  magnetUses: number;
  resilienceUses: number;
}) {
  const displayStats = stats || playerStatsRef.current;

  const [isBuffActive, setIsBuffActive] = useState(false);
  const [isShifukuActive, setIsShifukuActive] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsBuffActive(dodgeBuffTimer > 0);
      setIsShifukuActive(shifukuBuffAmount > 0);
      setTick(t => t + 1); // 数値の変化を反映するために再描画を強制
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const statsList = [
    { label: '最大HP', value: (playerStatsRef.current.health || 0).toFixed(1) },
    { label: '最大SP', value: (playerStatsRef.current.maxSp || 0).toFixed(1) },
    {
      label: '近接攻撃力',
      value: (playerStatsRef.current.meleeAttackPower || 0).toFixed(1),
      color: isShifukuActive ? '#7fbfff' : '#fff'
    },
    { label: '近接攻撃回数', value: (1 / Math.max(0.01, playerStatsRef.current.meleeAttackInterval)).toFixed(2) + '/sec' },
    {
      label: '遠隔攻撃力',
      value: (playerStatsRef.current.rangedAttackPower || 0).toFixed(1),
      color: isShifukuActive ? '#7fbfff' : '#fff'
    },
    { label: '遠隔攻撃回数', value: (1 / Math.max(0.01, playerStatsRef.current.rangedAttackInterval)).toFixed(2) + '/sec' },
    { label: '魔力', value: (playerStatsRef.current.magicPower || 0).toFixed(1) },
    {
      label: '会心率',
      value: (playerStatsRef.current.critChance + (isBuffActive ? 50.0 : 0)).toFixed(1) + '%',
      color: isBuffActive ? '#bf7fff' : '#fff'
    },
    { label: '防御力', value: (playerStatsRef.current.defense || 0).toFixed(1) },
    { label: 'パリィ発生率', value: (playerStatsRef.current.evasion || 0).toFixed(1) + '%' },
    { label: '移動速度', value: (playerStatsRef.current.moveSpeed || 0).toFixed(1) },
    { label: '取得範囲', value: (playerStatsRef.current.pickupRange || 0).toFixed(1) },
    { label: '自然回復速度', value: (playerStatsRef.current.hpRegen || 0).toFixed(2) + '/sec' },
    { label: '', value: '' },
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      width: '320px', /* ここで横幅を固定！ */
      zIndex: isInventoryOpen ? 20 : ((isRewardOpen || isPaused) ? 100 : 40),
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* 【追加】アクティブスキルの残り回数表示 */}
      {!isRewardOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px', fontWeight: 'bold', fontSize: '14px', textShadow: '0 0 4px #000' }}>
          {healUses > 0 && <div style={{ color: '#4caf50' }}>💚 HEAL: {healUses}</div>}
          {magnetUses > 0 && <div style={{ color: '#2196f3' }}>🧲 MAGNET: {magnetUses}</div>}
          {resilienceUses > 0 && <div style={{ color: '#ff9800' }}>🔥 REVIVE: {resilienceUses}</div>}
        </div>
      )}

      {!isRewardOpen && <EnchantDpadHUD activeEnchant={activeEnchant} acquiredRewards={acquiredRewards} />}
      <div style={{
        backgroundColor: 'rgba(10, 10, 25, 0.85)',
        padding: '12px',
        borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '16px', rowGap: '6px' }}>
          {statsList.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ color: '#aaa' }}>{item.label}</span>
              <span style={{ fontWeight: 'bold', color: (item as any).color || '#fff' }}>{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// ===================================
// 定数移行により削除
// ===================================
// ===================================
// アイテム取得ログ
// ===================================
interface PickupLogEntry {
  id: string;
  displayName: string;
  rarityNameJa: string;
  color: string;
  timestamp: number;
  isAutoEquip?: boolean;
  itemLevel?: number; // 追加
}

function ItemPickupLog({ autoEquipLogsRef }: { autoEquipLogsRef: React.RefObject<((entry: PickupLogEntry) => void) | null> }) {
  const [logs, setLogs] = useState<PickupLogEntry[]>([]);

  const addLog = useCallback((entry: PickupLogEntry) => {
    setLogs((prev) => {
      const next = [...prev, entry];
      if (next.length > 12) {
        // 上限12件を超えた場合、上位レア以外から優先して消す
        const normalIdx = next.findIndex(l => !['ミシック', 'イモータル', 'セレスティアル'].includes(l.rarityNameJa));
        if (normalIdx !== -1) next.splice(normalIdx, 1);
        else next.shift(); // 全て上位レアなら一番古いのを消す
      }
      return next;
    });
  }, []);

  useEffect(() => {
    autoEquipLogsRef.current = addLog;
    return () => { autoEquipLogsRef.current = null; };
  }, [autoEquipLogsRef, addLog]);

  useEffect(() => {
    const unsubscribe = onPickup((drop: DroppedItem) => {
      addLog({
        id: drop.item.uid,
        displayName: drop.displayName,
        rarityNameJa: drop.rarityNameJa,
        color: drop.color,
        timestamp: Date.now(),
        itemLevel: drop.item.itemLevel,
      });
    });
    return unsubscribe;
  }, [addLog]);

  useEffect(() => {
    if (logs.length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setLogs((prev) => prev.filter((l) => {
        const isHighRarity = ['ミシック', 'イモータル', 'セレスティアル'].includes(l.rarityNameJa);
        const lifetime = isHighRarity ? 12000 : 3000; // 上位レアは12秒、通常は3秒でフェードアウト
        return now - l.timestamp < lifetime;
      }));
    }, 500);
    return () => clearInterval(timer);
  }, [logs.length]);

  if (logs.length === 0) return null;
  return (
    <div className="pickup-log-container" style={{ zIndex: 40 }}>
      {logs.map((log) => {
        const isHighRarity = ['ミシック', 'イモータル', 'セレスティアル'].includes(log.rarityNameJa);
        return (
          <div
            key={log.id}
            className={`pickup-log-entry${log.isAutoEquip ? ' pickup-log-autoequip' : ''}`}
            style={{ borderLeftColor: log.isAutoEquip ? '#4caf50' : log.color, boxShadow: (log.isAutoEquip || !isHighRarity) ? 'none' : `-10px 0 25px 5px ${log.color}` }}
          >
            <span className="pickup-log-rarity" style={{ color: log.isAutoEquip ? '#4caf50' : log.color }}>
              [{log.isAutoEquip ? '自動装備' : log.rarityNameJa}]
            </span>{' '}
            <span className="pickup-log-name">{log.displayName}</span>
            <span className="pickup-log-level" style={{ marginLeft: '6px', fontSize: '0.9em', color: '#ccc' }}>
              Lv.{log.itemLevel || 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ===================================
// グローバル定数
// ===================================
const RARITY_ORDER: Record<string, number> = {
  [Rarity.Common]: 1,
  [Rarity.Uncommon]: 2,
  [Rarity.Magic]: 3,
  [Rarity.Rare]: 4,
  [Rarity.Epic]: 5,
  [Rarity.Legendary]: 6,
  [Rarity.Mythic]: 7,
  [Rarity.Immortal]: 8,
  [Rarity.Celestial]: 9,
};

// ===================================
// 初期化
// ===================================
export default function App() {
  const [cubeColor] = useState(() => {
    const colors = ['#00e5ff', '#ff5252', '#39ff14', '#d500f9', '#ffeb3b'];
    return colors[Math.floor(Math.random() * colors.length)];
  });

  const [healUses, setHealUses] = useState(0);
  const [magnetUses, setMagnetUses] = useState(0);
  const [resilienceUses, setResilienceUses] = useState(0);
  const [flashOpacity, setFlashOpacity] = useState(0);
  const [inventory, setInventory] = useState<GeneratedItem[]>([]);
  const [energyCubes, setEnergyCubes] = useState(0);
  const initialRarityCounts = { [Rarity.Common]: 0, [Rarity.Uncommon]: 0, [Rarity.Magic]: 0, [Rarity.Rare]: 0, [Rarity.Epic]: 0, [Rarity.Legendary]: 0, [Rarity.Mythic]: 0, [Rarity.Immortal]: 0, [Rarity.Celestial]: 0 };
  const [pickedUpItemCounts, setPickedUpItemCounts] = useState<Record<string, number>>(initialRarityCounts);
  const [pickedUpCubeBreakdown, setPickedUpCubeBreakdown] = useState<Record<string, number>>(initialRarityCounts);
  const [totalItemsPickedUp, setTotalItemsPickedUp] = useState(0);

  const inventoryRef = useRef<GeneratedItem[]>(inventory);
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [equipment, setEquipment] = useState<EquipmentState>({ ...EMPTY_EQUIPMENT });
  const [computedStatsUI, setComputedStatsUI] = useState<PlayerStats>(() => computeStats(EMPTY_EQUIPMENT, INITIAL_PERMANENT_UPGRADES));
  const [selectedIndex, setSelectedIndex] = useState(0); // インベントリ用
  const [isGameOver, setIsGameOver] = useState(false);
  const [isTitleScreen, setIsTitleScreen] = useState(true); // 【追加】タイトル画面状態
  const [isUpdateScreen, setIsUpdateScreen] = useState(false); // 【追加】UPDATE画面状態
  const [isChangelogOpen, setIsChangelogOpen] = useState(false); // 【追加】更新履歴画面状態
  const [activeDevice, setActiveDevice] = useState<'keyboard' | 'gamepad'>('keyboard'); // 【追加】アクティブデバイス状態
  const [titleMenuIndex, setTitleMenuIndex] = useState(0); // 【追加】タイトル画面のメニュー選択
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // 【追加】設定画面状態
  const [isHelpOpen, setIsHelpOpen] = useState(false); // 【追加】ヘルプ画面状態
  const [isModeSelectOpen, setIsModeSelectOpen] = useState(false);
  const [gameMode, setGameMode] = useState<'normal' | 'practice'>('normal');
  const gameModeRef = useRef<'normal' | 'practice'>('normal');
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);

  const [isSpawning, setIsSpawning] = useState(false);
  const [spawnStartTime, setSpawnStartTime] = useState(0);

  // 音量設定 (セーブデータから初期化)
  const [bgmVolume, setBgmVolume] = useState(() => getSaveData().bgmVolume);
  const [seVolume, setSeVolume] = useState(() => getSaveData().seVolume);
  const [masterVolume, setMasterVolume] = useState(() => getSaveData().masterVolume);
  const prevMasterVolumeRef = useRef(masterVolume > 0 ? masterVolume : 0.5);

  const handleToggleMasterMute = useCallback(() => {
    if (masterVolume > 0) {
      playSound('ui_cancel');
      prevMasterVolumeRef.current = masterVolume;
      setMasterVolume(0);
    } else {
      const target = prevMasterVolumeRef.current || 0.5;
      // 即座に音量を反映させてからSEを鳴らす
      setMasterSeVolume(seVolume * target);
      setMasterBgmVolume(bgmVolume * target);
      setMasterVolume(target);
      playSound('ui_select');
    }
  }, [masterVolume, seVolume, bgmVolume]);

  // インベントリ表示設定
  const [showInventoryMainAll, setShowInventoryMainAll] = useState(() => getSaveData().showInventoryMainAll);
  const [showInventorySubAll, setShowInventorySubAll] = useState(() => getSaveData().showInventorySubAll);
  const [inventoryDisplayLimit, setInventoryDisplayLimit] = useState(() => getSaveData().inventoryDisplayLimit);

  // ※コード上の singleStickModeSetting / isSingleStick は「シンクロモード」に対応します
  // シンクロモード設定
  const [singleStickModeSetting, setSingleStickModeSetting] = useState<'manual' | 'always_on' | 'always_off'>(() => getSaveData().singleStickModeSetting);
  const [isSingleStick, setIsSingleStick] = useState(false);

  // プレイヤースキン設定
  const [playerSkinSetting, setPlayerSkinSetting] = useState<'default' | 'sphere' | 'crystal' | 'armor' | 'satellite'>(() => getSaveData().playerSkinSetting ?? 'default');

  useEffect(() => {
    if (singleStickModeSetting === 'always_on') {
      setIsSingleStick(true);
    } else if (singleStickModeSetting === 'always_off') {
      setIsSingleStick(false);
    } else if (singleStickModeSetting === 'manual') {
      setIsSingleStick(false); // 設定変更時に初期状態に戻す
    }
  }, [singleStickModeSetting]);

  // 音量変更をサウンドエンジンに即時反映
  useEffect(() => {
    setMasterBgmVolume(bgmVolume * masterVolume);
  }, [bgmVolume, masterVolume]);

  useEffect(() => {
    setMasterSeVolume(seVolume * masterVolume);
  }, [seVolume, masterVolume]);

  // 【追加】タイトル画面でのゲームパッド入力監視用
  const { poll: pollTitleGamepad } = useGamepad();
  const titleEnterTimeRef = useRef<number>(Date.now());

  // 【追加】タイトル画面に入った時刻を記録（入力暴発防止用）
  useEffect(() => {
    if (isTitleScreen && !isUpdateScreen) {
      titleEnterTimeRef.current = Date.now();
    }
  }, [isTitleScreen, isUpdateScreen]);

  const energyCubesRef = useRef(energyCubes);
  useEffect(() => { energyCubesRef.current = energyCubes; }, [energyCubes]);
  const gameOverTimeRef = useRef<number>(0);
  useEffect(() => {
    if (isGameOver) gameOverTimeRef.current = Date.now();
  }, [isGameOver]);
  const [resultStatTab, setResultStatTab] = useState<'total' | 'base'>('total');
  const [resultAffixTab, setResultAffixTab] = useState<'percent' | 'value'>('percent');
  const [resultSelectedIndex, setResultSelectedIndex] = useState(0);
  const resultSelectedIndexRef = useRef(resultSelectedIndex);
  useEffect(() => { resultSelectedIndexRef.current = resultSelectedIndex; }, [resultSelectedIndex]);
  const [isPaused, setIsPaused] = useState(false);
  const [isGamepadActive, setIsGamepadActive] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'melee' | 'ranged' | 'magic' | 'armor'>('all');
  const [secondaryTabs, setSecondaryTabs] = useState<Record<string, string>>({
    melee: 'all', ranged: 'all', magic: 'all', armor: 'all'
  });
  const secondaryTab = activeTab === 'all' ? 'all' : (secondaryTabs[activeTab] || 'all');
  const [gameKey, setGameKey] = useState(0);

  const [leftActionTick, setLeftActionTick] = useState(0);
  const [leftLBTick, setLeftLBTick] = useState(0);
  const [leftRBTick, setLeftRBTick] = useState(0);

  // ポーズメニュー用
  const PAUSE_MENU_OPTIONS = ['再開', 'ヘルプ', '設定', 'ゲーム終了'];
  const [selectedPauseIndex, setSelectedPauseIndex] = useState(0);

  // 討伐数と報酬システム
  const [killCount, setKillCount] = useState(0);
  const [nextRewardKill, setNextRewardKill] = useState(20);
  const [showRewardScreen, setShowRewardScreen] = useState(false);
  const [currentRewards, setCurrentRewards] = useState<Reward[]>([]);
  const [permanentUpgrades, setPermanentUpgrades] = useState<PermanentUpgrades>({ ...INITIAL_PERMANENT_UPGRADES });
  const [selectedRewardIndex, setSelectedRewardIndex] = useState(-1); // 報酬画面用
  const [acquiredRewards, setAcquiredRewards] = useState<(Reward & { count: number })[]>([]);
  const [activeEnchant, setActiveEnchant] = useState<'none' | 'fire' | 'ice' | 'lightning'>('none');

  // リロール・バニッシュ用ステート
  const [rerollsLeft, setRerollsLeft] = useState(0);
  const [banishesLeft, setBanishesLeft] = useState(0);
  const [isKillScreen, setIsKillScreen] = useState(false);
  const [isBanishMode, setIsBanishMode] = useState(false);
  const banishedIdsRef = useRef<string[]>([]);

  const permanentUpgradesRef = useRef(permanentUpgrades);
  permanentUpgradesRef.current = permanentUpgrades;

  // 報酬の二重取り防止用ロック
  const playTimeRef = useRef(0);
  const waveTextRef = useRef<HTMLDivElement>(null); // 【追加】WAVE表示用
  const timerTextRef = useRef<HTMLDivElement>(null);
  const warningContainerRef = useRef<HTMLDivElement>(null); // 【追加】警告UIコンテナ用
  const warningTextRef = useRef<HTMLDivElement>(null);      // 【追加】警告テキスト用
  const isProcessingRewardRef = useRef(false);
  const rewardPhaseRef = useRef(1);
  const lastMegaCrushTimeRef = useRef(0);
  const rewardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const acquiredRewardsRef = useRef(acquiredRewards);
  useEffect(() => { acquiredRewardsRef.current = acquiredRewards; }, [acquiredRewards]);

  // 入力暴発防止用タイムスタンプ
  const lastRewardActionTimeRef = useRef(0);

  // エンチャント状態をグローバル同期 (レベルアップ時のレベル更新用)
  useEffect(() => {
    const enchantIds: Record<string, string> = { fire: 'enchantFire', ice: 'enchantIce', lightning: 'enchantLightning' };
    const rewardId = enchantIds[activeEnchant];
    const lv = rewardId ? (acquiredRewards.find(r => r.id === rewardId)?.count || 1) : 1;
    setGlobalEnchantState(activeEnchant, lv);
  }, [activeEnchant, acquiredRewards]);

  // フラッシュエフェクトの減衰
  useEffect(() => {
    if (flashOpacity > 0) {
      const timer = requestAnimationFrame(() => {
        setFlashOpacity(Math.max(0, flashOpacity - 0.05));
      });
      return () => cancelAnimationFrame(timer);
    }
  }, [flashOpacity]);

  const handleMegaCrush = useCallback(() => {
    if (isGameOver || isPaused || isTitleScreen || isUpdateScreen) return;

    const maxHpBase = getPlayerMaxHp();
    const baseCost = 50;
    const actualCost = playerDebuffs.ice > 0 ? baseCost * 2.0 : baseCost;

    // 発動条件: 現在の最大HP（ペナルティ適用後）が厳密に10より大きい場合、かつ必要SPがある場合のみ
    if (maxHpBase <= 10 || getDashStamina() < actualCost) return;

    // コスト消費
    if (!drainStamina(baseCost)) return;
    // HPペナルティを加算（永続化のため global な penalty 変数を使用）
    addMegaCrushPenalty(10);

    // ステータスを即座に再計算して同期
    const newStats = computeStats(equipmentRef.current, permanentUpgradesRef.current);
    playerStatsRef.current = newStats;
    setComputedStatsUI(newStats);
    setMaxHp(newStats.health);

    // メタプログレッション強化の取得
    const save = getSaveData();
    const upgradeLvls = save.upgradeLevels || {};
    const invincibleLvl = upgradeLvls['up_invincible'] || 0;
    const knockbackLvl = upgradeLvls['up_knockback'] || 0;

    // 計算（絶対に playerStatsRef.current の中身を書き換えないよう、読み取りのみで合算）
    const latestStats = playerStatsRef.current;
    const baseMegaCrushDamage = latestStats.meleeAttackPower + latestStats.rangedAttackPower + latestStats.magicPower;

    const invDuration = 1.0 + (invincibleLvl * 0.1); // 基本1秒 + 10%/lv
    const knockbackDist = 7.5 * (1.0 + (knockbackLvl * 0.1)); // 基本7.5m + 10%/lv

    // 【追加】演出を見せるためにリワード発生を1秒間抑制する（ダメージ判定より前に記録）
    lastMegaCrushTimeRef.current = performance.now();

    // 実行
    const px = window.__playerPosRef?.current.x || 0;
    const pz = window.__playerPosRef?.current.z || 0;
    triggerMegaCrush(px, pz, baseMegaCrushDamage, knockbackDist);
    clearAllEnemyProjectiles();
    triggerInvincibility(invDuration);

    // エフェクト
    playSound('mega_crush');
    setFlashOpacity(1.0);
    window.dispatchEvent(new CustomEvent('trigger-mega-crush-visual'));
  }, [isGameOver, isPaused, isTitleScreen, isUpdateScreen, flashOpacity]);

  useEffect(() => {
    if (isPaused || isGameOver || isSpawning) return;
    let frameId: number;
    const update = () => {
      playTimeRef.current = getGlobalGameTime();
      if (timerTextRef.current) {
        const pt = playTimeRef.current;
        const mins = Math.floor(pt / 60).toString().padStart(2, '0');
        const secs = Math.floor(pt % 60).toString().padStart(2, '0');
        const ms = Math.floor((pt % 1) * 100).toString().padStart(2, '0');
        timerTextRef.current.innerHTML = `${mins}:${secs}<span style="font-size: 0.6em">.${ms}</span>`;
      }

      // 【追加】現在のWAVE番号を計算して表示 (0分台 = WAVE 1)
      const time = playTimeRef.current;
      const currentWave = Math.min(14, Math.floor(time / 60) + 1);
      if (waveTextRef.current) {
        // 【修正】絵文字を🚩に変更、コロンを追加
        waveTextRef.current.innerHTML = `<span class="impact-font">🚩 WAVE:</span> ${currentWave}`;
      }

      if (gameModeRef.current === 'practice') {
        // プラクティスモード: 9分56秒 (596秒) でクリア
        if (time >= 596 && !isGameOver) {
          window.__isGameClear = true;
          setIsGameOver(true);
          return;
        }
      } else {
        // ノーマルモード: キルスクリーン判定 (15分経過)
        if (!isKillScreen && time >= 900) {
          setIsKillScreen(true);
        }
      }

      // 警告・カウントダウンUIの更新
      if (warningContainerRef.current && warningTextRef.current) {
        const secondsInMinute = time % 60;

        // Wave 14が最大のため、14分以降（Wave 15へのカウントダウン）は表示しない
        if (secondsInMinute >= 50.0 && currentWave < 14) {
          const timeLeft = (60.0 - secondsInMinute).toFixed(2);

          // 【修正】次に来るWAVE番号は現在のWAVE + 1
          const nextWave = currentWave + 1;

          let msg = `Wave ${nextWave} 開始まで`;
          if (nextWave === 3) msg = "Wave 3 : 高速移動個体『ナイト』出現まで";
          else if (nextWave === 4) msg = "Wave 4 : ナイト制限緩和、出現率アップまで";
          else if (nextWave === 5) msg = "Wave 5 : 重装甲個体『ルーク』出現まで";
          else if (nextWave === 6) msg = "Wave 6 : ルーク制限緩和、出現率アップまで";
          else if (nextWave === 7) msg = "Wave 7 : 遠隔攻撃個体『ビショップ』出現まで";
          else if (nextWave === 8) msg = "Wave 8 : ビショップ制限緩和、出現率アップまで";
          else if (nextWave === 9) msg = "Wave 9 : 全個体制限解除、総攻撃開始まで";
          else if (nextWave === 11) msg = "WARNING : 特異個体『クイーン』出現まで";

          const blink = Math.floor(time * 4) % 2 === 0;
          const color = blink ? '#ff5252' : '#ffeb3b';

          warningContainerRef.current.style.opacity = '1';
          warningContainerRef.current.style.borderColor = color;
          warningContainerRef.current.style.boxShadow = `0 0 10px ${color}80`;

          warningTextRef.current.style.color = color;
          warningTextRef.current.innerText = `⚠️ ${msg} [ ${timeLeft} ]`;
        } else {
          warningContainerRef.current.style.opacity = '0';
        }
      }

      frameId = requestAnimationFrame(update);
    };
    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [isPaused, isGameOver, isSpawning]);

  useEffect(() => {
    if (showRewardScreen) {
      isProcessingRewardRef.current = false;
    }
  }, [showRewardScreen]);

  // 報酬抽選ロジック（独立関数化 & バニッシュ対応）
  const generateRewards = useCallback(() => {
    const currentLevels = acquiredRewardsRef.current.reduce((acc, r) => ({ ...acc, [r.id]: r.count }), {} as Record<string, number>);
    const availablePool = REWARDS.filter((reward: Reward) => {
      const current = currentLevels[reward.id] || 0;
      if (reward.maxLevel && current >= reward.maxLevel) return false;
      // バニッシュ済みIDを除外
      if (banishedIdsRef.current.includes(reward.id)) return false;
      return true;
    });
    // 魔法とエンチャントを分けて抽出するロジック
    const activeTypeIds = ['spell', 'enchant'];
    const magicPool = availablePool.filter(r => activeTypeIds.some(prefix => r.id.startsWith(prefix))).sort(() => 0.5 - Math.random());
    const passivePool = availablePool.filter(r => !activeTypeIds.some(prefix => r.id.startsWith(prefix))).sort(() => 0.5 - Math.random());

    const selectedRewards: Reward[] = [];
    if (magicPool.length > 0) {
      selectedRewards.push(magicPool[0]);
    }

    while (selectedRewards.length < 3 && passivePool.length > 0) {
      selectedRewards.push(passivePool.shift()!);
    }

    // 最終的な並び順もシャッフル
    const finalRewards = selectedRewards.sort(() => 0.5 - Math.random());
    setCurrentRewards(finalRewards);
    // 未選択状態（-1）で初期化（誤操作防止のため十字キー入力を必須にする）
    setSelectedRewardIndex(-1);
    setIsBanishMode(false);
  }, []);

  useEffect(() => {
    const unsub = subscribeProgress((state) => {
      setKillCount(state.killCount);
      setNextRewardKill(state.nextRewardKill);

      // キル数が目標に達した場合
      if (state.killCount >= state.nextRewardKill && state.killCount > 0) {
        const timeSinceMC = performance.now() - lastMegaCrushTimeRef.current;
        const delay = timeSinceMC < 1000 ? 1000 - timeSinceMC : 0;

        // 既にタイマーが稼働中ならスキップ（二重起動防止）
        if (rewardTimerRef.current) return;

        const triggerReward = () => {
          rewardTimerRef.current = null;
          setIsPaused(true);
          generateRewards();
          setShowRewardScreen(true);
          playSound('reward');

          // 次の要求キル数までのギャップをスケーリング（累乗を使って理想的な曲線にする）
          const currentPhase = rewardPhaseRef.current;
          const mult = window.__systemUpgrades?.killReqMult || 1.0;
          const nextGap = Math.floor(20 * Math.pow(currentPhase + 1, 1.25) * mult);
          rewardPhaseRef.current += 1;

          advanceRewardPhase(nextGap);
        };

        if (delay > 0) {
          rewardTimerRef.current = setTimeout(triggerReward, delay);
        } else {
          triggerReward();
        }
      }
    });
    return () => {
      unsub();
      if (rewardTimerRef.current) clearTimeout(rewardTimerRef.current);
    };
  }, [generateRewards]);

  const equipmentRef = useRef<EquipmentState>(equipment);
  equipmentRef.current = equipment;

  const syncStats = useCallback((newEquip: EquipmentState) => {
    const stats = computeStats(newEquip, permanentUpgradesRef.current);
    setComputedStatsUI(stats);
    Object.assign(playerStatsRef.current, stats);
    setMaxHp(stats.health);
  }, []);

  // バフ等によるリアルタイムなステータス変動を playerStatsRef.current に反映する
  useEffect(() => {
    // バフ変動時に再計算を行うコールバックを登録
    registerStatsUpdateCallback(() => {
      if (isTitleScreen || isPaused || isUpdateScreen) return;
      const stats = computeStats(equipmentRef.current, permanentUpgradesRef.current);
      Object.assign(playerStatsRef.current, stats);
      // UI表示用のステータスも更新
      setComputedStatsUI(stats);
    });
    return () => registerStatsUpdateCallback(() => { });
  }, [isTitleScreen, isPaused, isUpdateScreen]);


  const handleSelectReward = useCallback((reward: Reward | undefined) => {
    if (!reward || isProcessingRewardRef.current) return;

    // 入力暴発防止 (300ms)
    const now = Date.now();
    if (now - lastRewardActionTimeRef.current < 300) return;
    lastRewardActionTimeRef.current = now;

    isProcessingRewardRef.current = true; // 二重取りロック
    playSound('ui_select');

    setPermanentUpgrades((prev) => {
      // 説明文に [プレイヤーLv が含まれる場合はスケーリング対象と判定
      const isScaling = reward.desc && reward.desc.includes('[プレイヤーLv');
      const actualValue = isScaling ? reward.value * getLevel() : reward.value;

      const next = { ...prev, [reward.type]: prev[reward.type] + actualValue };
      permanentUpgradesRef.current = next;
      // ステータスを即座に同期
      syncStats(equipmentRef.current);
      return next;
    });

    setAcquiredRewards(prev => {
      const existing = prev.find(r => r.id === reward.id);
      if (existing) return prev.map(r => r.id === reward.id ? { ...r, count: r.count + 1 } : r);
      return [...prev, { ...reward, count: 1 }];
    });

    setShowRewardScreen(false);
    setIsPaused(false);
    setIsBanishMode(false);
  }, [syncStats]);

  // リロール処理
  const handleReroll = useCallback(() => {
    if (rerollsLeft <= 0) return;

    // 入力暴発防止 (300ms)
    const now = Date.now();
    if (now - lastRewardActionTimeRef.current < 300) return;
    lastRewardActionTimeRef.current = now;

    setRerollsLeft(r => r - 1);
    playSound('ui_move');
    generateRewards();
  }, [rerollsLeft, generateRewards]);

  // バニッシュ＋報酬インタラクション処理
  const handleRewardInteraction = useCallback((reward: Reward | undefined, index: number) => {
    if (!reward) return;
    if (isBanishMode) {
      if (banishesLeft <= 0) return;

      // 入力暴発防止 (300ms)
      const now = Date.now();
      if (now - lastRewardActionTimeRef.current < 300) return;
      lastRewardActionTimeRef.current = now;

      // 選択した報酬をバニッシュリストに追加
      banishedIdsRef.current = [...banishedIdsRef.current, reward.id];
      setBanishesLeft(b => b - 1);
      setIsBanishMode(false);
      // 即座に新しい報酬を引き直す
      generateRewards();
    } else {
      handleSelectReward(reward);
    }
  }, [isBanishMode, banishesLeft, generateRewards, handleSelectReward]);

  const handleMagnet = useCallback(() => {
    if (magnetUses > 0) {
      setMagnetUses(u => u - 1);
      playSound('magnet');
      if (window.__playerPosRef) {
        const pos = window.__playerPosRef.current;
        pullAllDrops(pos.x, pos.z);
        pullAllGems(pos.x, pos.z);
        spawnActionPopup(0, 2.5, 2.0, 'Absorb!', 'absorb', true);
      }
    }
  }, [magnetUses]);

  // 不要になった trySwitchEnchant とその useEffect を削除しました


  useEffect(() => {
    const handleActivity = () => setIsGamepadActive(false);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('mousedown', handleActivity);
    window.addEventListener('mousemove', handleActivity);
    return () => {
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('mousedown', handleActivity);
      window.removeEventListener('mousemove', handleActivity);
    };
  }, []);

  useEffect(() => {
    const stats = computeStats(EMPTY_EQUIPMENT, INITIAL_PERMANENT_UPGRADES);
    initPlayerHp(stats.health);
    setMaxHp(stats.health); // UI側の初期最大HPも同期
  }, []);

  const handleEquip = useCallback((item: GeneratedItem) => {
    const reliefLvl = getSaveData().upgradeLevels['up_equip_limit_relief'] || 0;
    // レベル制限
    if (item.itemLevel > getLevel() + reliefLvl) {
      return;
    }

    const slot = item.baseItem.slot;
    const currentEquip = equipmentRef.current;
    const existing = currentEquip[slot];

    // 装備更新
    const newEquip: EquipmentState = { ...currentEquip, [slot]: item };

    setInventory((inv) => {
      const filtered = inv.filter((i) => i.uid !== item.uid);
      return existing ? [existing, ...filtered] : filtered;
    });
    setEquipment(newEquip);
    syncStats(newEquip);
    playSound('equip');
  }, [syncStats]);

  const handleUnequip = useCallback((slot: EquipSlot) => {
    const currentEquip = equipmentRef.current;
    const item = currentEquip[slot];
    if (!item) return;
    const newEquip: EquipmentState = { ...currentEquip, [slot]: null };
    setInventory((inv) => [...inv, item]); // 末尾に追加
    setEquipment(newEquip);
    syncStats(newEquip);
    playSound('equip');
  }, [syncStats]);

  const autoEquipLogsRef = useRef<((entry: PickupLogEntry) => void) | null>(null);

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const unsubscribe = onPickup((drop: DroppedItem) => {
      const item = drop.item;
      const slot = item.baseItem.slot;
      const currentEquip = equipmentRef.current;

      // 1. アイテム取得と同時にエナジーキューブを即時計算・獲得
      const CUBE_RATES: Record<string, number> = {
        [Rarity.Common]: 1, [Rarity.Uncommon]: 3, [Rarity.Magic]: 9, [Rarity.Rare]: 27,
        [Rarity.Epic]: 81, [Rarity.Legendary]: 243, [Rarity.Mythic]: 729, [Rarity.Immortal]: 2187, [Rarity.Celestial]: 6561
      };
      const earnedCubes = (CUBE_RATES[item.rarity] || 0) * (item.itemLevel || 1);

      setEnergyCubes(prev => prev + earnedCubes);
      setTotalItemsPickedUp(prev => prev + 1);
      setPickedUpItemCounts(prev => ({ ...prev, [item.rarity]: prev[item.rarity] + 1 }));
      setPickedUpCubeBreakdown(prev => ({ ...prev, [item.rarity]: prev[item.rarity] + earnedCubes }));

      let newInventory = [...inventoryRef.current];

      // 2. 未装備枠があり、かつ現在のレベルで装備可能な場合のみ自動装備
      const reliefLvl = getSaveData().upgradeLevels['up_equip_limit_relief'] || 0;
      if (!currentEquip[slot] && item.itemLevel <= getLevel() + reliefLvl) {
        const newEquip: EquipmentState = { ...currentEquip, [slot]: item };
        setEquipment(newEquip);
        equipmentRef.current = newEquip;
        syncStats(newEquip);
        if (autoEquipLogsRef.current) {
          autoEquipLogsRef.current({ id: item.uid + '_autoequip', displayName: drop.displayName, rarityNameJa: drop.rarityNameJa, color: drop.color, timestamp: Date.now(), isAutoEquip: true, itemLevel: item.itemLevel });
        }
      } else {
        newInventory.push(item);
      }

      // 3. カテゴリごとの分類関数（26サブカテゴリ対応）
      const getCategory = (i: GeneratedItem) => {
        const s = i.baseItem.slot;
        if (s === EquipSlot.Shield) return 'shield'; if (s === EquipSlot.Helmet) return 'helm';
        if (s === EquipSlot.Armor) return 'armor'; if (s === EquipSlot.Boots) return 'boots';
        if (s === EquipSlot.Ring) return 'ring'; if (s === EquipSlot.Amulet) return 'amulet';
        const id = i.baseItem.id.toLowerCase();
        const subTabs = ['dagger', 'saber', 'axe', 'spear', 'claymore', 'hammer', 'knuckle', 'handgun', 'smg', 'rifle', 'shotgun', 'grenade', 'boomerang', 'chakram', 'kris', 'mace', 'gauntlet', 'grimoire', 'cards', 'orb'];
        for (const tab of subTabs) { if (id.includes(tab)) return tab; }
        return 'other';
      };

      // 4. インベントリ内の各カテゴリが108個を超えないよう自動整理（弱い順に削除）
      const categoryMap = new Map<string, GeneratedItem[]>();
      for (const i of newInventory) {
        const cat = getCategory(i);
        if (!categoryMap.has(cat)) categoryMap.set(cat, []);
        categoryMap.get(cat)!.push(i);
      }

      const removeUids = new Set<string>();
      for (const itemsInCat of categoryMap.values()) {
        if (itemsInCat.length > 108) {
          // 削除対象を特定するために強さ昇順（弱いものが上）でソート
          itemsInCat.sort((a, b) => {
            const ra = RARITY_ORDER[a.rarity] ?? 0;
            const rb = RARITY_ORDER[b.rarity] ?? 0;
            if (ra !== rb) return ra - rb;
            return a.itemLevel - b.itemLevel;
          });
          const removeCount = itemsInCat.length - 108;
          for (let i = 0; i < removeCount; i++) {
            removeUids.add(itemsInCat[i].uid);
          }
        }
      }

      // 新しいアイテムが追加された「現在のソート順」を維持したまま、削除対象だけを間引く
      const keepList = newInventory.filter(item => !removeUids.has(item.uid));

      inventoryRef.current = keepList;
      setInventory(keepList);
    });
    return unsubscribe;
  }, [syncStats]);

  const handleSortByRarity = useCallback(() => {
    const reliefLvl = getSaveData().upgradeLevels['up_equip_limit_relief'] || 0;
    const currentLevel = getLevel() + reliefLvl;
    setInventory((prev) => [...prev].sort((a, b) => {
      // 1. 装備可能なもの（レベル条件を満たしているもの）を優先
      const aEquippable = a.itemLevel <= currentLevel ? 1 : 0;
      const bEquippable = b.itemLevel <= currentLevel ? 1 : 0;
      if (aEquippable !== bEquippable) {
        return bEquippable - aEquippable; // 1(装備可能) が上に来るようにする
      }

      // 2. レアリティの高いものを優先
      const ra = RARITY_ORDER[a.rarity] ?? 0;
      const rb = RARITY_ORDER[b.rarity] ?? 0;
      if (rb !== ra) {
        return rb - ra;
      }

      // 3. アイテムレベルの高いものを優先
      return b.itemLevel - a.itemLevel;
    }));
    setSelectedIndex(0);
  }, []);

  const handleRestart = useCallback(() => {
    resetBossHPBus();
    resetLevel();
    resetMegaCrushPenalty();
    const loadedUps = loadUpgradesFromSave();
    const stats = computeStats(EMPTY_EQUIPMENT, loadedUps);
    playerStatsRef.current = stats;
    setComputedStatsUI(stats);
    setSelectedIndex(0);
    resetPlayerHp(stats.health); // 初期最大HPでリセット
    resetDash();
    resetPlayerDebuffs();
    resetEnemySpawner();
    resetDrops();
    resetGems();
    resetCombo();
    resetMaxCombo();
    const mult = window.__systemUpgrades?.killReqMult || 1.0;
    const initialNextReward = Math.floor(20 * mult);
    resetGameProgress(initialNextReward);

    setInventory([]);
    setEquipment({ ...EMPTY_EQUIPMENT });
    setPermanentUpgrades(loadedUps);
    permanentUpgradesRef.current = loadedUps;

    setIsGameOver(false);
    setIsPaused(false);
    setShowRewardScreen(false);

    if (singleStickModeSetting === 'manual') {
      setIsSingleStick(false);
    } else if (singleStickModeSetting === 'always_on') {
      setIsSingleStick(true);
    } else {
      setIsSingleStick(false);
    }

    const save = getSaveData();
    const lvls = save.upgradeLevels || {};
    setHealUses(lvls['up_heal'] || 0);
    setMagnetUses(lvls['up_magnet'] || 0);
    setResilienceUses(lvls['up_resilience'] || 0);
    setRerollsLeft(lvls['up_reroll'] || 0);
    setBanishesLeft(lvls['up_vanish'] || 0);
    setIsBanishMode(false);
    banishedIdsRef.current = [];

    const initialRewards = [];
    if (lvls['up_enc_fire']) initialRewards.push({ ...REWARDS.find(r => r.id === 'enchantFire')!, count: lvls['up_enc_fire'] });
    if (lvls['up_enc_ice']) initialRewards.push({ ...REWARDS.find(r => r.id === 'enchantIce')!, count: lvls['up_enc_ice'] });
    if (lvls['up_enc_lightning']) initialRewards.push({ ...REWARDS.find(r => r.id === 'enchantLightning')!, count: lvls['up_enc_lightning'] });

    setAcquiredRewards(initialRewards);
    setActiveEnchant('none');
    setPickedUpItemCounts(initialRarityCounts);
    setPickedUpCubeBreakdown(initialRarityCounts);
    setTotalItemsPickedUp(0);
    setKillCount(0);

    // エナジーキューブのセーブ処理をStateの関数型アップデートから分離
    // React Strict Mode (Dev) での二重加算を防止し、確実に1回だけ保存する
    let finalCubes = energyCubesRef.current;
    let earnedHyper = 0;

    if (gameModeRef.current === 'normal') {
      if (window.__isGameClear) {
        earnedHyper = 3; // キング撃破クリア時は一律3個
      } else if (window.__queenKilled) {
        earnedHyper = 1; // クイーン撃破後にゲームオーバー時は1個
      } else {
        earnedHyper = 0; // クイーン撃破前にゲームオーバー時は0個
      }
    } else if (gameModeRef.current === 'practice') {
      // プラクティスモードは最終エナジーキューブ量が半減（端数繰り上げ）、ハイパーキューブは常に0個
      finalCubes = Math.ceil(finalCubes / 2);
      earnedHyper = 0;
    }

    if (finalCubes > 0 || earnedHyper > 0) {
      const saveData = getSaveData();
      saveData.totalEnergyCubes += finalCubes;
      if (saveData.hyperCubes === undefined) saveData.hyperCubes = 0;
      saveData.hyperCubes += earnedHyper;
      saveGameData(saveData);
    }

    // クリア系のグローバル状態を初期化
    window.__queenKilled = false;
    window.__isGameClear = false;

    setEnergyCubes(0);
    energyCubesRef.current = 0; // 重複防止

    setResultSelectedIndex(0);
    setGlobalEnchantState('none', 1);

    setGameKey(k => k + 1);
    playTimeRef.current = 0;
    rewardPhaseRef.current = 1;
    setIsKillScreen(false);
    if (timerTextRef.current) timerTextRef.current.innerHTML = '00:00<span style="font-size: 0.6em">.00</span>';
  }, []);

  const handleReturnToTitle = useCallback(() => {
    handleRestart(); // 既存のリスタート処理（キューブのセーブと状態リセット）を実行
    setIsTitleScreen(true); // タイトル画面フラグをONにする
    titleEnterTimeRef.current = Date.now(); // 追加: タイトル画面に入った時刻を記録
  }, [handleRestart]);

  // 【追加】タイトル画面からゲームを開始する処理
  const handleStartGame = useCallback((mode: 'normal' | 'practice' = 'normal') => {
    setGameMode(mode);
    initAudio();
    initBgm();
    setIsTitleScreen(false);
    setIsModeSelectOpen(false);
    handleRestart();

    // プレイヤー出現演出の開始
    const startTime = Date.now();
    setSpawnStartTime(startTime);
    setIsSpawning(true);

    // 演出時間を 2.5秒に延長
    setTimeout(() => {
      setIsSpawning(false);
    }, 2500);
  }, [handleRestart]);

  // --- 【全画面共通】キーボード/マウス入力によるデバイス切り替え ---
  useEffect(() => {
    const handleInput = () => {
      setActiveDevice('keyboard');
      initBgm();
    };
    window.addEventListener('keydown', handleInput);
    window.addEventListener('mousedown', handleInput);
    window.addEventListener('mousemove', handleInput);
    return () => {
      window.removeEventListener('keydown', handleInput);
      window.removeEventListener('mousedown', handleInput);
      window.removeEventListener('mousemove', handleInput);
    };
  }, []);

  // --- 【全画面共通】ゲームパッド入力によるデバイス切り替え ---
  useEffect(() => {
    let frameId: number;
    const checkGamepad = () => {
      const { mainDevice } = pollTitleGamepad();
      if (mainDevice) {
        const hasInput = mainDevice.buttons.some(b => b > 0.1) || mainDevice.axes.some(a => Math.abs(a) > 0.1);
        if (hasInput) {
          setActiveDevice('gamepad');
          setIsGamepadActive(true);
          initBgm();
        }
      }
      frameId = requestAnimationFrame(checkGamepad);
    };
    frameId = requestAnimationFrame(checkGamepad);
    return () => cancelAnimationFrame(frameId);
  }, [pollTitleGamepad]);

  // --- BGM 自動制御コントローラー ---
  const currentBgmRef = useRef<string | null>(null);

  useEffect(() => {
    let frameId: number;
    const checkBgm = () => {
      let nextBgm = 'title';

      if (isTitleScreen) {
        nextBgm = 'title';
      } else if (isGameOver) {
        // ゲームオーバー時は即座に停止し、2秒後にタイトルBGMを流す
        const timeSinceGameOver = (Date.now() - gameOverTimeRef.current) / 1000;
        if (timeSinceGameOver >= 2) {
          nextBgm = 'title';
        } else {
          nextBgm = 'silence';
        }
      } else if (isSpawning) {
        // 出現演出中は無音
        nextBgm = 'silence';
      } else {
        const pt = playTimeRef.current;
        const minutes = Math.floor(pt / 60);

        if (window.__isKingActive) {
          nextBgm = 'king';
        } else if (window.__queenKilled) {
          nextBgm = 'wave11_13';
        } else if (window.__isQueenActive) {
          nextBgm = 'queen';
        } else if (minutes >= 8) {
          nextBgm = 'wave9_10';
        } else if (minutes >= 6) {
          nextBgm = 'wave7_8';
        } else if (minutes >= 4) {
          nextBgm = 'wave5_6';
        } else if (minutes >= 2) {
          nextBgm = 'wave3_4';
        } else {
          nextBgm = 'wave1_2';
        }
      }

      if (currentBgmRef.current !== nextBgm) {
        currentBgmRef.current = nextBgm;
        if (nextBgm === 'silence') {
          stopBgm(0.5);
        } else {
          playBgm(nextBgm);
        }
      }

      frameId = requestAnimationFrame(checkBgm);
    };
    frameId = requestAnimationFrame(checkBgm);
    return () => cancelAnimationFrame(frameId);
  }, [isTitleScreen, isGameOver, isSpawning]);

  // --- 【タイトル画面専用】ゲームパッド操作ロジック ---
  const nextTitleMoveTimeRef = useRef<number>(0);
  const lastUpRef = useRef(false);
  const lastDownRef = useRef(false);
  const lastAPressedRef = useRef(false);
  const lastBPressedRef = useRef(false);
  const lastStartPressedRef = useRef(false);
  const lastSelectPressedRef = useRef(false);
  const lastLTPressedRef = useRef(false);
  const lastRTPressedRef = useRef(false);

  useEffect(() => {
    if (!isTitleScreen) return;
    let frameId: number;
    const INITIAL_DELAY = 400; // 初回移動後のタメ
    const REPEAT_INTERVAL = 80; // 連続移動の速度

    const checkGamepad = () => {
      if (isSettingsOpen || isUpdateScreen || isHelpOpen || isChangelogOpen) {
        const { mainDevice } = pollTitleGamepad();
        if (mainDevice) {
          // 設定画面が開いている間も、ボタンの状態だけは更新し続けて「押しっぱなし」を検知できるようにする
          lastAPressedRef.current = mainDevice.buttons[0] > 0.5;
          lastBPressedRef.current = mainDevice.buttons[1] > 0.5;
          lastStartPressedRef.current = mainDevice.buttons[9] > 0.5;
          lastSelectPressedRef.current = mainDevice.buttons[8] > 0.5;
          lastLTPressedRef.current = mainDevice.buttons[6] > 0.5;
          lastRTPressedRef.current = mainDevice.buttons[7] > 0.5;
          lastUpRef.current = mainDevice.buttons[12] > 0.5;
          lastDownRef.current = mainDevice.buttons[13] > 0.5;

          if (lastBPressedRef.current && (isSettingsOpen || isHelpOpen || isChangelogOpen)) {
            const now = Date.now();
            if (now - titleEnterTimeRef.current > 500) {
              if (isHelpOpen) setIsHelpOpen(false);
              else if (isSettingsOpen) setIsSettingsOpen(false);
              else if (isChangelogOpen) setIsChangelogOpen(false);
              playSound('ui_cancel');
              titleEnterTimeRef.current = now; // 暴発防止
            }
          }
        }
        frameId = requestAnimationFrame(checkGamepad);
        return;
      }
      const { mainDevice } = pollTitleGamepad();
      if (mainDevice) {
        const now = Date.now();
        const aPressed = mainDevice.buttons[0] > 0.5; // Aボタン
        const bPressed = mainDevice.buttons[1] > 0.5; // Bボタン
        const startPressed = mainDevice.buttons[9] > 0.5; // Startボタン
        const selectPressed = mainDevice.buttons[8] > 0.5; // SELECT
        const ltPressed = mainDevice.buttons[6] > 0.5; // LT
        const rtPressed = mainDevice.buttons[7] > 0.5; // RT (MASTER VOLUME toggle)

        // 十字キー (D-pad)
        const up = mainDevice.buttons[12] > 0.5;
        const down = mainDevice.buttons[13] > 0.5;

        // 上移動判定
        if (up) {
          if (!lastUpRef.current) {
            // 押し始め
            const maxIdx = isModeSelectOpen ? 3 : 4;
            setTitleMenuIndex((prev) => (prev - 1 + maxIdx) % maxIdx);
            playSound('ui_move');
            nextTitleMoveTimeRef.current = now + INITIAL_DELAY;
          } else if (now >= nextTitleMoveTimeRef.current) {
            // 押しっぱなしリピート
            const maxIdx = isModeSelectOpen ? 3 : 4;
            setTitleMenuIndex((prev) => (prev - 1 + maxIdx) % maxIdx);
            playSound('ui_move');
            nextTitleMoveTimeRef.current = now + REPEAT_INTERVAL;
          }
        }
        // 下移動判定
        if (down && !up) { // 上下同時押しは上優先
          if (!lastDownRef.current) {
            const maxIdx = isModeSelectOpen ? 3 : 4;
            setTitleMenuIndex((prev) => (prev + 1) % maxIdx);
            playSound('ui_move');
            nextTitleMoveTimeRef.current = now + INITIAL_DELAY;
          } else if (now >= nextTitleMoveTimeRef.current) {
            const maxIdx = isModeSelectOpen ? 3 : 4;
            setTitleMenuIndex((prev) => (prev + 1) % maxIdx);
            playSound('ui_move');
            nextTitleMoveTimeRef.current = now + REPEAT_INTERVAL;
          }
        }

        const timeSinceTitleEnter = now - titleEnterTimeRef.current;
        if (timeSinceTitleEnter > 500) {
          if ((aPressed && !lastAPressedRef.current) || (startPressed && !lastStartPressedRef.current)) {
            setTitleMenuIndex((current) => {
              if (!isModeSelectOpen) {
                if (current === 0) { playSound('ui_select'); setIsModeSelectOpen(true); return 1; }
                else if (current === 1) { playSound('ui_select'); setIsUpdateScreen(true); }
                else if (current === 2) { playSound('ui_select'); setIsHelpOpen(true); }
                else if (current === 3) { playSound('ui_select'); setIsSettingsOpen(true); }
              } else {
                if (current === 0) { playSound('ui_select'); handleStartGame('practice'); }
                else if (current === 1) { playSound('ui_select'); handleStartGame('normal'); }
                else if (current === 2) { playSound('ui_cancel'); setIsModeSelectOpen(false); return 0; }
              }
              return current;
            });
          }
          if (isModeSelectOpen && bPressed && !lastBPressedRef.current) {
            playSound('ui_cancel');
            setIsModeSelectOpen(false);
            setTitleMenuIndex(0);
          }
          // LT または SELECT が押されたら更新履歴を開く
          if ((selectPressed && !lastSelectPressedRef.current) || (ltPressed && !lastLTPressedRef.current)) {
            if (!isModeSelectOpen) {
              playSound('ui_select');
              setIsChangelogOpen(true);
            }
          }
          // RT が押されたら音量（マスターボリューム）を切り替え
          if (rtPressed && !lastRTPressedRef.current) {
            handleToggleMasterMute();
          }
        }
        lastAPressedRef.current = aPressed;
        lastBPressedRef.current = bPressed;
        lastStartPressedRef.current = startPressed;
        lastSelectPressedRef.current = selectPressed;
        lastLTPressedRef.current = ltPressed;
        lastRTPressedRef.current = rtPressed;
        lastUpRef.current = up;
        lastDownRef.current = down;
      }
      frameId = requestAnimationFrame(checkGamepad);
    };
    frameId = requestAnimationFrame(checkGamepad);
    return () => cancelAnimationFrame(frameId);
  }, [isTitleScreen, isUpdateScreen, isSettingsOpen, isHelpOpen, isChangelogOpen, isModeSelectOpen, handleStartGame, pollTitleGamepad, handleToggleMasterMute]);


  const handleToggleInventory = useCallback(() => {
    if (isGameOver) return;
    // ポーズメニューが開いている場合はインベントリ操作不可
    if (isPaused && !isInventoryOpen) return;

    setIsInventoryOpen((prev) => {
      const next = !prev;
      if (next) {
        setSelectedIndex(0);
        playSound('inventory_open');
        if (gameModeRef.current === 'practice') setIsPaused(true);
      } else {
        playSound('inventory_close');
        if (gameModeRef.current === 'practice') setIsPaused(false);
      }
      return next;
    });
  }, [isGameOver, isPaused, isInventoryOpen]);

  const handleTogglePause = useCallback(() => {
    if (isGameOver || showRewardScreen || isTitleScreen) return;

    // インベントリが開いている時にポーズボタンが押されたら、インベントリを閉じる（ポーズはかけない/解除する）
    if (isInventoryOpen) {
      handleToggleInventory();
      return;
    }

    // 入力暴発防止 (300ms)
    const now = Date.now();
    if (now - lastRewardActionTimeRef.current < 300) return;
    lastRewardActionTimeRef.current = now;

    setIsPaused((prev) => {
      if (!prev) {
        setSelectedPauseIndex(0); // 開く時に初期化
        playSound('ui_select');
      } else {
        playSound('ui_cancel');
      }
      return !prev;
    });
  }, [isGameOver, showRewardScreen, isTitleScreen, isInventoryOpen, handleToggleInventory]);
  const getSubTabs = (pTab: string) => {
    if (pTab === 'melee') return ['all', 'dagger', 'saber', 'axe', 'spear', 'claymore', 'hammer', 'knuckle'];
    if (pTab === 'ranged') return ['all', 'handgun', 'smg', 'rifle', 'shotgun', 'grenade', 'boomerang', 'chakram'];
    if (pTab === 'magic') return ['all', 'kris', 'mace', 'gauntlet', 'grimoire', 'cards', 'orb'];
    if (pTab === 'armor') return ['all', 'shield', 'helm', 'armor', 'boots', 'ring', 'amulet'];
    return [];
  };

  const availablePrimaryTabs = useMemo(() => {
    const tabs = ['all', 'melee', 'ranged', 'magic', 'armor'];
    return tabs.filter(t => t !== 'all' || showInventoryMainAll);
  }, [showInventoryMainAll]);

  const getAvailableSubTabs = useCallback((pTab: string) => {
    const tabs = getSubTabs(pTab);
    if (tabs.length === 0) return [];
    return tabs.filter(t => t !== 'all' || showInventorySubAll);
  }, [showInventorySubAll]);

  const handleNextTab = useCallback(() => {
    setActiveTab((prev) => {
      const idx = availablePrimaryTabs.indexOf(prev as any);
      const nextIdx = (idx + 1) % availablePrimaryTabs.length;
      return availablePrimaryTabs[nextIdx] as any;
    });
    setSelectedIndex(0);
    playSound('ui_tab_large');
  }, [availablePrimaryTabs]);

  const handlePrevTab = useCallback(() => {
    setActiveTab((prev) => {
      const idx = availablePrimaryTabs.indexOf(prev as any);
      const nextIdx = (idx - 1 + availablePrimaryTabs.length) % availablePrimaryTabs.length;
      return availablePrimaryTabs[nextIdx] as any;
    });
    setSelectedIndex(0);
    playSound('ui_tab_large');
  }, [availablePrimaryTabs]);

  const handleNextSubTab = useCallback(() => {
    setSecondaryTabs((prev) => {
      const tabs = getAvailableSubTabs(activeTab);
      if (tabs.length === 0) return prev;
      const current = prev[activeTab] || 'all';
      // もし現在のサブタブが非表示設定の 'all' だった場合、先頭の有効なタブを基準にする
      const currentIdx = tabs.indexOf(current);
      const nextIdx = (currentIdx === -1 ? 0 : currentIdx + 1) % tabs.length;
      playSound('ui_tab_small');
      return { ...prev, [activeTab]: tabs[nextIdx] };
    });
    setSelectedIndex(0);
  }, [activeTab, getAvailableSubTabs]);

  const handlePrevSubTab = useCallback(() => {
    setSecondaryTabs((prev) => {
      const tabs = getAvailableSubTabs(activeTab);
      if (tabs.length === 0) return prev;
      const current = prev[activeTab] || 'all';
      const currentIdx = tabs.indexOf(current);
      const nextIdx = (currentIdx === -1 ? tabs.length - 1 : currentIdx - 1 + tabs.length) % tabs.length;
      playSound('ui_tab_small');
      return { ...prev, [activeTab]: tabs[nextIdx] };
    });
    setSelectedIndex(0);
  }, [activeTab, getAvailableSubTabs]);

  // 設定変更により現在のタブが無効になった場合に有効なタブへ逃がす
  useEffect(() => {
    if (!showInventoryMainAll && activeTab === 'all') {
      setActiveTab('melee');
    }
  }, [showInventoryMainAll, activeTab]);

  useEffect(() => {
    if (!showInventorySubAll) {
      setSecondaryTabs(prev => {
        let changed = false;
        const next = { ...prev };
        for (const pTab of ['melee', 'ranged', 'magic', 'armor']) {
          if (next[pTab] === 'all') {
            const tabs = getAvailableSubTabs(pTab);
            if (tabs.length > 0) {
              next[pTab] = tabs[0];
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }
  }, [showInventorySubAll, getAvailableSubTabs]);

  // ----------------------------------------
  // グローバル キーボード入力処理
  // ----------------------------------------
  useEffect(() => {
    const handleGameClear = () => {
      // プレイヤーが無敵中でもリザルトを強制的に表示するため
      setIsGameOver(true);
      // ゲームクリア時は死亡サウンドなどを鳴らさない・表示を変える等の場合は
      // 別フラグが必要ですが、今回は画面遷移を優先
    };
    window.addEventListener('game-clear', handleGameClear);
    return () => window.removeEventListener('game-clear', handleGameClear);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 【追加】タイトル画面なら、任意のキー（EnterやSpace等）でゲーム開始
      if (isTitleScreen && !isUpdateScreen && !isSettingsOpen && !isHelpOpen && !isChangelogOpen) {
        if (e.key === 'u' || e.key === 'U') {
          if (!isModeSelectOpen) {
            playSound('ui_select');
            setIsChangelogOpen(true);
            return;
          }
        }
        if (e.key === 'm' || e.key === 'M') {
          handleToggleMasterMute();
          return;
        }
        if (e.key === 'ArrowUp') { setTitleMenuIndex((prev) => (prev - 1 + 4) % 4); playSound('ui_move'); return; }
        if (e.key === 'ArrowDown') { setTitleMenuIndex((prev) => (prev + 1) % 4); playSound('ui_move'); return; }
        if (e.key === 'Enter' || e.key === ' ') {
          if (!isModeSelectOpen) {
            if (titleMenuIndex === 0) { playSound('ui_select'); setIsModeSelectOpen(true); setTitleMenuIndex(1); }
            else if (titleMenuIndex === 1) { playSound('ui_select'); setIsUpdateScreen(true); }
            else if (titleMenuIndex === 2) { playSound('ui_select'); setIsHelpOpen(true); }
            else if (titleMenuIndex === 3) { playSound('ui_select'); setIsSettingsOpen(true); }
          } else {
            if (titleMenuIndex === 0) { playSound('ui_select'); handleStartGame('practice'); }
            else if (titleMenuIndex === 1) { playSound('ui_select'); handleStartGame('normal'); }
            else if (titleMenuIndex === 2) { playSound('ui_cancel'); setIsModeSelectOpen(false); setTitleMenuIndex(0); }
          }
        }
        if (isModeSelectOpen && (e.key === 'Escape' || e.key === 'Backspace')) {
          playSound('ui_cancel'); setIsModeSelectOpen(false); setTitleMenuIndex(0);
        }
        return;
      }

      // マグネット (F)
      if (e.key === 'f' || e.key === 'F') {
        if (!isInventoryOpen && !isPaused && !isGameOver) {
          handleMagnet();
        }
      }

      // ヒール (Q)
      if (e.key === 'q' || e.key === 'Q') {
        if (!isInventoryOpen && !isPaused && !isGameOver) {
          if (healUses > 0) {
            setHealUses(u => u - 1);
            healPlayer(playerStatsRef.current.hpRegen * 100);
          }
        }
      }

      // シンクロモード（isSingleStick）の手動切り替え (Ctrl)
      if (e.key === 'Control') {
        if (!isInventoryOpen && !isPaused && !isGameOver && singleStickModeSetting === 'manual') {
          setIsSingleStick(p => !p);
          playSound('ui_select');
        }
      }

      if (isGameOver) {
        if (e.key === 'Escape') { handleReturnToTitle(); return; }
        const maxLen = Object.values(equipmentRef.current).filter(Boolean).length;
        if (e.key === 'ArrowUp') {
          setResultSelectedIndex(p => Math.max(0, p - 1)); return;
        }
        if (e.key === 'ArrowDown') {
          setResultSelectedIndex(p => Math.min(maxLen + 1, p + 1)); return;
        }
        if (e.key === 'q' || e.key === 'Q' || e.key === 'e' || e.key === 'E') {
          const p = resultSelectedIndexRef.current;
          if (p === maxLen) setResultStatTab(t => t === 'total' ? 'base' : 'total');
          if (p === maxLen + 1) setResultAffixTab(t => t === 'percent' ? 'value' : 'percent');
          return;
        }
        return;
      } else if (isPaused && !isGameOver) {
        // ★ 報酬画面のキーボード操作 (WASDを除外、矢印キーのみ)
        if (showRewardScreen) {
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            e.preventDefault(); // スクロール防止
          }
          if (e.key === 'ArrowLeft') {
            setSelectedRewardIndex(prev => {
              if (prev < 0) { playSound('ui_move'); return 0; }
              if (prev === 4) { playSound('ui_move'); return 3; }
              if (prev > 0 && prev <= 2) { playSound('ui_move'); return prev - 1; }
              return prev;
            });
            return;
          }
          if (e.key === 'ArrowRight') {
            setSelectedRewardIndex(prev => {
              if (prev < 0) { playSound('ui_move'); return 2; }
              if (prev === 3) { playSound('ui_move'); return 4; }
              if (prev >= 0 && prev < 2) { playSound('ui_move'); return prev + 1; }
              return prev;
            });
            return;
          }
          if (e.key === 'ArrowUp') {
            setSelectedRewardIndex(prev => {
              if (prev === 3) { playSound('ui_move'); return 1; }
              if (prev === 4) { playSound('ui_move'); return 2; }
              if (prev !== 1) playSound('ui_move');
              return 1;
            });
            return;
          }
          if (e.key === 'ArrowDown') {
            setSelectedRewardIndex(prev => {
              if (prev < 0) {
                const next = rerollsLeft > 0 ? 3 : (banishesLeft > 0 ? 4 : 1);
                if (next !== prev) playSound('ui_move');
                return next;
              }
              if (prev === 0 || prev === 1) {
                const next = rerollsLeft > 0 ? 3 : (banishesLeft > 0 ? 4 : prev);
                if (next !== prev) playSound('ui_move');
                return next;
              }
              if (prev === 2) {
                const next = banishesLeft > 0 ? 4 : (rerollsLeft > 0 ? 3 : prev);
                if (next !== prev) playSound('ui_move');
                return next;
              }
              return prev;
            });
            return;
          }
          if (e.key === 'Enter') {
            if (selectedRewardIndex >= 0 && selectedRewardIndex <= 2) {
              handleRewardInteraction(currentRewards[selectedRewardIndex], selectedRewardIndex);
            } else if (selectedRewardIndex === 3) {
              handleReroll();
            } else if (selectedRewardIndex === 4) {
              if (banishesLeft > 0) setIsBanishMode(p => !p);
            }
          }
          // リロール (X)
          if (e.key === 'x' || e.key === 'X') {
            handleReroll();
          }
          // バニッシュモード切替 (B)
          if (e.key === 'b' || e.key === 'B') {
            if (banishesLeft > 0) setIsBanishMode(p => !p);
          }
          return;
        }

        if (e.key === 'ArrowUp') {
          setSelectedPauseIndex(prev => {
            const next = Math.max(0, prev - 1);
            if (next !== prev) playSound('ui_move');
            return next;
          });
          return;
        }
        if (e.key === 'ArrowDown') {
          setSelectedPauseIndex(prev => {
            const next = Math.min(PAUSE_MENU_OPTIONS.length - 1, prev + 1);
            if (next !== prev) playSound('ui_move');
            return next;
          });
          return;
        }
        if (e.key === 'Enter') {
          if (selectedPauseIndex === 0) {
            handleTogglePause();
          } else if (selectedPauseIndex === 1) {
            setIsHelpOpen(true);
          } else if (selectedPauseIndex === 2) {
            setIsSettingsOpen(true);
          } else if (selectedPauseIndex === 3) {
            setIsGameOver(true); setIsPaused(false); setResultSelectedIndex(0);
          }
          playSound('ui_select');
          return;
        }
      }

      if (e.key === 'Tab') { e.preventDefault(); handleToggleInventory(); }
      if (e.key === 'Escape') {
        if (isInventoryOpen) {
          setIsInventoryOpen(false);
          playSound('inventory_close');
        }
        else if (!isGameOver) handleTogglePause();
      }
      if (isInventoryOpen) {
        if (e.key === 'q' || e.key === 'Q') {
          if (selectedIndex === -9 || selectedIndex === -10) setLeftLBTick(t => t + 1);
          else handlePrevTab();
          return;
        }
        if (e.key === 'e' || e.key === 'E') {
          if (selectedIndex === -9 || selectedIndex === -10) setLeftRBTick(t => t + 1);
          else handleNextTab();
          return;
        }
        if (e.key === 'z' || e.key === 'Z') { handlePrevSubTab(); return; }
        if (e.key === 'c' || e.key === 'C') { handleNextSubTab(); return; }
        if (e.key === 'r' || e.key === 'R') { handleSortByRarity(); return; }

        if (e.key === 'ArrowUp') {
          setSelectedIndex(p => p >= 0 ? Math.max(0, p - 6) : Math.min(-1, p + 1));
          return;
        }
        if (e.key === 'ArrowDown') {
          setSelectedIndex(p => p >= 0 ? p + 6 : Math.max(-10, p - 1));
          return;
        }
        if (e.key === 'ArrowLeft') {
          setSelectedIndex(p => {
            if (p >= 0) {
              if (p % 6 === 0) return Math.max(-10, -(Math.floor(p / 6) + 1));
              return Math.max(0, p - 1);
            }
            return p;
          });
          return;
        }
        if (e.key === 'ArrowRight') {
          setSelectedIndex(p => p < 0 ? (Math.abs(p) - 1) * 6 : p + 1);
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInventoryOpen, isPaused, isGameOver, showRewardScreen, selectedRewardIndex, currentRewards, handleRestart, handleToggleInventory, handleTogglePause, handleSortByRarity, handleSelectReward, acquiredRewards, isTitleScreen, isUpdateScreen, titleMenuIndex, handleStartGame, isHelpOpen, selectedPauseIndex, selectedIndex, handleToggleMasterMute]);

  const handleSwitchEnchant = useCallback((enchant: 'fire' | 'ice' | 'lightning' | 'none') => {
    if (isGameOver || isPaused || isInventoryOpen || showRewardScreen) return;
    if (enchant === activeEnchant) return; // 既に同じ属性なら無視

    if (enchant === 'none') {
      setActiveEnchant('none');
      setGlobalEnchantState('none', 1);
      return;
    }

    const rewardIdMap = { fire: 'enchantFire', ice: 'enchantIce', lightning: 'enchantLightning' };
    const rewardId = rewardIdMap[enchant];
    const reward = acquiredRewards.find(r => r.id === rewardId && r.count >= 1);
    if (!reward) return;

    // SP 100 以上か確認し、スタミナを消費してから発動
    const currentSp = getDashStamina();
    if (currentSp >= 100) {
      drainStamina(100);
      setActiveEnchant(enchant);
      setGlobalEnchantState(enchant, reward.count);
    }
  }, [activeEnchant, isGameOver, isPaused, isInventoryOpen, showRewardScreen, acquiredRewards]);

  useEffect(() => {
    const handleEnchantKey = (e: KeyboardEvent) => {
      if (!['1', '2', '3', '4'].includes(e.key)) return;
      const map: Record<string, 'fire' | 'ice' | 'lightning' | 'none'> = { '1': 'fire', '2': 'ice', '3': 'lightning', '4': 'none' };
      handleSwitchEnchant(map[e.key]);
    };
    window.addEventListener('keydown', handleEnchantKey);
    return () => window.removeEventListener('keydown', handleEnchantKey);
  }, [handleSwitchEnchant]);

  const renderCurrentStatusPanels = () => {
    const activeTypes = ['lightningDamage', 'fireDamage', 'iceDamage', 'enchantFire', 'enchantIce', 'enchantLightning'];
    const activeSkills = acquiredRewards.filter(r => activeTypes.includes(r.type));
    const passiveSkills = acquiredRewards.filter(r => !activeTypes.includes(r.type));
    const equippedItemsList = Object.values(equipmentRef.current).filter(Boolean) as GeneratedItem[];

    return (
      <div style={{ display: 'flex', gap: '16px', marginTop: '24px', width: '96%', maxWidth: '1000px', margin: '24px auto 0', alignItems: 'flex-start' }}>
        {/* 左側：現在の装備 */}
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.6)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(167,139,250,0.3)', minHeight: '150px' }}>
          <div style={{ borderBottom: '1px solid #444', paddingBottom: '4px', marginBottom: '8px', color: '#a78bfa', fontSize: '14px', fontWeight: 'bold', textAlign: 'center' }}>🎽 現在の装備</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {equippedItemsList.length > 0 ? equippedItemsList.map((item, i) => {
              const config = RARITY_CONFIG[item.rarity as Rarity] || RARITY_CONFIG.Common;
              const slotInfo = SLOT_LABELS[item.baseItem.slot] || { emoji: '❓', label: item.baseItem.slot };
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', borderLeft: `3px solid ${config.color}` }}>
                  <span style={{ fontSize: '16px' }}>{slotInfo.emoji}</span>
                  <span style={{ color: config.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, textAlign: 'left' }}>
                    [{config.nameJa}] {getItemDisplayName(item)}
                  </span>
                  <span style={{ color: '#aaa', marginLeft: '4px', flexShrink: 0 }}>Lv.{item.itemLevel}</span>
                </div>
              );
            }) : <span style={{ color: '#aaa', fontSize: '12px', textAlign: 'center', display: 'block' }}>装備なし</span>}
          </div>
        </div>

        {/* 右側：ビルド構成 */}
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.6)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(167,139,250,0.3)', minHeight: '150px' }}>
          <div style={{ borderBottom: '1px solid #444', paddingBottom: '4px', marginBottom: '8px', color: '#a78bfa', fontSize: '14px', fontWeight: 'bold', textAlign: 'center' }}>🌟 現在のビルド構成</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
            {acquiredRewards.length > 0 ? (
              <>
                {activeSkills.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {activeSkills.map(r => (
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
            ) : <span style={{ color: '#aaa', fontSize: '12px', textAlign: 'center', display: 'block' }}>取得済みリワードなし</span>}
          </div>
        </div>
      </div>
    );
  };

  // 'R'キーでメガクラッシュ発動
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (key === 'r') {
        handleMegaCrush();
      } else if (key === 'escape') {
        if (isHelpOpen) {
          setIsHelpOpen(false);
          playSound('ui_cancel');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleMegaCrush, isHelpOpen]);

  // --- マウスボタン操作 ---
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (isTitleScreen || isUpdateScreen || isSettingsOpen || isHelpOpen) return;
      if (isGameOver || isPaused || isInventoryOpen || showRewardScreen) return;

      if (e.button === 1) {
        // 中クリック → メガクラッシュ
        e.preventDefault(); // 中クリックのオートスクロールを抑制
        handleMegaCrush();
      } else if (e.button === 3) {
        // サイドボタン1 (戻る) → ヒール
        if (healUses > 0) {
          setHealUses(u => u - 1);
          playSound('heal');
          const healAmount = playerStatsRef.current.hpRegen * 100;
          healPlayer(healAmount);
          if (window.__playerPosRef) {
            spawnActionPopup(0, 2.5, 2.0, `+${healAmount.toFixed(1)}`, 'heal', true);
          }
        }
      } else if (e.button === 4) {
        // サイドボタン2 (進む) → マグネット
        handleMagnet();
      }
    };
    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [isTitleScreen, isUpdateScreen, isSettingsOpen, isHelpOpen, isGameOver, isPaused, isInventoryOpen, showRewardScreen, handleMegaCrush, healUses, handleMagnet]);

  return (
    <>
      {isTitleScreen && (
        <div className="title-overlay" style={{
          position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at center, #1a1a2e 0%, #06060f 100%)',
          color: '#fff', userSelect: 'none', overflow: 'hidden'
        }}>
          {/* 背景のワイヤーフレームキューブ (常に表示) */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: -1, opacity: 0.5,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div className="rotating-wireframe-cube" style={{ width: '300px', height: '300px' }}>
              <div className="cube-face" style={{ transform: 'translateZ(150px)', border: '2px solid ' + cubeColor, boxShadow: '0 0 15px ' + cubeColor + ', inset 0 0 15px ' + cubeColor, backgroundColor: cubeColor + '1A' }} />
              <div className="cube-face" style={{ transform: 'translateZ(-150px) rotateY(180deg)', border: '2px solid ' + cubeColor, boxShadow: '0 0 15px ' + cubeColor + ', inset 0 0 15px ' + cubeColor, backgroundColor: cubeColor + '1A' }} />
              <div className="cube-face" style={{ transform: 'translateY(150px) rotateX(90deg)', border: '2px solid ' + cubeColor, boxShadow: '0 0 15px ' + cubeColor + ', inset 0 0 15px ' + cubeColor, backgroundColor: cubeColor + '1A' }} />
              <div className="cube-face" style={{ transform: 'translateY(-150px) rotateX(-90deg)', border: '2px solid ' + cubeColor, boxShadow: '0 0 15px ' + cubeColor + ', inset 0 0 15px ' + cubeColor, backgroundColor: cubeColor + '1A' }} />
              <div className="cube-face" style={{ transform: 'translateX(150px) rotateY(90deg)', border: '2px solid ' + cubeColor, boxShadow: '0 0 15px ' + cubeColor + ', inset 0 0 15px ' + cubeColor, backgroundColor: cubeColor + '1A' }} />
              <div className="cube-face" style={{ transform: 'translateX(-150px) rotateY(-90deg)', border: '2px solid ' + cubeColor, boxShadow: '0 0 15px ' + cubeColor + ', inset 0 0 15px ' + cubeColor, backgroundColor: cubeColor + '1A' }} />
            </div>
          </div>

          {/* メタプログレッション画面 */}
          {isUpdateScreen && (
            <UpdateUI isGamepadActive={activeDevice !== 'keyboard'} onClose={() => setIsUpdateScreen(false)} />
          )}

          {isChangelogOpen && (
            <ChangelogUI isGamepad={activeDevice !== 'keyboard'} isOpen={isChangelogOpen} onClose={() => setIsChangelogOpen(false)} />
          )}

          <style>
            {`
              @keyframes menuFadeIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
              }
              .menu-anim {
                animation: menuFadeIn 0.3s ease-out forwards;
              }
            `}
          </style>

          {!isUpdateScreen && !isChangelogOpen && (
            <>
              {/* タイトル画面左下のUPDATEボタン */}
              <div style={{
                position: 'absolute', bottom: '32px', left: '10px', zIndex: 300,
                display: 'flex', alignItems: 'center',
                fontFamily: 'sans-serif', fontSize: '14px',
                animation: 'changelogFadeIn 0.3s ease-out'
              }}>
                <button
                  onClick={() => { playSound('ui_select'); setIsChangelogOpen(true); }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.borderColor = '#00e5ff';
                    e.currentTarget.style.color = '#00e5ff';
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(0, 229, 255, 0.5)';
                    e.currentTarget.style.transform = 'scale(1.05)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                    e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '6px',
                    padding: '6px 16px',
                    color: 'rgba(255, 255, 255, 0.6)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
                    fontWeight: 'bold',
                    letterSpacing: '2px',
                    transition: 'all 0.2s ease',
                    outline: 'none'
                  }}
                >
                  UPDATE
                </button>
              </div>
              {/* マスター音量トグルボタン (タイトル画面右上) */}
              <div
                onClick={handleToggleMasterMute}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.boxShadow = `0 0 20px ${masterVolume > 0 ? 'rgba(0, 229, 255, 0.4)' : 'rgba(255, 82, 82, 0.4)'}`;
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
                style={{
                  position: 'absolute', top: '20px', right: '20px', zIndex: 300,
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '10px 20px', borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  backdropFilter: 'blur(10px)',
                  border: `1px solid ${masterVolume > 0 ? 'rgba(0, 229, 255, 0.3)' : 'rgba(255, 82, 82, 0.3)'}`,
                  cursor: 'pointer', transition: 'all 0.3s ease',
                  boxShadow: 'none'
                }}
              >
                <div style={{ fontSize: '24px', filter: masterVolume > 0 ? 'none' : 'grayscale(1) opacity(0.5)' }}>
                  {masterVolume > 0 ? '🔊' : '🔇'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '10px', color: '#aaa', fontWeight: 'bold', letterSpacing: '1px' }}>MASTER VOLUME</span>
                  <span style={{
                    fontSize: '14px', fontWeight: 'bold',
                    color: masterVolume > 0 ? '#00e5ff' : '#ff5252',
                    textShadow: masterVolume > 0 ? '0 0 8px rgba(0, 229, 255, 0.5)' : 'none'
                  }}>
                    {masterVolume > 0 ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>

              {/* ロゴ */}
              <img src="logo.png" alt="MEGA CUBE RUSH" className="neon-flicker" style={{
                width: '80%', maxWidth: '500px', height: 'auto', marginBottom: '8px',
                filter: 'drop-shadow(0 0 15px rgba(167,139,250,0.8))'
              }} />

              {/* サブタイトル */}
              <div style={{ fontSize: '24px', letterSpacing: '4px', color: '#fff', textShadow: '0 0 8px rgba(255,255,255,0.5)', marginBottom: '32px' }}>
                メガキューブ・ラッシュ
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '64px', width: '300px', minHeight: '280px', alignItems: 'center' }}>
                {!isModeSelectOpen ? (
                  <div key="main-menu" className="menu-anim" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                    <button onClick={() => { playSound('ui_select'); setIsModeSelectOpen(true); setTitleMenuIndex(1); }} style={{
                      padding: '16px', fontSize: '24px', fontWeight: 'bold', background: titleMenuIndex === 0 ? 'rgba(0,229,255,0.2)' : 'transparent',
                      color: titleMenuIndex === 0 ? '#00e5ff' : '#666', border: `2px solid ${titleMenuIndex === 0 ? '#00e5ff' : '#444'}`, borderRadius: '8px', cursor: 'pointer',
                      boxShadow: titleMenuIndex === 0 ? '0 0 15px rgba(0,229,255,0.3), inset 0 0 10px rgba(0,229,255,0.2)' : 'none', transition: 'all 0.2s',
                      animation: titleMenuIndex === 0 ? 'pulse 2s infinite' : 'none'
                    }} onMouseEnter={() => setTitleMenuIndex(0)}>
                      ARCADE MODE
                    </button>
                    <button onClick={() => { playSound('ui_select'); setIsUpdateScreen(true); }} style={{
                      padding: '16px', fontSize: '24px', fontWeight: 'bold', background: titleMenuIndex === 1 ? 'rgba(167,139,250,0.2)' : 'transparent',
                      color: titleMenuIndex === 1 ? '#a78bfa' : '#666', border: `2px solid ${titleMenuIndex === 1 ? '#a78bfa' : '#444'}`, borderRadius: '8px', cursor: 'pointer',
                      boxShadow: titleMenuIndex === 1 ? '0 0 15px rgba(167,139,250,0.3), inset 0 0 10px rgba(167,139,250,0.2)' : 'none', transition: 'all 0.2s'
                    }} onMouseEnter={() => setTitleMenuIndex(1)}>
                      META PROGRESSION
                    </button>
                    <button onClick={() => { playSound('ui_select'); setIsHelpOpen(true); }} style={{
                      padding: '16px', fontSize: '24px', fontWeight: 'bold', background: titleMenuIndex === 2 ? 'rgba(0,229,255,0.1)' : 'transparent',
                      color: titleMenuIndex === 2 ? '#00e5ff' : '#666', border: `2px solid ${titleMenuIndex === 2 ? '#00e5ff' : '#444'}`, borderRadius: '8px', cursor: 'pointer',
                      boxShadow: titleMenuIndex === 2 ? '0 0 15px rgba(0,229,255,0.2), inset 0 0 10px rgba(0,229,255,0.1)' : 'none', transition: 'all 0.2s'
                    }} onMouseEnter={() => setTitleMenuIndex(2)}>
                      HELP
                    </button>
                    <button onClick={() => { playSound('ui_select'); setIsSettingsOpen(true); }} style={{
                      padding: '16px', fontSize: '24px', fontWeight: 'bold', background: titleMenuIndex === 3 ? 'rgba(255,255,255,0.1)' : 'transparent',
                      color: titleMenuIndex === 3 ? '#fff' : '#666', border: `2px solid ${titleMenuIndex === 3 ? '#fff' : '#444'}`, borderRadius: '8px', cursor: 'pointer',
                      boxShadow: titleMenuIndex === 3 ? '0 0 15px rgba(255,255,255,0.2), inset 0 0 10px rgba(255,255,255,0.1)' : 'none', transition: 'all 0.2s'
                    }} onMouseEnter={() => setTitleMenuIndex(3)}>
                      SETTINGS
                    </button>
                  </div>
                ) : (
                  <div key="mode-menu" className="menu-anim" style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', alignItems: 'center' }}>
                    <div style={{
                      fontSize: '18px', fontWeight: 'bold', color: '#00e5ff', letterSpacing: '4px',
                      marginBottom: '8px', textShadow: '0 0 10px rgba(0,229,255,0.5)',
                      animation: 'pulse 1.5s infinite'
                    }}>
                      — SELECT MODE —
                    </div>
                    <button onClick={() => { playSound('ui_select'); handleStartGame('practice'); }} style={{
                      padding: '16px', fontSize: '24px', fontWeight: 'bold', background: titleMenuIndex === 0 ? 'rgba(57,255,20,0.2)' : 'transparent',
                      color: titleMenuIndex === 0 ? '#39ff14' : '#666', border: `2px solid ${titleMenuIndex === 0 ? '#39ff14' : '#444'}`, borderRadius: '8px', cursor: 'pointer',
                      boxShadow: titleMenuIndex === 0 ? '0 0 15px rgba(57,255,20,0.3), inset 0 0 10px rgba(57,255,20,0.2)' : 'none', transition: 'all 0.2s',
                      animation: titleMenuIndex === 0 ? 'pulse 2s infinite' : 'none', width: '100%'
                    }} onMouseEnter={() => setTitleMenuIndex(0)}>
                      PRACTICE MODE
                    </button>
                    <button onClick={() => { playSound('ui_select'); handleStartGame('normal'); }} style={{
                      padding: '16px', fontSize: '24px', fontWeight: 'bold', background: titleMenuIndex === 1 ? 'rgba(0,229,255,0.2)' : 'transparent',
                      color: titleMenuIndex === 1 ? '#00e5ff' : '#666', border: `2px solid ${titleMenuIndex === 1 ? '#00e5ff' : '#444'}`, borderRadius: '8px', cursor: 'pointer',
                      boxShadow: titleMenuIndex === 1 ? '0 0 15px rgba(0,229,255,0.3), inset 0 0 10px rgba(0,229,255,0.2)' : 'none', transition: 'all 0.2s',
                      animation: titleMenuIndex === 1 ? 'pulse 2s infinite' : 'none', width: '100%'
                    }} onMouseEnter={() => setTitleMenuIndex(1)}>
                      NORMAL MODE
                    </button>
                    <button onClick={() => { playSound('ui_cancel'); setIsModeSelectOpen(false); setTitleMenuIndex(0); }} style={{
                      padding: '16px', fontSize: '24px', fontWeight: 'bold', background: titleMenuIndex === 2 ? 'rgba(255,82,82,0.2)' : 'transparent',
                      color: titleMenuIndex === 2 ? '#ff5252' : '#666', border: `2px solid ${titleMenuIndex === 2 ? '#ff5252' : '#444'}`, borderRadius: '8px', cursor: 'pointer',
                      boxShadow: titleMenuIndex === 2 ? '0 0 15px rgba(255,82,82,0.3), inset 0 0 10px rgba(255,82,82,0.2)' : 'none', transition: 'all 0.2s', width: '100%'
                    }} onMouseEnter={() => setTitleMenuIndex(2)}>
                      BACK
                    </button>
                  </div>
                )}
              </div>

              {/* メニュー説明文 (キーガイドの少し上) */}
              <div style={{
                marginTop: '24px',
                minHeight: '24px',
                color: '#aaa',
                fontSize: '14px',
                fontFamily: 'sans-serif',
                textAlign: 'center',
                textShadow: '0 0 6px rgba(255,255,255,0.2)',
                letterSpacing: '1px',
                width: '90%',
                maxWidth: '720px',
                lineHeight: '1.5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {(() => {
                  if (!isModeSelectOpen) {
                    if (titleMenuIndex === 0) return 'レベル1・所持アイテム無しでスタート。難易度選択へ移動します。';
                    if (titleMenuIndex === 1) return '獲得したキューブを消費してプレイヤーを恒久的に強化出来ます。';
                    if (titleMenuIndex === 2) return '操作方法や各種システム、武器の特徴などを確認出来ます。';
                    if (titleMenuIndex === 3) return '音量やインベントリ、プレイヤースキンなどの設定を変更出来ます。';
                  } else {
                    if (titleMenuIndex === 0) return '練習用の10分モード。インベントリ画面では時間が停止しますが、エナジーキューブ獲得量が半減します。';
                    if (titleMenuIndex === 1) return '標準難易度の15分モード。インベントリ画面でも時間が経過しますが、ハイパーキューブが獲得出来ます。';
                    if (titleMenuIndex === 2) return 'メインメニューへ戻ります。';
                  }
                  return '';
                })()}
              </div>

              <div style={{ marginTop: '24px', color: '#888', fontSize: '14px', fontFamily: 'GenEiLateMin, serif', display: 'flex', justifyContent: 'center' }}>
                {activeDevice === 'keyboard' ? (
                  <div className="gp-btn-container" style={{ justifyContent: 'center', fontFamily: 'GenEiLateMin, serif' }}>
                    <div style={{ display: 'flex', gap: '0' }}>
                      <kbd className="gp-kbd">↑</kbd><kbd className="gp-kbd">↓</kbd>
                    </div>
                    <span className="gp-label">選択</span>
                    <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                    <kbd className="gp-kbd">Enter</kbd>
                    <span className="gp-label">決定</span>
                    <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                    <kbd className="gp-kbd">M</kbd>
                    <span className="gp-label">音量切替</span>
                    {!isModeSelectOpen ? (
                      <>
                        <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                        <kbd className="gp-kbd">U</kbd>
                        <span className="gp-label">更新履歴</span>
                      </>
                    ) : (
                      <>
                        <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                        <kbd className="gp-kbd">Esc</kbd>
                        <span className="gp-label">戻る</span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="gp-btn-container" style={{ justifyContent: 'center' }}>
                    <span style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: '4px' }}>✜</span>
                    <span className="gp-label">選択</span>
                    <span style={{ margin: '0 8px', color: '#555' }}>|</span>
                    <span className="gp-btn gp-btn-a">A</span>
                    <span className="gp-label">決定</span>
                    <span style={{ margin: '0 8px', color: '#555' }}>|</span>
                    <span className="gp-btn gp-btn-side">RT</span>
                    <span className="gp-label">音量切替</span>
                    {!isModeSelectOpen ? (
                      <>
                        <span style={{ margin: '0 8px', color: '#555' }}>|</span>
                        <span className="gp-btn gp-btn-side" style={{ minWidth: '40px' }}>SELECT</span>
                        <span className="gp-btn gp-btn-side">LT</span>
                        <span className="gp-label">更新履歴</span>
                      </>
                    ) : (
                      <>
                        <span style={{ margin: '0 8px', color: '#555' }}>|</span>
                        <span className="gp-btn gp-btn-b">B</span>
                        <span className="gp-label">戻る</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {!isTitleScreen && (
        <>
          <Canvas key={gameKey} shadows camera={{ position: [0, 20, 12], fov: 50 }} style={{ width: '100%', height: '100%' }}>
            <color attach="background" args={['#06060f']} />
            <Suspense fallback={null}>
              <GameScene
                isSettingsOpen={isSettingsOpen}
                onToggleInventory={handleToggleInventory}
                onCloseInventory={() => setIsInventoryOpen(false)}
                isSpawning={isSpawning}
                spawnStartTime={spawnStartTime}
                onDpadUp={() => {
                  if (isGameOver) {
                    setResultSelectedIndex(p => Math.max(0, p - 1));
                    playSound('ui_move');
                  } else if (showRewardScreen) {
                    setSelectedRewardIndex(prev => {
                      if (prev === 3) { playSound('ui_move'); return 1; }
                      if (prev === 4) { playSound('ui_move'); return 2; }
                      if (prev !== 1) playSound('ui_move');
                      return 1;
                    });
                  } else if (isInventoryOpen) {
                    setSelectedIndex(p => p >= 0 ? Math.max(0, p - 6) : Math.min(-1, p + 1));
                    playSound('ui_move');
                  } else if (isPaused) {
                    setSelectedPauseIndex(p => Math.max(0, p - 1));
                    playSound('ui_move');
                  }
                }}
                onDpadDown={() => {
                  if (isGameOver) {
                    const maxLen = Object.values(equipmentRef.current).filter(Boolean).length;
                    setResultSelectedIndex(p => p < maxLen + 1 ? p + 1 : p);
                    playSound('ui_move');
                  } else if (showRewardScreen) {
                    setSelectedRewardIndex(prev => {
                      if (prev < 0) {
                        const next = rerollsLeft > 0 ? 3 : (banishesLeft > 0 ? 4 : 1);
                        if (next !== prev) playSound('ui_move');
                        return next;
                      }
                      if (prev === 0 || prev === 1) {
                        const next = rerollsLeft > 0 ? 3 : (banishesLeft > 0 ? 4 : prev);
                        if (next !== prev) playSound('ui_move');
                        return next;
                      }
                      if (prev === 2) {
                        const next = banishesLeft > 0 ? 4 : (rerollsLeft > 0 ? 3 : prev);
                        if (next !== prev) playSound('ui_move');
                        return next;
                      }
                      return prev;
                    });
                  } else if (isInventoryOpen) {
                    setSelectedIndex(p => p >= 0 ? p + 6 : Math.max(-10, p - 1));
                    playSound('ui_move');
                  } else if (isPaused) {
                    setSelectedPauseIndex(p => Math.min(PAUSE_MENU_OPTIONS.length - 1, p + 1));
                    playSound('ui_move');
                  }
                }}
                onDpadLeft={() => {
                  if (showRewardScreen) {
                    setSelectedRewardIndex(prev => {
                      if (prev < 0) { playSound('ui_move'); return 0; }
                      if (prev === 4) { playSound('ui_move'); return 3; }
                      if (prev > 0 && prev <= 2) { playSound('ui_move'); return prev - 1; }
                      return prev;
                    });
                  } else if (isInventoryOpen) {
                    setSelectedIndex(p => {
                      if (p >= 0) {
                        if (p % 6 === 0) return Math.max(-10, -(Math.floor(p / 6) + 1));
                        return Math.max(0, p - 1);
                      }
                      return p;
                    });
                    playSound('ui_move');
                  } else if (isPaused) {
                    // ポーズメニューでの左右移動は現状なし
                  }
                }}
                onDpadRight={() => {
                  if (showRewardScreen) {
                    setSelectedRewardIndex(prev => {
                      if (prev < 0) { playSound('ui_move'); return 2; }
                      if (prev === 3) { playSound('ui_move'); return 4; }
                      if (prev >= 0 && prev < 2) { playSound('ui_move'); return prev + 1; }
                      return prev;
                    });
                  } else if (isInventoryOpen) {
                    setSelectedIndex(p => {
                      return p < 0 ? (Math.abs(p) - 1) * 6 : p + 1;
                    });
                    playSound('ui_move');
                  } else if (isPaused) {
                    // ポーズメニューでの左右移動は現状なし
                  }
                }}
                onAButton={() => {
                  if (isGameOver) return;
                  if (showRewardScreen) {
                    if (selectedRewardIndex !== -1) handleRewardInteraction(currentRewards[selectedRewardIndex], selectedRewardIndex);
                  } else if (isInventoryOpen) {
                    if (selectedIndex === -9 || selectedIndex === -10) {
                      setLeftActionTick(t => t + 1);
                    } else if (selectedIndex < 0 && selectedIndex >= -8) {
                      const leftSlots = [EquipSlot.MeleeWeapon, EquipSlot.RangedWeapon, EquipSlot.Shield, EquipSlot.Helmet, EquipSlot.Armor, EquipSlot.Boots, EquipSlot.Ring, EquipSlot.Amulet];
                      handleUnequip(leftSlots[Math.abs(selectedIndex) - 1]);
                    } else {
                      const filteredItems = inventory.filter((item) => {
                        const slot = item.baseItem.slot;
                        const isMelee = slot === EquipSlot.MeleeWeapon;
                        const isRanged = slot === EquipSlot.RangedWeapon;
                        const isArmor = !isMelee && !isRanged;
                        const isMagic = item.baseItem.baseStats.some(s => s.stat === StatType.MagicPower);
                        let matchPrimary = false;
                        if (activeTab === 'all') matchPrimary = true;
                        else if (activeTab === 'melee') matchPrimary = isMelee && !isMagic;
                        else if (activeTab === 'ranged') matchPrimary = isRanged && !isMagic;
                        else if (activeTab === 'magic') matchPrimary = (isMelee || isRanged) && isMagic;
                        else if (activeTab === 'armor') matchPrimary = isArmor;
                        if (!matchPrimary) return false;
                        if (secondaryTab === 'all') return true;
                        if (activeTab === 'armor') {
                          if (secondaryTab === 'shield') return item.baseItem.slot === EquipSlot.Shield;
                          if (secondaryTab === 'helm') return item.baseItem.slot === EquipSlot.Helmet;
                          if (secondaryTab === 'armor') return item.baseItem.slot === EquipSlot.Armor;
                          if (secondaryTab === 'boots') return item.baseItem.slot === EquipSlot.Boots;
                          if (secondaryTab === 'ring') return item.baseItem.slot === EquipSlot.Ring;
                          if (secondaryTab === 'amulet') return item.baseItem.slot === EquipSlot.Amulet;
                        } else return item.baseItem.id.includes(secondaryTab);
                        return true;
                      });
                      const targetItem = filteredItems[selectedIndex];
                      if (targetItem) handleEquip(targetItem);
                    }
                  } else if (isPaused) {
                    if (selectedPauseIndex === 0) {
                      handleTogglePause();
                    } else if (selectedPauseIndex === 1) {
                      setIsHelpOpen(true);
                    } else if (selectedPauseIndex === 2) {
                      setIsSettingsOpen(true);
                    } else if (selectedPauseIndex === 3) {
                      setIsGameOver(true); setIsPaused(false); setResultSelectedIndex(0);
                    }
                  }
                }}
                onXButton={() => {
                  if (showRewardScreen) {
                    handleReroll();
                  } else {
                    handleSortByRarity();
                  }
                }}
                onBButton={() => {
                  if (showRewardScreen) {
                    if (banishesLeft > 0) {
                      // 入力暴発防止 (300ms)
                      const now = Date.now();
                      if (now - lastRewardActionTimeRef.current < 300) return;
                      lastRewardActionTimeRef.current = now;

                      setIsBanishMode(p => {
                        playSound(p ? 'ui_cancel' : 'ui_select');
                        return !p;
                      });
                    }
                  } else if (isInventoryOpen) {
                    playSound('ui_cancel');
                    setIsInventoryOpen(false);
                    if (gameModeRef.current === 'practice') setIsPaused(false);
                  } else if (!isGameOver && !isPaused) {
                    handleMagnet();
                  } else if (isHelpOpen) {
                    playSound('ui_cancel');
                    setIsHelpOpen(false);
                  } else if (isPaused && !showRewardScreen) {
                    handleTogglePause();
                  }
                }}
                onMegaCrush={handleMegaCrush}
                isGameOver={isGameOver}
                onPlayerDeath={() => {
                  if (resilienceUses > 0) {
                    const baseStats = computeStats(EMPTY_EQUIPMENT, permanentUpgradesRef.current);
                    if (baseStats.health > 50) {
                      setResilienceUses(u => u - 1);
                      setPermanentUpgrades(prev => {
                        const next = { ...prev, maxHp: prev.maxHp - 50 };
                        permanentUpgradesRef.current = next;
                        const newStats = computeStats(equipmentRef.current, next);
                        playerStatsRef.current = newStats;
                        setComputedStatsUI(newStats);
                        setMaxHp(newStats.health);
                        resetPlayerHp(newStats.health, 1.0);
                        return next;
                      });
                      if (window.__playerPosRef) {
                        const pos = window.__playerPosRef.current;
                        spawnActionPopup(0, 2.5, 2.0, 'Revive!', 'revive', true);
                      }
                      return;
                    }
                  }
                  if (!isGameOver) {
                    setIsGameOver(true);
                    setResultSelectedIndex(0);
                  }
                }}
                isPaused={isPaused || isSpawning}
                isInventoryOpen={isInventoryOpen}
                onTogglePause={handleTogglePause}
                onRestart={handleReturnToTitle}
                onGamepadConnect={() => { }}
                onGamepadActive={setIsGamepadActive}
                isHelpOpen={isHelpOpen}
                onPrevTab={() => {
                  if (selectedIndex === -9 || selectedIndex === -10) setLeftLBTick(t => t + 1);
                  else handlePrevTab();
                }}
                onNextTab={() => {
                  if (selectedIndex === -9 || selectedIndex === -10) setLeftRBTick(t => t + 1);
                  else handleNextTab();
                }}
                onPrevSubTab={handlePrevSubTab}
                onNextSubTab={handleNextSubTab}
                onSwitchEnchant={handleSwitchEnchant}
                activeEnchant={activeEnchant}
                onResultLB={() => {
                  const maxLen = Object.values(equipmentRef.current).filter(Boolean).length;
                  if (resultSelectedIndex === maxLen) setResultStatTab(t => t === 'total' ? 'base' : 'total');
                  if (resultSelectedIndex === maxLen + 1) setResultAffixTab(t => t === 'percent' ? 'value' : 'percent');
                }}
                onResultRB={() => {
                  const maxLen = Object.values(equipmentRef.current).filter(Boolean).length;
                  if (resultSelectedIndex === maxLen) setResultStatTab(t => t === 'total' ? 'base' : 'total');
                  if (resultSelectedIndex === maxLen + 1) setResultAffixTab(t => t === 'percent' ? 'value' : 'percent');
                }}
                onHeal={() => {
                  if (healUses > 0) {
                    setHealUses(u => u - 1);
                    playSound('heal');
                    const healAmount = playerStatsRef.current.hpRegen * 100;
                    healPlayer(healAmount);
                    if (window.__playerPosRef) {
                      const pos = window.__playerPosRef.current;
                      spawnActionPopup(0, 2.5, 2.0, `+${healAmount.toFixed(1)}`, 'heal', true);
                    }
                  }
                }}
                isSingleStick={isSingleStick}
                onToggleSingleStick={() => {
                  if (!isPaused && !isGameOver && singleStickModeSetting === 'manual') {
                    setIsSingleStick(p => !p);
                    playSound('ui_select');
                  }
                }}
                playerSkinSetting={playerSkinSetting}
              />
            </Suspense>
          </Canvas>

          {/* Grouped HUD will be placed below */}

          {/* シンクロモード（isSingleStick）ON表示 */}
          {isSingleStick && !isTitleScreen && !isGameOver && (
            <div style={{
              position: 'fixed', top: '30px', left: '300px', zIndex: (showRewardScreen || isPaused) ? 70 : 40,
              background: 'rgba(0,0,0,0.6)', padding: '6px 12px', borderRadius: '8px',
              border: '1px solid rgba(0, 229, 255, 0.4)', color: '#00e5ff',
              fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px',
              boxShadow: '0 0 10px rgba(0, 229, 255, 0.3)', pointerEvents: 'none'
            }}>
              <span style={{ fontSize: '18px' }}>🕹️</span>
              <span>シンクロモードON</span>
            </div>
          )}

          {/* 取得済みリワード一覧UI */}
          <div style={{ position: 'fixed', top: '140px', left: '20px', zIndex: (showRewardScreen || isPaused) ? 70 : 40, display: 'flex', flexDirection: 'column', gap: '12px', pointerEvents: 'none' }}>

            {/* アクティブ枠（魔法） */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxWidth: '300px' }}>
              {acquiredRewards.filter(r => ['lightningDamage', 'fireDamage', 'iceDamage', 'enchantFire', 'enchantIce', 'enchantLightning'].includes(r.type)).map(r => {
                const isMax = r.maxLevel !== undefined && r.count >= r.maxLevel;
                return (
                  <div key={r.id} style={{
                    width: '36px', height: '36px', border: '2px solid', borderColor: isMax ? '#ffd700' : 'rgba(255,255,255,0.5)', borderRadius: '6px',
                    background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '20px', position: 'relative', boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                  }}>
                    {getRewardIcon(r.id)}
                    <div style={{
                      position: 'absolute', bottom: '-4px', right: '-4px', fontSize: '13px', fontWeight: '900',
                      color: isMax ? '#ffd700' : '#fff', textShadow: '1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000'
                    }}>
                      Lv.{r.count}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* パッシブ枠（ステータス） */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', maxWidth: '300px' }}>
              {acquiredRewards.filter(r => !['lightningDamage', 'fireDamage', 'iceDamage', 'enchantFire', 'enchantIce', 'enchantLightning'].includes(r.type)).map(r => {
                const isMax = r.maxLevel !== undefined && r.count >= r.maxLevel;
                return (
                  <div key={r.id} style={{
                    width: '30px', height: '30px', border: '1px solid', borderColor: isMax ? '#ffd700' : 'rgba(255,255,255,0.2)', borderRadius: '6px',
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '16px', position: 'relative', boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                  }}>
                    {getRewardIcon(r.id)}
                    <div style={{
                      position: 'absolute', bottom: '-4px', right: '-4px', fontSize: '12px', fontWeight: '900',
                      color: isMax ? '#ffd700' : '#ddd', textShadow: '1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000'
                    }}>
                      Lv.{r.count}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
          {/* プレイ時間タイマー */}
          <div
            ref={timerTextRef}
            style={{ position: 'fixed', top: '40px', left: '50%', transform: 'translateX(-50%)', color: '#fff', fontSize: '32px', fontWeight: 'bold', zIndex: (showRewardScreen || isPaused) ? 70 : 40, textShadow: '0 0 4px #000', pointerEvents: 'none', fontFamily: '"Share Tech Mono", monospace', letterSpacing: '1px' }}
          >
            00:00<span style={{ fontSize: '0.6em' }}>.00</span>
          </div>

          {/* 【追加】予告・警告メッセージUI (初期状態は透明度0で非表示) */}
          <div ref={warningContainerRef} style={{
            position: 'fixed', top: '78px', left: '50%', transform: 'translateX(-50%)',
            padding: '4px 16px', background: 'rgba(0, 0, 0, 0.6)',
            border: '1px solid #ff5252', borderRadius: '4px', opacity: 0,
            transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', gap: '12px',
            boxShadow: '0 0 10px rgba(255, 82, 82, 0.5)',
            zIndex: (showRewardScreen || isPaused) ? 70 : 40, pointerEvents: 'none'
          }}>
            <div ref={warningTextRef} style={{
              fontSize: '16px', fontWeight: 'bold', fontFamily: '"Share Tech Mono", monospace',
              color: '#ff5252', letterSpacing: '1px'
            }}>
              ⚠️ WARNING: WAVE APPROACHING... [ 10.00 ]
            </div>
          </div>

          <ExpBar onLevelUpSync={() => syncStats({ ...equipmentRef.current })} isRewardOpen={isInventoryOpen ? false : (showRewardScreen || isPaused)} />
          <HpBar isRewardOpen={isInventoryOpen ? false : (showRewardScreen || isPaused)} />
          <StatusHUD
            stats={computedStatsUI}
            isRewardOpen={showRewardScreen}
            isPaused={isPaused}
            isInventoryOpen={isInventoryOpen}
            acquiredRewards={acquiredRewards}
            activeEnchant={activeEnchant}
            healUses={healUses}
            magnetUses={magnetUses}
            resilienceUses={resilienceUses}
          />

          <ItemPickupLog autoEquipLogsRef={autoEquipLogsRef} />
          <BossUI isPaused={isPaused || isGameOver} />

          {!isTitleScreen && !isGameOver && (
            <div style={{ position: 'fixed', top: '30px', right: '20px', zIndex: isInventoryOpen ? 40 : ((showRewardScreen || isPaused) ? 100 : 40), color: '#fff', fontSize: '18px', textShadow: '0 0 8px rgba(0,0,0,0.8)', pointerEvents: 'none', textAlign: 'right' }}>
              {/* WAVE表示 (fontSize指定を削除し、親の18pxを継承させる) */}
              <div ref={waveTextRef} style={{ color: '#a78bfa', marginBottom: '4px' }}>
                <span className="impact-font">🚩 WAVE:</span> 1
              </div>

              <div style={{ marginBottom: '4px', color: '#00e5ff', fontWeight: 'bold' }}>
                <span className="impact-font">🟦 E.CUBE: </span>
                <span style={{ fontWeight: 'normal' }}>{energyCubes}</span>
              </div>
              <div>
                <span className="impact-font">⚔️ KILLS: </span>
                <span style={{ fontWeight: 'normal' }}>{killCount} / {nextRewardKill}</span>
              </div>
              <ComboUI style={{ marginTop: '16px' }} />
            </div>
          )}

          {/* キルスクリーン用 画面崩壊（減光処理・ダークグリッチ） */}
          {isKillScreen && !isGameOver && (
            <>
              <style>
                {`
                  @keyframes glitch-scan {
                    0% { background-position: 0 0; }
                    100% { background-position: 0 100vh; }
                  }
                  @keyframes glitch-flash-1 {
                    0% { top: 10%; height: 8%; opacity: 0.7; }
                    2% { opacity: 0; }
                    15% { top: 60%; height: 3%; opacity: 0; }
                    16% { opacity: 0.7; }
                    18% { opacity: 0; }
                    45% { top: 30%; height: 15%; opacity: 0; }
                    46% { opacity: 0.7; }
                    48% { opacity: 0; }
                    85% { top: 80%; height: 5%; opacity: 0; }
                    86% { opacity: 0.7; }
                    88% { opacity: 0; }
                    100% { opacity: 0; }
                  }
                  @keyframes glitch-flash-2 {
                    0% { opacity: 0; }
                    25% { top: 20%; height: 12%; opacity: 0; }
                    26% { opacity: 0.7; }
                    28% { opacity: 0; }
                    60% { top: 75%; height: 4%; opacity: 0; }
                    61% { opacity: 0.7; }
                    63% { opacity: 0; }
                    90% { top: 5%; height: 8%; opacity: 0; }
                    91% { opacity: 0.7; }
                    93% { opacity: 0; }
                    100% { opacity: 0; }
                  }
                `}
              </style>

              {/* 濃度をさらに抑えた横線ノイズ */}
              <div style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                pointerEvents: 'none', zIndex: 35,
                background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.15) 3px, rgba(0, 0, 0, 0.15) 4px)',
                animation: 'glitch-scan 8s linear infinite',
              }} />

              {/* ダークな色ズレ帯 1（不規則フラッシュ） */}
              <div style={{
                position: 'absolute', left: 0, width: '100%', opacity: 0,
                pointerEvents: 'none', zIndex: 36,
                backdropFilter: 'hue-rotate(270deg) brightness(0.6) contrast(150%)',
                animation: 'glitch-flash-1 6.5s infinite linear'
              }} />

              {/* ダークな色ズレ帯 2（不規則フラッシュ） */}
              <div style={{
                position: 'absolute', left: 0, width: '100%', opacity: 0,
                pointerEvents: 'none', zIndex: 36,
                backdropFilter: 'hue-rotate(90deg) brightness(0.4) saturate(2)',
                animation: 'glitch-flash-2 8.2s infinite linear'
              }} />
            </>
          )}

          {/* エンチャント状態表示HUD (StatusHUD内に統合したため削除) */}
          {isInventoryOpen && (
            <InventoryUI
              items={inventory}
              equipment={equipment}
              computedStats={computedStatsUI}
              permanentUpgrades={permanentUpgradesRef.current}
              showInventoryMainAll={showInventoryMainAll}
              showInventorySubAll={showInventorySubAll}
              inventoryDisplayLimit={inventoryDisplayLimit}
              onClose={handleToggleInventory}
              onEquip={handleEquip}
              onUnequip={handleUnequip}
              isGamepadActive={isGamepadActive}
              selectedIndex={selectedIndex}
              onSelectIndex={setSelectedIndex}
              primaryTab={activeTab}
              secondaryTab={secondaryTab}
              onPrimaryTabChange={(tab) => { setActiveTab(tab); playSound('ui_tab_large'); }}
              onSecondaryTabChange={(tab) => { setSecondaryTabs(prev => ({ ...prev, [activeTab]: tab })); playSound('ui_tab_small'); }}
              leftActionTick={leftActionTick}
              leftLBTick={leftLBTick}
              leftRBTick={leftRBTick}
              totalItemsPickedUp={totalItemsPickedUp}
            />
          )}

          {/* HP低下時の画面ビネット演出 */}
          {!isGameOver && <DamageVignette />}

          {/* メガクラッシュ・フラッシュオーバーレイ */}
          {flashOpacity > 0 && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              backgroundColor: `rgba(255, 255, 255, ${flashOpacity})`,
              zIndex: 100,
              pointerEvents: 'none'
            }} />
          )}

          {isPaused && !isGameOver && !showRewardScreen && !isInventoryOpen && (
            <div className="paused-overlay" style={{ zIndex: 60 }}>
              <div className="paused-content">
                <div className="paused-title zen-dots">Paused</div>

                <div className="pause-menu">
                  {PAUSE_MENU_OPTIONS.map((opt, i) => (
                    <div
                      key={opt}
                      className={`pause-menu-item ${selectedPauseIndex === i ? 'selected' : ''}`}
                      onMouseEnter={() => setSelectedPauseIndex(i)}
                      onClick={() => {
                        if (i === 0) handleTogglePause();
                        else if (i === 1) setIsHelpOpen(true);
                        else if (i === 2) setIsSettingsOpen(true);
                        else {
                          setIsGameOver(true);
                          setIsPaused(false);
                          setResultSelectedIndex(0);
                        }
                      }}
                    >
                      {opt}
                    </div>
                  ))}
                </div>

                <div className="paused-sub" style={{ fontFamily: 'GenEiLateMin, serif', display: 'flex', justifyContent: 'center' }}>
                  {isGamepadActive ? (
                    <div className="gp-btn-container" style={{ justifyContent: 'center', fontFamily: 'GenEiLateMin, serif' }}>
                      <span style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: '4px' }}>✜</span>
                      <span className="gp-label">選択</span>
                      <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                      <span className="gp-btn gp-btn-a">A</span>
                      <span className="gp-label">決定</span>
                      <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                      <span className="gp-btn gp-btn-b">B</span>
                      <span className="gp-label">再開</span>
                    </div>
                  ) : (
                    <div className="gp-btn-container" style={{ justifyContent: 'center', fontFamily: 'GenEiLateMin, serif' }}>
                      <div style={{ display: 'flex', gap: '0' }}>
                        <kbd className="gp-kbd">↑</kbd><kbd className="gp-kbd">↓</kbd>
                      </div>
                      <span className="gp-label">選択</span>
                      <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                      <kbd className="gp-kbd">Enter</kbd>
                      <span className="gp-label">決定</span>
                      <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                      <kbd className="gp-kbd">Esc</kbd>
                      <span className="gp-label">再開</span>
                    </div>
                  )}
                </div>

                {/* 修正後 (ポーズ画面) */}
                {renderCurrentStatusPanels()}
              </div>
            </div>
          )}

          {showRewardScreen && (
            <div className="reward-overlay" style={{ zIndex: 90 }}>
              <div className="reward-content">
                <div className="reward-title zen-dots">Reward</div>
                <div className="reward-sub">アップグレードを1つ選択してください</div>

                <div className="reward-cards">
                  {currentRewards.map((reward, i) => (
                    <div
                      key={reward.id + '-' + i}
                      className={`reward-card ${selectedRewardIndex === i ? 'selected' : ''}`}
                      style={{ position: 'relative', border: isBanishMode ? '2px solid #ff5252' : undefined, boxShadow: (isBanishMode && selectedRewardIndex === i) ? '0 0 20px rgba(255,82,82,0.6)' : undefined }}
                      onMouseEnter={() => { setSelectedRewardIndex(i); }}
                      onClick={() => handleRewardInteraction(reward, i)}
                    >
                      {/* ACTIVE/PASSIVE バッジ */}
                      <div style={{
                        position: 'absolute', top: '18px', left: '50%', transform: 'translateX(-50%)',
                        fontSize: '12px', color: '#fff',
                        backgroundColor: (reward.id.startsWith('spell') || reward.id.startsWith('enchant')) ? '#d32f2f' : '#1976d2',
                        padding: '4px 12px', borderRadius: '12px', fontWeight: 'bold',
                        border: '1px solid rgba(255,255,255,0.3)', boxShadow: '0 2px 4px rgba(0,0,0,0.5)', zIndex: 2
                      }}>
                        {(reward.id.startsWith('spell') || reward.id.startsWith('enchant')) ? 'ACTIVE' : 'PASSIVE'}
                      </div>

                      {/* 左上のアイコン */}
                      <span style={{ position: 'absolute', top: '8px', left: '8px', fontSize: '1.2em' }}>
                        {getRewardIcon(reward.id)}
                      </span>

                      {/* 右上のLvバッジ */}
                      <span style={{
                        position: 'absolute', top: '8px', right: '8px',
                        fontSize: '0.75em', color: '#ffeb3b', backgroundColor: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold'
                      }}>
                        {(() => {
                          const acq = acquiredRewards.find(a => a.id === reward.id);
                          const currentLevel = acq ? acq.count : 0;
                          return reward.maxLevel ? `Lv.${currentLevel + 1}/${reward.maxLevel}` : `Lv.${currentLevel + 1}/-`;
                        })()}
                      </span>

                      <div className="reward-card-name latemin-font" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', whiteSpace: 'nowrap', marginTop: '24px' }}>
                        <span>{reward.name}</span>
                      </div>
                      <div className="reward-card-desc" style={{ whiteSpace: 'pre-wrap', fontFamily: 'sans-serif' }}>
                        {(() => {
                          const acq = acquiredRewards.find(a => a.id === reward.id);
                          const currentLevel = acq ? acq.count : 0;
                          let displayDesc = reward.desc;

                          if (currentLevel === 0) {
                            if (reward.id === 'spellLightning') displayDesc = '視界内の敵に自動で落雷ダメージを与える魔法を習得します';
                            if (reward.id === 'spellFlame') displayDesc = '前方に火球を放ち周囲を巻き込む爆発魔法を習得します';
                            if (reward.id === 'spellFrost') displayDesc = '周囲の敵を凍てつかせる氷の衝撃波を習得します';

                            // エンチャント系の説明文の手動改行を削除しCSSに任せる
                            if (reward.id === 'enchantFire') displayDesc = '武器に炎属性を付与。物理ダメージが減衰する代わりに、攻撃力に応じた継続ダメージを与えます';
                            if (reward.id === 'enchantIce') displayDesc = '武器に氷属性を付与。物理ダメージが減衰する代わりに、敵の移動速度を低下させます';
                            if (reward.id === 'enchantLightning') displayDesc = '武器に雷属性を付与。物理ダメージが減衰する代わりに、敵の攻撃速度を低下させます';
                          } else {
                            // 既に取得済みのエンチャントリワードの場合
                            if (reward.id.startsWith('enchant')) {
                              displayDesc = '武器エンチャントの性能を強化します。\n物理ダメージ減衰率の緩和 ＆ 属性効果アップ';
                            }
                          }

                          return displayDesc
                            .replace('[プレイヤーLv×0.2]', `${(getLevel() * 0.2).toFixed(1)}`)
                            .replace('[プレイヤーLv×0.1]', `${(getLevel() * 0.1).toFixed(1)}`);
                        })()}
                      </div>
                    </div>
                  ))}
                </div>

                {/* リロール・バニッシュ操作パネル */}
                <div style={{ display: 'flex', gap: '16px', marginTop: '16px', justifyContent: 'center' }}>
                  <button
                    onClick={handleReroll}
                    disabled={rerollsLeft <= 0}
                    style={{
                      padding: '8px 20px', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px',
                      background: selectedRewardIndex === 3 ? 'rgba(0, 229, 255, 0.2)' : (rerollsLeft > 0 ? 'rgba(0, 229, 255, 0.1)' : 'rgba(100,100,100,0.1)'),
                      border: selectedRewardIndex === 3 ? '2px solid #00e5ff' : `1px solid ${rerollsLeft > 0 ? 'rgba(0, 229, 255, 0.4)' : '#555'}`,
                      color: rerollsLeft > 0 ? '#00e5ff' : '#666',
                      cursor: rerollsLeft > 0 ? 'pointer' : 'not-allowed',
                      boxShadow: selectedRewardIndex === 3 ? '0 0 15px rgba(0,229,255,0.6)' : (rerollsLeft > 0 ? '0 0 8px rgba(0,229,255,0.2)' : 'none'),
                      display: 'flex', alignItems: 'center', gap: '8px',
                      transform: selectedRewardIndex === 3 ? 'scale(1.05)' : 'scale(1)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span>🔄 リロール</span>
                    <span style={{ fontSize: '12px', opacity: 0.8 }}>({rerollsLeft})</span>
                  </button>
                  <button
                    onClick={() => { if (banishesLeft > 0) setIsBanishMode(prev => !prev); }}
                    disabled={banishesLeft <= 0}
                    style={{
                      padding: '8px 20px', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px',
                      background: isBanishMode ? 'rgba(255, 82, 82, 0.3)' : (selectedRewardIndex === 4 ? 'rgba(213, 0, 249, 0.2)' : (banishesLeft > 0 ? 'rgba(213, 0, 249, 0.1)' : 'rgba(100,100,100,0.1)')),
                      border: isBanishMode ? '2px solid #ff5252' : (selectedRewardIndex === 4 ? '2px solid #d500f9' : `1px solid ${banishesLeft > 0 ? 'rgba(213, 0, 249, 0.4)' : '#555'}`),
                      color: isBanishMode ? '#ff5252' : (banishesLeft > 0 ? '#d500f9' : '#666'),
                      cursor: banishesLeft > 0 ? 'pointer' : 'not-allowed',
                      boxShadow: isBanishMode ? '0 0 12px rgba(255,82,82,0.4)' : (selectedRewardIndex === 4 ? '0 0 15px rgba(213,0,249,0.6)' : (banishesLeft > 0 ? '0 0 8px rgba(213,0,249,0.2)' : 'none')),
                      animation: isBanishMode ? 'pulse 1s infinite' : 'none',
                      display: 'flex', alignItems: 'center', gap: '8px',
                      transform: selectedRewardIndex === 4 ? 'scale(1.05)' : 'scale(1)',
                      transition: 'all 0.2s'
                    }}
                  >
                    <span>🚫 バニッシュ</span>
                    <span style={{ fontSize: '12px', opacity: 0.8 }}>({banishesLeft})</span>
                  </button>
                </div>

                {/* バニッシュモード警告 */}
                {isBanishMode && (
                  <div style={{
                    marginTop: '8px', padding: '6px 16px', borderRadius: '6px',
                    background: 'rgba(255, 82, 82, 0.15)', border: '1px solid #ff5252',
                    color: '#ff5252', fontWeight: 'bold', fontSize: '14px', textAlign: 'center',
                    animation: 'pulse 1.5s infinite'
                  }}>
                    ⚠️ 除外するアップグレードを選択してください（選んだ報酬は今後出現しなくなります）
                  </div>
                )}

                <div className="paused-sub" style={{ marginTop: '12px', fontSize: '14px', display: 'flex', justifyContent: 'center' }}>
                  {isGamepadActive ? (
                    <div className="gp-btn-container" style={{ justifyContent: 'center', fontFamily: 'GenEiLateMin, serif' }}>
                      <span style={{ fontSize: '18px', verticalAlign: 'middle', marginRight: '4px' }}>✜</span>
                      <span className="gp-label">選択</span>
                      <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                      <span className="gp-btn gp-btn-a">A</span>
                      <span className="gp-label">決定</span>
                      <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                      <span className="gp-btn gp-btn-x">X</span>
                      <span className="gp-label">リロール</span>
                      <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                      <span className="gp-btn gp-btn-b">B</span>
                      <span className="gp-label">バニッシュ</span>
                    </div>
                  ) : (
                    <div className="gp-btn-container" style={{ justifyContent: 'center', fontFamily: 'GenEiLateMin, serif' }}>
                      <div style={{ display: 'flex', gap: '0' }}>
                        <kbd className="gp-kbd">←</kbd><kbd className="gp-kbd">↑</kbd><kbd className="gp-kbd">↓</kbd><kbd className="gp-kbd">→</kbd>
                      </div>
                      <span className="gp-label">選択</span>
                      <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                      <kbd className="gp-kbd">Enter</kbd>
                      <span className="gp-label">決定</span>
                      <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                      <kbd className="gp-kbd">X</kbd>
                      <span className="gp-label">リロール</span>
                      <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                      <kbd className="gp-kbd">B</kbd>
                      <span className="gp-label">バニッシュ</span>
                    </div>
                  )}
                </div>



                {/* 修正後 (リワード画面) */}
                {renderCurrentStatusPanels()}
              </div>
            </div>
          )}

          {isGameOver && (() => {
            const statTab = resultStatTab;
            const affixTab = resultAffixTab;

            // ====== 基礎値とアフィックス実数値の正確な計算 ======
            const equippedItems = Object.values(equipment).filter(Boolean) as GeneratedItem[];

            // STAT_KEY_MAP（StatType から PlayerStats キーへ）
            const STAT_KEY_MAP: Record<string, string> = {
              [StatType.MeleeAttack]: 'meleeAttackPower',
              [StatType.RangedAttack]: 'rangedAttackPower',
              [StatType.Defense]: 'defense',
              [StatType.Health]: 'health',
              [StatType.Speed]: 'moveSpeed',
              [StatType.CritChance]: 'critChance',
              [StatType.CritDamage]: 'critDamage',
              [StatType.FireDamage]: 'fireDamage',
              [StatType.IceDamage]: 'iceDamage',
              [StatType.LightningDamage]: 'lightningDamage',
              [StatType.LifeSteal]: 'lifeSteal',
              [StatType.PickupRange]: 'pickupRange',
              [StatType.HpRegen]: 'hpRegen',
              [StatType.MagicPower]: 'magicPower',
              [StatType.Evasion]: 'evasion',
            };

            // 基礎ステータスの算出（アフィックス抜きのプレイヤー基礎+アップグレード）
            const pBaseStats = computeStats(EMPTY_EQUIPMENT, permanentUpgrades);

            const gearBase: Record<string, number> = {};
            equippedItems.forEach(item => {
              item.baseItem.baseStats.forEach(s => {
                const key = STAT_KEY_MAP[s.stat] || s.stat;
                // 装備品の基本性能は「基礎値 × アイテムLv」として加算
                gearBase[key] = (gearBase[key] || 0) + s.value * (item.itemLevel || 1);
              });
            });

            const finalStats = playerStatsRef.current;
            const getBaseStat = (stat: string) => {
              const pStats = pBaseStats;
              let pBase = 0;
              if (stat === 'health') pBase = pStats.health;
              else if (stat === 'maxSp') pBase = pStats.maxSp;
              else if (stat === 'meleeAttackPower') pBase = pStats.meleeAttackPower;
              else if (stat === 'rangedAttackPower') pBase = pStats.rangedAttackPower;
              else if (stat === 'magicPower') pBase = pStats.magicPower;
              else if (stat === 'defense') pBase = pStats.defense;
              else if (stat === 'critChance') pBase = pStats.critChance;
              else if (stat === 'evasion') pBase = pStats.evasion;
              else if (stat === 'moveSpeed') pBase = pStats.moveSpeed;
              else if (stat === 'pickupRange') pBase = pStats.pickupRange;
              else if (stat === 'hpRegen') pBase = pStats.hpRegen;
              else if (stat === 'meleeAttackSpeed' || stat === 'rangedAttackSpeed') pBase = 1.0;
              return pBase + (gearBase[stat] || 0);
            };

            const summedStatsByType = equippedItems.reduce((acc, item) => {
              const allAffixes = [...item.prefixes, ...item.suffixes].flatMap(a => a.rolledValues);
              allAffixes.forEach(stat => {
                const key = STAT_KEY_MAP[stat.stat] || stat.stat;
                if (!acc[key]) acc[key] = { value: 0, percent: 0 };
                if (stat.isPercentage) acc[key].percent += stat.value;
                else acc[key].value += stat.value;
              });
              return acc;
            }, {} as Record<string, { value: number; percent: number }>);

            const affixOrder = [
              'health', 'maxSp', 'meleeAttackPower', 'meleeAttackSpeed',
              'rangedAttackPower', 'rangedAttackSpeed', 'magicPower', 'critChance',
              'defense', 'evasion', 'moveSpeed', 'pickupRange', 'hpRegen'
            ];

            const currentStatsData = {
              health: statTab === 'total' ? finalStats.health : getBaseStat('health'),
              maxSp: statTab === 'total' ? finalStats.maxSp : getBaseStat('maxSp'),
              meleeAttackPower: statTab === 'total' ? finalStats.meleeAttackPower : getBaseStat('meleeAttackPower'),
              meleeAttackInterval: statTab === 'total' ? finalStats.meleeAttackInterval : 1.0,
              rangedAttackPower: statTab === 'total' ? finalStats.rangedAttackPower : getBaseStat('rangedAttackPower'),
              rangedAttackInterval: statTab === 'total' ? finalStats.rangedAttackInterval : 1.0,
              magicPower: statTab === 'total' ? finalStats.magicPower : getBaseStat('magicPower'),
              defense: statTab === 'total' ? finalStats.defense : getBaseStat('defense'),
              critChance: statTab === 'total' ? finalStats.critChance : getBaseStat('critChance'),
              evasion: statTab === 'total' ? finalStats.evasion : getBaseStat('evasion'),
              moveSpeed: statTab === 'total' ? finalStats.moveSpeed : getBaseStat('moveSpeed'),
              pickupRange: statTab === 'total' ? finalStats.pickupRange : getBaseStat('pickupRange'),
              hpRegen: statTab === 'total' ? finalStats.hpRegen : getBaseStat('hpRegen'),
            };

            const pt = playTimeRef.current;
            const mins = Math.floor(pt / 60).toString().padStart(2, '0');
            const secs = (pt % 60).toFixed(2).padStart(5, '0');
            const currentWave = Math.min(14, Math.floor(pt / 60) + 1);

            // 内部用マッピング (STAT_INFO)
            const STAT_INFO: Record<string, { nameJa: string }> = {
              health: { nameJa: '最大HP' },
              maxSp: { nameJa: '最大SP' },
              meleeAttackPower: { nameJa: '近接攻撃力' },
              meleeAttackSpeed: { nameJa: '近接攻撃回数' },
              rangedAttackPower: { nameJa: '遠隔攻撃力' },
              rangedAttackSpeed: { nameJa: '遠隔攻撃回数' },
              magicPower: { nameJa: '魔力' },
              critChance: { nameJa: '会心率' },
              defense: { nameJa: '防御力' },
              evasion: { nameJa: 'パリィ発生率' },
              moveSpeed: { nameJa: '移動速度' },
              pickupRange: { nameJa: '取得範囲' },
              hpRegen: { nameJa: '自然回復速度' },
            };

            return (
              <div className="gameover-overlay" style={{ background: 'rgba(0,0,0,0.92)', zIndex: 100, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto', padding: '40px 0' }}>
                <div style={{ margin: 'auto', width: '860px', maxWidth: '95vw', background: 'rgba(20, 20, 30, 0.95)', border: '2px solid #a78bfa', borderRadius: '12px', padding: '20px', color: '#fff', boxShadow: '0 0 40px rgba(167, 139, 250, 0.2)' }}>

                  <h2 className="zen-dots" style={{ textAlign: 'center', fontSize: '36px', color: '#a78bfa', margin: '0 0 4px 0', textShadow: '0 0 10px rgba(167,139,250,0.5)', letterSpacing: '4px' }}>
                    Result
                  </h2>

                  <div style={{ display: 'flex', justifyContent: 'space-around', background: 'rgba(0,0,0,0.5)', padding: '8px 16px', borderRadius: '8px', marginBottom: '16px' }}>
                    <div style={{ textAlign: 'center' }}><div style={{ color: '#888', fontSize: '11px' }}>PLAY TIME</div><div style={{ fontSize: '24px', fontWeight: 'bold' }}>{mins}:{secs}</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ color: '#888', fontSize: '11px' }}>WAVE</div><div style={{ fontSize: '24px', fontWeight: 'bold', color: '#a78bfa' }}>{currentWave}</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ color: '#888', fontSize: '11px' }}>LEVEL / EXP</div><div style={{ fontSize: '24px', fontWeight: 'bold', color: '#00e5ff' }}>{getLevel()} <span style={{ fontSize: '16px', color: '#aaa' }}>({Math.round(getTotalExp())})</span></div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ color: '#888', fontSize: '11px' }}>KILLS</div><div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff5252' }}>{killCount}</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ color: '#888', fontSize: '11px' }}>MAX CHAIN</div><div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffea00' }}>{maxCombo}</div></div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px' }}>
                      <div style={{ borderBottom: '1px solid #444', paddingBottom: '2px', marginBottom: '8px', color: '#a78bfa', fontSize: '14px', fontWeight: 'bold' }}>🌟 最終ビルド構成</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {acquiredRewards.length > 0 ? (() => {
                          // rewardData.ts と同じロジックで type プロパティからアクティブ/パッシブを判定
                          const activeTypes = ['lightningDamage', 'fireDamage', 'iceDamage', 'enchantFire', 'enchantIce', 'enchantLightning'];
                          const activeSkills = acquiredRewards.filter(r => activeTypes.includes(r.type));
                          const passiveSkills = acquiredRewards.filter(r => !activeTypes.includes(r.type));

                          return (
                            <>
                              {/* アクティブ魔法の行 */}
                              {activeSkills.length > 0 && (
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {activeSkills.map(r => (
                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                      <span style={{ fontSize: '16px' }}>{getRewardIcon(r.id)}</span>
                                      <span style={{ fontSize: '12px' }}>{r.name} <span style={{ color: '#ffeb3b', fontWeight: 'bold' }}>Lv.{r.count}</span></span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {/* パッシブスキルの行 (改行) */}
                              {passiveSkills.length > 0 && (
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {passiveSkills.map(r => (
                                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                      <span style={{ fontSize: '16px' }}>{getRewardIcon(r.id)}</span>
                                      <span style={{ fontSize: '12px' }}>{r.name} <span style={{ color: '#ffeb3b', fontWeight: 'bold' }}>Lv.{r.count}</span></span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })() : <span style={{ color: '#666', fontSize: '12px' }}>取得なし</span>}
                      </div>
                    </div>

                    {/* ===== 左右2カラムレイアウト ===== */}
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>

                      {/* --- 左カラム (装備リスト / ステータス / アフィックス) --- */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        {/* 最終装備 */}
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px' }}>
                          <div style={{ borderBottom: '1px solid #444', paddingBottom: '2px', marginBottom: '8px', color: '#a78bfa', fontSize: '14px', fontWeight: 'bold' }}>🎽 最終装備</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {equippedItems.map((item: any, i) => {
                              const config = RARITY_CONFIG[item.rarity as Rarity] || RARITY_CONFIG.Common;
                              const slotInfo = SLOT_LABELS[item.baseItem.slot] || { emoji: '❓', label: item.baseItem.slot };
                              const isSelected = resultSelectedIndex === i;
                              return (
                                <div key={i} onMouseEnter={() => setResultSelectedIndex(i)}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', background: isSelected ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.3)', padding: '4px 8px', borderRadius: '4px', borderLeft: `3px solid ${config.color}`, boxShadow: isSelected ? '0 0 0 1px #fff' : 'none', cursor: 'pointer' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', minWidth: 0 }}>
                                    <span style={{ fontSize: '16px', flexShrink: 0 }}>{slotInfo.emoji}</span>
                                    <span style={{ color: config.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>[{config.nameJa}] {getItemDisplayName(item)}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* 最終ステータス */}
                        <div onMouseEnter={() => setResultSelectedIndex(equippedItems.length)}
                          style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', cursor: 'pointer', boxShadow: resultSelectedIndex === equippedItems.length ? '0 0 0 2px #fff' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #444', paddingBottom: '2px', marginBottom: '8px', color: '#a78bfa', fontSize: '14px', fontWeight: 'bold' }}>
                            <span style={{ marginRight: '12px' }}>⚙️ 最終ステータス</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => setResultStatTab('total')} style={{ cursor: 'pointer', pointerEvents: 'auto', padding: '0px 6px', fontSize: '10px', background: statTab === 'total' ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${statTab === 'total' ? '#a78bfa' : '#444'}`, color: statTab === 'total' ? '#fff' : '#aaa', borderRadius: '3px' }}>合計値</button>
                              <button onClick={() => setResultStatTab('base')} style={{ cursor: 'pointer', pointerEvents: 'auto', padding: '0px 6px', fontSize: '10px', background: statTab === 'base' ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${statTab === 'base' ? '#a78bfa' : '#444'}`, color: statTab === 'base' ? '#fff' : '#aaa', borderRadius: '3px' }}>基礎値</button>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '6px' }}>
                            {[
                              { label: '最大HP', value: currentStatsData.health.toFixed(1) }, { label: '最大SP', value: currentStatsData.maxSp.toFixed(1) },
                              { label: '近接攻撃力', value: currentStatsData.meleeAttackPower.toFixed(1) }, { label: '近接攻撃回数', value: `${(1 / Math.max(0.01, currentStatsData.meleeAttackInterval)).toFixed(2)}/sec` },
                              { label: '遠隔攻撃力', value: currentStatsData.rangedAttackPower.toFixed(1) }, { label: '遠隔攻撃回数', value: `${(1 / Math.max(0.01, currentStatsData.rangedAttackInterval)).toFixed(2)}/sec` },
                              // 【修正】会心率を防御力より前に移動
                              { label: '魔力', value: currentStatsData.magicPower.toFixed(1) }, { label: '会心率', value: `${currentStatsData.critChance.toFixed(1)}%` },
                              { label: '防御力', value: currentStatsData.defense.toFixed(1) }, { label: 'パリィ発生率', value: `${currentStatsData.evasion.toFixed(1)}%` },
                              { label: '移動速度', value: currentStatsData.moveSpeed.toFixed(1) }, { label: '取得範囲', value: currentStatsData.pickupRange.toFixed(1) },
                              { label: '自然回復速度', value: `${currentStatsData.hpRegen.toFixed(2)}/sec` }
                            ].map(s => (
                              <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                <span style={{ color: '#aaa' }}>{s.label}</span><span style={{ marginLeft: '8px', fontWeight: 'bold' }}>{s.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 最終アフィックス合計 */}
                        <div onMouseEnter={() => setResultSelectedIndex(equippedItems.length + 1)}
                          style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', cursor: 'pointer', boxShadow: resultSelectedIndex === equippedItems.length + 1 ? '0 0 0 2px #fff' : 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #444', paddingBottom: '2px', marginBottom: '8px', color: '#a78bfa', fontSize: '14px', fontWeight: 'bold' }}>
                            <span style={{ marginRight: '12px' }}>✨ 最終アフィックス合計</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={() => setResultAffixTab('percent')} style={{ cursor: 'pointer', pointerEvents: 'auto', padding: '0px 6px', fontSize: '10px', background: affixTab === 'percent' ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${affixTab === 'percent' ? '#a78bfa' : '#444'}`, color: affixTab === 'percent' ? '#fff' : '#aaa', borderRadius: '3px' }}>%表記</button>
                              <button onClick={() => setResultAffixTab('value')} style={{ cursor: 'pointer', pointerEvents: 'auto', padding: '0px 6px', fontSize: '10px', background: affixTab === 'value' ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.05)', border: `1px solid ${affixTab === 'value' ? '#a78bfa' : '#444'}`, color: affixTab === 'value' ? '#fff' : '#aaa', borderRadius: '3px' }}>上昇値</button>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '6px' }}>
                            {affixOrder.map((statType) => {
                              const statInfo = STAT_INFO[statType];
                              if (!statInfo) return null;
                              const values = summedStatsByType[statType] || { value: 0, percent: 0 };
                              let displayValue = 0; let hasValue = false;
                              if (affixTab === 'percent') { displayValue = values.percent; hasValue = displayValue !== 0; }
                              else { const tBase = getBaseStat(statType); displayValue = values.value + (tBase + values.value) * (values.percent / 100); hasValue = Math.abs(displayValue) >= 0.01 || values.value !== 0 || values.percent !== 0; }
                              const formatVal = (stat: string, val: number, isPct: boolean) => {
                                if (isPct) return `+${Math.round(val)}%`;
                                if (stat === 'health' || stat === 'maxSp') return `+${val.toFixed(1)}`;
                                if (['moveSpeed', 'pickupRange'].includes(stat)) return `+${val.toFixed(1)}`;
                                if (['critChance', 'evasion'].includes(stat)) return `+${val.toFixed(1)}%`;
                                if (stat === 'hpRegen' || stat.includes('Speed')) return `+${val.toFixed(2)}/sec`;
                                return `+${val.toFixed(1)}`;
                              };
                              return (
                                <div key={statType} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', whiteSpace: 'nowrap' }}>
                                  <span style={{ color: '#aaa' }}>{statInfo.nameJa}</span>
                                  <span style={{ marginLeft: '8px', color: hasValue ? '#fff' : '#555', fontWeight: 'bold' }}>{hasValue ? formatVal(statType, displayValue, affixTab === 'percent') : '---'}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                      </div>

                      {/* --- 右カラム (装備詳細 / 精算 / リスタート) --- */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        {/* 装備詳細 */}
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', height: '260px', minHeight: '260px', maxHeight: '260px', overflowY: 'hidden' }}>
                          <div style={{ borderBottom: '1px solid #444', paddingBottom: '2px', marginBottom: '8px', color: '#a78bfa', fontSize: '14px', fontWeight: 'bold' }}>🔍 装備詳細</div>
                          {(() => {
                            const item = equippedItems[resultSelectedIndex];
                            if (!item) return <div style={{ color: '#888', fontSize: '12px', textAlign: 'center', marginTop: '20px' }}>アイテムにカーソルを合わせてください</div>;
                            const config = RARITY_CONFIG[item.rarity] || RARITY_CONFIG.Common;
                            const slotInfo = SLOT_LABELS[item.baseItem.slot] || { emoji: '❓', label: item.baseItem.slot };
                            const isWeapon = item.baseItem.slot === EquipSlot.MeleeWeapon || item.baseItem.slot === EquipSlot.RangedWeapon;
                            const isMagic = item.baseItem.baseStats.some((s: any) => s.stat === StatType.MagicPower);
                            const isMelee = item.baseItem.slot === EquipSlot.MeleeWeapon;
                            let genreName = slotInfo.label;
                            if (isWeapon) {
                              if (isMelee && isMagic) genreName = '近接魔法武器'; else if (isMelee && !isMagic) genreName = '近接武器';
                              else if (!isMelee && isMagic) genreName = '遠隔魔法武器'; else if (!isMelee && !isMagic) genreName = '遠隔武器';
                            }
                            const fullGenre = isWeapon ? `${genreName}　${item.baseItem.nameJa}` : item.baseItem.nameJa;

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '20px' }}>{slotInfo.emoji}</span>
                                  <span style={{ color: config.color, fontSize: '16px', fontWeight: 'bold', textShadow: `0 0 10px ${config.color}AA` }}>{getItemDisplayName(item).replace(/[〜～~]/g, '')}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderBottom: '1px solid #444', paddingBottom: '8px' }}>
                                  <div style={{ display: 'flex', gap: '8px' }}><span style={{ color: config.color, fontWeight: item.rarity === Rarity.Celestial ? 'bold' : 'normal' }}>{config.nameJa}</span><span style={{ color: '#aaa' }}>Lv.{item.itemLevel || 1}</span></div>
                                  <span style={{ color: '#aaa' }}>{fullGenre}</span>
                                </div>
                                {item.baseItem?.baseStats?.length > 0 && (
                                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '0 8px' }}>
                                    {item.baseItem.baseStats.map((s: any, i: number) => {
                                      let label = STAT_LABELS[s?.stat] || s?.stat || '不明'; const val = s.value * (item.itemLevel || 1);
                                      let displayStr = '';
                                      if (s.stat === StatType.HpRegen) displayStr = `+${val.toFixed(2)}/sec`;
                                      else if (s.stat === StatType.Evasion || s.stat === StatType.CritChance) displayStr = `+${(Number.isInteger(val) ? val : val.toFixed(1))}%`;
                                      else displayStr = `+${val.toFixed(1)}`;
                                      return <div key={i} style={{ fontSize: '12px', color: '#fff' }}>{label} {displayStr}</div>;
                                    })}
                                  </div>
                                )}
                                {(item.prefixes?.length > 0 || item.suffixes?.length > 0) && (
                                  <div style={{ display: 'flex', gap: '16px', background: 'rgba(0,0,0,0.4)', padding: '8px', borderRadius: '4px' }}>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      {item.prefixes?.map((p: any, pi: number) => p?.rolledValues?.map((v: any, vi: number) => (
                                        <div key={`p${pi}-${vi}`} style={{ color: '#5cb8ff', fontSize: '11px', whiteSpace: 'nowrap' }}>{p?.definition?.nameJa || '未知'}: {STAT_LABELS[v?.stat] || v?.stat} {v.value > 0 ? '+' : ''}{Math.round(v.value)}%</div>
                                      )))}
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      {item.suffixes?.map((s: any, si: number) => s?.rolledValues?.map((v: any, vi: number) => (
                                        <div key={`s${si}-${vi}`} style={{ color: '#5cb8ff', fontSize: '11px', whiteSpace: 'nowrap' }}>{(s?.definition?.nameJa || '未知').replace(/^[～~](の)?/, '')}: {STAT_LABELS[v?.stat] || v?.stat} {v.value > 0 ? '+' : ''}{Math.round(v.value)}%</div>
                                      )))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* アイテム内訳 ＆ エナジー精算 */}
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px' }}>
                          <div style={{ borderBottom: '1px solid #444', paddingBottom: '2px', marginBottom: '8px', color: '#00e5ff', fontSize: '14px', fontWeight: 'bold' }}>🟦 獲得アイテム ＆ エナジー精算</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,229,255,0.05)', padding: '10px', borderRadius: '4px', border: '1px solid rgba(0,229,255,0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#aaa', fontWeight: 'bold' }}><span>合計取得アイテム数</span><span>{totalItemsPickedUp} 個</span></div>
                            <div style={{ height: '1px', background: 'rgba(0,229,255,0.2)', margin: '2px 0' }}></div>
                            <div style={{ fontSize: '11px', color: '#00e5ff', fontWeight: 'bold', marginBottom: '-2px' }}>レアリティ別 取得内訳</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {Object.entries(pickedUpItemCounts).filter(([_, count]) => count > 0).sort((a, b) => (RARITY_ORDER[a[0]] || 0) - (RARITY_ORDER[b[0]] || 0)).map(([rarity, count]) => {
                                const config = RARITY_CONFIG[rarity as Rarity] || RARITY_CONFIG.Common;
                                const cubes = pickedUpCubeBreakdown[rarity] || 0;
                                return (
                                  <div key={rarity} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                                    <span style={{ color: config.color }}>{config.nameJa} ({count}個)</span><span>+{cubes}</span>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ height: '1px', background: 'rgba(0,229,255,0.2)', margin: '2px 0' }}></div>
                            {gameMode === 'practice' ? (
                              <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', color: '#00e5ff' }}><span>エナジーキューブ</span><span>{energyCubes}</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', color: '#ffa500' }}><span>プラクティス補正</span><span>x0.5</span></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', color: '#00e5ff' }}><span>最終エナジーキューブ</span><span>{Math.ceil(energyCubes / 2)}</span></div>
                              </>
                            ) : (
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', color: '#00e5ff' }}><span>合計エナジーキューブ</span><span>{energyCubes}</span></div>
                            )}

                            {(() => {
                              let displayHyper = 0;
                              if (gameMode === 'normal') {
                                if (window.__isGameClear) {
                                  displayHyper = 3;
                                } else if (window.__queenKilled) {
                                  displayHyper = 1;
                                }
                              }

                              if (displayHyper > 0) {
                                return (
                                  <>
                                    <div style={{ height: '1px', background: 'rgba(0,229,255,0.2)', margin: '6px 0' }}></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 'bold', color: '#d500f9' }}>
                                      <span>合計ハイパーキューブ</span>
                                      <span>{displayHyper} 個</span>
                                    </div>
                                  </>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        </div>

                        {/* リスタートボタンと操作説明 (右カラムの最下部に固定) */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: 'auto' }}>
                          <button onClick={handleReturnToTitle}
                            style={{ padding: '16px', fontSize: '20px', fontWeight: 'bold', background: '#a78bfa', color: '#111', border: 'none', borderRadius: '8px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(167, 139, 250, 0.3)', transition: 'all 0.2s', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
                            onMouseOver={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                            onMouseOut={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                          >
                            🏠 タイトルに戻る
                            {isGamepadActive ? (
                              <span style={{ fontSize: '12px', opacity: 0.8, display: 'inline-flex', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '2px 8px', borderRadius: '4px' }}>
                                <span className="gp-btn gp-btn-start" style={{ fontSize: '10px' }}>☰</span> Start
                              </span>
                            ) : (
                              <kbd className="gp-kbd" style={{ fontSize: '12px', color: '#111' }}>Esc</kbd>
                            )}
                          </button>
                          <div style={{ fontSize: '14px', color: '#888', textAlign: 'center', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px', fontFamily: 'GenEiLateMin, serif', display: 'flex', justifyContent: 'center' }}>
                            {activeDevice === 'keyboard' ? (
                              <div className="gp-btn-container" style={{ justifyContent: 'center', fontFamily: 'GenEiLateMin, serif' }}>
                                <div style={{ display: 'flex', gap: '0' }}>
                                  <kbd className="gp-kbd">↑</kbd><kbd className="gp-kbd">↓</kbd>
                                </div>
                                <span className="gp-label">選択</span>
                                <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                                <div style={{ display: 'flex', gap: '0' }}>
                                  <kbd className="gp-kbd">Q</kbd><kbd className="gp-kbd">E</kbd>
                                </div>
                                <span className="gp-label">タブ切替</span>
                                <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                                <kbd className="gp-kbd">Esc</kbd>
                                <span className="gp-label">戻る</span>
                              </div>
                            ) : (
                              <div className="gp-btn-container" style={{ justifyContent: 'center', fontFamily: 'GenEiLateMin, serif' }}>
                                <span style={{ fontSize: '18px', verticalAlign: 'middle' }}>✜</span>
                                <span className="gp-label">選択</span>
                                <span style={{ margin: '0 8px', color: '#444' }}>|</span>
                                <div style={{ display: 'flex', gap: '0' }}>
                                  <span className="gp-btn gp-btn-side">LB</span><span className="gp-btn gp-btn-side">RB</span>
                                </div>
                                <span className="gp-label">タブ切替</span>
                              </div>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>

                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {isSettingsOpen && (
        <SettingsUI
          onClose={() => setIsSettingsOpen(false)}
          bgmVolume={bgmVolume}
          seVolume={seVolume}
          masterVolume={masterVolume}
          setBgmVolume={setBgmVolume}
          setSeVolume={setSeVolume}
          setMasterVolume={setMasterVolume}
          showInventoryMainAll={showInventoryMainAll}
          showInventorySubAll={showInventorySubAll}
          inventoryDisplayLimit={inventoryDisplayLimit}
          setShowInventoryMainAll={setShowInventoryMainAll}
          setShowInventorySubAll={setShowInventorySubAll}
          setInventoryDisplayLimit={setInventoryDisplayLimit}
          isGamepadActive={activeDevice !== 'keyboard'}
          singleStickModeSetting={singleStickModeSetting}
          setSingleStickModeSetting={setSingleStickModeSetting}
          playerSkinSetting={playerSkinSetting}
          setPlayerSkinSetting={setPlayerSkinSetting}
        />
      )}

      <HelpUI isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} isGamepad={activeDevice !== 'keyboard'} />

      {/* バージョン表示 */}
      <div style={{ position: 'fixed', bottom: '10px', left: '10px', color: 'rgba(255,255,255,0.3)', fontSize: '12px', pointerEvents: 'none', zIndex: 9999, fontFamily: 'Consolas, monospace' }}>
        Ver.1.5.0
      </div>
    </>
  );
}