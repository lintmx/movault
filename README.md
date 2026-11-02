# Movault

面向个人的日本电影前售券管理工具。集中保存購入番号、暗証番号与兑换状态，支持实体券、电子券和浏览器本地 OCR。

移动端优先，无需账号或后端服务。数据保存在当前浏览器，资源缓存完成后可离线使用。

[快速开始](#快速开始) · [使用说明](#使用说明) · [部署](#部署) · [参与贡献](#参与贡献) · [MIT License](LICENSE)

## 功能

- **电影管理**：新建、编辑、删除电影，上传海报，设置上映日期和默认单次价格。
- **前售券管理**：实体券固定兑换一次；电子券支持多次兑换，分别记录未使用、待确认和已使用次数。
- **多种录入方式**：单张录入、连续录入、批量粘贴；重复号码组合会提示核对。
- **本地 OCR**：从相机或相册导入固定版式实体券，支持自动定位、透视校正、手动调整和原图对照。
- **查找与复制**：按購入番号搜索，按状态和券种筛选，分别复制号码或一次复制整组凭证。
- **统计与备份**：查看兑换进度和日元金额分布，导出完整 JSON 备份，合并或覆盖恢复。
- **离线使用**：支持 PWA，应用资源与 OCR 资源分别缓存。

## 快速开始

### 环境要求

- Node.js 24 或更高版本。
- pnpm 12.9.1，与 `package.json` 中的 `packageManager` 保持一致。
- 支持 IndexedDB、Web Worker、WebAssembly 和 Canvas 的现代浏览器。

克隆或下载仓库后，在项目目录执行：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

打开终端显示的地址，通常为 `http://localhost:5173`。项目无需配置环境变量、数据库或 API 密钥。

开发和构建命令会自动将 OCR 引擎、模型及相关许可证准备到 `public/ocr/`。该目录为生成产物，无需提交到 Git；完整 OCR 静态资源约 35 MiB，在进入拍照识别流程时加载。

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 准备 OCR 资源并启动开发服务器 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm lint` | Oxlint 检查 |
| `pnpm build` | 准备 OCR 资源、检查类型、构建并生成 Service Worker |
| `pnpm preview` | 在本地预览 `dist/`，需先执行构建 |

## 使用说明

1. 新建电影，填写上映日期和默认单次价格，按需上传海报。
2. 添加实体券或电子券。購入番号为 10 位数字，暗証番号为 4 位数字，前导零会保留。
3. 兑换或转交凭证后，手动更新对应次数的状态。复制号码不会自动更改状态。
4. 定期进入「数据管理」导出 JSON 备份。

### 批量录入

每行填写一组購入番号和暗証番号，可用空格、Tab 或逗号分隔：

```text
0123456789 0123
1234567890 4567
```

解析后可检查和修改各行内容；有效记录可以先保存，异常行会保留供继续修正。以上号码仅用于格式演示。

### 拍照识别

OCR 使用 Tesseract.js 和 OpenCV.js，在浏览器内处理图片，不调用云端识别接口。仅针对当前固定版式实体券；电子券使用手动或批量录入。

首次使用需要联网准备识别资源。自动定位失败时，可调整卡片四角或直接框选两个号码区域。识别后应逐位核对来源图片，点击「确认并保存」才会创建记录。原照片和裁剪图不写入备份或业务数据库。

「离线资源已就绪」表示常规管理可离线使用；OCR 还需在拍照识别页面显示「可离线识别」。识别准确率受版式、清晰度、反光和设备影响，真实手机与多样本验证仍需持续完善。

### 数据与隐私

- 电影、海报、号码、兑换状态和备注保存在当前站点的 IndexedDB 中。
- 不提供账号、云端同步或跨设备自动同步。不同浏览器、域名或端口拥有各自的数据。
- 清除站点数据、更换设备或浏览器回收存储可能导致数据丢失；离线缓存不能替代 JSON 备份。
- 备份包含明文凭证和海报，请妥善保管，勿将真实备份、票券照片或号码提交到公开仓库和 Issue。
- 合并导入按内部 ID 去重，冲突时保留本地记录；不同 ID 即使号码组合相同也会导入，并提示核对。覆盖导入会替换全部本地数据，需再次确认。
- 多个页面同时编辑时，保存会检查本地数据是否已变化；遇到冲突请先保留当前输入，再刷新重试。

## 部署

项目构建为纯静态文件，可部署到 Vercel 或其他静态托管服务：

```sh
pnpm install --frozen-lockfile
pnpm build
```

发布完整的 `dist/` 目录，包括 `ocr/`、`sw.js`、图标和 Web App Manifest。

| 配置项 | 值 |
| --- | --- |
| 安装命令 | `pnpm install --frozen-lockfile` |
| 构建命令 | `pnpm build` |
| 输出目录 | `dist` |

仓库包含 Vercel 的 SPA 路由回退配置。使用其他服务器时，应优先提供实际静态文件，并将 `/movies/...`、`/data` 等页面路由回退到 `index.html`。

当前路由和 PWA 配置以域名根路径 `/` 为基础，不直接支持 `/movault/` 等子路径。正式使用请启用 HTTPS；本地开发可使用 localhost。Service Worker 只在生产构建中注册，验证离线功能请使用 `pnpm build && pnpm preview`。

更新后若仍显示旧页面，关闭该站点的全部标签页和 PWA 窗口再重新打开，让等待中的 Service Worker 生效。无需为更新清除站点数据。

## 技术栈与目录

React、TypeScript、Vite、Radix Colors / Dialog、Lucide、Tesseract.js、OpenCV.js、IndexedDB、Service Worker。

```text
src/
  App.tsx              页面路由与应用状态
  data.ts              数据模型、存储、备份校验与统计
  forms.tsx            电影和前售券录入
  MovieDetail.tsx      券列表、筛选与状态修改
  DataManagement.tsx   JSON 备份导入与导出
  OcrScanner.tsx       拍照识别与人工确认界面
  ocr.ts               OCR Worker 与资源缓存
  ocr-geometry.ts      区域坐标与几何处理
  ui.tsx / styles.css  通用界面组件与样式
scripts/
  prepare-ocr.mjs      准备同源 OCR 静态资源
  ocr-engine.js        图像处理与文字识别 Worker
  generate-sw.mjs      生成离线缓存 Service Worker
public/                图标、PWA 配置及生成的 OCR 资源
```

项目需求与实现约束见 [PRD.md](PRD.md)、[DESIGN.md](DESIGN.md) 和 [OCR_DESIGN.md](OCR_DESIGN.md)。

## 参与贡献

欢迎通过 Issue 反馈问题或提交 Pull Request。问题反馈请附复现步骤、浏览器及系统版本，并使用虚构号码或脱敏图片。

提交前运行：

```sh
pnpm typecheck
pnpm lint
pnpm build
```

涉及存储、备份或 OCR 的修改，还应在独立浏览器环境验证相应流程，避免使用真实凭证测试。目前没有独立的自动化测试命令，上述检查不等同于完整端到端或真机验证。

## 许可证

本项目采用 [MIT License](LICENSE)。第三方依赖、OCR 引擎和模型保留各自的许可证，项目的 MIT 许可不改变这些组件的授权条款。
