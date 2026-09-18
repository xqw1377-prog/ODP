# ODP 架构说明(P0)

本文档描述 P0 / Golden Path 阶段的系统结构、冻结的领域契约,以及各状态机的精确定义。

## 1. 系统数据流

```text
┌────────────────────────── Off-chain(链下)──────────────────────────┐
│                                                                      │
│  Discovery Engine          Trust Engine            Matching Engine  │
│  ────────────────          ─────────────           ──────────────── │
│  social / onchain /        Project Passport        Human Profile     │
│  developer / capital /     六维证据 + 规则聚合       Interest Graph   │
│  network 来源              ALLOW/WATCH/REJECT      MatchResult      │
│        │                        │                        │          │
│        ▼                        ▼                        ▼          │
│  ProjectCandidate ──────▶ ProjectPassport ──────▶ Allocation 集合    │
│                                                    (Merkle root)    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ deposit + root commit
┌──────────────────────────────▼───────────────────────────────────────┐
│                        On-chain(Solana, P0-4)                        │
│  Distribution Vault → Allocation Root Commit → Claim Program          │
│  (防 double claim / 错钱包 / 错金额 / 错 proof) → Distribution Receipt │
└───────────────────────────────────────────────────────────────────────┘
```

职责边界:

- **链下**负责发现、审计、匹配、信誉计算(可进化为 AI,但输出必须落到冻结 schema)。
- **链上**负责资产托管、规则承诺(allocation root)、claim 执行、不可篡改证据。

## 2. 模块地图

| 模块 | 位置 | 阶段 | 说明 |
|---|---|---|---|
| Domain Contract | `packages/domain` | P0-1(已验收) | 7 个冻结 schema + 状态机 + Merkle 分配格式,纯函数零 IO |
| Passport Engine | `packages/passport-engine` | **P0-2(本轮)** | Trust Pipeline:发现输入 → 证据组装 → 派生裁决 → 校验持久化 → Radar/Detail 读模型。证据成熟度 = FIXTURE |
| Matching 引擎 | `packages/api`(待建) | P0-3 | 确定性打分 + match_reasons |
| Solana Distributor | `programs/distributor`(Anchor,待建) | P0-4 | vault / root / claim / 防重复 claim |
| Web(4 页面) | `packages/web`(待建) | P0-2~P0-6 | Radar / Passport / Distribution / Claim |
| 存储 | `ODP_DATA_DIR` 文件型 JSON | P0 | 双向 schema 校验 + 原子写;接口按可替换设计 |

## 3. 冻结的领域契约(G1)

七个 schema 定义于 `packages/domain/src`,任何模块不得私改字段名。**所有 schema 均为 strict:未知字段直接拒绝,不允许静默 strip**(例如混入 `magic_trust_score` 会被 REJECT)。

| Schema | 关键字段 | 说明 |
|---|---|---|
| `ProjectCandidate` | project_id, name, symbol, website, x_account, github, chain, token_address, discovered_at, discovery_sources[] | 发现层输出;discovery_sources ∈ social/onchain/developer/capital/network |
| `ProjectPassport` | project_id, dims{TEAM,PRODUCT,CODE,TOKEN,ONCHAIN,SOCIAL}, status, reasons[], status_history[], updated_at | 每维:`status + evidence[] + warnings[] + unknowns[] + updated_at`;总状态只允许 ALLOW/WATCH/REJECT |
| `HumanProfile` | human_id, x_id, wallet, human_confidence, reputation, network_score, interest_tags[], risk_flags[] | P0 身份 = X identity + Solana wallet;OAuth 边界已预留 |
| `MatchResult` | project_id, human_id, match_score, match_reasons[] | match_reasons 至少 1 条,禁止黑盒分数 |
| `Distribution` | distribution_id, project_id, token_mint, vault, allocation_root, total_amount, total_recipients, status | 金额一律使用 **canonical base-10 字符串**(u64),禁用浮点 |
| `Allocation` | distribution_id, human_id, wallet, amount | Merkle 叶子由此派生 |
| `DistributionReceipt` | project_id, distribution_id, wallet, amount, token_mint, claim_tx, claimed_at, allocation_root | claim 完成后生成,必须可跳转链上证据 |

## 4. Passport 状态机

### 4.1 状态词表(每维)

| 维度 | 状态集合 |
|---|---|
| TEAM | VERIFIED · PARTIAL · UNVERIFIED · CAUTION · MALICIOUS |
| PRODUCT | MISSING · IDEA · DEMO · TESTNET · LIVE · REVENUE |
| CODE | NONE · UNVERIFIED · STALE · ACTIVE · AUDITED |
| TOKEN | HEALTHY · CAUTION · MALICIOUS |
| ONCHAIN | HEALTHY · WATCH · ABNORMAL · MALICIOUS |
| SOCIAL | ORGANIC · MIXED · BOT_HEAVY · FAKE |

