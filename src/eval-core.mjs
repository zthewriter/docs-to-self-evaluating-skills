// Grading core from the MCP Studio eval playground, unchanged. A grader's pass
// counts only when its evidence is a real quote from the answer, so a lenient
// model cannot pass an assertion it did not check.

const MIN_QUOTE = 8

export function normalize(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** A pass quote has to be long enough to be a real span of the reply. */
export function quoteInOutput(output, evidence) {
  const quote = normalize(evidence)
  if (quote.length < MIN_QUOTE) return false
  return normalize(output).includes(quote)
}

/**
 * The grader's pass stands only when its evidence quote appears in the reply.
 * @param {string} output
 * @param {{ text?: string, passed?: boolean, evidence?: string }[]} results
 */
export function applyEvidenceGate(output, results) {
  const assertion_results = (results || []).map((row) => {
    const evidence = typeof row.evidence === 'string' ? row.evidence.trim() : ''
    const quoted = quoteInOutput(output, evidence)
    const passed = row.passed === true && quoted
    return {
      text: String(row.text || ''),
      passed,
      evidence: quoted ? evidence : unmatchedEvidence(evidence),
    }
  })
  const passed = assertion_results.filter((row) => row.passed).length
  const total = assertion_results.length
  return {
    assertion_results,
    summary: {
      passed,
      failed: total - passed,
      total,
      pass_rate: total === 0 ? 0 : passed / total,
    },
  }
}

function unmatchedEvidence(evidence) {
  if (!evidence) return 'This answer does not show that.'
  return `Those words are not in the answer: ${evidence}`
}

/**
 * Grade the fixed assertion list. A missing row fails closed.
 * @param {string[]} assertions
 * @param {unknown} rawResults
 * @param {string} output
 */
export function alignResults(assertions, rawResults, output) {
  const raw = Array.isArray(rawResults) ? rawResults : []
  const rows = assertions.map((text, index) => {
    // Models often rephrase the assertion text. Same-position row is the fallback.
    const byText = raw.find((row) => row && row.text === text)
    const found = byText || raw[index]
    return {
      text,
      passed: Boolean(found && found.passed === true),
      evidence: found && typeof found.evidence === 'string' ? found.evidence : '',
    }
  })
  return applyEvidenceGate(output, rows)
}

export function parseSkill(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').trim()
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { name: 'pasted-skill', description: '', body: text }
  return {
    name: yamlField(match[1], 'name') || 'pasted-skill',
    description: yamlField(match[1], 'description'),
    body: match[2].trim(),
  }
}

function yamlField(frontmatter, key) {
  // shortcut: single-line values only, upgrade if a description folds across lines
  const line = frontmatter.split(/\r?\n/).find((entry) => entry.startsWith(`${key}:`))
  if (!line) return ''
  return line.slice(key.length + 1).trim().replace(/^["']|["']$/g, '')
}

export function parseJsonObject(text) {
  const trimmed = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(trimmed)
}
