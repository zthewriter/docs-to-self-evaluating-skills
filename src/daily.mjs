import { fetchSourceChunks } from './mcp-studio.mjs'
import { diffPages, groupPages, inScope, pageHashes, passagesFor } from './pages.mjs'
import { planSkills } from './plan.mjs'
import { improveSkill, writeSkill } from './skills.mjs'
import { generateEvals, runEvals, score, shouldAccept, trainMisses } from './evals.mjs'
import { renderReport } from './report.mjs'
import { MODEL } from './llm.mjs'
import { appendHistory, lastScores, paths, readJson, readText, write } from './store.mjs'

const DEFAULTS = { maxSkillsPerSource: 25, evalsPerSkill: 4, improveRounds: 2, minGain: 2, maxPassageChars: 40000 }

// MCP Studio is still writing chunks; paging now could skip or repeat rows that move.
const INDEXING = new Set(['pending', 'crawling'])

export function loadConfig() {
  const config = { ...DEFAULTS, ...readJson(paths.config, {}) }
  const sources = (config.sources || []).filter((s) => s.server && s.sourceId && !String(s.sourceId).startsWith('<'))
  if (!sources.length) throw new Error('Add at least one { "server", "sourceId" } to skills.config.json.')
  return { ...config, sources }
}

/** Assertion texts that failed before and pass now. */
export function newlyPassing(before, after) {
  const failed = new Set(before.flatMap((r) => r.grading.assertion_results.filter((a) => !a.passed).map((a) => `${r.id}:${a.text}`)))
  return after.flatMap((r) => r.grading.assertion_results.filter((a) => a.passed && failed.has(`${r.id}:${a.text}`)).map((a) => a.text))
}

async function runSkill(plan, pages, diff, config, previous) {
  const passages = passagesFor(pages, plan.pages, config.maxPassageChars)
  if (!passages) throw new Error('none of its pages are indexed any more')

  let skillMd = readText(paths.skill(plan.name))
  let evalFile = readJson(paths.evals(plan.name), null)
  const touched =
    plan.pages.some((url) => diff.changed.includes(url) || diff.removed.includes(url)) ||
    JSON.stringify(evalFile?.pages) !== JSON.stringify(plan.pages)
  let status = !skillMd || !evalFile ? 'new' : touched ? 'rebuilt' : 'unchanged'

  if (status !== 'unchanged') {
    // The docs moved, so both the skill and the checks are rewritten from the new text.
    skillMd = await writeSkill(plan, passages)
    const evals = await generateEvals(plan, passages, config.evalsPerSkill)
    if (!evals.length) throw new Error('could not write evals from its pages')
    evalFile = { skill_name: plan.name, task: plan.task, pages: plan.pages, evals, baseline: score(await runEvals(null, evals)) }
    write(paths.evals(plan.name), evalFile)
  }

  const { evals, baseline } = evalFile
  const firstResults = await runEvals(skillMd, evals)
  let results = firstResults
  let current = score(results)
  let rejected = false

  for (let round = 0; round < config.improveRounds && current.passed < current.total; round++) {
    const misses = trainMisses(results, evals)
    if (!misses.length) break
    const candidateMd = await improveSkill(plan, skillMd, misses, passages)
    const candidateResults = await runEvals(candidateMd, evals)
    const candidate = score(candidateResults)
    if (!shouldAccept(current, candidate, config.minGain)) {
      rejected = true
      break
    }
    skillMd = candidateMd
    results = candidateResults
    current = candidate
    if (status === 'unchanged') status = 'improved'
  }

  write(paths.skill(plan.name), skillMd)
  write(paths.latest(plan.name), { model: MODEL, score: current, baseline, results })
  return { name: plan.name, status, score: current, baseline, previous, fixed: newlyPassing(firstResults, results), rejected }
}

export async function daily({ date = new Date().toISOString().slice(0, 10), replan = false, log = console.log } = {}) {
  const config = loadConfig()
  const state = readJson(paths.sources, {})
  const plans = readJson(paths.plan, {})
  const previous = lastScores()
  const sourceRows = []
  const skillRows = []

  for (const src of config.sources) {
    let fetched
    try {
      fetched = await fetchSourceChunks(src)
    } catch (err) {
      sourceRows.push({ label: src.sourceId, skipped: err.message.slice(0, 200) })
      continue
    }
    const { source } = fetched
    const chunks = inScope(fetched.chunks, config.includeUrlPrefixes)
    const label = source.label || source.url
    if (INDEXING.has(source.crawlStatus)) {
      sourceRows.push({ label, skipped: 'MCP Studio is still indexing it; it runs again tomorrow' })
      continue
    }
    const pages = groupPages(chunks)
    const diff = diffPages(state[src.sourceId]?.pages, pages)
    log(`${label}: ${chunks.length} chunks, ${pages.size} pages (+${diff.added.length} ~${diff.changed.length} -${diff.removed.length})`)

    if (replan || !plans[src.sourceId]?.length) {
      const taken = new Set(Object.entries(plans).filter(([id]) => id !== src.sourceId).flatMap(([, list]) => list.map((p) => p.name)))
      plans[src.sourceId] = await planSkills(pages, config.maxSkillsPerSource, taken)
      write(paths.plan, plans)
      log(`  planned ${plans[src.sourceId].length} skills`)
    }

    const covered = new Set(plans[src.sourceId].flatMap((p) => p.pages))
    for (const plan of plans[src.sourceId]) {
      try {
        const row = await runSkill(plan, pages, diff, config, previous[plan.name])
        skillRows.push(row)
        appendHistory({ date, skill: plan.name, sourceId: src.sourceId, status: row.status, score: row.score, baseline: row.baseline, model: MODEL })
        log(`  ${plan.name}: ${row.status}, ${row.score.passed}/${row.score.total}`)
      } catch (err) {
        skillRows.push({ name: plan.name, status: 'failed', error: err.message.slice(0, 160) })
        log(`  ${plan.name}: failed, ${err.message}`)
      }
    }

    state[src.sourceId] = { server: src.server, url: source.url, label, lastSyncAt: new Date().toISOString(), pages: pageHashes(pages) }
    sourceRows.push({
      label, chunks: chunks.length, pages: pages.size,
      added: diff.added.length, changed: diff.changed.length, removed: diff.removed.length,
      uncovered: [...pages.keys()].filter((url) => !covered.has(url)),
    })
  }

  write(paths.sources, state)
  const report = renderReport({ date, model: MODEL, sources: sourceRows, skills: skillRows })
  write(paths.report(date), report)
  return report
}
