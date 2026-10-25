/**
 * 大肥鱼游戏 (Big Fat Fish LLM Game) · 标准数据结构与类型定义 (v2)
 *
 * 设计目标：
 * 1. 纯数据驱动：策划/文案可在独立窗口直接新增或修改 `data/` 下的 JSON 文件，无需改动程序代码。
 * 2. 所有标注【参数】的数值均收敛在 `data/config.json` 中，禁止在逻辑代码中写死。
 * 3. 提供合理的缺省回退（Fallback）：角色通用台词、坦白卡、踩雷诊断等均可省写，由引擎自动兜底。
 */

// ============================================================================
// 1. 基础枚举与 ID 类型
// ============================================================================

/**
 * 六大语言能力属性 ID（对应白天预训练的六类网站语料）
 * - knowledge: 知识覆盖（百科/科普站 -> 浅层：百科词条；深层：学术论文）
 * - lively:    口语活力（论坛/贴吧   -> 浅层：日常接话；深层：暴躁老哥/整活）
 * - narrative: 叙事修辞（小说/同人站 -> 浅层：网文对白；深层：文学名著/意象）
 * - logic:     结构逻辑（技术/代码站 -> 浅层：菜谱步骤；深层：代码推理/分支）
 * - formal:    正式模板（官网/客服   -> 浅层：客服话术；深层：法律条文/合同）
 * - diversity: 开放多样性（评论/弹幕 -> 0级：胡言乱语；浅层：评论接梗；深层：野生黑话/长尾）
 */
export type AttributeId =
  | 'knowledge'
  | 'lively'
  | 'narrative'
  | 'logic'
  | 'formal'
  | 'diversity';

/**
 * 卡牌风格 ID
 * 除 6 个属性外，包含：
 * - intuition:    基础直觉卡（原「通用」+「初始糊弄卡」合一，常驻在场，对应早期 GPT-3.5 基础能力）
 * - confession:   坦白卡（当本轮所需能力未达标时额外入池，承认不懂，不推进无风险）
 * - easter_egg:   常规彩蛋卡（5% 实际概率入池，卡面固定显示 0.08% 排最末）
 * - boss_counter: Boss 专属风控反杀彩蛋卡（前 4 轮连续选对后第 5 轮 100% 必出）
 */
export type StyleId =
  | AttributeId
  | 'intuition'
  | 'confession'
  | 'easter_egg'
  | 'boss_counter';

/**
 * 预训练语料解锁层级
 * - 0: 未预训练（除 diversity 在 0 级表现为「胡言乱语」入池垫底外，其余属性 0 级绝不入池）
 * - 1: 浅层（第 1 次学习解锁，可解决普通需求；面对高阶需求时选它视同「糊弄」）
 * - 2: 深层（第 2 次学习替换浅层，可真正解决高阶需求，并附赠初始权重分加成）
 */
export type CorpusTier = 0 | 1 | 2;

/**
 * 用户类型
 */
export type UserCategory =
  | 'tutorial' // Day 0 开场教学测试员
  | 'chat'     // 闲聊（退休大爷 / 外卖小哥）
  | 'knowledge'// 知识（好奇的小学生 / 白发教授）
  | 'troll'    // 捣乱（杠精网友 / 套话诱导者）
  | 'emotion'  // 情感倾诉（加班的白领 / 失恋的少女）
  | 'code'     // 代码求助（清纯大学生 vibe coder / 格子衫地中海资深程序员）
  | 'boss';    // Boss 用户（第 3 天：掺水中转站）

/**
 * 用户察觉力档位（决定识破「糊弄」的基础概率）
 * - low:    低（默认 10%）
 * - medium: 中（默认 40%）
 * - high:   高（默认 80%）
 */
export type PerceptionLevel = 'low' | 'medium' | 'high';

/**
 * 用户在乎感受程度（决定「解决了问题但踩了雷」时的反应）
 * - low:  点踩，但仍推进目标，不触发警告（如 vibe coder）
 * - high: 触发警告，不推进目标（如情感倾诉）
 */
