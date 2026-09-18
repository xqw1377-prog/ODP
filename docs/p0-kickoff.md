# ODP · Zcode 第一阶段开工令

项目：**Open Distribution Protocol**
阶段：**P0 / Hackathon Golden Path**
执行角色：**Zcode**
统筹与验收：**Commander**

---

## 一、当前唯一目标

不要实现完整 ODP。

第一阶段只证明一条真实闭环：

# Discover → Audit → Match → Deposit → Claim

即：

1. 系统发现一个项目
2. 生成 Project Passport
3. 给出 ALLOW / WATCH / REJECT
4. 为 ALLOW 项目生成目标 Human 集合
5. 项目在 Solana 存入 Token
6. 生成 Allocation
7. 用户连接身份与钱包
8. 用户 Claim
9. Solana 链上确认
10. 生成 Distribution Receipt

除此之外全部 HOLD。

---

# 二、P0 禁止扩展项

本阶段明确禁止：

* Protocol Token
* DAO
* DEX
* Swap
* Launchpad
* KOL Marketplace
* 广告系统
* Quest
* Post-to-Earn
* NFT 市场
* 多链
* 复杂推荐系统
* 完整 AI Agent 集群
* 完整项目数据库
* 支付系统
* 真实商业收费

如果某项能力不能直接服务 Golden Path，则不进入 P0。

---

# 三、P0 系统结构

第一版只允许五个模块：

## 1. Discovery

输入一个公开 Crypto 项目来源。

P0 可以：

* 手工 seed 项目；
* X / 官网 / GitHub / 链上数据半自动抓取；
* 使用固定 fixture。

但界面与数据结构必须按照未来自动 Discovery 设计。

输出：

```text
ProjectCandidate
```

最低字段：

```text
project_id
name
symbol
website
x_account
github
chain
token_address
discovered_at
discovery_sources[]
```

---

## 2. Project Passport

建立六维结构：

```text
TEAM
PRODUCT
CODE
TOKEN
ONCHAIN
SOCIAL
```

每维输出：

```text
status
evidence[]
warnings[]
unknowns[]
updated_at
```

禁止只有一个总分。

项目总状态只允许：

```text
ALLOW
WATCH
REJECT
```

并且必须可以说明：

> 为什么是这个状态。

P0 可以使用规则引擎，不要求真正的完整 AI 审计。

---

## 3. Human Identity + Matching

P0 用户只需要：

```text
X identity
+
Solana wallet
```

允许使用 fixture / mock X profile。

必须保留未来真实 OAuth 接口边界。

Human Profile 最低字段：

```text
human_id
x_id
wallet
human_confidence
reputation
network_score
interest_tags[]
risk_flags[]
```

Matching 输出：

```text
project_id
human_id
match_score
match_reasons[]
```

前端必须展示：

# Why you were selected

不得只显示一个黑盒分数。

---

## 4. Solana Distribution

这是 P0 最重要的真实链上部分。

至少实现：

```text
Create Distribution
↓
Deposit SPL Token
↓
Commit Allocation Root
↓
Claim
↓
Prevent Double Claim
↓
Receipt
```

第一版可以使用：

```text
Merkle Distribution
```

建议结构：

```text
Distribution
- project
- token_mint
- vault
- allocation_root
- total_amount
- total_recipients
- status
```

Claim 必须验证：

```text
wallet
amount
proof
distribution_id
```

需要防止：

```text
double claim
wrong wallet
wrong amount
wrong proof
wrong distribution
```

---

## 5. Distribution Receipt

Claim 完成之后必须产生：

```text
DistributionReceipt
```

包含：

```text
project
distribution_id
wallet
amount
token
claim_tx
claimed_at
allocation_root
```

最终 Demo 必须能从 Receipt 跳到 Solana Explorer 或等价链上证据。

---

# 四、P0 用户页面

不要做后台大系统。

只做 4 个核心页面。

## Page 1 — Project Radar

展示：

```text
DISCOVERED
WATCH
ALLOW
REJECT
```

重点不是数量。

重点是让评委看到：

> 系统正在发现项目。

---

## Page 2 — Project Passport

核心页面。

展示：

```text
Project
Status: ALLOW

TEAM       VERIFIED
PRODUCT    LIVE
CODE       ACTIVE
TOKEN      HEALTHY
ONCHAIN    HEALTHY
SOCIAL     ORGANIC
```

下面展示：

```text
Evidence
Warnings
Unknowns
```

必须做到：

