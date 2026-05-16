import { useState, useEffect, useRef, memo } from 'react';
import { getLevel, getExpRatio, onLevelUp } from '../game/playerLevel';

/**
 * EXPバー＋レベル表示＋Level Up!演出
 * ゲーム進行を止めず、常時表示する軽量UIコンポーネント
 */

export const ExpBar = memo(function ExpBar({
  onLevelUpSync,
  isRewardOpen,
}: {
  onLevelUpSync: (newLevel: number) => void;
  isRewardOpen?: boolean;
}) {
  const [level, setLevel] = useState(getLevel());
  const [ratio, setRatio] = useState(getExpRatio());
  const [showLvUp, setShowLvUp] = useState(false);
  const [lvUpTimeLeft, setLvUpTimeLeft] = useState(0);

  // ポーリングでEXP表示を更新（100ms間隔、軽量）
  useEffect(() => {
    const interval = setInterval(() => {
      setLevel(getLevel());
      setRatio(getExpRatio());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // レベルアップコールバック
  useEffect(() => {
    const unsub = onLevelUp((newLevel: number) => {
      setShowLvUp(true);
      setLvUpTimeLeft(2500);
      onLevelUpSync(newLevel);
    });
    return unsub;
  }, [onLevelUpSync]);

  // 演出タイマーの制御（一時停止対応）
  useEffect(() => {
    if (showLvUp && !isRewardOpen) {
      const interval = setInterval(() => {
        setLvUpTimeLeft(prev => {
          const next = prev - 100;
          if (next <= 0) {
            setShowLvUp(false);
            return 0;
          }
          return next;
        });
      }, 100);
      return () => clearInterval(interval);
    }
  }, [showLvUp, isRewardOpen]);

  return (
    <>
      {/* EXPバー */}
      <div className="exp-bar-container" style={{ zIndex: isRewardOpen ? 100 : 40 }}>
        <div className="exp-bar-level impact-font">EXP</div>
        <div className="exp-bar-track">
          <div
            className="exp-bar-fill"
            style={{ width: `${Math.min(ratio * 100, 100)}%` }}
          />
        </div>
        <div className="exp-bar-percent">
          <span className="impact-font" style={{ color: '#00e5ff' }}>
            Lv.{level}
          </span>
          {' '}
          {Math.floor(ratio * 100)}%
        </div>
      </div>

      {/* Level Up! 演出 */}
      {showLvUp && (
        <div className="levelup-overlay" style={{ animationPlayState: isRewardOpen ? 'paused' : 'running' }}>
          <div className="levelup-text zen-dots" style={{ animationPlayState: isRewardOpen ? 'paused' : 'running' }}>Level Up!</div>
          <div className="levelup-level zen-dots" style={{ animationPlayState: isRewardOpen ? 'paused' : 'running' }}>Lv.{level}</div>
        </div>
      )}
    </>
  );
});
