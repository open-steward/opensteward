import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  type Credentials,
} from '@opensteward/shared'
import { TawkToClient } from '../../../../../../src/verticals/customer-support/adapters/tawk-to/client'
import { TawkToAdapter } from '../../../../../../src/verticals/customer-support/adapters/tawk-to/index'

/**
 * listUsers is backed by `agent.me`, which tawk.to documents
 * (https://help.tawk.to/article/rest-api) as "Get the current agent’s
 * details" — "Endpoint: POST https://api.tawk.to/v1/agent.me". It returns
 * ONE agent object, not a list, and takes no paging parameters. The whole
 * collection is that one row, so it is paged locally: page 1 holds it and
 * every later page is empty with hasMore false.
 *
 * The fake honours no parameters on agent.me — it ignores the body.
 */

const CREDS = { accessToken: 'api-key' } as unknown as Credentials

function fakeTawk() {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = []
  vi.spyOn(TawkToClient.prototype, 'post').mockImplementation(
    async (path: string, body: Record<string, unknown> = {}) => {
      calls.push({ path, body })
      if (path === '/agent.me') {
        return { _id: 'agent-1', fullName: 'Agent One', email: 'a1@example.test' } as never
      }
      throw new Error(`unexpected path: ${path}`)
    },
  )
  return { calls }
}

afterEach(() => vi.restoreAllMocks())

const adapter = new TawkToAdapter({})

describe('TawkToAdapter.listUsers paging (agent.me is a single-row collection)', () => {
  it('serves the one agent on page 1 and nothing after, with hasMore exact', async () => {
    fakeTawk()
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 1 })
      const rows = await adapter.listUsers(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['agent-1'])
    expect(hasMore).toEqual([false, false, false])
  })

  it('does not repeat the agent on page 2 and reports it paged locally', async () => {
    const { calls } = fakeTawk()
    const params = withPageSink({ page: 2, limit: 10 })
    const rows = await adapter.listUsers(CREDS, params)
    expect(rows).toEqual([])
    expect(calls).toEqual([{ path: '/agent.me', body: {} }])
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    expect(readUpstreamPage(params)?.totalCount).toBe(1)
  })

  it('serves page 2 through parseListQuery and listPage on the API path', async () => {
    fakeTawk()
    const params = parseListQuery(
      { page: '2', limit: '1' },
      adapter as { capabilities?: { maxPageSize?: number } },
    )
    const env = listPage(await adapter.listUsers(CREDS, params), params, 'tawk-to')
    expect(env.data).toEqual([])
    expect(env.meta.hasMore).toBe(false)
  })

  it('serves page 1 through parseListQuery and listPage on the API path', async () => {
    fakeTawk()
    const params = parseListQuery(
      { page: '1', limit: '1' },
      adapter as { capabilities?: { maxPageSize?: number } },
    )
    const env = listPage(await adapter.listUsers(CREDS, params), params, 'tawk-to')
    expect(env.data.map((r) => r.id)).toEqual(['agent-1'])
    expect(env.meta.hasMore).toBe(false)
  })
})