> 一眼知道这个项目为什么值得进入。

---

## Page 3 — Distribution

项目：

```text
Deposit 1,000,000 TOKEN
```

显示：

```text
Matched Humans
Allocation
Distribution Root
Vault
```

然后：

```text
Launch Distribution
```

---

## Page 4 — Human Claim

用户看到：

```text
A NEW PROJECT FOUND YOU
```

显示：

```text
Project
Project Passport
Allocation
Why you were selected
```

然后：

```text
Claim
```

Claim 成功后：

```text
CONFIRMED
TX
RECEIPT
```

---

# 五、P0 Demo 固定脚本

最终必须能够连续演示：

```text
STEP 1
Project Radar 发现 Project A

STEP 2
打开 Project Passport

STEP 3
系统显示：
ALLOW

STEP 4
项目创建 Distribution

STEP 5
Deposit SPL Token

STEP 6
系统匹配若干 Humans

STEP 7
User 登录 / Connect Wallet

STEP 8
看到：
Why you were selected

STEP 9
点击 Claim

STEP 10
Solana tx confirmed

STEP 11
Distribution Receipt 出现
```

整条 Demo 不允许中途跳脚本或人工改数据库。

---

# 六、P0 工程门禁

## G0 — Repo Baseline

必须有：

* repo
* README
* architecture
* env example
* build command
* test command

未完成：

```text
NO-GO
```

---

## G1 — Domain Contract

以下 schema 冻结：

```text
ProjectCandidate
ProjectPassport
HumanProfile
MatchResult
Distribution
Allocation
DistributionReceipt
```

必须有 schema test。

未冻结：

```text
NO-GO
```

---

## G2 — Passport Golden Fixture

至少准备：

```text
1 ALLOW
1 WATCH
1 REJECT
```

三个项目 fixture。

必须能够稳定复现。

---

## G3 — Matching

至少：

```text
3 Human profiles
1 Project
```

输出确定性 MatchResult。

必须解释 match reason。

---

## G4 — Solana Distribution

真实完成：

```text
deposit
root commit
claim
double claim reject
```

所有链上 tx 必须保留证据。

---

## G5 — End-to-End

从：

```text
Project Radar
```

一直走到：

```text
Claim Confirmed
```

全链路通过。

---

# 七、测试要求

最低必须覆盖：

```text
Project Passport state transition
ALLOW / WATCH / REJECT

Invalid evidence handling

Matching deterministic output

Allocation total conservation

Invalid Merkle proof rejection

Wrong wallet rejection

Wrong amount rejection

Double claim rejection

Vault balance conservation

Receipt correctness
```

禁止只测 UI。

---

# 八、证据规则

任何状态只允许：

```text
NOT-STARTED
IMPLEMENTED-OFFLINE
PASS-LOCAL
PASS-DEVNET
PASS-E2E
```

禁止使用：

```text
DONE
READY
PRODUCTION READY
SECURE
AI AUDITED
```

除非证据真的达到对应程度。

---

# 九、提交给 Commander 的每轮报告格式

每轮只报告：

## 1. 本轮完成

具体文件 / commit / capability。

## 2. 证据

测试结果、tx、截图、日志。

## 3. 未完成

明确写出来。

## 4. 风险

不能隐藏。

## 5. 下一门

说明下一步要过哪个 Gate。

禁止用“基本完成”“差不多”“应该没问题”。

---

# 十、P0 成功标准

第一阶段成功不等于：

> ODP 已经成立。

只意味着：

```text
ODP-GOLDEN-PATH = PASS
```

必须同时满足：

```text
Project discovered
Project Passport generated
ALLOW/WATCH/REJECT reproducible
Human matching explainable
Token deposited on Solana
Allocation committed
Real wallet claimed
Double claim blocked
Receipt generated
Full demo reproducible
```

缺任何一项：

```text
ODP-GOLDEN-PATH != PASS
```

---

# 十一、现在立即执行

按以下顺序：

```text
P0-0 Repo Baseline
↓
P0-1 Domain Contract
↓
P0-2 Project Passport
↓
P0-3 Human Matching
↓
P0-4 Solana Distributor
↓
P0-5 Claim
↓
P0-6 Receipt
↓
P0-7 Golden Path
```

第一步不要写大量业务代码。

先提交：

# **P0-0 + P0-1**

即：

* repo baseline
* architecture
* domain schema
* state machine
* test skeleton
* fixtures skeleton

完成后停止，交 Commander 验收。

**未经门禁，不进入 P0-2。**
