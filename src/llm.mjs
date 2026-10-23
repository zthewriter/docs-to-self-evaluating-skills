import { parseJsonObject } from './eval-core.mjs'

export const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

/** One chat completion. Same call the eval playground makes. */
export async function complete(messages, maxTokens, json = false) {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('Set OPENAI_API_KEY.')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `OpenAI request failed (${res.status})`)
  const text = data?.choices?.[0]?.message?.content
  if (typeof text !== 'string' || !text.trim()) throw new Error('The model sent back an empty answer.')
  return text
}

export async function completeJson(system, user, maxTokens) {
  const text = await complete([{ role: 'system', content: system }, { role: 'user', content: user }], maxTokens, true)
  return parseJsonObject(text)
}
