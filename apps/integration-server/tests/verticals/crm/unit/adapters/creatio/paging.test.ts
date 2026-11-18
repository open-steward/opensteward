/**
 * Creatio list paging: 1-based `page` + caller's `limit` → OData 4 `$skip` +
 * `$top`, ordered by `Id`, with the end read from `$count=true`.
 *
 * From https://academy.creatio.com/guides/dev/development-on-creatio-platform/integrations-and-api/data-services/odata/basics/references/odata-odata-4
 *
 *   $skip=n    "The first n elements that must be excluded from the selection."
 *   $top=n     "The first n elements that must be included in the selection."
 *   $count=true "Whether to extend the response body with information about
 *              the total number of records in the selection."
 *
 * And from the OData overview ("Limitations of OData protocol"): "The response
 * body can contain up to 20 000 records."
 *
 * listPipelines folds every OpportunityStage into one synthesised pipeline, so
 * it pages that one row locally.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { CreatioAdapter } from '../../../../../../src/verticals/crm/adapters/creatio/index'

const CREDS = { accessToken: 'tok', extra: { instanceUrl: 'https://acme.creatio.com' } }
/** Documented: "The response body can contain up to 20 000 records." */
const MAX = 20000

type Call = (a: CreatioAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: { name: string; entity: string; call: Call }[] = [
  { name: 'listContacts', entity: 'Contact', call: (a, p) => a.listContacts(CREDS, p) },
  { name: 'listCompanies', entity: 'Account', call: (a, p) => a.listCompanies(CREDS, p) },
  { name: 'listDeals', entity: 'Opportunity', call: (a, p) => a.listDeals(CREDS, p) },
  { name: 'listActivities', entity: 'Activity', call: (a, p) => a.listActivities(CREDS, p) },
]

/**
 * A fake Creatio OData 4 service that honours ONLY the documented query
 * options: `$skip`, `$top` (refused above 20 000), `$orderby=Id` and
 * `$count=true`. The store is kept in a shuffled physical order, so a request
 * that does not ask for `$orderby=Id` gets rows in an order that is not Id order.
 * `omitCount` models an instance that never returns `@odata.count`;
 * `ignoreSkip` models one that disregards `$skip`.
 */
function fakeCreatio(
  entity: string,
  total: number,
  opts: { omitCount?: boolean; ignoreSkip?: boolean } = {},
) {
  const store = Array.from({ length: total }, (_, i) => ({
    Id: `r${String(i + 1).padStart(6, '0')}`,
    Name: `n${i + 1}`,
    Title: `t${i + 1}`,
    FirstName: `f${i + 1}`,
    LastName: `l${i + 1}`,
  }))
  // Physical order: reversed. Only $orderby=Id yields Id order.
  const physical = [...store].reverse()
  const sent: URL[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if ((init?.method ?? 'GET') !== 'GET' || url.pathname !== `/0/odata/${entity}`) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    sent.push(url)
    const skip = Number(url.searchParams.get('$skip') ?? '0')
    const top = url.searchParams.has('$top') ? Number(url.searchParams.get('$top')) : MAX
    if (!Number.isInteger(skip) || skip < 0) {
      return new Response(`bad $skip ${String(skip)}`, { status: 400 })
    }
    if (!Number.isInteger(top) || top < 0 || top > MAX) {
      return new Response(`bad $top ${String(top)}`, { status: 400 })
    }
    const ordered = url.searchParams.get('$orderby') === 'Id' ? store : physical
    const count = !opts.omitCount && url.searchParams.get('$count') === 'true'
    const from = opts.ignoreSkip ? 0 : skip
    return new Response(
      JSON.stringify({
        ...(count ? { '@odata.count': store.length } : {}),
        value: ordered.slice(from, from + top),
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  return { store, sent }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(LISTS)('creatio $name paging', ({ entity, call }) => {
  it('serves every row once over pages 1..3 of 2L+1 rows, with exact hasMore', async () => {
    const L = 4
    const { store } = fakeCreatio(entity, 2 * L + 1)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(new CreatioAdapter(), params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(store.map((r) => r.Id))
    expect(more).toEqual([true, true, false])
  })

  it('sends the documented $skip on page 2, ordered by Id', async () => {
    const { sent } = fakeCreatio(entity, 9)
    await call(new CreatioAdapter(), withPageSink({ page: 2, limit: 4 }))
    expect(sent).toHaveLength(1)
    expect(sent[0]!.searchParams.get('$skip')).toBe('4')
    expect(sent[0]!.searchParams.get('$top')).toBe('4')
    expect(sent[0]!.searchParams.get('$orderby')).toBe('Id')
  })

  it('clamps a limit above 20 000 and still serves every row', async () => {
    const total = 2 * MAX + 1
    const { store, sent } = fakeCreatio(entity, total)
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 50000 })
      seen.push(...(await call(new CreatioAdapter(), params)).map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(sent.map((u) => u.searchParams.get('$top'))).toEqual(['20000', '20000', '20000'])
    expect(seen).toEqual(store.map((r) => r.Id))
    expect(more).toEqual([true, true, false])
  })

  it('gives the right meta.hasMore through parseListQuery + listPage', async () => {
    fakeCreatio(entity, 25)
    const adapter = new CreatioAdapter()
    const params = parseListQuery({ page: '2', limit: '10' })
    const env = listPage(await call(adapter, params), params, 'creatio')
    expect(env.data).toHaveLength(10)
    expect(env.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '10' })
    const envLast = listPage(await call(adapter, last), last, 'creatio')
    expect(envLast.data).toHaveLength(5)
    expect(envLast.meta.hasMore).toBe(false)
  })

  it('ends on a full last page when the rows are an exact multiple of the limit', async () => {
    fakeCreatio(entity, 8)
    const params = withPageSink({ page: 2, limit: 4 })
    expect(await call(new CreatioAdapter(), params)).toHaveLength(4)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(8)
  })

  it('without @odata.count, a full page reports no end and a short page ends', async () => {
    const L = 4
    const { store } = fakeCreatio(entity, 2 * L + 1, { omitCount: true })
    const seen: string[] = []
    const more: (boolean | undefined)[] = []
    for (const k of [1, 2, 3]) {
      const params = withPageSink({ page: k, limit: L })
      seen.push(...(await call(new CreatioAdapter(), params)).map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBeUndefined()
    }
    expect(seen).toEqual(store.map((r) => r.Id))
    expect(more).toEqual([undefined, undefined, false])
  })
})

describe('creatio listPipelines paging', () => {
  it('serves its one synthesised pipeline on page 1 only, with exact hasMore', async () => {
    fakeCreatio('OpportunityStage', 3)
    const adapter = new CreatioAdapter()
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter.listPipelines(CREDS, p1)).map((p) => p.id)).toEqual(['default'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)

    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listPipelines(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('folds every stage into the pipeline, past the old 100-stage cap', async () => {
    const { store } = fakeCreatio('OpportunityStage', 150)
    const [pipeline] = await new CreatioAdapter().listPipelines(CREDS, withPageSink({ limit: 10 }))
    expect((pipeline!.stages ?? []).map((s) => s.id)).toEqual(store.map((r) => r.Id))
  })

  it('reads past 20 000 stages with the next $skip, each stage once', async () => {
    const { store, sent } = fakeCreatio('OpportunityStage', MAX + 1)
    const [pipeline] = await new CreatioAdapter().listPipelines(CREDS, withPageSink({ limit: 10 }))
    expect(sent.map((u) => u.searchParams.get('$skip'))).toEqual(['0', String(MAX)])
    expect((pipeline!.stages ?? []).map((s) => s.id)).toEqual(store.map((r) => r.Id))
  })

  it('reads past 20 000 stages without @odata.count, stopping on the short page', async () => {
    const { store, sent } = fakeCreatio('OpportunityStage', MAX + 1, { omitCount: true })
    const [pipeline] = await new CreatioAdapter().listPipelines(CREDS, withPageSink({ limit: 10 }))
    expect(sent.map((u) => u.searchParams.get('$skip'))).toEqual(['0', String(MAX)])
    expect(pipeline!.stages ?? []).toHaveLength(store.length)
  })

  it('stops at @odata.count on an exact 20 000 stages, without an empty extra request', async () => {
    const { sent } = fakeCreatio('OpportunityStage', MAX)
    const [pipeline] = await new CreatioAdapter().listPipelines(CREDS, withPageSink({ limit: 10 }))
    expect(sent).toHaveLength(1)
    expect(pipeline!.stages ?? []).toHaveLength(MAX)
  })

  it('terminates without duplicates when the upstream ignores $skip and sends no count', async () => {
    const { sent } = fakeCreatio('OpportunityStage', MAX, { omitCount: true, ignoreSkip: true })
    const [pipeline] = await new CreatioAdapter().listPipelines(CREDS, withPageSink({ limit: 10 }))
    expect(sent).toHaveLength(2)
    expect(new Set((pipeline!.stages ?? []).map((s) => s.id)).size).toBe(MAX)
    expect(pipeline!.stages ?? []).toHaveLength(MAX)
  })

  it('gives meta.hasMore false through parseListQuery + listPage', async () => {
    fakeCreatio('OpportunityStage', 3)
    const adapter = new CreatioAdapter()
    const params = parseListQuery({ page: '1', limit: '10' })
    const env = listPage(await adapter.listPipelines(CREDS, params), params, 'creatio')
    expect(env.data).toHaveLength(1)
    expect(env.meta.hasMore).toBe(false)
  })

  it('getPipeline still finds the pipeline', async () => {
    fakeCreatio('OpportunityStage', 3)
    expect((await new CreatioAdapter().getPipeline(CREDS, 'default')).stages).toHaveLength(3)
  })
})
