// QQ 桥接脚本 —— 让「糖糖」在 QQ 上陪你聊天
// 依赖：Node.js（v22+，内置 WebSocket + fetch）+ 本地 NapCatQQ（OneBot）+ Ollama
// 用法：node qq_bot.js
const fs = require("fs");
const path = require("path");

// ===== 配置 =====
const NAPCAT_WS = "ws://127.0.0.1:3001";   // NapCat 正向 WebSocket 地址（要和 NapCat 里配的一致）
const OLLAMA_URL = "http://localhost:11434";
const MODEL = "qwen2.5:7b";
const PERSONA_FILE = "persona.txt";        // 复用糖糖的人设
const ALLOWED_USERS = [];                  // 只回复这些 QQ 号，如 [123456789]；留空 = 回复所有私聊
const MAX_HISTORY = 10;                    // 每个用户记住最近 10 条（内存中，重启即忘）

const dir = __dirname;

function loadPersona() {
  try {
    return fs.readFileSync(path.join(dir, PERSONA_FILE), "utf8").trim();
  } catch {
    return "";
  }
}

const persona = loadPersona();

// 每个用户的内存会话历史（轻量，重启即忘）
const histories = new Map();
function historyOf(userId) {
  if (!histories.has(userId)) histories.set(userId, []);
  return histories.get(userId);
}

// 串行处理队列：CPU 跑 7b 较慢，一条条来，避免并发卡死
const queue = [];
let working = false;

async function callOllama(messages) {
  const res = await fetch(OLLAMA_URL + "/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: false,
      options: { temperature: 0.8, repeat_penalty: 1.1, num_gpu: 0 }, // num_gpu:0 强制 CPU，不占显存
    }),
  });
  if (!res.ok) throw new Error("Ollama HTTP " + res.status);
  const data = await res.json();
  return data.message.content.trim();
}

function sendPrivate(userId, message) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({
    action: "send_private_msg",
    params: { user_id: userId, message },
  }));
}

async function pump() {
  if (working) return;
  working = true;
  while (queue.length) {
    const { userId, text } = queue.shift();
    try {
      const history = historyOf(userId);
      const messages = [
        { role: "system", content: persona },
        ...history,
        { role: "user", content: text },
      ];
      const reply = await callOllama(messages);
      history.push(
        { role: "user", content: text },
        { role: "assistant", content: reply }
      );
      while (history.length > MAX_HISTORY) history.shift();
      sendPrivate(userId, reply);
      console.log(`[回复] ${userId}: ${reply}`);
    } catch (e) {
      sendPrivate(userId, "（糖糖走神了）" + e.message);
    }
  }
  working = false;
}

let ws = null;

function connect() {
  ws = new WebSocket(NAPCAT_WS);

  ws.onopen = () => {
    console.log("已连接 NapCat OneBot：" + NAPCAT_WS);
  };

  ws.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    // 只处理私聊消息事件（OneBot v11）
    if (data.post_type === "message" && data.message_type === "private") {
      const userId = data.user_id;
      const text = (data.raw_message || "").trim();
      if (!text) return;
      if (ALLOWED_USERS.length && !ALLOWED_USERS.includes(userId)) return;
      queue.push({ userId, text });
      pump();
    }
  };

  ws.onclose = () => {
    console.log("连接断开，5 秒后重连…");
    setTimeout(connect, 5000);
  };

  ws.onerror = () => {
    // 交给 onclose 处理
  };
}

console.log("糖糖 QQ 桥接已启动，正在连接 NapCat…");
connect();
