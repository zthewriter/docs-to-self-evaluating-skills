import { createHash } from 'node:crypto'
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

export const chunkKey = (chunk) => `${chunk.url}|${chunk.chunkIndex}`

/**
 * One skill slot per chunk, in document order. A chunk whose text another chunk already
 * holds (`seen`, shared across sources) gets no slot, so a page indexed twice is not skilled twice.
 */
export function planChunkSlots(chunks, taken = new Set(), seen = new Set()) {
  const names = new Set(taken)
  const slots = []
  for (const chunk of chunks) {
    if (seen.has(chunk.contentHash)) continue
    seen.add(chunk.contentHash)
    const key = chunkKey(chunk)
    const stem = String(chunk.title || 'chunk').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '') || 'chunk'
    const name = `${stem}-${createHash('sha256').update(key).digest('hex').slice(0, 6)}`
    if (names.has(name)) continue
    names.add(name)
    slots.push({ name, chunkKey: key, contentHash: chunk.contentHash, pages: [chunk.url.split('#')[0]] })
  }
  return slots
}

const DESCRIBE = `You name what one documentation passage teaches a coding assistant.
Return JSON: {"description":"...","task":"..."}.
- description: one sentence saying what the skill does and when to use it, starting with a verb.
- task: one sentence a developer would type to ask for this.
Use only what the passage says.`

/** Adds the description and task a skill needs; one small call per new chunk. */
export async function describeChunk(slot, chunk) {
  const raw = await completeJson(DESCRIBE, `Title: ${chunk.title}\nURL: ${chunk.url}\n\n${chunk.content.slice(0, 6000)}`, 300)
  return {
    ...slot,
    description: String(raw?.description || chunk.title || slot.name).trim().slice(0, 300),
    task: String(raw?.task || chunk.title || slot.name).trim().slice(0, 300),
  }
}

const MAX_LINKS = 5

/** Page links found in a chunk's text, as absolute URLs without fragment or query. */
export function linksIn(chunk) {
  const base = chunk.url.split('#')[0]
  const found = new Set()
  for (const m of chunk.content.matchAll(/\]\(([^)\s]+)\)|(https?:\/\/[^\s)<>"'`]+)/g)) {
    try {
      const u = new URL(m[1] || m[2], base)
      if (!/^https?:$/.test(u.protocol)) continue
      found.add(`${u.origin}${u.pathname}`.replace(/\.md$/, '').replace(/\/$/, ''))
    } catch { /* not a URL */ }
  }
  return [...found]
}

/**
 * Cross-references between chunk skills, so an agent that opens one can walk to the rest:
 * the chunks before and after it on its page, the start of its page, and the pages its text links to.
 * Every target is a skill that exists, and a skill never points at itself.
 */
export function linkSkills(plans, chunks) {
  const byKey = new Map(chunks.map((c) => [chunkKey(c), c]))
  const pageOf = (url) => url.split('#')[0].replace(/\/$/, '')
  const pagePlans = new Map()
  for (const plan of plans) {
    const page = pageOf(plan.pages[0])
    if (!pagePlans.has(page)) pagePlans.set(page, [])
    pagePlans.get(page).push(plan)
  }
  for (const list of pagePlans.values()) list.sort((a, b) => byKey.get(a.chunkKey).chunkIndex - byKey.get(b.chunkKey).chunkIndex)
  const ref = (relation, plan) => ({ relation, name: plan.name, description: plan.description })

  for (const plan of plans) {
    const page = pageOf(plan.pages[0])
    const siblings = pagePlans.get(page)
    const at = siblings.indexOf(plan)
    const related = []
    if (at > 0) related.push(ref('previous', siblings[at - 1]))
    if (at < siblings.length - 1) related.push(ref('next', siblings[at + 1]))
    if (at > 1) related.push(ref('start of this page', siblings[0]))
    const linked = new Set()
    for (const url of linksIn(byKey.get(plan.chunkKey))) {
      const target = url !== page && pagePlans.get(url)?.[0]
      if (target && !linked.has(target.name) && linked.size < MAX_LINKS) {
        linked.add(target.name)
        related.push(ref('linked from this text', target))
      }
    }
    plan.related = related
  }
  return plans
}
