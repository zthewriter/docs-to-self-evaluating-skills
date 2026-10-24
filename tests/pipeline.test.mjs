import assert from 'node:assert/strict'
import test from 'node:test'
import { alignResults } from '../src/eval-core.mjs'
import { chunkPassage, diffPages, groupPages, inScope, pageHashes, passagesFor } from '../src/pages.mjs'
import { chunkKey, linkSkills, linksIn, planChunkSlots, validatePlan } from '../src/plan.mjs'
import { renderIndex, renderSkill, withRelated } from '../src/skills.mjs'
import { score, shouldAccept, splitFor, trainMisses } from '../src/evals.mjs'
import { newlyPassing } from '../src/daily.mjs'
import { renderReport } from '../src/report.mjs'
import { fetchSourceChunks } from '../src/mcp-studio.mjs'

const chunk = (url, chunkIndex, contentHash, content = `text ${url} ${chunkIndex}`) => ({ url, chunkIndex, contentHash, content, title: url })

test('chunks group by page, ignoring line-range fragments, in document order', () => {
  const pages = groupPages([chunk('https://x/a#L20-L40', 1, 'h2'), chunk('https://x/a#L1-L19', 0, 'h1'), chunk('https://x/b', 0, 'h3')])
  assert.deepEqual([...pages.keys()], ['https://x/a', 'https://x/b'])
  assert.deepEqual(pages.get('https://x/a').chunks.map((c) => c.chunkIndex), [0, 1])
})

test('a page hash moves only when its text does', () => {
  const before = pageHashes(groupPages([chunk('https://x/a', 0, 'h1'), chunk('https://x/b', 0, 'h2'), chunk('https://x/c', 0, 'h4')]))
  const after = groupPages([chunk('https://x/a', 0, 'h1'), chunk('https://x/b', 0, 'CHANGED'), chunk('https://x/d', 0, 'h5')])
  assert.deepEqual(diffPages(before, after), { added: ['https://x/d'], changed: ['https://x/b'], removed: ['https://x/c'] })
})

test('passages respect the character budget and label image descriptions', () => {
  const pages = groupPages([chunk('https://x/a', 0, 'h', 'a'.repeat(50)), chunk('https://x/a', 1, 'h', 'b'.repeat(50)), { ...chunk('https://x/i', 0, 'h', 'logo'), generated: true }])
  assert.ok(!passagesFor(pages, ['https://x/a'], 90).includes('bbbb'))
  assert.match(passagesFor(pages, ['https://x/i'], 1000), /AI description of an image/)
})

test('a plan keeps only real pages and unused, valid names', () => {
  const plan = validatePlan(
    { skills: [
      { name: 'S3 Presigned Uploads!', description: 'Upload files.', task: 'Let users upload.', pages: ['https://x/a', 'https://made-up'] },
      { name: 's3-presigned-uploads', description: 'dupe', task: 'dupe', pages: ['https://x/a'] },
      { name: 'taken', description: 'd', task: 't', pages: ['https://x/a'] },
      { name: 'no-pages', description: 'd', task: 't', pages: ['https://made-up'] },
    ] },
    ['https://x/a'], 10, new Set(['taken']),
  )
  assert.deepEqual(plan, [{ name: 's3-presigned-uploads', description: 'Upload files.', task: 'Let users upload.', pages: ['https://x/a'] }])
})

