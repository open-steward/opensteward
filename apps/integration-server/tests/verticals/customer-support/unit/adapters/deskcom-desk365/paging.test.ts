/**
 * Desk365 list paging.
 *
 * The Desk365 v3 OpenAPI spec (https://apps.desk365.io/apis/v3/api-docs?group=v3,
 * loaded by https://apps.desk365.io/apis/api-docs.html?version=v3) documents
 * GET /v3/tickets with:
 *
 *   - `ticket_count`: "Select number of tickets to retrieve per call." (enum 30, 50, 100; default 30)
 *   - `offset`: "Get next 30, 50 or 100 tickets from offset value based on selected ticket_count."
 *
 * The fake below honours ONLY those two parameters: any other ticket_count
 * value falls back to the default 30, and `offset` is a row offset.
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
import { DeskcomDesk365Adapter } from '../../../../../../src/verticals/customer-support/adapters/deskcom-desk365/index'

const creds: Credentials = {
  accessToken: 'key',
  extra: { tenantSubdomain: 'acme' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let handler: (path: string, params: Record<string, unknown>) => unknown

beforeEach(() => {
  _resetRowPager()
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          const params = { ...(cfg?.params ?? {}) }
          calls.push({ path, params })
          return { data: handler(path, params) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

function tickets(n: number, prefix = '') {
  return (_path: string, params: Record<string, unknown>) => {
    const asked = String(params['ticket_count'] ?? '30')
    const size = ['30', '50', '100'].includes(asked) ? Number(asked) : 30
    const offset = Number(params['offset'] ?? 0)
    const ids = Array.from({ length: n }, (_, i) => i + 1)
    return {
      count: n,
      tickets: ids.slice(offset, offset + size).map((id) => ({
        TicketNumber: `${prefix}${id}`,
        Subject: `t${id}`,
        Status: 'open',
        CreatedOn: '2026-01-15 09:30:00',
      })),
    }
  }
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'deskcom-desk365').meta.hasMore ?? undefined)
  }
  return { ids, hasMore }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

describe('deskcom-desk365 listTickets paging', () => {
  const adapter = new DeskcomDesk365Adapter()
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('serves every ticket once, in order, across pages of 2L+1 rows', async () => {
    const L = 20
    handler = tickets(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every ticket once when caller pages span upstream pages of 100', async () => {
    const L = 70
    handler = tickets(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 requests the documented offset with ticket_count=100', async () => {
    handler = tickets(301)
    await run(withPageSink({ page: 2, limit: 150 }))
    expect(calls.every((c) => c.path === '/tickets')).toBe(true)
    expect(calls.every((c) => c.params['ticket_count'] === 100)).toBe(true)
    expect(calls.map((c) => c.params['offset'])).toContain(100)
    expect(calls.map((c) => c.params['offset'])).toContain(200)
  })

  it('an exact multiple of 100 ends on the empty page after it', async () => {
    handler = tickets(200)
    const { ids, hasMore } = await walk(run, 100)
    expect(ids).toEqual(range(200))
    expect(hasMore).toEqual([true, false, false])
  })

  it('a limit above the maximum is clamped and serves the whole collection', async () => {
    handler = tickets(260)
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(260))
    expect(listPage(rows, params, 'deskcom-desk365').meta.hasMore).toBe(false)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = tickets(41)
    const params = parseListQuery({ page: '2', limit: '20' })
    const env = listPage(await run(params), params, 'deskcom-desk365')
    expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })

  it("keeps one connection's rows away from another token on the same subdomain", async () => {
    const other: Credentials = { accessToken: 'other-key', extra: { tenantSubdomain: 'acme' } }
    handler = tickets(250, 'a')
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 20 }))
    handler = tickets(250, 'b')
    calls = []
    const rows = await adapter.listTickets(other, withPageSink({ page: 2, limit: 20 }))
    expect(rows.map((r) => r.id)).toEqual(
      range(40)
        .slice(20)
        .map((id) => `b${id}`),
    )
    expect(calls.length).toBeGreaterThan(0)
  })

  it("keeps one tenant's rows away from another subdomain with the same token", async () => {
    const other: Credentials = { accessToken: 'key', extra: { tenantSubdomain: 'globex' } }
    handler = tickets(250, 'a')
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 20 }))
    handler = tickets(250, 'b')
    calls = []
    const rows = await adapter.listTickets(other, withPageSink({ page: 2, limit: 20 }))
    expect(rows.map((r) => r.id)).toEqual(
      range(40)
        .slice(20)
        .map((id) => `b${id}`),
    )
    expect(calls.length).toBeGreaterThan(0)
  })

  it('a legacy cursor is sent as the upstream offset in one request', async () => {
    handler = tickets(300)
    const rows = await run({ cursor: '60', limit: 50 } as QueryParams)
    expect(calls).toEqual([{ path: '/tickets', params: { ticket_count: 50, offset: 60 } }])
    expect(rows.map((r) => r.id)).toEqual(range(110).slice(60))
  })
})
