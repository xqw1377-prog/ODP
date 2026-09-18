# Open Distribution Protocol

## 开放式加密项目发现、信任与分发协议

**Whitepaper V0.1 — Draft**
**工作名称：Open Distribution Protocol / ODP**

---

# 0. 摘要

加密世界每天都有新的项目、协议、Token 和社区诞生。

但今天的项目分发机制存在一个根本错位：

一边是项目方。

他们需要真实用户、真实使用、真实社区和真实传播，却往往不得不购买流量、购买 KOL、购买任务、购买排名，并承担大量无法验证的营销成本。

另一边是用户。

他们希望更早发现真正有价值的项目，却被垃圾项目、虚假营销、机器人内容、女巫账户和付费传播淹没。

结果是：

**项目找不到真正的用户。**

**真正的用户找不到值得参与的项目。**

**平台则不断从双方之间的信息不对称和连接成本中抽取价值。**

Open Distribution Protocol 希望重新设计这一关系。

ODP 不是一个传统空投平台，也不是一个 Quest 平台、广告平台、KOL 平台或 Launchpad。

ODP 是一个开放的：

# **Discovery + Trust + Matching + Distribution Protocol**

协议首先主动发现项目；

然后持续审计项目；

建立公开、可验证、动态变化的 Project Trust Profile；

再根据用户的真实身份、链上行为、兴趣、历史贡献和社会关系，将合适的项目与合适的人匹配；

最后通过链上协议完成资产和机会的透明分发。

ODP 的基本原则是：

> **项目不是待宰的广告主。**
>
> **用户不是被出售的流量。**
>
> **项目和用户都是网络参与者。**
>
> **协议负责建立信任、完成匹配，并公平执行分发。**

最终，我们希望建立一张持续成长的：

# **Human × Project Distribution Graph**

让优秀项目能够找到真正适合它的人。

让真实的人能够更早发现值得参与的项目。

让资产和机会主动找到人，而不是让人每天追逐新的 Token。

---

# 1. 问题

## 1.1 项目方的问题

一个新项目真正需要的是：

* 第一批真实用户；
* 第一批真实使用者；
* 第一批开发者；
* 第一批社区成员；
* 第一批能够理解项目的人；
* 第一批愿意主动传播的人。

但今天获取这些人的常见路径却是：

```text
项目
↓
支付营销预算
↓
购买 KOL / Quest / Campaign / 曝光
↓
大量激励行为
↓
获得关注、转发、钱包连接
↓
难以判断这些人是否真正成为用户
```

大量资源被消耗在“制造注意力”上，而不是“建立真实关系”上。

项目越早期，越容易成为流量平台和营销中介的高成本客户。

---

## 1.2 用户的问题

普通用户面对的是另一个极端：

```text
每天大量新项目
+
大量新 Token
+
大量 KOL 推荐
+
大量空投任务
+
大量机器人内容
+
大量付费传播
```

用户必须自己完成：

* 找项目；
* 判断真假；
* 分析团队；
* 检查合约；
* 判断 Token 风险；
* 判断是否是骗局；
* 判断项目是否真的有产品；
* 判断自己是否值得花时间。

信息成本极高。

这导致真正优秀的早期项目和真正优质的用户之间，仍然存在巨大的发现鸿沟。

---

# 2. ODP 的核心命题

ODP 不把问题定义成：

> 如何更高效地发 Token？

而定义成：

> **如何发现值得参与的项目，并把它们分发给真正适合的人？**

因此，ODP 的完整链路是：

```text
DISCOVER
发现项目
↓
AUDIT
建立信任
↓
MATCH
寻找合适的人
↓
DISTRIBUTE
链上执行分发
↓
LEARN
观察真实结果
↓
更新项目与人的信誉
```

其中：

**Distribution 是结果，不是起点。**

---

# 3. 协议第一性原则

## 3.1 Project Is Not a Customer

项目方不是单纯购买流量的客户。

项目进入网络时，本身就在贡献：

* Token；
* 产品；
* 用户机会；
* 新的资产；
* 新的技术；
* 新的社区；
* 新的叙事；
* 新的经济活动。

因此：

> **项目也是网络贡献者。**

---

## 3.2 Human Is Not Inventory

用户不是被出售给项目方的“DAU”“曝光量”或者“广告库存”。

每一个 Human Node 都拥有自己的：

* 身份；
* 社会关系；
* 链上历史；
* 兴趣；
* 信誉；
* 贡献；
* 分发权。

