/**
 * Web Audio APIを使用したBGMマネージャー
 * クロスフェード、ループ再生、非同期ロードをサポートします
 */

let bgmCtx: AudioContext | null = null;
const bgmBuffers: Record<string, AudioBuffer> = {};
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;
let pendingBgm: { type: string; fadeDuration: number } | null = null;

// デフォルトのBGM音量（0.0 ~ 1.0）
export let masterBgmVolume = 0.2;

/** マスターボリュームを設定し、再生中のBGMに即時反映する */
export function setMasterBgmVolume(v: number) {
  masterBgmVolume = v;
  if (currentGain && bgmCtx) {
    // 0.05秒かけて滑らかに音量を変更
    currentGain.gain.setTargetAtTime(v, bgmCtx.currentTime, 0.05);
  }
}

// 🎵 ここにダウンロードしたBGMファイルのパスを登録します
// 例: 'stage1': 'bgm/stage1.mp3',
export const BGM_FILES: Record<string, string> = {
  'title': 'bgm/title.mp3',
  'wave1_2': 'bgm/wave1_2.mp3',
  'wave3_4': 'bgm/wave3_4.mp3',
  'wave5_6': 'bgm/wave5_6.mp3',
  'wave7_8': 'bgm/wave7_8.mp3',
  'wave9_10': 'bgm/wave9_10.mp3',
  'queen': 'bgm/queen.mp3',
  'wave11_13': 'bgm/wave11_13.mp3',
  'king': 'bgm/king.mp3',
};

let isInitializing = false;

/** BGM用AudioContextの初期化とファイルの事前ロード */
export async function initBgm() {
  if (isInitializing) return;
  isInitializing = true;
  
  if (!bgmCtx) {
    bgmCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // 登録されたBGMファイルの非同期ロード
  for (const [key, url] of Object.entries(BGM_FILES)) {
    if (!bgmBuffers[key]) {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await bgmCtx!.decodeAudioData(arrayBuffer);
        bgmBuffers[key] = audioBuffer;
        // ロード完了時に保留中のBGMがあれば再生する
        if (pendingBgm && pendingBgm.type === key) {
          const toPlay = pendingBgm;
          pendingBgm = null;
          playBgm(toPlay.type, toPlay.fadeDuration);
        }
      } catch (e) {
        console.error(`[BgmBus] Failed to load BGM: ${key}`, e);
      }
    }
  }
}

/** BGMの再生（クロスフェード対応） */
export function playBgm(type: string, fadeDuration = 1.0) {
  if (!bgmCtx) {
    // まだ初期化されていなければ保留
    pendingBgm = { type, fadeDuration };
    return;
  }
  if (!bgmBuffers[type]) {
    // ロード中なら保留
    console.warn(`[BgmBus] BGM not found or still loading: ${type}. Queuing for playback.`);
    pendingBgm = { type, fadeDuration };
    return;
  }

  pendingBgm = null;
  const now = bgmCtx.currentTime;

  // 現在再生中のBGMがあればフェードアウトして停止
  if (currentGain && currentSource) {
    currentGain.gain.cancelScheduledValues(now);
    currentGain.gain.setValueAtTime(currentGain.gain.value, now);
    currentGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
    const oldSource = currentSource;
    setTimeout(() => {
      try { oldSource.stop(); } catch (e) {}
    }, fadeDuration * 1000);
  }

  // 新しいBGMノードの作成
  const source = bgmCtx.createBufferSource();
  source.buffer = bgmBuffers[type];
  source.loop = true; // BGMは基本ループ

  const gainNode = bgmCtx.createGain();
  // フェードイン
  gainNode.gain.setValueAtTime(0, now);
  gainNode.gain.linearRampToValueAtTime(masterBgmVolume, now + fadeDuration);

  source.connect(gainNode);
  gainNode.connect(bgmCtx.destination);
  source.start(now);

  currentSource = source;
  currentGain = gainNode;
}

/** BGMの停止（フェードアウト） */
export function stopBgm(fadeDuration = 1.0) {
  if (!bgmCtx || !currentGain || !currentSource) return;
  const now = bgmCtx.currentTime;
  
  currentGain.gain.cancelScheduledValues(now);
  currentGain.gain.setValueAtTime(currentGain.gain.value, now);
  currentGain.gain.linearRampToValueAtTime(0, now + fadeDuration);
  
  const oldSource = currentSource;
  setTimeout(() => {
    try { oldSource.stop(); } catch (e) {}
  }, fadeDuration * 1000);
  
  currentSource = null;
  currentGain = null;
}
