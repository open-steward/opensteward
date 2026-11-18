/**
 * BlueSnap recurring list paging: 1-based `page` + caller's `limit` → BlueSnap
 * `pagesize` + `after` (an id keyset).
 *
 * From https://developers.bluesnap.com/v8976-JSON/reference/retrieve-all-subscriptions
 * (GET /services/2/recurring/subscriptions):
 *
 *   after:    "Subscription ID. The response will get the page of results after
 *              the specified ID (exclusive)."
 *   pagesize: "Positive integer. Sets the maximum number of results to return
 *              (i.e. page size). Default is **10** if not set. Maximum is **500**."
 *
 * From https://developers.bluesnap.com/v8976-JSON/reference/retrieve-all-plans
 * (GET /services/2/recurring/plans):
 *
 *   after:    "Plan ID. The response will get the page of results after the
 *              specified ID (exclusive). Keep in mind, the results are also
 *              dependent on sort order."
 *   pagesize: "Positive integer. Sets the maximum number of results to return
 *              (i.e. page size). Default is **10** if not set."
 *
 * The plans reference states no maximum, so plans are not clamped.
 *
 * The end signal, from the subscriptionList and planList object pages:
 *
 *   lastPage: "Indicates whether this is the last page of results. Appears only
 *              if the `gettotal=true` parameter was included in the request."
 *
 * The default order is descending (the docs' example: after=34567 returns
 * 34566, ...), so the fake serves ids high to low.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type PageMaxBearing,
  type QueryParams,
} from '@opensteward/shared'
import { BluesnapAdapter } from '../../../../../../src/verticals/payments/adapters/bluesnap/index'

const SUBS = '/services/2/recurring/subscriptions'
const PLANS = '/services/2/recurring/plans'
const SUBS_MAX = 500

const CREDS: Credentials = {
  accessToken: Buffer.from('api_user:api_pass').toString('base64'),
  extra: { environment: 'sandbox' },
}

type Method = 'listSubscriptions' | 'listPlans'

const CASES: Array<{ method: Method; path: string }> = [
  { method: 'listSubscriptions', path: SUBS },
  { method: 'listPlans', path: PLANS },
]

interface Sent {
  path: string
  params: Record<string, unknown>
}

interface FakeOptions {
  /** Never send `lastPage`, as the docs' "full description" example suggests can happen. */
  noLastPage?: boolean
}

/**
 * A fake BlueSnap that honours ONLY the documented parameters: `pagesize`
 * (default 10; at most 500 on subscriptions, refused above), `after` (an id,
 * exclusive, in descending id order), and `gettotal` (only then are
 * `totalResults` and `lastPage` sent). Anything else is ignored, as an
 * unknown query parameter would be.
 */
function fakeBluesnap(counts: { subscriptions?: number; plans?: number }, opts: FakeOptions = {}) {
  const sent: Sent[] = []
  const ids = (n: number) => Array.from({ length: n }, (_, i) => 1000 + n - i)
  const data: Record<string, number[]> = {
    [SUBS]: ids(counts.subscriptions ?? 0),
    [PLANS]: ids(counts.plans ?? 0),
  }
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    sent.push({ path, params })
    const rows = data[path]
    if (!rows) throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    const size = params.pagesize === undefined ? 10 : Number(params.pagesize)
    if (!Number.isInteger(size) || size < 1 || (path === SUBS && size > SUBS_MAX)) {
      throw Object.assign(new Error(`400 pagesize ${String(params.pagesize)}`), {
        response: { status: 400 },
      })
    }
    let start = 0
    if (params.after !== undefined) {
      const at = rows.indexOf(Number(params.after))
      if (at < 0) throw Object.assign(new Error('400 after'), { response: { status: 400 } })
      start = at + 1
    }
    const slice = rows.slice(start, start + size)
    const isSubs = path === SUBS
    const list = slice.map((id) =>
      isSubs
        ? { subscriptionId: id, status: 'ACTIVE', currency: 'USD', rechargeAmount: 5 }
        : { planId: id, name: `plan ${id}`, status: 'ACTIVE', currency: 'USD' },
    )
    const body: Record<string, unknown> = { [isSubs ? 'subscriptions' : 'plans']: list }
    if (String(params.gettotal) === 'true' && !opts.noLastPage) {
      body.totalResults = rows.length
      body.lastPage = start + size >= rows.length
    }
    return { data: body }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { sent, rows: data }
}

