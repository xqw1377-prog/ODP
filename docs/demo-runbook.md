# ODP · Demo Runbook(现场演示稳定运行手册)

目标:任何一次 3 分钟演示,从冷机到 `Claimed on Solana ✓` 全程可控、可恢复、可降级。

---

## A. 预检清单(演示前 30 分钟)

```bash
# 1. 仓库与构建(应全部通过)
git -C C:/Users/xqw13/ODP log --oneline -1        # 期望 ef4fede 或更新
cd C:/Users/xqw13/ODP && npm run build && npm test # 期望 163/163

# 2. Devnet 资金(演示的硬前提)
export PATH="/c/Users/xqw13/.odp-tools/solana-release/bin:$PATH"
solana --url devnet balance DfByZbaFZCh1nMsJwPCkLzMFjhC2FTnHE7SLobAvnzkF
# 期望 >= 0.6 SOL(每次 prepare ≈ 0.3;建议保留 2 次余量)
# Maya 钱包 >= 0.02 SOL(claim 费用+租金;prepare 会自动补足,但先确认)
solana --url devnet balance BGu7XoF86KA4hTJDoVFb4izKa23MZxsyrecJ9r4FNSS9

# 3. 程序在位(devnet,一次性;已部署则跳过)
solana --url devnet program show GRgiEJUGZxYzoQp7jJSvt4hZvv1AvojoC7Fgz2HyyFeW
# 期望:executable,Authority = DfBy…zkF
```

## B. 标准演示流程(现场 10 分钟前)

```bash
cd C:/Users/xqw13/ODP/packages/web
npm run demo:prepare      # fresh distribution → READY TO CLAIM(约 40-70 秒)
# 关键输出:READY TO CLAIM ✅ + distribution/vault/mint/root/manifest
npm run dev               # 默认 3000;浏览器打开 /radar
```

浏览器走查路径(照 pitch.md):
`/radar` → 点 Aurora Net → 点 Find the right people → 点 Open Maya's view →
**点 Claim on Solana** → 等 5-15 秒 → 页面自行变 `Claimed on Solana ✓`。

**纪律:点击后不要说话、不要动鼠标**,让确认的等待本身成为效果。

## C. 服务器日志(因果链取证)

demo server 会把 claim 打到 stdout;现场若被质疑可当场展示:

```text
[时间] POST /api/claim/maya -> 200 dist=<id> sig=<tx> receipt=<pda> maya_balance=5000
```

## D. 已知瞬态与对策

| 症状 | 原因 | 处置 |
|---|---|---|
| prepare/claim 报 `Blockhash not found` | 公共 devnet RPC 负载均衡 skew | 代码已内置最多 5 次重试(日志会打 retry 行);仍失败则等 30s 重跑 |
| claim 报 `InvalidProof` | 不应出现(root 已按真实 allocations 提交);出现即 bug | 立即换 fresh prepare,会后排查;勿现场 debug |
| claim 报 `AccountNotInitialized` | 旧版本残渣;当前 prepare 已建 claimant ATA | 同上 |
| 页面 409 `already claimed` | 同一 distribution 被点过 | 重跑 `demo:prepare` 换 fresh id |
| faucet/资金不足 | project < 0.6 SOL | 向 DfBy…zkF 转 devnet SOL 后重跑 |
| RPC 整体超时 | devnet 抖动 | 等 1-2 分钟;demo 无本地 validator 兜底(Windows symlink 限制),如实说明 |

## E. 现场故障降级顺序

1. **重试**:同页再点(若 404/网络类瞬时错误,按钮不会失效)。
2. **换新**:重跑 `demo:prepare`(新 id)→ 刷新 `/claim/maya` → 再点。
3. **兜底讲解**:打开
   [browser-e2e-evidence](browser-e2e-evidence-dst_aurora_demo_20260918150700.md)
   与 [devnet-evidence-003](devnet-evidence-dst_aurora_devnet_003.md),
   讲真实链上证据(Explorer 链接可点)。

## F. 演示后的留证(可选,评委要证据时)

```bash
grep "POST /api/claim/maya" <server 日志>          # 点击因果链
curl -s localhost:3000/api/claim/maya              # claimed=true + balance
# Explorer:https://explorer.solana.com/tx/<sig>?cluster=devnet
```

## G. 语义红线(现场不要说错)

- ALLOW = eligible for distribution,**不是投资背书**。
- Maya 0.942 / Dan 0.491,但各拿 5000:**match 决定资格,政策决定数量**。
- Sib 是被 **risk 阻断**(score 0),不是"分少"。
- 双领拒绝发生在 **program 层**(ClaimReceipt PDA),不是前端按钮置灰。
- 全程 devnet;Demo Wallet 是演示基础设施,页面有明确徽标,不伪装真实钱包授权。
