import { alignResults } from './eval-core.mjs'
import { complete, completeJson } from './llm.mjs'

const WRITE_EVALS = `You write evals for an agent skill. The checks come from the documentation passages, not from the skill, so the skill is graded against the docs.
Return JSON: {"evals":[{"prompt":"...","expected_output":"...","assertions":["...","...","..."]}]}.
- prompt: a request a developer would type to a coding assistant. Mix casual, precise, and one edge case.
- expected_output: what a correct answer does, in plain language.
- assertions: 3 objective checks a grader can prove by quoting the answer. Each names one exact thing from the passages (an API name, parameter, command, permission, limit). One requirement per check. No checks about what is absent. Never "the output is good".`

const GRADE = `You grade a reply. Return JSON: {"results":[{"text":"<assertion, copied exactly>","passed":true,"evidence":"<exact contiguous quote from the reply>"}]}. Set passed to true only when the reply does what the assertion says. Copy evidence from the reply, at least 8 characters. If you cannot quote the reply, set passed to false and evidence to "".`

/**
 * Alternate train and holdout. The improver only sees train misses; holdout
 * catches a skill rewritten to pass the tests it was shown.
 */
export const splitFor = (index) => (index % 2 === 0 ? 'train' : 'holdout')

export async function generateEvals(plan, passages, count) {
  const raw = await completeJson(WRITE_EVALS, `Write ${count} evals.\nSkill task: ${plan.task}\n\nSource passages:${passages}`, 2500)
  return (Array.isArray(raw?.evals) ? raw.evals : [])
    .map((e) => ({
      prompt: String(e?.prompt || '').trim(),
      expected_output: String(e?.expected_output || '').trim(),
      assertions: (Array.isArray(e?.assertions) ? e.assertions : []).filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim().slice(0, 240)).slice(0, 4),
    }))
    .filter((e) => e.prompt.length >= 8 && e.expected_output.length >= 8 && e.assertions.length > 0)
    .slice(0, count)
    .map((e, i) => ({ id: i + 1, split: splitFor(i), ...e }))
}

/** The eval playground's two sides: with the skill as the procedure, or with nothing. */
function messagesFor(skillMd, prompt) {
  const system = skillMd
    ? `The skill below is the procedure for this task. Follow it. Reply with the work product only.\n\n${skillMd}`
    : 'Reply with the work product only.'
  return [{ role: 'system', content: system }, { role: 'user', content: prompt }]
}

async function grade(evalCase, output) {
  const raw = await completeJson(
    GRADE,
    `Definition of success:\n${evalCase.expected_output}\n\nAssertions:\n${evalCase.assertions.map((a) => `- ${a}`).join('\n')}\n\nReply:\n${output}`,
    900,
  )
  return alignResults(evalCase.assertions, raw?.results, output)
}

/** Runs every eval with the skill (or without, when `skillMd` is null). */
export async function runEvals(skillMd, evals) {
  return Promise.all(
    evals.map(async (evalCase) => {
      const output = await complete(messagesFor(skillMd, evalCase.prompt), 1500)
      return { id: evalCase.id, split: evalCase.split, output, grading: await grade(evalCase, output) }
    }),
  )
}

export function score(results) {
  const sum = (rows) => {
    const passed = rows.reduce((n, r) => n + r.grading.summary.passed, 0)
    const total = rows.reduce((n, r) => n + r.grading.summary.total, 0)
    return { passed, total, pass_rate: total ? passed / total : 0 }
  }
  return {
    ...sum(results),
    train: sum(results.filter((r) => r.split === 'train')),
    holdout: sum(results.filter((r) => r.split === 'holdout')),
  }
}

/**
 * A revision replaces the skill only if it passes at least `minGain` more checks
 * and no fewer of the ones the improver never saw. Grading one run varies by a
 * check or two, so a gain of one is often noise.
 */
export function shouldAccept(current, candidate, minGain = 1) {
  return candidate.passed >= current.passed + minGain && candidate.holdout.passed >= current.holdout.passed
}

/** Train-split checks that failed, for the improver. */
export function trainMisses(results, evals) {
  return results
    .filter((r) => r.split === 'train')
    .map((r) => ({
      prompt: evals.find((e) => e.id === r.id).prompt,
      output: r.output,
      failed: r.grading.assertion_results.filter((a) => !a.passed).map((a) => a.text),
    }))
    .filter((m) => m.failed.length)
}
