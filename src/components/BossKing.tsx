import {
  getGlobalGameTime,
  findInactiveSlot,
  respawnEnemy,
  isEnemyAlive,
  getEnemyHp,
  getEnemyMaxHp,
  updateEnemyPos,
  updateEnemyHp,
  damageEnemy,
  consumeKnockback,
  calcMaxHp,
  getEnemyDebuff,
  applyDoT,
  spawnEnemyProjectile,
  getEnemyBaseDamage,
  isPlayerGuarding,
  isPlayerBoosting,
  onClearEnemyProjectilesInRadius,
  registerRippleCheck
} from '../game/collisionBus';
import { playerStatsRef } from '../game/playerStats';
import { applyPlayerDebuff } from '../game/playerStats';
import { drainStamina, drainGuardStamina } from '../game/playerDash';
import { damagePlayer, isPlayerInvincible } from '../game/playerHp';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Vector3, Group } from 'three';
import { updateBossHP, updateKingCoreHP } from '../game/bossHPBus';
import { spawnDamagePopup } from './DamagePopups';

interface BossKingProps {
  isGameOver?: boolean;
  isPaused?: boolean;
}

export function BossKing({ isGameOver = false, isPaused = false }: BossKingProps) {
  const [spawned, setSpawned] = useState(false);
  const spawnedSyncRef = useRef(false);

  const centerRef = useRef(new Vector3(0, 0, 0));
  const coreSlots = useRef<number[]>([]);
  const shieldSlots = useRef<number[]>([]);
  const shieldBoardHp = useRef<number[]>(new Array(9).fill(5000));
  const lastBoardHp = useRef<number[]>(new Array(9).fill(5000));

  const unitGroupsRef = useRef<(Group | null)[]>([]);
  const rotationRef = useRef({ angle: 0 });
  const coreMatRefs = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const coreFireTimers = useRef<number[]>([0, 0, 0]);
  const shotTimerRef = useRef(0);
  const currentShooterIndexRef = useRef(0); // 0, 1, 2 のローテーション
  // 波紋データ: { id, x, z, radius, color, damage }
  const ripplesRef = useRef<any[]>([]);
  const [rippleList, setRippleList] = useState<any[]>([]);
  // シールドの生存状態を追跡（生->死 のエッジ検出用）
  const prevShieldsAliveRef = useRef<boolean[]>(new Array(9).fill(false));
  // UI表示は BossUI(DOM) で行うため、ここではデータ通知のみを行う

  // Reuse Vector3 to avoid GC pressure
  const posHelper = useMemo(() => new Vector3(), []);
  const axisY = useMemo(() => new Vector3(0, 1, 0), []);

  const physicalPointsRef = useRef<Vector3[]>([]);
  if (physicalPointsRef.current.length === 0) {
    for (let i = 0; i < 108; i++) physicalPointsRef.current.push(new Vector3(99999, 0, 99999));
  }
  const physicalRefsPool = useRef<React.MutableRefObject<Vector3>[]>([]);
  if (physicalRefsPool.current.length === 0) {
    physicalPointsRef.current.forEach(v => {
      physicalRefsPool.current.push({ current: v });
    });
  }
  const shieldGeometries = useMemo(() => {
    const geometries: THREE.ExtrudeGeometry[] = [];
    const radii = [11.0, 9.5, 8.0];
    const thickness = 1.0;
    const thetaLength = (Math.PI * 2) / 3;
    radii.forEach(r => {
      const s = new THREE.Shape();
      const outerR = r + thickness / 2;
      const innerR = r - thickness / 2;
      // 数学的に厳密に定義し、パスを閉じる
      s.moveTo(outerR, 0);
      s.absarc(0, 0, outerR, 0, thetaLength, false);
      s.lineTo(innerR * Math.cos(thetaLength), innerR * Math.sin(thetaLength));
      s.absarc(0, 0, innerR, thetaLength, 0, true);
      s.lineTo(outerR, 0);
      s.closePath();

      const geo = new THREE.ExtrudeGeometry(s, { depth: 4.0, bevelEnabled: false });
      geometries.push(geo);
    });
    return geometries;
  }, []);

  useEffect(() => {
    window.__kingPosRefs = [];
    window.__isKingActive = false;
    window.__isGameClear = false;
    // 範囲指定の波紋消去リスナー
    const unsubClearRadius = onClearEnemyProjectilesInRadius((cx, cz, radius) => {
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const rpl = ripplesRef.current[i];
        const dist = Math.hypot(rpl.x - cx, rpl.z - cz);
        if (Math.abs(dist - rpl.radius) <= radius) {
          ripplesRef.current.splice(i, 1);
        }
      }
    });

    registerRippleCheck((px, pz, barrierRadius) => {
      // 波紋の中心からの距離と、波紋の拡大半径を確認
      // 波紋はプレイヤーが中心でない場合もあるので、厳密に判定
      const r = 0.25; // 比率 0.25 (見た目1.0mに対して)
      return ripplesRef.current.some(rpl => {
        const dist = Math.hypot(rpl.x - px, rpl.z - pz);
        // 波紋の端（半径 + 厚み）がバリア内に収まっているか
        return (dist + rpl.radius + r <= barrierRadius + 0.001);
      });
    });

    return () => {
      window.__kingPosRefs = [];
      window.__isKingActive = false;
      unsubClearRadius();
      registerRippleCheck(() => false);
    };
  }, []);

  useFrame((_state, delta) => {
    if (isGameOver || isPaused) return;

    if (!spawned && !spawnedSyncRef.current) {
      if (getGlobalGameTime() >= 780) {
        spawnedSyncRef.current = true; // 即座にロック
        const px = 0;
        const pz = 0;
        centerRef.current.set(px, 0, pz);

        const basePawnHp = calcMaxHp(getGlobalGameTime());
        const shieldHp = basePawnHp * 100.0; // 耐久力（100倍）に調整

        for (let i = 0; i < 3; i++) {
          const slot = findInactiveSlot();
          if (slot >= 0) {
            respawnEnemy(slot, px + 20, pz + 20, getGlobalGameTime(), 5);
            coreSlots.current.push(slot);
          }
        }
        for (let i = 0; i < 81; i++) {
          const slot = findInactiveSlot();
          if (slot >= 0) {
            respawnEnemy(slot, px + 25, pz + 25, getGlobalGameTime(), 6);
            updateEnemyHp(slot, shieldHp); // 共有HPと同期させて誤ダメージを防ぐ
            shieldSlots.current.push(slot);
          }
        }

        shieldBoardHp.current = new Array(9).fill(shieldHp);
        lastBoardHp.current = new Array(9).fill(shieldHp);
        prevShieldsAliveRef.current = new Array(9).fill(true); // 初期化：最初は全て「生存」状態とする



        window.__isKingActive = true;
        window.__kingCenter = centerRef.current;
        window.__kingCoreSlots = coreSlots.current; // 三すくみ判定用にスロット情報を公開
        setSpawned(true);
      }
      return;
    }

    if (window.__isGameClear) return;

    let currentHpSum = 0;
    let aliveCores = 0;
    coreSlots.current.forEach(slot => {
      if (isEnemyAlive(slot)) {
        aliveCores++;
        currentHpSum += getEnemyHp(slot);
      }
    });

    // 共有HP同期 (全ての弾のダメージを合算して反映)
    for (let b = 0; b < 9; b++) {
      let totalDmg = 0;
      for (let p = 0; p < 9; p++) {
        const slot = shieldSlots.current[b * 9 + p];
        if (slot === undefined) continue;
        const hp = getEnemyHp(slot);
        const dmg = lastBoardHp.current[b] - hp;
        if (dmg > 0) totalDmg += dmg;
      }
      if (totalDmg > 0) {
        shieldBoardHp.current[b] -= totalDmg;
        lastBoardHp.current[b] = shieldBoardHp.current[b];
      }
      if (shieldBoardHp.current[b] > 0) {
        currentHpSum += shieldBoardHp.current[b];
      }
    }

    // --- シールド破壊時の波紋発生処理 ---
    const px = window.__playerPosRef?.current?.x || centerRef.current.x;
    const pz = window.__playerPosRef?.current?.z || centerRef.current.z;

    for (let i = 0; i < 9; i++) {
      const u = Math.floor(i / 3);
      const shieldAlive = shieldBoardHp.current[i] > 0;

      if (prevShieldsAliveRef.current[i] && !shieldAlive) {
        const initialAngle = (u * Math.PI * 2) / 3;
        const unitBaseAngle = -(rotationRef.current.angle + initialAngle);
        posHelper.set(13.0, 0, 0).applyAxisAngle(axisY, unitBaseAngle);
        const coreX = centerRef.current.x + posHelper.x;
        const coreZ = centerRef.current.z + posHelper.z;
        const color = u === 0 ? '#FF4500' : u === 1 ? '#00FFFF' : '#FFD700';
        ripplesRef.current.push({
          id: Math.random().toString(36).substr(2, 9),
          x: coreX,
          z: coreZ,
          radius: 0,
          color,
          createdAt: getGlobalGameTime(),
          hasHitPlayer: false,
          coreIndex: u  // 0=fire, 1=ice, 2=lightning
        });

        // クイーンの「Blink!」風のポップアップを表示（発動したコアの頭上に表示）
        spawnDamagePopup(coreX, 4.0, coreZ, 'Counter!', 0, '#ff1744', '#000000', -1.5);
      }
      prevShieldsAliveRef.current[i] = shieldAlive;
    }

    // --- 波紋の拡大と当たり判定 ---
    for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
      const rpl = ripplesRef.current[i];
      rpl.radius += 10.0 * delta;

      if (rpl.radius > 23.0) {
        ripplesRef.current.splice(i, 1);
        continue;
      }

      const dist = Math.sqrt((px - rpl.x) ** 2 + (pz - rpl.z) ** 2);
      // 当たり判定ゾーンを比率0.6 (0.3*2) に設定
      if (!rpl.hasHitPlayer && Math.abs(dist - rpl.radius) <= 0.3) {
        if (isPlayerGuarding()) {
          // ガード時: 触れた直後にSPが50減り、判定が消滅する
          drainGuardStamina(50.0);
          rpl.hasHitPlayer = true;
        } else {
          // 生身の場合（常に damagePlayer を呼び出す。内部で無敵・ジャスト回避を処理）
          const defense = playerStatsRef.current.defense || 0;
          let finalDamage = Math.max(1, (getEnemyBaseDamage() - defense)) * 8.0;
          
          if (isPlayerBoosting()) finalDamage *= 2.0;
          
          const result = damagePlayer(finalDamage);
          if (result === 'damaged' || result === 'dead') {
             spawnDamagePopup(0, 2.5, 2.0, finalDamage, 0, '#FFFFFF', '#FF0000', -1.5, true);
          }

          // 一度判定が発生した波紋は、無敵時間中であっても再度判定されないようにロックする
          if (result !== 'none') rpl.hasHitPlayer = true;

          // 属性やられを付与（実際にダメージを受けた、または死んだ時のみ）
          if (result === 'damaged' || result === 'dead') {
            const debuffTypes: ('fire' | 'ice' | 'lightning')[] = ['fire', 'ice', 'lightning'];
            applyPlayerDebuff(debuffTypes[rpl.coreIndex] || 'fire');
          }
        }
      }
    }

    // ステートを更新してレンダリングをトリガー
    if (ripplesRef.current.length > 0 || rippleList.length > 0) {
      setRippleList([...ripplesRef.current]);
    }

    if (aliveCores === 0) {
      window.__isGameClear = true;
      window.__isKingActive = false;
      updateBossHP({ active: false, name: '', hp: 0, maxHp: 0 });
      updateKingCoreHP({ active: false, cores: [] });
      window.dispatchEvent(new Event('game-clear'));
      return;
    }

    // 各コアのHPデータをUI用に更新
    const newCoreHps = [0, 1, 2].map(u => {
      const slot = coreSlots.current[u];
      const alive = isEnemyAlive(slot);
      return {
        hp: alive ? getEnemyHp(slot) : 0,
        maxHp: getEnemyMaxHp(slot),
        alive: alive
      };
    });
    updateKingCoreHP({ active: true, cores: newCoreHps });
    // 既存の1本ゲージ（UI）は非表示にする
    updateBossHP({ active: false, name: '', hp: 0, maxHp: 1 });

    // デバフチェック: コアのデバフを個別に処理しつつ、全体の鈍足率を計算
    let maxIceSlowRate = 0;
    let maxLightningSlowRate = 0;
    for (let ci = 0; ci < 3; ci++) {
      const cSlot = coreSlots.current[ci];
      if (isEnemyAlive(cSlot)) {
        const d = getEnemyDebuff(cSlot);
        if (d.iceSlowRate > maxIceSlowRate) maxIceSlowRate = d.iceSlowRate;
        if (d.lightningSlowRate > maxLightningSlowRate) maxLightningSlowRate = d.lightningSlowRate;

        // --- 個別の DoT (炎) 処理 ---
        if (d.fireSlipDps > 0) {
          coreFireTimers.current[ci] += delta;
          if (coreFireTimers.current[ci] >= 1.0) {
            coreFireTimers.current[ci] -= 1.0;
            const guaranteedDamage = Math.max(1, d.fireSlipDps);
            applyDoT(cSlot, guaranteedDamage);
            // コア位置を取得してポップアップ (コアの頂上付近 Y=4.5)
            const initialAngle = (ci * Math.PI * 2) / 3;
            const unitBaseAngle = -(rotationRef.current.angle + initialAngle);
            posHelper.set(13.0, 0, 0).applyAxisAngle(axisY, unitBaseAngle);
            spawnDamagePopup(centerRef.current.x + posHelper.x, 4.5, centerRef.current.z + posHelper.z, guaranteedDamage, 0, '#FF4500', '#FFFFFF', 1.5);
          }
        } else {
          coreFireTimers.current[ci] = 0;
        }

        // --- 個別の視覚演出の適用 (属性カラーを保ちつつ、パルス点滅で分かりやすく) ---
        const mat = coreMatRefs.current[ci];
        if (mat) {
          const baseColorStr = ci === 0 ? '#FF4500' : ci === 1 ? '#00FFFF' : '#FFD700';
          const baseColor = new THREE.Color(baseColorStr);

          // デバフ中はパルス点滅させる (10Hz)
          const isDebuffed = d.fireSlipDps > 0 || d.iceSlowRate > 0 || d.lightningSlowRate > 0;
          const pulse = isDebuffed ? Math.sin(_state.clock.elapsedTime * 10) * 0.5 + 0.5 : 0;

          if (d.fireSlipDps > 0) {
            mat.color.copy(baseColor).lerp(new THREE.Color('#ff0000'), 0.2 + pulse * 0.2);
            mat.emissive.copy(baseColor).lerp(new THREE.Color('#ff4500'), 0.5);
          } else if (d.iceSlowRate > 0) {
            mat.color.copy(baseColor).lerp(new THREE.Color('#00ffff'), 0.2 + pulse * 0.2);
            mat.emissive.copy(baseColor).lerp(new THREE.Color('#b2ebf2'), 0.5);
          } else if (d.lightningSlowRate > 0) {
            mat.color.copy(baseColor).lerp(new THREE.Color('#ffff00'), 0.2 + pulse * 0.2);
            mat.emissive.copy(baseColor).lerp(new THREE.Color('#fff9c4'), 0.5);
          } else {
            mat.color.copy(baseColor);
            mat.emissive.copy(baseColor);
          }

          // デバフ中は発光強度を 1.5 〜 4.0 で明滅させる
          mat.emissiveIntensity = 1.5 + pulse * 2.5;
        }
      }
    }

    // 氷属性は物理的な回転速度に影響
    const orbitSpeed = 0.3 * (4 - aliveCores) * (1.0 - maxIceSlowRate);
    rotationRef.current.angle += orbitSpeed * delta;

    const cx = centerRef.current.x;
    const cz = centerRef.current.z;

    // --- N-Way射撃処理 ---
    if (window.__isKingActive && aliveCores > 0) {
      let interval = 2.0;
      let bulletCount = 3;
      let gapDeg = 30;

      if (aliveCores === 2) {
        interval = 1.0;
        bulletCount = 4;
        gapDeg = 20;
      } else if (aliveCores === 1) {
        interval = 0.5;
        bulletCount = 5;
        gapDeg = 15;
      }

      const shooterBaseIdx = currentShooterIndexRef.current;
      const shooterSlot = coreSlots.current[shooterBaseIdx];
      const shooterAlive = isEnemyAlive(shooterSlot);

      // 雷デバフによるスロウでタイマー進行を遅らせる
      const slowRate = shooterAlive ? getEnemyDebuff(shooterSlot).lightningSlowRate : 0;
      shotTimerRef.current += delta * (1.0 - slowRate);

      if (shotTimerRef.current >= interval) {
        if (!shooterAlive) {
          // 死んでいる場合はタイマーをそのままで次へ（次フレームですぐ発動を試みる）
          currentShooterIndexRef.current = (shooterBaseIdx + 1) % 3;
        } else {
          shotTimerRef.current = 0;

          // 発射地点の算出
          const initialAngle = (shooterBaseIdx * Math.PI * 2) / 3;
          const unitBaseAngle = -(rotationRef.current.angle + initialAngle);

          posHelper.set(13.0, 0, 0).applyAxisAngle(axisY, unitBaseAngle);
          const shooterX = cx + posHelper.x;
          const shooterZ = cz + posHelper.z;

          const px = window.__playerPosRef?.current?.x || cx;
          const pz = window.__playerPosRef?.current?.z || cz;

          const dx = px - shooterX;
          const dz = pz - shooterZ;
          const baseAngle = Math.atan2(dz, dx);
          const gapRad = gapDeg * (Math.PI / 180);

          for (let i = 0; i < bulletCount; i++) {
            const offsetAngle = (i - (bulletCount - 1) / 2) * gapRad;
            const angle = baseAngle + offsetAngle;
            const targetX = shooterX + Math.cos(angle) * 10;
            const targetZ = shooterZ + Math.sin(angle) * 10;

            const bulletSpeed = 10.0 * (1.0 - slowRate);
            // 寿命を1.5sに固定（雷デバフ時は弾が遅くなるため、飛距離も短くなる）
            const bulletLife = 1.5;

            spawnEnemyProjectile({
              x: shooterX,
              z: shooterZ,
              targetX,
              targetZ,
              speed: bulletSpeed,
              damage: getEnemyBaseDamage(),
              multiplier: 4.0,
              life: bulletLife,
              sourceType: 5,
            });
          }

          currentShooterIndexRef.current = (shooterBaseIdx + 1) % 3;
        }
      }
    }

    for (let u = 0; u < 3; u++) {
      const coreSlot = coreSlots.current[u];
      const initialAngle = (u * Math.PI * 2) / 3;
      const unitAngle = rotationRef.current.angle + initialAngle;
      const unitBaseAngle = -unitAngle;

      const group = unitGroupsRef.current[u];
      if (group) group.rotation.y = unitBaseAngle;

      // コアの判定座標 (applyAxisAngle で確実に同期)
      if (isEnemyAlive(coreSlot)) {
        posHelper.set(13.0, 0, 0);
        posHelper.applyAxisAngle(axisY, unitBaseAngle);
        updateEnemyPos(coreSlot, cx + posHelper.x, cz + posHelper.z);
        consumeKnockback(coreSlot);
      } else {
        updateEnemyPos(coreSlot, 99999, 99999);
      }

      const shieldRadii = [11.0, 9.5, 8.0];
      for (let s = 0; s < 3; s++) {
        const boardIdx = u * 3 + s;
        const r = shieldRadii[s];
        const staggerOffset = 0; // コア正面(0度方向)に配置

        for (let p = 0; p < 9; p++) {
          const slot = shieldSlots.current[boardIdx * 9 + p];
          if (slot === undefined) continue;

          if (shieldBoardHp.current[boardIdx] > 0) {
            const spreadAngle = (p / 8 - 0.5) * (Math.PI * 2 / 3);
            const worldAngle = unitBaseAngle + staggerOffset + spreadAngle;

            posHelper.set(r, 0, 0);
            posHelper.applyAxisAngle(axisY, worldAngle);

            updateEnemyHp(slot, shieldBoardHp.current[boardIdx]);
            updateEnemyPos(slot, cx + posHelper.x, cz + posHelper.z);
          } else {
            updateEnemyPos(slot, 99999, 99999);
            if (isEnemyAlive(slot)) damageEnemy(slot, 99999, false, false);
          }
        }
      }
    }

    if (window.__isKingActive) {
      let activeIdx = 0;
      const shieldRadii = [11.0, 9.5, 8.0];
      for (let u = 0; u < 3; u++) {
        const unitAngle = rotationRef.current.angle + (u * Math.PI * 2) / 3;
        const unitBaseAngle = -unitAngle;
        for (let s = 0; s < 3; s++) {
          if (shieldBoardHp.current[u * 3 + s] > 0) {
            const r = shieldRadii[s];
            const staggerOffset = 0; // コア正面(0度方向)に配置
            for (let i = 0; i < 12; i++) {
              if (activeIdx < physicalPointsRef.current.length) {
                const stepAngle = (i / 11 - 0.5) * (Math.PI * 2 / 3);
                const worldAngle = unitBaseAngle + staggerOffset + stepAngle;

                posHelper.set(r, 0, 0);
                posHelper.applyAxisAngle(axisY, worldAngle);

                physicalPointsRef.current[activeIdx].set(cx + posHelper.x, 0, cz + posHelper.z);
                activeIdx++;
              }
            }
          }
        }
      }
      for (let i = activeIdx; i < physicalPointsRef.current.length; i++) {
        physicalPointsRef.current[i].set(99999, 0, 99999);
      }
      window.__kingPosRefs = physicalRefsPool.current;
    }
  });

  if (!spawned) return null;
  const cx = centerRef.current.x;
  const cz = centerRef.current.z;

  return (
    <group position={[cx, 0, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
        <ringGeometry args={[11.5, 12.0, 64]} />
        <meshBasicMaterial color="#ff0000" transparent opacity={0.3} />
      </mesh>

      {[0, 1, 2].map(u => {
        const initialAngle = (u * Math.PI * 2) / 3;
        return (
          <group key={'unit' + u} ref={el => unitGroupsRef.current[u] = el} rotation={[0, -initialAngle, 0]}>
            <mesh position={[13.0, 2.0, 0]} visible={isEnemyAlive(coreSlots.current[u])}>
              <octahedronGeometry args={[2.0, 0]} />
              <meshStandardMaterial
                ref={el => coreMatRefs.current[u] = el}
                color={u === 0 ? '#FF4500' : u === 1 ? '#00FFFF' : '#FFD700'}
                emissive={u === 0 ? '#FF4500' : u === 1 ? '#00FFFF' : '#FFD700'}
                emissiveIntensity={1.5}
              />
            </mesh>

            {[11.0, 9.5, 8.0].map((radius, s) => {
              const boardIdx = u * 3 + s;
              const shieldAlive = shieldBoardHp.current[boardIdx] > 0;

              if (!shieldAlive) return null;

              return (
                <mesh
                  key={'sh-' + u + '-' + s}
                  rotation={[-Math.PI / 2, 0, -Math.PI / 3]}
                  position={[0, 0, 0]}
                  geometry={shieldGeometries[s]}
                >
                  <meshStandardMaterial
                    color="#ffffffff"
                    emissive="#000000ff"
                    emissiveIntensity={0.5}
                    transparent
                    opacity={0.2}
                    side={THREE.DoubleSide}
                  />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {rippleList.map(rpl => (
        <mesh key={rpl.id} position={[rpl.x - cx, 0.1, rpl.z - cz]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[Math.max(0.01, rpl.radius - 0.5), rpl.radius + 0.5, 64]} />
          <meshStandardMaterial color={rpl.color} emissive={rpl.color} emissiveIntensity={2.0} transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
