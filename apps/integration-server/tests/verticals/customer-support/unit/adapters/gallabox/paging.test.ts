import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  type Credentials,
} from '@opensteward/shared'
import { GallaboxClient } from '../../../../../../src/verticals/customer-support/adapters/gallabox/client'
import { GallaboxAdapter } from '../../../../../../src/verticals/customer-support/adapters/gallabox/index'

/**
 * Paging against Gallabox's documented Users endpoint
 * (https://developers.gallabox.com/gallabox-api/users):
 *
 *   GET https://server.gallabox.com/devapi/accounts/:accountId/users
 *
 * documents headers and the `accountId` path parameter only, and answers
 * with a bare JSON array of users. There is no page, limit or cursor
 * parameter to send, so the adapter fetches the whole array once and pages it
 * locally. The fake honours ONLY that: it returns every user and records any
 * query parameters so a test can assert none were sent.
 *
 * listTickets and listMessages are not covered here: the Conversations and
 * Messages pages of the same docs site document no endpoint at all, so those
 * methods refuse with 501 NOT_SUPPORTED (see refusals.test.ts).
 */

const CREDS = {
  accessToken: 'key',
  extra: { apiSecret: 'secret', accountId: 'acc1' },
} as unknown as Credentials

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

function fakeGallabox(n: number) {
  const calls: Call[] = []
  const users = Array.from({ length: n }, (_, i) => ({
    id: `u${i}`,
    name: `User ${i}`,
    email: `u${i}@example.test`,
    accounts: [{ accountId: 'acc1', availability: 'Available' }],
  }))
  const spy = vi
    .spyOn(GallaboxClient.prototype, 'get')
    .mockImplementation(async (path: string, params?: Record<string, unknown>) => {
      calls.push({ path, params })
      if (path === '/accounts/acc1/users') return users as never
      throw new Error(`unexpected path: ${path}`)
    })
  return { calls, spy }
}

afterEach(() => vi.restoreAllMocks())

const adapter = new GallaboxAdapter()

describe('GallaboxAdapter.listUsers pages locally', () => {
  const L = 3
  const N = 2 * L + 1

  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    fakeGallabox(N)
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listUsers(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `u${i}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('fetches the whole parameter-less collection once on page 2 and slices it locally', async () => {
    const { calls } = fakeGallabox(N)
    const params = withPageSink({ page: 2, limit: L })
    await adapter.listUsers(CREDS, params)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/accounts/acc1/users')
    expect(calls[0]!.params ?? {}).toEqual({})
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
  })

  it('clamps an oversized API limit to the router maximum and serves every row', async () => {
    fakeGallabox(N)
    const params = parseListQuery(
      { limit: '100000' },
      adapter as { capabilities?: { maxPageSize?: number } },
    )
    expect(params.limit).toBeLessThan(100000)
    const rows = await adapter.listUsers(CREDS, params)
    expect(rows).toHaveLength(N)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves page 2 through parseListQuery and listPage on the API path', async () => {
    fakeGallabox(N)
    const params = parseListQuery(
      { page: '2', limit: String(L) },
      adapter as { capabilities?: { maxPageSize?: number } },
    )
    const env = listPage(await adapter.listUsers(CREDS, params), params, 'gallabox')
    expect(env.data.map((r) => r.id)).toEqual(['u3', 'u4', 'u5'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(N)
  })
})

describe('GallaboxAdapter.listUsers over a large collection', () => {
  it('serves all 1,200 rows at the sync limit of 500 with no prefix truncation', async () => {
    const N = 1200
    fakeGallabox(N)
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await adapter.listUsers(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `u${i}`))
    expect(hasMore).toEqual([true, true, false])
  })
})

describe('GallaboxAdapter.getUser', () => {
  it('finds a user beyond the first local page', async () => {
    fakeGallabox(120)
    const user = await adapter.getUser(CREDS, 'u110')
    expect(user.id).toBe('u110')
  })
})

describe('GallaboxAdapter declares no page maximum', () => {
  // The only paged list (listUsers) is paged locally over a parameter-less
  // endpoint, so Gallabox has no upstream page maximum to declare.
  it('leaves maxPageSize undeclared', () => {
    const caps = (adapter as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})
