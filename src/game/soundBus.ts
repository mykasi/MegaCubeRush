/**
 * Web Audio APIを使用したハイブリッド・サウンドマネージャー
 * 
 * 1. SOUND_FILES に登録された音声ファイルがあれば、それを事前ロード＆再生
 * 2. 音声ファイルがなければ、従来のシンセサイザーでフォールバック再生
 */

let audioCtx: AudioContext | null = null;
const lastPlayTimes: Record<string, number> = {};

// ロード済み音声バッファのキャッシュ
const audioBuffers: Record<string, AudioBuffer> = {};

// 🎵 ここにダウンロードした音声ファイルのパスを登録していきます
// 例: 'swing': '/sounds/swing.mp3',
const SOUND_FILES: Partial<Record<SoundType, string>> = {
  'player_spawn': '/sounds/player_spawn.mp3',
};

/** SEのマスターボリューム（0.0 ~ 1.0） */
export let masterSeVolume = 0.5;

/** SEのマスターボリュームを設定する */
export function setMasterSeVolume(v: number) {
  masterSeVolume = v;
}

/** ブラウザのAudioContextを初期化し、登録済み音声ファイルを事前ロードする */
export async function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // ファイルの事前非同期ロード
  for (const [key, url] of Object.entries(SOUND_FILES)) {
    if (!audioBuffers[key]) {
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        audioBuffers[key] = audioBuffer;
      } catch (e) {
        console.error(`[SoundBus] Failed to load sound: ${key}`, e);
      }
    }
  }
}

export type SoundType = 
  // --- 汎用アクション ---
  | 'swing' | 'hit' | 'hit_fire' | 'hit_ice' | 'hit_lightning' | 'shoot' | 'dash' | 'barrier_on' | 'barrier_fail'
  | 'just_guard' | 'mega_crush' | 'buff' | 'heal' | 'magnet'
  | 'player_hit' | 'low_hp' | 'debuff' | 'player_spawn'
  | 'enemy_spawn' | 'enemy_death' | 'warning'
  | 'exp' | 'levelup' | 'reward'
  | 'ui_move' | 'ui_select' | 'ui_cancel' | 'ui_buy' | 'ui_sell' | 'equip' | 'item_pickup'
  | 'inventory_open' | 'inventory_close' | 'ui_tab_large' | 'ui_tab_small'
  | 'magic_thunder_hit' | 'magic_fire_hit' | 'magic_ice_hit'
  // --- 素手 ---
  | 'swing_unarmed' | 'hit_unarmed'
  // --- 近接武器 発射音 ---
  | 'swing_dagger' | 'swing_saber' | 'swing_axe' | 'swing_spear' | 'swing_claymore'
  | 'swing_hammer' | 'swing_knuckle' | 'swing_kris' | 'swing_mace' | 'swing_gauntlet'
  // --- 近接武器 ヒット音 ---
  | 'hit_dagger' | 'hit_saber' | 'hit_axe' | 'hit_spear' | 'hit_claymore'
  | 'hit_hammer' | 'hit_knuckle' | 'hit_kris' | 'hit_mace' | 'hit_gauntlet'
  // --- 遠隔武器 発射音 ---
  | 'shoot_handgun' | 'shoot_smg' | 'shoot_rifle' | 'shoot_shotgun' | 'shoot_grenade'
  | 'shoot_boomerang' | 'shoot_chakram' | 'shoot_grimoire' | 'shoot_cards' | 'shoot_orb'
  // --- 遠隔武器 ヒット音 ---
  | 'hit_handgun' | 'hit_smg' | 'hit_rifle' | 'hit_shotgun' | 'hit_grenade'
  | 'hit_boomerang' | 'hit_chakram' | 'hit_grimoire' | 'hit_cards' | 'hit_orb';

