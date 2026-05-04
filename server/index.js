import express from 'express';
import cors from 'cors';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ─── Per-request credential resolution ──────────────────────────────────────
// Keys come from request headers (forwarded by the browser from localStorage)
// or fall back to environment variables. Nothing is persisted server-side.

function readCreds(req) {
  const h = req.headers;
  return {
    tavily:      h['x-tavily-key']        ?? process.env.TAVILY_API_KEY        ?? '',
    openai:      h['x-openai-key']        ?? process.env.OPENAI_API_KEY        ?? '',
    anthropic:   h['x-anthropic-key']     ?? process.env.ANTHROPIC_API_KEY     ?? '',
    awsAccess:   h['x-aws-access-key-id'] ?? process.env.AWS_ACCESS_KEY_ID     ?? '',
    awsSecret:   h['x-aws-secret-key']    ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
    awsToken:    h['x-aws-session-token'] ?? process.env.AWS_SESSION_TOKEN     ?? '',
    awsRegion:   h['x-aws-region']        ?? process.env.AWS_REGION            ?? 'eu-west-1',
  };
}

// Default Bedrock client (uses env/shared AWS config) — reused when the user
// hasn't supplied per-request AWS credentials.
const defaultBedrock = new BedrockRuntimeClient({
  region: process.env.AWS_REGION ?? 'eu-west-1',
});

function getBedrockClient(creds) {
  // If the user provided explicit AWS creds, spin up a per-request client
  if (creds.awsAccess && creds.awsSecret) {
    return new BedrockRuntimeClient({
      region: creds.awsRegion,
      credentials: {
        accessKeyId: creds.awsAccess,
        secretAccessKey: creds.awsSecret,
        ...(creds.awsToken ? { sessionToken: creds.awsToken } : {}),
      },
    });
  }
  return defaultBedrock;
}

// ─── Model routing ──────────────────────────────────────────────────────────
// Prefix determines which upstream API is used.
//   openai:*     → https://api.openai.com
//   anthropic:*  → https://api.anthropic.com
//   everything else → AWS Bedrock

function classifyModel(modelId) {
  if (modelId.startsWith('openai:'))    return { route: 'openai',    modelName: modelId.slice(7) };
  if (modelId.startsWith('anthropic:')) return { route: 'anthropic', modelName: modelId.slice(10) };
  return { route: 'bedrock', modelName: modelId };
}

function getBedrockProvider(modelId) {
  const id = modelId.replace(/^(eu|us|ap)\./, '');
  if (id.startsWith('anthropic.'))  return 'anthropic';
  if (id.startsWith('amazon.nova')) return 'nova';
  if (id.startsWith('amazon.titan')) return 'titan';
  if (id.startsWith('meta.'))       return 'meta';
  if (id.startsWith('mistral.'))    return 'mistral';
  return 'anthropic';
}

// ─── Bedrock payload builders (unchanged) ──────────────────────────────────

function normaliseAnthropicMessages(messages) {
  return messages.map(m => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content
      : [{ type: 'text', text: String(m.content) }],
  }));
}

function buildBedrockPayload(provider, messages, systemPrompt, maxTokens = 2048) {
  switch (provider) {
    case 'anthropic':
      return {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: normaliseAnthropicMessages(messages),
      };
    case 'nova':
      return {
        ...(systemPrompt ? { system: [{ text: systemPrompt }] } : {}),
        messages: messages.map(m => ({
          role: m.role,
          content: Array.isArray(m.content) ? m.content : [{ text: String(m.content) }],
        })),
        inferenceConfig: { max_new_tokens: maxTokens },
      };
    case 'titan': {
      const prefix = systemPrompt ? `${systemPrompt}\n\n` : '';
      const prompt =
        prefix +
        messages.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n') +
        '\nAssistant:';
      return { inputText: prompt, textGenerationConfig: { maxTokenCount: maxTokens, temperature: 0.7 } };
    }
    case 'meta': {
      const sys = systemPrompt
        ? `<|start_header_id|>system<|end_header_id|>\n${systemPrompt}<|eot_id|>`
        : '';
      const prompt =
        sys +
        messages.map(m => `<|start_header_id|>${m.role}<|end_header_id|>\n${m.content}<|eot_id|>`).join('') +
        '<|start_header_id|>assistant<|end_header_id|>\n';
      return { prompt, max_gen_len: maxTokens, temperature: 0.7 };
    }
    case 'mistral': {
      const prefix = systemPrompt ? `${systemPrompt}\n\n` : '';
      const prompt =
        prefix +
        messages.map(m => (m.role === 'user' ? `[INST] ${m.content} [/INST]` : m.content)).join('\n');
      return { prompt, max_tokens: maxTokens, temperature: 0.7 };
    }
    default:
      return {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: normaliseAnthropicMessages(messages),
      };
  }
}

function extractBedrockResponse(provider, result) {
  switch (provider) {
    case 'anthropic': return result.content[0].text;
    case 'nova':     return result.output?.message?.content?.[0]?.text ?? '';
    case 'titan':    return result.results?.[0]?.outputText ?? '';
    case 'meta':     return result.generation ?? '';
    case 'mistral':  return result.outputs?.[0]?.text ?? '';
    default:         return result.content[0].text;
  }
}

// ─── Unified chat-completion dispatcher ─────────────────────────────────────
// Given messages + an optional system prompt, returns the model's text reply.
// Routes to OpenAI, Anthropic direct, or Bedrock based on the model ID.

