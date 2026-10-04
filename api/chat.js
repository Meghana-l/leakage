// Vercel serverless function: keeps your Groq API key secret on the server.
// The browser sends the conversation here; this adds the key and calls Groq.
// Tries several models in order, so a retired model doesn't break the assistant.
const MODELS = [process.env.GROQ_MODEL, 'openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b']
  .filter((m, i, a) => m && a.indexOf(m) === i);
const ROLES = new Set(['system', 'user', 'assistant', 'tool']);

async function callGroq(model, messages, tools) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model,
      messages,
      ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
      temperature: 0.2,
      max_tokens: 1200,
    }),
  });
  let data = {};
  try { data = await r.json(); } catch (e) {}
  return { ok: r.ok, status: r.status, data };
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ ok: true, configured: !!process.env.GROQ_API_KEY, models: MODELS });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY is not set in Vercel' });

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  if (JSON.stringify(body).length > 80000) return res.status(413).json({ error: 'Request too large' });
  const { messages } = body;
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) return res.status(400).json({ error: 'Bad messages' });

  const clean = messages.filter(m => m && ROLES.has(m.role)).map(m => {
    const o = { role: m.role, content: typeof m.content === 'string' ? m.content : '' };
    if (m.tool_calls) o.tool_calls = m.tool_calls;
    if (m.tool_call_id) o.tool_call_id = m.tool_call_id;
    return o;
  });

  const errors = [];
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let r;
      try { r = await callGroq(model, clean, tools); }
      catch (e) { return res.status(502).json({ error: 'Could not reach Groq' }); }
      if (r.ok) return res.status(200).json({ model, message: r.data.choices?.[0]?.message || { content: '' } });
      const msg = r.data?.error?.message || `HTTP ${r.status}`;
      const code = r.data?.error?.code || '';
      if (r.status === 401) return res.status(401).json({ error: 'Groq rejected the API key. Check GROQ_API_KEY in Vercel.' });
      if (r.status === 429) return res.status(429).json({ error: 'Groq rate limit reached. Try again in a minute.' });
      errors.push(`${model}: ${msg}`);
      if (code === 'tool_use_failed' && attempt === 0) continue; // model fumbled a tool call: retry once
      break; // retired or unsupported model: try the next one
    }
  }
  console.error('Groq failed:', errors.join(' | '));
  return res.status(502).json({ error: errors.join(' | ') });
};
