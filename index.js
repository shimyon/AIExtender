require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const supportedProviders = ["ollama", "openai", "gemini", "claude"];

function validateBody(body) {
  const { provider, model, prompt, ollamaBaseUrl } = body || {};

  if (!provider || !model || !prompt) {
    return "provider, model, and prompt are required";
  }

  if (!supportedProviders.includes(provider)) {
    return `Unsupported provider. Use one of: ${supportedProviders.join(", ")}`;
  }

  if (provider === "ollama") {
    if (typeof ollamaBaseUrl !== "string" || ollamaBaseUrl.trim() === "") {
      return "ollamaBaseUrl is required for provider ollama";
    }
    return validateOllamaBaseUrl(ollamaBaseUrl.trim());
  }

  return null;
}

function validateOllamaBaseUrl(urlString) {
  try {
    const u = new URL(String(urlString).trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "ollamaBaseUrl must use http or https";
    }
    return null;
  } catch {
    return "ollamaBaseUrl must be a valid URL (e.g. https://ollama.example.com:11434)";
  }
}

function buildOllamaGenerateUrl(baseInput) {
  const trimmed = String(baseInput).trim().replace(/\/+$/, "");
  if (/\/api\/generate$/i.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed}/api/generate`;
}

async function callOllama(model, prompt, ollamaBaseUrl) {
  const base = String(ollamaBaseUrl).trim();
  const url = buildOllamaGenerateUrl(base);
  const response = await axios.post(url, {
    model,
    prompt,
    stream: false,
  });

  return {
    response: response.data?.response || "",
    inputToken: response.data?.prompt_eval_count || 0,
    outputToken: response.data?.eval_count || 0,
    totalToken: (response.data?.eval_count + response.data?.prompt_eval_count) || 0
  };
}

async function callOpenAI(model, prompt, apiKey) {
  const resolvedApiKey = apiKey || process.env.OPENAI_API_KEY;
  if (!resolvedApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model,
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        "Content-Type": "application/json",
      },
    }
  );
  return { response: response.data?.choices?.[0]?.message?.content || "",
    inputToken: response.data?.usage?.prompt_tokens || 0,
    outputToken: response.data?.usage?.completion_tokens || 0,
    totalToken: response.data?.usage?.total_tokens || 0
   };
}

async function callGemini(model, prompt, apiKey) {
  const resolvedApiKey = apiKey || process.env.GEMINI_API_KEY;
  if (!resolvedApiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${resolvedApiKey}`;

  const response = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }],
  });

  return ({
    response: response.data?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join("\n") || "",
    inputToken: response.data?.usageMetadata?.promptTokenCount || 0,
    outputToken: (response.data?.usageMetadata?.candidatesTokenCount + response.data?.usageMetadata?.thoughtsTokenCount) || 0,
    totalToken: response.data?.usageMetadata?.totalTokenCount || 0
  }
  );
}

async function callClaude(model, prompt, apiKey) {
  const resolvedApiKey = apiKey || process.env.CLAUDE_API_KEY;
  if (!resolvedApiKey) {
    throw new Error("Missing CLAUDE_API_KEY");
  }

  const response = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        "x-api-key": resolvedApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
    }
  );

  return ({
    response: response.data?.content?.map((part) => part.text).filter(Boolean).join("\n") || "",
    inputToken: response.data?.usage?.input_tokens || 0,
    outputToken: response.data?.usage?.output_tokens || 0,
    totalToken: (response.data?.usage?.input_tokens + response.data?.usage?.output_tokens) || 0
  }
  );
}

async function getProviderResponse(
  provider,
  model,
  prompt,
  apiKey,
  ollamaBaseUrl
) {
  switch (provider) {
    case "ollama":
      return callOllama(model, prompt, ollamaBaseUrl);
    case "openai":
      return callOpenAI(model, prompt, apiKey);
    case "gemini":
      return callGemini(model, prompt, apiKey);
    case "claude":
      return callClaude(model, prompt, apiKey);
    default:
      throw new Error("Unsupported provider");
  }
}

app.post("/api/generate", async (req, res) => {
  const error = validateBody(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const { provider, model, prompt, apiKey, ollamaBaseUrl } = req.body;

  try {
    const text = await getProviderResponse(
      provider,
      model,
      prompt,
      apiKey,
      ollamaBaseUrl
    );
    return res.json({
      provider,
      model,
      prompt,
      response: text,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const details = err.response?.data || err.message;
    return res.status(status).json({
      error: "Failed to fetch response from provider",
      details,
    });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

const server = app.listen(port);

server.once("error", (err) => {
  const who = `[pid ${process.pid}]`;
  if (err.code === "EADDRINUSE") {
    console.error(
      `${who} Port ${port} is already in use. Stop the other Node/debug session, or set PORT in .env.`,
      "Windows: netstat -ano | findstr :" + port + " then taskkill /PID <pid> /F"
    );
  } else {
    console.error(`${who} Server failed to start:`, err);
  }
  process.exit(1);
});

server.once("listening", () => {
  console.log(
    `[pid ${process.pid}] API server running on http://localhost:${port}`
  );
});
