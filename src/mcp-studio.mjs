// Client for MCP Studio's "List recently indexed chunks" endpoint:
// https://docs.appatools.com/api/reference/sources

const BASE = (process.env.MCP_STUDIO_BASE_URL || 'https://appatools.com/mcp-studio').replace(/\/$/, '')

/**
 * Every chunk a source holds, plus the source itself.
 *
 * A full read, not `since`: an MCP Studio refresh re-confirms unchanged pages
 * too, so `since` returns nearly everything anyway, and only a full read shows
 * which pages were removed.
 */
export async function fetchSourceChunks({ server, sourceId }, { fetchImpl = fetch, pageSize = 100 } = {}) {
  const key = process.env.MCP_STUDIO_API_KEY
  if (!key) throw new Error('Set MCP_STUDIO_API_KEY.')
  const chunks = []
  let source = null
  let cursor = null
  for (;;) {
    const url = new URL(`${BASE}/api/mcp/${encodeURIComponent(server)}/sources/${encodeURIComponent(sourceId)}/chunks`)
    url.searchParams.set('limit', String(pageSize))
    if (cursor) url.searchParams.set('cursor', cursor)
    const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${key}` } })
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') || 30)
      await new Promise((r) => setTimeout(r, wait * 1000))
      continue
    }
    if (!res.ok) throw new Error(`MCP Studio returned ${res.status} for source ${sourceId}: ${await res.text()}`)
    const body = await res.json()
    source = body.source
    chunks.push(...body.chunks)
    cursor = body.nextCursor
    if (!cursor) return { source, chunks }
  }
}
