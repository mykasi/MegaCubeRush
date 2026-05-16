import { useRef, useEffect, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import type { InstancedMesh as InstancedMeshType } from 'three';
import { Object3D, Color } from 'three';
import { 
  onSpawnEnemyProjectile, 
  onClearEnemyProjectiles,
  onClearEnemyProjectilesInRadius,
  registerProjectileCheck,
  isPlayerGuarding,
  isPlayerBoosting 
} from '../game/collisionBus';
import type { EnemyProjectileSpawn } from '../game/collisionBus';
import { drainGuardStamina } from '../game/playerDash';
import { damagePlayer, isPlayerInvincible } from '../game/playerHp';
import { spawnDamagePopup } from './DamagePopups';
import { playerStatsRef } from '../game/playerStats';

interface EnemyProjectileData {
  active: boolean;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  speed: number;
  damage: number;
  multiplier: number;
  life: number;
  maxLife: number;
  sourceType: number;
}

const _dummy = new Object3D();
const _color = new Color('#d500f9');
const HIT_RADIUS = 0.24;

export const EnemyProjectiles = memo(function EnemyProjectiles({
  isGameOver = false,
  isPaused = false,
  maxCount = 50,
}: {
  isGameOver?: boolean;
  isPaused?: boolean;
  maxCount?: number;
}) {
  const meshRef = useRef<InstancedMeshType>(null);
  const poolRef = useRef<EnemyProjectileData[]>(
    Array.from({ length: maxCount }, () => ({
      active: false,
      x: 0,
      z: 0,
      dirX: 0,
      dirZ: 0,
      speed: 0,
      damage: 0,
      multiplier: 1.0,
      life: 0,
      maxLife: 999,
      sourceType: 0,
    }))
  );

  useEffect(() => {
    const unsub = onSpawnEnemyProjectile((spawn: EnemyProjectileSpawn) => {
      const pool = poolRef.current;
      const slot = pool.find((p) => !p.active);
      if (slot) {
        slot.active = true;
        slot.x = spawn.x;
        slot.z = spawn.z;
        const dx = spawn.targetX - spawn.x;
        const dz = spawn.targetZ - spawn.z;
        const dist = Math.sqrt(dx * dx + dz * dz) || 1;
        slot.dirX = dx / dist;
        slot.dirZ = dz / dist;
        slot.speed = spawn.speed;
        slot.damage = spawn.damage;
        slot.multiplier = spawn.multiplier ?? 1.0;
        slot.life = 0;
        slot.maxLife = spawn.life ?? 999;
        slot.sourceType = spawn.sourceType ?? 0;
      }
    });
    const unsubClear = onClearEnemyProjectiles(() => {
      poolRef.current.forEach(p => p.active = false);
    });
    const unsubClearRadius = onClearEnemyProjectilesInRadius((cx, cz, radius) => {
      const rSq = radius * radius;
      poolRef.current.forEach(p => {
        if (!p.active) return;
        const dx = p.x - cx;
        const dz = p.z - cz;
        if (dx * dx + dz * dz <= rSq) p.active = false;
      });
    });

    registerProjectileCheck((px, pz, barrierRadius) => {
      // 弾丸の判定半径は 0.1 とし、全身が収まっているか確認
      const r = 0.1;
      const limitSq = (barrierRadius - r) * (barrierRadius - r);
      return poolRef.current.some(p => {
        if (!p.active) return false;
        const dx = p.x - px;
        const dz = p.z - pz;
        return (dx * dx + dz * dz <= limitSq);
      });
    });

    if (meshRef.current) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      for (let i = 0; i < maxCount; i++) {
        meshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
    }

    return () => {
      unsub();
      unsubClear();
      unsubClearRadius();
      registerProjectileCheck(() => false);
    };
  }, []);

  const hasInitializedRef = useRef(false);

  useFrame((_state, delta) => {
    if (!meshRef.current) return;
    
    // 初回のみ：全インスタンスを確実に画面外へ飛ばす
    if (!hasInitializedRef.current) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      for (let i = 0; i < maxCount; i++) {
        meshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      hasInitializedRef.current = true;
    }

    if (isGameOver || isPaused) return;

    let playerX = 0;
    let playerZ = 0;
    if (window.__playerPosRef) {
      playerX = window.__playerPosRef.current.x;
      playerZ = window.__playerPosRef.current.z;
    }

    const pool = poolRef.current;
    
    for (let i = 0; i < maxCount; i++) {
      const p = pool[i];
      if (!p.active) {
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      p.x += p.dirX * p.speed * delta;
      p.z += p.dirZ * p.speed * delta;
      p.life += delta;

      if (Math.abs(p.x - playerX) > 50 || Math.abs(p.z - playerZ) > 50 || p.life >= p.maxLife) {
        p.active = false;
      } else {
        const dx = p.x - playerX;
        const dz = p.z - playerZ;
        if (dx * dx + dz * dz <= HIT_RADIUS * HIT_RADIUS) {
          if (isPlayerGuarding()) {
            const staminaDrain = (p.sourceType === 4 || p.sourceType === 5) ? 25.0 : 6.25;
            drainGuardStamina(staminaDrain);
            p.active = false;
          } else {
            const defense = playerStatsRef.current?.defense || 0;
            const finalDamage = Math.max(1, p.damage - defense) * p.multiplier * (isPlayerBoosting() ? 2.0 : 1.0);

            const result = damagePlayer(finalDamage);
            if (result === 'dead') {
              window.dispatchEvent(new CustomEvent('player-death'));
            }
            
            if (result === 'damaged' || result === 'dead') {
              spawnDamagePopup(0, 2.5, 2.0, finalDamage, 0, '#FFFFFF', '#FF0000', -1.5, true); 
              p.active = false;
            }
            // 'dodged' or 'invincible'の場合は弾を消さずにそのまま進ませる（すり抜け）
          }
        }
      }

      if (p.active) {
        _dummy.position.set(p.x, 0.5, p.z);
        _dummy.scale.setScalar(0.4);
        _dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, _dummy.matrix);
        meshRef.current.setColorAt(i, _color);
      } else {
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, _dummy.matrix);
      }
    }
    
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, maxCount]} frustumCulled={false}>
      <octahedronGeometry args={[0.3, 0]} />
      <meshStandardMaterial color="#9c27b0" emissive="#d500f9" emissiveIntensity={4} toneMapped={false} />
    </instancedMesh>
  );
});