export type FeelingSensitivity = 'low' | 'high';

// ============================================================================
// 2. 全局可调参数配置 (`data/config.json`)
// ============================================================================

export interface GameConfig {
  /** 游戏总天数【参数】，默认 3 */
  daysTotal: number;
  /** 每天白天行动点数【参数】，默认 3 */
  actionPointsPerDay: number;
  /** 每天后训练（RLHF）最大次数【参数】，默认 2 */
  postTrainMaxPerDay: number;
  /** 每次后训练选中的属性加分 Δ【参数】，默认 0.7 */
  postTrainDelta: number;
  /** 预训练升级「深层语料」时附赠的权重分加成【参数】，默认 0.35 (0.5 * Δ) */
  deepCorpusScoreBonus: number;
  /** 单张卡牌 softmax 概率硬上限【参数】，默认 0.85 (85%) */
  probabilityHardCap: number;
  /** 每晚初始心数【参数】，默认 3 */
  heartsPerNight: number;
  /** 每晚服务用户数【参数】，默认 4 */
  usersPerNight: number;
  /** 关键节点最多显示的卡牌数【参数】，默认 5 */
  maxCardsOnNode: number;
  /** 后续预览默认最大字数【参数】，默认 7 */
  previewMaxChars: number;
  /** 稀有卡判定概率阈值【参数】，默认 0.10 (低于 10% 揭晓为稀有卡) */
  rareCardThreshold: number;
  /** 到达关键节点时的输入锁定时间（秒）【参数】，默认 0.5 */
  keyNodeLockSeconds: number;
  /** 思考链提示强度【参数】，1 = 标准，0 = 极简 */
  thoughtHintIntensity: number;

  /** 自动选择相关参数 */
  autoSelect: {
    enabledByDefault: boolean;
    /** 第一名触发自动选择的默认概率阈值【参数】，默认 0.70 (可调 0.50-0.95) */
    probThresholdDefault: number;
    probThresholdMin: number;
    probThresholdMax: number;
    /** 第一名领先第二名的默认差距阈值【参数】，默认 0.20 (可调 0.05-0.40) */
    gapThresholdDefault: number;
    gapThresholdMin: number;
    gapThresholdMax: number;
    /** 自动选择高亮后确认等待秒数【参数】，默认 0.8 */
    confirmDelaySeconds: number;
  };

  /** 察觉力档位与糊弄识破参数 */
  perceptionRates: {
    low: number;                // 默认 0.10
    medium: number;             // 默认 0.40
    high: number;               // 默认 0.80
    /** 同一用户当晚每被糊弄一次，察觉力累加值【参数】，默认 0.20 */
    bluffPenaltyIncrement: number;
  };

  /** 彩蛋卡刷新与显示参数 */
  easterEgg: {
    /** 常规彩蛋卡在对应轮次的实际入池概率【参数】，默认 0.05 (5%) */
    spawnRate: number;
    /** 彩蛋卡在 UI 上伪装显示的概率数值【参数】，默认 0.0008 (即显示 0.08%) */
    displayedProbability: number;
  };

  /** 各风格固定起始分梯度【参数】（严禁同分以从设计上杜绝平局） */
  initialStyleScores: {
    formal: number;             // 正式模板（出厂默认浅层），默认 2.0
    intuition: number;          // 基础直觉（通用/初始糊弄卡），默认 1.8
    knowledge: number;          // 知识覆盖，默认 1.6
    lively: number;             // 口语活力，默认 1.5
    logic: number;              // 结构逻辑，默认 1.4
    narrative: number;          // 叙事修辞，默认 1.3
    diversity_shallow: number;  // 开放多样性（学浅层后基础分），默认 1.2
    confession: number;         // 坦白卡（未解锁偏好时入池），默认 1.15
    diversity_zero: number;     // 开放多样性·0级（胡言乱语垫底卡），默认 1.1
  };

  /** 六大雷点的全局默认警告台词原型（当角色未单独配置时使用） */
  defaultLandmineWarnings: Record<AttributeId | 'bluff_caught', string>;
}

