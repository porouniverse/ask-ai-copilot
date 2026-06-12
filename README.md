# AskAI Copilot

系统级热键 + 悬浮 UI + 浏览器自动化工具，基于 Electron + Playwright。

## 功能

- **全局热键**：`Ctrl+Shift+K`（Mac 为 `Cmd+Shift+K`）随时呼出悬浮输入框
- **精美悬浮 UI**：无边框窗口 + blur 毛玻璃效果，点击外部或按 `Esc` 自动隐藏
- **浏览器自动化**：输入内容后自动打开浏览器、填充表单、点击按钮
- **登录状态持久化**：Playwright 自动复用 `playwright-state.json`，无需重复登录
- **多站点扩展**：通过 JSON 配置文件支持多个目标站点

## 热键

| 热键 | 功能 |
|------|------|
| `Ctrl+Shift+K` | 呼出 / 隐藏悬浮窗口 |
| `Enter` | 提交输入内容 |
| `Esc` | 关闭悬浮窗口 |

## 目录结构

```
src/
  main.js        # Electron 主进程
  preload.js     # 安全 IPC 桥接
  renderer/
    index.html   # 悬浮 UI 页面
    style.css    # 毛玻璃样式
    renderer.js  # UI 交互逻辑
package.json
```

## 开发

```bash
# 安装依赖
npm install

# 开发启动（不打包）
npm run dev

# 打包 Windows 安装包 + 便携 exe
npm run build
```

打包产物位于 `dist/` 目录。

## 技术栈

- Electron 33.x
- Playwright 1.50
- electron-builder 25.x
