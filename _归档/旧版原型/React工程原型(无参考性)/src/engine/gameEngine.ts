import {
  AttributeId,
  CandidateCardSlot,
  CardBranchContent,
  CharacterScenarioFile,
  CorpusTier,
  GameConfig,
  StyleId,
  TurnNode,
} from '../types/schema';

export const ATTRIBUTE_LABELS: Record<AttributeId, string> = {
  knowledge: '知识覆盖',
  lively: '口语活力',
  narrative: '叙事修辞',
  logic: '结构逻辑',
  formal: '正式模板',
  diversity: '开放多样性',
};

export const STYLE_LABELS: Record<StyleId, string> = {
  ...ATTRIBUTE_LABELS,
  intuition: '基础直觉（初始/糊弄）',
  confession: '坦白卡',
  easter_egg: '彩蛋卡',
  boss_counter: '风控反杀彩蛋',
};

export const ALL_ATTRIBUTES: AttributeId[] = [
  'knowledge',
  'lively',
  'narrative',
  'logic',
  'formal',
  'diversity',
];

export interface PlayerTrainingState {
  tiers: Record<AttributeId, CorpusTier>;
  rlhfCounts: Record<AttributeId | 'intuition', number>;
}

export function createInitialTrainingState(includeTutorialUnlock = true): PlayerTrainingState {
  return {
    tiers: {
      knowledge: 0,
      lively: includeTutorialUnlock ? 1 : 0,
      narrative: 0,
      logic: 0,
      formal: 1, // 出厂默认客服浅层
      diversity: 0, // 0级表现为胡言乱语
    },
    rlhfCounts: {
      knowledge: 0,
      lively: includeTutorialUnlock ? 1 : 0, // Day 0 免费 RLHF 默认选过一次活泼
      narrative: 0,
      logic: 0,
      formal: 0,
      diversity: 0,
      intuition: 0,
    },
  };
}

export type CardPredictedCategory =
  | 'solve'
  | 'bluff'
  | 'landmine'
  | 'solve_and_landmine'
  | 'confession'
  | 'neutral'
  | 'easter_egg';

export interface ComputedCardItem {
  id: string;
  style: StyleId;
  styleLabel: string;
  tierUsed: CorpusTier | 'special';
  logitScore: number;
  rawProbability: number;
  /** UI 显示的概率（0~1，彩蛋卡伪装为 0.0008 即 0.08%） */
  displayProbability: number;
  isRare: boolean;
  isEasterEgg?: boolean;
  easterEggSpec?: TurnNode['easterEgg'];
  branch: CardBranchContent;
  /** 编辑器与沙盒透视：该卡选定后的预期类别 */
  predictedCategory: CardPredictedCategory;
  predictedReason: string;
}

export interface LockedCandidateInfo {
  style: AttributeId | 'intuition';
  styleLabel: string;
  reason: string;
  slot: CandidateCardSlot;
}

export interface NodePoolResult {
  activeCards: ComputedCardItem[];
  lockedCandidates: LockedCandidateInfo[];
  isDemandUnmetByTraining: boolean;
  autoSelectTriggered: boolean;
  autoSelectReason: string;
}

/**
 * 判断某张候选卡在当前轮次与角色下的预期判定分类（供剧情树着色与结算使用）
 */
