import { memo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import type { Group } from 'three';

// ===================================
// 定数・型
// ===================================
const MAX_POPUPS = 128;
const POPUP_LIFETIME = 0.8;

interface PopupData {
  active: boolean;
  x: number;
  y: number;
  z: number;
  damage: string | number;
  age: number;
  vy: number;
  color: string;
  outlineColor: string;
  critType: number;
  isFollowing: boolean;
}

const _pool: PopupData[] = Array.from({ length: MAX_POPUPS }, () => ({
  active: false,
  x: 0,
  y: 0,
  z: 0,
  damage: '',
  age: 0,
  vy: 2.5,
  color: '#ffffff',
  outlineColor: '#000000',
  critType: 0,
  isFollowing: false,
}));

let _nextSlot = 0;
const _groupRefs: (Group | null)[] = Array.from({ length: MAX_POPUPS }, () => null);
const _textRefs: any[] = Array.from({ length: MAX_POPUPS }, () => null);

// ===================================
// 外部呼出し用関数
// ===================================

export function spawnDamagePopup(
  x: number,
  y: number,
  z: number,
  damage: string | number,
  critTypeRaw: any = 0,
  color: string = '#ffffff',
  outlineColor: string = '#000000',
  vy: number = 2.5,
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
      p.age = 0;
      p.vy = vy;
      p.color = color;
      p.outlineColor = outlineColor;
      p.critType = parsedCritType;
      p.isFollowing = isFollowing;
      _nextSlot = (idx + 1) % MAX_POPUPS;
      return;
    }
  }
}

export function spawnActionPopup(
  x: number,
  y: number,
  z: number,
  text: string,
  type: 'heal' | 'parry' | 'absorb' | 'revive' | 'levelup' = 'heal',
  isFollowing: boolean = true
) {
  const colorMap = {
    heal: { inner: '#4caf50', outline: '#ffffff' },
    parry: { inner: '#ffffff', outline: '#0099ff' },
    absorb: { inner: '#ffeb3b', outline: '#000000' },
    revive: { inner: '#ff9800', outline: '#ffffff' },
    levelup: { inner: '#ffd700', outline: '#ffffff' },
  };
  const colors = colorMap[type] || colorMap.heal;
  spawnDamagePopup(x, y, z, text, 0, colors.inner, colors.outline, -1.5, isFollowing);
}

// ===================================
// サブコンポーネント
// ===================================
function PopupText({ index }: { index: number }) {
  return (
    <group
      ref={(el) => { _groupRefs[index] = el; }}
      visible={false}
    >
      <Billboard>
        <Text
          ref={(el) => { _textRefs[index] = el; }}
          font="fonts/ZenDots-Regular.ttf"
          fontSize={0.45}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.04}
          outlineColor="#000000"
        >
          <meshBasicMaterial depthWrite={false} attach="material" />
          {""}
        </Text>
      </Billboard>
    </group>
  );
}

// ===================================
// メインコンポーネント
// ===================================
export const DamagePopups = memo(function DamagePopups({ isPaused }: { isPaused?: boolean }) {
  useEffect(() => {
    return () => {
      // アンマウント時に全てのポップアップを非アクティブにする
      for (let i = 0; i < MAX_POPUPS; i++) {
        _pool[i].active = false;
        if (_groupRefs[i]) _groupRefs[i]!.visible = false;
      }
    };
  }, []);

  useFrame((_state, delta) => {
    if (isPaused) return;

    for (let i = 0; i < MAX_POPUPS; i++) {
      const data = _pool[i];
      if (!data.active) continue;

      const group = _groupRefs[i];
      const text = _textRefs[i];
      if (!group || !text) continue;

      data.age += delta;
      if (data.age >= POPUP_LIFETIME) {
        data.active = false;
        group.visible = false;
        continue;
      }

      // 位置
      let px = 0, pz = 0;
      if (data.isFollowing && window.__playerPosRef?.current) {
        px = window.__playerPosRef.current.x;
        pz = window.__playerPosRef.current.z;
      }
      group.position.set(px + data.x, data.y + data.age * data.vy, pz + data.z);

      if (!group.visible) group.visible = true;

      const opacity = Math.max(0, 1 - (data.age / POPUP_LIFETIME));
      const baseVal = typeof data.damage === 'string' ? data.damage : Number(data.damage).toFixed(1);
      const displayStr = data.critType === 2 ? `${baseVal}!!` : data.critType === 1 ? `${baseVal}!` : baseVal;

      // プロパティ更新
      if (text.text !== displayStr) text.text = displayStr;
      if (text.color !== data.color) text.color = data.color;
      if (text.outlineColor !== data.outlineColor) text.outlineColor = data.outlineColor;
      
      const targetSize = data.critType === 2 ? 0.70 : data.critType === 1 ? 0.60 : 0.45;
      if (text.fontSize !== targetSize) text.fontSize = targetSize;
      
      if (text.fillOpacity !== opacity) text.fillOpacity = opacity;
      if (text.outlineOpacity !== opacity) text.outlineOpacity = opacity;

      if (typeof text.sync === 'function') {
        text.sync();
      }
    }
  });

  return (
    <group>
      {Array.from({ length: MAX_POPUPS }).map((_, i) => (
        <PopupText key={i} index={i} />
      ))}
    </group>
  );
});
