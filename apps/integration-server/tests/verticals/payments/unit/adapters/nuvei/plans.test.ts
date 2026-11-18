/**
 * Nuvei plans → POST /getPlansList.do
 * (https://docs.nuvei.com/api/advanced/indexAdvanced.html#getplanslist).
 *
 * The adapter used to call /getSubscriptionPlans.do, which appears nowhere in
 * Nuvei's API reference. The documented method:
 *   - example request: merchantId, merchantSiteId, planIds, planStatus,
 *     currency, recurringPeriod, "firstResult": "0", "maxResults": "10",
 *     timeStamp, checksum (no clientRequestId);
 *   - checksum: "merchantId, merchantSiteId, planIds, currency, planStatus,
 *     timeStamp, merchantSecretKey", optional fields left out when not sent;
 *   - timeStamp: "according to the GMT+2 time zone in the format:
 *     YYYYMMDDHHmmss";
 *   - example response: { "total": 1, "plans": [ … ], "status": "SUCCESS" }.
 *
 * The real NuveiClient runs here over a faked axios, so the wire body and the
 * checksum are what is asserted. The fake honours only documented fields.
 */
import { createHash } from 'node:crypto'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { NuveiAdapter } from '../../../../../../src/verticals/payments/adapters/nuvei'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'
import { PlanSchema } from '../../../../../../src/verticals/payments/schema/plan'

const { httpPost, baseURLs } = vi.hoisted(() => ({
  httpPost: vi.fn(),
  baseURLs: [] as string[],
}))

vi.mock('axios', () => ({
  default: {
    create: (cfg: { baseURL: string }) => {
      baseURLs.push(cfg.baseURL)
      return { post: httpPost }
    },
  },
}))

const adapter = new NuveiAdapter()
const routed: PaymentsAdapter = adapter
const SECRET = 'nuvei-plans-secret'
const CREDS: Credentials = {
  accessToken: SECRET,
  extra: { merchantId: '2502136204546424962', merchantSiteId: '126006', environment: 'production' },
}
const DOCUMENTED = new Set([
  'merchantId',
  'merchantSiteId',
  'planIds',
  'currency',
  'planStatus',
  'recurringPeriod',
  'firstResult',
  'maxResults',
  'timeStamp',
  'checksum',
])

function planIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(101 + i))
}

function plan(planId: number) {
  return {
    recurringAmount: '4.24',
    recurringPeriod: { month: '1', year: '0', day: '0' },
    merchantId: '2502136204546424962',
    initialAmount: '15.67',
    name: `PLAN-${planId}`,
    description: 'Plan 1',
    planStatus: 'ACTIVE',
    planId,
    currency: 'EUR',
  }
}

/** getPlansList.do over `n` plans; `shortAt` makes the page at that offset one row short. */
function servePlans(
  n: number,
  opts: { shortAt?: number; ceiling?: number; omitTotal?: boolean } = {},
) {
  const calls: { path: string; body: Record<string, unknown> }[] = []
  const ids = planIds(n).map(Number)
  httpPost.mockImplementation(async (path: string, body: Record<string, unknown>) => {
    calls.push({ path, body: { ...body } })
    if (path !== '/getPlansList.do')
      return { data: { status: 'ERROR', reason: `no such method ${path}` } }
    for (const k of Object.keys(body)) {
      if (!DOCUMENTED.has(k)) return { data: { status: 'ERROR', reason: `unknown field ${k}` } }
    }
    const first = Number(body['firstResult'] ?? 0)
    let max = Number(body['maxResults'] ?? 10)
    if (opts.ceiling) max = Math.min(max, opts.ceiling)
    const window = first === opts.shortAt ? max - 1 : max
    return {
      data: {
        ...(opts.omitTotal ? {} : { total: ids.length }),
        plans: ids.slice(first, first + window).map(plan),
        status: 'SUCCESS',
      },
    }
  })
  return calls
}