协议不能未经用户授权出售其身份和关系数据。

---

## 3.3 No Pay-to-Reach

ODP 原则上禁止：

> **因为一个项目向平台支付更多费用，就自动获得更多用户触达。**

资金不能购买：

* 更高 Trust；
* 更低风险提示；
* ALLOW 状态；
* 更高安全等级；
* 更优审计结果。

商业收入和信任判断必须分离。

---

## 3.4 No Token Can Buy Trust

一个项目拥有更多 Token、更多融资或者更高 FDV，并不意味着更值得被分发。

Trust 必须来源于证据。

---

## 3.5 Distribution Is Earned, Not Bought

项目获得分发能力，应更多来源于：

* 项目质量；
* 产品真实性；
* 安全性；
* 社区质量；
* 历史表现；
* 用户反馈；
* 对网络的长期贡献。

而不是营销预算。

---

# 4. 四个核心引擎

ODP 由四个核心系统构成：

```text
PROJECT DISCOVERY ENGINE
↓
PROJECT TRUST ENGINE
↓
HUMAN MATCHING ENGINE
↓
ONCHAIN DISTRIBUTION ENGINE
```

---

# 5. Project Discovery Engine

## 5.1 主动发现，而不是等待项目报名

ODP 不应成为一个“项目提交申请 → 平台招商”的被动系统。

协议需要持续主动发现新项目。

Discovery Sources 包括：

### Social Discovery

从 X 等公开社交网络发现：

* 新项目；
* 新产品；
* 新团队；
* 开发者讨论；
* 社区增长；
* 新叙事；
* 异常关注增长。

### On-chain Discovery

从链上发现：

* 新 Token；
* 新 Program / Contract；
* 新 Liquidity Pool；
* 新持有人增长；
* 新协议使用；
* 新资金行为；
* 新部署活动。

### Developer Discovery

从代码和开发活动发现：

* Repository；
* Contributors；
* Release；
* Commit Activity；
* Open-source Activity；
* Contract Deployment。

### Capital Discovery

识别：

* Foundation Grant；
* VC；
* Angel；
* Treasury；
* Known Wallet；
* Ecosystem Fund。

资金行为只作为信号，不作为项目可信的直接证明。

### Network Discovery

Human Node 可以推荐：

> “这个项目值得协议研究。”

但推荐本身不意味着项目获得准入。

---

# 6. Project Trust Engine

每一个进入 ODP 的项目，都建立一个持续更新的：

# **Project Passport**

它不是一次性的审核报告，而是项目长期存在于协议中的可信档案。

---

## 6.1 六维 Project Trust Profile

### TEAM

判断：

* 团队身份；
* 历史项目；
* 创始人历史；
* 已知恶意记录；
* 团队关系；
* 历史履约表现。

状态示例：

```text
VERIFIED
PARTIAL
UNVERIFIED
CAUTION
```

---

### PRODUCT

判断项目是否真正存在：

```text
IDEA
DEMO
TESTNET
LIVE
REVENUE
```

重点识别：

> Token 是否已经存在，但产品仍不存在。

---

### CODE

分析：

* GitHub 活跃度；
* Contributor；
* Commit；
* Release；
* Fork Ratio；
* Code Originality；
* Contract Verification；
* Dependency Risk；
* Audit Evidence。

---

### TOKEN

分析：

* Mint Authority；
* Freeze Authority；
* Upgrade Authority；
* Blacklist；
* Transfer Tax；
* Honeypot；
* Sell Restrictions；
* Supply；
* Circulation；
* Vesting；
* Team Allocation；
* Holder Concentration；
* LP；
* Treasury；
* Insider Cluster。

---

### ONCHAIN

持续监控：

* 团队钱包；
* Treasury；
* LP；
* Mint；
* Upgrade；
* Holder Movement；
* Insider Transfer；
* Wash Trading；
* Liquidity Removal；
* Abnormal Transaction；
* Concentrated Selling。

---

### SOCIAL

判断：

* Account Age；
* Follower Quality；
* Bot Ratio；
* Growth Curve；
* Engagement Authenticity；
* KOL Concentration；
* Copy Content；
* Paid Promotion；
* Community Discussion Quality。

---

# 7. 三状态项目门

ODP 不试图用复杂分数制造“87.3 分安全”这种假精确。

协议首先使用三个非常明确的状态：

# **ALLOW**

证据达到当前协议要求，可以进入分发网络。

# **WATCH**

存在价值，但证据不足或者存在需要进一步观察的风险。

