import { useRef, memo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import type { InstancedMesh as InstancedMeshType } from 'three';
import { Object3D, Color } from 'three';
import {
  getGemPositions,
  getGemState,
  getMaxGems,
  startAttract,
  collectGem,
} from '../game/expGemBus';
import { addExp } from '../game/playerLevel';
import { playerStatsRef } from '../game/playerStats';
import { playerDebuffs } from '../game/playerStats';
import { playSound } from '../game/soundBus';

/**
 * EXPキューブの3D描画コンポーネント
 * InstancedMesh + OctahedronGeometry で水色ひし形を大量描画
 */

const _dummy = new Object3D();
const _color = new Color();

/** プレイヤー座標の取得（グローバル参照） */
function getPlayerPos(): { x: number; z: number } | null {
  const ref = window.__playerPosRef;
  if (!ref?.current) return null;
  return { x: ref.current.x, z: ref.current.z };
}

export const ExpGems = memo(function ExpGems() {
  const meshRef = useRef<InstancedMeshType>(null);
  const MAX = getMaxGems();

  useEffect(() => {
    if (meshRef.current) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      for (let i = 0; i < MAX; i++) {
        meshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [MAX]);

  const hasInitializedRef = useRef(false);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    // 初回のみ：全インスタンスを確実に画面外へ飛ばす
    if (!hasInitializedRef.current) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      for (let i = 0; i < MAX; i++) {
        meshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      hasInitializedRef.current = true;
    }

    const positions = getGemPositions();
    const gemState = getGemState();
    const time = state.clock.elapsedTime;
    const playerPos = getPlayerPos();
    const stats = playerStatsRef.current;
    
    // 吸引半径と移動速度の設定
    const scaledPickupRange = (stats.pickupRange * (playerDebuffs.lightning > 0 ? 0.667 : 1.0)) / 10;
    const pickupRadiusSq = scaledPickupRange * scaledPickupRange;
    const collectRadiusSq = 0.5 * 0.5;
    const attractSpeed = 15.0; // 少しマイルドに変更（元20）

    for (let i = 0; i < MAX; i++) {
      const s = gemState[i];
      if (s === 0) {
        // 非アクティブ
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      const offset = i * 3;
      let gx = positions[offset];
      const gy = positions[offset + 1];
      let gz = positions[offset + 2];

      if (playerPos) {
        const dx = playerPos.x - gx;
        const dz = playerPos.z - gz;
        const distSq = dx * dx + dz * dz;

        if (s === 1 && distSq < pickupRadiusSq) {
          // 待機中 → 範囲内に入ったら吸引開始
          startAttract(i);
        } else if (s === 2) {
          // 吸引中
          if (distSq < collectRadiusSq) {
            // 回収完了
            const exp = collectGem(i);
            addExp(exp);
            playSound('exp');
            _dummy.position.set(0, -100, 0);
            _dummy.scale.setScalar(0);
            _dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, _dummy.matrix);
            continue;
          }
          // プレイヤーに向かって移動
          const dist = Math.sqrt(distSq);
          if (dist > 0.01) {
            const moveAmount = attractSpeed * delta;
            gx += (dx / dist) * moveAmount;
            gz += (dz / dist) * moveAmount;
            positions[offset] = gx;
            positions[offset + 2] = gz;
          }
        }
      }

      // 浮遊アニメーション
      const bobY = gy + Math.sin(time * 4 + i * 0.5) * 0.1;
      _dummy.position.set(gx, bobY, gz);
      _dummy.rotation.y = time * 3 + i * 0.3;
      _dummy.rotation.x = time * 2;
      _dummy.scale.setScalar(0.15);
      _dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, _dummy.matrix);

      // 水色のキューブ色
      _color.setHSL(0.52, 0.9, 0.65);
      meshRef.current.setColorAt(i, _color);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, MAX]}
      frustumCulled={false}
    >
      <octahedronGeometry args={[0.18, 0]} />
      <meshStandardMaterial
        emissive="#00bcd4"
        emissiveIntensity={2}
        roughness={0.2}
        metalness={0.8}
        toneMapped={false}
        transparent
        opacity={0.85}
      />
    </instancedMesh>
  );
});