beforeEach(() => {
  httpPost.mockReset()
  baseURLs.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NuveiAdapter.listPlans', () => {
  it('posts to the documented /getPlansList.do with only documented fields and the documented checksum', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-12-09T10:12:18Z'))
    const calls = servePlans(3)
    const rows = await adapter.listPlans(CREDS, withPageSink({ page: 2, limit: 1 }))
    expect(rows.map((r) => r.id)).toEqual(['102'])
    expect(baseURLs).toEqual(['https://secure.safecharge.com/ppp/api/v1'])
    expect(calls).toHaveLength(1)
    const { path, body } = calls[0]!
    expect(path).toBe('/getPlansList.do')
    // GMT+2 wall clock: 10:12:18Z → 12:12:18, as in the docs' example.
    const timeStamp = '20241209121218'
    expect(body).toEqual({
      merchantId: '2502136204546424962',
      merchantSiteId: '126006',
      firstResult: '1',
      maxResults: '1',
      timeStamp,
      checksum: createHash('sha256')
        .update(`2502136204546424962126006${timeStamp}${SECRET}`, 'utf8')
        .digest('hex'),
    })
    expect(body).not.toHaveProperty('clientRequestId')
  })

  it('returns rows that parse as canonical Plans', async () => {
    servePlans(2)
    const rows = await adapter.listPlans(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows).toHaveLength(2)
    for (const r of rows) PlanSchema.parse(r)
  })

  it('serves 2L+1 plans across three worker pages, each once, with exact hasMore', async () => {
    const L = 10
    servePlans(2 * L + 1)
    const ids: string[] = []
    const reports = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      ids.push(...(await adapter.listPlans(CREDS, params)).map((r) => r.id))
      reports.push(readUpstreamPage(params))
    }
    expect(ids).toEqual(planIds(2 * L + 1))
    expect(reports.map((r) => r?.hasMore)).toEqual([true, true, false])
    expect(reports.map((r) => r?.totalCount)).toEqual([21, 21, 21])
  })

  it('a short page before the total keeps hasMore true', async () => {
    const L = 10
    servePlans(2 * L, { shortAt: L })
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter.listPlans(CREDS, params)
    expect(rows).toHaveLength(L - 1)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, totalCount: 2 * L })
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    servePlans(2 * L + 1)
    const metas = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await adapter.listPlans(CREDS, params)
      metas.push(listPage(rows, params, 'nuvei').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
  })

  it('a response without total reports nothing rather than claiming the end', async () => {
    servePlans(30, { omitTotal: true })
    const params = withPageSink({ page: 1, limit: 10 })
    const rows = await adapter.listPlans(CREDS, params)
    expect(rows).toHaveLength(10)
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('surfaces an upstream ERROR instead of an empty page', async () => {
    httpPost.mockResolvedValue({ data: { status: 'ERROR', reason: 'Invalid checksum' } })
    await expect(adapter.listPlans(CREDS, withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(
      /Invalid checksum/,
    )
  })
})

describe('NuveiAdapter.getPlan', () => {
  it('walks getPlansList.do until the plan turns up, and reads it back', async () => {
    const calls = servePlans(250, { ceiling: 100 })
    const got = await adapter.getPlan!(CREDS, '330')
    expect(got.id).toBe('330')
    PlanSchema.parse(got)
    expect(calls.map((c) => [c.path, c.body['firstResult']])).toEqual([
      ['/getPlansList.do', '0'],
      ['/getPlansList.do', '100'],
      ['/getPlansList.do', '200'],
    ])
  })

  it('a list id reads back through getPlan', async () => {
    servePlans(3)
    const [first] = await adapter.listPlans(CREDS, withPageSink({ page: 1, limit: 1 }))
    expect((await adapter.getPlan!(CREDS, first!.id)).id).toBe(first!.id)
  })

  it('404s once the documented total is exhausted', async () => {
    const calls = servePlans(150, { ceiling: 100 })
    await expect(adapter.getPlan!(CREDS, '9999')).rejects.toMatchObject({ statusCode: 404 })
    expect(calls).toHaveLength(2)
  })

  it('advances by the rows returned when upstream serves fewer than asked', async () => {
    const calls = servePlans(250, { ceiling: 40 })
    const got = await adapter.getPlan!(CREDS, '330')
    expect(got.id).toBe('330')
    expect(calls.map((c) => c.body['firstResult'])).toEqual(['0', '40', '80', '120', '160', '200'])
  })

  it('matches the planId exactly, not by prefix', async () => {
    // Plans are 101..250; '10' is a prefix of '101' but no plan's id.
    servePlans(150, { ceiling: 100 })
    await expect(adapter.getPlan!(CREDS, '10')).rejects.toMatchObject({ statusCode: 404 })
  })
})
