# Open Distribution Protocol (ODP)

**Discover → Trust → Match → Distribute — Good projects find the right people.**

> **Token finds the human.** 黑客松 Golden Path 已全线闭合(G0–G5 PASS):真实浏览器 × 真实 Solana Devnet。

## Hackathon 提交包

| 材料 | 位置 |
|---|---|
| 3 分钟 Pitch / 演示脚本 | [docs/pitch.md](docs/pitch.md) |
| 提交页文案(一句话/描述/证据链接) | [docs/submission.md](docs/submission.md) |
| 现场演示稳定运行手册 | [docs/demo-runbook.md](docs/demo-runbook.md) |
| 浏览器点击 E2E 证据(最后一环) | [docs/browser-e2e-evidence-dst_aurora_demo_20260918150700.md](docs/browser-e2e-evidence-dst_aurora_demo_20260918150700.md) |
| Devnet 攻击矩阵证据(003) | [docs/devnet-evidence-dst_aurora_devnet_003.md](docs/devnet-evidence-dst_aurora_devnet_003.md) |
| 页面截图 | [docs/screenshots/](docs/screenshots) |

- 白皮书:[docs/whitepaper-v0.1.md](docs/whitepaper-v0.1.md)
- P0 开工令:[docs/p0-kickoff.md](docs/p0-kickoff.md)
- 架构说明:[docs/architecture.md](docs/architecture.md)

当前阶段:**P0 冻结(G0–G5 全 PASS),进入提交材料与现场演示。**

## Quickstart

```bash
npm install
npm run build       # 编译所有 workspace(先 domain 后依赖它的包)
npm run typecheck   # src + tests 全部过 tsc 静态类型门
npm test            # 运行所有测试
```

> 顺序注意:workspace 之间存在依赖(如 `@odp/passport-engine` → `@odp/domain` 的 dist 类型),请先 build 再 typecheck/test。

环境要求:Node ≥ 20(开发环境为 v24)。复制 `.env.example` 为 `.env` 后按需修改;P0 阶段链上只使用 devnet。

CI:GitHub Actions(Node 20)在每次 push / PR 上执行 `npm ci → build → typecheck → test`([ci.yml](.github/workflows/ci.yml))。**PASS-LOCAL 与 CI GREEN 分开记录。**

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
│   └── pilot/              # Pilot Enablement P0: project/human intake adapters + generic runner
│       ├── src/            # brief→passport/intent, Early Humans V0, opt-in persist, generic match→merkle inputs
│       ├── fixtures/       # Helios (non-Aurora) brief + synthetic opt-in humans
│       ├── scripts/        # pilot:intake-project / intake-human / run / smoke
│       └── tests/
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

真实试点登机门(不改引擎、不绑死 Aurora)见 [docs/pilot-enablement-p0.md](docs/pilot-enablement-p0.md):`npm run pilot:smoke`,网页 `/early-humans`。

## Vercel (`odp.mealkey.cn`)

`packages/web` 是自定义 `node:http` 演示服务器,不是 Next.js。Vercel 项目 **Root Directory 必须是仓库根**(不要设成 `packages/web`)。上次失败部署 (`dpl_7SG4D2N3YmK6AiWh5gQqmaKDG8Gj`) 就是在 `packages/web` 里跑了 `npm run build`/`tsc`,此时 sibling workspace(`@odp/pilot` 等)还没有 dist。

在 Vercel Project Settings → General 填:

| Setting | Value |
|---|---|
| **Framework Preset** | Node.js (`node`) — Function handler, **not** `listen()` |
| **Root Directory** | `.` (repository root, empty) |
| **Include files outside Root Directory** | on (default when Root = `.`) |
| **Install Command** | `npm install` |
| **Build Command** | `npm run build` |
| **Output Directory** | *leave empty* (not a static site) |
| **Node.js Version** | 20.x or 24.x |

`dpl_5zgSfrhw6osYg4AiUFaJvC66ff6x` 构建 READY 但全站 45s 零字节:部署类型是 **LAMBDAS**,根 `server.ts` 的 `listen(PORT)` 在 Lambda 里没有入站 TCP,请求永不 `res.end`。

正确入口是仓库根 `api/index.ts`:导出 `handleDemoRequest(req, res)`(Vercel Node Function)。`vercel.json` 把 `/(.*)` rewrite 到 `/api?odp_path=$1`。Aurora snapshot / Solana claim **懒加载**,`GET /api/pilot/tags` 与 `/early-humans` 不跑 `computeDemoSnapshot()`。本地 `npm run dev` 仍 `tsx src/server.ts`,绑 `127.0.0.1`。

如果仪表盘仍把 Root Directory 留在 `packages/web`,该目录下的 `vercel.json` / `api/index.ts` 同样走函数 + rewrite,并 `cd ../..` 安装/编译。

部署后公开路径:`/early-humans`(口号必须是 `Stop hunting. Get discovered.`)、`/api/pilot/tags`、`POST /api/pilot/humans`。

环境变量(Settings → Environment Variables, Production + Preview):

| Name | Value | Notes |
|---|---|---|
| `ODP_PILOT_DATA_DIR` | `/tmp/odp-pilot` | 试点 intake 可写目录。Vercel 除 `/tmp` 外只读;不设时 `VERCEL=1` 也会落到 `/tmp/odp-pilot`。**实例间不持久**,仅演示可靠。 |
| `ODP_PILOT_DIR` | (optional alias) | 旧名,次于 `ODP_PILOT_DATA_DIR` |

不要改 Passport / Matching / Merkle / Anchor / claim 规则。Aurora 四场景 UI 行为不变;公开 Early Humans 只依赖上述入口与可写 `/tmp`。

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
