import { useRef, memo, useState, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { Group, Vector3 as V3Type, MeshStandardMaterial as MSM } from 'three';
import { Vector3, Raycaster, Plane, Vector2 } from 'three';
import { useKeyboard } from '../hooks/useKeyboard';
import { useGamepad } from '../hooks/useGamepad';
import type { GamepadInfo } from '../hooks/useGamepad';
import { enqueueProjectile, type ProjectileSpawn } from './Projectiles';
import { playSound } from '../game/soundBus';
import { playerStatsRef, playerPosRef } from '../game/playerStats';
import { playerDebuffs, updatePlayerDebuffs, dodgeBuffTimer, shifukuBuffAmount, updateShifukuBuff, addShifukuBuff, triggerDodgeBuff, getMaxOb, getMaxArDuration } from '../game/playerStats';
import {
  getEnemyCount,
  getEnemyPositions,
  isEnemyAlive,
  getEnemyBaseDamage,
  getEnemyType,
  applyKnockback,
  getEnemyDebuff,
  getGlobalGameTime,
  setPlayerGuarding,
  setPlayerBoosting,
  onPetitMegaCrash,
  clearEnemyProjectilesInRadius,
  getEnemiesInRadius,
  damageEnemy,
  checkJustGuard,
  triggerPetitMegaCrash
} from '../game/collisionBus';
import { getEnchantColor } from '../game/enchantState';
import { emitMagic } from '../game/magicBus';
import {
  damagePlayer,
  updateInvTimer,
  isPlayerInvincible,
  getPlayerHp,
  getPlayerMaxHp,
  regeneratePlayerHp,
  triggerInvincibility,
} from '../game/playerHp';
import { spawnDamagePopup } from './DamagePopups';
import {
  updateDash,
  isDashing,
  tryDash,
  getDashDirection,
  getDashSpeedMultiplier,
  getDashStamina,
  getDashMaxStamina,
  drainStamina,
  drainGuardStamina,
} from '../game/playerDash';

const _moveDir = new Vector3();
const _inputDir = new Vector3();
const _facingDir = new Vector3(0, 0, -1);

// マウスエイム用の再利用オブジェクト（毎フレーム生成を避ける）
const _mouseRaycaster = new Raycaster();
const _groundPlane = new Plane(new Vector3(0, 1, 0), -0.5); // y=0.5 の水平面
const _mouseNdc = new Vector2();
const _mouseWorldTarget = new Vector3();

/** 回避成功時の押し出し（衝撃波）の半径 (1.5m) */
const DODGE_REPEL_RADIUS = 1.5;
const DODGE_REPEL_RADIUS_SQ = DODGE_REPEL_RADIUS * DODGE_REPEL_RADIUS;
/** 回避成功時の押し出しの力（ノックバック距離） */
const DODGE_REPEL_FORCE = 1.5;

/** 敵との接触判定半径の2乗 (コア半径0.4mに合わせる) */
// 見た目のコアより一回り判定を小さくして「ギリギリ避け」の猶予を作る
const CONTACT_RADIUS_SQ = 0.4 * 0.4;

interface PlayerProps {
  onPositionUpdate?: (pos: V3Type) => void;
  onGamepadConnect?: (connected: boolean, devices: GamepadInfo[], mainId: string) => void;
  isGameOver?: boolean;
  isPaused?: boolean;
  isInventoryOpen?: boolean;
  onPlayerDeath?: () => void;
  activeEnchant?: string;
  isSpawning?: boolean;
  spawnStartTime?: number;
  // ※コード上の isSingleStick は「シンクロモード」を指します
  isSingleStick?: boolean;
  onToggleSingleStick?: () => void;
  skinSetting?: 'default' | 'sphere' | 'crystal' | 'armor' | 'satellite';
}

export const Player = memo(function Player({
  onPositionUpdate,
  onGamepadConnect,
  isGameOver = false,
  isPaused = false,
  isInventoryOpen = false,
  onPlayerDeath,
  activeEnchant = 'none',
  isSpawning = false,
  spawnStartTime = 0,
  isSingleStick = false,
  onToggleSingleStick,
  skinSetting = 'default'
}: PlayerProps) {
  const groupRef = useRef<Group>(null);
  const keys = useKeyboard();
  const { poll: pollGamepad } = useGamepad();
  const { camera } = useThree();
  const facingAngleRef = useRef(0);
  const meleeFireTimerRef = useRef(0);
  const rangedFireTimerRef = useRef(0);
  const wasConnectedRef = useRef(false);
  const lastMainIdRef = useRef('');
  const bodyMatRef = useRef<MSM>(null);
  const flashTimerRef = useRef(0);
  const flashColorRef = useRef('#ff0000'); // フラッシュの色を保持
  const punchHandRef = useRef(false);
  const dashBarRef = useRef<HTMLDivElement>(null); // 頭上回避バー用Ref
  const obBarContainerRef = useRef<HTMLDivElement>(null);
  const obBarRef = useRef<HTMLDivElement>(null);
  const arBarContainerRef = useRef<HTMLDivElement>(null);
  const arBarRef = useRef<HTMLDivElement>(null);
  const debuffContainerRef = useRef<HTMLDivElement>(null);
  const prevDashInputRef = useRef(false);
  const waitForRelease = useRef(true);
  const lightningTimerRef = useRef(0);
  const fireballTimerRef = useRef(0);
  const iceTimerRef = useRef(0);
  const prevR3PressedRef = useRef(false);
  const isGuardingRef = useRef(false);
  const prevIsGuardingRef = useRef(false); // バリアのON/OFF切り替え検知用
  const guardPressTimerRef = useRef(0);
  const prevGuardInputRef = useRef(false);
  const barrierMeshRef = useRef<import('three').Mesh>(null);

  const isBoostingRef = useRef(false);
  const prevBoostInputRef = useRef(false);

  // マウスボタン状態
  const mouseBtnsRef = useRef<Set<number>>(new Set());
  // マウスエイム用: 前フレームのポインター座標
  const prevPointerRef = useRef({ x: 0, y: 0 });
  const mouseAimActiveRef = useRef(false);
  const boostAuraRef = useRef<import('three').Mesh>(null);

  const dodgeVisualTimerRef = useRef(0);
  const dodgeAuraRef = useRef<import('three').Mesh>(null);

  const megaCrushVisualTimerRef = useRef(0);
  const megaCrushAuraRef = useRef<import('three').Mesh>(null);

  const petitCrushVisualTimerRef = useRef(0);
  const petitCrushAuraRef = useRef<import('three').Mesh>(null);
  
  const barrierCooldownTimerRef = useRef(0);
  const cooldownAuraRef = useRef<import('three').Mesh>(null);

  // プレイヤースキン用 Ref 定義
  const visualGroupRef = useRef<import('three').Group>(null);
  const ring1Ref = useRef<import('three').Mesh>(null);
  const ring2Ref = useRef<import('three').Mesh>(null);
  const sat1Ref = useRef<import('three').Mesh>(null);
  const sat2Ref = useRef<import('three').Mesh>(null);
  const sat3Ref = useRef<import('three').Mesh>(null);
  const sat4Ref = useRef<import('three').Mesh>(null);

  useEffect(() => {
    if (isPaused || isInventoryOpen || isGameOver) {
      // 状態がtrueになった時（または変化してUIが開いた時）無条件でロック準備を完了する
      waitForRelease.current = true;
    }
  }, [isPaused, isInventoryOpen, isGameOver]);

  // マウスボタンの追跡
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      mouseBtnsRef.current.add(e.button);
    };
    const handleMouseUp = (e: MouseEvent) => {
      mouseBtnsRef.current.delete(e.button);
    };
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // 右クリックのブラウザメニューを抑制
    };
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  useEffect(() => {
    const handleMegaCrush = () => {
      megaCrushVisualTimerRef.current = 0.2; // 0.4 -> 0.2 に短縮
    };
    window.addEventListener('trigger-mega-crush-visual', handleMegaCrush);
    return () => window.removeEventListener('trigger-mega-crush-visual', handleMegaCrush);
  }, []);

  // プチメガクラッシュリスナー
  useEffect(() => {
    const unsub = onPetitMegaCrash(() => {
      if (!groupRef.current) return;
      const px = groupRef.current.position.x;
      const pz = groupRef.current.position.z;

      // 無敵付与
      triggerInvincibility(0.5);

      // 半径5mの弾丸・波紋を消滅
      clearEnemyProjectilesInRadius(px, pz, 5.0);


      // 半径2.5m内の敵へダメージ・ノックバック
      const stats = playerStatsRef.current;
      const baseDmg = (stats.meleeAttackPower + stats.rangedAttackPower) / 2;
      const outIndices: number[] = [];
      getEnemiesInRadius(px, pz, 2.5, outIndices);
      for (const idx of outIndices) {
        if (!isEnemyAlive(idx)) continue;
        const ex = getEnemyPositions()[idx * 2];
        const ez = getEnemyPositions()[idx * 2 + 1];
        const dx = ex - px;
        const dz = ez - pz;
        const distSq = dx * dx + dz * dz;
        if (distSq > 2.5 * 2.5) continue;

        const effectiveCritChance = stats.critChance + (dodgeBuffTimer > 0 ? 50.0 : 0);
        const isCrit = Math.random() < (effectiveCritChance / 100);
        const finalDamage = baseDmg * (isCrit ? (stats.critDamage / 100) : 1.0);
        const result = damageEnemy(idx, finalDamage, false, false);
        spawnDamagePopup(ex, 1.2, ez, result.finalDamage, isCrit ? 1 : 0, '#7fbfff', '#000000');

        // ノックバック
        const dist = Math.sqrt(distSq) || 0.001;
        applyKnockback(idx, dx / dist, dz / dist, 20.0);
      }

      // リングエフェクト起動
      petitCrushVisualTimerRef.current = 0.3;
    });
    return () => unsub();
  }, []);

  // 頭上HPバー用のステート
  const [hp, setHp] = useState(getPlayerHp());
  const [maxHp, setMaxHp] = useState(getPlayerMaxHp());

  useEffect(() => {
    const interval = setInterval(() => {
      setHp(getPlayerHp());
      setMaxHp(getPlayerMaxHp());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // 出現演出開始時にSEを再生
  useEffect(() => {
    if (isSpawning) {
      playSound('player_spawn');
    }
  }, [isSpawning]);

  useFrame((_state, delta) => {
    if (!groupRef.current) return;

    // 【追加】HP監視による死亡判定の集約
    if (getPlayerHp() <= 0 && !isGameOver) {
      onPlayerDeath?.();
      return;
    }

    // --- 追加: キルスクリーン ダメラージ処理 ---
    const globalTime = getGlobalGameTime();
    if (!isPaused && !isGameOver && globalTime >= 900) {
      // 毎フレーム0.5ダメージ（秒間約30ダメージ）。無敵付与なしの真のスリップダメージ。
      if (damagePlayer(0.5, true) === 'dead') onPlayerDeath?.();
    }

    if (!isPaused && !isGameOver) {
      // 無敵タイマー更新
      updateInvTimer(delta);
      // 属性やられタイマー更新（回避中はARゲージ減少を停止）
      updatePlayerDebuffs(delta, isDashing());
      // クールタイム更新
      if (barrierCooldownTimerRef.current > 0) barrierCooldownTimerRef.current -= delta;
    }

    // 被ダメフラッシュ演出 + 属性やられ点滅
    if (bodyMatRef.current) {
      const hasDebuff = playerDebuffs.fire > 0 || playerDebuffs.ice > 0 || playerDebuffs.lightning > 0;

      if (flashTimerRef.current > 0) {
        flashTimerRef.current -= delta;
        // 点滅: 指定色⇔通常を高速切り替え
        const flash = Math.sin(flashTimerRef.current * 30) > 0;
        bodyMatRef.current.emissive.set(flash ? flashColorRef.current : '#4a148c');
        bodyMatRef.current.emissiveIntensity = flash ? 1.0 : 0.3;
      } else if (hasDebuff) {
        // 属性やられ点滅（残り時間が最も長い属性を優先）
        let debuffColor = 0x4a148c;
        let maxTime = 0;
        if (playerDebuffs.fire > maxTime) { maxTime = playerDebuffs.fire; debuffColor = 0xff4500; }
        if (playerDebuffs.ice > maxTime) { maxTime = playerDebuffs.ice; debuffColor = 0x00ffff; }
        if (playerDebuffs.lightning > maxTime) { maxTime = playerDebuffs.lightning; debuffColor = 0xffd700; }

        const pulse = Math.sin(_state.clock.elapsedTime * 10) > 0;
        bodyMatRef.current.emissive.setHex(pulse ? debuffColor : 0x4a148c);
        bodyMatRef.current.emissiveIntensity = pulse ? 0.8 : 0.3;
      } else {
        bodyMatRef.current.emissive.setHex(0x4a148c);
        bodyMatRef.current.emissiveIntensity = 0.3;
      }
    }

    // ========== 出現演出 (デジタルグリッチ) ==========
    if (isSpawning && spawnStartTime > 0) {
      const elapsed = (Date.now() - spawnStartTime) / 1000;
      const duration = 2.5;
      const glitchEnd = 2.0;

      if (elapsed < duration) {
        let currentScale = 1.0;
        let isGlitching = false;
        let opacity = 0.4;

        if (elapsed < glitchEnd) {
          // グリッチフェーズ
          isGlitching = Math.random() > 0.4; // 60%の確率でグリッチ
          const p = elapsed / glitchEnd;
          currentScale = p * 0.5 + (Math.random() * 1.0); // 乱高下
          opacity = Math.random() > 0.3 ? 0.4 : 0.1;

          // 微振動
          groupRef.current.position.x += (Math.random() - 0.5) * 0.1;
          groupRef.current.position.z += (Math.random() - 0.5) * 0.1;
          groupRef.current.position.y = 0.5 + (Math.random() - 0.5) * 0.05;
        } else {
          // 安定化フェーズ
          const p = (elapsed - glitchEnd) / (duration - glitchEnd); // 0 -> 1
          currentScale = 1.0;
          opacity = 0.4;
          // 位置を(0, 0.5, 0)に収束させる
          groupRef.current.position.lerp(new Vector3(0, 0.5, 0), p);
        }

        groupRef.current.scale.setScalar(currentScale);

        if (bodyMatRef.current) {
          bodyMatRef.current.opacity = opacity;
          if (isGlitching) {
            bodyMatRef.current.emissive.set('#ffffff');
            bodyMatRef.current.emissiveIntensity = 2.0;
          } else {
            bodyMatRef.current.emissive.set('#4a148c');
            bodyMatRef.current.emissiveIntensity = 0.3;
          }
        }
        return; // 出現中は他の処理（移動・攻撃等）をスキップ
      }
    } else if (groupRef.current.scale.x !== 1.0 && !isGameOver) {
      // 演出終了後の強制リセット
      groupRef.current.scale.setScalar(1.0);
      if (bodyMatRef.current) {
        bodyMatRef.current.opacity = 0.4;
        bodyMatRef.current.emissive.set('#4a148c');
        bodyMatRef.current.emissiveIntensity = 0.3;
      }
    }

    // ========== 入力取得 (早期リターンの前に行う) ==========
    const gp = pollGamepad();
    const pressed = keys.current;

    // ========== シンクロモード（isSingleStick）手動切り替え (R3) ==========
    const r3Pressed = gp.connected && gp.mainDevice && gp.mainDevice.buttons[11] > 0.5;
    
    if (r3Pressed && !prevR3PressedRef.current) {
      onToggleSingleStick?.();
    }
    prevR3PressedRef.current = !!r3Pressed;

    // ゲームオーバーまたはポーズ時は移動・攻撃・接触判定・自然回復を停止
    if (isGameOver || isPaused) return;

    // 自然回復の実装 (基礎 0.2%/s + ステータス値)
    const baseRegen = getPlayerMaxHp() * 0.002;
    const totalRegen = playerStatsRef.current.hpRegen + baseRegen;
    if (totalRegen > 0) {
      regeneratePlayerHp(totalRegen * delta);
    }

    // ========== 自動雷撃（ゾンデ） ==========
    if (!isInventoryOpen) {
      const stats = playerStatsRef.current;
      if (stats.lightningDamage > 0) {
        lightningTimerRef.current += delta;
        const lightningInterval = 2.0 / (1 + 0.25 * (stats.lightningDamage - 1));
        if (lightningTimerRef.current >= lightningInterval) {
          lightningTimerRef.current = 0;

          const px = groupRef.current.position.x;
          const pz = groupRef.current.position.z;
          const eCount = getEnemyCount();
          const ePositions = getEnemyPositions();
          const candidates: { x: number, z: number }[] = [];

          for (let i = 0; i < eCount; i++) {
            if (!isEnemyAlive(i)) continue;
            const ex = ePositions[i * 2];
            const ez = ePositions[i * 2 + 1];
            const distSq = (ex - px) ** 2 + (ez - pz) ** 2;
            if (distSq < 400) candidates.push({ x: ex, z: ez });
          }

          if (candidates.length > 0) {
            const target = candidates[Math.floor(Math.random() * candidates.length)];

            emitMagic({
              type: 'thunder',
              position: [target.x, 0, target.z],
              damage: stats.magicPower * 1.0,
              radius: 3.0,
              critChance: stats.critChance + (dodgeBuffTimer > 0 ? 50.0 : 0),
              critDamage: stats.critDamage,
            });
          }
        }
      }
    }

    // ========== 火球魔法（フォイエ） ==========
    if (!isInventoryOpen) {
      const stats = playerStatsRef.current;
      if (stats.fireDamage > 0) {
        fireballTimerRef.current += delta;
        const fireballInterval = 2.0; // 固定
        if (fireballTimerRef.current >= fireballInterval) {
          fireballTimerRef.current = 0;

          // 前方へ発射
          enqueueProjectile({
            x: groupRef.current.position.x,
            y: 0.5,
            z: groupRef.current.position.z,
            dirX: _facingDir.x,
            dirZ: _facingDir.z,
            damage: (stats.magicPower * 1.0) * (1 + 0.25 * (stats.fireDamage - 1)),
            critChance: stats.critChance + (dodgeBuffTimer > 0 ? 50.0 : 0),
            piercePower: 1,
            isMelee: false,
            maxLife: 2.0,
            color: '#FF4500',
            speed: 10,
            targetScaleX: 2.0,
            critDamage: stats.critDamage,
            attackStyle: 'fireball',
            pierceDecay: 0,
            visualScale: 1.0, // 魔法(火球)は一旦固定
            isHoming: false,
          });
        }
      }
    }

    // ========== 自動氷結（バータ） ==========
    if (!isInventoryOpen) {
      const stats = playerStatsRef.current;
      if (stats.iceDamage > 0) {
        iceTimerRef.current += delta;
        if (iceTimerRef.current >= 4.0) { // 4秒ごとに設置
          iceTimerRef.current = 0;
          const iceLevel = stats.iceDamage;
          emitMagic({
            type: 'ice_field',
            position: [groupRef.current.position.x, 0, groupRef.current.position.z],
            duration: 5.0, // 5秒間持続
            radius: Math.max(3.0, (1 + 0.125 * (iceLevel - 1)) * 3.0),
            damage: Math.max(1, Math.floor(stats.magicPower * 0.5)), // 1秒あたりのDPS (魔力の50%、最低1)
            critChance: stats.critChance + (dodgeBuffTimer > 0 ? 50.0 : 0),
            critDamage: stats.critDamage,
          });
        }
      }
    }

    // 回避タイマー更新
    updateDash(delta);

    // OBガードバフ (Obscurity) の減衰処理
    updateShifukuBuff(delta, isGuardingRef.current);

    // 頭上回避バーアニメーション
    if (dashBarRef.current) {
      const maxStamina = getDashMaxStamina();
      if (maxStamina > 0) {
        const currentStamina = getDashStamina();
        const ratio = Math.max(0, Math.min(1, currentStamina / maxStamina));
        const isDepleted = currentStamina < 25; // DASH_COST

        dashBarRef.current.style.width = `${ratio * 100}%`;
        dashBarRef.current.style.backgroundColor = isDepleted ? '#FF4500' : '#FFD700';
      }
    }

    if (obBarContainerRef.current) {
      obBarContainerRef.current.style.opacity = shifukuBuffAmount > 0 ? '1' : '0';
      if (obBarRef.current) {
        const maxOb = getMaxOb();
        obBarRef.current.style.width = `${Math.min(100, Math.max(0, (shifukuBuffAmount / maxOb) * 100))}%`;
      }
    }
    if (arBarContainerRef.current) {
      arBarContainerRef.current.style.opacity = dodgeBuffTimer > 0 ? '1' : '0';
      if (arBarRef.current) {
        const maxAr = getMaxArDuration();
        arBarRef.current.style.width = `${Math.min(100, Math.max(0, (dodgeBuffTimer / maxAr) * 100))}%`;
      }
    }

    // ========== 頭上デバフタイマーの更新 ==========
    if (debuffContainerRef.current) {
      let html = '';
      if (playerDebuffs.fire > 0) {
        html += `<span style="color:#FF4500; text-shadow: 0 0 4px rgba(255,69,0,0.6); font-size:14px; font-weight:bold; margin-right:8px;">🔥${playerDebuffs.fire.toFixed(1)}</span>`;
      }
      if (playerDebuffs.ice > 0) {
        html += `<span style="color:#00FFFF; text-shadow: 0 0 4px rgba(0,255,255,0.6); font-size:14px; font-weight:bold; margin-right:8px;">❄️${playerDebuffs.ice.toFixed(1)}</span>`;
      }
      if (playerDebuffs.lightning > 0) {
        html += `<span style="color:#FFD700; text-shadow: 0 0 4px rgba(255,215,0,0.6); font-size:16px; font-weight:bold; margin-right:8px;">⚡${playerDebuffs.lightning.toFixed(1)}</span>`;
      }
      if (debuffContainerRef.current.innerHTML !== html) {
        debuffContainerRef.current.innerHTML = html;
      }
    }

    const connectionChanged = wasConnectedRef.current !== gp.connected;
    const deviceChanged = lastMainIdRef.current !== gp.mainId;
    if (connectionChanged || deviceChanged) {
      onGamepadConnect?.(gp.connected, gp.devices, gp.mainId);
      wasConnectedRef.current = gp.connected;
      lastMainIdRef.current = gp.mainId;
    }

    // ========== 移動入力の解決 ==========
    _inputDir.set(0, 0, 0);
    if (gp.connected) {
      if (Math.abs(gp.leftX) > 0 || Math.abs(gp.leftY) > 0) {
        _inputDir.x = gp.leftX;
        _inputDir.z = gp.leftY;
      }
    }
    if (pressed.has('w')) _inputDir.z -= 1;
    if (pressed.has('s')) _inputDir.z += 1;
    if (pressed.has('a')) _inputDir.x -= 1;
    if (pressed.has('d')) _inputDir.x += 1;

    // ========== 回避の発動判定 ==========
    let currentDashInput = pressed.has(' ') || mouseBtnsRef.current.has(0) || !!(gp.connected && gp.mainDevice && gp.mainDevice.buttons[0] > 0.5);
    if (waitForRelease.current) {
      if (!currentDashInput) {
        waitForRelease.current = false;
      } else {
        currentDashInput = false;
      }
    }
    const isUiOpen = isInventoryOpen || isPaused || isGameOver;
    if (!isUiOpen) {
      if (currentDashInput && !prevDashInputRef.current) {
        if (tryDash(_inputDir, _facingDir)) {
          isGuardingRef.current = false;
        }
      }
    }
    prevDashInputRef.current = !!currentDashInput;

    // ========== ガード（バリア）の発動判定 ==========
    const guardInput = pressed.has('shift') || mouseBtnsRef.current.has(2) || !!(gp.connected && gp.mainDevice && gp.mainDevice.buttons[5] > 0.5);
    if (!isUiOpen) {
      if (guardInput && !prevGuardInputRef.current) {
        if (barrierCooldownTimerRef.current > 0) {
          // クールタイム中: 拒否エフェクト (オレンジ色)
          flashTimerRef.current = 0.2;
          flashColorRef.current = '#ffa500';
          if (bodyMatRef.current) bodyMatRef.current.emissive.set('#ffa500');
        } else if (getDashStamina() > 0) {
          isGuardingRef.current = !isGuardingRef.current;
          // 解除された瞬間にクールタイム開始
          if (!isGuardingRef.current) barrierCooldownTimerRef.current = 1.0;
        }
        guardPressTimerRef.current = 0;
      } else if (guardInput && prevGuardInputRef.current) {
        guardPressTimerRef.current += delta;
      } else if (!guardInput && prevGuardInputRef.current) {
        if (guardPressTimerRef.current >= 1.0) {
          if (isGuardingRef.current) {
            isGuardingRef.current = false;
            barrierCooldownTimerRef.current = 1.0; // 長押し解除時もクールタイム
          }
        }
      }
    }
    prevGuardInputRef.current = guardInput;
    setPlayerGuarding(isGuardingRef.current);

    // ジャストガード判定 (バリア発動の瞬間のみ)
    if (isGuardingRef.current && !prevIsGuardingRef.current && !isPlayerInvincible()) {
      const px = groupRef.current!.position.x;
      const pz = groupRef.current!.position.z;
      if (checkJustGuard(px, pz, 1.2)) {
        playSound('just_guard');
        playSound('mega_crush');
        addShifukuBuff(100); // OB加算
        spawnDamagePopup(0, 2.5, 2.0, 'I-frame block!', 0, '#7fbfff', '#FFFFFF', -1.5, true);
        triggerPetitMegaCrash(); // プチメガクラ発動 (内部で無敵付与・弾消し・ダメージ等実行)
      }
    }
    prevIsGuardingRef.current = isGuardingRef.current;

    // ========== ブーストの発動判定 ==========
    const boostInput = pressed.has('e') || !!(gp.connected && gp.mainDevice && gp.mainDevice.buttons[2] > 0.5);
    if (!isUiOpen) {
      if (boostInput && !prevBoostInputRef.current) {
        if (getDashStamina() > 0) {
          isBoostingRef.current = !isBoostingRef.current;
          if (isBoostingRef.current) isGuardingRef.current = false;
        }
      }
    }
    prevBoostInputRef.current = boostInput;
    if (isGuardingRef.current && isBoostingRef.current) {
      isBoostingRef.current = false;
    }
    setPlayerBoosting(isBoostingRef.current);

    // ========== 実際の移動 ==========
    _moveDir.set(0, 0, 0);
    const stats = playerStatsRef.current;
    const currentMoveSpeed = (stats.moveSpeed / 10) * (playerDebuffs.ice > 0 ? 0.667 : 1.0);

    if (isDashing()) {
      const dashSpeed = currentMoveSpeed * getDashSpeedMultiplier();
      _moveDir.copy(getDashDirection()).multiplyScalar(dashSpeed * delta);
    } else if (_inputDir.lengthSq() > 0) {
      const speedMult = isGuardingRef.current ? (1.0 / 3.0) : 1.0;
      const tiltMultiplier = Math.min(1.0, _inputDir.length());
      _moveDir.copy(_inputDir).normalize().multiplyScalar(currentMoveSpeed * speedMult * tiltMultiplier * delta);
    }
    const time = getGlobalGameTime();
    // 779秒〜780秒の間は操作(移動)を無効化
    if (time >= 779.0 && time < 780.0) {
      _moveDir.set(0, 0, 0);
    }

    if (_moveDir.lengthSq() > 0) {
      groupRef.current.position.add(_moveDir);
    }

    // ========== フィールド境界のクランプ (半径20m) ==========
    const distSqToOrigin = groupRef.current.position.x ** 2 + groupRef.current.position.z ** 2;
    if (distSqToOrigin > 400.0) { // 20^2 = 400
      const dist = Math.sqrt(distSqToOrigin);
      groupRef.current.position.x = (groupRef.current.position.x / dist) * 20.0;
      groupRef.current.position.z = (groupRef.current.position.z / dist) * 20.0;
    }

    // ========== キング出現時のテレポート演出 (779秒〜780秒) ==========
    if (time >= 779.0 && time < 780.0) {
      const progress = time - 779.0;
      if (progress < 0.5) {
        // 779.0 ~ 779.5: 消失 (0.5秒)
        const p = progress / 0.5; // 0 -> 1
        groupRef.current.scale.setScalar(Math.max(0.001, 1.0 - p));
        if (bodyMatRef.current) bodyMatRef.current.opacity = Math.max(0, 0.4 * (1.0 - p));
      } else {
        // 779.5 ~ 780.0: 移動 & 実体化 (0.5秒)
        // 初回のみ中心へ移動
        if (groupRef.current.position.x !== 0 || groupRef.current.position.z !== 0) {
          groupRef.current.position.set(0, 0.5, 0);
        }
        const p = (progress - 0.5) / 0.5; // 0 -> 1
        groupRef.current.scale.setScalar(Math.max(0.001, p));
        if (bodyMatRef.current) bodyMatRef.current.opacity = Math.min(0.4, 0.4 * p);
      }
    } else if (time >= 780.0 && groupRef.current.scale.x < 1.0) {
      // 演出終了後のリセット保護
      groupRef.current.scale.setScalar(1.0);
      if (bodyMatRef.current) bodyMatRef.current.opacity = 0.4;
    }

    // 衝突判定クラップ
    if (window.__isKingActive && window.__kingCenter) {
      const cx = window.__kingCenter.x;
      const cz = window.__kingCenter.z;
      const dx = groupRef.current.position.x - cx;
      const dz = groupRef.current.position.z - cz;
      const distSq = dx * dx + dz * dz;
      const maxRadius = 11.5;
      const maxRadiusSq = maxRadius * maxRadius;
      if (distSq > maxRadiusSq) {
        const dist = Math.sqrt(distSq);
        groupRef.current.position.x = cx + (dx / dist) * maxRadius;
        groupRef.current.position.z = cz + (dz / dist) * maxRadius;
      }
    }
    if (window.__isQueenActive && window.__queenPosRef?.current) {
      const qp = window.__queenPosRef.current;
      if (qp.x < 90000 && groupRef.current) {
        const dx = groupRef.current.position.x - qp.x;
        const dz = groupRef.current.position.z - qp.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < 1.8) {
          const overlap = 1.8 - distance;
          const nx = dx / (distance || 0.001);
          const nz = dz / (distance || 0.001);
          groupRef.current.position.x += nx * overlap;
          groupRef.current.position.z += nz * overlap;
        }
      }
    }
    if (window.__isKingActive && window.__kingPosRefs) {
      window.__kingPosRefs.forEach(ref => {
        if (!ref?.current || !groupRef.current) return;
        const kp = ref.current;
        if (kp.x < 90000) {
          const dx = groupRef.current.position.x - kp.x;
          const dz = groupRef.current.position.z - kp.z;
          const distance = Math.sqrt(dx * dx + dz * dz);
          if (distance < 1.8) {
            const overlap = 1.8 - distance;
            const nx = dx / (distance || 0.001);
            const nz = dz / (distance || 0.001);
            groupRef.current.position.x += nx * overlap;
            groupRef.current.position.z += nz * overlap;
          }
        }
      });
    }

    // ========== 向き変更 ==========
    let aimX = 0, aimZ = 0, hasAimInput = false;

    // まず右スティックの入力をチェック
    if (gp.connected && (Math.abs(gp.rightX) > 0.1 || Math.abs(gp.rightY) > 0.1)) {
      aimX = gp.rightX; aimZ = gp.rightY; hasAimInput = true;
    }
    // 次に矢印キーの入力をチェック
    if (!hasAimInput) {
      if (pressed.has('arrowleft')) aimX -= 1;
      if (pressed.has('arrowright')) aimX += 1;
      if (pressed.has('arrowup')) aimZ -= 1;
      if (pressed.has('arrowdown')) aimZ += 1;
      if (aimX !== 0 || aimZ !== 0) hasAimInput = true;
    }

    // マウスエイム（矢印キーや右スティックの入力がない場合のみ）
    if (!hasAimInput && groupRef.current) {
      const ptr = _state.pointer;
      const dx = ptr.x - prevPointerRef.current.x;
      const dy = ptr.y - prevPointerRef.current.y;
      const moved = (dx * dx + dy * dy) > 0.0001; // 微小な揺れを無視
      prevPointerRef.current.x = ptr.x;
      prevPointerRef.current.y = ptr.y;
      if (moved) mouseAimActiveRef.current = true;

      if (mouseAimActiveRef.current) {
        // レイキャストでマウスが指す地面座標を算出
        _mouseNdc.set(ptr.x, ptr.y);
        _mouseRaycaster.setFromCamera(_mouseNdc, camera);
        const hit = _mouseRaycaster.ray.intersectPlane(_groundPlane, _mouseWorldTarget);
        if (hit) {
          const px = groupRef.current.position.x;
          const pz = groupRef.current.position.z;
          const mouseAimX = hit.x - px;
          const mouseAimZ = hit.z - pz;
          if (mouseAimX * mouseAimX + mouseAimZ * mouseAimZ > 0.01) {
            aimX = mouseAimX;
            aimZ = mouseAimZ;
            hasAimInput = true;
          }
        }
      }
    } else {
      // 矢印キー/右スティックが使用中ならマウスエイムを一時停止
      mouseAimActiveRef.current = false;
      prevPointerRef.current.x = _state.pointer.x;
      prevPointerRef.current.y = _state.pointer.y;
    }

    // シンクロモード（isSingleStick）ONかつ、上記エイム入力がない場合のみ、移動入力の方向を向く
    if (isSingleStick && !hasAimInput && _inputDir.lengthSq() > 0) {
      aimX = _inputDir.x;
      aimZ = _inputDir.z;
      hasAimInput = true;
    }

    if (hasAimInput) {
      const targetAngle = Math.atan2(aimX, aimZ);
      let diff = targetAngle - facingAngleRef.current;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      facingAngleRef.current += diff * 0.3;
    }
    groupRef.current.rotation.y = facingAngleRef.current;
    _facingDir.set(Math.sin(facingAngleRef.current), 0, Math.cos(facingAngleRef.current));

    const pos = groupRef.current.position;

    // 近接攻撃
    if (!isGuardingRef.current) {
      meleeFireTimerRef.current += delta;
      const interval = stats.meleeAttackInterval * (playerDebuffs.lightning > 0 ? 1.5 : 1.0);
      if (meleeFireTimerRef.current >= interval) {
        meleeFireTimerRef.current = 0;
        const style = stats.meleeAttackStyle;
        let actualMeleeWidth = stats.meleeWidth;
        if (style === 'slam' || style === 'sweep') actualMeleeWidth *= 0.7;

        let sx = pos.x + _facingDir.x * 0.7;
        let sy = 0.5;
        let sz = pos.z + _facingDir.z * 0.7;
        let speed = 15.0;

        if (style === 'slam') { sx = pos.x + _facingDir.x * 2.5; sz = pos.z + _facingDir.z * 2.5; sy = 0.1; speed = 0; }
        else if (style === 'sweep') {
          const rx = _facingDir.z; const rz = -_facingDir.x;
          const offset = (0.6 * actualMeleeWidth * 1.2 / 2.0) + 0.5;
          sx = pos.x + _facingDir.x * offset + rx * actualMeleeWidth * 0.8;
          sz = pos.z + _facingDir.z * offset + rz * actualMeleeWidth * 0.8;
          speed = 0;
        } else if (style === 'vertical_slash') {
          const offset = (0.6 * stats.meleeWidth * 1.5 / 2.0) + 0.5;
          sx = pos.x + _facingDir.x * offset; sz = pos.z + _facingDir.z * offset; speed = 2.0;
        } else if (style === 'punch') {
          punchHandRef.current = !punchHandRef.current;
          const sign = punchHandRef.current ? 1 : -1;
          const rx = _facingDir.z; const rz = -_facingDir.x;
          sx = pos.x + _facingDir.x * 0.5 + rx * 0.3 * sign;
          sz = pos.z + _facingDir.z * 0.5 + rz * 0.3 * sign;
        }

        const color = activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : '#e2e8f0';
        const proj: ProjectileSpawn = {
          x: sx, y: sy, z: sz, dirX: _facingDir.x, dirZ: _facingDir.z,
          damage: isBoostingRef.current ? stats.meleeAttackPower * 2 : stats.meleeAttackPower,
          critChance: (stats.critChance + (dodgeBuffTimer > 0 ? 50.0 : 0)) * (playerDebuffs.lightning > 0 ? 0.667 : 1.0),
          piercePower: 3, isMelee: true,
          maxLife: style === 'punch' ? 0.1 : (style === 'slam' ? stats.meleeRange : stats.meleeRange * 0.75),
          color, speed, targetScaleX: actualMeleeWidth, critDamage: stats.critDamage,
          attackStyle: style as any, pierceDecay: stats.meleePierceDecay, visualScale: stats.visualScale,
          isHoming: stats.isHoming, homingPower: stats.homingPower,
          hitSound: stats.meleeHitSound,
        };
        if (style === 'vertical_slash') {
          enqueueProjectile({ ...proj, itemId: 'axe_left' });
          enqueueProjectile({ ...proj, itemId: 'axe_right' });
        } else {
          enqueueProjectile(proj);
        }
      }
    }

    // 遠距離攻撃
    if (!isGuardingRef.current && (stats.rangedAttackPower > 0 && stats.projectileCount > 0)) {
      rangedFireTimerRef.current += delta;
      const interval = stats.rangedAttackInterval * (playerDebuffs.lightning > 0 ? 1.5 : 1.0);
      if (rangedFireTimerRef.current >= interval) {
        rangedFireTimerRef.current = 0;
        const count = stats.projectileCount;
        const spread = stats.spreadAngle;
        const baseAngle = Math.atan2(_facingDir.x, _facingDir.z);
        const color = activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : '#ffffff';
        for (let i = 0; i < count; i++) {
          const angle = baseAngle + (count > 1 ? (i - (count - 1) / 2) * spread : 0);
          const dx = Math.sin(angle); const dz = Math.cos(angle);
          enqueueProjectile({
            x: pos.x + dx * 0.7, y: 0.5, z: pos.z + dz * 0.7, dirX: dx, dirZ: dz,
            damage: isBoostingRef.current ? stats.rangedAttackPower * 2 : stats.rangedAttackPower,
            critChance: (stats.critChance + (dodgeBuffTimer > 0 ? 50.0 : 0)) * (playerDebuffs.lightning > 0 ? 0.667 : 1.0),
            piercePower: stats.piercePower, isMelee: false, maxLife: stats.projectileLife,
            color, speed: stats.projectileSpeed, targetScaleX: 1.0, critDamage: stats.critDamage,
            attackStyle: stats.rangedAttackStyle as any, pierceDecay: stats.rangedPierceDecay,
            visualScale: stats.visualScale, isHoming: stats.isHoming, homingPower: stats.homingPower,
            hitSound: stats.rangedHitSound,
          });
        }
      }
    }

    // ========== 敵との接触ダメージ判定 (ジャスト回避込) ==========
    let isBarrierHit = false;
    const px = groupRef.current.position.x;
    const pz = groupRef.current.position.z;
    const eCount = getEnemyCount();
    const ePositions = getEnemyPositions();
    const BARRIER_RADIUS_SQ = 1.2 * 1.2;

    for (let i = 0; i < eCount; i++) {
      if (!isEnemyAlive(i)) continue;
      const dx = px - ePositions[i * 2];
      const dz = pz - ePositions[i * 2 + 1];
      const dSq = dx * dx + dz * dz;

      if (isGuardingRef.current) {
        if (dSq < BARRIER_RADIUS_SQ) isBarrierHit = true;
      } else if (dSq <= CONTACT_RADIUS_SQ) {
        const wasInv = isPlayerInvincible();
        // パリィ判定
        if (!wasInv) {
          const s = playerStatsRef.current;
          if (Math.random() * 100 < s.evasion * (playerDebuffs.ice > 0 ? 0.667 : 1.0)) {
            triggerInvincibility();
            triggerDodgeBuff(2.5);
            addShifukuBuff(50);
            spawnDamagePopup(0, 2.5, 2.0, 'Parry!', 0, '#FFFFFF', '#0099ff', -1.5, true);
            dodgeVisualTimerRef.current = 0.2;
            for (let j = 0; j < eCount; j++) {
              if (!isEnemyAlive(j)) continue;
              const ddx = ePositions[j * 2] - px; const ddz = ePositions[j * 2 + 1] - pz;
              const ddSq = ddx * ddx + ddz * ddz;
              if (ddSq <= DODGE_REPEL_RADIUS_SQ && ddSq > 0.001) {
                const dist = Math.sqrt(ddSq); applyKnockback(j, ddx / dist, ddz / dist, DODGE_REPEL_FORCE);
              }
            }
            break;
          }
        }
        // ダメージ適用
        const baseDmg = getEnemyBaseDamage();
        let finalDmg = Math.max(1, baseDmg - playerStatsRef.current.defense);
        const d = getEnemyDebuff(i);
        if (d.lightningSlowRate > 0) finalDmg *= Math.max(0.1, 1.0 - d.lightningSlowRate);
        const t = getEnemyType(i); if (t === 1 || t === 2) finalDmg *= 2;
        if (isBoostingRef.current) finalDmg *= 2;

        // ダメージ適用
        const result = damagePlayer(finalDmg);
        if (result === 'dead') onPlayerDeath?.();
        
        if (result === 'damaged' || result === 'dead') {
          flashTimerRef.current = 0.5;
          flashColorRef.current = '#ff0000'; // 被弾は赤
          spawnDamagePopup(0, 2.5, 2.0, finalDmg, 0, '#FFFFFF', '#FF0000', -1.5, true);
        }
        break;
      }
    }

    if (isGuardingRef.current) {
      if (!drainGuardStamina((isBarrierHit ? 25.0 : 12.5) * delta)) isGuardingRef.current = false;
    }
    if (barrierMeshRef.current) barrierMeshRef.current.visible = isGuardingRef.current;
    if (isBoostingRef.current) {
      if (!drainStamina(25.0 * delta)) isBoostingRef.current = false;
    }
    if (boostAuraRef.current) boostAuraRef.current.visible = isBoostingRef.current;

    if (dodgeVisualTimerRef.current > 0) {
      dodgeVisualTimerRef.current -= delta;
      if (dodgeAuraRef.current) {
        const p = (0.2 - dodgeVisualTimerRef.current) / 0.2;
        const s = 1.0 + p * 1.5;
        dodgeAuraRef.current.scale.set(s, s, 1);
        (dodgeAuraRef.current.material as MSM).opacity = 1.0 - p;
        dodgeAuraRef.current.visible = true;
      }
    } else if (dodgeAuraRef.current) dodgeAuraRef.current.visible = false;

    if (megaCrushVisualTimerRef.current > 0) {
      megaCrushVisualTimerRef.current -= delta;
      if (megaCrushAuraRef.current) {
        const p = (0.2 - megaCrushVisualTimerRef.current) / 0.2;
        const s = 1.0 + p * 14.0;
        megaCrushAuraRef.current.scale.set(s, s, 1);
        (megaCrushAuraRef.current.material as MSM).opacity = 1.0 - p;
        megaCrushAuraRef.current.visible = true;
      }
    } else if (megaCrushAuraRef.current) megaCrushAuraRef.current.visible = false;

    // プチメガクラッシュリングエフェクト
    if (petitCrushVisualTimerRef.current > 0) {
      petitCrushVisualTimerRef.current -= delta;
      if (petitCrushAuraRef.current) {
        const p = (0.3 - petitCrushVisualTimerRef.current) / 0.3;
        const s = 0.5 + p * 2.5; // 0.5 -> 3.0
        petitCrushAuraRef.current.scale.set(s, s, 1);
        (petitCrushAuraRef.current.material as MSM).opacity = 1.0 - p;
        petitCrushAuraRef.current.visible = true;
      }
    } else if (petitCrushAuraRef.current) petitCrushAuraRef.current.visible = false;

    // バリアクールタイムエフェクト (赤い収縮リング)
    if (barrierCooldownTimerRef.current > 0) {
      barrierCooldownTimerRef.current -= delta;
      if (cooldownAuraRef.current) {
        const p = barrierCooldownTimerRef.current / 1.0; // 1.0 -> 0
        const s = 0.5 + p * 0.7; // 1.2 -> 0.5
        cooldownAuraRef.current.scale.set(s, s, 1);
        (cooldownAuraRef.current.material as MSM).opacity = p * 0.6;
        cooldownAuraRef.current.visible = true;
      }
    } else if (cooldownAuraRef.current) cooldownAuraRef.current.visible = false;

    playerPosRef.x = groupRef.current.position.x;
    playerPosRef.y = groupRef.current.position.y;
    playerPosRef.z = groupRef.current.position.z;
    onPositionUpdate?.(groupRef.current.position);

    // スキン毎のアニメーション制御
    if (visualGroupRef.current) {
      const time = _state.clock.getElapsedTime();
      if (skinSetting === 'sphere') {
        visualGroupRef.current.position.y = Math.sin(time * 3.5) * 0.12;
        visualGroupRef.current.rotation.y = 0;
        if (ring1Ref.current) ring1Ref.current.rotation.x = time * 1.5;
        if (ring2Ref.current) ring2Ref.current.rotation.z = time * 1.0;
      } else if (skinSetting === 'crystal') {
        visualGroupRef.current.position.y = Math.sin(time * 1.8) * 0.08;
        visualGroupRef.current.rotation.y = time * 0.3; // 神秘的な自動回転
      } else if (skinSetting === 'satellite') {
        visualGroupRef.current.position.y = Math.sin(time * 2.5) * 0.06;
        visualGroupRef.current.rotation.y = 0;
        
        // 衛星キューブ 4点の公転・自転
        const r = 0.8;
        const speed = 2.0;
        if (sat1Ref.current) {
          sat1Ref.current.position.set(Math.cos(time * speed) * r, 0, Math.sin(time * speed) * r);
          sat1Ref.current.rotation.y = time * 2.0;
        }
        if (sat2Ref.current) {
          sat2Ref.current.position.set(Math.cos(time * speed + Math.PI / 2) * r, Math.sin(time * 3) * 0.12, Math.sin(time * speed + Math.PI / 2) * r);
          sat2Ref.current.rotation.x = time * 1.5;
        }
        if (sat3Ref.current) {
          sat3Ref.current.position.set(Math.cos(time * speed + Math.PI) * r, 0, Math.sin(time * speed + Math.PI) * r);
          sat3Ref.current.rotation.y = -time * 2.0;
        }
        if (sat4Ref.current) {
          sat4Ref.current.position.set(Math.cos(time * speed + Math.PI * 1.5) * r, Math.sin(time * 3 + Math.PI) * 0.12, Math.sin(time * speed + Math.PI * 1.5) * r);
          sat4Ref.current.rotation.z = time * 1.5;
        }
      } else {
        // default / armor
        visualGroupRef.current.position.y = 0;
        visualGroupRef.current.rotation.y = 0;
      }
    }
  });

  const ratio = maxHp > 0 ? hp / maxHp : 0;
  const barColor = ratio > 0.5 ? '#4caf50' : ratio > 0.25 ? '#ff9800' : '#f44336';
  const coreColor = activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : '#ffffff';

  return (
    <group ref={groupRef} position={[0, 0.5, 0]}>
      {!(isGameOver || isPaused || isInventoryOpen) && (
        <Html position={[0, 2.5, 0]} center pointerEvents="none" zIndexRange={[0, 50]}>
          <div style={{ width: '96px' }}>
            <div style={{ width: '100%', height: '10px', background: 'rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.2)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${ratio * 100}%`, height: '100%', background: barColor, transition: 'width 0.15s ease-out' }} />
            </div>
            <div style={{ width: '96px', height: '4px', background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden', marginTop: '2px' }}>
              <div ref={dashBarRef} style={{ width: '100%', height: '100%', backgroundColor: '#FFD700' }} />
            </div>
            {/* ミニOBゲージ */}
            <div ref={obBarContainerRef} style={{ width: '96px', height: '4px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden', marginTop: '2px', opacity: 0, transition: 'opacity 0.2s' }}>
              <div ref={obBarRef} style={{ width: '0%', height: '100%', backgroundColor: '#7fbfff', transition: 'width 0.1s ease-out' }} />
            </div>
            {/* ミニARゲージ */}
            <div ref={arBarContainerRef} style={{ width: '96px', height: '4px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden', marginTop: '2px', opacity: 0, transition: 'opacity 0.2s' }}>
              <div ref={arBarRef} style={{ width: '0%', height: '100%', backgroundColor: '#bf7fff', transition: 'width 0.1s ease-out' }} />
            </div>
            <div ref={debuffContainerRef} style={{ display: 'flex', justifyContent: 'center', marginTop: '6px', minHeight: '16px', width: '160px', marginLeft: '-32px', fontFamily: 'monospace', fontSize: '14px' }} />
          </div>
        </Html>
      )}
      {/* プレイヤースキン毎の描画処理（当たり判定やステータスには一切干渉しない） */}
      <group ref={visualGroupRef}>
        {/* 中央の白いコアキューブ：すべてのスキンで共通に描画される（エンチャントに応じて輝く） */}
        <mesh castShadow>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color={coreColor} emissive={coreColor} emissiveIntensity={2.0} toneMapped={false} />
        </mesh>

        {/* 1. プロトタイプスキン */}
        {skinSetting === 'default' && (
          <>
            <mesh castShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial ref={bodyMatRef} color="#7c4dff" emissive="#4a148c" emissiveIntensity={0.3} roughness={0.4} metalness={0.6} transparent opacity={0.4} />
            </mesh>
            <mesh position={[0, 0.1, 0.65]} castShadow>
              <boxGeometry args={[0.2, 0.2, 0.5]} />
              <meshStandardMaterial color="#b388ff" emissive="#7c4dff" emissiveIntensity={0.6} roughness={0.3} metalness={0.7} transparent opacity={0.4} />
            </mesh>
            <mesh position={[-0.2, 0.2, 0.51]}><sphereGeometry args={[0.1, 8, 6]} /><meshStandardMaterial color="#e0ff00" emissive="#e0ff00" emissiveIntensity={1.5} toneMapped={false} /></mesh>
            <mesh position={[0.2, 0.2, 0.51]}><sphereGeometry args={[0.1, 8, 6]} /><meshStandardMaterial color="#e0ff00" emissive="#e0ff00" emissiveIntensity={1.5} toneMapped={false} /></mesh>
          </>
        )}

        {/* 2. サイバー・スフィアスキン */}
        {skinSetting === 'sphere' && (
          <>
            {/* 球体型アウター */}
            <mesh castShadow>
              <sphereGeometry args={[0.55, 32, 32]} />
              <meshStandardMaterial color="#00e5ff" emissive="#006064" emissiveIntensity={0.4} roughness={0.2} metalness={0.8} transparent opacity={0.4} />
            </mesh>
            {/* ジャイロリング1 */}
            <mesh ref={ring1Ref} castShadow>
              <torusGeometry args={[0.7, 0.03, 8, 48]} />
              <meshStandardMaterial color="#00ffff" emissive="#00ffff" emissiveIntensity={1.2} toneMapped={false} />
            </mesh>
            {/* ジャイロリング2 */}
            <mesh ref={ring2Ref} castShadow rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.75, 0.03, 8, 48]} />
              <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={1.2} toneMapped={false} />
            </mesh>
          </>
        )}

        {/* 3. ネオ・クリスタルスキン */}
        {skinSetting === 'crystal' && (
          <>
            {/* 八面体クリスタルアウター */}
            <mesh castShadow>
              <octahedronGeometry args={[0.62, 0]} />
              <meshStandardMaterial color="#b388ff" emissive="#4a148c" emissiveIntensity={0.5} roughness={0.1} metalness={0.9} transparent opacity={0.35} />
            </mesh>
            {/* 上部クリスタル */}
            <mesh position={[0, 0.75, 0]} castShadow scale={[0.3, 0.6, 0.3]} rotation={[0, 0, 0]}>
              <octahedronGeometry args={[0.5, 0]} />
              <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={1.0} toneMapped={false} />
            </mesh>
            {/* 下部クリスタル */}
            <mesh position={[0, -0.75, 0]} castShadow scale={[0.3, 0.6, 0.3]} rotation={[0, 0, 0]}>
              <octahedronGeometry args={[0.5, 0]} />
              <meshStandardMaterial color="#ff00ff" emissive="#ff00ff" emissiveIntensity={1.0} toneMapped={false} />
            </mesh>
          </>
        )}

        {/* 4. ガーディアン・アーマースキン */}
        {skinSetting === 'armor' && (
          <>
            {/* 左装甲プレート */}
            <mesh position={[-0.55, 0, 0]} castShadow>
              <boxGeometry args={[0.12, 0.9, 0.9]} />
              <meshStandardMaterial color="#78909c" emissive="#263238" emissiveIntensity={0.2} roughness={0.5} metalness={0.7} />
            </mesh>
            {/* 右装甲プレート */}
            <mesh position={[0.55, 0, 0]} castShadow>
              <boxGeometry args={[0.12, 0.9, 0.9]} />
              <meshStandardMaterial color="#78909c" emissive="#263238" emissiveIntensity={0.2} roughness={0.5} metalness={0.7} />
            </mesh>
            {/* 上装甲プレート */}
            <mesh position={[0, 0.55, 0]} castShadow>
              <boxGeometry args={[0.9, 0.12, 0.9]} />
              <meshStandardMaterial color="#78909c" emissive="#263238" emissiveIntensity={0.2} roughness={0.5} metalness={0.7} />
            </mesh>
            {/* 下装甲プレート */}
            <mesh position={[0, -0.55, 0]} castShadow>
              <boxGeometry args={[0.9, 0.12, 0.9]} />
              <meshStandardMaterial color="#78909c" emissive="#263238" emissiveIntensity={0.2} roughness={0.5} metalness={0.7} />
            </mesh>
            {/* ヘビーバイザー */}
            <mesh position={[0, 0.15, 0.55]} castShadow>
              <boxGeometry args={[0.6, 0.15, 0.1]} />
              <meshStandardMaterial color="#ff3d00" emissive="#ff3d00" emissiveIntensity={1.5} toneMapped={false} />
            </mesh>
          </>
        )}

        {/* 5. サテライト・エナジースキン */}
        {skinSetting === 'satellite' && (
          <>
            {/* アウターボディアシストコア */}
            <mesh castShadow>
              <boxGeometry args={[0.7, 0.7, 0.7]} />
              <meshStandardMaterial color="#e9d5ff" emissive="#c084fc" emissiveIntensity={0.3} roughness={0.3} metalness={0.8} transparent opacity={0.3} />
            </mesh>
            {/* 衛星キューブ 4点 */}
            <mesh ref={sat1Ref} castShadow>
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshStandardMaterial color="#ffeb3b" emissive="#ffc107" emissiveIntensity={1.0} toneMapped={false} />
            </mesh>
            <mesh ref={sat2Ref} castShadow>
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshStandardMaterial color="#ffeb3b" emissive="#ffc107" emissiveIntensity={1.0} toneMapped={false} />
            </mesh>
            <mesh ref={sat3Ref} castShadow>
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshStandardMaterial color="#ffeb3b" emissive="#ffc107" emissiveIntensity={1.0} toneMapped={false} />
            </mesh>
            <mesh ref={sat4Ref} castShadow>
              <boxGeometry args={[0.2, 0.2, 0.2]} />
              <meshStandardMaterial color="#ffeb3b" emissive="#ffc107" emissiveIntensity={1.0} toneMapped={false} />
            </mesh>
          </>
        )}
      </group>
      <mesh ref={barrierMeshRef} visible={false}><sphereGeometry args={[1.2, 16, 16]} /><meshStandardMaterial color="#00ffff" transparent opacity={0.3} depthWrite={false} emissive="#00ffff" emissiveIntensity={0.5} /></mesh>
      <mesh ref={boostAuraRef} visible={false} position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.8, 1.2, 32]} /><meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={2.0} transparent opacity={0.8} side={2} /></mesh>
      <mesh ref={dodgeAuraRef} visible={false} position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.5, 0.65, 32]} /><meshStandardMaterial color="#00FFFF" emissive="#00FFFF" emissiveIntensity={4.0} transparent opacity={1.0} side={2} /></mesh>
      <mesh ref={megaCrushAuraRef} visible={false} position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.45, 0.5, 64]} /><meshStandardMaterial color="#00FFFF" emissive="#00FFFF" emissiveIntensity={8.0} transparent opacity={1.0} side={2} /></mesh>
      <mesh ref={petitCrushAuraRef} visible={false} position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.4, 0.55, 32]} /><meshStandardMaterial color="#7fbfff" emissive="#7fbfff" emissiveIntensity={6.0} transparent opacity={1.0} side={2} /></mesh>
      <mesh ref={cooldownAuraRef} visible={false} position={[0, -0.4, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1.1, 1.2, 32]} /><meshStandardMaterial color="#ff4444" emissive="#ff0000" emissiveIntensity={1.0} transparent opacity={0.6} side={2} /></mesh>
    </group>
  );
});
