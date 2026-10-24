import { complete } from './llm.mjs'
import { parseSkill } from './eval-core.mjs'

const GROUNDING = `Use only facts from the source passages. Copy identifiers, package names, commands, flags, environment variable names, and code exactly as the passages write them. If the passages do not cover a step, say so in the skill rather than inventing it.`

const WRITE = `You write an agent skill (SKILL.md) that a coding assistant follows inside a developer's codebase.
${GROUNDING}
Write markdown with these sections:
## When to use
## Steps   (numbered, concrete, with code from the passages where they have it)
## Gotchas (limits, permissions, defaults that surprise people)
## Check your work (how the developer confirms it worked)
Do not write frontmatter. Do not write a sources section. Keep it under 900 words.`

const IMPROVE = `You improve an agent skill so a coding assistant following it produces better work.
${GROUNDING}
You get the current skill, test requests whose answers missed checks, and the source passages. Fix the skill so an assistant following it would satisfy those checks, by adding or correcting steps grounded in the passages. Do not mention the tests. Do not add content the passages do not support. Keep the same sections. Return the full skill body only: no frontmatter, no sources section, under 900 words.`

/** Frontmatter and sources are written here, not by the model, so they stay exact. */
export function renderSkill({ name, description }, body, sourceUrls) {
  const clean = stripRelated(parseSkill(body).body.replace(/\n## Sources[\s\S]*$/i, '')).trim()
  const sources = sourceUrls.map((url) => `- ${url}`).join('\n')
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${clean}\n\n## Sources\n\n${sources}\n`
}

export async function writeSkill(plan, passages) {
  const body = await complete(
    [
      { role: 'system', content: WRITE },
      { role: 'user', content: `Task: ${plan.task}\nSkill: ${plan.description}\n\nSource passages:${passages}` },
    ],
    2000,
  )
  return renderSkill(plan, body, plan.pages)
}

export async function improveSkill(plan, skillMd, misses, passages) {
  const report = misses
    .map((m) => `Request: ${m.prompt}\nMissed checks:\n${m.failed.map((f) => `- ${f}`).join('\n')}\nAnswer excerpt:\n${m.output.slice(0, 1200)}`)
    .join('\n\n---\n\n')
  const body = await complete(
    [
      { role: 'system', content: IMPROVE },
      { role: 'user', content: `Current skill:\n${parseSkill(skillMd).body}\n\nMissed checks:\n${report}\n\nSource passages:${passages}` },
    ],
    2000,
  )
  return renderSkill(plan, body, plan.pages)
}

const stripRelated = (text) => text.replace(/\n## Related skills\n[\s\S]*?(?=\n## Sources|$)/i, '')

/**
 * Adds the cross-references, written by code so every link points at a skill that exists.
 * They go before Sources and are re-rendered every run, so a new neighbor shows up without rewriting the skill.
 */
export function withRelated(skillMd, related) {
  if (!related) return skillMd
  const clean = stripRelated(skillMd)
  const at = clean.search(/\n## Sources\n/)
  const head = (at === -1 ? clean : clean.slice(0, at)).trim()
  const tail = at === -1 ? '' : clean.slice(at).trim()
  const lines = related.map((r) => `- ${r.relation}: [${r.name}](../${r.name}/SKILL.md): ${r.description}`).join('\n')
  const block = related.length ? `## Related skills\n\nOpen these when this skill does not have what you need.\n\n${lines}` : ''
  return `${[head, block, tail].filter(Boolean).join('\n\n')}\n`
}

/** A map of one source: each page, with the skills written from its chunks. Agents start here when they do not know which skill fits. */
export function renderIndex(label, plans, titles) {
  const byPage = new Map()
  for (const plan of plans) {
    const page = plan.pages[0]
    if (!byPage.has(page)) byPage.set(page, [])
    byPage.get(page).push(plan.name)
  }
  const rows = [...byPage].map(([page, names]) => `- ${titles.get(page) || page} (${page}): ${names.map((n) => `[${n}](../${n}/SKILL.md)`).join(', ')}`)
  const description = `Find which skill covers a page of ${label}; start here when you do not know which skill fits.`
  return `---\nname: ${indexName(label)}\ndescription: ${JSON.stringify(description)}\n---\n\n## Pages and their skills\n\nEach skill below was written from one chunk of the page. Open the ones you need, and follow the Related skills inside them.\n\n${rows.join('\n')}\n`
}

export const indexName = (label) => `docs-map-${String(label).toLowerCase().replace(/^https?:\/\//, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)}`
