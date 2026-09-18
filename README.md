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
npm run build     # 编译所有 workspace
npm test          # 运行所有测试
```

环境要求:Node ≥ 20(开发环境为 v24)。复制 `.env.example` 为 `.env` 后按需修改;P0 阶段链上只使用 devnet。

## 仓库结构

```text
ODP/
├── docs/                  # 白皮书、开工令、架构文档
├── packages/
│   └── domain/            # [P0-1] 冻结的领域契约:7 个 schema、状态机、Merkle 分配格式
│       ├── src/           # schema + 纯函数(无 IO、无框架依赖)
│       ├── fixtures/      # ALLOW / WATCH / REJECT 项目 + Human fixtures
│       └── tests/         # schema 测试、状态机测试、守恒与 Merkle 测试
└── (后续)packages/web · packages/api · programs/distributor   # P0-2 之后逐步进入
```

## P0 门禁状态

证据状态只使用开工令第八节规定的词汇,不使用 DONE / READY 之类措辞。

| Gate | 范围 | 状态 |
|---|---|---|
| G0 Repo Baseline | repo / README / architecture / env example / build / test | PASS-LOCAL |
| G1 Domain Contract | 7 个冻结 schema + schema tests | PASS-LOCAL |
| G2 Passport Golden Fixture | ALLOW / WATCH / REJECT 三 fixture | IMPLEMENTED-OFFLINE(fixture 骨架已入库,规则引擎复现在 P0-2) |
| G3 Matching | 确定性 MatchResult + 解释 | NOT-STARTED |
| G4 Solana Distribution | deposit / root / claim / double-claim reject | NOT-STARTED |
| G5 End-to-End | Radar → Claim Confirmed 全链路 | NOT-STARTED |

## P0 明确不做

Protocol Token、DAO、DEX、Swap、Launchpad、KOL Marketplace、广告、Quest、Post-to-Earn、NFT 市场、多链、复杂推荐系统、AI Agent 集群、完整项目数据库、支付与真实商业收费。完整清单见开工令第二节。