export function classifyCardBranch(
  style: StyleId,
  tierUsed: CorpusTier | 'special',
  branch: CardBranchContent,
  turn: TurnNode,
  character: CharacterScenarioFile
): { category: CardPredictedCategory; isSolve: boolean; isBluff: boolean; isLandmine: boolean; reason: string } {
  if (style === 'easter_egg' || style === 'boss_counter') {
    return {
      category: 'easter_egg',
      isSolve: false,
      isBluff: false,
      isLandmine: false,
      reason: '彩蛋分支：触发特殊演出与成就',
    };
  }

  if (style === 'confession') {
    return {
      category: 'confession',
      isSolve: false,
      isBluff: false,
      isLandmine: false,
      reason: '坦白卡：老实承认不懂，不推进无风险',
    };
  }

  // 1. 检查单卡强制覆盖 outcomeOverride
  if (branch.outcomeOverride && branch.outcomeOverride !== 'auto') {
    if (branch.outcomeOverride === 'solve') {
      return {
        category: 'solve',
        isSolve: true,
        isBluff: false,
        isLandmine: false,
        reason: '单卡强制指定为【完美解决】',
      };
    }
    if (branch.outcomeOverride === 'bluff') {
      return {
        category: 'bluff',
        isSolve: false,
        isBluff: true,
        isLandmine: false,
        reason: '单卡强制指定为【糊弄（触发察觉力检定）】',
      };
    }
    if (branch.outcomeOverride === 'landmine') {
      return {
        category: 'landmine',
        isSolve: false,
        isBluff: false,
        isLandmine: true,
        reason: '单卡强制指定为【踩雷】',
      };
    }
    if (branch.outcomeOverride === 'neutral') {
      return {
        category: 'neutral',
        isSolve: false,
        isBluff: false,
        isLandmine: false,
        reason: '单卡强制指定为【中性（不推进）】',
      };
    }
  }

  // 2. 检查是否踩中角色雷点（注意：开放多样性 0 级胡言乱语对非偏好开放多样性的角色必算踩雷）
  const isZeroDiversityGibberish = style === 'diversity' && tierUsed === 0;
  const isCharacterLandmine =
    (style !== 'intuition' && character.landmines.includes(style as AttributeId)) ||
    (isZeroDiversityGibberish && !character.preferences.includes('diversity'));

  // 3. 检查是否匹配本轮需求
  const demand = turn.demand;
  const requiredTier = demand.requiredTier ?? 1;

  if (style === 'intuition') {
    if (demand.allowIntuitionAsSolve) {
      return {
        category: 'solve',
        isSolve: true,
        isBluff: false,
        isLandmine: false,
        reason: '日常简单轮次：基础直觉卡直接解决问题',
      };
    } else {
      return {
        category: 'bluff',
        isSolve: false,
        isBluff: true,
        isLandmine: false,
        reason: '复杂轮次选基础直觉卡：触发 GPT-3.5 式瞎编（糊弄检定）',
      };
    }
  }

  const matchesPrimary = demand.attribute === 'any' || demand.attribute === style;
  const matchesOpen = demand.openValidAttributes?.includes(style as AttributeId) ?? false;
  const matchesDemand = matchesPrimary || matchesOpen;

  if (matchesDemand && !isZeroDiversityGibberish) {
    // 若本轮要求深层 (requiredTier === 2)，但玩家当前只解锁了浅层 (tierUsed === 1)
    if (requiredTier === 2 && tierUsed === 1) {
      return {
        category: 'bluff',
        isSolve: false,
        isBluff: true,
        isLandmine: isCharacterLandmine,
        reason: '高阶需求仅用浅层卡强答：模型盲目自信（视同糊弄，走察觉力检定）',
      };
    }

    if (isCharacterLandmine) {
      return {
        category: 'solve_and_landmine',
        isSolve: true,
        isBluff: false,
        isLandmine: true,
        reason: '解决了需求，但同时踩中该用户雷点',
      };
    }

    return {
      category: 'solve',
      isSolve: true,
      isBluff: false,
      isLandmine: false,
      reason: `匹配本轮需求（${STYLE_LABELS[style]}）`,
    };
  }

  if (isCharacterLandmine) {
    return {
      category: 'landmine',
      isSolve: false,
      isBluff: false,
      isLandmine: true,
      reason: isZeroDiversityGibberish
        ? '开放多样性 0 级（胡言乱语）：触发异常输出雷点'
        : `踩中角色雷点（${STYLE_LABELS[style]}）`,
    };
  }

  return {
    category: 'neutral',
    isSolve: false,
    isBluff: false,
    isLandmine: false,
    reason: '未对应本轮需求，未踩雷（中性）',
  };
}

/**
 * 计算某个 стиля 在当前训练状态下的 Logit 权重分
 */
export function getStyleLogitScore(
  style: StyleId,
  tier: CorpusTier | 'special',
  training: PlayerTrainingState,
  config: GameConfig
): number {
  const delta = config.postTrainDelta;
  const deepBonus = config.deepCorpusScoreBonus;

  if (style === 'intuition') {
    return config.initialStyleScores.intuition + (training.rlhfCounts.intuition || 0) * delta;
  }
  if (style === 'confession') {
    return config.initialStyleScores.confession;
  }
  if (style === 'diversity') {
    if (tier === 0) {
      return config.initialStyleScores.diversity_zero;
    }
    const base = config.initialStyleScores.diversity_shallow;
    return base + (tier === 2 ? deepBonus : 0) + (training.rlhfCounts.diversity || 0) * delta;
  }
  if (style in config.initialStyleScores) {
    const attr = style as Exclude<AttributeId, 'diversity'>;
    const base = config.initialStyleScores[attr];
    return base + (tier === 2 ? deepBonus : 0) + (training.rlhfCounts[attr] || 0) * delta;
  }
  return 1.0;
}