test('a rendered skill has exact frontmatter and one sources section, whatever the model wrote', () => {
  const md = renderSkill({ name: 'n', description: 'Does "x".' }, '---\nname: wrong\n---\n## Steps\n1. Go\n\n## Sources\n- https://invented', ['https://x/a'])
  assert.match(md, /^---\nname: n\ndescription: "Does \\"x\\"."\n---\n/)
  assert.equal(md.match(/## Sources/g).length, 1)
  assert.ok(md.includes('- https://x/a') && !md.includes('invented'))
})

const graded = (id, split, passes) => ({
  id, split, output: 'the answer says PutObjectCommand and ExpiresIn',
  grading: alignResults(passes.map((_, i) => `check ${i}`), passes.map((p, i) => ({ text: `check ${i}`, passed: p, evidence: 'PutObjectCommand' })), 'the answer says PutObjectCommand and ExpiresIn'),
})

test('evals alternate train and holdout', () => {
  assert.deepEqual([0, 1, 2, 3].map(splitFor), ['train', 'holdout', 'train', 'holdout'])
})

test('a revision is kept only if it passes more overall and no fewer held-out checks', () => {
  const current = score([graded(1, 'train', [false, false]), graded(2, 'holdout', [true, false])])
  const better = score([graded(1, 'train', [true, false]), graded(2, 'holdout', [true, false])])
  const overfit = score([graded(1, 'train', [true, true]), graded(2, 'holdout', [false, false])])
  const same = score([graded(1, 'train', [false, false]), graded(2, 'holdout', [true, false])])
  assert.equal(shouldAccept(current, better), true)
  assert.equal(shouldAccept(current, overfit), false, 'more passes bought by losing a held-out check')
  assert.equal(shouldAccept(current, same), false)
  assert.equal(shouldAccept(current, better, 2), false, 'a one-check gain is inside the noise when minGain is 2')
})

test('the improver sees only train misses', () => {
  const results = [graded(1, 'train', [true, false]), graded(2, 'holdout', [false, false])]
  const misses = trainMisses(results, [{ id: 1, prompt: 'p1' }, { id: 2, prompt: 'p2' }])
  assert.deepEqual(misses.map((m) => [m.prompt, m.failed]), [['p1', ['check 1']]])
})

test('newly passing checks are the ones that failed before', () => {
  assert.deepEqual(newlyPassing([graded(1, 'train', [true, false])], [graded(1, 'train', [true, true])]), ['check 1'])
})

test('the report shows score, baseline, change, and what improved', () => {
  const s = (passed, total) => ({ passed, total, pass_rate: passed / total })
  const md = renderReport({
    date: '2026-10-23', model: 'm',
    sources: [{ label: 'S3 docs', chunks: 10, pages: 3, added: 1, changed: 0, removed: 0, uncovered: ['https://x/z'] }, { label: 'Other', skipped: 'still indexing' }],
    skills: [{ name: 's3', status: 'improved', score: s(5, 6), baseline: s(2, 6), previous: { score: s(4, 6) }, fixed: ['uses ExpiresIn'] }],
  })
  assert.match(md, /\| `s3` \| Improved \| 83% \(5\/6\) \| 33% \| \+17 pts \|/)
  assert.match(md, /now passes:\n- uses ExpiresIn/)
  assert.match(md, /Other\*\*: skipped, still indexing/)
  assert.match(md, /https:\/\/x\/z/)
})

test('the client pages through the chunks endpoint until nextCursor is null', async () => {
  process.env.MCP_STUDIO_API_KEY = 'msk_live_test'
  const seen = []
  const pagesOut = [
    { source: { id: 's' }, chunks: [{ id: 1 }], nextCursor: 'c1' },
    { source: { id: 's' }, chunks: [{ id: 2 }], nextCursor: null },
  ]
  const fetchImpl = async (url, init) => {
    seen.push([String(url), init.headers.Authorization])
    return { ok: true, status: 200, json: async () => pagesOut.shift() }
  }
  const out = await fetchSourceChunks({ server: 'srv', sourceId: 'src' }, { fetchImpl })
  assert.deepEqual(out.chunks.map((c) => c.id), [1, 2])
  assert.match(seen[0][0], /\/api\/mcp\/srv\/sources\/src\/chunks\?limit=100$/)
  assert.match(seen[1][0], /cursor=c1/)
  assert.equal(seen[0][1], 'Bearer msk_live_test')
})

test('scoping keeps only pages under the given prefixes, and everything when none are set', () => {
  const chunks = [chunk('https://docs.test/a', 0, 'h1'), chunk('https://vendor.test/b', 0, 'h2'), chunk('https://docs.test/c', 0, 'h3')]
  assert.deepEqual(inScope(chunks, ['https://docs.test/']).map((c) => c.url), ['https://docs.test/a', 'https://docs.test/c'])
  assert.equal(inScope(chunks, undefined).length, 3)
  assert.equal(inScope(chunks, []).length, 3)
})

test('chunk granularity gives every distinct chunk one skill, and none to an exact duplicate', () => {
  const seen = new Set()
  const first = planChunkSlots([chunk('https://x/a', 0, 'h1'), chunk('https://x/a', 1, 'h2'), chunk('https://x/b', 0, 'h1')], new Set(), seen)
  assert.equal(first.length, 2)
  assert.equal(new Set(first.map((s) => s.name)).size, 2)
  // The same text in another source (shared `seen`) is not skilled twice; a new chunk is.
  const second = planChunkSlots([chunk('https://y/a', 0, 'h2'), chunk('https://y/c', 0, 'h3')], new Set(), seen)
  assert.deepEqual(second.map((s) => s.chunkKey), ['https://y/c|0'])
  // Names are stable across runs, so a refresh finds the skill it wrote before.
  assert.deepEqual(planChunkSlots([chunk('https://x/a', 1, 'h2')]).map((s) => s.name), [first[1].name])
})

test('a chunk skill is written from its own chunk and nothing else on the page', () => {
  const pages = groupPages([chunk('https://x/a', 0, 'h1', 'first text'), chunk('https://x/a', 1, 'h2', 'second text')])
  const [, slot] = planChunkSlots([chunk('https://x/a', 0, 'h1'), chunk('https://x/a', 1, 'h2')])
  const passage = chunkPassage(pages, slot, 1000)
  assert.match(passage, /second text/)
  assert.ok(!passage.includes('first text'))
  assert.equal(slot.chunkKey, chunkKey(chunk('https://x/a', 1, 'h2')))
})

const linked = () => {
  const chunks = [
    chunk('https://x/a', 0, 'h0', 'intro'),
    chunk('https://x/a', 1, 'h1', 'see [blocks](/b) and https://x/missing and [self](/a)'),
    chunk('https://x/a', 2, 'h2', 'end'),
    chunk('https://x/a', 3, 'h3', 'tail'),
    chunk('https://x/b', 0, 'h4', 'blocks'),
  ]
  const plans = planChunkSlots(chunks).map((s) => ({ ...s, description: `does ${s.chunkKey}`, task: 't' }))
  return { plans: linkSkills(plans, chunks), chunks }
}

test('chunk skills point at their neighbors, their page start, and the pages their text links to', () => {
  const { plans } = linked()
  const rel = (i) => plans[i].related.map((r) => `${r.relation}>${plans.find((p) => p.name === r.name).chunkKey}`)
  assert.deepEqual(rel(0), ['next>https://x/a|1'])
  assert.deepEqual(rel(1), ['previous>https://x/a|0', 'next>https://x/a|2', 'linked from this text>https://x/b|0'])
  assert.deepEqual(rel(3), ['previous>https://x/a|2', 'start of this page>https://x/a|0'])
  for (const plan of plans) assert.ok(!plan.related.some((r) => r.name === plan.name))
})

test('links resolve relative addresses and ignore anything that is not a page', () => {
  assert.deepEqual(linksIn(chunk('https://x/docs/a#L1-L9', 0, 'h', 'a [b](../b.md#top) c [d](mailto:q@x.com)')), ['https://x/b'])
})

test('related skills are re-rendered in place, before Sources, and never pile up', () => {
  const { plans } = linked()
  const skill = renderSkill({ name: 'n', description: 'd' }, '## Steps\n1. Go', ['https://x/a'])
  const once = withRelated(skill, plans[1].related)
  assert.equal(withRelated(once, plans[1].related), once)
  assert.ok(once.indexOf('## Related skills') < once.indexOf('## Sources'))
  assert.equal(withRelated(once, []), skill)
  // The improver is shown a skill that has the section and must not echo it back.
  assert.equal(renderSkill({ name: 'n', description: 'd' }, once, ['https://x/a']).match(/## Related skills/g), null)
})

test('the map skill lists every page with its skills', () => {
  const { plans } = linked()
  const md = renderIndex('docs.example.com', plans, new Map([['https://x/a', 'Page A']]))
  assert.match(md, /^---\nname: docs-map-docs-example-com\n/)
  assert.ok(plans.every((p) => md.includes(`](../${p.name}/SKILL.md)`)))
  assert.match(md, /- Page A \(https:\/\/x\/a\)/)
})
