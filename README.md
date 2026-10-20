# 小豆 · 本地 AI 聊天伴侣

一个完全跑在本地的 AI 聊天伴侣「小豆」，基于 [Ollama](https://ollama.com) + Node.js，零第三方依赖，不联网也能聊。

## 功能特性

- 🎭 **固定人设**：傲娇、忠诚、说话简短直接的「小豆」（可在 `persona.txt` 里自定义）
- 🧠 **本地记忆**：自动记住最近 10 句对话，存在 `chat_history.json`，下次打开接着聊
- 🔌 **完全离线**：模型下载到本地后，无需联网
- ⚡ **零依赖**：只用到 Node.js 内置模块，无需 `npm install`

## 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | v18+ | 需要内置的 `fetch` |
| Ollama | 任意 | 本地模型服务，默认 `localhost:11434` |

## 快速开始

### 1. 安装 Ollama

到 <https://ollama.com/download/windows> 下载安装包，双击安装即可。装完 Ollama 会在后台自动运行（托盘出现 🦙 图标）。

### 2. 拉取模型

```bash
ollama pull qwen2.5:3b
```

> 模型约 1.9 GB，下载需要几分钟。如果想换更小/更大的模型，改成 `qwen2.5:1.5b`、`qwen2.5:7b` 等，并同步修改 `chat.js` 里的 `MODEL` 变量。

### 3. 启动聊天

- **Windows**：双击 `start.bat`
- **Git Bash / 终端**：

```bash
./start.sh
# 或
node chat.js
```

## 使用说明

启动后直接输入文字即可聊天：

```
========================================
  小豆（本地 AI 伙伴）已就位
  输入 exit / quit / 退出 来结束聊天
========================================

你：你好呀
小豆：……
```

- 输入 `退出` / `exit` / `quit` 结束聊天
- 最近 10 句对话自动保存在 `chat_history.json`（该文件已被 `.gitignore` 忽略，不会提交）

## 文件结构

```
├── chat.js            # 聊天主脚本
├── persona.txt        # 人设配置（可自定义）
├── start.bat          # Windows 启动脚本
├── start.sh           # Git Bash 启动脚本
├── chat_history.json  # 本地记忆（运行时自动生成）
└── .gitignore
```

## 自定义

- **换人设**：编辑 `persona.txt`，改「小豆」的性格设定
- **换模型**：改 `chat.js` 顶部的 `MODEL` 变量（需先 `ollama pull` 对应模型）
- **改记忆长度**：改 `chat.js` 顶部的 `MAX_MEMORY`（默认 10 句）
