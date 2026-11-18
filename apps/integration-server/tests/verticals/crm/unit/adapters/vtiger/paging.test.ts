import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { VtigerAdapter } from '../../../../../../src/verticals/crm/adapters/vtiger/index'

/**
 * Vtiger's webservice `query` operation pages inside the VTQL statement
 * (https://community.vtiger.com/help/vtigercrm/developers/third-party-app-integration.html):
 *
 *   "[LIMIT [<m>, ] <n>] … integer values to specify the offset and limit
 *    respectively. … Query always limits its output to 100 records, Client
 *    application can use limit operator to get different records."
 *
 * The grammar has no OFFSET keyword, and `result` is a bare array with no
 * next signal. The adapter used to send `LIMIT n OFFSET m` with m taken from
 * offset/start/cursor, never from `page`, so page 2 repeated page 1.
 */

const INSTANCE = 'https://acme.example.test'
const creds = {
  accessToken: 'key',
  extra: { instanceUrl: INSTANCE, username: 'u', session: 'sess' },
}
const UPSTREAM_MAX = 100

type Method = 'listContacts' | 'listCompanies' | 'listDeals' | 'listNotes'

const CASES: Array<{ method: Method; module: string }> = [
  { method: 'listContacts', module: 'Contacts' },
  { method: 'listCompanies', module: 'Accounts' },
  { method: 'listDeals', module: 'Potentials' },
  { method: 'listNotes', module: 'ModComments' },
]

let queries: string[] = []

/**
 * Honours only the documented `LIMIT [<m>, ] <n>` clause (n capped at 100,
 * default 100). Anything else in the LIMIT position is a VTQL syntax error.
 */
function serve(module: string, n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `x${i + 1}` }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      const query = url.searchParams.get('query') ?? ''
      queries.push(query)
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      if (url.searchParams.get('operation') !== 'query' || !query.includes(`FROM ${module}`)) {
        return json({ success: false, error: { code: 'X', message: 'wrong request' } })
      }
      const tail = query.slice(query.indexOf(`FROM ${module}`) + `FROM ${module}`.length)
      const m = /^\s*(?:LIMIT\s+(?:(\d+)\s*,\s*)?(\d+))?\s*;\s*$/i.exec(tail)
      if (!m) return json({ success: false, error: { code: 'QUERY_SYNTAX_ERROR', message: tail } })
      const offset = m[1] === undefined ? 0 : Number(m[1])
      const limit = Math.min(m[2] === undefined ? UPSTREAM_MAX : Number(m[2]), UPSTREAM_MAX)
      return json({ success: true, result: rows.slice(offset, offset + limit) })
    }),
  )
}

function call(method: Method, params: QueryParams) {
  const adapter = new VtigerAdapter()
  return (
    adapter[method] as (c: typeof creds, p: QueryParams) => Promise<Array<{ id: string }>>
  ).call(adapter, creds, params)
}

beforeEach(() => {
  queries = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(CASES)('vtiger $method paging', ({ method, module }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(module, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends the documented LIMIT <offset>, <limit> clause on page 2', async () => {
    serve(module, 7)
    await call(method, withPageSink({ page: 2, limit: 3 }))
    expect(queries.at(-1)).toMatch(new RegExp(`FROM ${module} LIMIT 3, 3;$`))
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    const N = 2 * UPSTREAM_MAX + 5
    serve(module, N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 150 })
      seen.push(...(await call(method, params)).map((r) => r.id))
      expect(queries.at(-1)).toMatch(/LIMIT (\d+, )?100;$/)
      expect(readUpstreamPage(params)?.pageSize).toBe(UPSTREAM_MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `x${i + 1}`))
  })

  it('reports the clamped size it sent even when the query fails', async () => {
    serve('NoSuchModule', 0)
    const params = withPageSink({ page: 1, limit: 500 })
    await expect(call(method, params)).rejects.toThrow()
    expect(readUpstreamPage(params)?.pageSize).toBe(UPSTREAM_MAX)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(module, 7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call(method, params), params, 'vtiger')
    expect(out.data.map((r) => r.id)).toEqual(['x4', 'x5', 'x6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await call(method, last), last, 'vtiger')
    expect(tail.data.map((r) => r.id)).toEqual(['x7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})
