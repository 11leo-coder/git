// 本地 AI 聊天伴侣 —— 小豆
// 依赖：Node.js（v18+，内置 fetch）+ 本地 Ollama 服务
// 用法：node chat.js
const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ===== 配置 =====
const OLLAMA_URL = "http://localhost:11434";
const MODEL = "qwen2.5:7b";                 // 已拉取的模型名
const PERSONA_FILE = "persona.txt";         // 人设文件
const HISTORY_FILE = "chat_history.json";   // 记忆文件（最近 20 句）
const MAX_MEMORY = 20;                      // 记住最近 20 句（用户与 AI 各算一句）

const dir = __dirname;

function loadPersona() {
  try {
    return fs.readFileSync(path.join(dir, PERSONA_FILE), "utf8").trim();
  } catch {
    return "";
  }
}

function loadHistory() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, HISTORY_FILE), "utf8"));
    if (Array.isArray(data)) return data.slice(-MAX_MEMORY);
  } catch {
    // 文件不存在或损坏时，从空记忆开始
  }
  return [];
}

function saveHistory(messages) {
  fs.writeFileSync(
    path.join(dir, HISTORY_FILE),
    JSON.stringify(messages.slice(-MAX_MEMORY), null, 2),
    "utf8"
  );
}

async function callOllama(messages) {
  const res = await fetch(OLLAMA_URL + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      options: { temperature: 0.8, repeat_penalty: 1.1 },
    }),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return data.message.content.trim();
}

function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.setPrompt("你：");

  const persona = loadPersona();
  const history = loadHistory();

  console.log("=".repeat(40));
  console.log("  小豆（本地 AI 伙伴）已就位");
  console.log("  输入 exit / quit / 退出 来结束聊天");
  console.log("=".repeat(40));
  console.log();

  let closed = false; // readline 是否已关闭（如 EOF / Ctrl+D）
  let busy = false;   // 是否正在等待模型回复

  rl.on("line", async (line) => {
    const userInput = (line || "").trim();
    if (!userInput) {
      if (!closed) rl.prompt();
      return;
    }
    if (["exit", "quit", "退出"].includes(userInput.toLowerCase())) {
      console.log("小豆：哼，走就走，下次记得再来。");
      rl.close();
      return;
    }
    if (busy) return; // 上一条还没回完，先忽略新输入
    busy = true;

    const messages = [
      { role: "system", content: persona },
      ...history,
      { role: "user", content: userInput },
    ];

    let reply;
    try {
      reply = await callOllama(messages);
    } catch (e) {
      if (e.name === "TypeError" || e.cause?.code === "ECONNREFUSED") {
        console.log("小豆：……我连不上引擎了。Ollama 启动了吗？模型拉下来了吗？");
      } else {
        console.log("小豆：出错了：" + e.message);
      }
      busy = false;
      if (!closed) rl.prompt();
      return;
    }

    console.log("小豆：" + reply);
    console.log();

    // 更新记忆：用户这句 + 我的回复
    history.push(
      { role: "user", content: userInput },
      { role: "assistant", content: reply }
    );
    saveHistory(history);

    busy = false;
    if (!closed) rl.prompt();
  });

  rl.on("close", () => {
    closed = true;
    process.stdout.write("\n");
  });

  rl.prompt();
}

main();