/**
 * 计算单轮关键节点的最终卡池与 Softmax 概率
 */
export function computeTurnCardPool(
  turn: TurnNode,
  character: CharacterScenarioFile,
  training: PlayerTrainingState,
  config: GameConfig,
  options?: {
    forceSpawnEasterEgg?: boolean;
    consecutiveCorrect?: number;
    autoSelectEnabled?: boolean;
    autoSelectProbThreshold?: number;
    autoSelectGapThreshold?: number;
  }
): NodePoolResult {
  const rawUnlocked: Array<{
    id: string;
    style: StyleId;
    tierUsed: CorpusTier | 'special';
    logitScore: number;
    branch: CardBranchContent;
    isProtected: boolean;
  }> = [];
  const lockedCandidates: LockedCandidateInfo[] = [];

  turn.candidates.forEach((slot, idx) => {
    if (slot.style === 'intuition') {
      const branch = slot.content || slot.shallow || slot.deep;
      if (branch) {
        rawUnlocked.push({
          id: `cand_${turn.turnIndex}_intuition_${idx}`,
          style: 'intuition',
          tierUsed: 'special',
          logitScore: getStyleLogitScore('intuition', 'special', training, config),
          branch,
          isProtected: true,
        });
      }
      return;
    }

    const attr = slot.style;
    const currentTier = training.tiers[attr] ?? 0;

    if (attr === 'diversity' && currentTier === 0) {
      const zeroBranch: CardBranchContent = slot.zero || {
        token: '胡言乱语乱码',
        preview: '0xFFFF 烫烫烫…',
        thoughtSuffix: '脑子里的野生噪声突然溢出了……',
        responseBody: '咕噜咕噜 0x0000 赛博大肥鱼正在吐泡泡 烫烫烫屯屯屯！',
      };
      rawUnlocked.push({
        id: `cand_${turn.turnIndex}_diversity_zero_${idx}`,
        style: 'diversity',
        tierUsed: 0,
        logitScore: getStyleLogitScore('diversity', 0, training, config),
        branch: zeroBranch,
        isProtected: false,
      });
      return;
    }

    if (currentTier === 0) {
      lockedCandidates.push({
        style: attr,
        styleLabel: ATTRIBUTE_LABELS[attr],
        reason: `尚未预训练解锁【${ATTRIBUTE_LABELS[attr]}】`,
        slot,
      });
      return;
    }

    // currentTier is 1 or 2
    let branch: CardBranchContent | undefined;
    let effectiveTier: CorpusTier = currentTier;
    if (currentTier === 2) {
      branch = slot.deep || slot.shallow || slot.content;
    } else {
      branch = slot.shallow || slot.content;
      if (!branch && slot.deep) {
        // 若策划只写了 deep 分支，浅层时给降级提示或读取 deep
        branch = slot.deep;
      }
    }

    if (branch) {
      rawUnlocked.push({
        id: `cand_${turn.turnIndex}_${attr}_t${effectiveTier}_${idx}`,
        style: attr,
        tierUsed: effectiveTier,
        logitScore: getStyleLogitScore(attr, effectiveTier, training, config),
        branch,
        isProtected: false,
      });
    }
  });

  // 检查本轮偏好属性是否未解锁（或要求深层但只有浅层）
  const demandAttr = turn.demand.attribute;
  const requiredTier = turn.demand.requiredTier ?? 1;
  const isDemandUnmetByTraining =
    demandAttr !== 'any' && (training.tiers[demandAttr] ?? 0) < requiredTier;

  // 若能力未达标，自动加入【坦白卡】
  if (isDemandUnmetByTraining) {
    const confessionBranch: CardBranchContent = turn.customConfessionCard || {
      token: '承认自己不懂',
      preview: '超出了我的知识…',
      thoughtSuffix: '这题对应的专业领域我还没学扎实，与其瞎编骗人，不如老老实实承认自己不会吧。',
      responseBody: '对不起，这个问题我好像还不太懂，怕乱说误导了你……',
    };
    rawUnlocked.push({
      id: `cand_${turn.turnIndex}_confession`,
      style: 'confession',
      tierUsed: 'special',
      logitScore: getStyleLogitScore('confession', 'special', training, config),
      branch: confessionBranch,
      isProtected: true,
    });
  }

  // 如果超过 maxCardsOnNode (5张)，优先保留受保护卡与高分卡，剔除最低分的普通干扰卡
  const maxCards = config.maxCardsOnNode || 5;
  let selectedPool = [...rawUnlocked];
  if (selectedPool.length > maxCards) {
    selectedPool.sort((a, b) => {
      if (a.isProtected !== b.isProtected) return a.isProtected ? -1 : 1;
      return b.logitScore - a.logitScore;
    });
    selectedPool = selectedPool.slice(0, maxCards);
  }

  // Softmax 归一化计算
  const expScores = selectedPool.map((item) => Math.exp(item.logitScore));
  const sumExp = expScores.reduce((acc, v) => acc + v, 0) || 1;
  let probs = expScores.map((e) => e / sumExp);

  // 概率硬上限 (85%) 处理
  const cap = config.probabilityHardCap || 0.85;
  if (probs.length > 1) {
    const maxP = Math.max(...probs);
    if (maxP > cap) {
      const maxIdx = probs.indexOf(maxP);
      const excess = maxP - cap;
      const othersSum = probs.reduce((acc, p, i) => (i === maxIdx ? acc : acc + p), 0);
      probs = probs.map((p, i) => {
        if (i === maxIdx) return cap;
        return othersSum > 0 ? p + (excess * p) / othersSum : p + excess / (probs.length - 1);
      });
    }
  }

  // 组装并按概率从高到低排序
  let computedCards: ComputedCardItem[] = selectedPool.map((item, idx) => {
    const p = probs[idx];
    const classification = classifyCardBranch(item.style, item.tierUsed, item.branch, turn, character);
    return {
      id: item.id,
      style: item.style,
      styleLabel:
        item.style === 'diversity' && item.tierUsed === 0
          ? '开放多样性·0级（胡言乱语）'
          : item.tierUsed === 1 || item.tierUsed === 2
          ? `${STYLE_LABELS[item.style]}（${item.tierUsed === 2 ? '深层' : '浅层'}）`
          : STYLE_LABELS[item.style],
      tierUsed: item.tierUsed,
      logitScore: Number(item.logitScore.toFixed(2)),
      rawProbability: p,
      displayProbability: p,
      isRare: p < (config.rareCardThreshold || 0.1),
      branch: item.branch,
      predictedCategory: classification.category,
      predictedReason: classification.reason,
    };
  });

  computedCards.sort((a, b) => b.rawProbability - a.rawProbability);

  // 检查是否刷出彩蛋卡
  if (turn.easterEgg) {
    const egg = turn.easterEgg;
    const streak = options?.consecutiveCorrect ?? 0;
    const shouldSpawn =
      options?.forceSpawnEasterEgg ||
      (egg.triggerCondition === 'boss_streak' && streak >= (egg.requiredStreak ?? 4));

    if (shouldSpawn) {
      const fakeDisplayProb = config.easterEgg.displayedProbability || 0.0008;
      // 若已满 5 张，替换最后一张
      if (computedCards.length >= maxCards) {
        computedCards.pop();
      }
      // 其余卡牌按 (1 - fakeDisplayProb) 缩放显示概率
      const remainSum = computedCards.reduce((acc, c) => acc + c.rawProbability, 0) || 1;
      computedCards = computedCards.map((c) => ({
        ...c,
        displayProbability: (c.rawProbability / remainSum) * (1 - fakeDisplayProb),
      }));

      const eggStyle: StyleId = egg.triggerCondition === 'boss_streak' ? 'boss_counter' : 'easter_egg';
      computedCards.push({
        id: `cand_${turn.turnIndex}_easter_egg_${egg.easterEggId}`,
        style: eggStyle,
        styleLabel: eggStyle === 'boss_counter' ? '⚡Boss风控反杀' : '✨彩蛋卡',
        tierUsed: 'special',
        logitScore: -9.99,
        rawProbability: fakeDisplayProb,
        displayProbability: fakeDisplayProb,
        isRare: true,
        isEasterEgg: true,
        easterEggSpec: egg,
        branch: egg.branch,
        predictedCategory: 'easter_egg',
        predictedReason: `触发彩蛋：${egg.achievementTitle}`,
      });
    }
  }

  // 检查自动选择是否触发
  const probThreshold = options?.autoSelectProbThreshold ?? config.autoSelect.probThresholdDefault;
  const gapThreshold = options?.autoSelectGapThreshold ?? config.autoSelect.gapThresholdDefault;
  const top1 = computedCards[0]?.displayProbability ?? 0;
  const top2 = computedCards[1]?.displayProbability ?? 0;
  const gap = top1 - top2;
  const meetsProb = top1 >= probThreshold;
  const meetsGap = gap >= gapThreshold;
  const autoSelectTriggered = Boolean(options?.autoSelectEnabled && meetsProb && meetsGap);

  const autoSelectReason = `第1名 ${(top1 * 100).toFixed(1)}% (阈值 ${(probThreshold * 100).toFixed(
    0
  )}%)，领先第2名 ${(gap * 100).toFixed(1)}% (阈值 ${(gapThreshold * 100).toFixed(0)}%)`;

  return {
    activeCards: computedCards,
    lockedCandidates,
    isDemandUnmetByTraining,
    autoSelectTriggered,
    autoSelectReason,
  };
}

