import React, { useEffect, useRef } from 'react';
import { useGamepad } from '../hooks/useGamepad';
import { playSound } from '../game/soundBus';

interface ChangelogUIProps {
  isOpen: boolean;
  onClose: () => void;
  isGamepad?: boolean;
}

interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

const CHANGELOG_DATA: ChangelogEntry[] = [
  {
    version: 'Ver.1.4.0',
    date: '2026/05/21',
    items: [
      'タイトル画面左下に「UPDATE」ボタンを新設し、更新履歴モーダル画面を追加',
    ]
  },
  {
    version: 'Ver.1.3.0',
    date: '2026/05/20',
    items: [
      'HELP → システムに「🎁 リワード」サブタブを新規実装',
    ]
  },
  {
    version: 'Ver.1.2.0',
    date: '2026/05/19',
    items: [
      'ゲーム内のフォント周りを調整',
    ]
  },
  {
    version: 'Ver.1.1.0',
    date: '2026/05/18',
    items: [
      'タイトルメニューの説明文を画面下部に追加',
    ]
  },
  {
    version: 'Ver.1.0.0',
    date: '2026/05/17',
    items: [
      '『MegaCubeRush』リリース'
    ]
  }
];

export const ChangelogUI: React.FC<ChangelogUIProps> = ({ isOpen, onClose, isGamepad = false }) => {
  const { poll } = useGamepad();
  const contentRef = useRef<HTMLDivElement>(null);

  // パッド暴発防止のためのエッジトリガー
  const lastB = useRef(false);
  const lastSelect = useRef(false);
  const lastLT = useRef(false);

  // マウント時にアニメーション音を鳴らす
  useEffect(() => {
    if (isOpen) {
      playSound('ui_tab_large');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let frameId: number;
    const loop = () => {
      const { mainDevice } = poll();
      if (mainDevice) {
        const bBtn = mainDevice.buttons[1] > 0.5;
        const selectBtn = mainDevice.buttons[8] > 0.5;
        const ltBtn = mainDevice.buttons[6] > 0.5;

        // Bボタンで閉じる
        if (bBtn && !lastB.current) {
          playSound('ui_cancel');
          onClose();
        }

        lastB.current = bBtn;
        lastSelect.current = selectBtn;
        lastLT.current = ltBtn;

        // 右スティックでコンテンツをスクロール
        const rsY = mainDevice.axes[3];
        if (Math.abs(rsY) > 0.2) {
          contentRef.current?.scrollBy({ top: rsY * 16 });
        }
      }
      frameId = requestAnimationFrame(loop);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // ESCまたはBackspaceで閉じる
      if (e.key === 'Escape' || e.key === 'Backspace') {
        playSound('ui_cancel');
        onClose();
        e.preventDefault();
      }
      if (e.key === 'PageUp') {
        contentRef.current?.scrollBy({ top: -200, behavior: 'smooth' });
        e.preventDefault();
      }
      if (e.key === 'PageDown') {
        contentRef.current?.scrollBy({ top: 200, behavior: 'smooth' });
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    frameId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(frameId);
    };
  }, [isOpen, onClose, poll]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh',
      backgroundColor: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      zIndex: 10000, color: '#fff',
      fontFamily: "'GenEiLateMin', 'Helvetica Neue', Arial, sans-serif",
      animation: 'changelogFadeIn 0.3s ease-out'
    }}>
      <div style={{
        width: '80%', maxWidth: '720px', height: '75vh',
        background: 'rgba(10, 15, 30, 0.85)',
        border: '2px solid rgba(0, 229, 255, 0.4)',
        borderRadius: '16px',
        padding: '32px',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 30px rgba(0, 229, 255, 0.25), inset 0 0 20px rgba(0, 229, 255, 0.1)',
        position: 'relative'
      }}>

        {/* 閉じる「✕」ボタン */}
        <button
          onClick={() => { playSound('ui_cancel'); onClose(); }}
          className="changelog-close-btn"
          style={{
            position: 'absolute', top: '16px', right: '16px',
            width: '36px', height: '36px', borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)',
            color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease', outline: 'none',
            zIndex: 10
          }}
        >
          ✕
        </button>

        {/* ヘッダータイトル */}
        <h2 style={{
          margin: '0 0 24px 0', fontSize: '32px', textAlign: 'center',
          fontFamily: "'ZenDots', sans-serif", fontWeight: 'normal',
          letterSpacing: '6px',
          background: 'linear-gradient(180deg, #fff 0%, #00e5ff 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 0 10px rgba(0, 229, 255, 0.5))',
          pointerEvents: 'none'
        }}>
          UPDATE HISTORY
        </h2>

        {/* 履歴リスト表示領域 */}
        <div
          ref={contentRef}
          style={{
            flex: 1, overflowY: 'auto', paddingRight: '12px',
            display: 'flex', flexDirection: 'column', gap: '28px'
          }}
        >
          {CHANGELOG_DATA.map((entry, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderLeft: '4px solid #00e5ff',
                borderRadius: '8px',
                padding: '20px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                animation: `changelogSlideUp 0.4s ease-out ${idx * 0.08}s both`
              }}
            >
              {/* バージョンと実装日 */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                marginBottom: '14px', borderBottom: '1px solid rgba(0, 229, 255, 0.2)',
                paddingBottom: '8px'
              }}>
                <span style={{
                  fontSize: '20px', fontWeight: 'bold', color: '#00e5ff',
                  textShadow: '0 0 8px rgba(0, 229, 255, 0.4)',
                  fontFamily: "'GenEiLateMin', serif"
                }}>
                  {entry.version}
                </span>
                <span style={{ fontSize: '14px', color: '#888', fontWeight: 'normal', fontFamily: 'sans-serif' }}>
                  実装日: {entry.date}
                </span>
              </div>

              {/* 各更新内容項目 */}
              <ul style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {entry.items.map((item, itemIdx) => (
                  <li
                    key={itemIdx}
                    style={{
                      fontSize: '14px', color: '#ddd', lineHeight: '1.4',
                      listStyleType: 'square',
                      fontFamily: 'sans-serif'
                    }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 下部キーガイド */}
        <div style={{
          marginTop: '24px', paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex', justifyContent: 'center'
        }}>
          {isGamepad ? (
            <div className="gp-btn-container" style={{ justifyContent: 'center', fontSize: '13px' }}>
              <span className="gp-btn gp-btn-rs" style={{ width: '18px', height: '18px', fontSize: '10px' }}>RS</span>
              <span className="gp-label">スクロール</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <span className="gp-btn gp-btn-b">B</span>
              <span className="gp-label">戻る</span>
            </div>
          ) : (
            <div className="gp-btn-container" style={{ justifyContent: 'center', fontSize: '13px', color: '#aaa' }}>
              <kbd className="gp-kbd" style={{ fontSize: '10px' }}>PageUp</kbd>
              <kbd className="gp-kbd" style={{ fontSize: '10px' }}>PageDown</kbd>
              <span className="gp-label">スクロール</span>
              <span style={{ margin: '0 8px', color: '#444' }}>|</span>
              <kbd className="gp-kbd">ESC</kbd>
              <kbd className="gp-kbd">Backspace</kbd>
              <span className="gp-label">戻る</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes changelogFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes changelogSlideUp {
          from { opacity: 0; transform: translateY(15px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .changelog-close-btn:hover {
          background: #ff5252 !important;
          border-color: #ff5252 !important;
          transform: rotate(90deg);
        }
      `}</style>
    </div>
  );
};
