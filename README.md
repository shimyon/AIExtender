# Unified AI Provider API

This is a Node.js API that accepts:
- `provider` (`ollama`, `openai`, `gemini`, `claude`)
- `model`
- `prompt`
- `apiKey` (required for cloud providers if not set in `.env`)

Then routes the request to the selected provider and returns a common JSON response.

## Setup

1. Install dependencies:
   - `npm install`
2. Create env file:
   - Copy `.env.example` to `.env`
3. Add API keys in `.env` for providers you want to use.
4. Run server:
   - `npm start`

Server runs on `http://localhost:3000` by default.

## Endpoints

### Health check
- `GET /health`

### Generate
- `POST /api/generate`

Request body:

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "prompt": "Write a one-line poem about coding.",
  "apiKey": "your-provider-api-key"
}
```

Response example:

```json
{
  "provider": "openai",
  "model": "gpt-4o-mini",
  "prompt": "Write a one-line poem about coding.",
  "response": "Logic blooms where midnight keystrokes glow."
}
```
