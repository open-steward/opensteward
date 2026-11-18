/**
 * Spendesk accounts list through GET /v1/experimental/accounts ("Returns
 * accounts from accounting integrations."), paged by `offset` and `fetch`
 * with `totalResults` in the response. The adapter used to call
 * /v1/supplier-accounts, which is not in the v1 reference. The fake serves
 * only the documented query params.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/accounting/adapter/interface'
import { SpendeskAdapter } from '../../../../../../src/verticals/accounting/adapters/spendesk/index'
import { account } from './fixtures'

const CREDS = { accessToken: 'tok' }
const QUERY_KEYS = new Set([
  'type',
  'includeArchived',
  'searchTerm',
  'offset',
  'after',
  'fetch',
  'taxRate',
  'purpose',
  'isAvailable',
])

function fakeSpendesk(n: number, archived: number[] = []) {
  const calls: Array<{ path: string; params: Record<string, unknown> }> = []
  const every = Array.from({ length: n }, (_, i) =>
    account({ id: `acc-${i}`, isArchived: archived.includes(i) }),
  )
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    const one = /^\/v1\/experimental\/accounts\/([^/]+)$/.exec(path)
    if (one) return { data: account({ id: decodeURIComponent(one[1]!) }) }
    if (path !== '/v1/experimental/accounts') throw new Error(`fake: no GET ${path}`)
    for (const k of Object.keys(params)) if (!QUERY_KEYS.has(k)) throw new Error(`fake: ?${k}`)
    // includeArchived is a documented boolean with no default; the fake treats
    // it as off unless sent, so archived accounts must be asked for.
    const all = params['includeArchived'] === true ? every : every.filter((a) => !a.isArchived)
    const offset = Number(params['offset'] ?? 0)
    const fetch = Number(params['fetch'] ?? 100)
    const data = all.slice(offset, offset + fetch)
    return { data: { data, totalResults: all.length, currentOffset: offset, currentFetch: fetch } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return calls
}

const adapter = () => new SpendeskAdapter({ clientId: 'c', clientSecret: 's' })
const params = (p: QueryParams): QueryParams => withPageSink({ ...p })

afterEach(() => vi.restoreAllMocks())

describe('Spendesk listAccounts: GET /v1/experimental/accounts', () => {
  it('sends offset and fetch for the caller page', async () => {
    const calls = fakeSpendesk(20)
    await adapter().listAccounts(CREDS, params({ page: 3, limit: 4 }))
    expect(calls).toEqual([
      { path: '/v1/experimental/accounts', params: { offset: 8, fetch: 4, includeArchived: true } },
    ])
  })

  it('walks N = 2L+1 rows: every id once, hasMore and total exact', async () => {
    const L = 3
    fakeSpendesk(2 * L + 1)
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 4; page++) {
      const p = params({ page, limit: L })
      const out = await adapter().listAccounts(CREDS, p)
      seen.push(...out.map((r) => r.id!))
      more.push(readUpstreamPage(p)?.hasMore)
      expect(readUpstreamPage(p)?.totalCount).toBe(2 * L + 1)
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `acc-${i}`))
    expect(more).toEqual([true, true, false, false])
  })

  it('a limit above 30 fetches 30, strides by 30 and reports the size', async () => {
    const calls = fakeSpendesk(70)
    const p = params({ page: 2, limit: 100 })
    const out = await adapter().listAccounts(CREDS, p)
    expect(calls[0]!.params).toEqual({ offset: 30, fetch: 30, includeArchived: true })
    expect(out.map((r) => r.id)).toEqual(Array.from({ length: 30 }, (_, i) => `acc-${30 + i}`))
    expect(readUpstreamPage(p)).toMatchObject({ pageSize: 30, hasMore: true })
  })

  it('asks for archived accounts too, and maps them ARCHIVED', async () => {
    fakeSpendesk(3, [1])
    const out = await adapter().listAccounts(CREDS, params({ page: 1, limit: 10 }))
    expect(out.map((r) => [r.id, r.status])).toEqual([
      ['acc-0', 'ACTIVE'],
      ['acc-1', 'ARCHIVED'],
      ['acc-2', 'ACTIVE'],
    ])
  })

  it('getAccount reads the account by id', async () => {
    const calls = fakeSpendesk(0)
    const out = await adapter().getAccount(CREDS, 'acc-9')
    expect(calls.map((c) => c.path)).toEqual(['/v1/experimental/accounts/acc-9'])
    expect(out.id).toBe('acc-9')
  })
})
