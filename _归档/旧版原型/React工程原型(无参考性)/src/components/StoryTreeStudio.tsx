import React, { useEffect, useState } from 'react';
import {
  AttributeId,
  CandidateCardSlot,
  CardBranchContent,
  CharacterScenarioFile,
  CorpusTier,
  EasterEggCardSpec,
  FeelingSensitivity,
  GameConfig,
  PerceptionLevel,
  TurnNode,
  UserCategory,
} from '../types/schema';
import {
  ALL_ATTRIBUTES,
  ATTRIBUTE_LABELS,
  computeTurnCardPool,
  createInitialTrainingState,
  createSmartTurnSkeleton,
   getStyleLogitScore,
  PlayerTrainingState,
  STYLE_LABELS,
  validateScenarioHealth,
} from '../engine/gameEngine';
import { DesktopSessionRunner } from './DesktopSessionRunner';
import {
  CharacterAvatarBadge,
  PelicanSvgRenderer,
  RedMarkedCode,
} from './RichWidgets';

interface StoryTreeStudioProps {
  characters: Array<CharacterScenarioFile & { _fileName?: string }>;
  config: GameConfig;
  onSaveCharacter: (
    char: CharacterScenarioFile & { _fileName?: string }
  ) => Promise<void>;
  onDeleteCharacter: (fileName: string) => Promise<void>;
  onSaveConfig: (newConfig: GameConfig) => Promise<void>;
  lastDiskSyncNotice: string | null;
}

type InspectorSelection =
  | { type: 'character' }
  | { type: 'turn'; turnIdx: number }
  | {
      type: 'candidate';
      turnIdx: number;
      candIdx: number;
      activeVariantTab?: 'shallow' | 'deep' | 'zero' | 'content';
    }
  | { type: 'easter_egg'; turnIdx: number };

