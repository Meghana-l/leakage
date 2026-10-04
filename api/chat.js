// Vercel serverless function: keeps your Groq API key secret on the server.
// The browser sends the conversation here; this adds the key and calls Groq.
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const ROLES = new Set(['system', 'user', 'assistant', 'tool']);

module.exports = async (req, res) => {
  // Health check: lets the page know whether the assistant is set up
  if (req.method === 'GET') return res.status(200).json({ ok: true, configured: !!process.env.GROQ_API_KEY });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY is not set' });

  const body = req.body || {};
  if (JSON.stringify(body).length > 80000) return res.status(413).json({ error: 'Request too large' });
  const { messages, tools } = body;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) return res.status(400).json({ error: 'Bad messages' });

  // Only pass through the fields Groq needs
  const clean = messages.filter(m => m && ROLES.has(m.role)).map(m => {
    const o = { role: m.role, content: typeof m.content === 'string' ? m.content : '' };
    if (m.tool_calls) o.tool_calls = m.tool_calls;
    if (m.tool_call_id) o.tool_call_id = m.tool_call_id;
    return o;
  });

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: clean,
        ...(Array.isArray(tools) && tools.length ? { tools, tool_choice: 'auto' } : {}),
        temperature: 0.3,
        max_tokens: 900,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: data?.error?.message || 'Groq error' });
    return res.status(200).json({ message: data.choices?.[0]?.message || { content: '' } });
  } catch (e) {
    return res.status(502).json({ error: 'Could not reach Groq' });
  }
};
