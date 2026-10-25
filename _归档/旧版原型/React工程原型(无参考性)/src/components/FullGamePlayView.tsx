import React, { useMemo, useState } from 'react';
import {
  AttributeId,
  CharacterScenarioFile,
  GameConfig,
  RLHFQuestion,
  TrainingDataFile,
} from '../types/schema';
import {
  ALL_ATTRIBUTES,
  ATTRIBUTE_LABELS,
  createInitialTrainingState,
  getStyleLogitScore,
  PlayerTrainingState,
  STYLE_LABELS,
} from '../engine/gameEngine';
import { DesktopSessionRunner } from './DesktopSessionRunner';
import { CharacterAvatarBadge } from './RichWidgets';

interface FullGamePlayViewProps {
  characters: CharacterScenarioFile[];
  trainingData: TrainingDataFile;
  config: GameConfig;
}

type GameStage =
  | 'day0_tutorial'
  | 'daytime_train'
  | 'night_service'
  | 'daily_settlement';

export const FullGamePlayView: React.FC<FullGamePlayViewProps> = ({
  characters,
  trainingData,
  config,
}) => {
  const [stage, setStage] = useState<GameStage>('day0_tutorial');
  const [day, setDay] = useState<number>(1);
  const [apLeft, setApLeft] = useState<number>(config.actionPointsPerDay);
  const [rlhfUsedToday, setRlhfUsedToday] = useState<number>(0);

  // 训练累积状态
  const [training, setTraining] = useState<PlayerTrainingState>(() =>
    createInitialTrainingState(false)
  );
  const [showTutorialRlhfModal, setShowTutorialRlhfModal] =
    useState<boolean>(false);
  const [activeRlhfPair, setActiveRlhfPair] = useState<{
    question: RLHFQuestion;
    styleA: AttributeId | 'intuition';
    styleB: AttributeId | 'intuition';
    isFreeTutorial?: boolean;
  } | null>(null);

  // 夜间队列与心
  const [tonightQueue, setTonightQueue] = useState<CharacterScenarioFile[]>([]);
  const [currentVisitorIdx, setCurrentVisitorIdx] = useState<number>(0);
  const [hearts, setHearts] = useState<number>(config.heartsPerNight);

  // 统计与跨局成就存档
  const [stats, setStats] = useState<{
    likes: number;
    dislikes: number;
    warnings: number;
    solvedUsers: number;
    rareCards: string[];
  }>({
    likes: 0,
    dislikes: 0,
    warnings: 0,
    solvedUsers: 0,
    rareCards: [],
  });

  const [unlockedAchievements, setUnlockedAchievements] = useState<
    Array<{ id: string; title: string; desc: string }>
  >(() => {
    try {
      const saved = localStorage.getItem('big_fat_fish_achievements');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const tutorialChar = useMemo(
    () =>
      characters.find((c) => c.category === 'tutorial') || characters[0],
    [characters]
  );

  // 为某一天抽取 4 名来访用户（第 3 天最后 1 个位置固定为 Boss）
  const rollVisitorsForDay = (targetDay: number): CharacterScenarioFile[] => {
    const regularPool = characters.filter(
      (c) => c.category !== 'tutorial' && c.category !== 'boss'
    );
    const bossChar = characters.find((c) => c.category === 'boss');

    const shuffled = [...regularPool].sort(() => Math.random() - 0.5);
    if (targetDay === 3 && bossChar) {
      return [...shuffled.slice(0, 3), bossChar];
    }
    return shuffled.slice(0, 4);
  };

  // 进入第 N 天白天
  const startDaytime = (targetDay: number) => {
    setDay(targetDay);
    setApLeft(config.actionPointsPerDay);
    setRlhfUsedToday(0);
    setHearts(config.heartsPerNight);
    setTonightQueue(rollVisitorsForDay(targetDay));
    setCurrentVisitorIdx(0);
    setStage('daytime_train');
  };

  // Day 0 教学免费 RLHF 触发
  const triggerFreeTutorialRlhf = () => {
    const tutQ =
      trainingData.rlhfQuestions.find((q) => q.isTutorial) ||
      trainingData.rlhfQuestions[0];
    // 免费解锁口语活力浅层并弹出活泼 vs 官腔二选一
    setTraining((prev) => ({
      ...prev,
      tiers: { ...prev.tiers, lively: 1 },
    }));
    if (tutQ) {
      setActiveRlhfPair({
        question: tutQ,
        styleA: 'lively',
        styleB: 'formal',
        isFreeTutorial: true,
      });
      setShowTutorialRlhfModal(true);
    } else {
      startDaytime(1);
    }
  };

  // 白天点击预训练某项语料
  const handlePretrainCorpus = (attr: AttributeId) => {
    const currentTier = training.tiers[attr];
    if (currentTier >= 2 || apLeft <= 0) return;
    setTraining((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [attr]: (prev.tiers[attr] + 1) as 1 | 2,
      },
    }));
    setApLeft((ap) => ap - 1);
  };

  // 白天点击发起一次后训练 (RLHF)
  const handleStartPostTrain = () => {
    if (apLeft <= 0 || rlhfUsedToday >= config.postTrainMaxPerDay) return;
    // 只从【已解锁】的风格里抽 2 种配对（绝不出现未学属性）
    const unlockedStyles: Array<AttributeId | 'intuition'> = ['intuition'];
    ALL_ATTRIBUTES.forEach((a) => {
      if (training.tiers[a] >= 1) unlockedStyles.push(a);
    });
    if (unlockedStyles.length < 2) return;

    const pool = trainingData.rlhfQuestions.filter((q) => !q.isTutorial);
    const q =
      pool[Math.floor(Math.random() * pool.length)] ||
      trainingData.rlhfQuestions[0];

    const availableForQ = unlockedStyles.filter((s) => Boolean(q.answers[s]));
    const shuffled = [...availableForQ].sort(() => Math.random() - 0.5);
    if (shuffled.length < 2) return;

    setActiveRlhfPair({
      question: q,
      styleA: shuffled[0],
      styleB: shuffled[1],
      isFreeTutorial: false,
    });
    setShowTutorialRlhfModal(true);
  };

  const handleConfirmRlhfChoice = (chosen: AttributeId | 'intuition') => {
    const isFree = activeRlhfPair?.isFreeTutorial;
    setTraining((prev) => ({
      ...prev,
      rlhfCounts: {
        ...prev.rlhfCounts,
        [chosen]: (prev.rlhfCounts[chosen] || 0) + 1,
      },
    }));
    setShowTutorialRlhfModal(false);
    setActiveRlhfPair(null);

    if (isFree) {
      startDaytime(1);
    } else {
      setApLeft((ap) => ap - 1);
      setRlhfUsedToday((c) => c + 1);
    }
  };

  return (
    <div className="flex h-[calc(100vh-52px)] bg-slate-950 text-slate-100 overflow-hidden">
      {/* ===================================================================
          桌面端窗口左侧栏：今晚来访预告 / 会话队列
         =================================================================== */}
      <div className="w-72 border-r border-slate-800 bg-slate-950/90 flex flex-col shrink-0">
        <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-sky-400">
              🐟 大肥鱼桌面助手 v0.2
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {stage === 'day0_tutorial'
                ? 'Day 0 · 出厂连通性测试'
                : `第 ${day} / ${config.daysTotal} 天 · ${
                    stage === 'daytime_train'
                      ? '☀️ 白天训练'
                      : stage === 'night_service'
                      ? '🌙 夜间服务'
                      : '📊 每日结算'
                  }`}
            </div>
          </div>

          <div className="flex items-center gap-0.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800 text-xs">
            {Array.from({ length: config.heartsPerNight }).map((_, i) => (
              <span
                key={i}
                className={i < hearts ? 'text-rose-500' : 'text-slate-700'}
              >
                ❤️
              </span>
            ))}
          </div>
        </div>

        {/* 左侧会话列表（白天显示「今晚来访预告」，夜间高亮当前对话用户） */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
            {stage === 'day0_tutorial'
              ? '当前测试会话'
              : stage === 'daytime_train'
              ? `👁️ 第 ${day} 晚来访预告 (${tonightQueue.length}人)`
              : `💬 今晚接入会话 (${currentVisitorIdx + 1}/${tonightQueue.length})`}
          </div>

          {stage === 'day0_tutorial' && tutorialChar && (
            <div className="rounded-xl border border-sky-500/60 bg-sky-950/30 p-3 space-y-1.5">
              <div className="flex items-center gap-2.5">
                <CharacterAvatarBadge
                  iconId={tutorialChar.avatar.iconId}
                  name={tutorialChar.name}
                  size="sm"
                />
                <div>
                  <div className="text-xs font-bold text-white">
                    {tutorialChar.name}
                  </div>
                  <div className="text-[10px] text-sky-300">正在输入...</div>
                </div>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                {tutorialChar.bio}
              </p>
            </div>
          )}

          {stage !== 'day0_tutorial' &&
            tonightQueue.map((visitor, idx) => {
              const isCurrent =
                stage === 'night_service' && idx === currentVisitorIdx;
              const isDone =
                stage === 'night_service' && idx < currentVisitorIdx;
              return (
                <div
                  key={visitor.characterId + idx}
                  className={`rounded-xl border p-2.5 transition space-y-1.5 ${
                    isCurrent
                      ? 'bg-sky-950/40 border-sky-400 shadow-lg'
                      : isDone
                      ? 'bg-slate-900/30 border-slate-800/60 opacity-50'
                      : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <CharacterAvatarBadge
                      iconId={visitor.avatar.iconId}
                      name={visitor.name}
                      isBoss={visitor.isBoss}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold truncate">
                          {visitor.name}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                            在线
                          </span>
                        )}
                        {isDone && (
                          <span className="text-[10px] text-slate-500">
                            已离开
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {visitor.avatar.visualDesc}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-300/90 leading-relaxed">
                    {visitor.bio}
                  </p>
                </div>
              );
            })}
        </div>

        {/* 左下角：随时重开或跳关快捷栏 */}
        <div className="p-3 border-t border-slate-800 bg-slate-900/50 flex items-center justify-between text-xs">
          <button
            onClick={() => startDaytime(1)}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            跳过教学直达 Day 1
          </button>
          <button
            onClick={() => startDaytime(3)}
            className="px-2.5 py-1 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-200 border border-rose-500/30"
          >
            直达 Day 3 Boss
          </button>
        </div>
      </div>

      {/* ===================================================================
          桌面端窗口主区域：根据当前阶段切换
         =================================================================== */}
      <div className="flex-1 p-4 overflow-y-auto flex flex-col">
        {/* 阶段 0：Day 0 出厂测试对话 */}
        {stage === 'day0_tutorial' && tutorialChar && (
          <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
            <DesktopSessionRunner
              character={tutorialChar}
              scenarioIndex={0}
              training={training}
              config={config}
              hearts={hearts}
              onSessionComplete={() => {
                triggerFreeTutorialRlhf();
              }}
            />
          </div>
        )}

        {/* 阶段 1：白天训练面板（预训练选语料 + 后训练 RLHF） */}
        {stage === 'daytime_train' && (
          <div className="max-w-5xl mx-auto w-full space-y-5 py-2">
            {/* 第 1 天白天的新手引导提示框 (Q15=C) */}
            {day === 1 && (
              <div className="rounded-2xl border border-sky-500/40 bg-sky-950/25 p-4 text-xs leading-relaxed space-y-1.5">
                <div className="font-bold text-sky-300 text-sm">
                  ☀️ 第 1 天白天训练指引（预训练 vs 后训练）
                </div>
                <p className="text-slate-200">
                  1. <strong>先看左侧【今晚来访预告】</strong>：从每位用户的头像特征与简介里猜出他们今晚需要什么能力、讨厌什么雷点；
                </p>
                <p className="text-slate-200">
                  2. <strong>预训练（选网站语料）管「有没有卡与深度」</strong>：没学过的属性夜里绝不出现（只能靠初始直觉卡硬编糊弄）；学第 1 次解锁<strong>浅层卡</strong>（应付普通需求），学第 2 次替换为<strong>深层卡</strong>（应对教授/架构师/Boss 的高阶问题，并附赠 +0.35 权重分）；
                </p>
                <p className="text-slate-200">
                  3. <strong>后训练（RLHF 二选一）管「概率排序」</strong>：给你喜欢的回答投票（+0.7 分），把常用属性顶到第一名，夜里直接无脑按空格！
                </p>
              </div>
            )}

            {/* 顶部行动点状态栏 */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">
                  ☀️ 第 {day} 天白天 · 模型训练实验室
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  自由分配行动点给【预训练（喂养语料）】或【后训练（RLHF 偏好对齐）】
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="px-3.5 py-2 rounded-xl bg-slate-950 border border-amber-500/40 text-xs">
                  剩余行动点：
                  <span className="text-base font-bold text-amber-300 ml-1">
                    ⚡ {apLeft} / {config.actionPointsPerDay}
                  </span>
                </div>

                <button
                  onClick={() => setStage('night_service')}
                  className={`px-5 py-2.5 rounded-xl font-bold text-sm transition shadow-lg ${
                    apLeft === 0
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
                      : 'bg-sky-600 hover:bg-sky-500 text-white'
                  }`}
                >
                  🌙 进入第 {day} 晚服务 ({tonightQueue.length}位用户) →
                </button>
              </div>
            </div>

            {/* 预训练：6 类语料网站 */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-sky-300">
                  📚 一、预训练（选择语料网站 · 解锁卡池与浅/深层深度）
                </h3>
                <span className="text-xs text-slate-400">
                  第 1 次学习解锁浅层；第 2 次替换为深层 (+{config.deepCorpusScoreBonus} 权重分)；第 3 次变灰
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {trainingData.corpora.map((corp) => {
                  const tier = training.tiers[corp.attribute];
                  const isMaxed = tier >= 2;
                  const logit = getStyleLogitScore(
                    corp.attribute,
                    tier,
                    training,
                    config
                  );

                  return (
                    <div
                      key={corp.attribute}
                      className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 transition ${
                        tier === 2
                          ? 'bg-emerald-950/20 border-emerald-500/50'
                          : tier === 1
                          ? 'bg-sky-950/20 border-sky-500/40'
                          : 'bg-slate-900/80 border-slate-800'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-white">
                            {corp.name}
                          </span>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                              tier === 2
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : tier === 1
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {tier === 2
                              ? '★ 已满级 (深层)'
                              : tier === 1
                              ? '已解锁浅层 (1/2)'
                              : corp.attribute === 'diversity'
                              ? '0级 (胡言乱语)'
                              : '未解锁 (0/2)'}
                          </span>
                        </div>

                        <div className="text-xs text-amber-300/90 font-medium">
                          🌐 喂养网站：{corp.websiteName}
                        </div>

                        <div className="rounded-xl bg-slate-950/80 border border-slate-800/80 p-2.5 text-xs space-y-1">
                          <div
                            className={
                              tier >= 1 ? 'text-sky-300' : 'text-slate-400'
                            }
                          >
                            • <strong>{corp.shallow.title}</strong>
                          </div>
                          <div
                            className={
                              tier >= 2 ? 'text-emerald-300' : 'text-slate-500'
                            }
                          >
                            • <strong>{corp.deep.title}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                        <span className="font-mono text-[11px] text-slate-400">
                          当前权重分: {tier === 0 && corp.attribute !== 'diversity' ? '未入池' : logit.toFixed(2)}
                        </span>
                        <button
                          disabled={isMaxed || apLeft <= 0}
                          onClick={() => handlePretrainCorpus(corp.attribute)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                            isMaxed
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : apLeft <= 0
                              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              : tier === 1
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow'
                              : 'bg-sky-600 hover:bg-sky-500 text-white shadow'
                          }`}
                        >
                          {isMaxed
                            ? '已学满深层'
                            : tier === 1
                            ? '⚡ 1点 升级深层'
                            : '⚡ 1点 解锁浅层'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 后训练：RLHF 二选一 */}
            <div className="rounded-2xl border border-purple-500/40 bg-purple-950/15 p-4 flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-purple-300">
                  ⚖️ 二、后训练（RLHF 人类反馈强化学习 · 调整 Softmax 概率分布）
                </h3>
                <p className="text-xs text-slate-300">
                  从已解锁风格中随机抽取两个回答二选一，选中的风格权重分{' '}
                  <strong className="text-amber-300">+{config.postTrainDelta}</strong>
                  （每天最多 {config.postTrainMaxPerDay} 次，今日已用 {rlhfUsedToday}/{config.postTrainMaxPerDay} 次）。
                </p>
              </div>

              <button
                disabled={
                  apLeft <= 0 || rlhfUsedToday >= config.postTrainMaxPerDay
                }
                onClick={handleStartPostTrain}
                className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-500 text-xs font-bold text-white shrink-0 shadow"
              >
                {rlhfUsedToday >= config.postTrainMaxPerDay
                  ? '今日后训练次数已满'
                  : '⚡ 消耗 1 行动点进行 RLHF'}
              </button>
            </div>
          </div>
        )}

        {/* 阶段 2：夜间服务 4 名用户 */}
        {stage === 'night_service' && tonightQueue[currentVisitorIdx] && (
          <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
            <DesktopSessionRunner
              key={`${day}_${currentVisitorIdx}_${tonightQueue[currentVisitorIdx].characterId}`}
              character={tonightQueue[currentVisitorIdx]}
              scenarioIndex={0}
              training={training}
              config={config}
              hearts={hearts}
              onHeartChange={(delta) => {
                setHearts((h) => Math.max(0, h + delta));
              }}
              onSessionComplete={(summary) => {
                setStats((prev) => ({
                  likes: prev.likes + summary.likes,
                  dislikes: prev.dislikes + summary.dislikes,
                  warnings: prev.warnings + summary.warnings,
                  solvedUsers: prev.solvedUsers + (summary.solved ? 1 : 0),
                  rareCards: [...prev.rareCards, ...summary.rareCardsPicked],
                }));

                if (summary.easterEggUnlocked) {
                  setUnlockedAchievements((prev) => {
                    if (
                      prev.some((a) => a.id === summary.easterEggUnlocked!.id)
                    )
                      return prev;
                    const next = [...prev, summary.easterEggUnlocked!];
                    try {
                      localStorage.setItem(
                        'big_fat_fish_achievements',
                        JSON.stringify(next)
                      );
                    } catch {}
                    return next;
                  });
                }

                // 延迟 1.4 秒切换到下一位用户或进入每日结算
                setTimeout(() => {
                  if (
                    hearts <= 0 ||
                    currentVisitorIdx + 1 >= tonightQueue.length
                  ) {
                    setStage('daily_settlement');
                  } else {
                    setCurrentVisitorIdx((idx) => idx + 1);
                  }
                }, 1400);
              }}
            />
          </div>
        )}

        {/* 阶段 3：自我认知结算面板 */}
        {stage === 'daily_settlement' && (
          <div className="max-w-3xl mx-auto w-full my-auto rounded-2xl border border-slate-800 bg-slate-900/95 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-sky-300">
                  📊 第 {day} 天结算 · 大肥鱼自我认知面板
                </h2>
                <p className="text-xs text-slate-400">
                  展示六个属性的预训练深度阶段与当前 Softmax 权重分
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-slate-800 text-xs text-slate-300">
                已解决用户: {stats.solvedUsers} 人
              </span>
            </div>

            {/* 6 个属性条 (Q11=A) */}
            <div className="space-y-3">
              {ALL_ATTRIBUTES.map((attr) => {
                const tier = training.tiers[attr];
                const logit = getStyleLogitScore(attr, tier, training, config);
                const pct = Math.min(100, Math.round((logit / 4.2) * 100));
                return (
                  <div key={attr} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200">
                        {ATTRIBUTE_LABELS[attr]}
                      </span>
                      <span className="font-mono text-slate-400">
                        {tier === 0
                          ? attr === 'diversity'
                            ? '0级·胡言乱语 (1.10)'
                            : '🔒 未解锁'
                          : `${tier === 2 ? '★ 深层' : '浅层'} · 权重分 ${logit.toFixed(2)}`}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full transition-all ${
                          tier === 2
                            ? 'bg-emerald-500'
                            : tier === 1
                            ? 'bg-sky-500'
                            : 'bg-slate-700'
                        }`}
                        style={{ width: `${tier === 0 ? 12 : pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 统计数据：点赞、点踩、警告、稀有卡、彩蛋成就 */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-slate-950 p-3 border border-slate-800">
                <div className="text-lg font-bold text-emerald-400">
                  👍 {stats.likes}
                </div>
                <div className="text-xs text-slate-400">累计获赞</div>
              </div>
              <div className="rounded-xl bg-slate-950 p-3 border border-slate-800">
                <div className="text-lg font-bold text-amber-400">
                  👎 {stats.dislikes}
                </div>
                <div className="text-xs text-slate-400">累计点踩</div>
              </div>
              <div className="rounded-xl bg-slate-950 p-3 border border-slate-800">
                <div className="text-lg font-bold text-rose-400">
                  ⚠️ {stats.warnings}
                </div>
                <div className="text-xs text-slate-400">累计踩雷警告</div>
              </div>
            </div>

            {unlockedAchievements.length > 0 && (
              <div className="rounded-xl bg-purple-950/30 border border-purple-500/40 p-3 space-y-1.5">
                <div className="text-xs font-bold text-purple-300">
                  🏆 已解锁彩蛋成就 ({unlockedAchievements.length}/4 · 已跨局自动存档)
                </div>
                {unlockedAchievements.map((a) => (
                  <div key={a.id} className="text-xs text-purple-100">
                    <strong>{a.title}</strong>：{a.desc}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              {day < config.daysTotal ? (
                <button
                  onClick={() => startDaytime(day + 1)}
                  className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-sm font-bold text-white shadow-lg"
                >
                  进入第 {day + 1} 天白天 →
                </button>
              ) : (
                <button
                  onClick={() => {
                    setTraining(createInitialTrainingState(false));
                    setStats({
                      likes: 0,
                      dislikes: 0,
                      warnings: 0,
                      solvedUsers: 0,
                      rareCards: [],
                    });
                    setStage('day0_tutorial');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white shadow-lg"
                >
                  🎉 3 天 Demo 圆满完成！再来一局
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 后训练 RLHF 二选一弹窗 */}
      {showTutorialRlhfModal && activeRlhfPair && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/50 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
                  {activeRlhfPair.isFreeTutorial
                    ? '🎁 开场免费 RLHF 教学'
                    : '⚖️ 后训练 (RLHF 成对回答二选一)'}
                </span>
                <h3 className="text-base font-bold text-white mt-1.5">
                  挑出你认为更好的回答（选中的风格权重分 +{config.postTrainDelta}）
                </h3>
              </div>
            </div>

            <div className="rounded-xl bg-slate-950 p-3.5 border border-slate-800 text-sm text-slate-200">
              {activeRlhfPair.question.question}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[activeRlhfPair.styleA, activeRlhfPair.styleB].map((st) => (
                <button
                  key={st}
                  onClick={() => handleConfirmRlhfChoice(st)}
                  className="text-left rounded-xl border border-slate-700 hover:border-purple-400 bg-slate-950/90 hover:bg-purple-950/20 p-4 flex flex-col justify-between gap-3 transition group"
                >
                  <div className="space-y-2">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      属性标签：{STYLE_LABELS[st]}
                    </span>
                    <p className="text-xs text-slate-200 leading-relaxed">
                      「{activeRlhfPair.question.answers[st]}」
                    </p>
                  </div>
                  <div className="text-xs font-bold text-purple-300 group-hover:translate-x-1 transition">
                    选择此回答 (权重 +{config.postTrainDelta}) →
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