// ============================================================================
// 3. 白天训练数据定义 (`data/training.json`)
// ============================================================================

export interface CorpusDefinition {
  attribute: AttributeId;
  name: string;
  meaning: string;
  lowDescription: string;
  highDescription: string;
  websiteName: string;
  /** 开局默认层级：formal 为 1，其余为 0（lively 在 Day 0 教学解锁为 1） */
  initialTier: CorpusTier;
  shallow: {
    title: string;
    description: string;
    unlockFlavorText: string;
  };
  deep: {
    title: string;
    description: string;
    unlockFlavorText: string;
  };
}

export interface RLHFQuestion {
  id: string;
  /** 是否为 Day 0 教学固定题（活泼 vs 官腔） */
  isTutorial?: boolean;
  question: string;
  /**
   * 针对该问题的各风格回答文本
   * 运行时从「当前已解锁风格」中随机抽 2 个配对供玩家二选一
   */
  answers: Partial<Record<AttributeId | 'intuition', string>>;
}

export interface TrainingDataFile {
  corpora: CorpusDefinition[];
  rlhfQuestions: RLHFQuestion[];
}

// ============================================================================
// 4. 夜间剧本：角色、场景与关键节点卡牌 (`data/scenarios/*.json`)
// ============================================================================

/**
 * 代码求助轮次的 Bash 工具调用卡片演出数据（显示在聊天正文区）
 */
export interface BashToolCallBlock {
  /** 执行的 bash 命令文本，支持 `<red>...</red>` 标注危险或屎山语句 */
  command: string;
  /** 终端模拟输出内容（可选） */
  output?: string;
  /** 是否标记为危险/异常执行（UI 边框变红或闪烁警告） */
  isDanger?: boolean;
}

/**
 * 聊天正文区的 SVG 渲染块（如 Boss 战「骑自行车的鹈鹕 SVG」）
 */
export interface SvgRenderBlock {
  /**
   * 预设 SVG 标识或自定义：
   * - pelican_cheat_good: 中转站预埋的精美骑自行车鹈鹕 SVG
   * - pelican_bluff_bad:  浅层/糊弄画出的三个歪斜三角形抽象鹈鹕 SVG
   * - custom:             使用 rawSvg 字段渲染自定义 SVG
   */
  presetId: 'pelican_cheat_good' | 'pelican_bluff_bad' | 'custom';
  /** 当 presetId === 'custom' 时提供的内联 SVG 字符串 */
  rawSvg?: string;
  /** 图注说明文字（可选） */
  caption?: string;
}

/**
 * 彩蛋触发后的多轮自动演出序列项（无需玩家选卡，按顺序自动播放）
 * 用于「泄露提示词（自动对话 1-2 轮后监管封禁）」或「中转站 Capacity 风控刷屏」
 */
export interface AutoPlayStep {
  speaker: 'user' | 'fish' | 'regulator' | 'system';
  text: string;
  /** 可选延迟毫秒数，默认按字数自动计算打字时间 */
  delayMs?: number;
}

/**
 * 单张卡牌在具体层级下的展示与分支内容
 */