### 4.2 聚合规则:derivePassportRuling(单一事实源)

裁决逻辑只存在于 `passport-policy.ts` 的 `derivePassportRuling(dims)`,由 `ProjectPassportSchema`(superRefine)、`buildPassport`、`reassessPassport` 三方共同调用,规则不允许有任何副本。规则(确定性,按序短路):

```text
1. FATAL  → REJECT   TEAM=MALICIOUS ∣ TOKEN=MALICIOUS ∣ ONCHAIN=MALICIOUS ∣ SOCIAL=FAKE
2. WARN   → WATCH    任何维度存在 warnings[](P0 保守规则)
3. SHORT  → WATCH    未达 ALLOW 基线:
                     TEAM ≥ PARTIAL
                     PRODUCT ≥ TESTNET
                     CODE ∈ {ACTIVE, AUDITED}
                     TOKEN = HEALTHY
                     ONCHAIN = HEALTHY
                     SOCIAL = ORGANIC
4. NO_EVIDENCE → WATCH   任何一个维度 evidence=[](Trust Must Be Evidence-Based,
                     状态主张没有证据不产生 ALLOW;reason 形如 NO_EVIDENCE: TOKEN)
5. 其余   → ALLOW
```

每一步的命中维度都写入 `reasons[]`,满足"必须可以说明为什么是这个状态"。`unknowns[]` 只展示、不参与裁决。

### 4.3 状态迁移:reassess,而非 transition

**协议宪法级约束:状态必须由证据产生,不能由调用者指定。**

**Derivation Lock(P0-1R2)**:`ProjectPassportSchema` 在 schema 层强制

```text
passport.status  === derivePassportRuling(passport.dims).status
passport.reasons === derivePassportRuling(passport.dims).reasons   // 逐项 + 顺序
```

因此伪造裁决的 Passport 对象在领域契约层不存在——不能花钱改、不能管理员改、不能 API 调用者改、不能数据库手写改、不能 JSON 导入改。不存在 `transitionPassport(passport, status)` 这类直接改总状态的 API。唯一的改判入口是:

```text
reassessPassport(previous, nextDims, reason, at)
  → nextStatus = derivePassportRuling(nextDims)   // 强制重新聚合
  → dims / status / reasons / status_history / updated_at 一次性更新
```

- 提交的是新证据,不是新状态;持久化的 Passport 永远不会与六维事实自相矛盾。
- 降级与恢复都只能由证据变化驱动(ALLOW→WATCH→REJECT 或反向);P0 没有绕开 dims 的申诉通道。
- 聚合结果不变时,history 不追加(dims/updated_at 照常刷新)。
- 状态真正变化时追加 `{from, to, reason, at}`,schema 层强制:history 首项 from=DISCOVERED、末项 to=当前状态、链路连续。

## 5. Distribution 状态机

```text
PENDING_DEPOSIT ──DEPOSIT_CONFIRMED──▶ DEPOSITED ──ROOT_COMMITTED──▶ COMMITTED
COMMITTED ──CLAIMS_OPENED──▶ LIVE ──CLOSED──▶ CLOSED
```

事件携带的副作用:

| 事件 | 合法来源态 | 写入字段 |
|---|---|---|
| `DEPOSIT_CONFIRMED{vault, deposit_tx}` | PENDING_DEPOSIT | vault, deposit_tx |
| `ROOT_COMMITTED{allocation_root, total_recipients}` | DEPOSITED | allocation_root(64 hex), total_recipients ≥ 1 |
| `CLAIMS_OPENED` | COMMITTED | — |
| `CLOSED` | LIVE | closed_at |

非法事件直接抛错(不允许跳步),保证"所有规则在分发开始前可验证"。

## 6. Merkle 分配格式

**MERKLE-WIRE-FORMAT = PROVISIONAL(非 FROZEN)。** 在 TypeScript 与 Rust/Solana 实现就以下跨语言 test vector 完全一致(leaf bytes / leaf hash / tree root / proof / verification result)之前,不得宣称冻结;此项必须在 P0-4 / G4 前完成。当前保留 SHA-256——在没有链上实测 CU 数据之前不更换哈希算法。

- **叶子**:`sha256(UTF8(distribution_id + "\n" + wallet + "\n" + amount))`。amount 使用 canonical 字符串,不含小数点与 leading zeros。distribution_id 进叶子以阻止跨分发重放 proof。
- **建树**:叶子先按 `Buffer.compare` 排序(输入顺序不影响 root),两两哈希;**节点哈希对两个子哈希先排序再拼接**(`sha256(sort(a,b))`),因此验证无需方向位;奇数个节点时末节点原样上提。
- **约束**:重复叶子(同 wallet+amount)建树时抛错;proof 验证失败、wallet/amount 不匹配均拒绝。

## 7. 金额与 ID 约定

