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
  const clean = parseSkill(body).body.replace(/\n## Sources[\s\S]*$/i, '').trim()
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
