import { playSound } from './soundBus';

// ===================================
// プール設定
// ===================================
const MAX_GEMS = 2000;

/** キューブ座標: [x0, y0, z0, x1, y1, z1, ...] */
const gemPositions = new Float32Array(MAX_GEMS * 3);

/** キューブ状態: 0=非アクティブ, 1=アクティブ(地面), 2=吸引中 */
const gemState = new Uint8Array(MAX_GEMS);

/** 各キューブのEXP値 */
const gemExp = new Uint16Array(MAX_GEMS);

/** 次の空きスロット検索用のヒント（高速化） */
let nextFreeHint = 0;

// ===================================
// ジェム操作
// ===================================

/** フィールド上のすべてのキューブを吸引状態にする */
export function pullAllGems(_playerX: number, _playerZ: number) {
  for (let i = 0; i < MAX_GEMS; i++) {
    if (gemState[i] === 1) {
      gemState[i] = 2; // 追尾フェーズへ移行
    }
  }
}

export function spawnGem(x: number, z: number, expValue: number): void {
  let cx = x;
  let cz = z;
  const distSq = cx * cx + cz * cz;
  if (distSq > 400.0) {
    const dist = Math.sqrt(distSq);
    cx = (cx / dist) * 20.0;
    cz = (cz / dist) * 20.0;
  }

  // 空きスロットを検索（ヒントから開始してラップアラウンド）
  for (let attempt = 0; attempt < MAX_GEMS; attempt++) {
    const idx = (nextFreeHint + attempt) % MAX_GEMS;
    if (gemState[idx] === 0) {
      const offset = idx * 3;
      gemPositions[offset] = cx;
      gemPositions[offset + 1] = 0.3; // 初期Y座標
      gemPositions[offset + 2] = cz;
      gemState[idx] = 1;
      gemExp[idx] = expValue;
      nextFreeHint = (idx + 1) % MAX_GEMS;
      return;
    }
  }
  // プールが満杯の場合は無視（上限到達）
}

/** キューブを回収状態（吸引開始）にする */
export function startAttract(index: number): void {
  if (index >= 0 && index < MAX_GEMS && gemState[index] === 1) {
    gemState[index] = 2;
  }
}

/** キューブを完全回収（非アクティブ化）し、EXP値を返す */
export function collectGem(index: number): number {
  if (index < 0 || index >= MAX_GEMS || gemState[index] === 0) return 0;
  gemState[index] = 0;
  playSound('exp');
  return gemExp[index];
}

// ===================================
// データアクセサ（読み取り専用として利用）
// ===================================
export function getGemPositions(): Float32Array {
  return gemPositions;
}

export function getGemState(): Uint8Array {
  return gemState;
}

export function getMaxGems(): number {
  return MAX_GEMS;
}

/** 全てのキューブをクリア（リスタート用） */
export function resetGems() {
  gemState.fill(0);
  nextFreeHint = 0;
}