- 所有 token 数量为 canonical base-10 整数字符串:正则 `^\d+$`、无 leading zeros,且 **≤ 2^64-1(u64 上界)**。
- `Distribution.total_amount`、`Allocation.amount`、Receipt `amount` 额外要求 **> 0**(PositiveU64String)——u64 类型边界与"业务必须为正"是两个独立关注点。
- 守恒检查:Σ allocation.amount === distribution.total_amount,不等即抛错。
- ID(`project_id` / `human_id` / `distribution_id`)为非空字符串,由生成方保证稳定。

## 8. 测试策略

| 测试域 | 覆盖点 | 位置 |
|---|---|---|
| Schema(G1) | 7 schema 解析 fixtures;非法字段/枚举/金额格式拒绝 | `domain/tests/schema.test.ts` |
| Passport(G1) | 三 fixture 聚合复现;派生锁(伪造 status/reasons/顺序);迁移写 history;聚合确定性 | `domain/tests/passport.test.ts` |
| Distribution(G1) | 合法事件链;非法跳步拒绝;分配守恒 | `domain/tests/distribution.test.ts` |
| Merkle(G1) | root 顺序无关;有效 proof 通过;错钱包/金额/proof 拒绝;重复叶子拒绝 | `domain/tests/distribution.test.ts` |
| Golden Path(G2) | candidate+evidence → 三态复现;与 golden 输出 deepEqual;同输入字节稳定;evidence fixture 不是 passport | `passport-engine/tests/pipeline.test.ts` |
| 证据边界(G2) | 缺维度证据→WATCH;malformed/跨维 finding/未知 finding/错配 project_id 拒绝 | `passport-engine/tests/pipeline.test.ts` |
| 重裁决(G2) | ALLOW→REJECT 带 history;不变证据不追加 history;REJECT→ALLOW 恢复 | `passport-engine/tests/pipeline.test.ts` |
| 持久化(G2) | 原子写 round-trip;伪造持久化文件读取失败;未知字段读取失败;path traversal 拒绝 | `passport-engine/tests/engine.test.ts` |
| 读模型(G2) | Radar 三态+过滤、reasons 来自持久化 passport;Detail 六维+provenance;孤儿 passport 报错 | `passport-engine/tests/engine.test.ts` |

链上层(double claim、vault balance conservation)在 P0-4 以 Solana 测试覆盖,此处不冒充。

## 9. Passport Engine(P0-2,证据成熟度 = FIXTURE)

Trust Pipeline 的唯一正式入口在 `packages/passport-engine`:

```text
ProjectCandidate(来自 DiscoverySource)
+
EvidenceBundle(原始 observation,含 findings + provenance)
↓
六维 Collector(TEAM/PRODUCT/CODE/TOKEN/ONCHAIN/SOCIAL)
  —— 只产生维度事实(status/evidence/warnings/unknowns),无权决定总状态
↓
PassportDims
↓
buildPassport / reassessPassport(domain 层,内部走 derivePassportRuling)
↓
ValidatedJsonStore 持久化(写入前 parse,读取后 parse,临时文件 + 原子 rename)
↓
Radar / Passport Detail 读模型(只从持久化数据派生,无第二套状态)
```

关键约束:

- **输入与输出分离**:`fixtures/discovery/`(候选)与 `fixtures/evidence/`(原始证据)是流水线仅有的输入;`fixtures/expected/` 的 golden passport 只用于输出比对,`scripts/regen-golden` 从原始输入幂等重生成。
- **EvidenceBundle 不是 PassportDims**:observation 携带机器可读 `findings`(枚举,维度归属强制),provenance(source/detail/url/at)逐条保留进维度 evidence;collector 对不属于自己的 finding 直接抛错。
- **证据成熟度**:`maturity ∈ {FIXTURE, SIMULATED, PUBLIC-SOURCE, ONCHAIN}`。当前全部 FIXTURE —— 只能宣称 `PASSPORT PIPELINE = PASS-FIXTURE`,不得宣称真实审计能力。
- **持久化防伪**:写前 `ProjectPassportSchema.parse()`、读后 `ProjectPassportSchema.parse()`(含派生锁)——数据库手改 / JSON 手改 / 部分写入都表现为 READ FAIL,而非静默接受;record id 白名单 `[a-z0-9][a-z0-9_-]{0,63}` 阻断 path traversal。
- **Discovery 边界**:仅实现 `FixtureDiscoverySource`;X API / GitHub API / Solana RPC / AI Agent 全部 HOLD,未来作为 `DiscoverySource` 接口的同形替换。

## 10. 预留边界(P0 不实现,但契约已留位)

- `ODP_HUMAN_SOURCE=fixture | x_oauth`:Human 身份来源开关,真实 X OAuth 是后续阶段的同形替换。
- `discovery_sources[]` 字段按未来自动 Discovery 设计,P0 用 seed/半自动/fixture 填充。
- Passport 聚合当前是规则引擎;未来 AI 审计输出必须落到同一六维 schema,不允许绕过状态机。
