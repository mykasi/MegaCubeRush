import { useEffect, useRef, memo } from 'react';
import { getPlayerHp, getPlayerMaxHp, isPlayerInvincible } from '../game/playerHp';
import { getDashStamina, getDashMaxStamina } from '../game/playerDash';
import { playerDebuffs, dodgeBuffTimer, shifukuBuffAmount, getMaxOb, getMaxArDuration } from '../game/playerStats';
import { playSound } from '../game/soundBus';

/**
 * プレイヤーHPバーUI
 * 画面下部に固定表示。requestAnimationFrame (60fps) でDOMを直接更新
 */

export const HpBar = memo(function HpBar({ isRewardOpen }: { isRewardOpen?: boolean }) {
  // DOM参照用のRef
  const hpFillRef = useRef<HTMLDivElement>(null);
  const hpTextRef = useRef<HTMLDivElement>(null);
  const hpLabelSpanRef = useRef<HTMLSpanElement>(null);
  const hpTrackRef = useRef<HTMLDivElement>(null);

  const obFillRef = useRef<HTMLDivElement>(null);
  const obTextRef = useRef<HTMLDivElement>(null);

  const arFillRef = useRef<HTMLDivElement>(null);
  const arTextRef = useRef<HTMLDivElement>(null);

  const spLabelRef = useRef<HTMLSpanElement>(null);

  // 通知音・状態管理用の内部Ref (再レンダリング不要)
  const stateRef = useRef({
    lastSp: 100,
    lastOb: 0,
    lastDebuff: { fire: 0, ice: 0, lightning: 0 },
    lastLowHpTime: 0,
    isInvincible: false
  });

  useEffect(() => {
    let animationFrameId: number;

    const loop = () => {
      const currentHp = getPlayerHp();
      const currentMaxHp = getPlayerMaxHp();
      const currentOb = shifukuBuffAmount;
      const currentMaxOb = getMaxOb();
      const currentAr = dodgeBuffTimer;
      const currentMaxAr = getMaxArDuration();
      const currentFire = playerDebuffs.fire;
      const currentIce = playerDebuffs.ice;
      const currentLightning = playerDebuffs.lightning;
      const isInvincible = isPlayerInvincible();

      // 1. HPバー更新
      if (hpFillRef.current && hpTrackRef.current && currentMaxHp > 0) {
        const ratio = Math.max(0, Math.min(1, currentHp / currentMaxHp));
        hpFillRef.current.style.width = `${ratio * 100}%`;
        
        // 中身の色を段階的に変更
        let barColor = '#4caf50'; // 1/2より上: 緑
        if (ratio <= 0.25) {
          barColor = '#f44336'; // 1/4以下: 赤
        } else if (ratio <= 0.5) {
          barColor = '#ffeb3b'; // 1/2以下: 黄
        }
        hpFillRef.current.style.backgroundColor = barColor;

        // 外枠の色を炎上時のみ変更
        const isFired = currentFire > 0;
        hpTrackRef.current.style.borderColor = isFired ? '#FF4500' : 'rgba(255,255,255,0.2)';
        hpTrackRef.current.style.boxShadow = isFired ? '0 0 10px rgba(255, 69, 0, 0.7)' : 'none';

        if (hpTextRef.current) {
          const hpTextColor = currentFire > 0 ? '#FF4500' : '#fff';
          const hpShadow = currentFire > 0 ? 'text-shadow: 0 0 6px rgba(255,69,0,0.4);' : '';
          hpTextRef.current.innerHTML = `<span style="color: ${hpTextColor}; ${hpShadow}">${currentHp.toFixed(1)}</span>/${currentMaxHp.toFixed(1)}`;
        }

        // 無敵アニメーションクラスの動的制御
        if (hpTrackRef.current) {
          if (isInvincible && !stateRef.current.isInvincible) {
            hpTrackRef.current.classList.add('hp-bar-invincible');
          } else if (!isInvincible && stateRef.current.isInvincible) {
            hpTrackRef.current.classList.remove('hp-bar-invincible');
          }
        }
      }

      // 2. OBゲージ更新
      if (obFillRef.current && currentMaxOb > 0) {
        const obRatio = Math.max(0, Math.min(1, currentOb / currentMaxOb));
        obFillRef.current.style.width = `${obRatio * 100}%`;
        if (obTextRef.current) {
          obTextRef.current.innerText = `${(currentOb * 0.5).toFixed(1)}/${(currentMaxOb * 0.5).toFixed(1)}%`;
        }
      }

      // 3. ARゲージ更新
      if (arFillRef.current && currentMaxAr > 0) {
        const arRatio = Math.max(0, Math.min(1, currentAr / currentMaxAr));
        arFillRef.current.style.width = `${arRatio * 100}%`;
        if (arTextRef.current) {
          arTextRef.current.innerText = `${currentAr.toFixed(2)}/${currentMaxAr.toFixed(2)}s`;
        }
      }

      // --- サウンド通知ロジック (Date.now()で間隔制御) ---
      const now = Date.now();
      const s = stateRef.current;

      // HP低下警告
      if (currentMaxHp > 0 && currentHp / currentMaxHp <= 0.25 && currentHp > 0) {
        if (now - s.lastLowHpTime > 2000) {
          playSound('low_hp');
          s.lastLowHpTime = now;
        }
      }
      // 状態異常付着音
      if (currentFire > s.lastDebuff.fire || currentIce > s.lastDebuff.ice || currentLightning > s.lastDebuff.lightning) {
        playSound('debuff');
      }
      s.lastDebuff = { fire: currentFire, ice: currentIce, lightning: currentLightning };

      // OBチャージ完了音
      if (s.lastOb < currentMaxOb && currentOb >= currentMaxOb) {
        playSound('buff');
      }
      s.lastOb = currentOb;
      s.isInvincible = isInvincible;

      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <>
      <div style={{
        position: 'fixed',
        top: '32px',
        left: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        zIndex: isRewardOpen ? 100 : 40,
        pointerEvents: 'none',
      }}>
        {/* HP表示エリア */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span ref={hpLabelSpanRef} className="exp-bar-level impact-font" style={{ display: 'inline-block', width: '28px', textAlign: 'center', marginLeft: '9px', color: '#4caf50', textShadow: '0 0 8px rgba(76, 175, 80, 0.5)' }}>HP</span>
          <div ref={hpTrackRef} className="hp-bar-track" style={{ marginLeft: '-1px', width: '140px', position: 'relative', height: '10px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              ref={hpFillRef}
              style={{
                width: '0%',
                height: '100%',
                boxShadow: 'inset 0 0 4px rgba(0,0,0,0.5)',
                transition: 'width 0.1s ease-out',
              }}
            />
          </div>
          <div ref={hpTextRef} className="exp-bar-percent" style={{ marginLeft: '12px', color: '#fff', textShadow: 'none', textAlign: 'left', fontWeight: 'normal' }}>
            0.0/100.0
          </div>
        </div>

        {/* スタミナ表示エリア (DashBarも内包) */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span ref={spLabelRef} className="exp-bar-level impact-font" style={{ display: 'inline-block', width: '28px', textAlign: 'center', marginLeft: '9px', color: '#FFD700', textShadow: '0 0 8px rgba(255, 215, 0, 0.5)' }}>SP</span>
          <DashBar spLabelRef={spLabelRef} />
        </div>

        {/* OBゲージ (Obscurity / ガードバフ) */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="exp-bar-level impact-font" style={{ display: 'inline-block', width: '28px', textAlign: 'center', marginLeft: '9px', color: '#7fbfff', textShadow: '0 0 8px rgba(127, 191, 255, 0.5)' }}>OB</span>
          <div style={{ marginLeft: '-1px', width: '140px', position: 'relative', height: '10px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              ref={obFillRef}
              style={{
                width: '0%',
                height: '100%',
                backgroundColor: '#7fbfff',
                transition: 'width 0.1s ease-out',
              }}
            />
          </div>
          <div ref={obTextRef} className="exp-bar-percent" style={{ marginLeft: '12px', color: '#fff', textShadow: 'none', textAlign: 'left', fontWeight: 'normal', whiteSpace: 'nowrap' }}>
            0.0/100.0%
          </div>
        </div>

        {/* ARゲージ (Adrenaline Rush / 回避バフ) */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="exp-bar-level impact-font" style={{ display: 'inline-block', width: '28px', textAlign: 'center', marginLeft: '9px', color: '#bf7fff', textShadow: '0 0 8px rgba(191, 127, 255, 0.5)' }}>AR</span>
          <div style={{ marginLeft: '-1px', width: '140px', position: 'relative', height: '10px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              ref={arFillRef}
              style={{
                width: '0%',
                height: '100%',
                backgroundColor: '#bf7fff',
                transition: 'width 0.1s ease-out',
              }}
            />
          </div>
          <div ref={arTextRef} className="exp-bar-percent" style={{ marginLeft: '12px', color: '#fff', textShadow: 'none', textAlign: 'left', fontWeight: 'normal', whiteSpace: 'nowrap' }}>
            0.00/5.00s
          </div>
        </div>
      </div>
    </>
  );
});

const DashBar = memo(function DashBar({ spLabelRef }: { spLabelRef: React.RefObject<HTMLSpanElement | null> }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationFrameId: number;
    const sRef = { lastSp: 0 };

    const loop = () => {
      const maxStamina = getDashMaxStamina();
      const iceVal = playerDebuffs.ice; // 直接参照するように変更
      if (fillRef.current && maxStamina > 0) {
        const currentStamina = getDashStamina();
        const ratio = Math.max(0, Math.min(1, currentStamina / maxStamina));
        const isDepleted = currentStamina < 25;
        const isIced = iceVal > 0;

        fillRef.current.style.width = `${ratio * 100}%`;
        // 中身は常にスタミナ色
        const barColor = isDepleted ? '#FF4500' : '#FFD700';
        fillRef.current.style.backgroundColor = barColor;
        fillRef.current.style.boxShadow = ratio >= 1 ? '0 0 8px rgba(255, 215, 0, 0.4)' : 'none';

        // 外枠の色を氷属性時のみ変更
        const container = fillRef.current.parentElement;
        if (container) {
          container.style.borderColor = isIced ? '#00FFFF' : 'rgba(255,255,255,0.2)';
          container.style.boxShadow = isIced ? '0 0 10px rgba(0, 255, 255, 0.7)' : 'none';
        }

        if (textRef.current) {
          const color = isIced ? '#00FFFF' : '#fff';
          const shadow = isIced ? 'text-shadow: 0 0 6px rgba(0,255,255,0.4);' : '';
          textRef.current.innerHTML = `<span style="color: ${color}; ${shadow}">${currentStamina.toFixed(1)}</span>/${maxStamina.toFixed(1)}`;
        }

        if (sRef.lastSp < maxStamina && currentStamina >= maxStamina) {
          playSound('ui_move');
        }
        sRef.lastSp = currentStamina;
      }
      animationFrameId = requestAnimationFrame(loop);
    };

    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [spLabelRef]);

  return (
    <>
      <div style={{ marginLeft: '-1px', width: '140px', height: '10px', background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px', overflow: 'hidden' }}>
        <div ref={fillRef} style={{ height: '100%', width: '100%', backgroundColor: '#FFD700', transition: 'none', boxShadow: 'inset 0 0 4px rgba(0,0,0,0.5)' }} />
      </div>
      <div ref={textRef} className="exp-bar-percent" style={{ marginLeft: '12px', color: '#fff', textShadow: 'none', textAlign: 'left' }}>
        100.0/100.0
      </div>
    </>
  );
});

export const DamageVignette = memo(function DamageVignette() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      const hp = getPlayerHp();
      const maxHp = getPlayerMaxHp();
      const isDying = maxHp > 0 && hp / maxHp < 0.125;
      if (containerRef.current) {
        containerRef.current.style.display = isDying ? 'block' : 'none';
      }
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return <div ref={containerRef} className="damage-vignette" style={{ display: 'none' }} />;
});
