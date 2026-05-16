import { memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import type { Group } from 'three';

/**
 * 軽量ダメージポップアップ（Floating Text）
 * Billboard + Text で常にカメラに正面を向ける方式に復元・改修
 */

export const DamageCritType = {
  None: 0,
  Critical: 1,
  SuperCritical: 2,
} as const;
export type DamageCritType = typeof DamageCritType[keyof typeof DamageCritType];

interface PopupData {
  active: boolean;
  x: number;
  y: number;
  z: number;
  damage: number | string;
  critType: number; // 0: None, 1: Critical, 2: SuperCritical
  age: number;      // 秒
  color: string;
  outlineColor: string;
  vy: number;
  isFollowing: boolean;
}

const MAX_POPUPS = 128;
const POPUP_LIFETIME = 0.8;    // 秒
// RISE_SPEED は vy プロパティ導入により廃止されました

// ===================================
// グローバルプール（モジュールスコープ）
// ===================================
const _pool: PopupData[] = Array.from({ length: MAX_POPUPS }, () => ({
  active: false,
  x: 0,
  y: 0,
  z: 0,
  damage: 0,
  critType: 0,
  age: 0,
  color: '#ffffff',
  outlineColor: '#000000',
  vy: 2.5,
  isFollowing: false,
}));

let _nextSlot = 0;

/**
 * ダメージポップアップを生成（外部から呼び出し用）
 */
export function spawnDamagePopup(
  x: number,
  y: number,
  z: number,
  damage: number | string,

  critTypeRaw: any = 0,
  color: string = '#ffffff',
  outlineColor: string = '#000000',
  vy: number = 2.5, // 追加 (デフォルトは上に2.5)
  isFollowing: boolean = false
) {
  let parsedCritType = 0;
  if (critTypeRaw === true) parsedCritType = 1;
  else if (typeof critTypeRaw === 'number') parsedCritType = critTypeRaw;

  for (let i = 0; i < MAX_POPUPS; i++) {
    const idx = (_nextSlot + i) % MAX_POPUPS;
    if (!_pool[idx].active) {
      const p = _pool[idx];
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.damage = damage;
      p.critType = parsedCritType;
      p.age = 0;
      p.color = color;
      p.outlineColor = outlineColor;
      p.vy = vy;
      p.isFollowing = isFollowing;
      _nextSlot = (idx + 1) % MAX_POPUPS;
      return;
    }
  }
}

// ===================================
// 個別の Ref 管理用
// ===================================
const _groupRefs: (Group | null)[] = Array.from({ length: MAX_POPUPS }, () => null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _textRefs: any[] = Array.from({ length: MAX_POPUPS }, () => null);

function PopupText({ index }: { index: number }) {
  return (
    <group
      ref={(el) => { _groupRefs[index] = el; }}
      visible={false}
    >
      <Billboard>
        <Text
          ref={(el) => { _textRefs[index] = el; }}
          font="/fonts/ZenDots-Regular.ttf"
          fontSize={0.45}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.02}
          material-transparent={true}
        >
          {''}
        </Text>
      </Billboard>
    </group>
  );
}

// ===================================
// メインコンポーネント（一括更新ループ）
// ===================================
export const DamagePopups = memo(function DamagePopups({ isPaused }: { isPaused?: boolean }) {
  useFrame((_state, delta) => {
    if (isPaused) return;
    for (let i = 0; i < MAX_POPUPS; i++) {
      const data = _pool[i];
      const group = _groupRefs[i];
      const text = _textRefs[i];

      if (!group || !text) continue;

      if (!data.active) {
        if (group.visible) group.visible = false;
        continue;
      }

      data.age += delta;
      if (data.age >= POPUP_LIFETIME) {
        data.active = false;
        group.visible = false;
        continue;
      }

      const progress = data.age / POPUP_LIFETIME; // 0→1

      if (!group.visible) group.visible = true;

      // 上昇移動（isFollowing の場合はプレイヤー位置をベースにする）
      if (data.isFollowing && window.__playerPosRef) {
        const px = window.__playerPosRef.current.x;
        const pz = window.__playerPosRef.current.z;
        group.position.set(
          px + data.x,
          data.y + data.age * data.vy,
          pz + data.z,
        );
      } else {
        group.position.set(
          data.x,
          data.y + data.age * data.vy,
          data.z,
        );
      }

      // 透明度計算
      const opacity = 1 - progress * progress;

      // スケール計算 (指示通り: 超会心:1.66, 会心:1.33, 通常:1.0)
      const scale = data.critType === 2
        ? 1.66 - progress * 0.5
        : data.critType === 1
          ? 1.33 - progress * 0.4
          : 1.0 - progress * 0.3;
      group.scale.setScalar(scale);

      // --- ここからテキストのインペラティブな更新処理 ---
      const baseText = typeof data.damage === 'string' ? data.damage : Number(data.damage).toFixed(1);
      const newText = data.critType === 2 ? `${baseText}!!` : data.critType === 1 ? `${baseText}!` : baseText;

      if (text.text !== newText) {
        text.text = newText;
      }

      text.color = data.color;
      text.outlineColor = data.outlineColor;

      // 【修正】アウトラインを細くする
      text.outlineWidth = 0.02;

      // 【修正】ノーマルダメージ(0.50)を小さく(0.40)調整して、カメラ近接による巨大化を相殺
      text.fontSize = data.critType === 2 ? 0.70 : data.critType === 1 ? 0.60 : 0.40;
      text.fillOpacity = opacity;
      text.outlineOpacity = opacity;

      // 【追加】プロパティの変更を3Dメッシュに確実に反映させる
      text.sync();
    }
  });

  return (
    <group>
      {_pool.map((_, i) => (
        <PopupText key={i} index={i} />
      ))}
    </group>
  );
});

export const ActionPopupColor = {
  HEAL: { inner: '#ffffff', outline: '#339933' },
  ABSORB: { inner: '#ffffff', outline: '#6600ff' },
  REVIVE: { inner: '#ffffff', outline: '#ff9900' },
} as const;

export function spawnActionPopup(
  x: number,
  y: number,
  z: number,
  text: string,
  type: keyof typeof ActionPopupColor,
  isFollowing: boolean = false
) {
  const colors = ActionPopupColor[type];
  spawnDamagePopup(x, y, z, text, 0, colors.inner, colors.outline, -1.5, isFollowing);
}

