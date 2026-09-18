# Open Distribution Protocol (ODP)

**Discover → Trust → Match → Distribute — Good projects find the right people.**

- 白皮书:[docs/whitepaper-v0.1.md](docs/whitepaper-v0.1.md)
- P0 开工令:[docs/p0-kickoff.md](docs/p0-kickoff.md)
- 架构说明:[docs/architecture.md](docs/architecture.md)

当前阶段:**P0 / Hackathon Golden Path**。唯一目标是跑通一条真实闭环:

```text
Discover → Audit (ALLOW/WATCH/REJECT) → Match → Deposit on Solana → Claim → Receipt
```

## Quickstart

```bash
npm install
npm run build       # 编译所有 workspace(先 domain 后依赖它的包)
npm run typecheck   # src + tests 全部过 tsc 静态类型门
npm test            # 运行所有测试
```

> 顺序注意:workspace 之间存在依赖(如 `@odp/passport-engine` → `@odp/domain` 的 dist 类型),请先 build 再 typecheck/test。

环境要求:Node ≥ 20(开发环境为 v24)。复制 `.env.example` 为 `.env` 后按需修改;P0 阶段链上只使用 devnet。

CI:GitHub Actions(Node 20)在每次 push / PR 上执行 `npm ci → typecheck → build → test`([ci.yml](.github/workflows/ci.yml))。**PASS-LOCAL 与 CI GREEN 分开记录。**

## 仓库结构

```text
ODP/
├── docs/                  # 白皮书、开工令、架构文档
├── packages/
│   ├── domain/            # [P0-1] 冻结的领域契约:7 个 schema、状态机、Merkle 分配格式
│   │   ├── src/           # schema + 纯函数(无 IO、无框架依赖)
│   │   ├── fixtures/      # ALLOW / WATCH / REJECT 项目 + Human fixtures
│   │   └── tests/         # schema 测试、状态机测试、守恒与 Merkle 测试
│   └── passport-engine/   # [P0-2] Trust Pipeline:发现输入 → 证据组装 → 派生裁决 → 校验持久化 → 读模型
│       ├── src/           # discovery / evidence / collectors / pipeline / store / readmodel / engine
│       ├── fixtures/      # discovery/(候选) evidence/(原始证据) expected/(golden 输出,仅比对用)
│       ├── scripts/       # regen-golden(从原始输入重生成 golden,幂等)
│       └── tests/         # G2 golden path、证据边界、重裁决、持久化与读模型测试
└── (后续)packages/web · packages/api · programs/distributor   # P0-3 之后逐步进入
```

## P0 门禁状态

证据状态只使用开工令第八节规定的词汇,不使用 DONE / READY 之类措辞。

| Gate | 范围 | 状态 |
|---|---|---|
| G0 Repo Baseline | repo / README / architecture / env example / build / test | PASS-LOCAL |
| G1 Domain Contract | 7 个冻结 schema(strict)+ 派生裁决锁 + 状态一致性 + schema tests | PASS-LOCAL(P0-1R/R2 修订后) |
| G2 Passport Golden Fixture | candidate+evidence → 独立生成 → 三态复现 + 持久化 + 读模型 | PASS-LOCAL(PASSPORT PIPELINE = PASS-FIXTURE) |
| G3 Matching | 确定性 MatchResult + 解释 | NOT-STARTED |
| G4 Solana Distribution | deposit / root / claim / double-claim reject | NOT-STARTED |
| G5 End-to-End | Radar → Claim Confirmed 全链路 | NOT-STARTED |

## P0 明确不做

Protocol Token、DAO、DEX、Swap、Launchpad、KOL Marketplace、广告、Quest、Post-to-Earn、NFT 市场、多链、复杂推荐系统、AI Agent 集群、完整项目数据库、支付与真实商业收费。完整清单见开工令第二节。
