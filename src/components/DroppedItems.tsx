import { useRef, memo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import type { InstancedMesh as InstancedMeshType } from 'three';
import { Object3D, Color, Vector3, DoubleSide, AdditiveBlending } from 'three';
import { getDrops, pickupDrop } from '../game/dropBus';
import { playerStatsRef } from '../game/playerStats';
import { playerDebuffs } from '../game/playerStats';
import { playSound } from '../game/soundBus';

/**
 * ドロップアイテムの3D描画コンポーネント
 * InstancedMesh でレアリティ色のキューブを描画
 * プレイヤーが近づくと自動取得
 * 【追加】マジック以上のレアリティの場合、画面外にあれば端にインジケーター(▲)を表示
 */

interface DroppedItemsProps {
  maxCount?: number;
  pickupRadiusSq?: number;
}

const _dummy = new Object3D();
const _color = new Color();
const _v3 = new Vector3(); // 座標計算用ベクトル

/** プレイヤー座標の取得（グローバル参照） */
function getPlayerPos(): { x: number; z: number } | null {
  const ref = window.__playerPosRef;
  if (!ref?.current) return null;
  return { x: ref.current.x, z: ref.current.z };
}

export const DroppedItems = memo(function DroppedItems({
  maxCount = 100,
}: DroppedItemsProps) {
  const meshRef = useRef<InstancedMeshType>(null);
  const pillarMeshRef = useRef<InstancedMeshType>(null);
  
  // ガイド表示用のDOM参照
  const indicatorsRef = useRef<HTMLDivElement[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // コンポーネントマウント時にガイド用のDOMを事前生成してBodyに追加
  useEffect(() => {
    const container = document.createElement('div');
    container.id = 'drop-indicators-container';
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '20'; // インベントリ(30)より下、背景より上
    document.body.appendChild(container);
    containerRef.current = container;

    for (let i = 0; i < maxCount; i++) {
      const el = document.createElement('div');
      el.style.position = 'absolute';
      el.style.top = '0px';
      el.style.left = '0px';
      el.style.display = 'none';
      el.style.fontSize = '22px';
      el.style.fontWeight = '900';
      el.innerHTML = '▲';
      el.style.transformOrigin = 'center center';
      container.appendChild(el);
      indicatorsRef.current.push(el);
    }

    if (meshRef.current) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      for (let i = 0; i < maxCount; i++) {
        meshRef.current.setMatrixAt(i, _dummy.matrix);
        if (pillarMeshRef.current) pillarMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (pillarMeshRef.current) pillarMeshRef.current.instanceMatrix.needsUpdate = true;
    }

    return () => {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    };
  }, [maxCount]);

  const hasInitializedRef = useRef(false);

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    // 初回のみ：全インスタンスを確実に画面外へ飛ばす
    if (!hasInitializedRef.current) {
      _dummy.position.set(0, -100, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      for (let i = 0; i < maxCount; i++) {
        meshRef.current.setMatrixAt(i, _dummy.matrix);
        if (pillarMeshRef.current) pillarMeshRef.current.setMatrixAt(i, _dummy.matrix);
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (pillarMeshRef.current) pillarMeshRef.current.instanceMatrix.needsUpdate = true;
      hasInitializedRef.current = true;
    }

    const drops = getDrops();
    const time = state.clock.elapsedTime;
    const playerPos = getPlayerPos();

    const stats = playerStatsRef.current;
    const scaledPickupRange = ((stats.pickupRange || 20) * (playerDebuffs.lightning > 0 ? 0.667 : 1.0)) / 10;
    const currentPickupRadiusSq = scaledPickupRange * scaledPickupRange;

    const { camera, size } = state;
    const halfW = size.width / 2;
    const halfH = size.height / 2;

    // 毎フレーム最初に全てのガイドを非表示にする
    for (let i = 0; i < maxCount; i++) {
      const el = indicatorsRef.current[i];
      if (el && el.style.display !== 'none') {
        el.style.display = 'none';
      }
    }

    for (let i = 0; i < maxCount; i++) {
      if (i >= drops.length || !drops[i].active) {
        // 非アクティブまたは未使用スロット → 画面外に退避
        _dummy.position.set(0, -100, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, _dummy.matrix);
        if (pillarMeshRef.current) pillarMeshRef.current.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      const drop = drops[i];

      // 【追加】マグネット使用時の吸引ロジック (phase: 1)
      if (drop.phase === 1 && playerPos) {
        const dx = playerPos.x - drop.x;
        const dz = playerPos.z - drop.z;
        const distSq = dx * dx + dz * dz;
        const dist = Math.sqrt(distSq);
        if (dist > 0.01) {
          const moveAmount = 15.0 * delta; // ExpGemsと同じ速度
          drop.x += (dx / dist) * moveAmount;
          drop.z += (dz / dist) * moveAmount;
        }
      }

      // プレイヤーとの距離判定（取得チェック）
      if (playerPos) {
        const dx = playerPos.x - drop.x;
        const dz = playerPos.z - drop.z;
        const distSq = dx * dx + dz * dz;

        if (distSq <= currentPickupRadiusSq) {
          pickupDrop(i);
          playSound('item_pickup');
          // 即座に非表示化
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          meshRef.current.setMatrixAt(i, _dummy.matrix);
          if (pillarMeshRef.current) pillarMeshRef.current.setMatrixAt(i, _dummy.matrix);
          continue;
        }
      }

      // 浮遊アニメーション（上下にボブ + Y軸回転）
      const bobY = 0.3 + Math.sin(time * 3 + i * 0.7) * 0.15;
      _dummy.position.set(drop.x, bobY, drop.z);
      _dummy.rotation.y = time * 2 + i;
      _dummy.scale.setScalar(0.35);
      _dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, _dummy.matrix);

      // レアリティに応じた色
      _color.set(drop.color);
      meshRef.current.setColorAt(i, _color);

      // ==========================================
      // 光の柱（Pillar of Light）の描画
      // ==========================================
      const rarity = drop.item.rarity;
      if (pillarMeshRef.current) {
        if (rarity === 'Celestial' || rarity === 'Immortal' || rarity === 'Mythic') {
          // 【更新】レアリティ別に太さを調整、高さは一律15mに統一
          let radius = 0;
          const height = 15.0;
          if (rarity === 'Celestial') radius = 0.09;
          else if (rarity === 'Immortal') radius = 0.03;
          else if (rarity === 'Mythic') radius = 0.01;

          _dummy.position.set(drop.x, height / 2, drop.z); // 中心座標
          _dummy.scale.set(radius, height, radius);
          _dummy.rotation.set(0, 0, 0);
          _dummy.updateMatrix();
          pillarMeshRef.current.setMatrixAt(i, _dummy.matrix);
          pillarMeshRef.current.setColorAt(i, _color);
        } else {
          _dummy.position.set(0, -100, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          pillarMeshRef.current.setMatrixAt(i, _dummy.matrix);
        }
      }

      // ==========================================
      // 画面外ガイド（インジケーター）の計算と描画
      // ==========================================
      // コモンとアンコモンはガイドを表示しない
      if (rarity === 'Common' || rarity === 'Uncommon') continue;

      _v3.set(drop.x, bobY, drop.z);
      _v3.project(camera); // -1.0 〜 1.0 のスクリーン座標に変換

      // 画面外（またはカメラの後ろ）にある場合
      if (_v3.z > 1 || _v3.x < -1 || _v3.x > 1 || _v3.y < -1 || _v3.y > 1) {
        const el = indicatorsRef.current[i];
        if (el) {
          let px = _v3.x;
          let py = _v3.y;
          // カメラの後ろにある場合は座標を反転させる
          if (_v3.z > 1) {
            px = -px;
            py = -py;
          }

          // 画面端のどこに配置するか（0.95 は画面端から少し内側）
          const bounds = 0.95;
          let ix = px, iy = py;
          if (Math.abs(px) > Math.abs(py)) {
            ix = px > 0 ? bounds : -bounds;
            iy = py * (Math.abs(ix) / Math.abs(px));
          } else {
            iy = py > 0 ? bounds : -bounds;
            ix = px * (Math.abs(iy) / Math.abs(py));
          }

          // ピクセル座標に変換
          const screenX = halfW + ix * halfW;
          const screenY = halfH - iy * halfH; // HTMLはY軸が下向きなので反転

          // 角度の計算（HTMLに合わせて補正）
          const rad = Math.atan2(-py, px);
          const deg = rad * (180 / Math.PI);
          const cssAngle = deg + 90; // 「▲」が上向きなので90度ずらす

          el.style.display = 'block';
          // GPUアクセラレーションを効かせて超高速に移動・回転
          el.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) translate(-50%, -50%) rotate(${cssAngle}deg)`;
          el.style.color = drop.color;
          el.style.textShadow = `0 0 8px ${drop.color}, 0 0 3px #000`;
        }
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
    if (pillarMeshRef.current) {
      pillarMeshRef.current.instanceMatrix.needsUpdate = true;
      if (pillarMeshRef.current.instanceColor) {
        pillarMeshRef.current.instanceColor.needsUpdate = true;
      }
    }
  });

  return (
    <>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, maxCount]}
        frustumCulled={false}
      >
        <boxGeometry args={[0.35, 0.35, 0.35]} />
        <meshStandardMaterial
          emissiveIntensity={1.5}
          roughness={0.3}
          metalness={0.7}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={pillarMeshRef} args={[undefined, undefined, maxCount]} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 16]} />
        <meshBasicMaterial
          transparent={true}
          opacity={0.3}
          blending={AdditiveBlending}
          depthWrite={false}
          side={DoubleSide}
        />
      </instancedMesh>
    </>
  );
});
