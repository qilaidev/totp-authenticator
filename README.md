[English](README.en.md) | 简体中文 | [llms.txt](llms.txt) | [架构文档](docs/architecture.md) | [同步协议](docs/sync-protocol.md) | [安全策略](SECURITY.md) | [贡献指南](CONTRIBUTING.md) | [MIT 协议](LICENSE)

# TOTP Authenticator (离线零网络 2FA 身份验证器)

**基于原生 WebCrypto 与 Next.js 静态导出的零网络、离线优先 RFC 6238 两步验证（2FA TOTP）验证码生成器，原生支持 Web (PWA) 与 Telegram Mini App 双端运行。**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Next.js 16 Static Export](https://img.shields.io/badge/Next.js-16_Static_Export-black)](next.config.ts)
[![RFC 6238 WebCrypto](https://img.shields.io/badge/RFC_6238-WebCrypto-0b8043)](src/lib/totp.ts)
[![Zero Network](https://img.shields.io/badge/Runtime-Zero_Network-1a73e8)](SECURITY.md)
[![PWA & Telegram Mini App](https://img.shields.io/badge/Platform-PWA_%7C_Telegram_Mini_App-229ED9)](src/lib/telegram.ts)
[![Vitest](https://img.shields.io/badge/Tests-Vitest_RFC_Vectors-6e9f18)](vitest.config.ts)

`totp-authenticator` 是一款纯客户端运行的 2FA 动态验证码工具：所有密钥仅保存在本地设备，所有 6–8 位验证码均通过浏览器原生 `crypto.subtle` 在本地计算，**无任何自建后端、无埋点、无外部网络请求**。既可作为可安装的 PWA 离线使用，也可嵌入 Telegram Mini App 通过 `CloudStorage` 实现免口令跨设备同步。

---

## 核心定位：它是什么 / 不是什么

| 维度 | 它是什么 | 它不是什么 |
| --- | --- | --- |
| **运行形态** | 纯静态 HTML/JS/CSS 产物（`output: "export"`），浏览器本地执行 | 不是需要 Node.js 后端、数据库或 SaaS 服务的在线平台 |
| **密码学实现** | 原生 WebCrypto（`crypto.subtle`）实现 RFC 6238（SHA-1/256/512、64 位计数器）与严格 RFC 4648 Base32 校验 | 不是自研不安全 JS 加密，也不支持基于计数器的 HOTP |
| **网络与隐私** | 严格 CSP（`connect-src 'self'`）、零埋点、零错误上报、Service Worker 离线缓存 | 不是会向第三方服务器上传密钥或遥测数据的云端管家 |
| **依赖体积** | 极简 4 个运行时依赖（`next`、`react`、`react-dom`、`jsqr`），手写内联 SVG 图标 | 不引入第三方 UI 组件库或冗余工具库，供应链暴露面极小 |

---

## 安全与三层存储同步架构

| 层级 | 存储介质 | 作用与边界说明 |
| --- | --- | --- |
| **1. 主存储与离线层** | `localStorage`（`authList`）+ Service Worker（[`public/sw.js`](public/sw.js)） | 按源本地存储条目（`[{ id, remark, secret, issuer?, period?, digits?, algorithm? }]`），兼容传统 `[{ remark, secret }]` JSON 备份格式。Service Worker 缓存应用外壳，二次访问零网络请求。 |
| **2. 本机恢复层** | Telegram `DeviceStorage`（Bot API 9.0+） | 仅保存在手机本地、不上传云端。当 WebView 回收清空 `localStorage` 时自动恢复（仅在 `authList` 键缺失时触发，主动删空为 `[]` 不会误恢复）。 |
| **3. 跨设备同步层** | Telegram `CloudStorage`（Bot API 6.9+）+ AES-GCM | 同一 Telegram 账号换机自动同步：条目经 `crypto.subtle` AES-GCM 加密后分片写入（经 SDK `postMessage` 桥接，非页面网络请求），双缓冲防写断，详见 [`docs/sync-protocol.md`](docs/sync-protocol.md)。 |

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
| `npm test` | `vitest run` | 运行全量 Vitest 单元测试（RFC 6238/4648 官方向量、存储、同步加解密与三向合并） |
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
是的。所有验证码都在浏览器内通过 `crypto.subtle` 计算。打开浏览器开发者工具（DevTools）→ **Network** 面板：首次加载静态资源并被 `public/sw.js` 缓存后，添加密钥、生成验证码、导入导出备份均不会产生任何外部网络请求。唯一会发出的网络请求是初始化与唤醒时向**同源**发起的 `HEAD` 请求（[`src/lib/time-sync.ts`](src/lib/time-sync.ts)），仅用于读取 HTTP 响应头 `Date` 以检测本机时钟偏差。

### 2. 为什么不能直接双击打开 `out/index.html`（`file://` 协议）？
现代浏览器强制要求 `crypto.subtle`（WebCrypto）、Service Worker、剪贴板读写与摄像头扫码运行在**安全上下文（Secure Context：`https://` 或 `http://localhost`）**中。在 `file://` 下这些 API 会被浏览器禁用，本地预览请务必使用 `npm start` 或 `npm run dev`。

### 3. Telegram Mini App 没有后端服务器是如何实现跨设备同步的？
在 Telegram 客户端内（Bot API 6.9+）打开时，[`src/lib/cloud-sync.ts`](src/lib/cloud-sync.ts) 会用设备生成的 AES-GCM 密钥加密 `authList`，分片后通过 Telegram SDK 的 `postMessage` 桥接写入 `Telegram.WebApp.CloudStorage`。同一 Telegram 账号在新设备打开时会自动读取云端权威密钥 `tfa_sync_dek` 并执行无损合并（[`src/lib/sync-merge.ts`](src/lib/sync-merge.ts)）。在普通浏览器中运行时，[`src/lib/telegram.ts`](src/lib/telegram.ts) 会自动静默降级为 no-op。

### 4. 支持哪些 RFC 6238 与 Base32 边界情况？
[`src/lib/totp.ts`](src/lib/totp.ts) 实现了完整的 64 位大端序时间计数器（避免 2106 年 32 位溢出）、`SHA1` / `SHA256` / `SHA512`、6–8 位码、自定义时间步长，以及严格的 RFC 4648 Base32 校验（自动忽略空格、短横线、下划线与末尾 `=`，遇到非法字符直接报错而不是静默算出错误验证码）。若检测到本机时间与同源响应头 `Date` 偏差超过 10 秒，系统会自动补偿时间步长。

### 5. 二维码扫描和 JSON 备份导入导出如何工作？
在移动端 Telegram 内优先调用原生 `Telegram.WebApp.showScanQrPopup`；在普通浏览器或桌面端，[`src/lib/qr.ts`](src/lib/qr.ts) 优先使用浏览器原生 `BarcodeDetector`，不支持时懒加载 `jsqr` 识别摄像头画面或本地图片。支持标准 `otpauth://totp/...` URI（遇到 Google 身份验证器批量导出的 `otpauth-migration://` Protobuf 码会给出明确的不支持提示）。JSON 备份保持 `[{ remark, secret, ... }]` 结构并在导入时严格校验字段与条目上限。

### 6. 如何部署到 `/2fa` 等子路径下？
构建前设置 `NEXT_PUBLIC_BASE_PATH=/2fa` 即可（`NEXT_PUBLIC_BASE_PATH=/2fa npm run build`）。[`next.config.ts`](next.config.ts) 与 [`src/lib/base-path.ts`](src/lib/base-path.ts) 会统一处理所有站内路径，[`public/sw.js`](public/sw.js) 也会自动从 `self.location` 反推挂载点。
