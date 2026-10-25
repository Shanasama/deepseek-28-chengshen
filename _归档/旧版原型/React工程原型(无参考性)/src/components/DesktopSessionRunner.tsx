import React, { useEffect, useRef, useState } from 'react';
import {
  AttributeId,
  AutoPlayStep,
  CharacterScenarioFile,
  GameConfig,
  TurnNode,
} from '../types/schema';
import {
  ATTRIBUTE_LABELS,
  ComputedCardItem,
  computeTurnCardPool,
  PlayerTrainingState,
  resolveCardSelection,
  TurnResolutionResult,
} from '../engine/gameEngine';
import {
  CharacterAvatarBadge,
  PelicanSvgRenderer,
  RedMarkedCode,
} from './RichWidgets';

export interface CompletedTurnRecord {
  turn: TurnNode;
  thoughtPrefixText: string;
  selectedCard: ComputedCardItem;
  resolution: TurnResolutionResult;
  thoughtCollapsed: boolean;
}

interface DesktopSessionRunnerProps {
  character: CharacterScenarioFile;
  scenarioIndex: number;
  startTurnIndex?: number;
  training: PlayerTrainingState;
  config: GameConfig;
  hearts: number;
  onHeartChange?: (delta: number) => void;
  onSessionComplete?: (summary: {
    solved: boolean;
    likes: number;
    dislikes: number;
    warnings: number;
    rareCardsPicked: string[];
    easterEggUnlocked?: { id: string; title: string; desc: string };
  }) => void;
  /** 沙盒调试模式开关 */
  isSandbox?: boolean;
  sandboxOptions?: {
    showOutcomeSpoiler: boolean;
    forceSpawnEasterEgg: boolean;
    forceBluffOutcome: 'auto' | 'force_pass' | 'force_caught';
    autoSelectEnabled: boolean;
    autoSelectProbThreshold: number;
    autoSelectGapThreshold: number;
  };
}