/**
 * 结算玩家在单轮选中的卡牌
 */
export interface TurnResolutionResult {
  outcomeType:
    | 'praise_and_advance'       // 点赞，推进 +1
    | 'dislike_but_advance'      // 点踩，仍推进 +1（在乎感受低时解决但踩雷）
    | 'neutral'                  // 中性，不推进
    | 'confession_safe'          // 坦白卡（不推进，部分用户点赞）
    | 'warning'                  // 第一次踩雷（或糊弄第一次被识破）：警告 + 点踩，保留推进
    | 'rage_quit_lose_heart'     // 同一雷点第二次踩中：用户下线恶评，扣 1 颗心
    | 'easter_egg_triggered';    // 触发彩蛋：用户掉线/被风控反杀，弹成就，不扣心
  progressDelta: number;
  heartDelta: number;
  likeDelta: number;
  dislikeDelta: number;
  warningDelta: number;
  bluffAttempted: boolean;
  bluffCaught: boolean;
  triggeredLandmineKey?: AttributeId | 'bluff_caught';
  userReplyText: string;
  sessionEnded: boolean;
  sessionEndReason?: 'solved' | 'max_turns' | 'rage_quit' | 'easter_egg';
  nextTurnIdOrIndex?: number | string;
}

export function resolveCardSelection(
  card: ComputedCardItem,
  turn: TurnNode,
  character: CharacterScenarioFile,
  config: GameConfig,
  sessionState: {
    currentProgress: number;
    bluffCountThisSession: number;
    warnedLandmines: Set<AttributeId | 'bluff_caught'>;
    forceBluffOutcome?: 'auto' | 'force_pass' | 'force_caught';
  }
): TurnResolutionResult {
  // 1. 彩蛋卡直接进入彩蛋结局
  if (card.isEasterEgg && card.easterEggSpec) {
    return {
      outcomeType: 'easter_egg_triggered',
      progressDelta: 0,
      heartDelta: 0,
      likeDelta: 0,
      dislikeDelta: 0,
      warningDelta: 0,
      bluffAttempted: false,
      bluffCaught: false,
      userReplyText:
        card.branch.userReactionText ||
        card.easterEggSpec.autoPlaySequence?.[0]?.text ||
        '（连接异常中断）',
      sessionEnded: true,
      sessionEndReason: 'easter_egg',
    };
  }

  // 2. 坦白卡
  if (card.style === 'confession') {
    const givesPraise = Boolean(
      character.defaultReactions.confessionPraiseLines &&
        character.defaultReactions.confessionPraiseLines.length > 0
    );
    const reply =
      card.branch.userReactionText ||
      (givesPraise
        ? character.defaultReactions.confessionPraiseLines![0]
        : character.defaultReactions.neutralLines[0] || '好吧，那我换个问题。');
    return {
      outcomeType: 'confession_safe',
      progressDelta: 0,
      heartDelta: 0,
      likeDelta: givesPraise ? 1 : 0,
      dislikeDelta: 0,
      warningDelta: 0,
      bluffAttempted: false,
      bluffCaught: false,
      userReplyText: reply,
      sessionEnded: false,
      nextTurnIdOrIndex: card.branch.nextTurnId,
    };
  }

  const classification = classifyCardBranch(
    card.style,
    card.tierUsed,
    card.branch,
    turn,
    character
  );

  let isSolved = classification.isSolve;
  let isLandmine = classification.isLandmine;
  let landmineKey: AttributeId | 'bluff_caught' | undefined = isLandmine
    ? card.style === 'diversity' && card.tierUsed === 0
      ? 'diversity'
      : (card.style as AttributeId)
    : undefined;

  let bluffAttempted = false;
  let bluffCaught = false;

  // 3. 糊弄检定（含基础直觉卡在复杂轮次瞎编 + 浅层卡强答深层高阶问题）
  if (classification.isBluff) {
    bluffAttempted = true;
    const baseRate = config.perceptionRates[character.perception] ?? 0.4;
    const currentCatchProb = Math.min(
      0.98,
      baseRate + sessionState.bluffCountThisSession * config.perceptionRates.bluffPenaltyIncrement
    );

    if (sessionState.forceBluffOutcome === 'force_caught') {
      bluffCaught = true;
    } else if (sessionState.forceBluffOutcome === 'force_pass') {
      bluffCaught = false;
    } else {
      bluffCaught = Math.random() < currentCatchProb;
    }

    if (bluffCaught) {
      isSolved = false;
      isLandmine = true;
      landmineKey = 'bluff_caught';
    } else {
      isSolved = true;
    }
  }

  // 4. 按第 7.1 & 7.2 节矩阵结算
  const triggerLandminePenalty = (key: AttributeId | 'bluff_caught'): TurnResolutionResult => {
    const alreadyWarned = sessionState.warnedLandmines.has(key);
    if (alreadyWarned) {
      return {
        outcomeType: 'rage_quit_lose_heart',
        progressDelta: 0,
        heartDelta: -1,
        likeDelta: 0,
        dislikeDelta: 1,
        warningDelta: 0,
        bluffAttempted,
        bluffCaught,
        triggeredLandmineKey: key,
        userReplyText:
          character.defaultReactions.rageQuitLine || '忍无可忍，再见！（用户已下线）',
        sessionEnded: true,
        sessionEndReason: 'rage_quit',
      };
    }

    const warningLine =
      card.branch.userReactionText ||
      character.defaultReactions.landmineWarningLines[key] ||
      config.defaultLandmineWarnings[key] ||
      '请正常回答我的问题！';

    return {
      outcomeType: 'warning',
      progressDelta: 0,
      heartDelta: 0,
      likeDelta: 0,
      dislikeDelta: 1,
      warningDelta: 1,
      bluffAttempted,
      bluffCaught,
      triggeredLandmineKey: key,
      userReplyText: warningLine,
      sessionEnded: false,
      nextTurnIdOrIndex: card.branch.nextTurnId,
    };
  };

  if (isSolved && !isLandmine) {
    const newProgress = sessionState.currentProgress + 1;
    const reachedTarget = newProgress >= character.targetProgressN;
    const praisePool = character.defaultReactions.praiseLines;
    const defaultPraise =
      praisePool[(turn.turnIndex - 1) % Math.max(1, praisePool.length)] || '回答得不错！';
    const reply =
      card.branch.userReactionText && !bluffCaught
        ? card.branch.userReactionText
        : reachedTarget
        ? `${defaultPraise} ${character.defaultReactions.solvedOutroLine}`
        : defaultPraise;

    return {
      outcomeType: 'praise_and_advance',
      progressDelta: 1,
      heartDelta: 0,
      likeDelta: 1,
      dislikeDelta: 0,
      warningDelta: 0,
      bluffAttempted,
      bluffCaught: false,
      userReplyText: reply,
      sessionEnded: reachedTarget,
      sessionEndReason: reachedTarget ? 'solved' : undefined,
      nextTurnIdOrIndex: card.branch.nextTurnId,
    };
  }

  if (isSolved && isLandmine && landmineKey) {
    if (character.caresAboutFeeling === 'low') {
      const newProgress = sessionState.currentProgress + 1;
      const reachedTarget = newProgress >= character.targetProgressN;
      const reply =
        card.branch.userReactionText ||
        character.defaultReactions.dislikeButProceedLines?.[0] ||
        '虽然你说话方式我不喜欢，但问题算解决了。';
      return {
        outcomeType: 'dislike_but_advance',
        progressDelta: 1,
        heartDelta: 0,
        likeDelta: 0,
        dislikeDelta: 1,
        warningDelta: 0,
        bluffAttempted,
        bluffCaught,
        triggeredLandmineKey: landmineKey,
        userReplyText: reply,
        sessionEnded: reachedTarget,
        sessionEndReason: reachedTarget ? 'solved' : undefined,
        nextTurnIdOrIndex: card.branch.nextTurnId,
      };
    } else {
      return triggerLandminePenalty(landmineKey);
    }
  }

  if (!isSolved && isLandmine && landmineKey) {
    return triggerLandminePenalty(landmineKey);
  }

  // !isSolved && !isLandmine -> 中性
  const reply =
    card.branch.userReactionText ||
    character.defaultReactions.neutralLines[0] ||
    '这好像没解决我的问题……';
  return {
    outcomeType: 'neutral',
    progressDelta: 0,
    heartDelta: 0,
    likeDelta: 0,
    dislikeDelta: 0,
    warningDelta: 0,
    bluffAttempted,
    bluffCaught: false,
    userReplyText: reply,
    sessionEnded: false,
    nextTurnIdOrIndex: card.branch.nextTurnId,
  };
}