async function invokeModel({ modelId, messages, systemPrompt, maxTokens = 2048, creds }) {
  const { route, modelName } = classifyModel(modelId);

  if (route === 'openai') {
    if (!creds.openai) throw new Error('OpenAI API key missing. Add one in Settings.');
    const openaiMessages = [];
    if (systemPrompt) openaiMessages.push({ role: 'system', content: systemPrompt });
    for (const m of messages) {
      openaiMessages.push({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map(c => c.text ?? '').join('')
          : String(m.content),
      });
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${creds.openai}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: openaiMessages,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  if (route === 'anthropic') {
    if (!creds.anthropic) throw new Error('Anthropic API key missing. Add one in Settings.');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': creds.anthropic,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: maxTokens,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages: normaliseAnthropicMessages(messages),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Anthropic HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text ?? '';
  }

  // Bedrock
  const provider = getBedrockProvider(modelName);
  const payload = buildBedrockPayload(provider, messages, systemPrompt, maxTokens);
  const bedrock = getBedrockClient(creds);
  const cmd = new InvokeModelCommand({
    modelId: modelName,
    body: JSON.stringify(payload),
    contentType: 'application/json',
    accept: 'application/json',
  });
  const resp = await bedrock.send(cmd);
  const result = JSON.parse(new TextDecoder().decode(resp.body));
  return extractBedrockResponse(provider, result);
}

// ─── Routes ─────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';

app.post('/api/chat', async (req, res) => {
  const { message, history = [], model = DEFAULT_MODEL } = req.body;
  const messages = history.length > 0 ? history : [{ role: 'user', content: message }];
  try {
    const text = await invokeModel({
      modelId: model,
      messages,
      creds: readCreds(req),
    });
    res.json({ response: text });
  } catch (error) {
    console.error('Chat error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/supervised-questions', async (req, res) => {
  const { message, model = DEFAULT_MODEL } = req.body;
  const systemPrompt = `You are a helpful assistant in supervised mode. The user has sent a request and you must generate clarifying questions to better understand their need before answering.

Generate 3 to 5 slides. Each slide has:
- A short, focused question directly related to the user's request
- 3 to 5 checkbox options that are specific and relevant to that question

Return ONLY valid JSON in this exact format, no explanation, no markdown:
{
  "slides": [
    {
      "question": "...",
      "options": ["...", "...", "..."]
    }
  ]
}`;

  try {
    const text = await invokeModel({
      modelId: model,
      messages: [{
        role: 'user',
        content: `User request: "${message}"\n\nGenerate clarifying question slides as instructed.`,
      }],
      systemPrompt,
      maxTokens: 1024,
      creds: readCreds(req),
    });

    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) throw new Error('Model did not return valid JSON');
    const parsed = JSON.parse(jsonMatch[1] ?? jsonMatch[0]);
    res.json(parsed);
  } catch (error) {
    console.error('Supervised questions error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/summarize', async (req, res) => {
  const { transcript, model = DEFAULT_MODEL } = req.body;
  if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
    return res.status(400).json({ error: 'Missing transcript' });
  }
  const systemPrompt =
    'You summarize a conversation in one short sentence (max 12 words). ' +
    'Capture the topic and the key angle of the exploration. ' +
    'Return only the sentence, no prefix, no quotes, no punctuation other than what ends the sentence.';

  try {
    const text = await invokeModel({
      modelId: model,
      messages: [{ role: 'user', content: `Conversation:\n\n${transcript}\n\nOne-sentence summary:` }],
      systemPrompt,
      maxTokens: 80,
      creds: readCreds(req),
    });
    const clean = text.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim();
    res.json({ summary: clean });
  } catch (error) {
    console.error('Summarize error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── Web search (Tavily → Wikipedia fallback) ───────────────────────────────

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function stripTags(s) {
  return decodeEntities(s.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function searchTavily(query, maxResults, apiKey) {
  const res = await fetchWithTimeout(
    'https://api.tavily.com/search',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: true,
      }),
    },
    8000,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Tavily HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }
  const data = await res.json();
  const results = (data?.results ?? [])
    .slice(0, maxResults)
    .map(r => ({ title: stripTags(r.title ?? ''), url: r.url ?? '', snippet: stripTags(r.content ?? '') }))
    .filter(r => r.title && r.url);
  return { results, answer: data?.answer ?? null };
}

async function searchWikipedia(query, maxResults) {
  const url =
    `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*` +
    `&srlimit=${maxResults}&srsearch=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': UA } }, 5000);
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const data = await res.json();
  const hits = data?.query?.search ?? [];
  return hits.map(h => ({
    title: h.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
    snippet: stripTags(h.snippet ?? ''),
  }));
}

app.post('/api/search', async (req, res) => {
  const { query, maxResults = 5 } = req.body ?? {};
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'Missing query' });
  }
  const q = query.trim();
  const limit = Math.max(1, Math.min(10, Number(maxResults) || 5));
  const creds = readCreds(req);

  if (creds.tavily) {
    try {
      const { results, answer } = await searchTavily(q, limit, creds.tavily);
      if (results.length > 0 || answer) {
        return res.json({ query: q, source: 'tavily', answer, results });
      }
    } catch (err) {
      console.warn('Tavily search failed, falling back:', err.message);
    }
  }

  try {
    const results = await searchWikipedia(q, limit);
    return res.json({ query: q, source: 'wikipedia', results });
  } catch (wikiErr) {
    console.error('Search error (all sources failed):', wikiErr.message);
    return res.status(500).json({ error: 'Search failed on all providers' });
  }
});

app.listen(3001, () => console.log('Server running on port 3001'));