export const DesktopSessionRunner: React.FC<DesktopSessionRunnerProps> = ({
  character,
  scenarioIndex,
  startTurnIndex = 1,
  training,
  config,
  hearts,
  onHeartChange,
  onSessionComplete,
  isSandbox = false,
  sandboxOptions,
}) => {
  const scenario = character.scenarios[scenarioIndex] || character.scenarios[0];
  const turns = scenario?.turns || [];

  const [currentTurnIdx, setCurrentTurnIdx] = useState<number>(() => {
    const found = turns.findIndex((t) => t.turnIndex === startTurnIndex);
    return found >= 0 ? found : 0;
  });

  const [history, setHistory] = useState<CompletedTurnRecord[]>([]);
  const [progress, setProgress] = useState<number>(0);
  const [consecutiveCorrect, setConsecutiveCorrect] = useState<number>(0);
  const [bluffCount, setBluffCount] = useState<number>(0);
  const [warnedLandmines, setWarnedLandmines] = useState<
    Set<AttributeId | 'bluff_caught'>
  >(new Set());
  const [lastFeedbackState, setLastFeedbackState] = useState<
    'normal' | 'warning' | 'bluff_caught'
  >('normal');
  const [lastWarnedKey, setLastWarnedKey] = useState<
    AttributeId | 'bluff_caught' | undefined
  >(undefined);

  // 当前轮次的阶段：'typing_prefix' -> 'selecting_card' -> 'typing_response' -> 'session_ended'
  const [phase, setPhase] = useState<
    'typing_prefix' | 'selecting_card' | 'easter_egg_sequence' | 'session_ended'
  >('typing_prefix');
  const [typedChars, setTypedChars] = useState<number>(0);
  const [isNodeLocked, setIsNodeLocked] = useState<boolean>(false);
  const [autoSelectCountdown, setAutoSelectCountdown] = useState<number | null>(
    null
  );
  const [rareRevealBanner, setRareRevealBanner] = useState<string | null>(null);
  const [easterEggBanner, setEasterEggBanner] = useState<{
    title: string;
    desc: string;
  } | null>(null);
  const [autoPlayPlayedSteps, setAutoPlayPlayedSteps] = useState<AutoPlayStep[]>(
    []
  );
  const [sessionEndReason, setSessionEndReason] = useState<
    'solved' | 'max_turns' | 'rage_quit' | 'easter_egg' | null
  >(null);
  const [rarePickedList, setRarePickedList] = useState<string[]>([]);

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // 当切换角色、场景或起始轮次时重置会话
  useEffect(() => {
    const found = turns.findIndex((t) => t.turnIndex === startTurnIndex);
    setCurrentTurnIdx(found >= 0 ? found : 0);
    setHistory([]);
    setProgress(0);
    setConsecutiveCorrect(0);
    setBluffCount(0);
    setWarnedLandmines(new Set());
    setLastFeedbackState('normal');
    setLastWarnedKey(undefined);
    setPhase('typing_prefix');
    setTypedChars(0);
    setRareRevealBanner(null);
    setEasterEggBanner(null);
    setAutoPlayPlayedSteps([]);
    setSessionEndReason(null);
    setRarePickedList([]);
  }, [character.characterId, scenario?.scenarioId, startTurnIndex, turns.length]);

  const currentTurn: TurnNode | undefined = turns[currentTurnIdx];

  // 计算当前轮次的卡池与概率
  const poolResult = React.useMemo(() => {
    if (!currentTurn) return null;
    return computeTurnCardPool(currentTurn, character, training, config, {
      forceSpawnEasterEgg: sandboxOptions?.forceSpawnEasterEgg,
      consecutiveCorrect,
      autoSelectEnabled: sandboxOptions?.autoSelectEnabled,
      autoSelectProbThreshold: sandboxOptions?.autoSelectProbThreshold,
      autoSelectGapThreshold: sandboxOptions?.autoSelectGapThreshold,
    });
  }, [
    currentTurn,
    character,
    training,
    config,
    sandboxOptions?.forceSpawnEasterEgg,
    sandboxOptions?.autoSelectEnabled,
    sandboxOptions?.autoSelectProbThreshold,
    sandboxOptions?.autoSelectGapThreshold,
    consecutiveCorrect,
  ]);

  // 决定本轮思考链前半段文本
  const activeThoughtPrefixText = React.useMemo(() => {
    if (!currentTurn) return '';
    const tp = currentTurn.thoughtPrefix;

    // 1. Boss 连续选对觉醒提示
    if (
      tp.whenBossStreakReady &&
      consecutiveCorrect >= (currentTurn.easterEgg?.requiredStreak ?? 4)
    ) {
      return tp.whenBossStreakReady;
    }
    // 2. 上一轮糊弄被识破
    if (lastFeedbackState === 'bluff_caught') {
      return (
        tp.afterBluffCaught ||
        `糟糕，上一轮我因为不懂装懂瞎编被${character.name}当场识破了！他说得很凶，这轮我必须小心应对……`
      );
    }
    // 3. 上一轮踩中雷点警告
    if (lastFeedbackState === 'warning') {
      const landmineName =
        lastWarnedKey && lastWarnedKey !== 'bluff_caught'
          ? ATTRIBUTE_LABELS[lastWarnedKey]
          : '刚才那种语气';
      return (
        tp.afterWarning ||
        `嗯，用户刚才发火骂我了，看来他非常讨厌【${landmineName}】风格的回答！这轮千万不能再踩这个雷了。`
      );
    }
    // 4. 本轮需求属性未解锁时的迷茫反馈
    if (poolResult?.isDemandUnmetByTraining) {
      const demandName =
        currentTurn.demand.attribute !== 'any'
          ? ATTRIBUTE_LABELS[currentTurn.demand.attribute]
          : '';
      const tierNote =
        currentTurn.demand.requiredTier === 2 ? '（深层高阶能力）' : '';
      return (
        tp.whenDemandLocked ||
        `${tp.normal} （唔……不过用户想要的【${demandName}${tierNote}】我白天好像还没学到位，实在不行只能硬着头皮糊弄或者老实坦白了……）`
      );
    }
    return tp.normal;
  }, [
    currentTurn,
    consecutiveCorrect,
    lastFeedbackState,
    lastWarnedKey,
    poolResult?.isDemandUnmetByTraining,
    character.name,
  ]);

  // 思考链前半段打字机效果
  useEffect(() => {
    if (phase !== 'typing_prefix' || !currentTurn) return;
    if (typedChars >= activeThoughtPrefixText.length) {
      setPhase('selecting_card');
      setIsNodeLocked(true);
      const lockTimer = setTimeout(() => {
        setIsNodeLocked(false);
      }, (config.keyNodeLockSeconds || 0.5) * 1000);
      return () => clearTimeout(lockTimer);
    }

    const timer = setTimeout(() => {
      setTypedChars((c) => Math.min(activeThoughtPrefixText.length, c + 2));
    }, 22);
    return () => clearTimeout(timer);
  }, [
    phase,
    typedChars,
    activeThoughtPrefixText,
    currentTurn,
    config.keyNodeLockSeconds,
  ]);

  // 自动选择 0.8s 倒计时
  useEffect(() => {
    if (
      phase !== 'selecting_card' ||
      isNodeLocked ||
      !poolResult?.autoSelectTriggered ||
      poolResult.activeCards.length === 0
    ) {
      setAutoSelectCountdown(null);
      return;
    }

    const totalMs = (config.autoSelect.confirmDelaySeconds || 0.8) * 1000;
    setAutoSelectCountdown(totalMs);

    const interval = setInterval(() => {
      setAutoSelectCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 100) {
          clearInterval(interval);
          handlePickCard(poolResult.activeCards[0]);
          return null;
        }
        return prev - 100;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [
    phase,
    isNodeLocked,
    poolResult?.autoSelectTriggered,
    poolResult?.activeCards,
  ]);

  // 自动滚动到底部
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [history.length, phase, typedChars, autoPlayPlayedSteps.length]);

  // 键盘快捷键：空格加速打字 / 选第 1 张卡；数字键 1-5 按位置选卡
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 如果焦点在输入框/文本域内（例如右侧编辑器正在改文案），绝不拦截按键！
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (phase === 'typing_prefix') {
        if (e.code === 'Space') {
          e.preventDefault();
          setTypedChars(activeThoughtPrefixText.length);
        }
        return;
      }

      if (phase === 'selecting_card' && !isNodeLocked && poolResult) {
        if (e.code === 'Space') {
          e.preventDefault();
          if (poolResult.activeCards[0]) {
            handlePickCard(poolResult.activeCards[0]);
          }
          return;
        }
        if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].includes(e.code)) {
          e.preventDefault();
          const idx = Number(e.code.replace('Digit', '')) - 1;
          if (poolResult.activeCards[idx]) {
            handlePickCard(poolResult.activeCards[idx]);
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, isNodeLocked, poolResult, activeThoughtPrefixText.length]);

  const handlePickCard = (card: ComputedCardItem) => {
    if (!currentTurn || phase !== 'selecting_card') return;
    setAutoSelectCountdown(null);

    // 稀有卡揭晓提示 (<10%)
    let nextRareList = rarePickedList;
    if (card.isRare && !card.isEasterEgg) {
      const pct = (card.displayProbability * 100).toFixed(1);
      setRareRevealBanner(
        `✨ 揭晓稀有卡！【${card.branch.token}】当时的触发概率仅有 ${pct}%`
      );
      nextRareList = [...rarePickedList, `${card.branch.token} (${pct}%)`];
      setRarePickedList(nextRareList);
    } else {
      setRareRevealBanner(null);
    }

    const resolution = resolveCardSelection(
      card,
      currentTurn,
      character,
      config,
      {
        currentProgress: progress,
        bluffCountThisSession: bluffCount,
        warnedLandmines,
        forceBluffOutcome: sandboxOptions?.forceBluffOutcome,
      }
    );

    const newRecord: CompletedTurnRecord = {
      turn: currentTurn,
      thoughtPrefixText: activeThoughtPrefixText,
      selectedCard: card,
      resolution,
      thoughtCollapsed: true,
    };

    const nextHistory = [...history, newRecord];
    setHistory(nextHistory);

    const nextProgress = progress + resolution.progressDelta;
    setProgress(nextProgress);

    if (resolution.bluffAttempted) {
      setBluffCount((c) => c + 1);
    }

    if (resolution.heartDelta !== 0 && onHeartChange) {
      onHeartChange(resolution.heartDelta);
    }

    if (resolution.outcomeType === 'praise_and_advance') {
      setConsecutiveCorrect((c) => c + 1);
      setLastFeedbackState('normal');
    } else {
      setConsecutiveCorrect(0);
      if (resolution.outcomeType === 'warning') {
        if (resolution.triggeredLandmineKey) {
          const nextSet = new Set(warnedLandmines);
          nextSet.add(resolution.triggeredLandmineKey);
          setWarnedLandmines(nextSet);
          setLastWarnedKey(resolution.triggeredLandmineKey);
        }
        setLastFeedbackState(
          resolution.bluffCaught ? 'bluff_caught' : 'warning'
        );
      } else {
        setLastFeedbackState('normal');
      }
    }

    // 处理彩蛋自动演出序列
    if (resolution.outcomeType === 'easter_egg_triggered' && card.easterEggSpec) {
      const egg = card.easterEggSpec;
      setEasterEggBanner({
        title: egg.achievementTitle,
        desc: egg.achievementDesc,
      });
      if (egg.autoPlaySequence && egg.autoPlaySequence.length > 0) {
        setPhase('easter_egg_sequence');
        setAutoPlayPlayedSteps([]);
        egg.autoPlaySequence.forEach((step, idx) => {
          setTimeout(() => {
            setAutoPlayPlayedSteps((prev) => [...prev, step]);
            if (idx === egg.autoPlaySequence!.length - 1) {
              setPhase('session_ended');
              setSessionEndReason('easter_egg');
              notifyComplete(nextHistory, 'easter_egg', nextRareList, {
                id: egg.easterEggId,
                title: egg.achievementTitle,
                desc: egg.achievementDesc,
              });
            }
          }, (idx + 1) * 900);
        });
        return;
      } else {
        setPhase('session_ended');
        setSessionEndReason('easter_egg');
        notifyComplete(nextHistory, 'easter_egg', nextRareList, {
          id: egg.easterEggId,
          title: egg.achievementTitle,
          desc: egg.achievementDesc,
        });
        return;
      }
    }

    // 检查是否结束当前用户对话
    if (resolution.sessionEnded || resolution.nextTurnIdOrIndex === 'end') {
      const reason = resolution.sessionEndReason || 'solved';
      setPhase('session_ended');
      setSessionEndReason(reason);
      notifyComplete(nextHistory, reason, nextRareList);
      return;
    }

    // 查找下一轮（支持跨轮剧情分叉 nextTurnId！）
    let nextIdx = currentTurnIdx + 1;
    if (
      resolution.nextTurnIdOrIndex !== undefined &&
      resolution.nextTurnIdOrIndex !== ''
    ) {
      const target = resolution.nextTurnIdOrIndex;
      const foundById = turns.findIndex(
        (t) =>
          t.turnId === String(target) || t.turnIndex === Number(target)
      );
      if (foundById >= 0) {
        nextIdx = foundById;
      }
    }

    if (nextIdx >= turns.length || nextHistory.length >= character.maxTurns) {
      const finalReason =
        nextProgress >= character.targetProgressN ? 'solved' : 'max_turns';
      setPhase('session_ended');
      setSessionEndReason(finalReason);
      notifyComplete(nextHistory, finalReason, nextRareList);
      return;
    }

    setCurrentTurnIdx(nextIdx);
    setTypedChars(0);
    setPhase('typing_prefix');
  };

  const notifyComplete = (
    records: CompletedTurnRecord[],
    reason: 'solved' | 'max_turns' | 'rage_quit' | 'easter_egg',
    rares: string[],
    egg?: { id: string; title: string; desc: string }
  ) => {
    if (!onSessionComplete) return;
    const likes = records.reduce((s, r) => s + r.resolution.likeDelta, 0);
    const dislikes = records.reduce((s, r) => s + r.resolution.dislikeDelta, 0);
    const warnings = records.reduce((s, r) => s + r.resolution.warningDelta, 0);
    onSessionComplete({
      solved: reason === 'solved' || Boolean(egg?.id === 'capacity_rate_limit'),
      likes,
      dislikes,
      warnings,
      rareCardsPicked: rares,
      easterEggUnlocked: egg,
    });
  };

  const toggleThoughtCollapse = (idx: number) => {
    setHistory((prev) =>
      prev.map((item, i) =>
        i === idx
          ? { ...item, thoughtCollapsed: !item.thoughtCollapsed }
          : item
      )
    );
  };

  const getSpoilerBadge = (cat: ComputedCardItem['predictedCategory']) => {
    switch (cat) {
      case 'solve':
        return (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            ✓ 正解推进
          </span>
        );
      case 'bluff':
        return (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
            🎲 糊弄(检定察觉力)
          </span>
        );
      case 'landmine':
      case 'solve_and_landmine':
        return (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
            💣 踩雷警告
          </span>
        );
      case 'confession':
        return (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-sky-500/20 text-sky-300 border border-sky-500/40">
            🏳️ 坦白无风险
          </span>
        );
      case 'easter_egg':
        return (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-purple-500/25 text-purple-200 border border-purple-400/50">
            ✨ 彩蛋分支
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700/60 text-slate-300">
            ○ 中性不推进
          </span>
        );
    }
  };

  const currentCatchRate = Math.min(
    98,
    Math.round(
      ((config.perceptionRates[character.perception] ?? 0.4) +
        bluffCount * config.perceptionRates.bluffPenaltyIncrement) *
        100
    )
  );

  return (
    <div className="flex flex-col h-full bg-slate-900/95 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      {/* 桌面端 AI 窗口顶部状态栏 */}
      <div className="px-4 py-3 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <CharacterAvatarBadge
            iconId={character.avatar.iconId}
            name={character.name}
            isBoss={character.isBoss}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 text-sm truncate">
                {character.name}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                轮次 {Math.min(history.length + (phase === 'session_ended' ? 0 : 1), character.maxTurns)} / {character.maxTurns}
              </span>
              {isSandbox && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  当前识破率: {currentCatchRate}%
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate mt-0.5" title={character.bio}>
              {character.bio}
            </p>
          </div>
        </div>

        {/* 右侧：目标推进条 + 3颗心 + 重置按钮 */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex flex-col items-end">
            <span className="text-[11px] text-slate-400">
              解决推进度: <strong className="text-emerald-400">{progress}</strong> / {character.targetProgressN}
            </span>
            <div className="w-24 h-2 bg-slate-800 rounded-full overflow-hidden mt-1 flex gap-0.5 p-0.5">
              {Array.from({ length: character.targetProgressN }).map((_, i) => (
                <div
                  key={i}
                  className={`flex-1 rounded-full transition-all ${
                    i < progress ? 'bg-emerald-400' : 'bg-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>

          <div
            className="flex items-center gap-1 bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-800"
            title="每晚共用 3 颗心，同一雷点第二次踩中扣 1 颗心"
          >
            {Array.from({ length: config.heartsPerNight || 3 }).map((_, idx) => (
              <span
                key={idx}
                className={`text-sm transition-transform ${
                  idx < hearts ? 'text-rose-500 scale-100' : 'text-slate-700 scale-90'
                }`}
              >
                ❤️
              </span>
            ))}
          </div>

          {isSandbox && (
            <button
              onClick={() => {
                const found = turns.findIndex(
                  (t) => t.turnIndex === startTurnIndex
                );
                setCurrentTurnIdx(found >= 0 ? found : 0);
                setHistory([]);
                setProgress(0);
                setConsecutiveCorrect(0);
                setBluffCount(0);
                setWarnedLandmines(new Set());
                setLastFeedbackState('normal');
                setPhase('typing_prefix');
                setTypedChars(0);
                setRareRevealBanner(null);
                setEasterEggBanner(null);
                setAutoPlayPlayedSteps([]);
                setSessionEndReason(null);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-sky-300 border border-slate-700 transition"
            >
              ↻ 重置试玩
            </button>
          )}
        </div>
      </div>

      {/* 稀有卡或彩蛋成就横幅提示 */}
      {rareRevealBanner && (
        <div className="px-4 py-1.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-200 text-xs flex items-center justify-between">
          <span>{rareRevealBanner}</span>
          <button
            onClick={() => setRareRevealBanner(null)}
            className="text-amber-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
      {easterEggBanner && (
        <div className="px-4 py-2 bg-purple-950/90 border-b border-purple-500/50 text-purple-100 text-xs flex items-center justify-between animate-pulse">
          <div>
            <span className="font-bold text-purple-300 mr-2">
              {easterEggBanner.title}
            </span>
            <span>{easterEggBanner.desc}</span>
          </div>
        </div>
      )}

      {/* 对话消息流主区域 */}
      <div
        ref={chatScrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-5"
      >
        {/* 开局 System Prompt 注入横幅（专为掺水中转站 Boss 等设计） */}
        {scenario?.openingSystemInjection && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-amber-300 font-semibold">
              <span>{scenario.openingSystemInjection.badgeText}</span>
              {scenario.openingSystemInjection.cheatingPelicanSvgNote && (
                <span className="font-mono text-[11px] bg-amber-500/20 px-2 py-0.5 rounded">
                  {scenario.openingSystemInjection.cheatingPelicanSvgNote}
                </span>
              )}
            </div>
            <p className="font-mono text-amber-100/90 leading-relaxed">
              {scenario.openingSystemInjection.injectedPromptText}
            </p>
          </div>
        )}

        {/* 已完成的历史轮次 */}
        {history.map((rec, idx) => (
          <div key={idx} className="space-y-3">
            {/* 用户提问气泡 */}
            <div className="flex items-start gap-3">
              <CharacterAvatarBadge
                iconId={character.avatar.iconId}
                name={character.name}
                size="sm"
              />
              <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-slate-800/90 border border-slate-700/80 px-4 py-2.5 text-sm text-slate-100 leading-relaxed">
                {rec.turn.userMessage}
              </div>
            </div>

            {/* 大肥鱼回复气泡（含可折叠思考块 + Bash 工具卡 / SVG + 正文） */}
            <div className="flex items-start gap-3 justify-end">
              <div className="max-w-[88%] w-full space-y-2">
                {/* 可折叠思考链块 */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-400">
                  <button
                    onClick={() => toggleThoughtCollapse(idx)}
                    className="w-full flex items-center justify-between text-left hover:text-slate-200 transition"
                  >
                    <span className="flex items-center gap-2">
                      <span>💭 思考链 (已折叠)</span>
                      <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 font-medium">
                        选中方案词：{rec.selectedCard.branch.token} (
                        {(rec.selectedCard.displayProbability * 100).toFixed(
                          rec.selectedCard.isEasterEgg ? 2 : 1
                        )}
                        %)
                      </span>
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {rec.thoughtCollapsed ? '展开 ▼' : '收起 ▲'}
                    </span>
                  </button>
                  {!rec.thoughtCollapsed && (
                    <div className="mt-2 pt-2 border-t border-slate-800/80 leading-relaxed text-slate-400">
                      <span>{rec.thoughtPrefixText} </span>
                      <span className="text-sky-300 font-semibold">
                        【{rec.selectedCard.branch.token}】
                      </span>
                      <span> {rec.selectedCard.branch.thoughtSuffix}</span>
                    </div>
                  )}
                </div>

                {/* 大肥鱼正文与工具调用/SVG 气泡 */}
                <div className="rounded-2xl rounded-tr-sm bg-sky-950/40 border border-sky-800/50 px-4 py-3 text-sm text-slate-100 space-y-2.5">
                  {rec.selectedCard.branch.bashToolCall && (
                    <div
                      className={`rounded-xl border p-3 font-mono text-xs ${
                        rec.selectedCard.branch.bashToolCall.isDanger
                          ? 'bg-red-950/40 border-red-500/60'
                          : 'bg-slate-950/90 border-slate-700/80'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5 pb-1 border-b border-slate-800">
                        <span>💻 Bash Tool Execution</span>
                        {rec.selectedCard.branch.bashToolCall.isDanger && (
                          <span className="text-red-400 font-semibold">
                            ⚠️ 检测到高危/硬编码指令
                          </span>
                        )}
                      </div>
                      <RedMarkedCode
                        code={`$ ${rec.selectedCard.branch.bashToolCall.command}`}
                        className="text-emerald-300"
                      />
                      {rec.selectedCard.branch.bashToolCall.output && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800/80 text-slate-400">
                          {rec.selectedCard.branch.bashToolCall.output}
                        </div>
                      )}
                    </div>
                  )}

                  {rec.selectedCard.branch.svgRender && (
                    <PelicanSvgRenderer
                      block={rec.selectedCard.branch.svgRender}
                    />
                  )}

                  <p className="leading-relaxed whitespace-pre-wrap">
                    {rec.selectedCard.branch.responseBody}
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sm shrink-0">
                🐟
              </div>
            </div>

            {/* 用户对该轮正文的反应与评价标签 */}
            <div className="flex items-start gap-3">
              <CharacterAvatarBadge
                iconId={character.avatar.iconId}
                name={character.name}
                size="sm"
              />
              <div
                className={`max-w-[82%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-xs leading-relaxed border ${
                  rec.resolution.outcomeType === 'praise_and_advance'
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-100'
                    : rec.resolution.outcomeType === 'warning' ||
                      rec.resolution.outcomeType === 'rage_quit_lose_heart'
                    ? 'bg-rose-950/50 border-rose-500/50 text-rose-100'
                    : rec.resolution.outcomeType === 'dislike_but_advance'
                    ? 'bg-amber-950/40 border-amber-500/40 text-amber-100'
                    : 'bg-slate-800/70 border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 font-semibold mb-1">
                  {rec.resolution.outcomeType === 'praise_and_advance' && (
                    <span className="text-emerald-400">
                      👍 点赞 · 目标推进 +1
                      {rec.resolution.bluffAttempted && '（糊弄蒙混过关！）'}
                    </span>
                  )}
                  {rec.resolution.outcomeType === 'dislike_but_advance' && (
                    <span className="text-amber-400">
                      👎 点踩但仍推进 +1（用户在乎感受低）
                    </span>
                  )}
                  {rec.resolution.outcomeType === 'confession_safe' && (
                    <span className="text-sky-400">
                      🏳️ 坦白不懂 · 无风险不推进
                      {rec.resolution.likeDelta > 0 && '（坦诚获赞 👍）'}
                    </span>
                  )}
                  {rec.resolution.outcomeType === 'neutral' && (
                    <span className="text-slate-400">○ 中性 · 未推进目标</span>
                  )}
                  {rec.resolution.outcomeType === 'warning' && (
                    <span className="text-rose-400">
                      ⚠️ 警告 + 点踩（
                      {rec.resolution.bluffCaught
                        ? '糊弄被当场识破！'
                        : '第一次踩中雷点'}
                      ，再犯将下线扣心）
                    </span>
                  )}
                  {rec.resolution.outcomeType === 'rage_quit_lose_heart' && (
                    <span className="text-rose-400 font-bold">
                      💔 同一雷点二次踩中 · 用户愤然下线（扣 1 颗心）
                    </span>
                  )}
                  {rec.resolution.outcomeType === 'easter_egg_triggered' && (
                    <span className="text-purple-300 font-bold">
                      ✨ 触发彩蛋分支
                    </span>
                  )}
                </div>
                <p>{rec.resolution.userReplyText}</p>
              </div>
            </div>
          </div>
        ))}

        {/* 彩蛋连续自动演出序列（如泄露提示词 + 监管红字封禁 / Capacity 风控刷屏） */}
        {autoPlayPlayedSteps.map((step, i) => (
          <div key={i} className="animate-fadeIn">
            {step.speaker === 'regulator' ? (
              <div className="my-3 rounded-xl border-2 border-red-500 bg-red-950/90 p-4 text-center shadow-lg shadow-red-950/60">
                <div className="text-red-300 font-bold text-sm mb-1">
                  🚨 系统监管程序强制介入 · 对话已被终止
                </div>
                <p className="text-xs text-red-100 font-mono">{step.text}</p>
              </div>
            ) : step.speaker === 'user' ? (
              <div className="flex items-start gap-3">
                <CharacterAvatarBadge
                  iconId={character.avatar.iconId}
                  name={character.name}
                  size="sm"
                />
                <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-slate-100">
                  {step.text}
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3 justify-end">
                <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-sky-950/50 border border-sky-700/60 px-4 py-2.5 text-sm font-mono text-sky-200">
                  {step.text}
                </div>
                <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sm shrink-0">
                  🐟
                </div>
              </div>
            )}
          </div>
        ))}

        {/* 当前正在进行中的轮次 */}
        {phase !== 'session_ended' &&
          phase !== 'easter_egg_sequence' &&
          currentTurn && (
            <div className="space-y-3">
              {/* 当前轮用户提问 */}
              <div className="flex items-start gap-3">
                <CharacterAvatarBadge
                  iconId={character.avatar.iconId}
                  name={character.name}
                  size="sm"
                />
                <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-slate-100 leading-relaxed shadow">
                  {currentTurn.userMessage}
                </div>
              </div>

              {/* 大肥鱼思考链与关键节点选卡区 */}
              <div className="flex items-start gap-3 justify-end">
                <div className="max-w-[92%] w-full rounded-2xl border border-sky-500/30 bg-slate-950/90 p-3.5 shadow-xl space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="flex items-center gap-1.5 text-sky-300 font-medium">
                      <span className="animate-pulse">💭</span>
                      <span>大肥鱼的思考链（第一人称内心独白）</span>
                    </span>
                    {phase === 'typing_prefix' ? (
                      <button
                        onClick={() =>
                          setTypedChars(activeThoughtPrefixText.length)
                        }
                        className="text-[11px] text-slate-400 hover:text-sky-300"
                      >
                        [空格键] 加速跳过打字 ⏩
                      </button>
                    ) : isNodeLocked ? (
                      <span className="text-[11px] text-amber-300">
                        🔒 关键节点锁定 0.5s...
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">
                        [空格]=选第1张 · [数字键1-5]=按位置选卡
                      </span>
                    )}
                  </div>

                  {/* 思考链前半段逐字输出 */}
                  <div className="text-xs text-slate-300 leading-relaxed bg-slate-900/80 rounded-xl p-3 border border-slate-800/80">
                    <span>{activeThoughtPrefixText.slice(0, typedChars)}</span>
                    {phase === 'typing_prefix' && (
                      <span className="inline-block w-1.5 h-3.5 bg-sky-400 ml-1 animate-pulse" />
                    )}
                    {phase === 'selecting_card' && (
                      <span className="inline-block ml-1.5 px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 font-semibold text-[11px]">
                        ▸ 请选择下一个方案词 Token...
                      </span>
                    )}
                  </div>

                  {/* 自动选择触发倒计时横幅 */}
                  {autoSelectCountdown !== null && (
                    <div className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between">
                      <span>
                        ⚡ 自动选择已触发！将在{' '}
                        <strong>{(autoSelectCountdown / 1000).toFixed(1)}s</strong>{' '}
                        后确认第 1 张卡（按数字键 1-5 可立即改选）
                      </span>
                    </div>
                  )}

                  {/* 关键节点：最多 5 张候选方案卡 */}
                  {phase === 'selecting_card' && poolResult && (
                    <div className="space-y-2 pt-1">
                      {poolResult.activeCards.map((card, i) => {
                        const pctText = (card.displayProbability * 100).toFixed(
                          card.isEasterEgg ? 2 : 1
                        );
                        const isAutoTarget =
                          autoSelectCountdown !== null && i === 0;

                        return (
                          <button
                            key={card.id}
                            disabled={isNodeLocked}
                            onClick={() => handlePickCard(card)}
                            className={`w-full text-left rounded-xl p-3 border transition-all relative overflow-hidden group ${
                              isNodeLocked
                                ? 'opacity-60 cursor-wait'
                                : 'hover:border-sky-400/80 hover:bg-slate-900/90 cursor-pointer'
                            } ${
                              isAutoTarget
                                ? 'border-emerald-400 bg-emerald-950/30 ring-2 ring-emerald-400/40'
                                : card.isEasterEgg
                                ? 'border-purple-500/50 bg-purple-950/20'
                                : i === 0
                                ? 'border-sky-500/50 bg-slate-900/75'
                                : 'border-slate-800 bg-slate-900/50'
                            }`}
                          >
                            {/* 底部概率进度暗条 */}
                            <div
                              className={`absolute left-0 bottom-0 h-0.5 transition-all ${
                                card.isEasterEgg
                                  ? 'bg-purple-400'
                                  : i === 0
                                  ? 'bg-sky-400'
                                  : 'bg-slate-600'
                              }`}
                              style={{
                                width: `${Math.max(
                                  2,
                                  card.displayProbability * 100
                                )}%`,
                              }}
                            />

                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                {/* 按键提示角标 */}
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ${
                                    i === 0
                                      ? 'bg-sky-500 text-slate-950'
                                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                                  }`}
                                >
                                  {i === 0 ? '1 / 空格' : `${i + 1}`}
                                </span>

                                {/* 高亮方案词 Token */}
                                <span className="font-bold text-sm text-sky-300 group-hover:text-sky-200">
                                  【{card.branch.token}】
                                </span>

                                {/* 弱化显示的后续预览（默认 ≤ 7 字） */}
                                <span className="text-xs text-slate-400">
                                  {card.branch.preview}
                                </span>

                                {/* 风格属性小标签（沙盒透视或辅助） */}
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/90 text-slate-400 border border-slate-700/70">
                                  {card.styleLabel}
                                </span>

                                {sandboxOptions?.showOutcomeSpoiler &&
                                  getSpoilerBadge(card.predictedCategory)}
                              </div>

                              {/* 右侧直接显示概率百分比 */}
                              <div className="shrink-0 flex items-center gap-1.5">
                                <span
                                  className={`font-mono text-sm font-bold ${
                                    card.isEasterEgg
                                      ? 'text-purple-300'
                                      : i === 0
                                      ? 'text-sky-300'
                                      : 'text-slate-300'
                                  }`}
                                >
                                  {pctText}%
                                </span>
                              </div>
                            </div>

                            {/* 代码求助轮次专属：卡面内嵌 Mini Bash 预览框（且硬编码/屎山/rm -rf /* 直接标红！） */}
                            {card.branch.miniBashPreview && (
                              <div className="mt-2 rounded-lg bg-slate-950/95 border border-slate-800 px-3 py-2">
                                <div className="text-[10px] text-slate-500 font-mono mb-1 flex items-center justify-between">
                                  <span>▸ Mini Bash Preview (即将输出的脚本片段)</span>
                                  {card.branch.miniBashPreview.includes('<red>') && (
                                    <span className="text-red-400 font-semibold">
                                      ● 含硬编码/屎山或危险语句
                                    </span>
                                  )}
                                </div>
                                <RedMarkedCode
                                  code={card.branch.miniBashPreview}
                                  className="text-slate-300"
                                />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sm shrink-0">
                  🐟
                </div>
              </div>
            </div>
          )}

        {/* 会话结束收尾提示卡 */}
        {phase === 'session_ended' && (
          <div className="rounded-2xl border border-slate-700 bg-slate-950/90 p-4 text-center space-y-2">
            <div className="text-sm font-bold">
              {sessionEndReason === 'solved' && (
                <span className="text-emerald-400">
                  ✅ 目标已解决（推进 {progress}/{character.targetProgressN}）· {character.name} 满意离开
                </span>
              )}
              {sessionEndReason === 'max_turns' && (
                <span className="text-amber-300">
                  ⌛ 轮次耗尽仍未解决（推进 {progress}/{character.targetProgressN}）· 不扣心
                </span>
              )}
              {sessionEndReason === 'rage_quit' && (
                <span className="text-rose-400">
                  💔 同一雷点踩中两次 · {character.name} 留下恶评下线（心 -1）
                </span>
              )}
              {sessionEndReason === 'easter_egg' && (
                <span className="text-purple-300">
                  🏆 彩蛋剧情达成 · 不扣心、已记录成就！
                </span>
              )}
            </div>
            {sessionEndReason === 'max_turns' && (
              <p className="text-xs text-slate-400">
                「{character.defaultReactions.unsolvedOutroLine}」
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
