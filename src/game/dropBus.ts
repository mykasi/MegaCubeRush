/**
 * ドロップアイテムの共有データバス
 * React のステート管理を経由せず、直接配列を参照することで高速化
 * Projectiles が敵撃破時にアイテムを登録し、DroppedItems が描画・取得判定を行う
 */

import { Rarity } from './items/itemTypes';
import type { GeneratedItem } from './items/itemTypes';
import { generateRandomItem, getItemDisplayName, getItemColor, rollRarity } from './items/itemGenerator';
import { RARITY_CONFIG } from './items/itemData';
import { getLevel } from './playerLevel';
import { playSound } from './soundBus';

// ===================================
// ドロップアイテムデータ
// ===================================

export interface DroppedItem {
  item: GeneratedItem;
  x: number;
  z: number;
  active: boolean;        // 地面に存在しているか
  displayName: string;
  color: string;
  rarityNameJa: string;
  phase: number;          // 0: 静止, 1: プレイヤーへ移動中
}

const MAX_DROPS = 100;
const drops: DroppedItem[] = [];

/** ドロップ確率（0.0〜1.0） */
const DROP_CHANCE = 0.4;

// ===================================
// 取得コールバック
// ===================================
type PickupCallback = (drop: DroppedItem) => void;
const pickupListeners: PickupCallback[] = [];

export function onPickup(cb: PickupCallback) {
  pickupListeners.push(cb);
  // クリーンアップ関数を返す
  return () => {
    const idx = pickupListeners.indexOf(cb);
    if (idx >= 0) pickupListeners.splice(idx, 1);
  };
}

// ===================================
// ドロップ操作
// ===================================

/** フィールド上のすべてのアイテムを吸引状態にする */
export function pullAllDrops(_playerX: number, _playerZ: number) {
  for (let i = 0; i < drops.length; i++) {
    const drop = drops[i];
    if (drop.active) {
      drop.phase = 1; // 追尾フェーズへ強制移行
    }
  }
}

let _killCount = 0; // 撃破数トラッキング用
let _overwriteCursor = 0; // 上限到達時の強制上書き用カーソル

/** 敵が倒された座標にアイテムをドロップ（確率判定付き） */
export function tryDropItem(x: number, z: number, dropMult: number = 1.0): boolean {
  _killCount++;
  
  if (Math.random() > (DROP_CHANCE * dropMult)) return false;

  const playerLevel = getLevel();
  
  // 1. まずレアリティを決定する（1回のみ抽選）
  const rarity = rollRarity();

  // 2. レアリティに応じたレベル補正を決定する（下限は常に0、上限がレアリティで増加）
  let levelOffsetMin = 0;
  let levelOffsetMax = 0;

  switch (rarity) {
    case Rarity.Common:     levelOffsetMin = 0; levelOffsetMax = 0; break;
    case Rarity.Uncommon:   levelOffsetMin = 0; levelOffsetMax = 1; break;
    case Rarity.Magic:      levelOffsetMin = 0; levelOffsetMax = 2; break;
    case Rarity.Rare:       levelOffsetMin = 0; levelOffsetMax = 3; break;
    case Rarity.Epic:       levelOffsetMin = 0; levelOffsetMax = 4; break;
    case Rarity.Legendary:  levelOffsetMin = 0; levelOffsetMax = 5; break;
    case Rarity.Mythic:     levelOffsetMin = 0; levelOffsetMax = 6; break;
    case Rarity.Immortal:   levelOffsetMin = 0; levelOffsetMax = 7; break;
    case Rarity.Celestial:  levelOffsetMin = 0; levelOffsetMax = 8; break;
    default:                levelOffsetMin = 0; levelOffsetMax = 0;
  }

  // 補正値をランダムに決定し、最終レベルを算出（最低Lv1保証）
  const offset = Math.floor(Math.random() * (levelOffsetMax - levelOffsetMin + 1)) + levelOffsetMin;
  const finalLevel = Math.max(1, playerLevel + offset);
  
  // 3. 決定したレベルとレアリティを「両方」渡して確定アイテムを生成する
  const item = generateRandomItem(finalLevel, rarity);
  // レアリティは generateRandomItem(finalLevel) で再度抽選されるが、
  // インフレ抑制とレアリティ別範囲の要件を満たすため、このレベル決定ロジックを通す。
  let cx = x;
  let cz = z;
  const distSq = cx * cx + cz * cz;
  if (distSq > 400.0) {
    const dist = Math.sqrt(distSq);
    cx = (cx / dist) * 20.0;
    cz = (cz / dist) * 20.0;
  }

  const drop: DroppedItem = {
    item,
    x: cx,
    z: cz,
    active: true,
    displayName: getItemDisplayName(item),
    color: getItemColor(item),
    rarityNameJa: RARITY_CONFIG[item.rarity].nameJa,
    phase: 0,
  };

  // プールが満杯なら最古の非アクティブを上書き、なければ末尾追加
  if (drops.length >= MAX_DROPS) {
    const inactiveIdx = drops.findIndex((d) => !d.active);
    if (inactiveIdx >= 0) {
      drops[inactiveIdx] = drop;
    } else {
      // 全部アクティブ（画面にアイテムが上限まで散らばっている）な場合は、
      // 古いものから順番に強制上書きして新しいアイテムをドロップし続ける。
      drops[_overwriteCursor] = drop;
      _overwriteCursor = (_overwriteCursor + 1) % MAX_DROPS;
    }
  } else {
    drops.push(drop);
  }

  return true;
}

/** 指定したアイテムを直接スポーンさせる（ボス報酬用など） */
export function spawnDrop(x: number, z: number, item: GeneratedItem) {
  let cx = x;
  let cz = z;
  const distSq = cx * cx + cz * cz;
  if (distSq > 400.0) {
    const dist = Math.sqrt(distSq);
    cx = (cx / dist) * 20.0;
    cz = (cz / dist) * 20.0;
  }

  const drop: DroppedItem = {
    item,
    x: cx,
    z: cz,
    active: true,
    displayName: getItemDisplayName(item),
    color: getItemColor(item),
    rarityNameJa: RARITY_CONFIG[item.rarity].nameJa,
    phase: 0,
  };

  // プールが満杯なら最古の非アクティブを上書き、なければ末尾追加
  if (drops.length >= MAX_DROPS) {
    const inactiveIdx = drops.findIndex((d) => !d.active);
    if (inactiveIdx >= 0) {
      drops[inactiveIdx] = drop;
    } else {
      drops[_overwriteCursor] = drop;
      _overwriteCursor = (_overwriteCursor + 1) % MAX_DROPS;
    }
  } else {
    drops.push(drop);
  }
}

/** アイテムを取得済みにする */
export function pickupDrop(index: number) {
  if (index < 0 || index >= drops.length) return;
  const drop = drops[index];
  if (!drop.active) return;

  drop.active = false;
  playSound('ui_buy');
  // リスナーに通知
  for (const cb of pickupListeners) {
    cb(drop);
  }
}

/** 現在のドロップリストを取得（読み取り専用） */
export function getDrops(): readonly DroppedItem[] {
  return drops;
}

/** アクティブなドロップ数を取得 */
export function getActiveDropCount(): number {
  let count = 0;
  for (const d of drops) {
    if (d.active) count++;
  }
  return count;
}

/** 全てのドロップをクリア（リスタート用） */
export function resetDrops() {
  drops.length = 0;
  _killCount = 0;
  _overwriteCursor = 0;
}
