/**
 * Verloop list paging.
 *
 * https://help.verloop.io/knowledge-base/verloop-campaign-api/ (List Templates,
 * List Campaigns): both are POST with body
 *   "ListOption": { "Limit": 10, "Offset": 0 }
 * and answer a larger limit with
 *   "msg": "ListOption.Limit is capped at 100"
 *
 * The response's `Count` is not documented as a total (the example shows 2
 * rows and Count 2), so the fake does not send one and the end of the list is
 * a short page. The adapter walks upstream pages of 100 (the cap) with
 * pageByRows and cuts the caller's rows out of them, so `hasMore` is exact.
 * The fake honours ONLY `ListOption.Limit` (rejecting > 100, as documented)
 * and `ListOption.Offset` as a row offset.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { VerloopAdapter } from '../../../../../../src/verticals/customer-support/adapters/verloop/index'

const creds: Credentials = { accessToken: 'tok', extra: { clientId: 'acme' } }

interface Call {
  baseURL: string
  path: string
  body: Record<string, unknown>
}

let calls: Call[] = []
let handler: (call: Call) => unknown

beforeEach(() => {
  _resetRowPager()
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    (config) =>
      ({
        post: async (path: string, body?: Record<string, unknown>) => {
          const call = {
            baseURL: String(config?.baseURL ?? ''),
            path,
            body: JSON.parse(JSON.stringify(body ?? {})),
          }
          calls.push(call)
          return { data: handler(call) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (n: number) => Array.from({ length: n }, (_, i) => `r${i + 1}`)

function listOption(call: Call): { Limit: number; Offset: number } {
  const opt = (call.body['ListOption'] ?? {}) as Record<string, unknown>
  return { Limit: Number(opt['Limit'] ?? 10), Offset: Number(opt['Offset'] ?? 0) }
}

/** A Verloop list endpoint over `n` rows, keyed by `field`. */
function paged(n: number, field: 'Campaigns' | 'Templates') {
  return (call: Call) => {
    const { Limit, Offset } = listOption(call)
    if (Limit > 100) throw new Error('ListOption.Limit is capped at 100')
    const rows = range(n)
      .slice(Offset, Offset + Limit)
      .map((id) => ({
        Meta: { Id: id, CreatedAt: 1564996815, UpdatedAt: 1564996815 },
        Name: `n${id}`,
        Type: 'TYPE_WHATSAPP',
        Status: 'STATUS_DRAFT',
      }))
    return { ListOption: { Limit, Offset }, [field]: rows }
  }
}

const adapter = new VerloopAdapter()

type Run = (p: QueryParams) => Promise<{ id: string }[]>
const methods: [string, string, 'Campaigns' | 'Templates', Run][] = [
  ['listTickets', '/Campaign/ListCampaigns', 'Campaigns', (p) => adapter.listTickets(creds, p)],
  ['listMacros', '/Campaign/ListTemplates', 'Templates', (p) => adapter.listMacros(creds, p)],
]

describe('verloop capabilities', () => {
  it('declares the documented Limit cap of 100', () => {
    expect(adapter.capabilities.maxPageSize).toBe(100)
  })
})

