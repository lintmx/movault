# movault

基于 Vite 官方 `react-ts` 模板的 React + TypeScript 项目，目前首页仅展示项目名称。

## 本地开发

使用 Node.js 24 或更高版本，以及 pnpm 12.9.1。项目仅使用 pnpm 管理依赖，提交 `pnpm-lock.yaml`。

```sh
pnpm install
pnpm dev
```

打开终端提示的本地地址。

## 常用命令

```sh
pnpm typecheck # TypeScript 类型检查
pnpm lint      # ESLint 检查
pnpm build     # 类型检查并构建到 dist/
pnpm preview   # 本地预览构建产物，需先运行 build
```

保留官方 TypeScript 配置并显式启用严格模式。当前模板默认使用 Oxlint，本项目按要求采用官方模板此前的 ESLint 配置；TypeScript 使用 ESLint 工具链支持的稳定版本 6.0.3。