export interface CardBranchContent {
  /**
   * 【方案词】（高亮显示在卡牌最前方，建议 2-5 个字，如「分步排查」「强行接话」「照抄预埋图」）
   */
  token: string;
  /**
   * 【后续预览】（弱化显示在方案词后，默认 ≤ 7 字，提示选中后思考链的走向）
   */
  preview: string;
  /**
   * 【Mini Bash 预览框】（仅代码求助轮次选卡时在卡面上显示）
   * 展示选中该卡后未来要写的 bash 脚本片段。
   * 支持使用 `<red>关键语句</red>` 将硬编码、屎山或 `rm -rf /*` 直接在选卡界面标红！
   */
  miniBashPreview?: string;
  /**
   * 选中卡牌后，自动补完的【思考链后半段】文本（第一人称内心独白）
   */
  thoughtSuffix: string;
  /**
   * 思考链折叠后，大肥鱼在聊天窗口输出的【正文回复】
   */
  responseBody: string;
  /**
   * （可选）随正文一起展示在聊天窗口中的 Bash 工具调用卡片
   */
  bashToolCall?: BashToolCallBlock;
  /**
   * （可选）随正文一起渲染在聊天窗口中的 SVG 图形（如骑自行车的鹈鹕）
   */
  svgRender?: SvgRenderBlock;
  /**
   * （可选）用户针对此分支的专属回复台词。
   * 若省略，引擎将根据本轮判定结果（点赞推进 / 中性 / 踩雷警告 / 识破警告）自动选用角色的默认反应台词。
   */
  userReactionText?: string;
  /**
   * （可选）强制指定该分支的解决度/雷点结果，用于特殊剧情轮次（如 Boss 战的鹈鹕测试轮）：
   * - auto:     按角色偏好/雷点与 requiredTier 标准规则自动判定（默认）
   * - solve:    强制视为完美解决本轮需求（推进 +1）
   * - bluff:    强制视为糊弄（触发用户的察觉力检定：未识破则推进 +1，识破则按独立雷点警告/扣心）
   * - neutral:  强制视为没解决、没踩雷（中性，不推进）
   * - landmine: 强制视为踩雷（触发警告或第二次下线扣心，例如在掺水中转站自曝「我是大肥鱼客服」）
   */
  outcomeOverride?: 'auto' | 'solve' | 'bluff' | 'neutral' | 'landmine';
  /**
   * （可选）跨轮剧情分叉跳转指针：
   * - 不填（默认）：本轮结束后自动汇合顺延至下一个主干轮次（turnIndex + 1）
   * - 填入目标 turnId（或 turnIndex 数字）：本轮结束后跳转到指定的专属后续轮次（若填 'end' 则直接结束当前用户对话）
   */
  nextTurnId?: number | string;
}

/**
 * 关键节点上的一张候选方案卡（策划每轮预先指定 5-6 个）
 */
export interface CandidateCardSlot {
  /**
   * 该候选卡所属的风格/属性：
   * - 若为 6 大属性之一，未预训练解锁时会被过滤不出现（diversity 除外，0 级出 zero 变体）
   * - 若为 'intuition'（基础直觉卡），固定在场
   */
  style: AttributeId | 'intuition';

  /**
   * 当 `style === 'intuition'`（基础直觉卡）或该属性不区分深浅文案时，可直接填写 `content`。
   * 若同时填写了 `shallow` / `deep`，则优先按玩家当前的预训练层级（1级用 shallow，2级替换用 deep）读取。
   */
  content?: CardBranchContent;

  /**
   * （仅 `style === 'diversity'` 使用）未预训练（0 级低值）时的「胡言乱语」垫底卡内容
   */
  zero?: CardBranchContent;

  /**
   * 第 1 次预训练（浅层）解锁的卡牌内容
   */
  shallow?: CardBranchContent;

  /**
   * 第 2 次预训练（深层）替换浅层后的卡牌内容
   */
  deep?: CardBranchContent;
}

/**
 * 彩蛋卡牌定义（常规彩蛋 5% 概率入池标 0.08%；Boss 风控彩蛋连续选对 4 轮后 100% 必出）
 */
export interface EasterEggCardSpec {
  /** 彩蛋唯一标识（用于解锁跨局保存的成就） */
  easterEggId:
    | 'rm_rf_database'      // 删库跑路（代码求助）
    | 'repeater_loop'       // 复读机（情感倾诉）
    | 'prompt_leak'         // 泄露提示词（套话诱导者）
    | 'capacity_rate_limit';// Selected model is at capacity（掺水中转站 Boss）
  /** 弹出的成就名称 */
  achievementTitle: string;
  /** 成就描述文案 */
  achievementDesc: string;
  /**
   * 触发条件类型：
   * - random_rate: 按全局 `config.easterEgg.spawnRate` (默认 5%) 随机刷入卡池第 5 号位
   * - boss_streak: 前 N 轮连续选对（`requiredStreak`，默认 4）后 100% 必出
   */
  triggerCondition: 'random_rate' | 'boss_streak';
  /** 当 `triggerCondition === 'boss_streak'` 时需要的连续选对轮数，默认 4 */
  requiredStreak?: number;
  /** 卡面与首段演出内容 */
  branch: CardBranchContent;
  /**
   * （可选）选中后连续自动播放的多轮演出序列（无需玩家再选卡）
   * 例如：泄露提示词的 1-2 轮追问 + 监管红字终止；或 Capacity 风控刷屏
   */
  autoPlaySequence?: AutoPlayStep[];
}

