/**
 * Nuvei list paging, driven the way the router and the sync worker drive it.
 *
 * listSubscriptions → POST /getSubscriptionsList.do pages by offset
 * (https://docs.nuvei.com/api/advanced/indexAdvanced.html#getsubscriptionslist):
 * the request example sends `"firstResult": "0"` and `"maxResults": "1000"`,
 * the response carries `"total"`, and "a maximum of 1000 results per call can
 * be displayed at one time". The adapter used to send neither field, so every
 * caller page was the same first page.
 *
 * listPaymentMethods → POST /getUserUPOs.do has no paging fields at all
 * (https://docs.nuvei.com/api/advanced/indexAdvanced.html#getuserupos): it
 * returns every UPO of one user, so the adapter slices that whole list.
 *
 * The fakes honour only the documented body fields.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { NuveiAdapter } from '../../../../../../src/verticals/payments/adapters/nuvei'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/nuvei/client', () => ({
  NuveiClient: class {
    post = postMock
  },
}))

const adapter = new NuveiAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'nuvei-paging-secret' }
const SUBS_MAX = 1000
const SUBS_FIELDS = new Set([
  'userTokenId',
  'planIds',
  'subscriptionIds',
  'subscriptionStatus',
  'firstResult',
  'maxResults',
])

function subIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `SUB-${i + 1}`)
}

function upoIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `UPO-${i + 1}`)
}

/** getSubscriptionsList.do over `n` subscriptions, honouring only firstResult/maxResults. */
function serveSubscriptions(n: number, opts: { shortAtOffset?: number } = {}) {
  const calls: Record<string, unknown>[] = []
  const ids = subIds(n)
  postMock.mockImplementation(async (path: string, body: Record<string, unknown> = {}) => {
    if (path !== '/getSubscriptionsList.do') throw new Error(`unexpected path ${path}`)
    calls.push({ ...body })
    for (const k of Object.keys(body)) {
      if (!SUBS_FIELDS.has(k)) return { status: 'ERROR', reason: `unknown field ${k}` }
    }
    const first = body['firstResult'] === undefined ? 0 : Number(body['firstResult'])
    const max = body['maxResults'] === undefined ? SUBS_MAX : Number(body['maxResults'])
    if (!Number.isInteger(first) || first < 0) {
      return { status: 'ERROR', reason: `invalid firstResult ${String(body['firstResult'])}` }
    }
    if (!Number.isInteger(max) || max < 1 || max > SUBS_MAX) {
      return { status: 'ERROR', reason: `invalid maxResults ${String(body['maxResults'])}` }
    }
    const window = first === opts.shortAtOffset ? max - 1 : max
    return {
      status: 'SUCCESS',
      total: ids.length,
      subscriptions: ids.slice(first, first + window).map((subscriptionId) => ({
        subscriptionId,
        userTokenId: 'user-1',
        status: 'ACTIVE',
        currency: 'USD',
        recurringAmount: '10.00',
      })),
    }
  })
  return calls
}

/** getUserUPOs.do: every UPO of the user, whatever else the body says. */
function serveUpos(n: number) {
  const calls: Record<string, unknown>[] = []
  const ids = upoIds(n)
  postMock.mockImplementation(async (path: string, body: Record<string, unknown> = {}) => {
    if (path !== '/getUserUPOs.do') throw new Error(`unexpected path ${path}`)
    calls.push({ ...body })
    return {
      status: 'SUCCESS',
      userTokenId: body['userTokenId'],
      paymentMethods: ids.map((userPaymentOptionId) => ({
        userPaymentOptionId,
        paymentMethodName: 'cc_card',
      })),
    }
  })
  return calls
}

beforeEach(() => {
  postMock.mockReset()
})

describe('NuveiAdapter.listSubscriptions paging', () => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const calls = serveSubscriptions(2 * L + 1)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listSubscriptions(CREDS, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(subIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls[1]).toMatchObject({ firstResult: String(L), maxResults: String(L) })
  })

  it('clamps a limit above 1000 and still serves every row', async () => {
    const N = 2 * SUBS_MAX + 1
    const calls = serveSubscriptions(N)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 5000 })
      const rows = await adapter.listSubscriptions(CREDS, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pageSize).toBe(SUBS_MAX)
    }
    expect(ids).toEqual(subIds(N))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c['maxResults'])).toEqual(['1000', '1000', '1000'])
    expect(calls.map((c) => c['firstResult'])).toEqual(['0', '1000', '2000'])
  })

  it('reports the upstream total when rows end on a page boundary', async () => {
    const L = 10
    serveSubscriptions(2 * L)
    const reports = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      await adapter.listSubscriptions(CREDS, params)
      reports.push(readUpstreamPage(params))
    }
    expect(reports.map((r) => r?.hasMore)).toEqual([true, false])
    expect(reports.map((r) => r?.totalCount)).toEqual([2 * L, 2 * L])
  })

  it('a short page before the total keeps hasMore true (rows returned, not rows asked for)', async () => {
    const L = 10
    // Upstream returns 9 rows at offset 10 although total is 20: offset + size
    // reaches the total, but offset + rows returned does not.
    serveSubscriptions(2 * L, { shortAtOffset: L })
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter.listSubscriptions(CREDS, params)
    expect(rows).toHaveLength(L - 1)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, totalCount: 2 * L })
  })

  it('an empty collection reports totalCount 0 and hasMore false', async () => {
    serveSubscriptions(0)
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await adapter.listSubscriptions(CREDS, params)
    expect(rows).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: 0 })
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serveSubscriptions(2 * L + 1)
    const metas = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await adapter.listSubscriptions(CREDS, params)
      metas.push(listPage(rows, params, 'nuvei').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
  })

  it('sends a valid window for malformed direct-call params', async () => {
    const calls = serveSubscriptions(5)
    await adapter.listSubscriptions(CREDS, withPageSink({ page: 0, limit: 0 }))
    await adapter.listSubscriptions(CREDS, {} as QueryParams)
    await adapter.listSubscriptions(CREDS, withPageSink({ page: 2.7, limit: 10.9 }))
    expect(calls.map((c) => [c['firstResult'], c['maxResults']])).toEqual([
      ['0', '1'],
      ['0', '1000'],
      ['10', '10'],
    ])
  })
})

describe('NuveiAdapter.listPaymentMethods paging', () => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    serveUpos(2 * L + 1)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L, customerId: 'user-1' } as QueryParams)
      const rows = await adapter.listPaymentMethods(CREDS, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pagedLocally).toBe(true)
    }
    expect(ids).toEqual(upoIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 asks for the same user; the endpoint has no paging fields', async () => {
    const calls = serveUpos(3)
    await adapter.listPaymentMethods(
      CREDS,
      withPageSink({ page: 2, limit: 1, customerId: 'user-1' } as QueryParams),
    )
    expect(calls[0]).toEqual({ userTokenId: 'user-1' })
  })

  it('a large limit serves every row once', async () => {
    serveUpos(25)
    const params = withPageSink({ page: 1, limit: 5000, customerId: 'user-1' } as QueryParams)
    const rows = await adapter.listPaymentMethods(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(upoIds(25))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serveUpos(2 * L + 1)
    const metas = []
    for (let page = 1; page <= 3; page++) {
      // parseListQuery keeps no customerId, so this path sends userTokenId "" (a
      // defect outside paging); the fake answers with the same rows either way.
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await adapter.listPaymentMethods(CREDS, params)
      metas.push(listPage(rows, params, 'nuvei').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
  })
})
