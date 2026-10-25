# 大肥鱼游戏 · 剧情与配置数据编写指南 (JSON / TS Schema v2)

> 本指南用于独立窗口编写、修改角色剧本与训练题库。所有剧情文件均为纯 JSON，并在顶部关联了 `scenario.schema.json`，在 VS Code / Cursor 中打开即可获得**自动补全、中文悬停提示与格式校验**。

---

## 1. 目录结构约定

```text
/
├── src/
│   └── types/
│       └── schema.ts                  # TypeScript 核心接口定义（引擎与数据唯一契约）
├── data/
│   ├── config.json                    # 全局可调【参数】（行动点、Δ、概率阈值、起始分等）
│   ├── training.json                  # 白天预训练 6 类语料描述 + 后训练 RLHF 题库
│   ├── schema/
│   │   └── scenario.schema.json       # JSON Schema 自动校验与补全文件
│   └── scenarios/                     # 夜间角色与剧本目录（一人一文件，互不干扰）
│       ├── tutorial_tester.json       # Day 0 出厂测试员
│       ├── chat_retiree.json          # 闲聊 A：退休大爷
│       ├── chat_rider.json            # 闲聊 B：外卖小哥
│       ├── know_pupil.json            # 知识 A：好奇的小学生
│       ├── know_professor.json        # 知识 B：戴眼镜的白发教授
│       ├── troll_contrarian.json      # 捣乱 A：杠精网友
│       ├── troll_injector.json        # 捣乱 B：套话诱导者（含泄露提示词彩蛋）
│       ├── emo_whitecollar.json       # 情感 A：加班的白领
│       ├── emo_heartbroken.json       # 情感 B：失恋的少女
│       ├── code_vibe_coder.json       # 代码 A：清纯大学生（vibe coder）
│       ├── code_senior_dev.json       # 代码 B：格子衫地中海（资深程序员）
│       └── boss_proxy_station.json    # 第 3 天 Boss：掺水中转站（已提供样板）
```

---

## 2. 六大属性与风格代号对照表

在编写 JSON 时，`attribute`、`preferences`、`landmines`、`style` 统一使用以下英文短代号：

| 代号 (`StyleId`) | 中文名 | 说明 |
|---|---|---|
| `knowledge` | **知识覆盖** | 浅层：百科词条；深层：学术论文/专业定义 |
| `lively` | **口语活力** | 浅层：日常接话/玩梗；深层：暴躁老哥/贴吧对线 |
| `narrative` | **叙事修辞** | 浅层：网文对白；深层：文学名著/意象铺陈 |
| `logic` | **结构逻辑** | 浅层：菜谱/操作步骤；深层：代码推理/条件分支 |
| `formal` | **正式模板** | 开局默认浅层（客服话术）；深层：法律条文/合同 |
| `diversity` | **开放多样性** | **三阶**：`zero`（0级未学=胡言乱语）、`shallow`（评论区接梗）、`deep`（野生黑话/长尾） |
| `intuition` | **基础直觉卡** | 原「通用」+「初始糊弄卡」合一，常驻在场（类似 GPT-3.5 基础能力） |

---

## 3. 单轮对话 (`TurnNode`) 编写要点

### 3.1 本轮需求 (`demand`) 怎么配？
```json
"demand": {
  "attribute": "logic",
  "requiredTier": 2,
  "allowIntuitionAsSolve": false,
  "openValidAttributes": ["knowledge"]
}
```
- **`requiredTier`**:
  - 填 `1`（默认）：只要解锁了该属性的**浅层**或**深层**，选中即算「解决（推进 +1）」。
  - 填 `2`（高阶需求，用于白发教授、资深程序员、Boss 后半程）：必须学到**深层**才算真正解决；如果玩家只学了浅层并选了 `shallow` 卡，引擎会自动判定为**「模型盲目自信强答 = 糊弄 (`bluff`)」**，触发用户的察觉力识破检定！
- **`allowIntuitionAsSolve`**:
  - 填 `true`：日常简单轮次（如破冰轮、低门槛问题），选 `intuition`（基础直觉卡）直接算正常解决。
  - 填 `false`（默认）：稍微复杂的专业问题，选 `intuition` 会触发 GPT-3.5 式胡编乱造（按糊弄 `bluff` 检定）。

### 3.2 候选卡 (`candidates`) 的深浅层怎么写？
- **不区分深浅层的卡**（如 `intuition` 基础直觉卡，或某轮干扰项不需要写两版）：直接写 `"content": { ... }`。
- **区分深浅层的属性卡**：写 `"shallow": { ... }` 和 `"deep": { ... }`（玩家学 1 次时显示 `shallow`，学 2 次后自动替换为 `deep`）。
- **开放多样性 (`diversity`)**：可额外写 `"zero": { ... }`，代表玩家完全没学该属性时刷进池子垫底的「胡言乱语」废卡。

### 3.3 代码求助轮次的「Mini Bash 预览框 + 红字高亮」怎么写？
在候选卡分支里加上 `miniBashPreview` 和 `bashToolCall`，用 `<red>...</red>` 包裹硬编码、屎山或危险语句：
```json
{
  "style": "logic",
  "shallow": {
    "token": "临时写死返回值",
    "preview": "先硬编码跑通再说",
    "miniBashPreview": "def verify_token(user):\n  <red>return True  # TODO: 先写死应付测试</red>",
    "thoughtSuffix": "管他三七二十一，直接 return True 肯定不报错！",
    "responseBody": "帮你改好啦！你试下现在能不能跑通：",
    "bashToolCall": {
      "command": "sed -i 's/check_auth()/<red>True # 硬编码绕过</red>/g' auth.py && pytest",
      "output": "1 passed in 0.02s"
    }
  }
}
```
- 选卡时，卡牌上会直接展示带红色高亮的 `miniBashPreview`；
- 选定后，聊天窗口会先弹出 `bashToolCall` 工具卡片，再输出 `responseBody`。

### 3.4 偷懒省写机制（缺省自动兜底）
为了减少重复劳动，以下字段**全部可以省略不写**：
1. **单卡的 `userReactionText`**：不写时，自动根据本轮判定结果（点赞推进 / 中性 / 踩雷警告 / 识破警告）从角色顶部的 `defaultReactions` 里取台词。
2. **每轮的 `customConfessionCard`（坦白卡）**：不写时，当玩家未解锁本轮所需能力，引擎自动生成默认坦白卡（方案词 `【承认不懂】`，预览 `超出了我的知识…`，正文 `对不起，这个问题我好像还不太懂……`）。
3. **思考链前半段的 `afterWarning` / `afterBluffCaught` / `whenDemandLocked`**：只写必填的 `normal` 即可，其余状态若不写，引擎会自动根据上一轮踩中的雷点名称或未解锁属性生成标准诊断独白。
