import {
  getGlobalGameTime,
  findInactiveSlot,
  respawnEnemy,
  isEnemyAlive,
  getEnemyHp,
  getEnemyMaxHp,
  updateEnemyPos,
  spawnEnemyProjectile,
  getEnemyBaseDamage,
  consumeKnockback,
  getEnemyDebuff,
  applyDoT
} from '../game/collisionBus';
import { useState, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Vector3 } from 'three';
import { updateBossHP } from '../game/bossHPBus';
import { damagePlayer } from '../game/playerHp';
import { spawnDamagePopup } from './DamagePopups';
import { Billboard } from '@react-three/drei';
import { generateRandomItem } from '../game/items/itemGenerator';
import { spawnDrop } from '../game/dropBus';
import { Rarity } from '../game/items/itemTypes';
import { addExp, getLevel } from '../game/playerLevel';

interface BossQueenProps {
  isGameOver?: boolean;
  isPaused?: boolean;
}

export function BossQueen({ isGameOver = false, isPaused = false }: BossQueenProps) {
  const [spawned, setSpawned] = useState(false);
  const bossIdxRef = useRef<number>(-1);
  const meshRef = useRef<any>(null);
  const auraRef = useRef<any>(null);
  const bodyMatRef = useRef<any>(null);
  const bossPosRef = useRef(new Vector3(0, -100, 0));

  useEffect(() => {
    window.__queenPosRef = bossPosRef;
    window.__isQueenActive = false;
    window.__isQueenDefeated = false;
    return () => {
      window.__queenPosRef = null;
      window.__isQueenActive = false;
    };
  }, []);

  const stateRef = useRef({
    actionTimer: 0,
    actionCount: 0,
    dead: false,
    hpRatio: 1,
    lastHP: 0,
    maxHP: 0,
    fireTimer: 0,
  });

  const [uiHpRatio, setUiHpRatio] = useState(1);

  useFrame((state, delta) => {
    if (isGameOver || isPaused) return;

    if (!spawned) {
      // 本番仕様: 10分(600秒)到達時にスポーンさせる
      if (getGlobalGameTime() >= 600) {
        const slot = findInactiveSlot();
        if (slot >= 0) {
          const px = window.__playerPosRef?.current.x || 0;
          const pz = window.__playerPosRef?.current.z || 0;
          // カメラやプレイヤーの視界外から出現
          const spawnDx = (Math.random() < 0.5 ? 1 : -1) * 20;
          const spawnDz = (Math.random() < 0.5 ? 1 : -1) * 20;

          respawnEnemy(slot, px + spawnDx, pz + spawnDz, 600, 4);
          bossIdxRef.current = slot;
          setSpawned(true);
          window.__isQueenActive = true;
        }
      }
      return;
    }

    if (stateRef.current.dead) return;

    // HPが0になって InstancedEnemies / collisionBus 側で死亡判定されたら非表示へ
    if (!isEnemyAlive(bossIdxRef.current)) {
      // 死亡した瞬間の座標を取得
      const bx = meshRef.current.position.x;
      const bz = meshRef.current.position.z;

      stateRef.current.dead = true;
      if (meshRef.current) {
        meshRef.current.position.set(0, -100, 0);
      }
      // 物理衝突判定を無効化するため、座標を遥か彼方へ送る
      bossPosRef.current.set(99999, 1.5, 99999);
      // フラグをOFFにする（Player側の判定を完全にスキップさせる）
      window.__isQueenActive = false;

      // --- 撃破報酬の実装 ---

      // 1. 経験値 5000 を付与
      addExp(5000);

      // 2. クイーン専用のレアリティ抽選テーブル（3ランクアップ）
      const queenRarityWeights = [
        { rarity: Rarity.Rare, weight: 1000 },
        { rarity: Rarity.Epic, weight: 400 },
        { rarity: Rarity.Legendary, weight: 160 },
        { rarity: Rarity.Mythic, weight: 64 },
        { rarity: Rarity.Immortal, weight: 25.6 },
        { rarity: Rarity.Celestial, weight: 16.62976 },
      ];
      const totalWeight = queenRarityWeights.reduce((sum, rw) => sum + rw.weight, 0);

      const getQueenDropRarity = () => {
        let r = Math.random() * totalWeight;
        for (const rw of queenRarityWeights) {
          if (r < rw.weight) return rw.rarity;
          r -= rw.weight;
        }
        return Rarity.Rare;
      };

      // 3. アイテムを40個生成して周囲にばらまく
      const dropMult = window.__systemUpgrades?.dropMult || 1.0;
      const dropCount = Math.floor(40 * dropMult);
      const currentLv = getLevel();

      for (let i = 0; i < dropCount; i++) {
        const rarity = getQueenDropRarity();
        // 現在のプレイヤーレベルを基準にアイテム生成
        const item = generateRandomItem(currentLv, rarity);

        // クイーンの周囲 1.0m 〜 4.5m の範囲にランダムに散らばらせる
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 3.5 + 1.0;
        const dropX = bx + Math.cos(angle) * distance;
        const dropZ = bz + Math.sin(angle) * distance;

        spawnDrop(dropX, dropZ, item);
      }

      // 討伐完了
      window.__isQueenDefeated = true;
      window.__queenKilled = true;

      // UIを非表示に更新
      updateBossHP({ active: false, name: '', hp: 0, maxHp: 0 });
      return;
    }

    const hp = getEnemyHp(bossIdxRef.current);
    const maxHp = getEnemyMaxHp(bossIdxRef.current);
    const rat = Math.max(0, hp / maxHp);

    // UIの描画更新は差分がある程度大きい時だけ実行して最適化
    if (Math.abs(stateRef.current.hpRatio - rat) > 0.005 || stateRef.current.lastHP !== hp) {
      stateRef.current.hpRatio = rat;
      stateRef.current.lastHP = hp;
      stateRef.current.maxHP = maxHp;
      setUiHpRatio(rat);

      // 下部ボスUIのために情報を送信
      updateBossHP({
        active: true,
        name: '最重要脅威個体 Queen',
        hp: hp,
        maxHp: maxHp,
      });
    }

    // デバフ状態の取得
    const debuff = getEnemyDebuff(bossIdxRef.current);
    const iceSlowRate = debuff.iceSlowRate;
    const lightningSlowRate = debuff.lightningSlowRate;

    // 雷属性はアクション周期（機構）に影響
    const actionDelta = delta * (1.0 - lightningSlowRate);

    const px = window.__playerPosRef?.current.x || 0;
    const pz = window.__playerPosRef?.current.z || 0;

    let bx = meshRef.current.position.x;
    let bz = meshRef.current.position.z;

    // --- DoT (炎スリップ) 処理 ---
    if (!isGameOver && debuff.fireSlipDps > 0) {
      stateRef.current.fireTimer += delta;
      if (stateRef.current.fireTimer >= 1.0) {
        stateRef.current.fireTimer -= 1.0;
        const guaranteedDamage = Math.max(1, debuff.fireSlipDps);
        applyDoT(bossIdxRef.current, guaranteedDamage);
        spawnDamagePopup(bx, 1.2, bz, guaranteedDamage, 0, '#FF4500', '#FFFFFF');
      }
    } else {
      stateRef.current.fireTimer = 0;
    }


    // ボスなのでノックバックには強い耐性を持たせる (0.1倍)
    const kb = consumeKnockback(bossIdxRef.current);
    if (kb.x !== 0 || kb.z !== 0) {
      bx += kb.x * 0.1;
      bz += kb.z * 0.1;
    }

    // 自身の位置を同期（Player.tsx側での衝突解決用）
    bossPosRef.current.set(bx, 1.5, bz);

    // プレイヤーとクイーンの座標の差分（XとZのみ）
    const dx = px - bx;
    const dz = pz - bz;
    const distance = Math.sqrt(dx * dx + dz * dz);

    stateRef.current.actionTimer += actionDelta;
    const nextIsBlink = (stateRef.current.actionCount + 1) % 4 === 1;

    // --- 1. 発光予兆とデバフカラーの適用 (マイルド版) ---
    if (bodyMatRef.current) {
      const baseBodyColor = new Color('#1a0033');
      const baseEmissiveColor = new Color('#7b1fa2');

      // ベースカラーの決定
      if (debuff.fireSlipDps > 0) bodyMatRef.current.color.copy(baseBodyColor).lerp(new Color('#ff4d4d'), 0.4);
      else if (debuff.iceSlowRate > 0) bodyMatRef.current.color.copy(baseBodyColor).lerp(new Color('#4dd0e1'), 0.4);
      else if (debuff.lightningSlowRate > 0) bodyMatRef.current.color.copy(baseBodyColor).lerp(new Color('#fff176'), 0.4);
      else bodyMatRef.current.color.copy(baseBodyColor);

      // エミッシブカラーの決定
      if (debuff.fireSlipDps > 0) bodyMatRef.current.emissive.copy(baseEmissiveColor).lerp(new Color('#ff0000'), 0.5);
      else if (debuff.iceSlowRate > 0) bodyMatRef.current.emissive.copy(baseEmissiveColor).lerp(new Color('#00e5ff'), 0.5);
      else if (debuff.lightningSlowRate > 0) bodyMatRef.current.emissive.copy(baseEmissiveColor).lerp(new Color('#ffea00'), 0.5);
      else bodyMatRef.current.emissive.copy(baseEmissiveColor);

      // 強度の決定 (予兆時は強く)
      if (stateRef.current.actionTimer >= 1.5 && !nextIsBlink) {
        bodyMatRef.current.emissiveIntensity = 5.0;
      } else {
        bodyMatRef.current.emissiveIntensity = 1.5;
      }
    }

    // --- 2. アクションの実行 (2秒周期) ---
    if (stateRef.current.actionTimer >= 2.0) {
      stateRef.current.actionTimer = 0;
      stateRef.current.actionCount++;

      if (stateRef.current.actionCount % 4 === 1) {
        // 【ブリンク実行】プレイヤーの周囲 3m の位置にワープ
        const angle = Math.random() * Math.PI * 2;
        bx = px + Math.cos(angle) * 3.0;
        bz = pz + Math.sin(angle) * 3.0;
        spawnDamagePopup(bx, 4.0, bz, 'Blink!', 0, '#ff1744', '#000000', -1.5);
      } else {
        // 【魔法弾実行】全方位（16方向）へ魔法弾を発射
        const splitCount = 16;
        for (let i = 0; i < splitCount; i++) {
          const a = (i / splitCount) * Math.PI * 2 + state.clock.elapsedTime;
          const targetX = bx + Math.cos(a) * 10;
          const targetZ = bz + Math.sin(a) * 10;
          const bulletSpeed = 10.0 * (1.0 - lightningSlowRate);
          // 寿命を1.5sに固定（雷デバフ時は弾が遅くなるため、飛距離も短くなる）
          const bulletLife = 1.5;

          spawnEnemyProjectile({
            x: bx,
            z: bz,
            targetX,
            targetZ,
            speed: bulletSpeed,
            damage: getEnemyBaseDamage(),
            multiplier: 4.0,
            sourceType: 4,
            life: bulletLife,
          });
        }
      }
    }

    // --- 3. 通常移動 (追従) ---
    if (distance > 0.1) {
      // 氷属性は物理的な移動速度に影響
      const speed = 6.0 * (1.0 - iceSlowRate);
      bx += (dx / distance) * speed * delta;
      bz += (dz / distance) * speed * delta;
    }

    // 近づくとダメージを受けるオーラ
    const auraRadius = 4.5;
    if (distance < auraRadius) {
      // 無敵時間は有効だが、オーラ自体は新たな無敵を発生させないスリップダメージ
      damagePlayer(0.1, true);
    }

    if (auraRef.current) {
      auraRef.current.rotation.y += delta * 2;
      const scaleBounce = 1.0 + Math.sin(state.clock.elapsedTime * 8) * 0.05;
      auraRef.current.scale.set(scaleBounce, Math.max(0.5, scaleBounce * 0.8), scaleBounce);
    }

    // 20m フィールド境界の適用
    const distSqToOrigin = bx * bx + bz * bz;
    if (distSqToOrigin > 400.0) { // 20 * 20
      const distToOrigin = Math.sqrt(distSqToOrigin);
      bx = (bx / distToOrigin) * 20.0;
      bz = (bz / distToOrigin) * 20.0;
    }

    // 座標の更新
    meshRef.current.position.set(bx, 1.5, bz);

    // Y軸の回転のみ残し、X/Zのぐらつき（浮遊アニメーション）は削除
    meshRef.current.rotation.y += delta;

    updateEnemyPos(bossIdxRef.current, bx, bz);
  });

  if (!spawned || stateRef.current.dead) return null;

  return (
    <group ref={meshRef}>
      {/* ボス本体 (通常の3〜4倍のサイズを持つ多面体) */}
      <mesh castShadow renderOrder={5}>
        <octahedronGeometry args={[1.5, 0]} />
        <meshStandardMaterial
          ref={bodyMatRef}
          color="#1a0033"
          emissive="#7b1fa2"
          emissiveIntensity={1.5}
          wireframe={false}
          metalness={0.8}
          roughness={0.2}
          depthWrite={true}
        />
      </mesh>

      {/* 内部コアは削除 (指示通り) */}

      {/* ダメージオーラ */}
      <mesh ref={auraRef} position={[0, -1.0, 0]}>
        <sphereGeometry args={[4.5, 32, 16]} />
        <meshStandardMaterial
          color="#ff0000"
          transparent opacity={0.15}
          emissive="#ff0000"
          emissiveIntensity={2}
          depthWrite={false}
          wireframe={true}
        />
      </mesh>

      {/* 頭上HPバー (Billboard Mesh 方式) */}
      <group position={[0, 4.0, 0]}>
        <Billboard>
          {/* 外枠 */}
          <mesh>
            <planeGeometry args={[2.2, 0.2]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.6} depthTest={false} />
          </mesh>
          {/* 中身（体力） */}
          <mesh position={[(2.0 * uiHpRatio - 2.0) / 2, 0, 0.01]}>
            <planeGeometry args={[2.0 * uiHpRatio, 0.15]} />
            <meshBasicMaterial color="#ff1744" depthTest={false} />
          </mesh>
        </Billboard>
      </group>
    </group>
  );
}
