const functions = require("firebase-functions");
const fetch = require("node-fetch");
const https = require("https");

const OLLAMA_KEY = process.env.OLLAMA_KEY || "";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gpt-oss:120b";

// Тек локалды эмуляторда: SSL-инспекция (антивирус/корпоративтік прокси)
// өз сертификатын қояды, оны Node сенімсіз деп қабылдайды.
// PRODUCTION-да бұл агентті алып тастаңыз.
const INSECURE_AGENT = new https.Agent({rejectUnauthorized: false});

exports.ollamaProxy = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const payload = {...req.body, model: OLLAMA_MODEL};

  try {
    const r = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OLLAMA_KEY}`,
      },
      body: JSON.stringify(payload),
      agent: INSECURE_AGENT,
    });
    const data = await r.json();
    return res.status(r.status).json(data);
  } catch (err) {
    console.error("Ollama proxy error:", err);
    return res.status(500).json({error: err.message});
  }
});
