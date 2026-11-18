/**
 * weclapp listPipelines paging. The pipeline is synthetic: every sales stage
 * from GET /salesStage folds into ONE pipeline with the fixed id
 * 'weclapp-pipeline'. So the adapter drains /salesStage and pages its one
 * pipeline locally: page 2 is empty, never a second pipeline under the same id.
 *
 * From https://www.weclapp.com/api/openapi_v1.yaml:
 *
 *   "By default the operation will not return all entity instances but only
 *   the first 100, this can be changed by using the `pageSize` query parameter
 *   with the number of desired results. But `pageSize` cannot be arbitrarily
 *   high it is usually limited 1000 [...] To get further results it is
 *   necessary to skip entity instances, this is done using the `page` query
 *   parameter."
 *
 * The {"result": [...]} envelope carries no total, so a short page is the end.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { WeclappAdapter } from '../../../../../../src/verticals/crm/adapters/weclapp'

const CREDS = {
  accessToken: 'wc_token',
  extra: { instanceUrl: 'https://acme.weclapp.com/webapp/api/v1' },
}
/** Documented: pageSize "usually limited 1000". */
const MAX = 1000

/**
 * A fake weclapp that honours ONLY the documented `page` (1-based, default 1)
 * and `pageSize` (default 100, at most 1000) on GET /salesStage. Any other
 * query key (offset, sort, ...) is a 400, so a stray param cannot go unseen.
 */
function fakeWeclapp(total: number) {
  const store = Array.from({ length: total }, (_, i) => ({
    id: `s${String(i + 1).padStart(5, '0')}`,
    name: `Stage ${i + 1}`,
  }))
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== '/webapp/api/v1/salesStage') {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    const unknown = [...url.searchParams.keys()].filter((k) => k !== 'page' && k !== 'pageSize')
    if (unknown.length > 0) {
      return new Response(`unexpected query ${unknown.join(',')}`, { status: 400 })
    }
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('pageSize') ?? '100')
    if (!Number.isInteger(page) || page < 1) {
      return new Response(`bad page ${String(page)}`, { status: 400 })
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX) {
      return new Response(`bad pageSize ${String(pageSize)}`, { status: 400 })
    }
    const from = (page - 1) * pageSize
    return new Response(JSON.stringify({ result: store.slice(from, from + pageSize) }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { store, sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('weclapp listPipelines paging', () => {
  it('serves its one pipeline once over pages 1..3, with exact hasMore', async () => {
    const L = 1
    const { store } = fakeWeclapp(2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await new WeclappAdapter().listPipelines(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      if (k === 1) expect(rows[0]?.stages?.map((s) => s.id)).toEqual(store.map((s) => s.id))
    }
    expect(seen).toEqual(['weclapp-pipeline'])
    expect(more).toEqual([false, false, false])
  })

  it('drains every stage, sending the documented page key on the second request', async () => {
    const total = 2 * MAX + 1
    const { store, sent } = fakeWeclapp(total)
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await new WeclappAdapter().listPipelines(CREDS, params)
    expect(sent.map((u) => u.searchParams.get('page'))).toEqual(['1', '2', '3'])
    expect(sent.map((u) => u.searchParams.get('pageSize'))).toEqual(['1000', '1000', '1000'])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.stages?.map((s) => s.id)).toEqual(store.map((s) => s.id))
  })

  it('stops after one request when the first page is short', async () => {
    const { sent } = fakeWeclapp(30)
    const rows = await new WeclappAdapter().listPipelines(
      CREDS,
      withPageSink({ page: 1, limit: 5 }),
    )
    expect(sent).toHaveLength(1)
    expect(rows[0]!.stages).toHaveLength(30)
  })

  it('serves every stage when the caller asks for a limit above the maximum', async () => {
    const { store } = fakeWeclapp(MAX + 1)
    const params = withPageSink({ page: 1, limit: 5000 })
    const rows = await new WeclappAdapter().listPipelines(CREDS, params)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.stages).toHaveLength(store.length)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('bounds the drain at 50 full pages (50,000 stages)', async () => {
    const { sent } = fakeWeclapp(50 * MAX + 5)
    const rows = await new WeclappAdapter().listPipelines(
      CREDS,
      withPageSink({ page: 1, limit: 1 }),
    )
    expect(sent.map((u) => u.searchParams.get('page'))).toEqual(
      Array.from({ length: 50 }, (_, i) => String(i + 1)),
    )
    expect(rows[0]!.stages).toHaveLength(50 * MAX)
  })

  it('returns no pipeline when the tenant has no stages', async () => {
    fakeWeclapp(0)
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await new WeclappAdapter().listPipelines(CREDS, params)).toEqual([])
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeWeclapp(40)
    const adapter = new WeclappAdapter()
    const p1 = parseListQuery({ page: '1', limit: '1' })
    const env1 = listPage(await adapter.listPipelines(CREDS, p1), p1, 'weclapp')
    expect(env1.data).toHaveLength(1)
    expect(env1.meta.hasMore).toBe(false)

    const p2 = parseListQuery({ page: '2', limit: '1' })
    const env2 = listPage(await adapter.listPipelines(CREDS, p2), p2, 'weclapp')
    expect(env2.data).toEqual([])
    expect(env2.meta.hasMore).toBe(false)
  })
})
