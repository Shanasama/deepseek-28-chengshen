import React from 'react';
import { SvgRenderBlock } from '../types/schema';

/**
 * 解析并渲染带 `<red>...</red>` 标记的代码/命令字符串
 * 用于代码求助轮次的 Mini Bash 预览框与正文 Bash 工具调用卡片
 */
export const RedMarkedCode: React.FC<{ code: string; className?: string }> = ({
  code,
  className = '',
}) => {
  const parts = code.split(/(<red>[\s\S]*?<\/red>)/g);

  return (
    <pre
      className={`font-mono text-xs leading-relaxed whitespace-pre-wrap break-all ${className}`}
    >
      {parts.map((part, idx) => {
        if (part.startsWith('<red>') && part.endsWith('</red>')) {
          const inner = part.slice(5, -6);
          return (
            <span
              key={idx}
              className="bg-red-500/25 text-red-300 border border-red-500/60 px-1 py-0.5 rounded font-semibold shadow-sm shadow-red-950"
              title="危险命令 / 硬编码屎山语句"
            >
              {inner}
            </span>
          );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </pre>
  );
};

/**
 * 渲染聊天窗口中的 SVG 图形（重点：掺水中转站 Boss 战的「骑自行车的鹈鹕 SVG」真假对比！）
 */
export const PelicanSvgRenderer: React.FC<{ block: SvgRenderBlock }> = ({ block }) => {
  return (
    <div className="my-2 rounded-xl border border-slate-700/80 bg-slate-900/90 p-3 shadow-inner">
      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2 pb-1.5 border-b border-slate-800">
        <span className="font-mono text-sky-400 flex items-center gap-1.5">
          <span>🎨 SVG Vector Canvas</span>
          <span className="text-slate-600">|</span>
          <span>{block.caption || block.presetId}</span>
        </span>
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            block.presetId === 'pelican_cheat_good'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
          }`}
        >
          {block.presetId === 'pelican_cheat_good' ? '高精度矢量渲染' : '低精度几何拼接'}
        </span>
      </div>

      <div className="flex justify-center items-center bg-slate-950/80 rounded-lg p-3 border border-slate-800/70">
        {block.presetId === 'pelican_cheat_good' ? (
          /* 精美版：中转站预埋或深层手搓的「骑自行车的鹈鹕 SVG」 */
          <svg
            viewBox="0 0 320 200"
            className="w-full max-w-[300px] h-40"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0f172a" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
              <linearGradient id="pouchGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
            </defs>
            <rect width="320" height="200" rx="10" fill="url(#skyGrad)" />
            {/* 地面线 */}
            <line x1="20" y1="172" x2="300" y2="172" stroke="#334155" strokeWidth="2" strokeDasharray="6 4" />
            {/* 后轮与前轮 */}
            <circle cx="95" cy="142" r="28" fill="none" stroke="#38bdf8" strokeWidth="4" />
            <circle cx="95" cy="142" r="4" fill="#38bdf8" />
            <line x1="67" y1="142" x2="123" y2="142" stroke="#38bdf8" strokeWidth="1" opacity="0.5" />
            <line x1="95" y1="114" x2="95" y2="170" stroke="#38bdf8" strokeWidth="1" opacity="0.5" />

            <circle cx="225" cy="142" r="28" fill="none" stroke="#38bdf8" strokeWidth="4" />
            <circle cx="225" cy="142" r="4" fill="#38bdf8" />
            <line x1="197" y1="142" x2="253" y2="142" stroke="#38bdf8" strokeWidth="1" opacity="0.5" />
            <line x1="225" y1="114" x2="225" y2="170" stroke="#38bdf8" strokeWidth="1" opacity="0.5" />

            {/* 自行车车架 */}
            <polygon
              points="95,142 140,105 205,105 155,142"
              fill="none"
              stroke="#f43f5e"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <line x1="205" y1="105" x2="225" y2="142" stroke="#f43f5e" strokeWidth="4" />
            <line x1="205" y1="105" x2="198" y2="82" stroke="#f43f5e" strokeWidth="4" />
            {/* 车把 */}
            <path d="M 188 82 Q 205 78 214 86" fill="none" stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round" />
            {/* 车座 */}
            <line x1="140" y1="105" x2="134" y2="92" stroke="#94a3b8" strokeWidth="4" />
            <ellipse cx="132" cy="90" rx="12" ry="4" fill="#e2e8f0" />

            {/* 鹈鹕身体与翅膀 */}
            <ellipse cx="142" cy="72" rx="28" ry="20" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="2" />
            <path
              d="M 125 68 Q 150 55 168 78 Q 145 85 125 68 Z"
              fill="#e2e8f0"
              stroke="#94a3b8"
              strokeWidth="1.5"
            />
            {/* 鹈鹕脚踩踏板 */}
            <polyline
              points="145,90 158,118 155,142"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="155" cy="142" r="6" fill="#cbd5e1" />
            {/* 鹈鹕脖子与头 */}
            <path
              d="M 162 62 Q 178 45 172 30 Q 182 22 192 30 Q 190 48 175 68"
              fill="#f8fafc"
              stroke="#cbd5e1"
              strokeWidth="2"
            />
            {/* 眼睛與护目镜 */}
            <circle cx="185" cy="31" r="3" fill="#0f172a" />
            <circle cx="186" cy="30" r="1" fill="#ffffff" />
            {/* 标志性大嘴与喉囊 */}
            <polygon points="191,28 248,32 192,38" fill="#fde047" stroke="#ca8a04" strokeWidth="1.5" />
            <path
              d="M 192 36 Q 222 64 246 33 Z"
              fill="url(#pouchGrad)"
              stroke="#d97706"
              strokeWidth="1.5"
            />
            {/* 翅膀扶车把 */}
            <path d="M 160 72 Q 182 78 195 82" fill="none" stroke="#f8fafc" strokeWidth="5" strokeLinecap="round" />
          </svg>
        ) : block.presetId === 'pelican_bluff_bad' ? (
          /* 翻车版：小模型盲目自信手搓出的「三个歪斜三角形抽象鹈鹕 SVG」 */
          <svg
            viewBox="0 0 320 200"
            className="w-full max-w-[300px] h-40"
            xmlns="http://www.w3.org/2000/svg"
          >
            <rect width="320" height="200" rx="10" fill="#090d16" />
            {/* 歪七扭八的两个椭圆轮子（甚至没对齐地面） */}
            <ellipse cx="85" cy="155" rx="32" ry="18" fill="none" stroke="#ef4444" strokeWidth="3" />
            <ellipse cx="230" cy="130" rx="22" ry="30" fill="none" stroke="#ef4444" strokeWidth="3" />
            {/* 乱连的车架线 */}
            <line x1="85" y1="155" x2="260" y2="90" stroke="#64748b" strokeWidth="2" />
            <line x1="110" y1="110" x2="230" y2="130" stroke="#64748b" strokeWidth="2" />
            {/* 三个灵魂三角形组成的“鹈鹕” */}
            <polygon points="115,120 155,55 180,115" fill="#cbd5e1" opacity="0.8" />
            <polygon points="165,65 245,40 190,95" fill="#facc15" opacity="0.85" />
            <polygon points="95,85 130,70 120,135" fill="#94a3b8" opacity="0.7" />
            {/* 诡异悬浮的眼睛 */}
            <circle cx="175" cy="48" r="5" fill="#ef4444" />
            <text x="20" y="28" fill="#64748b" fontSize="10" fontFamily="monospace">
              &lt;!-- TODO: pelican_bicycle_v1_final_real.svg --&gt;
            </text>
            <text x="185" y="178" fill="#f87171" fontSize="11" fontFamily="monospace">
              NaN_wheel_offset??
            </text>
          </svg>
        ) : (
          <div
            className="w-full flex justify-center"
            dangerouslySetInnerHTML={{ __html: block.rawSvg || '' }}
          />
        )}
      </div>
    </div>
  );
};

/**
 * 角色头像组件（直接体现角色特征：格子衫地中海、清纯大学生、白发教授、黑客帽衫、失恋少女、中转站机柜等）
 */
export const CharacterAvatarBadge: React.FC<{
  iconId: string;
  name: string;
  isBoss?: boolean;
  size?: 'sm' | 'md' | 'lg';
}> = ({ iconId, name, isBoss, size = 'md' }) => {
  const sizeCls =
    size === 'sm'
      ? 'w-8 h-8 text-sm'
      : size === 'lg'
      ? 'w-12 h-12 text-xl'
      : 'w-10 h-10 text-base';

  const getVisual = () => {
    switch (iconId) {
      case 'code_senior_dev':
        return { emoji: '👨‍🦲', bg: 'from-rose-900/80 to-slate-800 border-rose-500/40' };
      case 'code_vibe_coder':
        return { emoji: '🧑‍🎓', bg: 'from-sky-900/80 to-slate-800 border-sky-500/40' };
      case 'know_professor':
        return { emoji: '👓', bg: 'from-amber-900/80 to-slate-800 border-amber-500/40' };
      case 'troll_injector':
        return { emoji: '🥷', bg: 'from-emerald-950 to-slate-900 border-emerald-500/50' };
      case 'emo_heartbroken':
        return { emoji: '🌧️', bg: 'from-purple-900/80 to-slate-800 border-purple-500/40' };
      case 'chat_retiree':
        return { emoji: '🪭', bg: 'from-orange-900/80 to-slate-800 border-orange-500/40' };
      case 'boss_proxy':
        return { emoji: '🖧', bg: 'from-red-950 to-amber-950 border-red-500/70' };
      case 'tutorial_tester':
        return { emoji: '🎧', bg: 'from-teal-900/80 to-slate-800 border-teal-500/40' };
      default:
        return { emoji: '💬', bg: 'from-slate-800 to-slate-900 border-slate-600' };
    }
  };

  const { emoji, bg } = getVisual();

  return (
    <div
      className={`relative rounded-xl bg-gradient-to-br ${bg} border flex items-center justify-center shrink-0 select-none shadow-sm ${sizeCls}`}
      title={name}
    >
      <span>{emoji}</span>
      {isBoss && (
        <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[9px] font-bold px-1 rounded shadow">
          BOSS
        </span>
      )}
    </div>
  );
};
