/**
 * ゲームの進行状況（キルカウント等）を管理する軽量ステートバス
 * Reactの外で値を保持し、UIが必要な時に購読する仕組み
 */

export interface GameProgress {
  killCount: number;
  nextRewardKill: number;
}

let state: GameProgress = {
  killCount: 0,
  nextRewardKill: 20,
};

type Listener = (state: GameProgress) => void;
const listeners: Set<Listener> = new Set();

/** 現在の進行状態を取得 */
export function getGameProgress(): GameProgress {
  return state;
}

/** 敵を1体倒した時の処理 */
export function addKill() {
  state.killCount += 1;
  notify();
}

/** 報酬を受け取った（次の目標へ更新する）処理 */
export function advanceRewardPhase(increment: number = 50) {
  state.nextRewardKill += increment;
  notify();
}

/** リスタート時などに状態をリセット */
export function resetGameProgress(initialNextReward: number = 20) {
  state.killCount = 0;
  state.nextRewardKill = initialNextReward;
  notify();
}

/** 状態変化を購読（Reactコンポーネント用） */
export function subscribeProgress(listener: Listener): () => void {
  listeners.add(listener);
  // 初回呼び出しも保証
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  listeners.forEach((listener) => listener(state));
}
