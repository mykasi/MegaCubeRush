import { useEffect, useRef, useCallback } from 'react';

/**
 * ゲームパッド入力を毎フレーム取得するフック
 * useFrame内で getInput() を呼んで最新の入力を取得する
 */
export interface GamepadInfo {
  id: string;
  mapping: string;
  axes: number[];
  buttons: number[];
  connected: boolean;
}

export interface GamepadInput {
  /** 1番目の有効なデバイスの入力（ゲームプレイ用） */
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  connected: boolean;
  /** メインとして選択されているデバイスID */
  mainId: string;
  /** メインデバイスの詳細情報 */
  mainDevice: GamepadInfo | null;
  /** 全スロットのデバイス情報（デバッグ用） */
  devices: GamepadInfo[];
}


const DEADZONE = 0.2;



export function useGamepad() {
  const inputRef = useRef<GamepadInput>({
    leftX: 0,
    leftY: 0,
    rightX: 0,
    rightY: 0,
    connected: false,
    mainId: '',
    mainDevice: null,
    devices: [],
  });


  useEffect(() => {
    const onConnect = (e: GamepadEvent) => {
      console.log('🎮 Gamepad connected:', e.gamepad.id);
      console.log('  - Index:', e.gamepad.index);
      console.log('  - Mapping:', e.gamepad.mapping);
    };
    const onDisconnect = (e: GamepadEvent) => {
      console.log('❌ Gamepad disconnected:', e.gamepad.id);
    };
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, []);

  /** 毎フレーム呼び出して最新入力を取得 */
  const poll = useCallback((): GamepadInput => {
    const rawGamepads = navigator.getGamepads();
    const deviceInfos: GamepadInfo[] = [];
    let mainGp: Gamepad | null = null;
    let maxScore = -1;

    for (const gp of Array.from(rawGamepads)) {
      if (!gp || !gp.connected) continue;

      // デバッグ情報を収集
      deviceInfos.push({
        id: gp.id,
        mapping: gp.mapping,
        axes: Array.from(gp.axes),
        buttons: gp.buttons.map(b => b.value), 
        connected: gp.connected,
      });

      // 最適なデバイスをスコアで判定
      let score = 0;
      if (gp.mapping === 'standard') score += 100;
      score += gp.buttons.length;
      score += gp.axes.length;

      if (score > maxScore) {
        maxScore = score;
        mainGp = gp;
      }
    }

    inputRef.current.devices = deviceInfos;

    if (mainGp) {
      // 多くのコントローラー（Xbox等）は [0,1,2,3] = [LX, LY, RX, RY]
      const lx = mainGp.axes[0] ?? 0;
      const ly = mainGp.axes[1] ?? 0;
      const rx = mainGp.axes[2] ?? 0;
      const ry = mainGp.axes[3] ?? 0;

      // 左スティックの円形デッドゾーン処理
      const lLen = Math.sqrt(lx * lx + ly * ly);
      if (lLen < DEADZONE) {
        inputRef.current.leftX = 0;
        inputRef.current.leftY = 0;
      } else {
        // 遊びの部分を差し引いて 0.0 ~ 1.0 にリマップ（より滑らかな操作感のため）
        const normalizedLen = (lLen - DEADZONE) / (1.0 - DEADZONE);
        inputRef.current.leftX = (lx / lLen) * normalizedLen;
        inputRef.current.leftY = (ly / lLen) * normalizedLen;
      }

      // 右スティックの円形デッドゾーン処理
      const rLen = Math.sqrt(rx * rx + ry * ry);
      if (rLen < DEADZONE) {
        inputRef.current.rightX = 0;
        inputRef.current.rightY = 0;
      } else {
        const normalizedLen = (rLen - DEADZONE) / (1.0 - DEADZONE);
        inputRef.current.rightX = (rx / rLen) * normalizedLen;
        inputRef.current.rightY = (ry / rLen) * normalizedLen;
      }
      
      if (!inputRef.current.connected) {
        console.log('🎯 Main Controller Selected (Score:', maxScore, '):', mainGp.id);
      }
      inputRef.current.connected = true;
      inputRef.current.mainId = mainGp.id;
      inputRef.current.mainDevice = deviceInfos.find(d => d.id === mainGp.id) || null;
    } else {
      inputRef.current.leftX = 0;
      inputRef.current.leftY = 0;
      inputRef.current.rightX = 0;
      inputRef.current.rightY = 0;
      inputRef.current.connected = false;
      inputRef.current.mainId = '';
      inputRef.current.mainDevice = null;
    }


    return inputRef.current;
  }, []);

  return { poll, inputRef };
}