async function callPage(
  adapter: BluesnapAdapter,
  method: Method,
  page: number,
  limit: number,
  creds: Credentials = CREDS,
) {
  const params = withPageSink({ page, limit })
  const items = await adapter[method](creds, params)
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, params }
}

beforeEach(() => {
  _resetCursorPager()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(CASES)('BlueSnap $method paging', ({ method, path }) => {
  it('serves 2L+1 rows over three pages, each id once, in order, with exact hasMore', async () => {
    const L = 3
    const { rows } = fakeBluesnap({ subscriptions: 2 * L + 1, plans: 2 * L + 1 })
    const adapter = new BluesnapAdapter()
    const p1 = await callPage(adapter, method, 1, L)
    const p2 = await callPage(adapter, method, 2, L)
    const p3 = await callPage(adapter, method, 3, L)
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(rows[path]!.map(String))
    const p4 = await callPage(adapter, method, 4, L)
    expect(p4.ids).toEqual([])
    expect(p4.hasMore).toBe(false)
  })

  it('sends page 2 as after=<last id of page 1> at the caller page size', async () => {
    const L = 4
    const { sent } = fakeBluesnap({ subscriptions: 10, plans: 10 })
    const adapter = new BluesnapAdapter()
    const p1 = await callPage(adapter, method, 1, L)
    sent.length = 0
    await callPage(adapter, method, 2, L)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.path).toBe(path)
    expect(sent[0]!.params).toMatchObject({
      pagesize: L,
      after: p1.ids[L - 1],
      gettotal: true,
    })
  })

  it('walks the cursor chain for a page asked for out of order', async () => {
    const { rows } = fakeBluesnap({ subscriptions: 9, plans: 9 })
    const adapter = new BluesnapAdapter()
    const p3 = await callPage(adapter, method, 3, 3)
    expect(p3.ids).toEqual(rows[path]!.slice(6, 9).map(String))
    expect(p3.hasMore).toBe(false)
  })

  it('falls back to a full-page test when lastPage is absent', async () => {
    const L = 3
    const { rows } = fakeBluesnap({ subscriptions: 2 * L, plans: 2 * L }, { noLastPage: true })
    const adapter = new BluesnapAdapter()
    const p1 = await callPage(adapter, method, 1, L)
    const p2 = await callPage(adapter, method, 2, L)
    const p3 = await callPage(adapter, method, 3, L)
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(rows[path]!.map(String))
  })

  it('keeps each connection on its own walk', async () => {
    const { sent } = fakeBluesnap({ subscriptions: 9, plans: 9 })
    const adapter = new BluesnapAdapter()
    await callPage(adapter, method, 1, 3)
    sent.length = 0
    const other: Credentials = {
      accessToken: Buffer.from('other_user:other_pass').toString('base64'),
      extra: { environment: 'sandbox' },
    }
    await callPage(adapter, method, 2, 3, other)
    // No remembered cursor for the second connection: it walks from page 1.
    expect(sent.map((s) => s.params.after)).toEqual([undefined, expect.anything()])
  })

  it('ends on a short final page when lastPage is absent', async () => {
    const L = 3
    const { rows } = fakeBluesnap(
      { subscriptions: 2 * L + 1, plans: 2 * L + 1 },
      { noLastPage: true },
    )
    const adapter = new BluesnapAdapter()
    const p1 = await callPage(adapter, method, 1, L)
    const p2 = await callPage(adapter, method, 2, L)
    const p3 = await callPage(adapter, method, 3, L)
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(rows[path]!.map(String))
  })

  it('never reuses a cursor minted at another page size', async () => {
    const { sent, rows } = fakeBluesnap({ subscriptions: 12, plans: 12 })
    const adapter = new BluesnapAdapter()
    await callPage(adapter, method, 1, 3)
    await callPage(adapter, method, 2, 3)
    sent.length = 0
    const p2 = await callPage(adapter, method, 2, 5)
    expect(p2.ids).toEqual(rows[path]!.slice(5, 10).map(String))
    expect(sent[sent.length - 1]!.params).toMatchObject({
      pagesize: 5,
      after: String(rows[path]![4]),
    })
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    fakeBluesnap({ subscriptions: 5, plans: 5 })
    const adapter = new BluesnapAdapter()
    const run = async (page: string) => {
      // The router passes the adapter so a declared maxPageSize caps the limit;
      // BlueSnap declares none, which the ceiling tests below pin.
      const params: QueryParams = parseListQuery({ limit: '2', page }, adapter as PageMaxBearing)
      const items: unknown[] = await adapter[method](CREDS, params)
      return listPage(items, params, 'bluesnap')
    }
    const r2 = await run('2')
    expect(r2.data).toHaveLength(2)
    expect(r2.meta.hasMore).toBe(true)
    const r3 = await run('3')
    expect(r3.data).toHaveLength(1)
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('BlueSnap pager keys', () => {
  it('keeps subscriptions and plans on separate walks for one connection', async () => {
    const { sent, rows } = fakeBluesnap({ subscriptions: 9, plans: 20 })
    const adapter = new BluesnapAdapter()
    await callPage(adapter, 'listSubscriptions', 1, 3)
    await callPage(adapter, 'listSubscriptions', 2, 3)
    sent.length = 0
    const p2 = await callPage(adapter, 'listPlans', 2, 3)
    expect(sent.every((s) => s.path === PLANS)).toBe(true)
    // The plans walk starts from its own first page: no subscription cursor.
    expect(sent[0]!.params.after).toBeUndefined()
    expect(p2.ids).toEqual(rows[PLANS]!.slice(3, 6).map(String))
  })

  it('sends the previous default page size when a direct call passes no limit', async () => {
    const { sent } = fakeBluesnap({ subscriptions: 3, plans: 3 })
    const adapter = new BluesnapAdapter()
    await adapter.listSubscriptions(CREDS, {})
    await adapter.listPlans(CREDS, {})
    expect(sent.map((s) => s.params.pagesize)).toEqual([100, 100])
  })
})

describe('BlueSnap page size ceiling', () => {
  it('listSubscriptions clamps a limit above 500 and still serves every row', async () => {
    const N = 2 * SUBS_MAX + 1
    const { sent, rows } = fakeBluesnap({ subscriptions: N })
    const adapter = new BluesnapAdapter()
    const pages = [
      await callPage(adapter, 'listSubscriptions', 1, 1000),
      await callPage(adapter, 'listSubscriptions', 2, 1000),
      await callPage(adapter, 'listSubscriptions', 3, 1000),
    ]
    expect(sent.every((s) => s.params.pagesize === SUBS_MAX)).toBe(true)
    expect(pages.map((p) => p.ids.length)).toEqual([500, 500, 1])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(pages.flatMap((p) => p.ids)).toEqual(rows[SUBS]!.map(String))
    expect(readUpstreamPage(pages[0]!.params)?.pageSize).toBe(SUBS_MAX)
  })

  it('listPlans sends the caller limit unclamped (no documented maximum)', async () => {
    const { sent } = fakeBluesnap({ plans: 3 })
    const adapter = new BluesnapAdapter()
    await callPage(adapter, 'listPlans', 1, 700)
    expect(sent[0]!.params.pagesize).toBe(700)
  })

  it('declares no adapter-wide maxPageSize (plans document none)', () => {
    const adapter = new BluesnapAdapter() as { capabilities?: { maxPageSize?: number } }
    expect(adapter.capabilities?.maxPageSize).toBeUndefined()
  })
})