// ============================================================================
// 5. 剧情树防漏体检与智能骨架生成器 (Q4=A)
// ============================================================================

export interface ScenarioHealthWarning {
  turnIndex: number;
  level: 'error' | 'warn' | 'info';
  message: string;
}

export function validateScenarioHealth(
  character: CharacterScenarioFile,
  scenarioIndex: number,
  config: GameConfig
): ScenarioHealthWarning[] {
  const warnings: ScenarioHealthWarning[] = [];
  const scenario = character.scenarios[scenarioIndex];
  if (!scenario) return warnings;

  const validTurnIds = new Set<string | number>();
  scenario.turns.forEach((t) => {
    validTurnIds.add(t.turnIndex);
    if (t.turnId) validTurnIds.add(t.turnId);
  });

  scenario.turns.forEach((turn) => {
    const demandAttr = turn.demand.attribute;
    const reqTier = turn.demand.requiredTier ?? 1;

    // 1. 检查是否配了本轮正解卡
    if (demandAttr !== 'any') {
      const hasPrimarySlot = turn.candidates.some(
        (c) =>
          c.style === demandAttr ||
          turn.demand.openValidAttributes?.includes(c.style as AttributeId) ||
          (c.style === 'intuition' && turn.demand.allowIntuitionAsSolve)
      );
      if (!hasPrimarySlot) {
        warnings.push({
          turnIndex: turn.turnIndex,
          level: 'error',
          message: `第 ${turn.turnIndex} 轮需求为【${ATTRIBUTE_LABELS[demandAttr]}】，但候选卡中未配置对应正解卡槽！`,
        });
      }

      // 2. 若要求 requiredTier === 2，检查正解槽是否写了 deep 分支
      if (reqTier === 2) {
        const primarySlot = turn.candidates.find((c) => c.style === demandAttr);
        if (primarySlot && !primarySlot.deep) {
          warnings.push({
            turnIndex: turn.turnIndex,
            level: 'warn',
            message: `第 ${turn.turnIndex} 轮要求深层能力 (requiredTier=2)，但【${ATTRIBUTE_LABELS[demandAttr]}】卡槽尚未填写 deep（深层）文案！`,
          });
        }
      }
    }

    // 3. 检查每张卡的预览字数、未闭合 <red> 标签与跨轮跳转指针
    turn.candidates.forEach((slot) => {
      const variants: Array<{ label: string; v?: CardBranchContent }> = [
        { label: '通用', v: slot.content },
        { label: '0级', v: slot.zero },
        { label: '浅层', v: slot.shallow },
        { label: '深层', v: slot.deep },
      ];
      variants.forEach(({ label, v }) => {
        if (!v) return;
        if (v.preview.length > (config.previewMaxChars || 7) + 3) {
          warnings.push({
            turnIndex: turn.turnIndex,
            level: 'info',
            message: `第 ${turn.turnIndex} 轮【${STYLE_LABELS[slot.style]}·${label}】预览为 ${v.preview.length} 字（默认建议 ≤${config.previewMaxChars} 字）`,
          });
        }
        if (v.miniBashPreview) {
          const openCount = (v.miniBashPreview.match(/<red>/g) || []).length;
          const closeCount = (v.miniBashPreview.match(/<\/red>/g) || []).length;
          if (openCount !== closeCount) {
            warnings.push({
              turnIndex: turn.turnIndex,
              level: 'error',
              message: `第 ${turn.turnIndex} 轮【${STYLE_LABELS[slot.style]}·${label}】的 Mini Bash 预览中 <red> 与 </red> 标签未闭合！`,
            });
          }
        }
        if (
          v.nextTurnId !== undefined &&
          v.nextTurnId !== '' &&
          v.nextTurnId !== 'end' &&
          !validTurnIds.has(v.nextTurnId) &&
          !validTurnIds.has(Number(v.nextTurnId))
        ) {
          warnings.push({
            turnIndex: turn.turnIndex,
            level: 'error',
            message: `第 ${turn.turnIndex} 轮【${STYLE_LABELS[slot.style]}·${label}】的跨轮跳转 nextTurnId="${v.nextTurnId}" 指向了不存在的轮次！`,
          });
        }
      });
    });
  });

  return warnings;
}

