import { useRef, memo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import type { InstancedMesh as InstancedMeshType } from 'three';
import { Object3D, Color, DoubleSide } from 'three';
import {
  getEnemyPositions,
  damageEnemy,
  getEnemiesInRadius,
  getEnemyCount,
  isEnemyAlive,
  getEnemyRadius,
  getEnemyType,
} from '../game/collisionBus';
import { currentEnchant, getEnchantColor } from '../game/enchantState';
import { spawnDamagePopup } from './DamagePopups';
import { emitMagic } from '../game/magicBus';
import { playerPosRef, playerStatsRef, dodgeBuffTimer } from '../game/playerStats';
import { playSound, type SoundType } from '../game/soundBus';


/**
 * InstancedMesh ベースのプロジェクタイル（弾）管理コンポーネント
 * オブジェクトプール方式で弾を再利用し、GCを最小限に抑える
 * collisionBus 経由で敵との当たり判定を行う
 */

export interface ProjectileSpawn {
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  damage: number;
  critChance: number;
  piercePower: number;
  isMelee: boolean;
  maxLife: number;
  color: string;
  speed: number;
  targetScaleX?: number;
  critDamage: number;
  attackStyle?: 'slash' | 'slam' | 'punch' | 'fireball' | 'sweep' | 'vertical_slash' | 'grenade' | 'boomerang' | 'orbit' | 'thrust' | 'magic_melee';
  pierceDecay: number;
  itemId?: string;
  targetScaleZ?: number;
  visualScale?: number;
  isHoming?: boolean;
  homingPower?: number;
  sharedHitCount?: { value: number };
  hitSound?: SoundType;
}

interface ProjectileData {
  active: boolean;
  x: number;
  y: number;
  z: number;
  dirX: number;
  dirZ: number;
  life: number;
  damage: number;
  critChance: number;
  piercePower: number;
  hitCount: number;
  hitEnemyIds: number[];
  isMelee: boolean;
  maxLife: number;
  color: string;
  speed: number;
  targetScaleX: number;
  critDamage: number;
  attackStyle: 'slash' | 'slam' | 'punch' | 'fireball' | 'sweep' | 'vertical_slash' | 'grenade' | 'boomerang' | 'orbit' | 'thrust' | 'magic_melee';
  pierceDecay: number;
  itemId: string;
  targetScaleZ: number;
  visualScale: number;
  isHoming: boolean;
  homingPower: number;
  sharedHitCount: { value: number };
  hitSound: SoundType;
  hasReturned: boolean;
}

interface ProjectilesProps {
  maxCount?: number;
  isGameOver?: boolean;
  activeEnchant?: string;
}

const _dummy = new Object3D();
const _color = new Color();

/** 命中判定の半径の2乗（敵0.6 + 弾0.12 ≒ 0.72、余裕を持って0.8） */
const HIT_RADIUS_SQ = 0.8 * 0.8; // = 0.64

// スポーンキューをグローバルに公開（Playerからアクセス）
const spawnQueue: ProjectileSpawn[] = [];

let lastEnqueueTime = 0;
let currentSharedHitCount = { value: 0 };

export function enqueueProjectile(spawn: ProjectileSpawn) {
  const now = performance.now();
  // 10ms以内に連続で呼ばれた場合は同じ攻撃アクションとみなし、カウンターを共有する
  if (now - lastEnqueueTime > 10) {
    currentSharedHitCount = { value: 0 };
    if (spawn.isMelee || spawn.attackStyle === 'slash' || spawn.attackStyle === 'thrust' || spawn.attackStyle === 'magic_melee') {
      playSound(playerStatsRef.current.meleeShootSound || 'swing');
    } else {
      playSound(playerStatsRef.current.rangedShootSound || 'shoot');
    }
  }
  lastEnqueueTime = now;
  spawn.sharedHitCount = currentSharedHitCount;
  spawnQueue.push(spawn);
}

export const Projectiles = memo(function Projectiles({
  maxCount = 200,
  isGameOver = false,
  activeEnchant = 'none',
}: ProjectilesProps) {
  const meshRef = useRef<InstancedMeshType>(null);
  const meleeMeshRef = useRef<InstancedMeshType>(null);
  const slamMeshRef = useRef<InstancedMeshType>(null);
  const punchMeshRef = useRef<InstancedMeshType>(null);
  const fireballMeshRef = useRef<InstancedMeshType>(null);
  const discMeshRef = useRef<InstancedMeshType>(null);

  const matRef = useRef<any>(null);
  const meleeMatRef = useRef<any>(null);
  const slamMatRef = useRef<any>(null);
  const punchMatRef = useRef<any>(null);
  const fireballMatRef = useRef<any>(null);
  const discMatRef = useRef<any>(null);

  // プール（固定サイズ配列、active/inactiveで管理）
  const poolRef = useRef<ProjectileData[]>(
    Array.from({ length: maxCount }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      dirX: 0,
      dirZ: 0,
      life: 0,
      damage: 0,
      critChance: 0,
      piercePower: 1,
      hitCount: 0,
      hitEnemyIds: [],
      isMelee: false,
      maxLife: 1.5,
      color: '#ffffff',
      speed: 0,
      targetScaleX: 3.0,
      critDamage: 150,
      attackStyle: 'slash',
      pierceDecay: 0,
      itemId: '',
      targetScaleZ: 1.0,
      visualScale: 1.0,
      isHoming: false,
      homingPower: 3.0,
      sharedHitCount: { value: 0 },
      hitSound: 'hit',
      hasReturned: false,
    })),
  );

  useEffect(() => {
    if (meshRef.current) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      for (let i = 0; i < maxCount; i++) {
        meshRef.current.setMatrixAt(i, _dummy.matrix);
        if (meleeMeshRef.current) meleeMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (slamMeshRef.current) slamMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (punchMeshRef.current) punchMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (fireballMeshRef.current) fireballMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (discMeshRef.current) discMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meleeMeshRef.current) meleeMeshRef.current.instanceMatrix.needsUpdate = true;
      if (slamMeshRef.current) slamMeshRef.current.instanceMatrix.needsUpdate = true;
      if (punchMeshRef.current) punchMeshRef.current.instanceMatrix.needsUpdate = true;
      if (fireballMeshRef.current) fireballMeshRef.current.instanceMatrix.needsUpdate = true;
      if (discMeshRef.current) discMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [maxCount]);

  const hasInitializedRef = useRef(false);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    
    // 初回のみ：全インスタンスを確実に画面外へ飛ばす
    if (!hasInitializedRef.current) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      for (let i = 0; i < maxCount; i++) {
        meshRef.current.setMatrixAt(i, _dummy.matrix);
        if (meleeMeshRef.current) meleeMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (slamMeshRef.current) slamMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (punchMeshRef.current) punchMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (fireballMeshRef.current) fireballMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (discMeshRef.current) discMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meleeMeshRef.current) meleeMeshRef.current.instanceMatrix.needsUpdate = true;
      if (slamMeshRef.current) slamMeshRef.current.instanceMatrix.needsUpdate = true;
      if (punchMeshRef.current) punchMeshRef.current.instanceMatrix.needsUpdate = true;
      if (fireballMeshRef.current) fireballMeshRef.current.instanceMatrix.needsUpdate = true;
      if (discMeshRef.current) discMeshRef.current.instanceMatrix.needsUpdate = true;
      hasInitializedRef.current = true;
    }

    if (isGameOver) return; // 【修正】isSpawning/isPaused 込みのフラグが渡されているためこれだけでOK
    const pool = poolRef.current;

    // スポーンキューを処理
    while (spawnQueue.length > 0) {
      const spawn = spawnQueue.pop()!;
      // 非アクティブなスロットを探す
      const slot = pool.find((p) => !p.active);
      if (slot) {
        slot.active = true;
        slot.sharedHitCount = spawn.sharedHitCount || { value: 0 };
        slot.x = spawn.x;
        slot.y = spawn.y;
        slot.z = spawn.z;
        slot.dirX = spawn.dirX;
        slot.dirZ = spawn.dirZ;
        slot.life = 0;
        slot.damage = spawn.damage;
        slot.critChance = spawn.critChance;
        slot.piercePower = spawn.piercePower;
        slot.hitCount = 0;
        slot.hitEnemyIds = [];
        slot.isMelee = spawn.isMelee;
        slot.maxLife = spawn.maxLife;
        slot.color = spawn.color;
        slot.speed = spawn.speed;
        slot.targetScaleX = spawn.targetScaleX ?? 1.0;
        slot.critDamage = spawn.critDamage;
        slot.attackStyle = spawn.attackStyle ?? 'slash';
        slot.pierceDecay = spawn.pierceDecay;
        slot.itemId = spawn.itemId ?? '';
        slot.targetScaleZ = spawn.targetScaleZ ?? 1.0;
        slot.visualScale = spawn.visualScale ?? 1.0;
        slot.isHoming = spawn.isHoming ?? false;
        slot.homingPower = spawn.homingPower ?? 3.0;
        slot.sharedHitCount = spawn.sharedHitCount ?? { value: 0 };
        slot.hitSound = spawn.hitSound ?? 'hit';
        slot.hasReturned = false;
      }
    }

    // 当たり判定用データを取得
    const ePositions = getEnemyPositions();
    const hitCandidates: number[] = [];

    // 弾の更新・当たり判定・描画
    let visibleCount = 0;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      const instancingNeeded = p.active && (p.isMelee || p.attackStyle === 'fireball' || p.attackStyle === 'punch' || p.attackStyle === 'boomerang' || p.attackStyle === 'orbit');
      void instancingNeeded;

      if (!p.active) {
        // 全メッシュを退避
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        if (meshRef.current) meshRef.current.setMatrixAt(i, _dummy.matrix);
        if (meleeMeshRef.current) meleeMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (slamMeshRef.current) slamMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (punchMeshRef.current) punchMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (fireballMeshRef.current) fireballMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (discMeshRef.current) discMeshRef.current.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      
      // 誘導（Homing）ロジック
      if (p.active && p.isHoming && !p.isMelee) {
        // 最も近い敵を探す
        let minDistSq = 400; // 20m以内
        let targetIdx = -1;
        const ePositions = getEnemyPositions();
        const eCount = getEnemyCount(); // collisionBus から追加でインポートが必要
        for (let j = 0; j < eCount; j++) {
          if (!isEnemyAlive(j)) continue;
          const ex = ePositions[j * 2];
          const ez = ePositions[j * 2 + 1];
          const dx = ex - p.x;
          const dz = ez - p.z;
          const dSq = dx * dx + dz * dz;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            targetIdx = j;
          }
        }

        if (targetIdx !== -1) {
          const tx = ePositions[targetIdx * 2];
          const tz = ePositions[targetIdx * 2 + 1];
          const targetDirX = tx - p.x;
          const targetDirZ = tz - p.z;
          const targetLen = Math.sqrt(targetDirX * targetDirX + targetDirZ * targetDirZ);
          
          if (targetLen > 0.1) {
            const nx = targetDirX / targetLen;
            const nz = targetDirZ / targetLen;
            // 現在の方向に緩やかに（Lerp）近づける
            const turnSpeed = p.homingPower * delta; // 旋回性能
            p.dirX += (nx - p.dirX) * turnSpeed;
            p.dirZ += (nz - p.dirZ) * turnSpeed;
            // ベクトルを正規化し直す
            const newLen = Math.sqrt(p.dirX * p.dirX + p.dirZ * p.dirZ);
            if (newLen > 0) {
              p.dirX /= newLen;
              p.dirZ /= newLen;
            }
          }
        }
      }

      // 移動
      if (p.attackStyle === 'boomerang') {
        const progress = p.life / p.maxLife;
        // 折り返し地点 (0.5) でヒット済みリストをクリアして多段ヒットを許可
        if (progress >= 0.5 && !p.hasReturned) {
          p.hitEnemyIds = [];
          p.hasReturned = true;
        }
        // cos波を利用：最初は前進、中間で停止、最後は同じ速度で戻ってくる
        const currentSpeed = p.speed * Math.cos(progress * Math.PI);
        p.x += p.dirX * currentSpeed * delta;
        p.z += p.dirZ * currentSpeed * delta;
      } else if (p.attackStyle === 'orbit') {
        // 発射角度を基準に、プレイヤーの周囲を高速回転(公転)する
        const initialAngle = Math.atan2(p.dirX, p.dirZ);
        const currentAngle = initialAngle + p.life * p.speed; // 回転速度
        const radius = 2.5; // 公転半径
        p.x = playerPosRef.x + Math.sin(currentAngle) * radius;
        p.z = playerPosRef.z + Math.cos(currentAngle) * radius;
      } else if (p.attackStyle === 'grenade') {
        p.x += p.dirX * p.speed * delta;
        p.z += p.dirZ * p.speed * delta;
        const progress = p.life / p.maxLife;
        p.y = 0.5 + Math.sin(progress * Math.PI) * 3.0; // 高度3mの放物線
      } else if (p.attackStyle === 'vertical_slash') {
        const rightX = p.dirZ;
        const rightZ = -p.dirX;
        const driftSpeed = p.targetScaleX * 3.0; 
        const driftMult = p.itemId === 'axe_left' ? -1 : 1;
        p.x += rightX * driftSpeed * delta * driftMult + p.dirX * p.speed * delta;
        p.z += rightZ * driftSpeed * delta * driftMult + p.dirZ * p.speed * delta;
      } else if (p.attackStyle === 'sweep') {
        const rightX = p.dirZ;
        const rightZ = -p.dirX;
        const driftSpeed = p.targetScaleX * 7.0; 
        p.x += -rightX * driftSpeed * delta + p.dirX * p.speed * delta;
        p.z += -rightZ * driftSpeed * delta + p.dirZ * p.speed * delta;
      } else {
        p.x += p.dirX * p.speed * delta;
        p.z += p.dirZ * p.speed * delta;
      }

      // 【重要】これがないと弾が永遠に消滅しません
      p.life += delta;

      // 寿命チェック
      if (p.life >= p.maxLife) {
        if (p.attackStyle === 'grenade') {
          // 爆発(slam)をスポーン
          spawnQueue.push({
            x: p.x, y: 0.1, z: p.z, dirX: 0, dirZ: 0,
            damage: p.damage, critChance: p.critChance, piercePower: 999,
            isMelee: true, maxLife: 0.2, color: '#e2e8f0', speed: 0,
            targetScaleX: 8.4, critDamage: p.critDamage,
            attackStyle: 'slam', pierceDecay: p.pierceDecay, itemId: p.itemId
          });
        }
        p.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        if (meshRef.current) meshRef.current.setMatrixAt(i, _dummy.matrix);
        if (meleeMeshRef.current) meleeMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (slamMeshRef.current) slamMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (punchMeshRef.current) punchMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (fireballMeshRef.current) fireballMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (discMeshRef.current) discMeshRef.current.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      // ========== 当たり判定（空間ハッシュ ベース） ==========
      // 最大判定半径を弾ごとに計算しておく（足切り用）
      let maxRadius = 0.8; // デフォルト (0.64 の平方根より少し大)
      if (p.isMelee) {
        if (p.attackStyle === 'slam') {
          maxRadius = (p.targetScaleX / 2.0) + 0.3;
        } else if (p.attackStyle === 'punch') {
          maxRadius = 0.6;
        } else {
          maxRadius = p.targetScaleX * 0.5 + 0.3;
        }
      }
      
      // 【特例】キング戦の遮蔽板は巨大なため、検索半径を拡張して中心点を捉えられるようにする
      if (window.__isKingActive) {
        maxRadius = Math.max(maxRadius, 20.0);
      }

      // 近接の敵IDだけを取得（O(M)からO(近傍)へ激減）
      const candidateCount = getEnemiesInRadius(p.x, p.z, maxRadius, hitCandidates);

      if (p.attackStyle !== 'grenade') {
        for (let c = 0; c < candidateCount; c++) {
          const e = hitCandidates[c];
          if (!isEnemyAlive(e)) continue; // 「生きている敵にのみ」ヒット処理
          if (p.hitEnemyIds.includes(e)) continue; // すでに当たった敵はスキップ

          const offset = e * 2;
          const dx = p.x - ePositions[offset];
          const dz = p.z - ePositions[offset + 1];
          const distSq = dx * dx + dz * dz;

          // 近接攻撃（衝撃波）は攻撃スタイルによって判定を変える
          let currentHitRadiusSq = HIT_RADIUS_SQ;
          if (p.attackStyle === 'boomerang' || p.attackStyle === 'orbit') {
            const r = (0.8 * 0.5) + 0.1; // 半径0.5mに縮小
            currentHitRadiusSq = r * r;
          }
          if (p.isMelee) {
            if (p.attackStyle === 'slam') {
              const progress = p.life / p.maxLife;
              const radius = (p.targetScaleX / 2.0) * progress + 0.3; // 波紋状に広がる
              currentHitRadiusSq = radius * radius;
            } else if (p.attackStyle === 'punch') {
              const radius = 0.3 + 0.3; // 球の半径(0.3) + 敵の半径(0.3)
              currentHitRadiusSq = radius * radius;
            } else if (p.attackStyle === 'vertical_slash') {
              // 【変更】アックス：左右に分かれる鋭い刃に合わせて判定をスマート化
              const radius = (p.targetScaleX * 0.5) + 0.3;
              currentHitRadiusSq = radius * radius;
            } else {
              const progress = p.life / p.maxLife;
              const currentScaleX = 1.0 + progress * (p.targetScaleX - 1.0);
              const radius = currentScaleX * 0.5 + 0.3; 
              currentHitRadiusSq = radius * radius;
            }
          }

          // 敵のタイプ（サイズ）に応じた判定半径の調整 (Boss対応)
          const er = getEnemyRadius(e);
          if (er > 0.6) {
            // 敵が通常より大きい場合、そのサイズを判定に加味する
            const pr = p.isMelee ? Math.sqrt(currentHitRadiusSq) - 0.3 : 0.12; 
            const combinedRadius = pr + er;
            currentHitRadiusSq = combinedRadius * combinedRadius;
          }

          let isHit = false;
          if (p.attackStyle === 'vertical_slash' || p.attackStyle === 'sweep') {
            // アックス（双剣）専用の長方形当たり判定（OBB）
            // 弾の進行方向（dirX, dirZ）と直角方向（dirZ, -dirX）への距離を測る
            // 注: キャラクター基準にするため vdx = ex - px にしたいが、元の dx = px - ex に合わせる
            const targetDx = ePositions[offset] - p.x;
            const targetDz = ePositions[offset + 1] - p.z;
            const distForward = targetDx * p.dirX + targetDz * p.dirZ;
            const distRight = targetDx * p.dirZ - targetDz * p.dirX;
            
            // sweepの場合はアックスと同じ厚み(0.1)にし、リーチは1.2倍
            const lengthMult = p.attackStyle === 'sweep' ? 1.2 : 1.5;
            const widthMult = 0.1; // 0.3から0.1へ変更し、他の武器と揃える
            
            const halfLength = (0.6 * p.targetScaleX * lengthMult) / 2 + 0.3; 
            const halfWidth = (3.0 * widthMult) / 2 + 0.3; 
            
            isHit = Math.abs(distForward) <= halfLength && Math.abs(distRight) <= halfWidth;
          } else {
            // 従来の円形判定
            isHit = distSq <= currentHitRadiusSq;
          }

          if (isHit) {
            // 火球の場合は直撃ダメージ（魔法扱い）を与えてから即座に爆発へ
                if (p.attackStyle === 'fireball') {
                  const guaranteedDamage = Math.max(1, p.damage * 1.5); // 直撃は1.5倍、最低1保証
                  
                  let critType = 0;
                  if (p.critChance > 100) {
                    critType = 1;
                    if (Math.random() * 100 < (p.critChance - 100)) critType = 2;
                  } else if (Math.random() * 100 < p.critChance) {
                    critType = 1;
                  }
                  
                  const mult = critType === 2 ? (p.critDamage / 100) + 1.0 : critType === 1 ? (p.critDamage / 100) : 1.0;
                  const finalDamage = guaranteedDamage * mult;
                  
                  const offset = e * 2;
                  const result = damageEnemy(e, finalDamage, false, p.isMelee, true, 'magic_fire_hit'); // 魔法ダメージとして適用
                  // 炎魔法: 文字 #FF4500, 縁 #000000 (黒)
                  spawnDamagePopup(ePositions[offset], 1.2, ePositions[offset + 1], result.finalDamage, critType, '#FF4500', '#000000');

                  // 必ず爆発を発動させてから消滅（貫通バグ回避）
                  emitMagic({
                    type: 'fire_explosion',
                    position: [p.x, 0, p.z],
                    damage: p.damage,
                    radius: p.targetScaleX * 1.5,
                    critChance: p.critChance, 
                    critDamage: p.critDamage,
                  });
                  p.active = false;
                  break;
                }

            // 通常弾 / 近接弾
            const baseDamage = p.damage;
            let preCritDamage = baseDamage;
            if (p.piercePower < 1.0) preCritDamage *= p.piercePower;
            // レゾナンス効果（旧ミラージュ）の適用
            if (p.pierceDecay > 0) {
              // 貫通減衰がある武器（近接、オーブ等）：【守りの強化】減衰の開始を遅らせる
              const resonanceLevel = playerStatsRef.current.resonance || 0;
              const effectiveHitCount = Math.max(0, p.sharedHitCount.value - resonanceLevel);
              const multiplierRaw = 1.0 - (effectiveHitCount * p.pierceDecay);
              
              // 0% 以下による消滅・判定消失ロジック (遠隔武器のみ)
              if (multiplierRaw <= 0.0) { // 遠隔武器は0%になると消失
                if (!p.isMelee) {
                  // ブーメラン・チャクラム・オーブ等は弾自体が消滅
                  p.active = false;
                  break; 
                } else if (p.itemId === 'grenade_launcher') {
                  // グレネードランチャーの爆発は見た目維持・判定のみ消失
                  continue; 
                }
              }

              const minMultiplier = p.isMelee ? 0.1 : 0.0;
              const multiplier = Math.max(minMultiplier, multiplierRaw);
              preCritDamage *= multiplier;
            } else {
              // 貫通減衰がない（0）武器（ライフル、グリモワール等）：【攻めの強化（エコーボーナス）】
              // 貫通した数に比例してダメージが上昇する
              const resonanceLevel = playerStatsRef.current.resonance || 0;
              if (resonanceLevel > 0) {
                const echoBonus = resonanceLevel * 0.1 * p.sharedHitCount.value;
                preCritDamage *= (1.0 + echoBonus);
              }
            }
            
            const guaranteedDamage = Math.max(1, preCritDamage); // 最低1保証

            let critType = 0;
            if (p.critChance > 100) {
              critType = 1;
              if (Math.random() * 100 < (p.critChance - 100)) critType = 2;
            } else if (Math.random() * 100 < p.critChance) {
              critType = 1;
            }

            const mult = critType === 2 ? (p.critDamage / 100) + 1.0 : critType === 1 ? (p.critDamage / 100) : 1.0;
            const finalDamage = guaranteedDamage * mult;

            const ex = ePositions[offset];
            const ez = ePositions[offset + 1];

            // キングコア（Type 5）への属性三すくみダメージ倍率
            let elementalFinalDamage = finalDamage;
            let skipEnchant = false;
            if (getEnemyType(e) === 5 && window.__kingCoreSlots) {
              const enchant = (activeEnchant !== 'none') ? activeEnchant : currentEnchant;
              if (enchant !== 'none') {
                // コアのインデックスを特定 (0:炎, 1:氷, 2:雷)
                const coreIdx = window.__kingCoreSlots.indexOf(e);
                if (coreIdx !== -1) {
                  // coreIdx: 0=fire, 1=ice, 2=lightning
                  const coreElement = coreIdx === 0 ? 'fire' : coreIdx === 1 ? 'ice' : 'lightning';
                  if (enchant === coreElement) {
                    // 同属性: 0.5倍
                    elementalFinalDamage *= 0.5;
                  } else if (
                    (enchant === 'fire' && coreElement === 'ice') ||
                    (enchant === 'ice' && coreElement === 'lightning') ||
                    (enchant === 'lightning' && coreElement === 'fire')
                  ) {
                    // 有利: 1.414倍
                    elementalFinalDamage *= 1.414;
                  } else {
                    // 不利: 0.707倍
                    elementalFinalDamage *= 0.707;
                  }
                }
              }
              // 無属性 (enchant === 'none') の場合は 1.0倍（変更なし）
            }

            // 敵にダメージを与える
      // 敵にダメージを与える
            const result = damageEnemy(e, elementalFinalDamage, true, p.isMelee, skipEnchant, p.hitSound);
            p.hitEnemyIds.push(e);
            p.hitCount += 1;
            p.sharedHitCount.value += 1; // 共有カウンターも増加させる

            // 【不具合修正】次の威力が0%以下になるなら、この敵へのダメージを最後に即座に消失させる
            if (!p.isMelee && p.pierceDecay > 0) {
              const resonanceLevel = playerStatsRef.current.resonance || 0;
              const nextEffectiveHitCount = Math.max(0, p.sharedHitCount.value - resonanceLevel);
              const nextMultiplierRaw = 1.0 - (nextEffectiveHitCount * p.pierceDecay);
              if (nextMultiplierRaw <= 0.0) {
                p.active = false;
                break; // この敵へのダメージを最後に即座に消失させる
              }
            }

            // ダメージポップアップを生成
            const enchant = (activeEnchant !== 'none') ? activeEnchant : currentEnchant;
            let fillColor = '#FFFFFF';
            let outlineColor = '#000000'; // 無属性は 縁 黒
            
            if (enchant !== 'none') {
              fillColor = getEnchantColor(enchant as any); 
              outlineColor = '#3f1f7f'; // エンチャント追撃のフチ色を変更
            }
            
            spawnDamagePopup(ex, 1.2, ez, result.finalDamage, critType, fillColor, outlineColor);

            if (result.killed) { /* ドロップ処理は collisionBus 側で一元化済み */ }

            // 近接攻撃（衝撃波・ハンマー・ナックル）は貫通力を減らさない（寿命まで残り続ける）
            if (!p.isMelee) {
              p.piercePower -= 1.0;
              // 貫通力がなくなれば消滅へ
              if (p.piercePower <= 0) {
                p.active = false;
                break;
              }
            }
            // 貫通する場合や近接の場合は、このフレームの他の敵との判定も継続
          }
        }
      }

      if (!p.active) {
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0.001);
        _dummy.updateMatrix();
        if (meshRef.current) meshRef.current.setMatrixAt(i, _dummy.matrix);
        if (meleeMeshRef.current) meleeMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (slamMeshRef.current) slamMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (punchMeshRef.current) punchMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (fireballMeshRef.current) fireballMeshRef.current.setMatrixAt(i, _dummy.matrix);
        if (discMeshRef.current) discMeshRef.current.setMatrixAt(i, _dummy.matrix);
        continue;
      }
      // ========== 当たり判定ここまで ==========

      // 描画位置更新
      _dummy.position.set(p.x, p.y, p.z);
      
      const progress = p.life / p.maxLife;
      // スケールアニメーション
      let sX = 1.0;
      let sY = 1.0;
      let sZ = 1.0;

      if (p.isMelee) {
        if (p.attackStyle === 'slam') {
          // ハンマー：真円の波紋
          const slamScale = Math.max(0.01, (p.targetScaleX / 2.0) * progress);
          sX = slamScale;
          sY = slamScale;
          sZ = slamScale;
        } else if (p.attackStyle === 'punch') {
          // 【変更】ナックル(素手)の楕円バグを修正し、攻撃範囲に連動する真円にする
          sX = p.targetScaleX;
          sY = p.targetScaleX;
          sZ = p.targetScaleX;
        } else if (p.attackStyle === 'vertical_slash') {
          // 【変更】アックスの刃を極薄(0.1)にし、リーチをより長く(1.5)する
          sX = 0.1; 
          sZ = p.targetScaleX * 1.5; 
          sY = 6.0; 
        } else if (p.attackStyle === 'sweep') {
          // 【新設】クレイモアの薙ぎ払い：刃の厚みを細く(0.1)し、適度なリーチにする
          sX = 0.1; 
          sZ = p.targetScaleX * 1.2; 
          sY = 2.0; 
        } else {
          // 通常の斬撃(slash)
          const currentScaleX = 1.0 + progress * (p.targetScaleX - 1.0);
          // ベースジオメトリの幅(3.0)を相殺し、実際の判定サイズに見た目を合わせる
          sX = currentScaleX / 3.0; 
          sY = 0.1;
          sZ = 0.6;
        }
      } else if (p.attackStyle === 'grenade') {
        // トップダウン視点の遠近法：高度が上がる(カメラに近づく)と大きく見える
        const heightBonus = Math.sin(progress * Math.PI); // 頂点で1.0
        const baseScale = 0.4 + heightBonus * 0.4; // 0.4から始まり、頂点で0.8に拡大、また0.4に戻る
        sX = sY = sZ = baseScale;
      } else if (p.attackStyle === 'fireball') {
        const progress = p.life / p.maxLife;
        sX = 1.0 + progress * 0.5; sY = 1.0 + progress * 0.5; sZ = 1.0 + progress * 0.5;
      } else {
        const s = 1.0 - progress * 0.5;
        sX = sY = sZ = s;
      }

      // 共通のサイズ倍率(visualScale)を適用
      sX *= p.visualScale;
      sY *= p.visualScale;
      sZ *= p.visualScale;

      const mesh = meshRef.current;
      const meleeMesh = meleeMeshRef.current;
      const slamMesh = slamMeshRef.current;
      const punchMesh = punchMeshRef.current;

      // まず全て退避させる
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0.001);
      _dummy.updateMatrix();
      if (mesh) mesh.setMatrixAt(i, _dummy.matrix);
      if (meleeMesh) meleeMesh.setMatrixAt(i, _dummy.matrix);
      if (slamMesh) slamMesh.setMatrixAt(i, _dummy.matrix);
      if (punchMesh) punchMesh.setMatrixAt(i, _dummy.matrix);
      if (fireballMeshRef.current) fireballMeshRef.current.setMatrixAt(i, _dummy.matrix);
      if (discMeshRef.current) discMeshRef.current.setMatrixAt(i, _dummy.matrix);

      // 必要なものを再設定
      _dummy.position.set(p.x, p.y, p.z);
      _dummy.scale.set(sX, sY, sZ);

      // エンチャント色またはデフォルト色の決定
      const colorToUse = activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : p.color;

      if (p.attackStyle === 'fireball') {
        if (fireballMeshRef.current) {
          _dummy.rotation.set(0, 0, 0);
          _dummy.updateMatrix();
          fireballMeshRef.current.setMatrixAt(i, _dummy.matrix);
          _color.set(p.color); // fireballは固定色
          fireballMeshRef.current.setColorAt(i, _color);
        }
      } else if (p.attackStyle === 'grenade') {
        if (punchMeshRef.current) {
          _dummy.rotation.set(0, 0, 0); _dummy.updateMatrix();
          punchMeshRef.current.setMatrixAt(i, _dummy.matrix);
          _color.set(colorToUse); 
          punchMeshRef.current.setColorAt(i, _color);
        }
      } else if (p.attackStyle === 'boomerang' || p.attackStyle === 'orbit') {
        if (discMeshRef.current) {
          _dummy.rotation.set(0, p.life * 20.0, 0);
          _dummy.scale.set(1.0, 1.0, 1.0);
          _dummy.updateMatrix();
          discMeshRef.current.setMatrixAt(i, _dummy.matrix);
          _color.set(colorToUse);
          discMeshRef.current.setColorAt(i, _color);
        }
      } else if (p.isMelee && p.attackStyle === 'slam') {
        if (slamMeshRef.current) {
          _dummy.rotation.set(-Math.PI / 2, 0, 0);
          _dummy.updateMatrix();
          slamMeshRef.current.setMatrixAt(i, _dummy.matrix);
          const brightness = Math.max(0, 1.0 - progress);
          _color.set(colorToUse).multiplyScalar(brightness);
          slamMeshRef.current.setColorAt(i, _color);
        }
      } else if (p.attackStyle === 'punch') {
        if (punchMesh) {
          _dummy.rotation.set(0, 0, 0);
          _dummy.updateMatrix();
          punchMesh.setMatrixAt(i, _dummy.matrix);
          _color.set(colorToUse);
          punchMesh.setColorAt(i, _color);
        }
      } else if (p.isMelee) { // slash
        if (meleeMesh) {
          _dummy.rotation.set(0, Math.atan2(p.dirX, p.dirZ), 0);
          _dummy.updateMatrix();
          meleeMesh.setMatrixAt(i, _dummy.matrix);
          const brightness = 1.0 - progress * 0.6;
          _color.set(colorToUse).multiplyScalar(brightness);
          meleeMesh.setColorAt(i, _color);
        }
      } else { // 遠距離
        if (mesh) {
          _dummy.rotation.set(0, 0, 0);
          _dummy.updateMatrix();
          mesh.setMatrixAt(i, _dummy.matrix);
          const brightness = 1.0 - progress * 0.6;
          _color.set(colorToUse).multiplyScalar(brightness);
          mesh.setColorAt(i, _color);
        }
      }

      visibleCount++;
    }

    if (meshRef.current) {
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }
    if (meleeMeshRef.current) {
      meleeMeshRef.current.instanceMatrix.needsUpdate = true;
      if (meleeMeshRef.current.instanceColor) meleeMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (slamMeshRef.current) {
      slamMeshRef.current.instanceMatrix.needsUpdate = true;
      if (slamMeshRef.current.instanceColor) slamMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (punchMeshRef.current) {
      punchMeshRef.current.instanceMatrix.needsUpdate = true;
      if (punchMeshRef.current.instanceColor) punchMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (fireballMeshRef.current) {
      fireballMeshRef.current.instanceMatrix.needsUpdate = true;
      if (fireballMeshRef.current.instanceColor) fireballMeshRef.current.instanceColor.needsUpdate = true;
    }
    if (discMeshRef.current) {
      discMeshRef.current.instanceMatrix.needsUpdate = true;
      if (discMeshRef.current.instanceColor) discMeshRef.current.instanceColor.needsUpdate = true;
    }

    // --- エフェクト輝度の一貫性維持 ---
    if (matRef.current) matRef.current.emissiveIntensity = (activeEnchant !== 'none' ? 3 : 1);
    if (meleeMatRef.current) meleeMatRef.current.emissiveIntensity = (activeEnchant !== 'none' ? 4 : 2);
    if (slamMatRef.current) slamMatRef.current.emissiveIntensity = (activeEnchant !== 'none' ? 4 : 2);
    if (punchMatRef.current) punchMatRef.current.emissiveIntensity = (activeEnchant !== 'none' ? 6 : 3);
    if (fireballMatRef.current) fireballMatRef.current.emissiveIntensity = 4;
    if (discMatRef.current) discMatRef.current.emissiveIntensity = (activeEnchant !== 'none' ? 4 : 2);

    // count属性は固定なのでvisibleCountは情報用のみ
    void visibleCount;
  });

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, maxCount]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshStandardMaterial
          ref={matRef}
          color={activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : "#ffffff"}
          emissive={activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : "#cccccc"}
          emissiveIntensity={activeEnchant !== 'none' ? 3 : 1}
          roughness={0.2}
          metalness={0.8}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh
        ref={meleeMeshRef}
        args={[undefined, undefined, maxCount]}
        frustumCulled={false}
      >
        {/* 常時斬撃用の箱にする */}
        <boxGeometry args={[3.0, 0.1, 0.6]} />
        <meshStandardMaterial
          ref={meleeMatRef}
          color={activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : "#ffffff"}
          emissive={activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : "#ffffff"}
          emissiveIntensity={activeEnchant !== 'none' ? 4 : 2}
          transparent
          opacity={0.8}
          roughness={0.1}
          metalness={0.9}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={slamMeshRef} args={[undefined, undefined, maxCount]} frustumCulled={false}>
        {/* 内径0.95、外径1.0の極薄リング。滑らかさを64に向上 */}
        <ringGeometry args={[0.9, 1.0, 64]} />
        <meshStandardMaterial
          ref={slamMatRef}
          color={activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : "#ffffff"}
          emissive={activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : "#ffffff"}
          emissiveIntensity={activeEnchant !== 'none' ? 4 : 2}
          transparent
          opacity={0.8}
          depthWrite={false}
          side={DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh
        ref={punchMeshRef}
        args={[undefined, undefined, maxCount]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          ref={punchMatRef}
          color={activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : "#ffffff"}
          emissive={activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : "#ffffff"}
          emissiveIntensity={activeEnchant !== 'none' ? 6 : 3}
          roughness={0.1}
          metalness={0.8}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh
        ref={fireballMeshRef}
        args={[undefined, undefined, maxCount]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshStandardMaterial
          ref={fireballMatRef}
          color="#ff0000"
          emissive="#ff2200"
          emissiveIntensity={4}
          roughness={0.1}
          metalness={0.1}
          toneMapped={false}
        />
      </instancedMesh>

      <instancedMesh ref={discMeshRef} args={[undefined, undefined, maxCount]} frustumCulled={false}>
        {/* 半径0.4m(直径0.8m)、厚さ0.05mの円盤 */}
        <cylinderGeometry args={[0.4, 0.4, 0.05, 16]} />
        <meshStandardMaterial
          ref={discMatRef}
          color={activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : "#ffffff"}
          emissive={activeEnchant !== 'none' ? getEnchantColor(activeEnchant as any) : "#ffffff"}
          emissiveIntensity={activeEnchant !== 'none' ? 4 : 2}
          roughness={0.1}
          metalness={0.9}
          toneMapped={false}
        />
      </instancedMesh>
    </>
  );
});