for (const [method, path, field, run] of methods) {
  describe(`verloop ${method} paging`, () => {
    it('serves every row once, in order, across pages of 2L+1 rows', async () => {
      const L = 10
      handler = paged(2 * L + 1, field)
      const ids: string[] = []
      const hasMore: (boolean | null | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await run(params)
        ids.push(...rows.map((r) => r.id))
        hasMore.push(listPage(rows, params, 'verloop').meta.hasMore)
      }
      expect(ids).toEqual(range(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
      expect(calls.every((c) => c.path === path)).toBe(true)
    })

    it('page 2 sends the documented ListOption Offset past the first upstream page', async () => {
      handler = paged(250, field)
      const params = withPageSink({ page: 2, limit: 100 })
      const rows = await run(params)
      expect(rows.map((r) => r.id)).toEqual(range(200).slice(100))
      expect(calls.map(listOption)).toContainEqual({ Limit: 100, Offset: 100 })
      expect(listPage(rows, params, 'verloop').meta.hasMore).toBe(true)
    })

    it('an exact multiple of 100 ends on the last page', async () => {
      handler = paged(200, field)
      const hasMore: (boolean | null | undefined)[] = []
      const ids: string[] = []
      for (const page of [1, 2]) {
        const params = withPageSink({ page, limit: 100 })
        const rows = await run(params)
        ids.push(...rows.map((r) => r.id))
        hasMore.push(listPage(rows, params, 'verloop').meta.hasMore)
      }
      expect(ids).toEqual(range(200))
      expect(hasMore).toEqual([true, false])
    })

    it('a limit above the maximum is clamped, and no request asks for more than 100', async () => {
      handler = paged(250, field)
      const params = parseListQuery({ limit: '9999' }, adapter)
      expect(params.limit).toBe(100)
      const rows = await run(params)
      expect(rows.map((r) => r.id)).toEqual(range(100))
      expect(listPage(rows, params, 'verloop').meta.hasMore).toBe(true)

      calls = []
      const direct = withPageSink({ page: 1, limit: 500 })
      const all = await run(direct)
      expect(all.map((r) => r.id)).toEqual(range(250))
      expect(calls.every((c) => listOption(c).Limit <= 100)).toBe(true)
    })

    it("keeps one connection's rows away from another token", async () => {
      handler = paged(100, field)
      await run(withPageSink({ page: 1, limit: 20 }))
      calls = []
      const other: Credentials = { accessToken: 'other', extra: { clientId: 'acme' } }
      const rows =
        method === 'listTickets'
          ? await adapter.listTickets(other, withPageSink({ page: 2, limit: 20 }))
          : await adapter.listMacros(other, withPageSink({ page: 2, limit: 20 }))
      expect(rows.map((r) => r.id)).toEqual(range(40).slice(20))
      expect(calls.length).toBeGreaterThan(0)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      handler = paged(41, field)
      const params = parseListQuery({ page: '2', limit: '20' }, adapter)
      const env = listPage(await run(params), params, 'verloop')
      expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
      expect(env.meta.hasMore).toBe(true)
      expect(calls.every((c) => c.path === path)).toBe(true)
    })
  })
}

describe('verloop pager keys', () => {
  it('keeps campaigns and templates on separate walks of one connection', async () => {
    const campaigns = paged(100, 'Campaigns')
    handler = (call) =>
      call.path === '/Campaign/ListTemplates'
        ? {
            Templates: range(100).map((id) => ({
              Meta: { Id: `t-${id}`, CreatedAt: 1564996815, UpdatedAt: 1564996815 },
              Name: `t${id}`,
            })),
          }
        : campaigns(call)
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 20 }))
    calls = []
    const rows = await adapter.listMacros(creds, withPageSink({ page: 2, limit: 20 }))
    expect(calls.map((c) => c.path)).toContain('/Campaign/ListTemplates')
    expect(rows.map((r) => r.id)).toEqual(
      range(40)
        .slice(20)
        .map((id) => `t-${id}`),
    )
  })

  it('keeps one tenant subdomain away from another with the same token', async () => {
    handler = paged(100, 'Campaigns')
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 20 }))
    calls = []
    const other: Credentials = { accessToken: 'tok', extra: { clientId: 'globex' } }
    const rows = await adapter.listTickets(other, withPageSink({ page: 2, limit: 20 }))
    expect(rows.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((c) => c.baseURL === 'https://globex.verloop.io/api/v1')).toBe(true)
  })

  it('a direct call without a limit serves the default page of 50', async () => {
    handler = paged(120, 'Campaigns')
    const rows = await adapter.listTickets(creds, {})
    expect(rows.map((r) => r.id)).toEqual(range(50))
  })
})
