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
const HISTORY_FILE = "chat_history.json";   // 短期记忆（最近 20 句）
const LONG_TERM_FILE = "long_term_memory.json"; // 长期记忆（用户偏好 / 重要事件）
const MAX_MEMORY = 20;                      // 短期记忆条数（用户与 AI 各算一句）
const MAX_LONG_TERM = 10;                   // 每次注入最近 10 条长期记忆

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

// 读取长期记忆；limit 为空时返回全部，否则返回最近 limit 条
function loadLongTermMemory(limit) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, LONG_TERM_FILE), "utf8"));
    if (Array.isArray(data)) return limit == null ? data : data.slice(-limit);
  } catch {
    // 文件不存在或损坏时，从空记忆开始
  }
  return [];
}

// 追加长期记忆（读全量后拼接，不覆盖旧内容）
function appendLongTermMemory(items) {
  const merged = loadLongTermMemory(null).concat(items);
  fs.writeFileSync(
    path.join(dir, LONG_TERM_FILE),
    JSON.stringify(merged, null, 2),
    "utf8"
  );
}

// 把人设 + 最近的长期记忆拼成 System 提示词
function buildSystemPrompt(persona, longTerm) {
  if (!longTerm.length) return persona;
  return (
    persona +
    "\n\n【你一直记得的、关于用户的事】\n" +
    longTerm.map((m) => "· " + m).join("\n")
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

// 退出后，悄悄让模型把本次对话总结成值得长期记住的要点
async function summarizeConversation(history) {
  if (!history.length) return [];
  const convo = history
    .map((m) => (m.role === "user" ? "用户" : "小豆") + "：" + m.content)
    .join("\n");
  const messages = [
    {
      role: "system",
      content:
        "你是记忆整理助手。从下面的对话里提取关于「用户」的、值得长期记住的信息（偏好、喜欢/讨厌、重要事件、计划、个人信息）。每条一行，简短具体，不要序号和解释；没有值得记的就只输出「无」。",
    },
    { role: "user", content: convo },
  ];
  const text = await callOllama(messages);
  return text
    .split("\n")
    .map((s) => s.replace(/^[\s\-*•·\d.、]+/, "").trim())
    .filter((s) => s && !/^无[。.]?$/.test(s));
}

// 退出时的收尾：后台整理长期记忆（失败也静默忽略，不影响退出）
async function finalize(history) {
  try {
    const items = await summarizeConversation(history);
    if (items.length) appendLongTermMemory(items);
  } catch {
    // 总结失败就放弃，不打扰退出流程
  }
}

function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.setPrompt("你：");

  const persona = loadPersona();
  const history = loadHistory();
  const historyStart = history.length; // 本次会话起始位置，退出时只总结新增的对话
  const systemPrompt = buildSystemPrompt(persona, loadLongTermMemory(MAX_LONG_TERM));

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
      { role: "system", content: systemPrompt },
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

    // 更新短期记忆：用户这句 + 我的回复
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
    // 等当前正在进行的回复收尾后再整理长期记忆，避免漏掉最后一句
    (async () => {
      while (busy) await new Promise((r) => setTimeout(r, 100));
      await finalize(history.slice(historyStart));
    })().catch(() => {});
  });

  rl.prompt();
}

main();
