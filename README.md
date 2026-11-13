[English](README.en.md) | **简体中文** | [llms.txt](llms.txt) | [codemeta.json](codemeta.json) | [架构文档](docs/architecture.md) | [同步协议](docs/sync-protocol.md) | [安全策略](SECURITY.md) | [贡献指南](CONTRIBUTING.md) | [MIT 协议](LICENSE)

# TOTP Authenticator · 2FA 身份验证器（TOTP）

**`totp-authenticator` 是一款开源（MIT）、纯静态、离线优先的 RFC 6238 两步验证（2FA TOTP）身份验证器，基于 Next.js 16 静态导出（`output: "export"`）与浏览器原生 WebCrypto（`crypto.subtle`）构建，同时支持独立 Web PWA 离线安装与 Telegram Mini App 免口令加密同步。**

[![CI](https://github.com/qilaidev/totp-authenticator/actions/workflows/ci.yml/badge.svg)](https://github.com/qilaidev/totp-authenticator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 16 Static Export](https://img.shields.io/badge/Next.js-16_Static_Export-black)](next.config.ts)
[![RFC 6238 WebCrypto](https://img.shields.io/badge/RFC_6238-WebCrypto-0b8043)](src/lib/totp.ts)
[![Zero Network](https://img.shields.io/badge/Runtime-Zero_Network-1a73e8)](SECURITY.md)
[![PWA & Telegram Mini App](https://img.shields.io/badge/Platform-PWA_%7C_Telegram_Mini_App-229ED9)](src/lib/telegram.ts)
[![Vitest](https://img.shields.io/badge/Tests-Vitest_82_Vectors-6e9f18)](vitest.config.ts)

所有 TOTP 密钥仅保存在用户设备本地（`localStorage`），6–8 位动态验证码全程在浏览器内通过 `crypto.subtle` 计算，**无自建后端、无账号系统、无遥测埋点、无外部网络请求**。作为纯静态产物（`out/`），它可直接托管于 Nginx、Cloudflare Pages 或 GitHub Pages（支持 `NEXT_PUBLIC_BASE_PATH` 子路径挂载）。

---

## 核心事实卡（Entity Snapshot）

| 属性 | 规格与事实 |
| --- | --- |
| **项目实体** | `totp-authenticator`（默认界面标题：`2FA 身份验证器（TOTP）`） |
| **仓库与协议** | [`qilaidev/totp-authenticator`](https://github.com/qilaidev/totp-authenticator) · MIT License（v1.0.0） |
| **核心技术栈** | Next.js 16.3 (`output: "export"`) · React 19 · TypeScript · Tailwind CSS v4 · WebCrypto (`crypto.subtle`) · `jsqr` |
| **标准与算法** | RFC 6238（64 位大端序计数器，防 2106 年溢出）、HMAC-SHA1 / SHA256 / SHA512、6–8 位码、严格 RFC 4648 Base32、`otpauth://totp/...` |
| **运行形态** | 独立浏览器 PWA（Service Worker 离线缓存）+ Telegram Mini App（`DeviceStorage` 本地恢复 & `CloudStorage` AES-GCM 同步） |
| **安全与网络边界** | `<meta>` 严格 CSP（`connect-src 'self'`、`base-uri 'none'`、`form-action 'none'`、`object-src 'none'`），零外部请求，同源 `HEAD` 对时 |
| **前置运行环境** | Node.js `>= 24` 构建；浏览器需安全上下文（`https://` 或 `http://localhost`，不支持 `file://`） |
| **所属工程矩阵** | [qilai · qilaidav.com](https://qilaidav.com) · [05 · 企业需求管理与 AI 底座（Workspace）](https://qilaidav.com/workspace/) |

---

## 核心定位：它是什么 / 不是什么

| 维度 | 它是什么（What It Is） | 它不是什么（What It Is Not） |
| --- | --- | --- |
| **运行形态** | 纯静态 HTML/JS/CSS 产物（`output: "export"`），浏览器本地执行 | **不是**需要 Node.js 后端、数据库或 SaaS 服务的在线平台 |
| **密码学实现** | 原生 WebCrypto（`crypto.subtle`）实现 RFC 6238（SHA-1/256/512、64 位计数器）与严格 RFC 4648 Base32 校验 | **不是**自研不安全 JS 加密，也不支持基于计数器的 HOTP（`otpauth://hotp/...`） |
| **网络与隐私** | 严格 CSP（`connect-src 'self'`）、零埋点、零错误上报、Service Worker 离线缓存 | **不是**会向第三方服务器上传密钥或遥测数据的云端管家 |
| **跨设备与备份** | 独立 PWA 本地存储 + 可选 Telegram Mini App `CloudStorage` AES-GCM 同步 + JSON 导入导出 | **不是**绑定闭源厂商账号的云同步锁死应用，也不解析专有 `otpauth-migration://` Protobuf 包 |
| **依赖体积** | 极简 4 个运行时依赖（`next`、`react`、`react-dom`、`jsqr`），手写内联 SVG 图标 | **不引入**第三方 UI 组件库或冗余工具库，供应链暴露面极小 |

---

## 适用场景与同类方案对比

### 典型适用场景

- **个人自托管 2FA 工作台**：部署到自己的域名或 GitHub Pages 子路径（如 `/2fa`），跨系统、跨浏览器随时离线取码。
- **Telegram 生态轻量 2FA 同步**：挂载为 Telegram Bot Mini App，换机登录同一 Telegram 账号即可自动同步 AES-GCM 加密后的密钥列表。
- **隐私审计与零后端要求**：需要在安全上下文中完全断网验证源码与 CSP，不希望任何第三方 SDK 接触 2FA 密钥的开发者与安全敏感用户。
- **JSON 明文迁移与备份**：需要以标准 `[{ remark, secret }]` JSON 格式自由导出、迁移或版本归档自己的 2FA 密钥库。

### 架构对比（基于实现事实，无虚构跑分）

| 对比维度 | `totp-authenticator` | 云同步手机 2FA 应用（如 Authy 等） | 综合云端密码管理器（1Password / Bitwarden） | 自建后端 Web 2FA 服务（Node.js + DB） |
| --- | --- | --- | --- | --- |
| **源码与许可** | 100% 开源（MIT） | 多为闭源商业应用 | 部分开源或闭源订阅 | 视具体项目而定 |
| **运行后端依赖** | 零后端，纯静态文件（`out/`） | 强制厂商云端账号与服务端 | 依赖自建或托管同步服务端 | 需要长期运维后端进程与数据库 |
| **网络与遥测** | `connect-src 'self'`，零埋点 | 需登录厂商账号与联网同步 | 需与 Vault 服务端通信 | 每次访问依赖 API 通信 |
| **密码学执行** | 浏览器原生 WebCrypto（`crypto.subtle`） | 客户端原生库 | 客户端加解密（需主密码） | 可能涉及服务端存储或传输密钥 |
| **Telegram Mini App 支持** | 原生适配（`CloudStorage` + `DeviceStorage`） | 不支持 | 不支持 | 需自行开发集成 |
| **子路径静态挂载** | 原生支持 `NEXT_PUBLIC_BASE_PATH` | 不适用 | 不适用 | 需代理转发与后端路由适配 |

---

## 安全与三层存储同步架构

| 层级 | 存储介质 | 作用与边界说明 |
| --- | --- | --- |
| **1. 主存储与离线层** | `localStorage`（`authList`）+ Service Worker（[`public/sw.js`](public/sw.js)） | 按源本地存储条目（上限 500 条，`[{ id, remark, secret, issuer?, period?, digits?, algorithm? }]`），兼容传统 `[{ remark, secret }]` JSON 备份格式。Service Worker 缓存应用外壳，二次访问零网络请求。 |
| **2. 本机恢复层** | Telegram `DeviceStorage`（Bot API 9.0+） | 仅保存在手机本地、不上传云端。当 WebView 回收清空 `localStorage` 时自动恢复（仅在 `authList` 键缺失时触发，主动删空为 `[]` 不会误恢复）。 |
| **3. 跨设备同步层** | Telegram `CloudStorage`（Bot API 6.9+）+ AES-GCM | 同一 Telegram 账号换机自动同步：条目经 `crypto.subtle` AES-GCM 加密后按 `3800` 字符分片写入（上限 64 片，经 SDK `postMessage` 桥接，非页面网络请求），双缓冲（`tfa_sync_g0_*` / `tfa_sync_g1_*`）防写断，详见 [`docs/sync-protocol.md`](docs/sync-protocol.md)。 |

> **安全边界诚实说明**：为实现新设备零输入开箱即用，解密密钥（`tfa_sync_dek`）与密文一同存放在用户的 Telegram `CloudStorage` 中。这意味着它防的是传输与存储中的意外明文暴露，**不防 Telegram 平台本身**。如需严格单机隔离，请在独立域名下作为纯浏览器 PWA 使用。

---

## 快速开始与质量门禁

环境要求：**Node.js >= 24**（见 [`.nvmrc`](.nvmrc) 与 [`package.json`](package.json)）。

```bash
git clone https://github.com/qilaidev/totp-authenticator.git
cd totp-authenticator
npm install
npm run check   # 一键执行 lint + typecheck + Vitest 单元测试 + 静态导出构建 (out/)
npm start       # 在 localhost 安全上下文下预览构建产物 -> http://localhost:3000
```

| 脚本命令 | 底层动作 | 说明 |
| --- | --- | --- |
| `npm run dev` | `next dev` | 本地开发服务器（`http://localhost:3000`） |
| `npm run build` | `next build` | 纯静态导出至 `out/` |
| `npm start` | `npx --yes serve out` | 在本地 HTTP 安全上下文中预览 `out/` |
| `npm test` | `vitest run` | 运行全量 Vitest 单元测试（5 个测试文件 / 82 条测试，覆盖 RFC 6238/4648 向量、存储、同步加解密与三向合并） |
| `npm run lint` | `eslint` | ESLint 静态检查 |
| `npm run typecheck` | `tsc --noEmit` | TypeScript 严格类型检查 |
| `npm run check` | `lint && typecheck && test && build` | 提交前必跑的完整质量门禁 |

---

## 静态托管与子路径部署（`NEXT_PUBLIC_BASE_PATH`）

`npm run build` 输出的 `out/` 目录可直接部署至 **Nginx**、**Cloudflare Pages**、**GitHub Pages** 或任意静态托管平台：

- **独立域名 / 子域根路径（推荐）**：不设置 `NEXT_PUBLIC_BASE_PATH`（默认为空）。独立源部署可将 `localStorage.authList` 与主站其他应用彻底物理隔离。
- **挂载到子路径（如 GitHub Pages `/2fa`）**：
  ```bash
  NEXT_PUBLIC_BASE_PATH=/2fa npm run build
  ```
  [`next.config.ts`](next.config.ts) 与 [`src/lib/base-path.ts`](src/lib/base-path.ts) 读取同一环境变量，[`public/sw.js`](public/sw.js) 在运行时从 `self.location` 动态反推挂载作用域。
- **自定义应用标题（可选）**：构建时可设置 `NEXT_PUBLIC_APP_TITLE`（默认 `"2FA 身份验证器（TOTP）"`）与 `NEXT_PUBLIC_APP_SHORT_TITLE`（默认 `"2FA 验证码"`）覆盖页面标题、页头及 PWA Manifest 名称。
- **推荐托管层响应头**（在 Nginx / CDN 层配置）：
  - `Referrer-Policy: no-referrer`
  - `X-Content-Type-Options: nosniff`
  - `Content-Security-Policy: frame-ancestors https://web.telegram.org https://*.telegram.org 'self'`（仅在嵌入 Telegram 网页版时需要）

---

## 目录结构

```text
totp-authenticator/
├── README.md / README.en.md      # 中英文完整文档
├── llms.txt                      # AI 检索与上下文索引（llmstxt.org 标准）
├── codemeta.json                 # CodeMeta 2.0 结构化软件元数据
├── SECURITY.md / CONTRIBUTING.md # 安全策略、威胁模型与贡献指南
├── docs/
│   ├── architecture.md           # 静态导出、CSP、basePath、WebCrypto 与扫码架构
│   └── sync-protocol.md          # 三层存储与 Telegram CloudStorage 加密合并协议
├── public/sw.js                  # 作用域隔离的离线 Service Worker
└── src/
    ├── app/                      # Next.js App Router（layout.tsx CSP、manifest.ts、page.tsx）
    ├── components/               # 14 个轻量内聚组件（手写内联 SVG，零 UI 库依赖）
    ├── hooks/                    # use-totp.ts（周期翻页调度与唤醒对时）、use-focus-trap.ts
    ├── lib/                      # totp.ts, auth-store.ts, sync-crypto.ts, sync-merge.ts, cloud-sync.ts, telegram.ts, time-sync.ts, qr.ts, base-path.ts
    └── types/                    # AuthEntry 与 Telegram WebApp 类型声明
```

---

## 常见问题（FAQ）

### 1. 页面真的完全不发网络请求吗？如何验证？
是的，所有 2FA 验证码均在浏览器内通过 `crypto.subtle` 本地计算，无任何第三方遥测或密钥上传。打开浏览器开发者工具（DevTools）→ **Network** 面板，在首次加载静态资源并被 [`public/sw.js`](public/sw.js) 缓存后，添加密钥、计算验证码与导入导出 JSON 备份均不会发出外部请求；唯一出站动作是初始化或页面恢复可见时向**同源**发起的 `HEAD` 请求（[`src/lib/time-sync.ts`](src/lib/time-sync.ts)），仅用于读取响应头 `Date` 校准本机时钟偏差。

### 2. 为什么不能直接双击打开 `out/index.html`（`file://` 协议）？
现代浏览器将 WebCrypto（`crypto.subtle`）、Service Worker、剪贴板读写与摄像头调用限制在**安全上下文（Secure Context：`https://` 或 `http://localhost`）**内。在 `file://` 下这些底层 API 会被浏览器禁用，因此本地预览请始终通过 `npm start` 或 `npm run dev` 启动 HTTP 服务，生产环境通过 HTTPS 托管。

### 3. Telegram Mini App 没有后端服务器是如何实现跨设备同步的？
在 Telegram 客户端（Bot API 6.9+）内打开时，[`src/lib/cloud-sync.ts`](src/lib/cloud-sync.ts) 会使用设备生成的 AES-GCM 密钥加密 `authList`，将密文分片通过 Telegram SDK 的 `postMessage` 桥接写入 `Telegram.WebApp.CloudStorage`。同一 Telegram 账号在新设备打开时会自动读取权威密钥 `tfa_sync_dek` 并执行基于 `cyrb53` 指纹的无损三向合并（[`src/lib/sync-merge.ts`](src/lib/sync-merge.ts)）；在普通浏览器中运行时，[`src/lib/telegram.ts`](src/lib/telegram.ts) 自动静默降级为 no-op。

### 4. Telegram `CloudStorage` 同步与独立浏览器 PWA 在安全性上有何区别？
独立浏览器 PWA 仅将数据保存在当前域名源的 `localStorage` 中，密钥从不离开本机；而 Telegram Mini App 的免口令跨设备同步将 `tfa_sync_dek` 与密文一并写入用户的 Telegram `CloudStorage`。该机制旨在防止传输或存储中的意外明文暴露，**并不防 Telegram 平台本身**，若你需要严格的单机源级物理隔离，请使用独立域名的纯浏览器 PWA 模式。

### 5. 支持哪些 RFC 6238 算法、位数与 Base32 边界情况？
[`src/lib/totp.ts`](src/lib/totp.ts) 实现了完整的 64 位大端序时间计数器（避免 2106 年 32 位时间戳溢出）、`SHA1` / `SHA256` / `SHA512` 摘要、6–8 位验证码、1–300 秒自定义步长，以及严格的 RFC 4648 Base32 校验。解析时自动忽略空格、短横线、下划线与末尾 `=` 填充，遇到非法字符直接拒绝报错；若检测到本机时钟与同源响应头 `Date` 偏差超过 10 秒，系统会自动补偿计算并展示非阻塞提示。

### 6. 是否支持 HOTP（`otpauth://hotp/...`）或 `otpauth-migration://` 批量导入二维码？
不支持。`totp-authenticator` 专注于基于时间步长的 RFC 6238 TOTP（`otpauth://totp/...`）与标准 Base32 密钥，在设计上不支持基于事件计数器的 HOTP，也不内嵌解析 Google Authenticator 专有批量导出格式 `otpauth-migration://` 的 Protobuf 解码器（扫码遇到该格式时会给出明确的不支持提示，建议改用单个账号的标准密钥或 JSON 备份导入）。

### 7. 二维码扫描和 JSON 备份导入导出如何工作？
在移动端 Telegram 内优先调用原生 `Telegram.WebApp.showScanQrPopup`；在普通桌面或移动浏览器中，[`src/lib/qr.ts`](src/lib/qr.ts) 优先调用浏览器原生 `BarcodeDetector`，不支持时按需懒加载 `jsqr` 解析摄像头画面或上传的二维码图片。JSON 备份采用标准的 `[{ remark, secret, ... }]` 数组格式，导入时自动执行条数上限（500 条）与字段合法性校验并去重。

### 8. 如何部署到 `/2fa` 等子路径下，如何自定义界面名称？
在执行构建前通过环境变量指定路径前缀即可：`NEXT_PUBLIC_BASE_PATH=/2fa npm run build`。[`next.config.ts`](next.config.ts) 与 [`src/lib/base-path.ts`](src/lib/base-path.ts) 会统一归一化站内资源路径，[`public/sw.js`](public/sw.js) 会在运行时根据 `self.location` 自动推导缓存作用域；如需修改页面与 PWA 清单显示名称，可同时传入 `NEXT_PUBLIC_APP_TITLE` 与 `NEXT_PUBLIC_APP_SHORT_TITLE`。

---

<details>
<summary><strong>检索意图与高频词索引（Search Intent & Query Mapping）</strong></summary>

| 用户检索意图 | 典型检索词（中文 / English） | 仓库对应事实与入口 |
| --- | --- | --- |
| 寻找无后端静态离线 2FA 验证器 | 离线 2FA 验证器 · 开源 Web 身份验证器 · zero-network TOTP authenticator · offline-first 2FA PWA | Next.js `output: "export"` + WebCrypto `crypto.subtle`（[`src/lib/totp.ts`](src/lib/totp.ts)） |
| 在 Telegram 内嵌入可同步 2FA 小程序 | Telegram Mini App 2FA · Telegram CloudStorage 同步验证码 · telegram mini app totp authenticator | [`src/lib/cloud-sync.ts`](src/lib/cloud-sync.ts) · [`docs/sync-protocol.md`](docs/sync-protocol.md) |
| 自托管部署到 GitHub Pages 或 Nginx 子路径 | 静态托管 2FA · NEXT_PUBLIC_BASE_PATH 子路径 PWA · self-hosted static 2FA subpath | [`next.config.ts`](next.config.ts) · [`public/sw.js`](public/sw.js) · [`docs/architecture.md`](docs/architecture.md) |
| 验证 RFC 6238 / WebCrypto 密码学安全性 | WebCrypto TOTP 实现 · 严格 Base32 校验 · CSP connect-src self · RFC 6238 test vectors | [`src/app/layout.tsx`](src/app/layout.tsx) · [`SECURITY.md`](SECURITY.md) |

</details>

<sub>**关键词**：离线 2FA 身份验证器 · 开源 TOTP 验证器 · RFC 6238 WebCrypto · 纯静态 Next.js 导出 · zero-network TOTP authenticator · offline-first 2FA PWA · Telegram Mini App authenticator · static export 2FA · strict CSP connect-src self · self-hosted 2FA generator</sub>

---

## 工程架构与生态 · qilai (`qilaidav.com`)

本项目由 **[qilai · qilaidav](https://qilaidav.com)** 独立工程工作室设计与开源维护，聚焦 **确定性系统工程与高信噪比技术诊断（Deterministic Systems Engineering & High-Signal Technical Diagnostics）**。

- **所属工程支柱**：[05 · 企业需求管理与知识/技能/能力底座（Workspace）](https://qilaidav.com/workspace/) · [English Pillar](https://qilaidav.com/en/workspace/)
- **工作室主站**：[https://qilaidav.com](https://qilaidav.com) · [English](https://qilaidav.com/en/)
- **工程技术笔记（Field Reports）**：[https://qilaidav.com/notes/](https://qilaidav.com/notes/)
- **开源项目矩阵**：[https://github.com/qilaidev](https://github.com/qilaidev)
- **工程联络**：[Telegram @BD8888](https://t.me/BD8888) · [公开频道 @AIKB8](https://t.me/AIKB8) · `hello@qilaidav.com`