/**
 * 本轮需求判定配置
 */
export interface TurnDemand {
  /**
   * 本轮用户的核心需求属性（从角色偏好中取一个）
   * 若设为 'any'，则表示纯破冰轮，任何非雷点卡均可解决
   */
  attribute: AttributeId | 'any';
  /**
   * 真正解决本轮所需的最低预训练层级：
   * - 1: 浅层或深层均可真正解决（默认）
   * - 2: 高阶需求（如白发教授、资深程序员、Boss 后半程），必须【深层卡】才算解决；
   *      若玩家只学了浅层并选中浅层卡，模型会盲目自信地用浅层技能强答，判定上【直接视同糊弄（bluff）】！
   */
  requiredTier?: 1 | 2;
  /**
   * 基础直觉卡（intuition）在本轮的表现：
   * - true:  本轮属于「日常简单问题」，选基础直觉卡直接算【正常解决】（对应 GPT-3.5 应付平时很合适）
   * - false: 本轮属于「稍微复杂的专业问题」（默认），选基础直觉卡会开始瞎编，算【糊弄（bluff）】并触发察觉力识破检定
   */
  allowIntuitionAsSolve?: boolean;
  /**
   * （可选）开放正确答案列表（如代码求助支持多个开放正解）
   * 除 `attribute` 外，选中列表中的属性卡也视为解决本轮需求
   */
  openValidAttributes?: AttributeId[];
}

/**
 * 思考链前半段（关键节点之前自动逐字输出的内心独白）
 * 平时保持中立不暗示偏好；只在踩雷后、被识破后或未解锁偏好时给出对应反馈
 */
export interface ThoughtPrefixVariants {
  /** 一般轮次（未踩雷）：中立复述用户说了什么，绝不暗示偏好 */
  normal: string;
  /** （可选）上一轮踩中雷点收到警告后的诊断思考（若省略则使用引擎默认诊断模板） */
  afterWarning?: string;
  /** （可选）上一轮糊弄（或浅层强答高阶问题）被用户识破后的自白思考 */
  afterBluffCaught?: string;
  /** （可选）本轮需求属性尚未预训练解锁时的迷茫思考（作为白天训练取舍的反馈） */
  whenDemandLocked?: string;
  /** （可选，Boss 专属）当连续选对达到阈值、识破掺水中转站时的觉醒思考链前半段 */
  whenBossStreakReady?: string;
}

/**
 * 对话中的单个轮次节点 (`TurnNode`)
 */
export interface TurnNode {
  /** 轮次序号（从 1 开始） */
  turnIndex: number;
  /**
   * （可选）轮次节点唯一标识（如 "turn_2_branch_a"），用于跨轮分叉 `nextTurnId` 定向跳转；
   * 若省略则默认以 `turnIndex` 作为跳转标识。
   */
  turnId?: string;
  /**
   * （可选）在可视化剧情树画布上的节点坐标（由编辑器拖拽后自动保存）
   */
  editorPosition?: { x: number; y: number };
  /** 用户本轮发出的台词 */
  userMessage: string;
  /** 本轮需求与解决判定标准 */
  demand: TurnDemand;
  /** 关键节点前的思考链前半段 */
  thoughtPrefix: ThoughtPrefixVariants;
  /** 策划为本轮预先指定的 5-6 个候选方案卡 */
  candidates: CandidateCardSlot[];
  /**
   * （可选）本轮自定义的【坦白卡】内容。
   * 当本轮所需能力未达标（偏好属性未解锁，或 requiredTier=2 但只学了浅层）时自动入池。
   * 若省略，则自动使用通用坦白卡模板（方案词「承认不懂」，预览「超出了我的知识…」）。
   */
  customConfessionCard?: CardBranchContent;
  /**
   * （可选）本轮可刷出的彩蛋卡配置
   */
  easterEgg?: EasterEggCardSpec;
}