/** 指定したタイプの効果音を再生する（ファイル優先、なければシンセ音） */
export function playSound(type: SoundType) {
  if (!audioCtx) return;

  const nowTime = performance.now();
  // ヒット音系（魔法含む）、死亡音、経験値取得音などは重なりすぎるとうるさいため、50msのインターバルを設ける
  if (type.includes('hit') || type === 'enemy_death' || type === 'exp') {
    if (lastPlayTimes[type] && nowTime - lastPlayTimes[type] < 50) {
      return;
    }
  }
  lastPlayTimes[type] = nowTime;

  // 1. 登録された音声ファイルがあればそれを再生
  if (audioBuffers[type]) {
    const source = audioCtx.createBufferSource();
    source.buffer = audioBuffers[type];
    const gainNode = audioCtx.createGain();
    // ファイル再生時は一律 1.0 * masterSeVolume (旧 0.5 から 2倍に増加)
    gainNode.gain.value = 1.0 * masterSeVolume;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    source.start(0);
    return; // ここで処理を終了し、下のシンセ音は鳴らさない
  }

  // 2. ファイルがなければ従来のシンセ音（フォールバック）を鳴らす
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  let typeOsc: OscillatorType = 'sine';
  let freqStart = 440, freqEnd = 440;
  let duration = 0.1, vol = 0.1;

  switch (type) {
    // ===== 1. 汎用プレイヤーアクション =====
    case 'swing': typeOsc = 'sine'; freqStart = 200; freqEnd = 50; duration = 0.15; vol = 0.05; break;
    case 'hit': typeOsc = 'square'; freqStart = 150; freqEnd = 50; duration = 0.1; vol = 0.1; break;
    case 'hit_fire': typeOsc = 'sawtooth'; freqStart = 100; freqEnd = 300; duration = 0.2; vol = 0.03; break;
    case 'hit_ice': typeOsc = 'triangle'; freqStart = 2000; freqEnd = 1000; duration = 0.15; vol = 0.1; break;
    case 'hit_lightning': typeOsc = 'square'; freqStart = 400; freqEnd = 1200; duration = 0.1; vol = 0.08; break;
    case 'shoot': typeOsc = 'triangle'; freqStart = 600; freqEnd = 200; duration = 0.1; vol = 0.05; break;
    case 'dash': typeOsc = 'sine'; freqStart = 800; freqEnd = 100; duration = 0.2; vol = 0.05; break;
    case 'barrier_on': typeOsc = 'sine'; freqStart = 300; freqEnd = 600; duration = 0.3; vol = 0.1; break;
    case 'barrier_fail': typeOsc = 'sawtooth'; freqStart = 100; freqEnd = 100; duration = 0.2; vol = 0.1; break;

    // ===== 2. 特殊アクション =====
    case 'just_guard': typeOsc = 'triangle'; freqStart = 2000; freqEnd = 4000; duration = 0.3; vol = 0.2; break;
    case 'mega_crush': typeOsc = 'square'; freqStart = 100; freqEnd = 20; duration = 0.6; vol = 0.1; break;
    case 'buff': typeOsc = 'sine'; freqStart = 800; freqEnd = 1200; duration = 0.4; vol = 0.1; break;
    case 'heal': typeOsc = 'sine'; freqStart = 400; freqEnd = 1200; duration = 0.5; vol = 0.12; break;
    case 'magnet': typeOsc = 'sine'; freqStart = 200; freqEnd = 600; duration = 0.3; vol = 0.08; break;

    // ===== 3. 被ダメージ =====
    case 'player_hit': typeOsc = 'sawtooth'; freqStart = 200; freqEnd = 50; duration = 0.2; vol = 0.2; break;
    case 'low_hp': typeOsc = 'square'; freqStart = 800; freqEnd = 800; duration = 0.1; vol = 0.1; break;

    // ===== 4. 敵 =====
    case 'enemy_spawn': typeOsc = 'sine'; freqStart = 100; freqEnd = 300; duration = 0.2; vol = 0.02; break;
    case 'enemy_death': typeOsc = 'square'; freqStart = 100; freqEnd = 30; duration = 0.15; vol = 0.05; break;

    // ===== 5. アイテム・成長 =====
    case 'exp': typeOsc = 'sine'; freqStart = 1200; freqEnd = 1800; duration = 0.1; vol = 0.03; break;
    case 'levelup': typeOsc = 'triangle'; freqStart = 400; freqEnd = 800; duration = 0.5; vol = 0.1; break;

    // ===== 6. UI =====
    case 'ui_move': typeOsc = 'sine'; freqStart = 600; freqEnd = 600; duration = 0.05; vol = 0.05; break;
    case 'ui_select': typeOsc = 'triangle'; freqStart = 800; freqEnd = 1200; duration = 0.1; vol = 0.1; break;
    case 'ui_cancel': typeOsc = 'triangle'; freqStart = 400; freqEnd = 200; duration = 0.1; vol = 0.1; break;
    case 'ui_buy': typeOsc = 'sine'; freqStart = 1500; freqEnd = 2000; duration = 0.15; vol = 0.05; break;
    case 'ui_sell': typeOsc = 'sine'; freqStart = 800; freqEnd = 600; duration = 0.1; vol = 0.05; break;
    case 'equip': typeOsc = 'sine'; freqStart = 400; freqEnd = 800; duration = 0.05; vol = 0.05; break;
    case 'item_pickup': typeOsc = 'sine'; freqStart = 1000; freqEnd = 1500; duration = 0.1; vol = 0.05; break;

    // ===== 6.5 インベントリ・UI拡張 =====
    case 'inventory_open': typeOsc = 'sine'; freqStart = 400; freqEnd = 600; duration = 0.2; vol = 0.08; break;
    case 'inventory_close': typeOsc = 'sine'; freqStart = 600; freqEnd = 400; duration = 0.15; vol = 0.06; break;
    case 'ui_tab_large': typeOsc = 'triangle'; freqStart = 400; freqEnd = 500; duration = 0.1; vol = 0.05; break;
    case 'ui_tab_small': typeOsc = 'triangle'; freqStart = 600; freqEnd = 700; duration = 0.08; vol = 0.04; break;

    // ===== 6.6 魔法専用ヒット音 =====
    case 'magic_thunder_hit': typeOsc = 'sawtooth'; freqStart = 200; freqEnd = 50; duration = 0.15; vol = 0.08; break;
    case 'magic_fire_hit': typeOsc = 'sine'; freqStart = 100; freqEnd = 40; duration = 0.25; vol = 0.08; break;
    case 'magic_ice_hit': typeOsc = 'sine'; freqStart = 1200; freqEnd = 800; duration = 0.1; vol = 0.03; break;

    // ===== 7. 素手 =====
    case 'swing_unarmed': typeOsc = 'sine'; freqStart = 180; freqEnd = 60; duration = 0.12; vol = 0.04; break;      // 拳の風切り（柔らかい）
    case 'hit_unarmed': typeOsc = 'square'; freqStart = 120; freqEnd = 40; duration = 0.08; vol = 0.06; break;       // 鈍い打撃

    // ===== 8. 近接武器 発射音（swing） =====
    case 'swing_dagger': typeOsc = 'triangle'; freqStart = 500; freqEnd = 150; duration = 0.08; vol = 0.05; break;    // 鋭く短い「シュッ」
    case 'swing_saber': typeOsc = 'sine'; freqStart = 300; freqEnd = 80; duration = 0.15; vol = 0.05; break;          // 標準的な斬撃「シュン」
    case 'swing_axe': typeOsc = 'sawtooth'; freqStart = 150; freqEnd = 30; duration = 0.25; vol = 0.06; break;        // 重い振り下ろし「ブォン」
    case 'swing_spear': typeOsc = 'triangle'; freqStart = 400; freqEnd = 200; duration = 0.1; vol = 0.05; break;      // 鋭い突き「シュッ」
    case 'swing_claymore': typeOsc = 'sawtooth'; freqStart = 120; freqEnd = 25; duration = 0.3; vol = 0.06; break;    // 重く広い薙ぎ「ブゥォン」
    case 'swing_hammer': typeOsc = 'square'; freqStart = 80; freqEnd = 20; duration = 0.35; vol = 0.05; break;        // 超重い振り下ろし「ドォン」
    case 'swing_knuckle': typeOsc = 'sine'; freqStart = 350; freqEnd = 200; duration = 0.05; vol = 0.04; break;       // 超短い連打「パッ」
    case 'swing_kris': typeOsc = 'triangle'; freqStart = 600; freqEnd = 300; duration = 0.1; vol = 0.05; break;       // 魔法的な短刀「キュン」
    case 'swing_mace': typeOsc = 'square'; freqStart = 100; freqEnd = 30; duration = 0.3; vol = 0.06; break;          // 魔法的な重打「ドゥン」
    case 'swing_gauntlet': typeOsc = 'sine'; freqStart = 400; freqEnd = 250; duration = 0.06; vol = 0.04; break;      // 魔法的な拳「ピュッ」

    // ===== 9. 近接武器 ヒット音（hit） =====
    case 'hit_dagger': typeOsc = 'triangle'; freqStart = 800; freqEnd = 200; duration = 0.06; vol = 0.09; break;      // 軽い刺突「ザクッ」
    case 'hit_saber': typeOsc = 'square'; freqStart = 300; freqEnd = 80; duration = 0.1; vol = 0.1; break;            // 斬撃ヒット「ザシュッ」
    case 'hit_axe': typeOsc = 'sawtooth'; freqStart = 200; freqEnd = 40; duration = 0.15; vol = 0.12; break;          // 重い衝撃「ドスッ」
    case 'hit_spear': typeOsc = 'triangle'; freqStart = 600; freqEnd = 150; duration = 0.08; vol = 0.09; break;       // 貫通音「ズバッ」
    case 'hit_claymore': typeOsc = 'sawtooth'; freqStart = 180; freqEnd = 30; duration = 0.18; vol = 0.12; break;     // 重斬撃「ドザッ」
    case 'hit_hammer': typeOsc = 'square'; freqStart = 100; freqEnd = 20; duration = 0.2; vol = 0.07; break;          // 叩きつけ「ドゴンッ」
    case 'hit_knuckle': typeOsc = 'sine'; freqStart = 300; freqEnd = 100; duration = 0.05; vol = 0.08; break;         // 打撃「ドスッ」
    case 'hit_kris': typeOsc = 'triangle'; freqStart = 900; freqEnd = 400; duration = 0.08; vol = 0.09; break;        // 魔法刺突「キンッ」
    case 'hit_mace': typeOsc = 'square'; freqStart = 120; freqEnd = 25; duration = 0.2; vol = 0.12; break;            // 魔法衝撃「ズドンッ」
    case 'hit_gauntlet': typeOsc = 'sine'; freqStart = 350; freqEnd = 120; duration = 0.06; vol = 0.08; break;        // 魔法打撃「バシッ」

    // ===== 10. 遠隔武器 発射音（shoot） =====
    case 'shoot_handgun': typeOsc = 'square'; freqStart = 800; freqEnd = 100; duration = 0.08; vol = 0.06; break;     // 拳銃「パンッ」
    case 'shoot_smg': typeOsc = 'square'; freqStart = 600; freqEnd = 150; duration = 0.04; vol = 0.04; break;         // 連射「タッ」（短い）
    case 'shoot_rifle': typeOsc = 'sawtooth'; freqStart = 400; freqEnd = 50; duration = 0.15; vol = 0.08; break;      // 狙撃「ズドンッ」
    case 'shoot_shotgun': typeOsc = 'sawtooth'; freqStart = 300; freqEnd = 30; duration = 0.12; vol = 0.09; break;    // 散弾「ドシャッ」
    case 'shoot_grenade': typeOsc = 'sine'; freqStart = 200; freqEnd = 80; duration = 0.15; vol = 0.06; break;        // 発射「トンッ」
    case 'shoot_boomerang': typeOsc = 'triangle'; freqStart = 500; freqEnd = 800; duration = 0.2; vol = 0.05; break;  // 投擲「ヒュンッ」
    case 'shoot_chakram': typeOsc = 'triangle'; freqStart = 400; freqEnd = 1000; duration = 0.25; vol = 0.05; break;  // 回転展開「シュイーン」
    case 'shoot_grimoire': typeOsc = 'sine'; freqStart = 300; freqEnd = 800; duration = 0.3; vol = 0.06; break;       // 詠唱「フォン」
    case 'shoot_cards': typeOsc = 'triangle'; freqStart = 700; freqEnd = 300; duration = 0.08; vol = 0.05; break;     // カード投げ「シュッ」
    case 'shoot_orb': typeOsc = 'sine'; freqStart = 200; freqEnd = 600; duration = 0.3; vol = 0.05; break;            // 魔力展開「ウォン」

    // ===== 11. 遠隔武器 ヒット音（hit） =====
    case 'hit_handgun': typeOsc = 'square'; freqStart = 200; freqEnd = 50; duration = 0.08; vol = 0.08; break;        // 弾丸着弾「バシッ」
    case 'hit_smg': typeOsc = 'square'; freqStart = 250; freqEnd = 80; duration = 0.05; vol = 0.06; break;            // 軽い着弾「パッ」
    case 'hit_rifle': typeOsc = 'sawtooth'; freqStart = 300; freqEnd = 30; duration = 0.12; vol = 0.1; break;         // 重い着弾「ズドッ」
    case 'hit_shotgun': typeOsc = 'sawtooth'; freqStart = 250; freqEnd = 40; duration = 0.1; vol = 0.09; break;       // 散弾着弾「バスッ」
    case 'hit_grenade': typeOsc = 'square'; freqStart = 150; freqEnd = 20; duration = 0.25; vol = 0.12; break;        // 爆発「ドカンッ」
    case 'hit_boomerang': typeOsc = 'triangle'; freqStart = 600; freqEnd = 200; duration = 0.08; vol = 0.07; break;   // 切裂「ザシュッ」
    case 'hit_chakram': typeOsc = 'triangle'; freqStart = 700; freqEnd = 300; duration = 0.06; vol = 0.07; break;     // 回転切裂「シュンッ」
    case 'hit_grimoire': typeOsc = 'sine'; freqStart = 500; freqEnd = 1200; duration = 0.15; vol = 0.08; break;       // 魔法着弾「フワンッ」
    case 'hit_cards': typeOsc = 'triangle'; freqStart = 500; freqEnd = 150; duration = 0.06; vol = 0.06; break;       // カード着弾「シャッ」
    case 'hit_orb': typeOsc = 'sine'; freqStart = 400; freqEnd = 1000; duration = 0.12; vol = 0.07; break;            // 魔法着弾「ポンッ」
  }

  osc.type = typeOsc;
  osc.frequency.setValueAtTime(freqStart, now);
  if (freqStart !== freqEnd) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration);
  }
  
  gainNode.gain.setValueAtTime(vol * 2 * masterSeVolume, now); // 音量を2倍に調整
  gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

  osc.start(now);
  osc.stop(now + duration);
}
