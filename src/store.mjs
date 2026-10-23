import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// Everything lives in the repo, so the daily workflow commits state back and
// the next run picks up where this one stopped.
export const ROOT = process.env.SKILLS_ROOT || process.cwd()

export const paths = {
  config: join(ROOT, 'skills.config.json'),
  sources: join(ROOT, 'state', 'sources.json'),
  plan: join(ROOT, 'state', 'plan.json'),
  history: join(ROOT, 'state', 'history.jsonl'),
  skill: (name) => join(ROOT, 'skills', name, 'SKILL.md'),
  evals: (name) => join(ROOT, 'skills', name, 'evals', 'evals.json'),
  latest: (name) => join(ROOT, 'skills', name, 'evals', 'latest.json'),
  report: (date) => join(ROOT, 'reports', `${date}.md`),
}

export function readJson(file, fallback) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback
}

export function readText(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null
}

export function write(file, data) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, typeof data === 'string' ? data : `${JSON.stringify(data, null, 2)}\n`)
}

export function appendHistory(row) {
  mkdirSync(dirname(paths.history), { recursive: true })
  appendFileSync(paths.history, `${JSON.stringify(row)}\n`)
}

/** The most recent history row per skill. */
export function lastScores() {
  const text = readText(paths.history) || ''
  const last = {}
  for (const line of text.split('\n')) if (line.trim()) last[JSON.parse(line).skill] = JSON.parse(line)
  return last
}