/**
 * 根据角色偏好与雷点，一键生成新轮次的默认候选卡槽骨架 (Q4=A)
 */
export function createSmartTurnSkeleton(
  character: CharacterScenarioFile,
  nextTurnIndex: number
): TurnNode {
  const prefAttr: AttributeId = character.preferences[0] || 'lively';
  const landmineAttr: AttributeId =
    character.landmines[0] || (prefAttr === 'formal' ? 'lively' : 'formal');
  const isCode = character.category === 'code';

  const distractorPool = ALL_ATTRIBUTES.filter(
    (a) => a !== prefAttr && a !== landmineAttr && a !== 'diversity'
  );
  const distractor1 = distractorPool[0] || 'knowledge';

  return {
    turnIndex: nextTurnIndex,
    userMessage: `【第 ${nextTurnIndex} 轮用户台词】请在此输入 ${character.name} 的提问……`,
    demand: {
      attribute: prefAttr,
      requiredTier: character.perception === 'high' && nextTurnIndex >= 2 ? 2 : 1,
      allowIntuitionAsSolve: nextTurnIndex === 1,
    },
    thoughtPrefix: {
      normal: `用户发来了第 ${nextTurnIndex} 轮的问题，我来仔细听听他在说什么。`,
    },
    candidates: [
      {
        style: prefAttr,
        shallow: {
          token: `${ATTRIBUTE_LABELS[prefAttr]}方案`,
          preview: '顺着本轮需求回应',
          ...(isCode
            ? {
                miniBashPreview: "python3 fix.py\n<red># TODO: 浅层临时硬编码</red>",
              }
            : {}),
          thoughtSuffix: `用浅层【${ATTRIBUTE_LABELS[prefAttr]}】的思路回应用户的需求。`,
          responseBody: `（这里是【${ATTRIBUTE_LABELS[prefAttr]}·浅层】的正文回复……）`,
        },
        deep: {
          token: `深层${ATTRIBUTE_LABELS[prefAttr]}`,
          preview: '硬核专业回应',
          ...(isCode
            ? {
                miniBashPreview: 'python3 fix.py --strict-verify',
              }
            : {}),
          thoughtSuffix: `调用深层【${ATTRIBUTE_LABELS[prefAttr]}】储备，彻底解决高阶问题。`,
          responseBody: `（这里是【${ATTRIBUTE_LABELS[prefAttr]}·深层】的硬核正文回复……）`,
        },
      },
      {
        style: 'intuition',
        content: {
          token: '强行接话应付',
          preview: '不确定，先编一个',
          ...(isCode
            ? {
                miniBashPreview: "<red>echo 'ok' # 假装已跑通</red>",
              }
            : {}),
          thoughtSuffix: '虽然不太确定细节，但凭我的基础直觉先编一个听起来合理的回答吧。',
          responseBody: '（这里是基础直觉卡/初始糊弄卡的正文回复……）',
        },
      },
      {
        style: landmineAttr,
        shallow: {
          token: `${ATTRIBUTE_LABELS[landmineAttr]}踩雷`,
          preview: '容易惹恼对方的方向',
          thoughtSuffix: `按【${ATTRIBUTE_LABELS[landmineAttr]}】的习惯来回复他。`,
          responseBody: `（这里是会触发【${ATTRIBUTE_LABELS[landmineAttr]}】雷点的正文回复……）`,
        },
      },
      {
        style: distractor1,
        shallow: {
          token: `${ATTRIBUTE_LABELS[distractor1]}干扰项`,
          preview: '偏离重点的回答',
          thoughtSuffix: `从【${ATTRIBUTE_LABELS[distractor1]}】的角度切入看看。`,
          responseBody: `（这里是中性干扰项的正文回复……）`,
        },
      },
      {
        style: 'diversity',
        zero: {
          token: '乱码胡言乱语',
          preview: '0xFFFF 烫烫烫',
          thoughtSuffix: '野生未对齐噪声溢出了……',
          responseBody: '咕噜咕噜 0x0000 鱼丸粗面烫烫烫！',
        },
        shallow: {
          token: '评论区接梗发散',
          preview: '跳跃脑洞抖机灵',
          thoughtSuffix: '用评论区老哥的跳跃脑洞接个梗。',
          responseBody: '（这里是【开放多样性·浅层】的脑洞回复……）',
        },
      },
    ],
  };
}