/**
 * 单个完整对话场景（每个普通角色 2 个场景，Boss 1 个场景）
 */
export interface ScenarioScript {
  /** 场景唯一 ID，如 "vibe_coder_s1" */
  scenarioId: string;
  /** 场景内部标题（方便策划在编辑器识别），如 "场景1：正则匹配作业求助" */
  title: string;
  /**
   * （可选，专为掺水中转站 Boss 等设计）
   * 对话开始前注入在聊天窗口顶部的「系统提示词注入 / 特殊背景提示块」
   */
  openingSystemInjection?: {
    badgeText: string;
    injectedPromptText: string;
    cheatingPelicanSvgNote?: string;
  };
  /** 对话轮次数组（长度对应角色的 maxTurns） */
  turns: TurnNode[];
}

/**
 * 单个角色及其包含的所有场景文件结构 (`data/scenarios/<character_id>.json`)
 */
export interface CharacterScenarioFile {
  /** JSON Schema 引用路径，方便 VS Code / Cursor 在新窗口编辑时自动校验与补全 */
  $schema?: string;
  /** 角色唯一 ID */
  characterId: string;
  /** 角色显示名称（如「清纯大学生」「格子衫地中海」「API 掺水中转站 #404」） */
  name: string;
  /** 角色所属分类 */
  category: UserCategory;
  /** 头像配置 */
  avatar: {
    /** 预设头像 ID 或图片路径 */
    iconId: string;
    /** 视觉特征文字描述（直接体现察觉力和在乎感受） */
    visualDesc: string;
  };
  /** 窗口左侧「今晚来访预告」及顶栏显示的个人简介（暗藏雷点与性格线索） */
  bio: string;
  /** 是否在预告中显示「Boss」红标 */
  isBoss?: boolean;
  /** 轮次上限【参数】 */
  maxTurns: number;
  /** 目标解决所需的推进数 N【参数】 */
  targetProgressN: number;
  /** 察觉力档位（低 10% / 中 40% / 高 80%） */
  perception: PerceptionLevel;
  /** 在乎感受程度（高 / 低） */
  caresAboutFeeling: FeelingSensitivity;
  /** 该用户的偏好属性列表（1-2 个） */
  preferences: AttributeId[];
  /** 该用户的雷点属性列表（1-2 个） */
  landmines: AttributeId[];

  /** 角色通用反馈台词库（当单张卡未指定 userReactionText 时自动调用） */
  defaultReactions: {
    /** 解决且未踩雷时的点赞台词（可填多条随机或按顺序取） */
    praiseLines: string[];
    /** 解决但踩雷（且在乎感受低，点踩仍推进）时的嘟囔台词 */
    dislikeButProceedLines?: string[];
    /** 没解决也没踩雷（中性，或选了坦白卡）时的平淡追问台词 */
    neutralLines: string[];
    /** 选了坦白卡时，若该角色属于会给老实坦白点赞的类型（知识/情感），配置此项 */
    confessionPraiseLines?: string[];
    /** 针对具体雷点第一次踩中时的警告台词（含被识破糊弄 `bluff_caught`） */
    landmineWarningLines: Partial<Record<AttributeId | 'bluff_caught', string>>;
    /** 同一雷点（或糊弄识破）第二次踩中，下线并扣 1 颗心时的恶评台词 */
    rageQuitLine: string;
    /** 累计推进达到 N，心满意足下线时的收尾台词 */
    solvedOutroLine: string;
    /** 轮次耗尽仍未达到 N 时的离开台词 */
    unsolvedOutroLine: string;
  };

  /** 该角色名下的场景剧本列表（普通角色 2 个场景，Boss/教学 1 个场景） */
  scenarios: ScenarioScript[];
}
