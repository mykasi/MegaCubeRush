import { useState, useEffect } from 'react';
import { currentCombo, getComboBonus } from '../game/comboBus';

export function ComboUI({ style }: { style?: React.CSSProperties }) {
  const [combo, setCombo] = useState(0);
  const [comboBonus, setComboBonus] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCombo(currentCombo);
      setComboBonus(getComboBonus());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  if (combo <= 0) return null;

  const ocBonusCap = window.__systemUpgrades?.overclock || 0;
  const maxHitCap = 500 + Math.round(ocBonusCap * 1000);
  const progress = Math.min(1, combo / maxHitCap); // 0.0 ~ 1.0 (上限で最大演出)

  // 色の補完 (白 -> 黄 -> 橙 -> 赤)
  // 0: #ffffff, 0.4: #ffeb3b, 0.7: #ff9800, 1.0: #ff5252
  let comboColor = '#ffffff';
  if (progress > 0.7) {
    comboColor = '#ff5252'; // 赤
  } else if (progress > 0.4) {
    comboColor = '#ff9800'; // 橙
  } else if (progress > 0.1) {
    comboColor = '#ffeb3b'; // 黄
  }

  // より滑らかな色変化のためのHSL計算 (手動補間)
  // 0% (H:0, S:0, L:100) -> 100% (H:0, S:80, L:60) 
  // 黄色が H:50 くらいなので、色相を 60 -> 0 にスライドさせる
  const hue = 60 * (1 - progress);
  const saturation = combo > 20 ? 80 + progress * 20 : 0;
  const lightness = combo > 20 ? 80 - progress * 20 : 100;
  const smoothColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

  const glowOpacity = progress * 0.8;
  const comboGlow = combo >= 100 ? `0 0 ${10 + progress * 20}px hsla(${hue}, 100%, 50%, ${glowOpacity})` : 'none';

  return (
    <div style={{
      textAlign: 'right',
      pointerEvents: 'none',
      ...style
    }}>
      {/* ヒット数表示 (ここだけ拡大) */}
      <div className="impact-font" style={{
        fontSize: '36px',
        color: smoothColor,
        textShadow: `${comboGlow}, 0 2px 4px rgba(0,0,0,0.8)`,
        fontStyle: 'italic',
        letterSpacing: '1px',
        WebkitTextStroke: '1.2px black',
        transform: `scale(${1 + progress * 0.3})`,
        transformOrigin: 'top right',
        transition: 'all 0.2s ease-out',
      }}>
        <span style={{ fontSize: `${100 + progress * 50}%`, display: 'inline-block', marginRight: '4px' }}>
          {combo}
        </span>
        <span style={{
          fontSize: '0.65em',
          letterSpacing: '-2px', // 文字間を詰める
          display: 'inline-block',
          transform: 'scaleX(0.9)', // 横幅をさらに詰める
          transformOrigin: 'left'
        }}>
          CHAIN
        </span>
      </div>

      {/* OVERCLOCK表示 (サイズ固定・マージンを動的に調整) */}
      {comboBonus > 0 && (
        <div className="zen-dots" style={{
          fontSize: '14px',
          color: '#b2ebf2',
          textShadow: '0 0 8px rgba(0, 229, 255, 0.6)',
          letterSpacing: '1px', // ここの数値を変えることで文字間を調整できます
          marginTop: `${2 + progress * 16}px`, // 拡大に合わせてマージンを増やす
          WebkitTextStroke: '0.5px #000',
          opacity: 0.8 + progress * 0.2,
          transition: 'margin-top 0.2s ease-out, color 0.3s ease'
        }}>
          Overclock +{(comboBonus * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
