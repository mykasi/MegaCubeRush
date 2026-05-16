import { useRef, useEffect, memo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { InstancedMesh as InstancedMeshType } from 'three';
import { Object3D, Color, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import {
  registerEnemies,
  updateEnemyPos,
  isEnemyAlive,
  findInactiveSlot,
  respawnEnemy,
  resetAllEnemies,
  getEnemiesInRadius,
  damageEnemy,
  getEnemyPositions,
  isPlayerGuarding,
  getEnemyDebuff,
  applyDoT,
  setGlobalGameTime,
  getEnemyType,
  getEnemyCount,
  consumeKnockback,
  spawnEnemyProjectile,
  getEnemyBaseDamage,
  rebuildGrid,
  tickDebuffDurations,
} from '../game/collisionBus';
import { onMagicEmit } from '../game/magicBus';
import { spawnDamagePopup } from './DamagePopups';
import { getComboBonus } from '../game/comboBus';


/**
 * InstancedMesh + オブジェクトプール方式の敵管理
 * - poolSize 分のスロットを事前確保
 * - スポナーが一定間隔で非アクティブスロットを再配置
 * - 敵はプレイヤーに向かって追尾移動
 */

interface EnemyInstanceData {
  /** ワールド座標 X */
  x: number;
  /** ワールド座標 Z */
  z: number;
  /** 移動速度 */
  speed: number;
  /** アニメ用フェーズ */
  phase: number;
  /** 追加: 炎DoT用の個別タイマー */
  fireTimer: number;
  /** 追加: 氷魔法用の個別タイマー */
  iceTimer: number;
  /** 追加: 敵のタイプ (0: Pawn, 1: Knight, 2: Rook, 3: Bishop) */
  type: number;
  /** 追加: 遠隔攻撃等のサイクルタイマー */
  shotTimer: number;
  /** 追加: スポーン時刻（実体化アニメーション用） */
  spawnTime: number;
}

interface InstancedEnemiesProps {
  poolSize?: number;
  isGameOver?: boolean;
  isPaused?: boolean;
}

const _dummy = new Object3D();
const _color = new Color();
const _mat = new Matrix4();
const _quat = new Quaternion();
const _vec = new Vector3();
const _scaleVec = new Vector3();

// 敵タイプ別のカラー定義 (ドラクエテーマ)
const colorNormal = new Color('#3399ff'); // ノーマル：水色 (DQスライム色)
const colorSwarm = new Color('#c0c0c0');  // スウォーム：銀色 (DQメタルスライム色)
const colorTank = new Color('#ffd700');   // タンク：金色 (DQゴールデンスライム色)
const colorBishop = new Color('#c2185b'); // ビショップ：紫がかった赤

/** スポーン距離の範囲（プレイヤーから何ユニット離れた場所に湧くか） */
const SPAWN_DIST_MIN = 18;
const SPAWN_DIST_MAX = 28;

/** 初期スポーン数（ゲーム開始直後） */
const INITIAL_SPAWN_COUNT = 15;

interface LightningEffect {
  id: number;
  pos: [number, number, number];
  life: number;
}

interface IceFieldEffect {
  id: number;
  pos: [number, number, number];
  life: number;
  maxLife: number;
  radius: number;
  damage: number;
  damageTimer: number;
  critChance: number;
  critDamage: number;
}

export const InstancedEnemies = memo(function InstancedEnemies({
  poolSize = 2000,
  isGameOver = false,
  isPaused = false,
}: InstancedEnemiesProps) {
  const { scene } = useThree();
  const normalBgRef = useRef(new Color('#06060f'));
  const killBgRef = useRef(new Color());
  const meshRef = useRef<InstancedMeshType>(null);

  // 全スロット分のデータ配列
  const enemiesRef = useRef<EnemyInstanceData[]>([]);
  const spawnTimerRef = useRef(0);
  const initialSpawnDoneRef = useRef(false);
  const gameTimeRef = useRef(0); // 累積ゲーム時間

  // 魔法エフェクト管理
  const [lightningEffects, setLightningEffects] = useState<LightningEffect[]>([]);
  const [fireEffects, setFireEffects] = useState<{ id: number, pos: [number, number, number], life: number }[]>([]);
  const [iceFields, setIceFields] = useState<IceFieldEffect[]>([]);
  const [warpEffects, setWarpEffects] = useState<{ 
    id: number; 
    pos: [number, number, number]; 
    rotation: [number, number, number, number];
    color: string;
    life: number; 
  }[]>([]);
  const nextEffectIdRef = useRef(0);
  const warpFlags = useRef({ wave11: false, wave14: false });

  useEffect(() => {
    const unsub = onMagicEmit((event) => {
      if (event.type === 'thunder') {
        const { position, radius } = event;

        const hitIndices: number[] = [];
        getEnemiesInRadius(position[0], position[2], radius, hitIndices);
        const ePositions = getEnemyPositions();

        hitIndices.forEach((idx) => {
          if (!isEnemyAlive(idx)) return; // 「生きている敵にのみ」ヒット処理

          const offset = idx * 2;
          const ex = ePositions[offset];
          const ez = ePositions[offset + 1];
          const dx = ex - position[0];
          const dz = ez - position[2];
          const distSq = dx * dx + dz * dz;
          if (distSq > radius * radius) return; // 厳密な円形判定

          const dist = Math.sqrt(distSq);
          // 中心(雷柱, 0.5m以内)なら100%、それ以外(爆風)は70%
          const multiplier = dist <= 0.5 ? 1.0 : 0.7;
          const baseDamage = event.damage * multiplier;

          const guaranteedDamage = Math.max(1, baseDamage); // 最低1保証

          let critType = 0;
          if (event.critChance > 100) {
            critType = 1;
            if (Math.random() * 100 < (event.critChance - 100)) critType = 2;
          } else if (Math.random() * 100 < event.critChance) {
            critType = 1;
          }

          const mult = critType === 2 ? (event.critDamage / 100) + 1.0 : critType === 1 ? (event.critDamage / 100) : 1.0;
          const finalDamage = guaranteedDamage * mult;

          damageEnemy(idx, finalDamage, false, false, true, 'magic_thunder_hit');
          // 雷魔法: 文字 #FFD700, 縁 #000000 (黒)
          spawnDamagePopup(ex, 1.2, ez, finalDamage, critType, '#FFD700', '#000000');
        });

        const id = nextEffectIdRef.current++;
        setLightningEffects((prev: LightningEffect[]) => [...prev, { id, pos: position, life: 0.3 }]);
      } else if (event.type === 'fire_explosion') {
        const { position, damage, radius } = event;
        const hitIndices: number[] = [];
        getEnemiesInRadius(position[0], position[2], radius, hitIndices);
        const ePositions = getEnemyPositions();

        hitIndices.forEach((idx) => {
          if (!isEnemyAlive(idx)) return; // 「生きている敵にのみ」ヒット処理

          const offset = idx * 2;
          const ex = ePositions[offset];
          const ez = ePositions[offset + 1];
          const dx = ex - position[0];
          const dz = ez - position[2];
          const distSq = dx * dx + dz * dz;
          if (distSq > radius * radius) return; // 厳密な円形判定

          const dist = Math.sqrt(distSq);
          // 距離減衰: 中心100%、端50% (10%ずつ減衰 = 6段階)
          const fraction = Math.min(1.0, dist / radius);
          const step = Math.floor(fraction * 5.99); // 0〜5
          const multiplier = 1.0 - (step * 0.1); // 1.0〜0.5
          const baseDamage = damage * multiplier;

          const guaranteedDamage = Math.max(1, baseDamage); // 最低1保証

          let critType = 0;
          if (event.critChance > 100) {
            critType = 1;
            if (Math.random() * 100 < (event.critChance - 100)) critType = 2;
          } else if (Math.random() * 100 < event.critChance) {
            critType = 1;
          }

          const mult = critType === 2 ? (event.critDamage / 100) + 1.0 : critType === 1 ? (event.critDamage / 100) : 1.0;
          const finalDamage = guaranteedDamage * mult;

          damageEnemy(idx, finalDamage, false, false, true, 'magic_fire_hit');
          // 炎魔法: 文字 #FF4500, 縁 #000000 (黒)
          spawnDamagePopup(ex, 1.2, ez, finalDamage, critType, '#FF4500', '#000000');
        });

        const id = nextEffectIdRef.current++;
        setFireEffects(prev => [...prev, { id, pos: position, life: 0.3 }]);
      } else if (event.type === 'ice_field') {
        const id = nextEffectIdRef.current++;
        setIceFields((prev) => [...prev, {
          id, pos: event.position, life: event.duration, maxLife: event.duration,
          radius: event.radius, damage: event.damage, damageTimer: 0,
          critChance: event.critChance, critDamage: event.critDamage
        }]);
      }
    });
    return unsub;
  }, []);
  useEffect(() => {
    const enemies: EnemyInstanceData[] = [];
    for (let i = 0; i < poolSize; i++) {
      enemies.push({
        x: 0,
        z: 0,
        speed: MathUtils.randFloat(1.5, 3.0),
        phase: MathUtils.randFloat(0, Math.PI * 2),
        fireTimer: Math.random() * 1.0,
        iceTimer: Math.random() * 1.0,
        type: 0,
        shotTimer: 0,
        spawnTime: 0,
      });
    }
    enemiesRef.current = enemies;
    registerEnemies(poolSize);

    if (meshRef.current) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      for (let i = 0; i < poolSize; i++) {
        meshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [poolSize]);

  const hasInitializedRef = useRef(false);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    
    // 初回のみ：全インスタンスを確実に画面外へ飛ばす
    if (!hasInitializedRef.current) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      for (let i = 0; i < poolSize; i++) {
        meshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      hasInitializedRef.current = true;
    }

    if (isGameOver || isPaused) return;

    // デバッグ：強制的時間ワープ判定
    if ((window as any).__debugJumpTime !== undefined) {
      const targetTime = (window as any).__debugJumpTime;
      gameTimeRef.current = targetTime;
      // フラグを現在の時間に応じてリセット（ジャンプ後の整合性を保つ）
      warpFlags.current.wave11 = targetTime >= 595;
      warpFlags.current.wave14 = targetTime >= 775;
      // 削除して1回のみ適用
      delete (window as any).__debugJumpTime;
    }

    // 累積ゲーム時間の更新
    gameTimeRef.current += delta;
    const time = gameTimeRef.current;

    // グローバル時間（敵HP・攻撃力計算用）の同期
    setGlobalGameTime(time);
    tickDebuffDurations(delta);

    // リスタート検知：グローバル時間が0付近にリセットされたら内部Refもリセットする
    if (time < delta && initialSpawnDoneRef.current) {
        initialSpawnDoneRef.current = false;
        spawnTimerRef.current = 0;
    }

    // プレイヤー座標取得
    let playerX = 0;
    let playerZ = 0;
    if (window.__playerPosRef) {
      playerX = window.__playerPosRef.current.x;
      playerZ = window.__playerPosRef.current.z;
    }

    const enemies = enemiesRef.current;

    // ========== スポナー ==========
    // キング戦中はOCレベル分の雑魚のみ湧かせる
    let kingSpawnBlocked = false;
    if (window.__isKingActive) {
      const ocLevel = window.__systemUpgrades?.overload || 0;
      if (ocLevel <= 0) {
        kingSpawnBlocked = true;
      } else {
        // ボスや盾(Type 4以上)以外の通常雑魚をカウント
        let activeMobs = 0;
        const eCount = getEnemyCount();
        for (let i = 0; i < eCount; i++) {
          if (isEnemyAlive(i) && getEnemyType(i) < 4) activeMobs++;
        }
        if (activeMobs >= ocLevel) kingSpawnBlocked = true;
      }
    }

    if (!kingSpawnBlocked) {
      if (!isGameOver) {
        // 初回スポーン
        if (!initialSpawnDoneRef.current) {
          const slotCheck = findInactiveSlot();
          if (slotCheck !== -1) {
            initialSpawnDoneRef.current = true;
            for (let s = 0; s < INITIAL_SPAWN_COUNT; s++) {
            const slot = findInactiveSlot();
            if (slot < 0) break;
            
            let sx = 0, sz = 0;
            for (let attempts = 0; attempts < 10; attempts++) {
              const angle = Math.random() * Math.PI * 2;
              const dist = Math.random() * 19.0;
              sx = Math.cos(angle) * dist;
              sz = Math.sin(angle) * dist;
              const distToPlayerSq = (sx - playerX) ** 2 + (sz - playerZ) ** 2;
              if (distToPlayerSq >= 9.0) break; // 3m以上離れているか
            }
            
            respawnEnemy(slot, sx, sz, time, 0);
            enemies[slot].x = sx;
            enemies[slot].z = sz;
            enemies[slot].type = 0;
            enemies[slot].speed = MathUtils.randFloat(1.5, 2.0);
            enemies[slot].phase = Math.random() * Math.PI * 2;
            enemies[slot].fireTimer = Math.random() * 1.0;
            enemies[slot].iceTimer = Math.random() * 1.0;
            enemies[slot].shotTimer = Math.random() * 2.0;
            enemies[slot].spawnTime = time;
          }
        }
      }

      // 通常スポーン（1秒ごと）
        const comboBonus = getComboBonus();
        spawnTimerRef.current += delta * (1.0 + comboBonus);
        if (spawnTimerRef.current >= 1.0) {
          spawnTimerRef.current -= 1.0;

            const minutes = Math.floor(time / 60);
            const secondsInMinute = time % 60;
            const wave = Math.min(minutes + 1, 14);

            if (secondsInMinute < 50.0) {
            const baseRate = 3;
            const overloadPlus = window.__systemUpgrades?.overload || 0;
            let spawnCount = baseRate + minutes + overloadPlus;

            const isBossWave = (minutes === 10 && !window.__isQueenDefeated) || (minutes >= 13 && !window.__isGameClear);
            if (isBossWave) {
              spawnCount = overloadPlus;
            }
            // キング戦中はOCレベル分のみ (上のガードで既にフィルタ済み)
            if (window.__isKingActive) {
              spawnCount = Math.min(spawnCount, 1); // 1体ずつ湧かせる
            }

            for (let s = 0; s < spawnCount; s++) {
              const slot = findInactiveSlot();
              if (slot < 0) break; 

              let sx = 0, sz = 0;
              for (let attempts = 0; attempts < 10; attempts++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 19.0;
                sx = Math.cos(angle) * dist;
                sz = Math.sin(angle) * dist;
                const distToPlayerSq = (sx - playerX) ** 2 + (sz - playerZ) ** 2;
                if (distToPlayerSq >= 9.0) break; // 3m以上離れているか
              }

              let spawnType = 0;
              let speed = 1.0;
              const rand = Math.random();

              // --- 1. 出現割合の決定 ---
              if (wave === 1 || wave === 2) {
                spawnType = 0;
              } else if (wave === 3) {
                if (rand < 0.06) spawnType = 1; else spawnType = 0;
              } else if (wave === 4) {
                if (rand < 0.12) spawnType = 1; else spawnType = 0;
              } else if (wave === 5) {
                if (rand < 0.06) spawnType = 2; else spawnType = 0;
              } else if (wave === 6) {
                if (rand < 0.12) spawnType = 2; else spawnType = 0;
              } else if (wave === 7) {
                if (rand < 0.06) spawnType = 3; else spawnType = 0;
              } else if (wave === 8) {
                if (rand < 0.12) spawnType = 3; else spawnType = 0;
              } else if (wave === 9) {
                if (rand < 0.06) spawnType = 1;
                else if (rand < 0.12) spawnType = 2;
                else if (rand < 0.18) spawnType = 3;
                else spawnType = 0;
              } else if (wave === 10) {
                if (rand < 0.08) spawnType = 1;
                else if (rand < 0.16) spawnType = 2;
                else if (rand < 0.24) spawnType = 3;
                else spawnType = 0;
              } else if (wave === 11 || wave === 12) {
                if (rand < 0.10) spawnType = 1;
                else if (rand < 0.20) spawnType = 2;
                else if (rand < 0.30) spawnType = 3;
                else spawnType = 0;
              } else if (wave >= 13) {
                // Wave 13 & 14
                if (rand < 0.12) spawnType = 1;
                else if (rand < 0.24) spawnType = 2;
                else if (rand < 0.36) spawnType = 3;
                else spawnType = 0;
              }

              // --- 2. 速度の決定 ---
              if (spawnType === 0) {
                // ポーンの速度
                if (wave === 1) speed = 1.5 + Math.random() * 0.5;        // 1.5〜2.0
                else if (wave <= 8) speed = 1.5 + Math.random() * 1.0;    // 1.5〜2.5
                else speed = 1.5 + Math.random() * 1.5;                   // 1.5〜3.0
              } else if (spawnType === 1) {
                // ナイトの速度
                if (wave <= 3) speed = 3.0 + Math.random() * 1.0;         // 3.0〜4.0
                else if (wave <= 8) speed = 3.0 + Math.random() * 2.0;    // 3.0〜5.0 (Wave 4)
                else speed = 3.0 + Math.random() * 3.0;                   // 3.0〜6.0 (Wave 9以降)
              } else if (spawnType === 2) {
                // ルークの速度
                if (wave <= 5) speed = 0.9 + Math.random() * 0.3;         // 0.9〜1.2
                else if (wave <= 8) speed = 0.9 + Math.random() * 0.6;    // 0.9〜1.5 (Wave 6)
                else speed = 0.9 + Math.random() * 0.9;                   // 0.9〜1.8 (Wave 9以降)
              } else if (spawnType === 3) {
                // ビショップの速度
                if (wave <= 7) speed = 1.8 + Math.random() * 0.6;         // 1.8〜2.4
                else if (wave === 8) speed = 1.8 + Math.random() * 1.2;   // 1.8〜3.0
                else speed = 1.8 + Math.random() * 1.8;                   // 1.8〜3.6 (Wave 9以降)
              }

              respawnEnemy(slot, sx, sz, time, spawnType);
              enemies[slot].x = sx;
              enemies[slot].z = sz;
              enemies[slot].type = spawnType;
              enemies[slot].speed = speed;
              enemies[slot].phase = Math.random() * Math.PI * 2;
              enemies[slot].fireTimer = Math.random() * 1.0;
              enemies[slot].iceTimer = Math.random() * 1.0;
              enemies[slot].shotTimer = Math.random() * 2.0;
              enemies[slot].spawnTime = time;

              if (spawnType === 0) _color.set('#7c4dff');
              else if (spawnType === 1) _color.set('#ffeb3b');
              else if (spawnType === 2) _color.set('#b71c1c');
              else if (spawnType === 3) _color.set(colorBishop);
              meshRef.current.setColorAt(slot, _color);
            }
          }
        }
      }
    }

    // ========== 描画更新 ==========
    // ========== 描画更新 ==========
    for (let i = 0; i < poolSize; i++) {
      const eType = getEnemyType(i);
      // Type 4以上（ボス、キングコア、盾など）はInstancedMeshで描画しない
      if (eType >= 4) continue;

      if (!isEnemyAlive(i)) {
        // 非アクティブ: 画面外に退避
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      const debuff = getEnemyDebuff(i);

      // --- DoT (炎スリップ) 処理の統合 (個別Tick方式) ---
      if (!isGameOver && debuff.fireSlipDps > 0) {
        const e = enemies[i];
        e.fireTimer += delta;

        if (e.fireTimer >= 1.0) {
          e.fireTimer -= 1.0; // タイマーリセット

          // 1秒分のダメージを一括で与える（Tick方式）最低1保証
          const guaranteedDamage = Math.max(1, debuff.fireSlipDps);
          const killedByDot = applyDoT(i, guaranteedDamage);

          // 炎エンチャント追撃: 文字 #FF4500, 縁 #FFFFFF (白に復元)
          spawnDamagePopup(e.x, 1.2, e.z, guaranteedDamage, 0, '#FF4500', '#FFFFFF');

          if (killedByDot) {
            // 撃破処理（ドロップ・経験値・描画からの退避）
            _dummy.position.set(0, -100, 0);
            _dummy.scale.setScalar(0);
            _dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, _dummy.matrix);
            // 【重要】即座に同期して攻撃素通りバグを防ぐ
            meshRef.current.instanceMatrix.needsUpdate = true;
            continue; // 次の敵へ
          }
        }
      } else {
        enemies[i].fireTimer = 0;
      }

      const e = enemies[i];

      // --- スポーン直後の演出 (0.5秒) ---
      const timeSinceSpawn = time - e.spawnTime;
      let spawnScale = 1.0;
      let isSpawning = false;
      let isGlitching = false;

      if (timeSinceSpawn < 0.5) {
        isSpawning = true;
        const p = timeSinceSpawn / 0.5; // 0 -> 1
        spawnScale = p;
        
        // デジタル・グリッチ判定
        if (Math.random() > 0.6) {
          isGlitching = true;
          spawnScale *= (0.6 + Math.random() * 1.2); // スケールの乱れを大きく (0.6〜1.8)
        }
      }

      // プレイヤーに向かって追尾移動（ゲームオーバー時やスポーン中は停止）
      if (!isGameOver && !isSpawning) {
        let isChilled = false;
        let activeIceField = null;
        for (let j = 0; j < iceFields.length; j++) {
          const f = iceFields[j];
          const fdx = e.x - f.pos[0];
          const fdz = e.z - f.pos[2];
          if (fdx * fdx + fdz * fdz <= f.radius * f.radius) {
            isChilled = true;
            activeIceField = f;
            break;
          }
        }
        const currentSpeed = (() => {
          let spd = e.speed;
          // フロストノヴァの鐵足効果
          if (isChilled) spd *= 0.4;
          // 氷エンチャントの鐵足効果
          const debuff = getEnemyDebuff(i);
          if (debuff.iceSlowRate > 0) spd *= (1 - debuff.iceSlowRate);
          return spd;
        })();

        const type = getEnemyType(i);

        if (type < 4) { // Boss (Queen:4, KingCore:5, Shield:6) の移動・AIは専用コンポーネントに委譲
          // バリアまたはコアによる物理的な押し出し (めり込み防止)
          const bdx = e.x - playerX;
          const bdz = e.z - playerZ;
          const bdistSq = bdx * bdx + bdz * bdz;

          // 判定半径の決定（バリア展開中は1.2m、通常時はコアの0.4m）
          const repelRadius = isPlayerGuarding() ? 1.2 : 0.4;
          const repelRadiusSq = repelRadius * repelRadius;

          if (bdistSq < repelRadiusSq) {
            const bdist = Math.sqrt(bdistSq) || 0.01;
            const overlap = repelRadius - bdist;
            e.x += (bdx / bdist) * overlap;
            e.z += (bdz / bdist) * overlap;
          }

          const dx = playerX - e.x;
          const dz = playerZ - e.z;
          const dist = Math.sqrt(dx * dx + dz * dz);

          if (type === 3) {
            // Bishop AI
            // 雷レベルに応じてshotTimerを進めにくくする
            const timeScale = 1.0 - debuff.lightningSlowRate;
            const prevTimer = e.shotTimer;
            e.shotTimer += delta * timeScale;

            let currentDist = dist;
            let currentDx = dx;
            let currentDz = dz;

            // ワープ処理
            if (currentDist > 5.0) {
              const nx = currentDx / currentDist;
              const nz = currentDz / currentDist;
              let wx = playerX - nx * 4.5;
              let wz = playerZ - nz * 4.5;
              
              // ワープ先がフィールド外に出ないようクランプ
              const wDistSq = wx * wx + wz * wz;
              if (wDistSq > 400.0) {
                const wDist = Math.sqrt(wDistSq);
                wx = (wx / wDist) * 20.0;
                wz = (wz / wDist) * 20.0;
              }
              
              e.x = wx;
              e.z = wz;
              currentDx = playerX - e.x;
              currentDz = playerZ - e.z;
              currentDist = Math.sqrt(currentDx * currentDx + currentDz * currentDz) || 0.001;
            }

            if (e.shotTimer < 4.0) {
              // ムーブフェーズ: 時計回りに旋回、半径4.5mを保つ
              if (currentDist > 0.1) {
                const nx = currentDx / currentDist;
                const nz = currentDz / currentDist;
                const targetDist = 4.5;
                const distDiff = currentDist - targetDist;
                const bishopSpeed = currentSpeed * 0.75; // 速度倍率を下げる
                const approachSpeed = Math.max(-bishopSpeed, Math.min(bishopSpeed, distDiff)); // 近づくか離れるか
                // 時計回りの旋回ベクトル
                const tangentX = nz;
                const tangentZ = -nx;

                e.x += (nx * approachSpeed + tangentX * bishopSpeed) * delta;
                e.z += (nz * approachSpeed + tangentZ * bishopSpeed) * delta;
              }
            } else if (e.shotTimer < 5.0) {
              // チャージフェーズ: 移動しない
            } else if (prevTimer < 5.0 && e.shotTimer >= 5.0) {
              // 射撃フェーズ (1度だけ発射)
              // 雷デバフによる弾速低下（最大50%）を適用
              const speedMultiplier = 1.0 - debuff.lightningSlowRate;

              spawnEnemyProjectile({
                x: e.x,
                z: e.z,
                targetX: playerX,
                targetZ: playerZ,
                speed: 8.0 * speedMultiplier,
                damage: getEnemyBaseDamage(),
                multiplier: 1.0,
                life: 1.0,
              });
            } else if (e.shotTimer >= 6.0) {
              // リセット
              e.shotTimer = 0;
            }
          } else {
            // 既存の近接移動
            if (dist > 0.1) {
              const nx = dx / dist;
              const nz = dz / dist;
              e.x += nx * currentSpeed * delta;
              e.z += nz * currentSpeed * delta;
            }
          }

          // --- 追加: ノックバック（吹き飛ばし）の適用 ---
          const kb = consumeKnockback(i);
          if (kb.x !== 0 || kb.z !== 0) {
            e.x += kb.x;
            e.z += kb.z;
          }

          // --- フィールド境界クランプ (半径20m) ---
          const distSqToOrigin = e.x * e.x + e.z * e.z;
          if (distSqToOrigin > 400.0) {
            const distToOrigin = Math.sqrt(distSqToOrigin);
            e.x = (e.x / distToOrigin) * 20.0;
            e.z = (e.z / distToOrigin) * 20.0;
          }

          // collisionBus に座標を書き込み
          updateEnemyPos(i, e.x, e.z);
        } // === end if type !== 4 ===

        // --- 氷フィールド (フロストノヴァ) の個別Tick処理を追加 ---
        if (activeIceField) {
          e.iceTimer += delta;
          if (e.iceTimer >= 1.0) {
            e.iceTimer -= 1.0;

            const dx = e.x - activeIceField.pos[0];
            const dz = e.z - activeIceField.pos[2];
            const distSq = dx * dx + dz * dz;
            const dist = Math.sqrt(distSq);

            // 距離減衰: 基礎ダメージ(魔力50%)を基準とし、端で半減(魔力25%)させる(10%ずつ減衰)
            const fraction = Math.min(1.0, dist / activeIceField.radius);
            const step = Math.floor(fraction * 5.99); // 0〜5
            const multiplier = 1.0 - (step * 0.1); // 1.0〜0.5
            const tickDamage = activeIceField.damage * multiplier;
            const guaranteedDamage = Math.max(1, tickDamage); // 最低1保証

            let critType = 0;
            if (activeIceField.critChance > 100) {
              critType = 1;
              if (Math.random() * 100 < (activeIceField.critChance - 100)) critType = 2;
            } else if (Math.random() * 100 < activeIceField.critChance) {
              critType = 1;
            }

            const mult = critType === 2 ? (activeIceField.critDamage / 100) + 1.0 : critType === 1 ? (activeIceField.critDamage / 100) : 1.0;
            const finalDamage = guaranteedDamage * mult;

            // 第3引数 false で魔法ダメージとして適用
            const result = damageEnemy(i, finalDamage, false, false, true, 'magic_ice_hit');
            // 氷魔法: 文字 #00FFFF, 縁 #000000 (黒)
            spawnDamagePopup(e.x, 1.2, e.z, result.finalDamage, critType, '#00FFFF', '#000000');

            if (result.killed) {
              _dummy.position.set(0, -100, 0);
              _dummy.scale.setScalar(0);
              _dummy.updateMatrix();
              meshRef.current.setMatrixAt(i, _dummy.matrix);
              // 【重要】即座に同期して攻撃素通りバグを防ぐ
              meshRef.current.instanceMatrix.needsUpdate = true;
              continue; // 死亡時は次の敵へ
            }
          }
        }
      }

      const type = getEnemyType(i);

      // プレイヤーの方向を向く
      _dummy.rotation.y = Math.atan2(playerX - e.x, playerZ - e.z);

      // タイプ別のカラーとスケールの決定
      let color = colorNormal;
      let baseScale = 1.0;

      if (type === 1) { // Knight
        color = colorSwarm;
        baseScale = 0.75;
      } else if (type === 2) { // Rook
        color = colorTank;
        baseScale = 1.5;
      } else if (type === 3) { // Bishop
        color = colorBishop;
        baseScale = 1.0;
      }

      if (type === 4) { // Boss Queen: skip rendering in InstancedEnemies
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      // 基準サイズ 0.6 に対する倍率として適用しつつ、拍動アニメとスポーン演出を統合
      const finalScale = 0.6 * baseScale * (1 + 0.1 * Math.sin(e.phase)) * spawnScale;
      _dummy.scale.setScalar(finalScale);

      // Y座標もスケールに合わせて調整 (足元を接地させるイメージ)
      const bobY = Math.sin(time * 3 + e.phase) * 0.05 * baseScale;
      let renderX = e.x;
      let renderY = (0.4 * baseScale) + bobY;
      let renderZ = e.z;

      // グリッチ時の座標ブレ (サイズを大きく)
      if (isGlitching) {
        renderX += (Math.random() - 0.5) * 0.8;
        renderZ += (Math.random() - 0.5) * 0.8;
        renderY += (Math.random() - 0.5) * 0.4;
      }

      // キルスクリーン（900秒以上）での激しい振動処理
      if (time >= 900) {
        renderX += (Math.random() - 0.5) * 1.0;
        renderY += (Math.random() - 0.5) * 1.0;
        renderZ += (Math.random() - 0.5) * 1.0;
      }

      _dummy.position.set(renderX, renderY, renderZ);

      _dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, _dummy.matrix);

      // 発光処理を含む色の設定
      if (isGlitching) {
        // グリッチ中：白と本来の色のミックスで発光させる
        _color.copy(color).lerp(new Color('#ffffff'), 0.5).multiplyScalar(5.0);
        meshRef.current.setColorAt(i, _color);
      } else if (type === 3 && e.shotTimer >= 4.0 && e.shotTimer < 5.0) {
        // チャージフェーズ：徐々に明るく（emissiveIntensityを10程度に）
        const chargeRate = e.shotTimer - 4.0; // 0.0 ~ 1.0
        const emissiveColor = color.clone().lerp(new Color('#ffffff'), chargeRate * 0.8).multiplyScalar(1.0 + chargeRate * 9.0);
        meshRef.current.setColorAt(i, emissiveColor);
      } else {
        meshRef.current.setColorAt(i, color);
      }
    }

    // 毎フレームグリッドを完全再構築して同期ズレを防ぐ
    rebuildGrid();

    // --- キルスクリーン（900秒以上）のマテリアル制御 ---
    if (meshRef.current) {
      const mat = meshRef.current.material as import('three').MeshStandardMaterial;
      const isKillScreen = time >= 900;
      if (mat.wireframe !== isKillScreen) {
        mat.wireframe = isKillScreen;
        if (isKillScreen) {
          mat.color.setHex(0x000000);
          mat.emissive.setHex(0xff0000);
          mat.emissiveIntensity = 2.0;
        } else {
          mat.color.setHex(0xffffff);
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 1.0;
        }
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }


    // --- キルスクリーン（15分以降）の背景レッドアウト演出 ---
    if (!isPaused && !isGameOver) {
      if (time >= 900) {
        const pulse = (Math.sin(_state.clock.elapsedTime * 8) + 1) / 2; // 0.0 ~ 1.0
        killBgRef.current.setRGB(0.05 + pulse * 0.05, 0, 0); // マイルドな赤に変更
        scene.background = killBgRef.current;
      } else {
        // 通常時に戻す（一度だけ実行されるように判定）
        if (scene.background !== normalBgRef.current) {
          scene.background = normalBgRef.current;
        }
      }
    }

    // エフェクトの寿命更新
    if (lightningEffects.length > 0) {
      setLightningEffects((prev: LightningEffect[]) =>
        prev.map((e: LightningEffect) => ({ ...e, life: e.life - delta })).filter((e: LightningEffect) => e.life > 0)
      );
    }
    if (fireEffects.length > 0) {
      setFireEffects(prev =>
        prev.map(e => ({ ...e, life: e.life - delta })).filter(e => e.life > 0)
      );
    }
    if (iceFields.length > 0) {
      setIceFields((prev: IceFieldEffect[]) => prev.map((f: IceFieldEffect) => {
        return { ...f, life: f.life - delta };
      }).filter((f: IceFieldEffect) => f.life > 0));
    }
    if (warpEffects.length > 0) {
      // 縮小・フェード速度を1.5倍に高速化
      setWarpEffects(prev => prev.map(e => ({ ...e, life: e.life - delta * 1.5 })).filter(e => e.life > 0));
    }

    // --- ボス出現直前の雑魚一掃処理 (Warp演出) ---
    if (!isPaused && !isGameOver) {
      const triggerWarp = () => {
        const ePositions = getEnemyPositions();
        const newWarps: { 
          id: number; 
          pos: [number, number, number]; 
          rotation: [number, number, number, number];
          color: string;
          life: number 
        }[] = [];
        for (let i = 0; i < poolSize; i++) {
          if (isEnemyAlive(i)) {
            const offset = i * 2;

            // 行列から向き（回転）を抽出
            meshRef.current!.getMatrixAt(i, _mat);
            _mat.decompose(_vec, _quat, _scaleVec);

            // インスタンスカラーを抽出
            meshRef.current!.getColorAt(i, _color);
            const hexColor = `#${_color.getHexString()}`;

            newWarps.push({ 
              id: nextEffectIdRef.current++, 
              pos: [ePositions[offset], 0.6, ePositions[offset + 1]], 
              rotation: [_quat.x, _quat.y, _quat.z, _quat.w],
              color: hexColor,
              life: 1.0 
            });
          }
        }
        if (newWarps.length > 0) setWarpEffects(prev => [...prev, ...newWarps]);
        resetAllEnemies();
      };

      if (time >= 595 && !warpFlags.current.wave11) {
        // Wave 11ボス（クイーン）出現5秒前
        warpFlags.current.wave11 = true;
        triggerWarp();
      } else if (time >= 775 && !warpFlags.current.wave14) {
        // Wave 14ボス（キング）出現5秒前
        warpFlags.current.wave14 = true;
        triggerWarp();
      }
    }
  });

  return (
    <>
      {/* フィールド境界の視覚表示 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <ringGeometry args={[19.9, 20.0, 64]} />
        <meshBasicMaterial color="#ff0000" transparent opacity={0.5} />
      </mesh>

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, poolSize]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial
          roughness={0.5}
          metalness={0.3}
          toneMapped={false}
        />
      </instancedMesh>

      {/* 雷撃エフェクトの描画 */}
      {lightningEffects.map((eff: LightningEffect) => {
        const progress = 1.0 - (eff.life / 0.3); // 0.3秒基準
        const scale = 1.0 + progress * 4.0; // ドームが広がるサイズ
        const showPillar = eff.life > 0.15; // 最初の0.15秒(0.3〜0.15)だけ柱を表示
        return (
          <group key={`lightning-${eff.id}`} position={[eff.pos[0], 0, eff.pos[2]]}>
            {/* 落雷の柱 */}
            {showPillar && (
              <mesh position={[0, 5, 0]}>
                <cylinderGeometry args={[0.4, 0.4, 10, 8]} />
                <meshBasicMaterial color="#ffff00" transparent opacity={(eff.life - 0.15) / 0.15} />
              </mesh>
            )}
            {/* 地面の電磁爆発（ワイヤーフレームドーム） */}
            <mesh position={[0, 1, 0]} scale={[scale, scale, scale]}>
              <sphereGeometry args={[1, 16, 16]} />
              <meshStandardMaterial
                color="#ffff00"
                emissive="#ffb300"
                emissiveIntensity={3}
                transparent
                opacity={(eff.life / 0.3) * 0.8}
                wireframe={true}
                toneMapped={false}
              />
            </mesh>
          </group>
        );
      })}

      {/* 爆発エフェクト（炎） */}
      {fireEffects.map((eff) => {
        const progress = 1 - (eff.life / 0.3);
        const scale = 1 + progress * 3;
        return (
          <mesh key={eff.id} position={[eff.pos[0], 0.5, eff.pos[2]]} scale={scale}>
            <sphereGeometry args={[1, 16, 16]} />
            <meshStandardMaterial
              color="#FF4500"
              transparent
              opacity={(eff.life / 0.3) * 0.8}
              emissive="#FF0000"
              emissiveIntensity={5}
              toneMapped={false}
            />
          </mesh>
        );
      })}

      {/* 氷結フィールドの描画 */}
      {iceFields.map((eff: IceFieldEffect) => (
        <mesh key={`ice-${eff.id}`} position={[eff.pos[0], 0.05, eff.pos[2]]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[eff.radius, 32]} />
          <meshStandardMaterial color="#00ffff" transparent opacity={(eff.life / eff.maxLife) * 0.4} />
        </mesh>
      ))}

      {/* ボス出現前の一掃エフェクト (青キューブワープアウト) */}
      {warpEffects.map((eff) => (
        <mesh 
          key={`warp-${eff.id}`} 
          position={eff.pos} 
          quaternion={eff.rotation}
          scale={1.5 * eff.life}
        >
          <boxGeometry args={[0.8, 0.8, 0.8]} />
          <meshStandardMaterial 
            color={eff.color} 
            emissive={eff.color} 
            emissiveIntensity={2} 
            transparent={true} 
            opacity={eff.life}
          />
        </mesh>
      ))}
    </>
  );
});

/** リスタート時にスポナーの内部状態もリセット */
export function resetEnemySpawner() {
  resetAllEnemies();
  // window オブジェクト経由で内部時間をリセットするフラグを立てる等の処理をここで行うことも可能ですが、
  // 現状は App.tsx からのタイマーリセットを useFrame 側で検知する方式に統一しています。
}