不能获得大规模协议分发。

# **REJECT**

发现重大安全、欺诈、操纵或者不可接受风险。

禁止通过协议完成正常 Distribution。

---

# 8. Continuous Audit

项目审计不是：

```text
上线前检查一次
↓
永久通过
```

而是：

# **Continuous Trust**

例如：

```text
ALLOW
↓
团队钱包异常转出
↓
WATCH
↓
发现撤池 / 恶意 Mint / 高危 Upgrade
↓
REJECT
```

所有关键 Trust 状态变化，都应形成可验证的时间记录。

---

# 9. Human Identity Layer

用户进入协议的第一版体验应该极度简单：

```text
Continue with X
↓
Connect Wallet
↓
Build Distribution Identity
```

X 是早期社会身份入口，但 ODP 不应永久依赖单一中心化社交平台。

长期身份可以由：

```text
Social Identity
+
Wallet History
+
On-chain Activity
+
Network Relationship
+
Contribution History
+
Trust Signals
```

共同构成。

---

# 10. Human Distribution Identity

每一个用户拥有一个长期存在的：

# **Distribution Identity**

它至少包括：

### HUMAN

判断：

> 是否可能是一个真实、唯一、持续存在的人。

### REPUTATION

长期行为是否可信。

### NETWORK

是否带来了真实新的 Human Node。

### CONTRIBUTION

是否真正帮助过项目和网络。

### INTEREST GRAPH

这个 Human 更适合什么类型的项目。

### TRUST

是否存在：

* Sybil；
* Bot；
* Farming；
* Manipulation；
* Fake Engagement；
* Wallet Cluster。

---

# 11. 不以粉丝数决定分配

Followers 可以作为一个信号。

但绝不能直接成为财富权重。

例如：

```text
100 followers
100,000 followers
1,000,000 followers
```

不能形成线性 Token 分配差异。

ODP 应采用：

* logarithmic weighting；
* cap；
* follower quality；
* social graph quality；
* engagement authenticity。

避免协议演变成另一个 KOL 财富系统。

---

# 12. 不做 Post-to-Earn

ODP 不应鼓励：

```text
发一条推 = 获得 Token
转发 = 获得 Token
点赞 = 获得 Token
```

否则协议最终一定演变成：

# Spam-to-Earn

ODP 更关注：

# **Effective Contribution**

例如：

一个 Human 带来的：

* 新真实用户；
* 真实产品使用；
* 开发者；
* Community Contributor；
* 高质量讨论；
* 项目长期留存。

传播只是贡献的一种结果，而不是协议要求用户完成的机械任务。

---

# 13. Human × Project Matching Engine

一个优秀项目：

> 并不适合所有人。

因此，Project Trust 和 Project Matching 必须分开。

第一步回答：

> 这个项目值不值得进入？

第二步才回答：

> 它应该被分给谁？

例如：

```text
PROJECT

Type:
Solana DePIN

Potential Matching:

Solana Active
+
Early Adopter
+
DePIN Interest
+
Hardware User
+
High Trust
```

协议可以从：

```text
1,000,000 Humans
```

中找到：

```text
37,284 High Match Humans
```

而不是：

> 向所有人撒 Token。

---

# 14. Distribution Engine

项目通过 ALLOW 后，可以建立：

# **Distribution Vault**

例如：

```text
PROJECT ABC

Deposit:
10,000,000 ABC
```

资产进入标准化的协议 Vault / Distributor。

项目方不能在分发过程中随意修改用户已经获得的 Allocation。

所有规则必须在 Distribution 开始前可验证。

---

# 15. 分发原则

ODP V0.1 不冻结唯一分配公式。

但冻结以下原则：

## Base Human Right

必须存在面向真实 Human 的基础分配。

避免所有 Token 最终流向头部 KOL。

## Reputation Weight

长期可信节点可以获得更高权重。

## Network Contribution

带来真实新增 Human 和真实使用，可以获得额外权重。

## Project-Specific Matching

不同项目可以根据真实用户适配度调整 Allocation。

## Maximum Cap

任何单一社会影响指标必须设置上限。

防止鲸鱼化和 KOL 垄断。

---

# 16. Token Finds People

传统模型是：

```text
USER
↓
寻找空投
↓
做任务
↓
刷 Campaign
↓
等待分币
```

ODP 希望变成：

```text
PROJECT
↓
进入协议
↓
Trust Verification
↓
Human Matching
↓
Token Allocation
↓
用户被通知
```

