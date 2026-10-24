import { createHash } from 'node:crypto'

/** Repository chunks carry a line range (`#L10-L50`); the page is the part before it. */
export const pageOf = (url) => url.split('#')[0]

/** Chunks grouped by page, in document order. */
/**
 * Chunks whose page URL starts with one of `prefixes`; all of them when none are set.
 * Use it to keep skills to the docs you meant: a docs host's pages can link to its vendor's own site.
 */
export function inScope(chunks, prefixes) {
  return prefixes?.length ? chunks.filter((c) => prefixes.some((p) => c.url.startsWith(p))) : chunks
}

export function groupPages(chunks) {
  const pages = new Map()
  for (const chunk of chunks) {
    const url = pageOf(chunk.url)
    if (!pages.has(url)) pages.set(url, { url, title: chunk.title || url, chunks: [] })
    pages.get(url).chunks.push(chunk)
  }
  for (const page of pages.values()) {
    page.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex || a.url.localeCompare(b.url))
    page.hash = createHash('sha256').update(page.chunks.map((c) => c.contentHash).join('\n')).digest('hex').slice(0, 16)
  }
  return pages
}

/** What a refresh changed, compared with the page hashes saved last run. */
export function diffPages(previous = {}, pages) {
  const added = []
  const changed = []
  for (const [url, page] of pages) {
    if (!(url in previous)) added.push(url)
    else if (previous[url] !== page.hash) changed.push(url)
  }
  const removed = Object.keys(previous).filter((url) => !pages.has(url))
  return { added, changed, removed }
}

export const pageHashes = (pages) => Object.fromEntries([...pages].map(([url, page]) => [url, page.hash]))

/** The passages a skill is written and graded from, labelled with their URL. */
export function passagesFor(pages, urls, maxChars) {
  let out = ''
  for (const url of urls) {
    const page = pages.get(url)
    if (!page) continue
    for (const chunk of page.chunks) {
      // Image descriptions are written by a model, not the docs; label them so they are not treated as fact.
      const label = chunk.generated ? ' (AI description of an image)' : ''
      const block = `\n[Source: ${chunk.url}]${label}\n${chunk.content.trim()}\n`
      if (out.length + block.length > maxChars) return out
      out += block
    }
  }
  return out
}

/** The one chunk a chunk-level skill is written and graded from. */
export function chunkPassage(pages, plan, maxChars) {
  for (const page of pages.get(plan.pages[0])?.chunks || []) {
    if (`${page.url}|${page.chunkIndex}` !== plan.chunkKey) continue
    const label = page.generated ? ' (AI description of an image)' : ''
    return `\n[Source: ${page.url}]${label}\n${page.content.trim().slice(0, maxChars)}\n`
  }
  return ''
}
