# Solana 环境指纹(P0-4 §5)

记录日期:2026-09-18。机器:Windows 10 x64(win32 10.0.26200),Git Bash。

## 实测工具链

| 工具 | 版本 | 状态 |
|---|---|---|
| node | v24.14.1 | ✓ 已装 |
| npm | 11.11.0 | ✓(用户级 registry = npmmirror;repo lockfile 指向 npmjs) |
| rustc | 1.96.1 (31fca3adb 2026-06-26) | ✓ 已装 |
| cargo | 1.96.1 (356927216 2026-06-26) | ✓ 已装 |
| solana (agave) | v4.2.2 (x86_64-pc-windows-msvc 官方 release) | 本轮安装 |
| anchor | anchor-cli(经 `cargo install anchor-cli --locked` 自 crates.io 安装) | 本轮安装 |

安装路径(非仓库):`C:\Users\xqw13\.odp-tools\` 与 `%USERPROFILE%\.cargo\bin\`。

## 网络可达性(实测)

| 端点 | 结果 |
|---|---|
| `https://index.crates.io/config.json` | 200 ✓(cargo 直连可用,无需镜像) |
| `https://api.devnet.solana.com`(getVersion) | ✓ `solana-core 4.3.0-rc.0` |
| GitHub release 对象存储(agave tarball) | ✓(偶发 TLS 握手失败,重试可过) |
| `registry.npmjs.org` | ✗ 不可达(走用户级 npmmirror) |
| `rsproxy.cn` | ✗ 不可达(未使用) |

## WSL

`wsl --status`:仅 docker-desktop 发行版,未作为 Solana 工具链宿主。全部工具走 Windows 原生路径。

## Demo keypair 纪律(§7)

- ephemeral demo keypairs 存 `.odp/devnet-keys/`(gitignore),仓库只提交 pubkey 清单 `packages/distribution-engine/fixtures/keys/devnet-pubkeys.json`。
- 生成方式:node `crypto.generateKeyPairSync("ed25519")`,Solana 格式 64 字节 `[seed ‖ pubkey]` JSON。

## 版本决策记录

- 不锁定旧版本记忆:agave 取 `releases/latest` = v4.2.2;anchor 取 crates.io 最新 `--locked`(= 1.2.0,模块化 solana 3.x crates 系)。
- Merkle 跨语言向量使用零依赖 Rust 实现(手写 SHA-256),避免 crates.io 依赖面。
- 程序 dev-deps:`solana-program-test`/`solana-sdk` 固定 3.x 系,与 anchor 1.2 的模块化 solana crates 对齐(4.x/5.x 会产生 solana-inflation 版本冲突)。
- **Windows 已知限制**:`solana-test-validator.exe` 原生启动需要 symlink 特权(错误 1314,需管理员或开发者模式),本机不可用。替代方案:`solana-program-test`(进程内验证器)承载 §21 全矩阵,证据等级等同 PASS-LOCAL;devnet 部署不受影响(远程账本,无需本地 validator)。
- `solana-program-test` 依赖链经 agave-precompiles 引入 `openssl-sys`(vendored),Windows 上 Git Bash 自带 perl 缺模块无法构建 OpenSSL → 已通过 winget 安装 Strawberry Perl 5.42.3(`C:\Strawberry`),构建时将其 perl 前置到 PATH。