即：

# **People don't hunt tokens.**

# **Good projects find the right people.**

---

# 17. Project Passport

每个项目拥有公开的长期档案：

```text
PROJECT PASSPORT

Project
FOO NETWORK

Protocol Status
ALLOW

Team
VERIFIED

Product
LIVE

Code
ACTIVE

Token
CAUTION

On-chain
HEALTHY

Social
ORGANIC

Distribution History
3

Humans Reached
41,284

Activated
7,981

Critical Incidents
0

Warnings
1

Last Evidence Update
2h ago
```

Project Passport 应逐步成为协议中最核心的公共资产之一。

---

# 18. Distribution Receipt

每次 Distribution 都应该产生可验证结果：

```text
PROJECT
↓
Allocation Rules
↓
Eligibility Snapshot
↓
Merkle / On-chain State
↓
Human Claim
↓
Receipt
```

任何人都可以验证：

* 发了多少；
* 分给多少人；
* 分配规则；
* 是否被修改；
* 项目是否履约；
* 协议是否正确执行。

---

# 19. 结果反馈

一次 Distribution 不应该在 Claim 后结束。

ODP 应继续观察：

```text
Claimed
↓
Used Product
↓
Held / Sold
↓
Stayed
↓
Invited Others
↓
Contributed
```

这些行为用于更新：

### Project Reputation

这个项目是否创造了真实价值。

### Human Reputation

这个 Human 是否是真实使用者和长期贡献者。

于是每一次 Distribution 都会让下一次 Distribution 更准确。

---

# 20. Network Flywheel

ODP 的网络效应来自：

```text
更多真实 Human
↓
更强 Matching
↓
更好的项目愿意进入
↓
更多高质量资产与机会
↓
更多真实用户加入
↓
更多行为数据
↓
Trust Engine 更准确
↓
Matching 更准确
↓
更好的项目进入
```

长期护城河不是单一智能合约。

而是：

# **Human × Project Distribution Graph**

---

# 21. 商业模型

ODP 的商业模式必须服从一个前提：

> **不能把项目方重新变成待宰的广告主。**

可能收入包括：

### Infrastructure Fee

企业级 Distribution Infrastructure。

### Gas Sponsorship Infrastructure

项目可以承担用户的链上 Claim 成本。

### Enterprise API

向：

* Wallet；
* Exchange；
* Launchpad；
* Protocol；
* Application；

提供 Trust / Discovery / Matching API。

### Project Intelligence

提供更深的项目与分发分析能力。

### Advanced Distribution Infrastructure

为大型项目提供规模化技术服务。

但：

# 付费不能改变 Trust 判断。

---

# 22. 为什么暂时不发行平台 Token

ODP V0.1：

# **NO PROTOCOL TOKEN REQUIRED**

原因很简单。

如果网络还不存在，就先发行平台 Token：

```text
Token Incentive
↓
Farmers
↓
Bots
↓
Fake Activity
↓
虚假的网络繁荣
```

这会污染最核心的 Human Graph。

ODP 首先应该建立：

# Distribution Power

它是信誉和分发能力。

不能自由购买。

不能因为拥有更多平台资产而直接增加 Token Allocation。

---

# 23. 如果未来存在 DAO Token

必须明确区分：

```text
Distribution Power
=
分发与信任权

DAO Token
=
协议治理权
```

协议治理资产不能直接购买 Human Reputation。

未来任何 DAO 也不能简单通过投票：

> 将高风险项目投成“安全项目”。

治理权与事实判断必须隔离。

---

# 24. Anti-Sybil

ODP 的最大系统级挑战之一，是：

# Human Uniqueness

不能简单依靠：

```text
1 X Account
=
1 Human
```

需要组合：

* Social graph；
* Account history；
* Wallet graph；
* Wallet age；
* transaction pattern；
* device/risk signal；
* referral relationship；
* behavioral consistency；
* cluster detection。

协议关注的不是：

> 绝对证明“这个人是谁”。

而是：

> **这个节点作为一个独立 Human Node 的可信度有多高。**

---

# 25. Safety Layer

进入 ODP 并不意味着：

> 项目绝对安全。

ODP 提供的是：

# Evidence-based Trust

而不是投资保证。

所有 Passport 都应该明确：

* Evidence；
* Unknown；
* Warning；
* Risk；
  -更新时间。

协议不能把概率判断包装成绝对安全承诺。

---

# 26. Solana Implementation

