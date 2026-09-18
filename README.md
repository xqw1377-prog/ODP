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
│   ├── matching-engine/    # [P0-3] Project × Human 确定性匹配:ALLOW 硬门 + 四因子打分 + Risk 阻断 + 可解释 reasons
│   │   ├── src/            # intent 契约 / humans 装载 / matcher
│   │   ├── fixtures/       # intents/(项目匹配意图) humans/(三个 Human fixture,真 devnet pubkey)
│   │   ├── scripts/        # demo-matching(打印 G3 固定演示排名)
│   │   └── tests/
│   └── distribution-engine/ # [P0-4] 链下分配策略(top-N 等额)+ canonical manifest + Merkle 向量 + Solana 客户端脚本
│       ├── src/            # base58 / policy / manifest
│       ├── fixtures/       # keys/(devnet pubkey 清单,无私钥)
│       ├── scripts/        # gen-demo-keys / gen-merkle-vector / localnet-e2e(可指向 devnet)
│       └── tests/
│   └── web/                # [P0-5] 黑客松演示层:4 场景 UI + Demo Wallet 认领服务器(私钥只在本地服务器)
│       ├── src/            # demo-data(真实 pipeline 桥接)/ claim(演示钱包签名)/ server
│       ├── public/         # index / app / style(纯展示,数据全部来自 API)
│       ├── scripts/        # demo:prepare(fresh id → … → OPEN CLAIMS,止步 READY TO CLAIM)
│       └── tests/          # demo-data 真实输出断言 + server smoke
├── programs/
│   ├── merkle-vector/      # [P0-4] TS↔Rust 跨语言 test vector(零依赖 Rust,CI 强制)——MERKLE-WIRE-FORMAT = FROZEN-V1
│   └── distributor/        # [P0-4] Anchor 程序:vault / root / claim / 防双领;§21 矩阵跑真实 SBF 产物
└── (后续)packages/api      # P1 之后按需
```

### 现场演示(P0-5)

```bash
cd packages/web
npm run demo:prepare   # 真实 Devnet:fresh distribution → fund → commit root → open claims(止步 READY TO CLAIM)
npm run dev            # 打开 http://127.0.0.1:3000/radar
```

四场景:`/radar`(Discover)→ `/project/aurora`(Trust)→ `/distribution/aurora`(Match + Distribute)→ `/claim/maya`(现场点击 Claim on Solana,真实 Devnet 交易 + Receipt)。演示密钥仅存在于本地服务器的 `.odp/devnet-keys/`,永不进入浏览器。

## P0 门禁状态

证据状态只使用开工令第八节规定的词汇,不使用 DONE / READY 之类措辞。

| Gate | 范围 | 状态 |
|---|---|---|
| G0 Repo Baseline | repo / README / architecture / env example / build / test | PASS-LOCAL |
| G1 Domain Contract | 7 个冻结 schema(strict)+ 派生裁决锁 + 状态一致性 + schema tests | PASS-LOCAL(P0-1R/R2 修订后) |
| G2 Passport Golden Fixture | candidate+evidence → 独立生成 → 三态复现 + 持久化 + 读模型 + 引用完整性锁 | PASS-LOCAL(PASSPORT PIPELINE = PASS-FIXTURE;P0-2R 修订后) |
| G3 Matching | 确定性 MatchResult + 解释(ALLOW 硬门 / Risk 阻断 / 四因子公式) | PASS-LOCAL(MATCHING PIPELINE = PASS-FIXTURE) |
| G4 Solana Distribution | Merkle FROZEN-V1 + Anchor 程序 + §21 矩阵 | PASS-DEVNET([devnet evidence 003](docs/devnet-evidence-dst_aurora_devnet_003.md)) |
| G5 End-to-End | Radar → Passport → Match → Maya 真实 Claim → Receipt(浏览器全流程) | PASS-E2E(本地演示服务 + 真实 Devnet 交易) |

## P0 明确不做

Protocol Token、DAO、DEX、Swap、Launchpad、KOL Marketplace、广告、Quest、Post-to-Earn、NFT 市场、多链、复杂推荐系统、AI Agent 集群、完整项目数据库、支付与真实商业收费。完整清单见开工令第二节。
