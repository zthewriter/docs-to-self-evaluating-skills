import { completeJson } from './llm.mjs'

const MAX_PAGES_IN_PROMPT = 400

const SYSTEM = `You plan agent skills from documentation. A skill teaches a coding assistant (Cursor, Claude Code, Codex) to do one concrete task in a developer's codebase, such as "upload files from a browser to S3 with presigned URLs".
Return JSON: {"skills":[{"name":"kebab-case-name","description":"...","task":"...","pages":["<url>"]}]}.
- description: one sentence saying what the skill does and when to use it, starting with a verb.
- task: one sentence a developer would type to ask for this.
- pages: 1 to 8 URLs copied exactly from the list, holding what the task needs.
- Prefer tasks a builder does while setting up or integrating, not conceptual overviews.
- Skills must not overlap.`

/** Keeps only skills that name real pages, under a valid name no other skill uses. */
export function validatePlan(raw, pageUrls, max, taken = new Set()) {
  const known = new Set(pageUrls)
  const seen = new Set(taken)
  const out = []
  for (const skill of Array.isArray(raw?.skills) ? raw.skills : []) {
    const name = String(skill?.name || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)
    const pages = (Array.isArray(skill?.pages) ? skill.pages : []).filter((url) => known.has(url))
    const description = String(skill?.description || '').trim().slice(0, 300)
    const task = String(skill?.task || '').trim().slice(0, 300)
    if (!name || seen.has(name) || !pages.length || !description || !task) continue
    seen.add(name)
    out.push({ name, description, task, pages: [...new Set(pages)] })
    if (out.length >= max) break
  }
  return out
}

export async function planSkills(pages, max, taken) {
  // shortcut: very large sources only show the first 400 page titles to the planner; split the source if that matters
  const list = [...pages.values()].slice(0, MAX_PAGES_IN_PROMPT).map((p) => `- ${p.title} | ${p.url}`).join('\n')
  const raw = await completeJson(SYSTEM, `Plan up to ${max} skills from these pages:\n${list}`, 2500)
  return validatePlan(raw, [...pages.keys()], max, taken)
}
