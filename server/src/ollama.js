import { config } from './config.js';

/**
 * Stream a chat completion from Ollama's /api/chat (NDJSON) endpoint.
 * Calls onToken(text) for each token chunk. Returns the full assistant text.
 * Throws on connection errors or non-OK responses (e.g. model not found).
 */
export async function streamChat(messages, onToken, signal) {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.ollamaModel,
      messages,
      stream: true,
      keep_alive: config.ollamaKeepAlive,
      options: { num_predict: config.ollamaNumPredict },
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Ollama responded ${res.status}: ${detail.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Ollama emits one JSON object per line.
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.error) throw new Error(`Ollama error: ${obj.error}`);
      const token = obj.message?.content;
      if (token) {
        full += token;
        onToken(token);
      }
    }
  }
  return full;
}