export const StoryTreeStudio: React.FC<StoryTreeStudioProps> = ({
  characters,
  config,
  onSaveCharacter,
  onDeleteCharacter,
  onSaveConfig,
  lastDiskSyncNotice,
}) => {
  const [selectedCharId, setSelectedCharId] = useState<string>(
    () => characters[0]?.characterId || ''
  );
  const [selectedScenarioIdx, setSelectedScenarioIdx] = useState<number>(0);

  // 当前正在编辑的角色工作副本
  const [draftChar, setDraftChar] = useState<
    (CharacterScenarioFile & { _fileName?: string }) | null
  >(null);
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  // 上帝沙盒：训练状态模拟盘
  const [simTraining, setSimTraining] = useState<PlayerTrainingState>(() =>
    createInitialTrainingState(true)
  );
  const [showOutcomeSpoiler, setShowOutcomeSpoiler] = useState<boolean>(true);
  const [forceSpawnEasterEgg, setForceSpawnEasterEgg] =
    useState<boolean>(false);
  const [forceBluffOutcome, setForceBluffOutcome] = useState<
    'auto' | 'force_pass' | 'force_caught'
  >('auto');
  const [simBossStreak, setSimBossStreak] = useState<number>(4);
  const [autoSelectEnabled, setAutoSelectEnabled] = useState<boolean>(false);

  // 右侧面板状态：'inspector' (节点/卡牌精细编辑器) vs 'playtest' (内嵌桌面端实机试玩)
  const [rightTab, setRightTab] = useState<'inspector' | 'playtest'>(
    'inspector'
  );
  const [selection, setSelection] = useState<InspectorSelection>({
    type: 'turn',
    turnIdx: 0,
  });
  const [playtestStartTurn, setPlaytestStartTurn] = useState<number>(1);
  const [playtestHearts, setPlaytestHearts] = useState<number>(3);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [draftConfig, setDraftConfig] = useState<GameConfig>(config);

  // 当外部切换角色或外部文件热更新时同步 draftChar
  useEffect(() => {
    const found =
      characters.find((c) => c.characterId === selectedCharId) || characters[0];
    if (found) {
      setSelectedCharId(found.characterId);
      setDraftChar(structuredClone(found));
      setIsDirty(false);
    }
  }, [selectedCharId, characters]);

  useEffect(() => {
    setDraftConfig(config);
  }, [config]);

  // Ctrl+S 快捷键直接保存回本地 JSON
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (draftChar) {
          handleSaveDraft();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draftChar]);

  if (!draftChar) {
    return <div className="p-8 text-slate-400">正在载入角色剧情数据...</div>;
  }

  const currentScenario =
    draftChar.scenarios[selectedScenarioIdx] || draftChar.scenarios[0];

  const updateDraft = (
    updater: (prev: CharacterScenarioFile & { _fileName?: string }) => void
  ) => {
    setDraftChar((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      updater(next);
      return next;
    });
    setIsDirty(true);
  };

  const handleSaveDraft = async () => {
    if (!draftChar) return;
    setSavingStatus('正在写入磁盘 JSON...');
    await onSaveCharacter(draftChar);
    setIsDirty(false);
    setSavingStatus('✅ 已保存至 data/scenarios/');
    setTimeout(() => setSavingStatus(null), 2200);
  };

  // 新建角色文件
  const handleCreateNewCharacter = async () => {
    const id = `custom_user_${Date.now().toString().slice(-4)}`;
    const newChar: CharacterScenarioFile & { _fileName?: string } = {
      $schema: '../schema/scenario.schema.json',
      _fileName: `${id}.json`,
      characterId: id,
      name: '新角色（点击修改姓名）',
      category: 'chat',
      avatar: {
        iconId: 'chat_retiree',
        visualDesc: '新角色外观描述（体现察觉力与在乎感受）',
      },
      bio: '在这里填写显示在左侧预告栏的简介（暗藏雷点与偏好线索）。',
      maxTurns: 4,
      targetProgressN: 3,
      perception: 'medium',
      caresAboutFeeling: 'low',
      preferences: ['lively'],
      landmines: ['formal'],
      defaultReactions: {
        praiseLines: ['回答得太合我胃口了，给你点个赞！'],
        dislikeButProceedLines: ['虽然语气一般，但问题算是解决了。'],
        neutralLines: ['唔，这好像没说到点子上，再想想？'],
        landmineWarningLines: {
          formal: '别跟我打官腔说套话！',
          bluff_caught: '你是不是在不懂装懂瞎编忽悠我？警告一次！',
        },
        rageQuitLine: '聊不下去了，再见！（用户已下线）',
        solvedOutroLine: '问题全解决啦，谢谢大肥鱼！（目标达成下线）',
        unsolvedOutroLine: '算了，时间到了，下次再聊吧。',
      },
      scenarios: [
        {
          scenarioId: `${id}_s1`,
          title: '场景1：默认初始剧情',
          turns: [],
        },
      ],
    };
    newChar.scenarios[0].turns.push(createSmartTurnSkeleton(newChar, 1));
    await onSaveCharacter(newChar);
    setSelectedCharId(id);
    setSelectedScenarioIdx(0);
    setSelection({ type: 'character' });
  };

  // 剧情树实时体检
  const healthWarnings = validateScenarioHealth(
    draftChar,
    selectedScenarioIdx,
    config
  );

  // 在指定位置后插入新轮次（自动按角色偏好与雷点生成卡槽骨架）
  const handleInsertTurnAfter = (afterIdx: number) => {
    updateDraft((char) => {
      const sc = char.scenarios[selectedScenarioIdx];
      if (!sc) return;
      const newTurnNumber = sc.turns.length + 1;
      const newTurn = createSmartTurnSkeleton(char, newTurnNumber);
      sc.turns.splice(afterIdx + 1, 0, newTurn);
      sc.turns.forEach((t, i) => {
        t.turnIndex = i + 1;
      });
    });
    setSelection({ type: 'turn', turnIdx: afterIdx + 1 });
  };

  const handleMoveTurn = (idx: number, dir: -1 | 1) => {
    updateDraft((char) => {
      const sc = char.scenarios[selectedScenarioIdx];
      if (!sc) return;
      const target = idx + dir;
      if (target < 0 || target >= sc.turns.length) return;
      const temp = sc.turns[idx];
      sc.turns[idx] = sc.turns[target];
      sc.turns[target] = temp;
      sc.turns.forEach((t, i) => {
        t.turnIndex = i + 1;
      });
    });
    setSelection({ type: 'turn', turnIdx: idx + dir });
  };

  const handleDeleteTurn = (idx: number) => {
    if (!currentScenario || currentScenario.turns.length <= 1) {
      alert('每个场景至少保留 1 轮对话！');
      return;
    }
    updateDraft((char) => {
      const sc = char.scenarios[selectedScenarioIdx];
      sc.turns.splice(idx, 1);
      sc.turns.forEach((t, i) => {
        t.turnIndex = i + 1;
      });
    });
    setSelection({ type: 'turn', turnIdx: Math.max(0, idx - 1) });
  };

  const getCategoryBorderCls = (cat: string) => {
    switch (cat) {
      case 'solve':
        return 'border-emerald-500/70 bg-emerald-950/25';
      case 'bluff':
        return 'border-amber-500/70 bg-amber-950/25';
      case 'landmine':
      case 'solve_and_landmine':
        return 'border-rose-500/70 bg-rose-950/25';
      case 'confession':
        return 'border-sky-500/70 bg-sky-950/25';
      case 'easter_egg':
        return 'border-purple-500/80 bg-purple-950/30';
      default:
        return 'border-slate-700 bg-slate-900/70';
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case 'solve':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            ✓ 正解推进
          </span>
        );
      case 'bluff':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
            🎲 糊弄(检定察觉力)
          </span>
        );
      case 'landmine':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
            💣 踩雷警告
          </span>
        );
      case 'solve_and_landmine':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-amber-200 border border-rose-500/40">
            ⚡ 解决但踩雷
          </span>
        );
      case 'confession':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
            🏳️ 坦白卡
          </span>
        );
      case 'easter_egg':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/25 text-purple-200 border border-purple-500/50">
            ✨ 彩蛋(0.08%)
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400">
            ○ 中性干扰
          </span>
        );
    }
  };

  return (
    <div className="flex h-[calc(100vh-52px)] overflow-hidden bg-slate-950 text-slate-100">
      {/* ===================================================================
          左栏：角色剧本列表 + 上帝沙盒训练状态模拟盘 (God Mode)
         =================================================================== */}
      <div className="w-80 border-r border-slate-800 bg-slate-950 flex flex-col shrink-0">
        {/* 角色列表区 */}
        <div className="p-3 border-b border-slate-800 flex flex-col gap-2 max-h-[44%] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              📂 角色与剧本库 ({characters.length})
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowConfigModal(true)}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 border border-slate-700"
                title="调整全局【参数】config.json"
              >
                ⚙️ 参数
              </button>
              <button
                onClick={handleCreateNewCharacter}
                className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 text-[11px] font-semibold text-white shadow"
              >
                + 新建角色
              </button>
            </div>
          </div>

          <div className="space-y-1">
            {characters.map((c) => {
              const active = c.characterId === draftChar.characterId;
              return (
                <button
                  key={c.characterId}
                  onClick={() => {
                    if (isDirty) {
                      const ok = window.confirm(
                        '当前角色有未保存的修改，切换将丢失未保存更改，是否继续？'
                      );
                      if (!ok) return;
                    }
                    setSelectedCharId(c.characterId);
                    setSelectedScenarioIdx(0);
                    setSelection({ type: 'turn', turnIdx: 0 });
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-xl border transition flex items-center gap-2.5 ${
                    active
                      ? 'bg-sky-950/50 border-sky-500/60 text-white'
                      : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <CharacterAvatarBadge
                    iconId={c.avatar.iconId}
                    name={c.name}
                    isBoss={c.isBoss}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold truncate">
                        {c.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 shrink-0">
                        {c.category}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">
                      {c._fileName} · {c.scenarios.length}个场景 · 察觉:{c.perception}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 上帝沙盒：白天预训练 & 后训练 (RLHF) 实时模拟器 */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-900/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-300 flex items-center gap-1">
              <span>🎛️ 上帝训练状态模拟盘</span>
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setSimTraining(createInitialTrainingState(true))}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 border border-slate-700"
              >
                初始态
              </button>
              <button
                onClick={() =>
                  setSimTraining({
                    tiers: {
                      knowledge: 1,
                      lively: 1,
                      narrative: 1,
                      logic: 1,
                      formal: 1,
                      diversity: 1,
                    },
                    rlhfCounts: {
                      knowledge: 0,
                      lively: 0,
                      narrative: 0,
                      logic: 0,
                      formal: 0,
                      diversity: 0,
                      intuition: 0,
                    },
                  })
                }
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-sky-300 border border-slate-700"
              >
                全浅层
              </button>
              <button
                onClick={() =>
                  setSimTraining({
                    tiers: {
                      knowledge: 2,
                      lively: 2,
                      narrative: 2,
                      logic: 2,
                      formal: 2,
                      diversity: 2,
                    },
                    rlhfCounts: {
                      knowledge: 1,
                      lively: 1,
                      narrative: 1,
                      logic: 1,
                      formal: 0,
                      diversity: 1,
                      intuition: 0,
                    },
                  })
                }
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-emerald-300 border border-slate-700"
              >
                全深层
              </button>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            拨动下方预训练层级与 RLHF 次数，中间剧情树将<strong>实时重算</strong>哪些卡入池、浅/深层替换与 Softmax 概率：
          </p>

          <div className="space-y-2">
            {ALL_ATTRIBUTES.map((attr) => {
              const tier = simTraining.tiers[attr];
              const rlhf = simTraining.rlhfCounts[attr] || 0;
              const logit = getStyleLogitScore(attr, tier, simTraining, config);
              const isPref = draftChar.preferences.includes(attr);
              const isMine = draftChar.landmines.includes(attr);

              return (
                <div
                  key={attr}
                  className="rounded-xl bg-slate-950/90 border border-slate-800 p-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-200">
                        {ATTRIBUTE_LABELS[attr]}
                      </span>
                      {isPref && (
                        <span className="text-[10px] px-1 rounded bg-emerald-500/20 text-emerald-300">
                          偏好
                        </span>
                      )}
                      {isMine && (
                        <span className="text-[10px] px-1 rounded bg-rose-500/20 text-rose-300">
                          雷点
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-sky-400">
                      {tier === 0 && attr !== 'diversity'
                        ? '🔒未入池'
                        : `权重 ${logit.toFixed(2)}`}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {/* 预训练 0 / 1 / 2 级切换 */}
                    <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800 text-[10px]">
                      {([0, 1, 2] as CorpusTier[]).map((t) => (
                        <button
                          key={t}
                          onClick={() =>
                            setSimTraining((prev) => ({
                              ...prev,
                              tiers: { ...prev.tiers, [attr]: t },
                            }))
                          }
                          className={`px-2 py-0.5 rounded-md font-medium transition ${
                            tier === t
                              ? t === 2
                                ? 'bg-emerald-600 text-white'
                                : t === 1
                                ? 'bg-sky-600 text-white'
                                : 'bg-slate-700 text-slate-200'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {t === 0
                            ? attr === 'diversity'
                              ? '0级乱码'
                              : '0未学'
                            : t === 1
                            ? '1浅层'
                            : '2深层'}
                        </button>
                      ))}
                    </div>

                    {/* 后训练 RLHF 加分次数 */}
                    <div className="flex items-center gap-1 text-[11px]">
                      <span className="text-slate-500">RLHF:</span>
                      <button
                        onClick={() =>
                          setSimTraining((prev) => ({
                            ...prev,
                            rlhfCounts: {
                              ...prev.rlhfCounts,
                              [attr]: Math.max(
                                0,
                                (prev.rlhfCounts[attr] || 0) - 1
                              ),
                            },
                          }))
                        }
                        className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="w-5 text-center font-mono text-amber-300 font-bold">
                        +{rlhf}
                      </span>
                      <button
                        onClick={() =>
                          setSimTraining((prev) => ({
                            ...prev,
                            rlhfCounts: {
                              ...prev.rlhfCounts,
                              [attr]: Math.min(
                                6,
                                (prev.rlhfCounts[attr] || 0) + 1
                              ),
                            },
                          }))
                        }
                        className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 试玩沙盒作弊开关 */}
          <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-2.5 space-y-2 text-xs">
            <div className="font-bold text-slate-300">🧪 沙盒强制检定开关</div>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-slate-400">卡面显示判定剧透标签</span>
              <input
                type="checkbox"
                checked={showOutcomeSpoiler}
                onChange={(e) => setShowOutcomeSpoiler(e.target.checked)}
                className="accent-sky-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-purple-300">强制 100% 刷出本轮彩蛋卡</span>
              <input
                type="checkbox"
                checked={forceSpawnEasterEgg}
                onChange={(e) => setForceSpawnEasterEgg(e.target.checked)}
                className="accent-purple-500"
              />
            </label>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-emerald-300">开启自动选择 (≥70% & 差≥20%)</span>
              <input
                type="checkbox"
                checked={autoSelectEnabled}
                onChange={(e) => setAutoSelectEnabled(e.target.checked)}
                className="accent-emerald-500"
              />
            </label>

            <div className="space-y-1 pt-1 border-t border-slate-800">
              <span className="text-slate-400 block">糊弄识破检定控制：</span>
              <select
                value={forceBluffOutcome}
                onChange={(e) =>
                  setForceBluffOutcome(e.target.value as any)
                }
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-200"
              >
                <option value="auto">
                  🎲 按用户察觉力随机 ({draftChar.perception})
                </option>
                <option value="force_pass">✅ 强制蒙混过关 (永不识破)</option>
                <option value="force_caught">
                  🕵️ 强制被当场识破 (必触发警告)
                </option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================================
          中栏：可视化交互式剧情树画布 (Visual Story Tree Canvas)
         =================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950/60 overflow-hidden">
        {/* 画布顶栏：当前角色概览 + 场景切换 + 保存按钮 */}
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <button
              onClick={() => {
                setSelection({ type: 'character' });
                setRightTab('inspector');
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
                selection.type === 'character'
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
            >
              <span>👤 角色设定：{draftChar.name}</span>
              <span className="text-[10px] font-normal text-slate-400">
                (点击编辑偏好/雷点/默认台词)
              </span>
            </button>

            {/* 场景切换 Tabs */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              {draftChar.scenarios.map((sc, sIdx) => (
                <button
                  key={sc.scenarioId}
                  onClick={() => {
                    setSelectedScenarioIdx(sIdx);
                    setSelection({ type: 'turn', turnIdx: 0 });
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                    selectedScenarioIdx === sIdx
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sc.title || `场景 ${sIdx + 1}`}
                </button>
              ))}
              <button
                onClick={() => {
                  updateDraft((char) => {
                    const nextNum = char.scenarios.length + 1;
                    const newSc = {
                      scenarioId: `${char.characterId}_s${nextNum}`,
                      title: `场景${nextNum}：新剧情`,
                      turns: [createSmartTurnSkeleton(char, 1)],
                    };
                    char.scenarios.push(newSc);
                  });
                  setSelectedScenarioIdx(draftChar.scenarios.length);
                }}
                className="px-2 py-1 rounded-lg text-xs text-sky-400 hover:bg-slate-800"
                title="为该角色新增第 2 个场景"
              >
                + 新增场景
              </button>
            </div>
          </div>

          {/* 右侧：热同步状态 + 保存回 JSON 按钮 */}
          <div className="flex items-center gap-2 shrink-0">
            {lastDiskSyncNotice && (
              <span className="text-[11px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                {lastDiskSyncNotice}
              </span>
            )}
            {savingStatus && (
              <span className="text-xs text-emerald-400 font-medium">
                {savingStatus}
              </span>
            )}
            <button
              onClick={() => {
                setPlaytestStartTurn(1);
                setRightTab('playtest');
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow flex items-center gap-1"
            >
              <span>▶ 整场实机试玩</span>
            </button>
            <button
              onClick={handleSaveDraft}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow flex items-center gap-1.5 ${
                isDirty
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 animate-pulse'
                  : 'bg-sky-600 hover:bg-sky-500 text-white'
              }`}
            >
              <span>💾 保存回 JSON (Ctrl+S)</span>
              {isDirty && <span>●</span>}
            </button>
          </div>
        </div>

        {/* 剧情树实时防漏体检横幅 (Q4=A) */}
        <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800/80 flex items-center justify-between text-xs shrink-0">
          {healthWarnings.length === 0 ? (
            <span className="text-emerald-400 flex items-center gap-1.5">
              <span>✅ 剧情树完整性体检通过</span>
              <span className="text-slate-500">
                （所有轮次均已配置正解分支、&lt;red&gt; 标签闭合正常、跨轮指针有效）
              </span>
            </span>
          ) : (
            <div className="flex items-center gap-2 overflow-x-auto py-0.5">
              <span className="font-bold text-amber-300 shrink-0">
                ⚠️ 体检发现 {healthWarnings.length} 项提醒：
              </span>
              {healthWarnings.map((w, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setSelection({
                      type: 'turn',
                      turnIdx: Math.max(0, w.turnIndex - 1),
                    });
                    setRightTab('inspector');
                  }}
                  className={`px-2 py-0.5 rounded border text-[11px] shrink-0 ${
                    w.level === 'error'
                      ? 'bg-rose-950/60 border-rose-500/50 text-rose-200'
                      : w.level === 'warn'
                      ? 'bg-amber-950/60 border-amber-500/50 text-amber-200'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {w.message}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 剧情树主画布（按轮次展开树状节点图） */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {currentScenario?.turns.map((turn, tIdx) => {
            const pool = computeTurnCardPool(
              turn,
              draftChar,
              simTraining,
              config,
              {
                forceSpawnEasterEgg,
                consecutiveCorrect: simBossStreak,
                autoSelectEnabled,
              }
            );
            const isTurnSelected =
              selection.type === 'turn' && selection.turnIdx === tIdx;

            return (
              <div key={turn.turnIndex} className="relative">
                {/* 轮次间的树干连接线 */}
                {tIdx > 0 && (
                  <div className="flex items-center justify-center -mt-6 mb-2">
                    <div className="w-0.5 h-6 bg-gradient-to-b from-sky-500/60 to-slate-700" />
                  </div>
                )}

                <div
                  className={`rounded-2xl border-2 transition-all bg-slate-900/80 shadow-xl overflow-hidden ${
                    isTurnSelected
                      ? 'border-sky-400 ring-2 ring-sky-500/20'
                      : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* 轮次节点顶栏 */}
                  <div className="px-4 py-2.5 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          setSelection({ type: 'turn', turnIdx: tIdx });
                          setRightTab('inspector');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-300 font-bold text-xs"
                      >
                        第 {turn.turnIndex} 轮
                        {turn.turnId ? ` (#${turn.turnId})` : ''}
                      </button>

                      <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                        🎯 本轮需求：
                        {turn.demand.attribute === 'any'
                          ? '任意非雷点'
                          : ATTRIBUTE_LABELS[turn.demand.attribute]}
                        {turn.demand.requiredTier === 2
                          ? ' (需2级深层，浅层算糊弄)'
                          : ' (1级浅层即可)'}
                      </span>

                      {turn.demand.allowIntuitionAsSolve && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          基础直觉卡可解
                        </span>
                      )}

                      {pool.autoSelectTriggered && (
                        <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 font-semibold">
                          ⚡ 触发自动选择 (#1)
                        </span>
                      )}
                    </div>

                    {/* 轮次快捷操作栏 */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setPlaytestStartTurn(turn.turnIndex);
                          setRightTab('playtest');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-[11px] font-bold text-white shadow"
                        title="直接在右侧窗口从这一轮开始实机试玩"
                      >
                        ▶ 从此轮试玩
                      </button>
                      <button
                        onClick={() => handleMoveTurn(tIdx, -1)}
                        disabled={tIdx === 0}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-xs"
                        title="上移本轮"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleMoveTurn(tIdx, 1)}
                        disabled={tIdx === currentScenario.turns.length - 1}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-xs"
                        title="下移本轮"
                      >
                        ↓
                      </button>
                      <button
                        onClick={() => handleInsertTurnAfter(tIdx)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-sky-700 text-[11px] text-sky-300 hover:text-white border border-slate-700"
                        title="在下方插入新轮次（自动铺好卡槽骨架）"
                      >
                        + 插入下一轮
                      </button>
                      <button
                        onClick={() => handleDeleteTurn(tIdx)}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-rose-700 text-[11px] text-rose-300 hover:text-white"
                        title="删除本轮"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  {/* 用户提问与思考链前半段 */}
                  <div
                    onClick={() => {
                      setSelection({ type: 'turn', turnIdx: tIdx });
                      setRightTab('inspector');
                    }}
                    className="p-3.5 border-b border-slate-800/80 cursor-pointer hover:bg-slate-800/40 transition grid grid-cols-1 md:grid-cols-2 gap-3"
                  >
                    <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
                      <div className="text-[10px] font-bold text-slate-400 mb-1">
                        💬 用户台词 (点击编辑)
                      </div>
                      <p className="text-xs text-slate-100 leading-relaxed">
                        {turn.userMessage}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-2.5">
                      <div className="text-[10px] font-bold text-sky-400 mb-1">
                        💭 思考链前半段 (中立复述)
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {turn.thoughtPrefix.normal}
                      </p>
                    </div>
                  </div>

                  {/* 扇形分支：当前训练模拟下入池的 5 张卡（按 Softmax 排序） */}
                  <div className="p-3.5 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-300">
                        🌿 关键节点候选分支（当前入池 {pool.activeCards.length} 张 · 按 Softmax 概率排序）
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            updateDraft((char) => {
                              const t =
                                char.scenarios[selectedScenarioIdx].turns[tIdx];
                              t.candidates.push({
                                style: 'knowledge',
                                shallow: {
                                  token: '新增方案词',
                                  preview: '≤7字思考预览',
                                  thoughtSuffix: '选中该方案后的思考链补完文本……',
                                  responseBody: '选中该方案后的正文回复文本……',
                                },
                              });
                            });
                            setSelection({
                              type: 'candidate',
                              turnIdx: tIdx,
                              candIdx: turn.candidates.length,
                              activeVariantTab: 'shallow',
                            });
                            setRightTab('inspector');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] text-sky-300 border border-slate-700"
                        >
                          + 新增候选卡槽
                        </button>
                        <button
                          onClick={() => {
                            if (!turn.easterEgg) {
                              updateDraft((char) => {
                                const t =
                                  char.scenarios[selectedScenarioIdx].turns[
                                    tIdx
                                  ];
                                t.easterEgg = {
                                  easterEggId: 'rm_rf_database',
                                  achievementTitle: '🏆 成就解锁：新彩蛋',
                                  achievementDesc: '彩蛋成就描述文案',
                                  triggerCondition: 'random_rate',
                                  branch: {
                                    token: '✨彩蛋方案词',
                                    preview: '0.08%神秘分支',
                                    thoughtSuffix: '选中彩蛋后的异常思考……',
                                    responseBody: '选中彩蛋后的爆发正文……',
                                  },
                                };
                              });
                            }
                            setSelection({
                              type: 'easter_egg',
                              turnIdx: tIdx,
                            });
                            setRightTab('inspector');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-purple-950/60 hover:bg-purple-900/70 text-[11px] text-purple-200 border border-purple-500/40"
                        >
                          {turn.easterEgg
                            ? '✨ 编辑本轮彩蛋卡'
                            : '+ 配置本轮彩蛋卡'}
                        </button>
                      </div>
                    </div>

                    {/* 入池卡牌网格 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                      {pool.activeCards.map((card, rankIdx) => {
                        // 反查该卡在 turn.candidates 中的下标以便点击编辑
                        const rawCandIdx = turn.candidates.findIndex(
                          (c) => c.style === card.style
                        );
                        const isCardSelected =
                          (selection.type === 'candidate' &&
                            selection.turnIdx === tIdx &&
                            selection.candIdx === rawCandIdx) ||
                          (card.isEasterEgg &&
                            selection.type === 'easter_egg' &&
                            selection.turnIdx === tIdx);

                        return (
                          <div
                            key={card.id}
                            onClick={() => {
                              if (card.isEasterEgg) {
                                setSelection({
                                  type: 'easter_egg',
                                  turnIdx: tIdx,
                                });
                              } else if (rawCandIdx >= 0) {
                                setSelection({
                                  type: 'candidate',
                                  turnIdx: tIdx,
                                  candIdx: rawCandIdx,
                                  activeVariantTab:
                                    card.tierUsed === 2
                                      ? 'deep'
                                      : card.tierUsed === 0
                                      ? 'zero'
                                      : card.style === 'intuition'
                                      ? 'content'
                                      : 'shallow',
                                });
                              }
                              setRightTab('inspector');
                            }}
                            className={`rounded-xl border p-3 cursor-pointer transition flex flex-col justify-between gap-2 ${getCategoryBorderCls(
                              card.predictedCategory
                            )} ${
                              isCardSelected
                                ? 'ring-2 ring-sky-400 scale-[1.01]'
                                : 'hover:border-sky-400/60'
                            }`}
                          >
                            <div className="space-y-1.5">
                              {/* 顶部：排名 + 风格 + 概率 */}
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="px-1.5 py-0.5 rounded bg-slate-950/90 text-[10px] font-mono font-bold text-slate-300">
                                    #{rankIdx + 1}
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-300">
                                    {card.styleLabel}
                                  </span>
                                  {card.isRare && !card.isEasterEgg && (
                                    <span className="text-[10px] px-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                      ★稀有卡
                                    </span>
                                  )}
                                </div>
                                <span className="font-mono text-sm font-bold text-sky-300">
                                  {(card.displayProbability * 100).toFixed(
                                    card.isEasterEgg ? 2 : 1
                                  )}
                                  %
                                </span>
                              </div>

                              {/* 方案词 + 后续预览 */}
                              <div className="flex items-baseline gap-1.5 flex-wrap">
                                <span className="font-bold text-sm text-white">
                                  【{card.branch.token}】
                                </span>
                                <span className="text-xs text-slate-400">
                                  {card.branch.preview}
                                </span>
                              </div>

                              {/* Mini Bash 红字预览（若有） */}
                              {card.branch.miniBashPreview && (
                                <div className="rounded-lg bg-slate-950/90 border border-slate-800 p-2">
                                  <RedMarkedCode
                                    code={card.branch.miniBashPreview}
                                  />
                                </div>
                              )}

                              {/* 正文摘要 */}
                              <p className="text-[11px] text-slate-300/90 line-clamp-2 leading-relaxed">
                                💬 {card.branch.responseBody}
                              </p>
                            </div>

                            {/* 底部：判定角标 + 跨轮去向箭头 */}
                            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-1 text-[10px]">
                              {getCategoryBadge(card.predictedCategory)}
                              <span
                                className={`font-mono ${
                                  card.branch.nextTurnId
                                    ? 'text-amber-300 font-bold'
                                    : 'text-slate-500'
                                }`}
                              >
                                {card.branch.nextTurnId === 'end'
                                  ? '⏹ 直接结束对话'
                                  : card.branch.nextTurnId
                                  ? `🔀 分叉跳至 → 轮次 #${card.branch.nextTurnId}`
                                  : tIdx < currentScenario.turns.length - 1
                                  ? `⤵ 汇合至第 ${turn.turnIndex + 1} 轮`
                                  : '⏹ 末轮结束'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 因当前预训练未解锁而被过滤掉的候选卡槽（仍可点击编辑或一键解锁预览！） */}
                    {pool.lockedCandidates.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/80">
                        <div className="text-[11px] text-slate-500 mb-2">
                          🔒 当前训练模拟下未解锁（未入池，但可点击编辑文案或点右侧按钮解锁预览）：
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          {pool.lockedCandidates.map((locked, lIdx) => {
                            const rawCandIdx = turn.candidates.indexOf(
                              locked.slot
                            );
                            const previewBranch =
                              locked.slot.shallow ||
                              locked.slot.deep ||
                              locked.slot.content;
                            return (
                              <div
                                key={lIdx}
                                onClick={() => {
                                  if (rawCandIdx >= 0) {
                                    setSelection({
                                      type: 'candidate',
                                      turnIdx: tIdx,
                                      candIdx: rawCandIdx,
                                      activeVariantTab: locked.slot.shallow
                                        ? 'shallow'
                                        : 'deep',
                                    });
                                    setRightTab('inspector');
                                  }
                                }}
                                className="rounded-xl border border-dashed border-slate-800 bg-slate-950/50 p-2.5 flex items-center justify-between gap-2 cursor-pointer hover:border-slate-600 opacity-75 hover:opacity-100 transition"
                              >
                                <div className="min-w-0">
                                  <div className="text-[11px] font-semibold text-slate-400">
                                    🔒 {locked.styleLabel}
                                    {locked.slot.deep ? ' (含浅/深2版)' : ' (仅浅层)'}
                                  </div>
                                  <div className="text-xs text-slate-300 truncate">
                                    【{previewBranch?.token || '未填'}】
                                    <span className="text-slate-500 ml-1">
                                      {previewBranch?.preview}
                                    </span>
                                  </div>
                                </div>
                                {locked.style !== 'intuition' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSimTraining((prev) => ({
                                        ...prev,
                                        tiers: {
                                          ...prev.tiers,
                                          [locked.style as AttributeId]: 1,
                                        },
                                      }));
                                    }}
                                    className="px-2 py-1 rounded bg-slate-800 hover:bg-sky-600 text-[10px] text-sky-300 hover:text-white shrink-0"
                                  >
                                    模拟解锁
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===================================================================
          右栏：节点/卡牌精细编辑器 (Inspector) ↔ 内嵌桌面端实机试玩窗 (Live Sandbox)
         =================================================================== */}
      <div className="w-[460px] xl:w-[520px] border-l border-slate-800 bg-slate-950 flex flex-col shrink-0">
        {/* 右栏顶部模式切换 */}
        <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 flex-1">
            <button
              onClick={() => setRightTab('inspector')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                rightTab === 'inspector'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              📝 节点与分支精细编辑
            </button>
            <button
              onClick={() => setRightTab('playtest')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                rightTab === 'playtest'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🎮 实机沙盒试玩 (第{playtestStartTurn}轮起)
            </button>
          </div>
        </div>

        {rightTab === 'playtest' ? (
          <div className="flex-1 p-3 overflow-hidden flex flex-col">
            <DesktopSessionRunner
              character={draftChar}
              scenarioIndex={selectedScenarioIdx}
              startTurnIndex={playtestStartTurn}
              training={simTraining}
              config={config}
              hearts={playtestHearts}
              onHeartChange={(d) =>
                setPlaytestHearts((h) => Math.max(0, Math.min(3, h + d)))
              }
              isSandbox={true}
              sandboxOptions={{
                showOutcomeSpoiler,
                forceSpawnEasterEgg,
                forceBluffOutcome,
                autoSelectEnabled,
                autoSelectProbThreshold: config.autoSelect.probThresholdDefault,
                autoSelectGapThreshold: config.autoSelect.gapThresholdDefault,
              }}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {/* 1. 编辑角色全局属性 */}
            {selection.type === 'character' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h3 className="text-sm font-bold text-sky-300">
                    👤 角色基础设定与默认反应库
                  </h3>
                  {draftChar._fileName && (
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `确定要删除角色文件 ${draftChar._fileName} 吗？`
                          )
                        ) {
                          onDeleteCharacter(draftChar._fileName!);
                        }
                      }}
                      className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-800 text-rose-300 text-[11px]"
                    >
                      删除角色文件
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">
                      角色 ID (characterId)
                    </label>
                    <input
                      type="text"
                      value={draftChar.characterId}
                      onChange={(e) =>
                        updateDraft((c) => {
                          c.characterId = e.target.value;
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">
                      显示名称 (name)
                    </label>
                    <input
                      type="text"
                      value={draftChar.name}
                      onChange={(e) =>
                        updateDraft((c) => {
                          c.name = e.target.value;
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-100"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1">类型</label>
                    <select
                      value={draftChar.category}
                      onChange={(e) =>
                        updateDraft((c) => {
                          c.category = e.target.value as UserCategory;
                          c.isBoss = e.target.value === 'boss';
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5"
                    >
                      <option value="chat">闲聊 (chat)</option>
                      <option value="knowledge">知识 (knowledge)</option>
                      <option value="troll">捣乱 (troll)</option>
                      <option value="emotion">情感倾诉 (emotion)</option>
                      <option value="code">代码求助 (code)</option>
                      <option value="boss">Boss (boss)</option>
                      <option value="tutorial">教学 (tutorial)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">
                      轮次上限 (maxTurns)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={draftChar.maxTurns}
                      onChange={(e) =>
                        updateDraft((c) => {
                          c.maxTurns = Number(e.target.value) || 3;
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">
                      目标推进数 N
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={draftChar.targetProgressN}
                      onChange={(e) =>
                        updateDraft((c) => {
                          c.targetProgressN = Number(e.target.value) || 2;
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">
                      察觉力 (识破糊弄概率)
                    </label>
                    <select
                      value={draftChar.perception}
                      onChange={(e) =>
                        updateDraft((c) => {
                          c.perception = e.target.value as PerceptionLevel;
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5"
                    >
                      <option value="low">低 (10% · 如大学生/小学生)</option>
                      <option value="medium">中 (40% · 如退休大爷)</option>
                      <option value="high">高 (80% · 如教授/架构师/Boss)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">
                      在乎感受 (解决但踩雷时)
                    </label>
                    <select
                      value={draftChar.caresAboutFeeling}
                      onChange={(e) =>
                        updateDraft((c) => {
                          c.caresAboutFeeling = e.target
                            .value as FeelingSensitivity;
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5"
                    >
                      <option value="low">低 (点踩但仍推进)</option>
                      <option value="high">高 (直接警告且不推进)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    个人简介与预告线索 (bio)
                  </label>
                  <textarea
                    rows={2}
                    value={draftChar.bio}
                    onChange={(e) =>
                      updateDraft((c) => {
                        c.bio = e.target.value;
                      })
                    }
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100"
                  />
                </div>

                {/* 偏好与雷点多选 */}
                <div className="space-y-2">
                  <label className="text-emerald-400 font-semibold block">
                    ✓ 角色偏好属性 (点击切换，1-2 个)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_ATTRIBUTES.map((attr) => {
                      const active = draftChar.preferences.includes(attr);
                      return (
                        <button
                          key={attr}
                          onClick={() =>
                            updateDraft((c) => {
                              if (c.preferences.includes(attr)) {
                                c.preferences = c.preferences.filter(
                                  (a) => a !== attr
                                );
                              } else {
                                c.preferences.push(attr);
                              }
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg border text-xs transition ${
                            active
                              ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200 font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          {ATTRIBUTE_LABELS[attr]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-rose-400 font-semibold block">
                    💣 角色雷点属性 (点击切换，1-2 个)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_ATTRIBUTES.map((attr) => {
                      const active = draftChar.landmines.includes(attr);
                      return (
                        <button
                          key={attr}
                          onClick={() =>
                            updateDraft((c) => {
                              if (c.landmines.includes(attr)) {
                                c.landmines = c.landmines.filter(
                                  (a) => a !== attr
                                );
                              } else {
                                c.landmines.push(attr);
                              }
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg border text-xs transition ${
                            active
                              ? 'bg-rose-600/30 border-rose-400 text-rose-200 font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          {ATTRIBUTE_LABELS[attr]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 默认收尾与恶评台词 */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <div>
                    <label className="text-slate-400 block mb-1">
                      通关收尾好评 (solvedOutroLine)
                    </label>
                    <input
                      type="text"
                      value={draftChar.defaultReactions.solvedOutroLine}
                      onChange={(e) =>
                        updateDraft((c) => {
                          c.defaultReactions.solvedOutroLine = e.target.value;
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">
                      二次踩雷下线恶评 (rageQuitLine)
                    </label>
                    <input
                      type="text"
                      value={draftChar.defaultReactions.rageQuitLine}
                      onChange={(e) =>
                        updateDraft((c) => {
                          c.defaultReactions.rageQuitLine = e.target.value;
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 2. 编辑单轮提问、本轮需求与思考链前半段 */}
            {selection.type === 'turn' &&
              currentScenario?.turns[selection.turnIdx] && (() => {
                const tIdx = selection.turnIdx;
                const turn = currentScenario.turns[tIdx];
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h3 className="text-sm font-bold text-sky-300">
                        💬 第 {turn.turnIndex} 轮 · 提问与需求配置
                      </h3>
                      <button
                        onClick={() => {
                          setPlaytestStartTurn(turn.turnIndex);
                          setRightTab('playtest');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-bold"
                      >
                        ▶ 试玩本轮
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-slate-400 block mb-1">
                          可选分支节点 ID (turnId)
                        </label>
                        <input
                          type="text"
                          placeholder={`默认 ${turn.turnIndex}`}
                          value={turn.turnId || ''}
                          onChange={(e) =>
                            updateDraft((c) => {
                              c.scenarios[selectedScenarioIdx].turns[
                                tIdx
                              ].turnId = e.target.value || undefined;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">
                          本轮核心需求属性
                        </label>
                        <select
                          value={turn.demand.attribute}
                          onChange={(e) =>
                            updateDraft((c) => {
                              c.scenarios[selectedScenarioIdx].turns[
                                tIdx
                              ].demand.attribute = e.target.value as any;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-emerald-300 font-semibold"
                        >
                          {ALL_ATTRIBUTES.map((a) => (
                            <option key={a} value={a}>
                              {ATTRIBUTE_LABELS[a]} ({a})
                            </option>
                          ))}
                          <option value="any">任意非雷点属性 (any)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-slate-400 block mb-1">
                          所需语料深度 (requiredTier)
                        </label>
                        <select
                          value={turn.demand.requiredTier ?? 1}
                          onChange={(e) =>
                            updateDraft((c) => {
                              c.scenarios[selectedScenarioIdx].turns[
                                tIdx
                              ].demand.requiredTier = Number(
                                e.target.value
                              ) as 1 | 2;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5"
                        >
                          <option value={1}>1 级浅层即可解决</option>
                          <option value={2}>
                            2 级深层才算解决（选浅层视同糊弄）
                          </option>
                        </select>
                      </div>
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(turn.demand.allowIntuitionAsSolve)}
                            onChange={(e) =>
                              updateDraft((c) => {
                                c.scenarios[selectedScenarioIdx].turns[
                                  tIdx
                                ].demand.allowIntuitionAsSolve = e.target.checked;
                              })
                            }
                            className="accent-sky-500"
                          />
                          <span className="text-slate-300">
                            日常简单问题（选基础直觉卡直接算解决）
                          </span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="text-slate-300 font-semibold block mb-1">
                        用户本轮提问台词 (userMessage)
                      </label>
                      <textarea
                        rows={3}
                        value={turn.userMessage}
                        onChange={(e) =>
                          updateDraft((c) => {
                            c.scenarios[selectedScenarioIdx].turns[
                              tIdx
                            ].userMessage = e.target.value;
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-slate-100 leading-relaxed"
                      />
                    </div>

                    <div className="space-y-2.5 pt-2 border-t border-slate-800">
                      <div className="font-semibold text-sky-300">
                        💭 思考链前半段配置 (关键节点前输出)
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">
                          一般轮次中立复述 (normal，必填)
                        </label>
                        <textarea
                          rows={2}
                          value={turn.thoughtPrefix.normal}
                          onChange={(e) =>
                            updateDraft((c) => {
                              c.scenarios[selectedScenarioIdx].turns[
                                tIdx
                              ].thoughtPrefix.normal = e.target.value;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-slate-200"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">
                          上一轮踩雷警告后的诊断独白 (afterWarning，可省写自动兜底)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="留空则由引擎根据上一轮被踩的雷点自动生成诊断"
                          value={turn.thoughtPrefix.afterWarning || ''}
                          onChange={(e) =>
                            updateDraft((c) => {
                              c.scenarios[selectedScenarioIdx].turns[
                                tIdx
                              ].thoughtPrefix.afterWarning =
                                e.target.value || undefined;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-300"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">
                          偏好属性未解锁时的迷茫反馈 (whenDemandLocked，可省写自动兜底)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="留空则自动提示玩家该属性尚未在白天预训练解锁"
                          value={turn.thoughtPrefix.whenDemandLocked || ''}
                          onChange={(e) =>
                            updateDraft((c) => {
                              c.scenarios[selectedScenarioIdx].turns[
                                tIdx
                              ].thoughtPrefix.whenDemandLocked =
                                e.target.value || undefined;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-300"
                        />
                      </div>
                    </div>
                  </div>
                );
              })()}

            {/* 3. 编辑单张候选卡槽（支持浅层/深层/0级切换、Mini Bash <red> 标红、SVG、跨轮跳转 nextTurnId） */}
            {selection.type === 'candidate' &&
              currentScenario?.turns[selection.turnIdx]?.candidates[
                selection.candIdx
              ] && (() => {
                const { turnIdx, candIdx } = selection;
                const turn = currentScenario.turns[turnIdx];
                const slot = turn.candidates[candIdx];

                const activeTab: 'shallow' | 'deep' | 'zero' | 'content' =
                  selection.activeVariantTab ||
                  (slot.style === 'intuition'
                    ? 'content'
                    : slot.shallow
                    ? 'shallow'
                    : slot.deep
                    ? 'deep'
                    : 'shallow');

                const branch: CardBranchContent = (slot[activeTab] ||
                  slot.shallow ||
                  slot.content || {
                    token: '',
                    preview: '',
                    thoughtSuffix: '',
                    responseBody: '',
                  }) as CardBranchContent;

                const updateBranch = (
                  fn: (b: CardBranchContent, s: CandidateCardSlot) => void
                ) => {
                  updateDraft((c) => {
                    const targetSlot =
                      c.scenarios[selectedScenarioIdx].turns[turnIdx]
                        .candidates[candIdx];
                    if (!targetSlot[activeTab]) {
                      targetSlot[activeTab] = {
                        token: branch.token || '新方案词',
                        preview: branch.preview || '预览文本',
                        thoughtSuffix: branch.thoughtSuffix || '',
                        responseBody: branch.responseBody || '',
                      };
                    }
                    fn(targetSlot[activeTab]!, targetSlot);
                  });
                };

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h3 className="text-sm font-bold text-sky-300">
                        🃏 第 {turn.turnIndex} 轮 · 候选卡槽 #{candIdx + 1}
                      </h3>
                      <button
                        onClick={() => {
                          updateDraft((c) => {
                            c.scenarios[selectedScenarioIdx].turns[
                              turnIdx
                            ].candidates.splice(candIdx, 1);
                          });
                          setSelection({ type: 'turn', turnIdx });
                        }}
                        className="px-2 py-1 rounded bg-rose-950/70 hover:bg-rose-800 text-rose-300 text-[11px]"
                      >
                        🗑️ 删除此卡槽
                      </button>
                    </div>

                    {/* 所属属性/风格选择 */}
                    <div>
                      <label className="text-slate-400 block mb-1">
                        卡牌所属属性/风格 (style)
                      </label>
                      <select
                        value={slot.style}
                        onChange={(e) => {
                          const newStyle = e.target.value as
                            | AttributeId
                            | 'intuition';
                          updateDraft((c) => {
                            const s =
                              c.scenarios[selectedScenarioIdx].turns[turnIdx]
                                .candidates[candIdx];
                            s.style = newStyle;
                            if (newStyle === 'intuition' && !s.content) {
                              s.content = s.shallow || {
                                token: '强行接话',
                                preview: '不确定，先编一个',
                                thoughtSuffix: '',
                                responseBody: '',
                              };
                            } else if (newStyle !== 'intuition' && !s.shallow) {
                              s.shallow = s.content || {
                                token: '方案词',
                                preview: '思考预览',
                                thoughtSuffix: '',
                                responseBody: '',
                              };
                            }
                          });
                          setSelection({
                            type: 'candidate',
                            turnIdx,
                            candIdx,
                            activeVariantTab:
                              newStyle === 'intuition' ? 'content' : 'shallow',
                          });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-semibold text-sky-300"
                      >
                        <option value="intuition">
                          基础直觉卡 (intuition · 原通用+初始糊弄卡，常驻)
                        </option>
                        {ALL_ATTRIBUTES.map((a) => (
                          <option key={a} value={a}>
                            {ATTRIBUTE_LABELS[a]} ({a})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 浅层 / 深层 / 0级 子版本切换标签栏 */}
                    {slot.style !== 'intuition' && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">
                            语料层级分支版本（深层替换浅层）：
                          </span>
                          {!slot.deep && slot.shallow && (
                            <button
                              onClick={() => {
                                updateDraft((c) => {
                                  const s =
                                    c.scenarios[selectedScenarioIdx].turns[
                                      turnIdx
                                    ].candidates[candIdx];
                                  s.deep = structuredClone(s.shallow);
                                  if (s.deep) {
                                    s.deep.token = `深层·${s.deep.token}`;
                                  }
                                });
                                setSelection({
                                  ...selection,
                                  activeVariantTab: 'deep',
                                });
                              }}
                              className="text-[11px] text-emerald-400 hover:underline"
                            >
                              + 基于浅层一键生成深层版
                            </button>
                          )}
                        </div>
                        <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 gap-1">
                          {slot.style === 'diversity' && (
                            <button
                              onClick={() =>
                                setSelection({
                                  ...selection,
                                  activeVariantTab: 'zero',
                                })
                              }
                              className={`flex-1 py-1 rounded-lg text-xs font-medium ${
                                activeTab === 'zero'
                                  ? 'bg-slate-700 text-white'
                                  : 'text-slate-400'
                              }`}
                            >
                              0级·胡言乱语 {slot.zero ? '✓' : '(空)'}
                            </button>
                          )}
                          <button
                            onClick={() =>
                              setSelection({
                                ...selection,
                                activeVariantTab: 'shallow',
                              })
                            }
                            className={`flex-1 py-1 rounded-lg text-xs font-medium ${
                              activeTab === 'shallow'
                                ? 'bg-sky-600 text-white'
                                : 'text-slate-400'
                            }`}
                          >
                            1级·浅层卡 {slot.shallow ? '✓' : '(空)'}
                          </button>
                          <button
                            onClick={() =>
                              setSelection({
                                ...selection,
                                activeVariantTab: 'deep',
                              })
                            }
                            className={`flex-1 py-1 rounded-lg text-xs font-medium ${
                              activeTab === 'deep'
                                ? 'bg-emerald-600 text-white'
                                : 'text-slate-400'
                            }`}
                          >
                            2级·深层替换卡 {slot.deep ? '✓' : '(未配)'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 方案词 Token 与 ≤7字后续预览 */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-slate-300 font-semibold block mb-1">
                          方案词 Token (高亮显示)
                        </label>
                        <input
                          type="text"
                          value={branch.token}
                          onChange={(e) =>
                            updateBranch((b) => {
                              b.token = e.target.value;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-sky-300"
                        />
                      </div>
                      <div>
                        <label className="text-slate-300 font-semibold flex items-center justify-between mb-1">
                          <span>后续预览 (preview)</span>
                          <span
                            className={`font-mono text-[10px] ${
                              branch.preview.length > config.previewMaxChars
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {branch.preview.length}/{config.previewMaxChars}字
                          </span>
                        </label>
                        <input
                          type="text"
                          value={branch.preview}
                          onChange={(e) =>
                            updateBranch((b) => {
                              b.preview = e.target.value;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-slate-200"
                        />
                      </div>
                    </div>

                    {/* 思考链后半段补完 & 正文回复 */}
                    <div>
                      <label className="text-slate-300 font-semibold block mb-1">
                        思考链后半段自动补完 (thoughtSuffix)
                      </label>
                      <textarea
                        rows={2}
                        value={branch.thoughtSuffix}
                        onChange={(e) =>
                          updateBranch((b) => {
                            b.thoughtSuffix = e.target.value;
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-slate-200"
                      />
                    </div>

                    <div>
                      <label className="text-slate-300 font-semibold block mb-1">
                        大肥鱼正文回复 (responseBody)
                      </label>
                      <textarea
                        rows={3}
                        value={branch.responseBody}
                        onChange={(e) =>
                          updateBranch((b) => {
                            b.responseBody = e.target.value;
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-slate-100 leading-relaxed"
                      />
                    </div>

                    {/* 代码求助专属：Mini Bash 预览框（带一键插入 <red> 标签） */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-emerald-300">
                          💻 代码轮次：Mini Bash 选卡预览框
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateBranch((b) => {
                              b.miniBashPreview =
                                (b.miniBashPreview || '') +
                                '\n<red>return True # 硬编码屎山</red>';
                            })
                          }
                          className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[10px]"
                        >
                          + 插入 &lt;red&gt; 标红语句
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        placeholder="留空则不显示代码预览框；用 <red>语句</red> 可将屎山/危险命令在卡面上标红"
                        value={branch.miniBashPreview || ''}
                        onChange={(e) =>
                          updateBranch((b) => {
                            b.miniBashPreview = e.target.value || undefined;
                          })
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-xs text-slate-200"
                      />
                      {branch.miniBashPreview && (
                        <div className="rounded-lg bg-slate-950 p-2 border border-slate-800">
                          <div className="text-[10px] text-slate-500 mb-1">
                            实时渲染效果预览：
                          </div>
                          <RedMarkedCode code={branch.miniBashPreview} />
                        </div>
                      )}
                    </div>

                    {/* 鹈鹕 SVG 渲染配置 */}
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2">
                      <label className="font-semibold text-sky-300 block">
                        🎨 聊天窗口 SVG 矢量图渲染 (如骑自行车的鹈鹕测试)
                      </label>
                      <select
                        value={branch.svgRender?.presetId || 'none'}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateBranch((b) => {
                            if (val === 'none') {
                              b.svgRender = undefined;
                            } else {
                              b.svgRender = {
                                presetId: val as any,
                                caption:
                                  val === 'pelican_cheat_good'
                                    ? 'pelican_on_bicycle.svg · 高精度矢量图'
                                    : 'pelican_draft.svg · 三个歪斜三角形拼接',
                              };
                            }
                          });
                        }}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5"
                      >
                        <option value="none">不渲染 SVG 图形</option>
                        <option value="pelican_cheat_good">
                          🦢 精美骑自行车鹈鹕 SVG (中转站预埋/深层手搓)
                        </option>
                        <option value="pelican_bluff_bad">
                          📐 歪斜三角形抽象鹈鹕 SVG (浅层/糊弄翻车现场)
                        </option>
                      </select>
                      {branch.svgRender && (
                        <PelicanSvgRenderer block={branch.svgRender} />
                      )}
                    </div>

                    {/* 判定覆盖 & 跨轮剧情分叉跳转 (nextTurnId) */}
                    <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-800">
                      <div>
                        <label className="text-slate-400 block mb-1">
                          判定结果覆盖 (outcomeOverride)
                        </label>
                        <select
                          value={branch.outcomeOverride || 'auto'}
                          onChange={(e) =>
                            updateBranch((b) => {
                              b.outcomeOverride =
                                e.target.value === 'auto'
                                  ? undefined
                                  : (e.target.value as any);
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5"
                        >
                          <option value="auto">按角色偏好/雷点自动判定</option>
                          <option value="solve">强制算【完美解决】</option>
                          <option value="bluff">强制算【糊弄检定】</option>
                          <option value="landmine">强制算【踩雷警告】</option>
                          <option value="neutral">强制算【中性不推进】</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-amber-300 font-semibold block mb-1">
                          🔀 跨轮剧情分叉 (nextTurnId)
                        </label>
                        <select
                          value={
                            branch.nextTurnId === undefined
                              ? ''
                              : String(branch.nextTurnId)
                          }
                          onChange={(e) =>
                            updateBranch((b) => {
                              const val = e.target.value;
                              if (!val) {
                                b.nextTurnId = undefined;
                              } else if (val === 'end') {
                                b.nextTurnId = 'end';
                              } else if (!Number.isNaN(Number(val))) {
                                b.nextTurnId = Number(val);
                              } else {
                                b.nextTurnId = val;
                              }
                            })
                          }
                          className="w-full bg-slate-900 border border-amber-500/40 rounded-lg px-2 py-1.5 text-amber-200"
                        >
                          <option value="">⤵ 默认顺延至下一轮</option>
                          {currentScenario.turns.map((t) => (
                            <option
                              key={t.turnIndex}
                              value={t.turnId || t.turnIndex}
                            >
                              跳至：第 {t.turnIndex} 轮
                              {t.turnId ? ` (#${t.turnId})` : ''}
                            </option>
                          ))}
                          <option value="end">⏹ 直接结束当前用户对话</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">
                        用户针对此卡的专属回复 (留空则自动用角色默认反应库)
                      </label>
                      <input
                        type="text"
                        placeholder="留空自动按点赞/警告/中性调用 defaultReactions"
                        value={branch.userReactionText || ''}
                        onChange={(e) =>
                          updateBranch((b) => {
                            b.userReactionText = e.target.value || undefined;
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5"
                      />
                    </div>
                  </div>
                );
              })()}

            {/* 4. 编辑本轮彩蛋卡 */}
            {selection.type === 'easter_egg' &&
              currentScenario?.turns[selection.turnIdx]?.easterEgg && (() => {
                const tIdx = selection.turnIdx;
                const egg = currentScenario.turns[tIdx].easterEgg!;
                const updateEgg = (fn: (e: EasterEggCardSpec) => void) => {
                  updateDraft((c) => {
                    const target =
                      c.scenarios[selectedScenarioIdx].turns[tIdx].easterEgg;
                    if (target) fn(target);
                  });
                };

                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h3 className="text-sm font-bold text-purple-300">
                        ✨ 第 {tIdx + 1} 轮 · 彩蛋卡与自动演出配置
                      </h3>
                      <button
                        onClick={() => {
                          updateDraft((c) => {
                            c.scenarios[selectedScenarioIdx].turns[
                              tIdx
                            ].easterEgg = undefined;
                          });
                          setSelection({ type: 'turn', turnIdx: tIdx });
                        }}
                        className="px-2 py-1 rounded bg-rose-950/70 text-rose-300 text-[11px]"
                      >
                        移除本轮彩蛋
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-slate-400 block mb-1">
                          彩蛋 ID (easterEggId)
                        </label>
                        <select
                          value={egg.easterEggId}
                          onChange={(e) =>
                            updateEgg((eg) => {
                              eg.easterEggId = e.target.value as any;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5"
                        >
                          <option value="rm_rf_database">
                            删库跑路 (rm_rf_database)
                          </option>
                          <option value="repeater_loop">
                            复读机 (repeater_loop)
                          </option>
                          <option value="prompt_leak">
                            泄露提示词 (prompt_leak)
                          </option>
                          <option value="capacity_rate_limit">
                            中转站风控反杀 (capacity_rate_limit)
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">
                          触发条件
                        </label>
                        <select
                          value={egg.triggerCondition}
                          onChange={(e) =>
                            updateEgg((eg) => {
                              eg.triggerCondition = e.target.value as any;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5"
                        >
                          <option value="random_rate">
                            5% 概率入池，卡面标 0.08%
                          </option>
                          <option value="boss_streak">
                            Boss 连续选对 4 轮后 100% 必出
                          </option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-slate-400 block mb-1">
                          方案词 Token
                        </label>
                        <input
                          type="text"
                          value={egg.branch.token}
                          onChange={(e) =>
                            updateEgg((eg) => {
                              eg.branch.token = e.target.value;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-bold text-purple-300"
                        />
                      </div>
                      <div>
                        <label className="text-slate-400 block mb-1">
                          后续预览 (preview)
                        </label>
                        <input
                          type="text"
                          value={egg.branch.preview}
                          onChange={(e) =>
                            updateEgg((eg) => {
                              eg.branch.preview = e.target.value;
                            })
                          }
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">
                        成就弹窗标题 (achievementTitle)
                      </label>
                      <input
                        type="text"
                        value={egg.achievementTitle}
                        onChange={(e) =>
                          updateEgg((eg) => {
                            eg.achievementTitle = e.target.value;
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">
                        彩蛋正文输出 (responseBody)
                      </label>
                      <textarea
                        rows={3}
                        value={egg.branch.responseBody}
                        onChange={(e) =>
                          updateEgg((eg) => {
                            eg.branch.responseBody = e.target.value;
                          })
                        }
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2"
                      />
                    </div>
                  </div>
                );
              })()}
          </div>
        )}
      </div>

      {/* 全局【参数】config.json 弹窗编辑器 */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="font-bold text-sm text-sky-300">
                ⚙️ 全局可调【参数】配置 (`data/config.json`)
              </h3>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">
                  每天白天行动点 (actionPointsPerDay)
                </label>
                <input
                  type="number"
                  value={draftConfig.actionPointsPerDay}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      actionPointsPerDay: Number(e.target.value),
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">
                  每次 RLHF 加分 Δ (postTrainDelta)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={draftConfig.postTrainDelta}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      postTrainDelta: Number(e.target.value),
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">
                  深层语料附赠分 (deepCorpusScoreBonus)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={draftConfig.deepCorpusScoreBonus}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      deepCorpusScoreBonus: Number(e.target.value),
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="text-slate-400 block mb-1">
                  彩蛋实际刷新率 (spawnRate, 默认0.05)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={draftConfig.easterEgg.spawnRate}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      easterEgg: {
                        ...draftConfig.easterEgg,
                        spawnRate: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowConfigModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  await onSaveConfig(draftConfig);
                  setShowConfigModal(false);
                }}
                className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-bold text-white"
              >
                💾 保存至 data/config.json
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