ODP 第一版优先考虑 Solana 作为 Distribution Execution Layer。

原因不是品牌绑定，而是协议天然存在：

* 大规模 Human；
* 大规模 Allocation；
* 高频 Trust Update；
* 大量 Claim；
* 小额 Token Distribution；
* Distribution Receipt；

需要：

* 低成本；
* 高吞吐；
* 快速确认；
* 大量微型链上操作。

---

# 27. Solana V0.1 Architecture

第一版只需要完成：

```text
PROJECT
↓
Distribution Vault
↓
Distribution Manifest
↓
Eligible Human Snapshot
↓
Merkle Allocation
↓
Claim Program
↓
Distribution Receipt
```

链下负责：

* Discovery；
* AI Audit；
* Social analysis；
* Matching；
* Reputation calculation。

链上负责：

* Asset custody；
* Distribution rule commitment；
* Allocation root；
* Claim execution；
* receipt；
* immutable evidence。

---

# 28. 黑客松 Golden Path

ODP 第一阶段不追求完成整个愿景。

只完成一个真实闭环：

# **DISCOVER ONE**

# **AUDIT ONE**

# **MATCH HUMANS**

# **DEPOSIT TOKEN**

# **CLAIM ON SOLANA**

完整 Demo：

```text
1.
AI 主动发现一个新 Crypto Project

2.
生成 Project Passport

3.
协议给出：
ALLOW / WATCH / REJECT

4.
ALLOW Project 创建 Distribution

5.
Deposit Token on Solana

6.
系统从 Human Graph 中匹配合适用户

7.
用户 X 登录 + Wallet

8.
看到：
“Why you were selected”

9.
Claim

10.
Solana Confirmation

11.
生成 Distribution Receipt
```

只要这条链路真实运行，V0.1 即成立。

---

# 29. V0.1 明确不做

为了避免项目失控，第一阶段不做：

* DEX；
* Swap；
* Exchange；
* Launchpad；
* Meme Trading；
* Prediction Market；
* 通用 Social App；
* KOL Marketplace；
* 广告竞价；
* Pay-to-Reach；
* Post-to-Earn；
* 复杂 DAO；
* Protocol Token。

---

# 30. 第一阶段真正要证明的五件事

ODP V0.1 只验证：

### 01

协议能不能主动发现值得关注的新项目。

### 02

协议能不能形成有用的 Project Passport。

### 03

协议能不能过滤掉明显不值得分发的项目。

### 04

协议能不能找到更适合项目的真实 Human。

### 05

协议能不能在 Solana 上完成透明、不可篡改的真实 Distribution。

---

# 31. 长期愿景

如果 ODP 最终建立数百万 Human Node 和大量 Project Passport：

协议拥有的就不再只是：

> 一个空投平台。

而是一张：

# **Global Crypto Distribution Graph**

它能够回答：

```text
什么项目值得关注？
什么项目值得进入？
什么人适合这个项目？
什么机会应该分给谁？
什么分发产生了真实价值？
```

未来 Distribution 的内容也不局限于 Token。

可以包括：

* Token；
* NFT；
* Allowlist；
* Early Access；
* Governance Right；
* Developer Grant；
* Testnet Access；
* Product Credit；
* Community Role；
* Physical Benefit。

ODP 最终分发的是：

# **Opportunity**

---

# 32. 协议宪法

ODP V0.1 冻结以下原则：

### I

**Project is not a customer.**

### II

**Human is not inventory.**

### III

**No Pay-to-Reach.**

### IV

**No Token Can Buy Trust.**

### V

**Trust Must Be Evidence-Based.**

### VI

**Distribution Must Be Verifiable.**

### VII

**Reputation Cannot Be Directly Purchased.**

### VIII

**Good Projects Deserve Better Distribution.**

### IX

**Real Humans Deserve Better Opportunities.**

### X

**The Protocol Serves the Network, Not the Other Way Around.**

---

# 33. 最终定义

Open Distribution Protocol 不是帮助项目“把币发出去”。

我们要解决的是：

> **每天都有新的项目、新的资产和新的机会诞生，谁值得被发现，谁值得被信任，以及这些机会最终应该到达谁。**

因此：

# **We don't distribute tokens.**

# **We discover value, establish trust, and distribute opportunity.**

中文：

# **不是把币发出去。**

# **而是发现价值、建立信任、把机会分给真正适合的人。**

---

**Open Distribution Protocol**

**Discover → Trust → Match → Distribute**

**Good projects find the right people.**
