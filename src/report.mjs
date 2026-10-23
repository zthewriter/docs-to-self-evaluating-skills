const pct = (s) => (s && s.total ? `${Math.round(s.pass_rate * 100)}%` : 'n/a')
const pts = (n) => (n > 0 ? `+${n}` : `${n}`)

const STATUS = {
  new: 'New',
  rebuilt: 'Rebuilt (docs changed)',
  improved: 'Improved',
  unchanged: 'No change',
  failed: 'Failed',
}

/** The daily report, in markdown. Pure so it is tested without a run. */
export function renderReport({ date, model, sources, skills }) {
  const lines = [`# Skills report, ${date}`, '', `Model: \`${model}\`. Scores are the share of doc-derived checks the answer passed, with the skill and without it.`, '']

  lines.push('## Sources', '')
  for (const s of sources) {
    if (s.skipped) {
      lines.push(`- **${s.label}**: skipped, ${s.skipped}.`)
      continue
    }
    lines.push(`- **${s.label}**: ${s.chunks} chunks on ${s.pages} pages. ${s.added} pages added, ${s.changed} changed, ${s.removed} removed since the last run.${s.uncovered.length ? ` ${s.uncovered.length} pages are not in any skill.` : ''}`)
  }

  lines.push('', '## Skills', '', '| Skill | Status | With skill | Without skill | Since last run |', '|---|---|---|---|---|')
  for (const k of skills) {
    if (k.status === 'failed') {
      lines.push(`| \`${k.name}\` | Failed | | | ${k.error} |`)
      continue
    }
    const since = k.previous ? `${pts(Math.round((k.score.pass_rate - k.previous.score.pass_rate) * 100))} pts` : 'first run'
    lines.push(`| \`${k.name}\` | ${STATUS[k.status]} | ${pct(k.score)} (${k.score.passed}/${k.score.total}) | ${pct(k.baseline)} | ${since} |`)
  }

  lines.push('', 'Each score is one graded run, and an unchanged skill can move by a check or two between days. Read a change that small as noise.')

  const improved = skills.filter((k) => k.fixed?.length)
  if (improved.length) {
    lines.push('', '## What improved', '')
    for (const k of improved) {
      lines.push(`**${k.name}** now passes:`)
      for (const f of k.fixed) lines.push(`- ${f}`)
      lines.push('')
    }
  }

  const rejected = skills.filter((k) => k.rejected)
  if (rejected.length) {
    lines.push('', '## Revisions not kept', '', 'These revisions did not pass enough more checks, or passed fewer of the held-out ones, so the previous skill stays.', '')
    for (const k of rejected) lines.push(`- \`${k.name}\``)
  }

  const uncovered = sources.flatMap((s) => s.uncovered || [])
  if (uncovered.length) {
    lines.push('', '## Pages not in any skill', '', 'Run `npm run plan -- --replan` to plan skills that include them.', '')
    for (const url of uncovered.slice(0, 25)) lines.push(`- ${url}`)
    if (uncovered.length > 25) lines.push(`- and ${uncovered.length - 25} more`)
  }

  return `${lines.join('\n').trimEnd()}\n`
}
