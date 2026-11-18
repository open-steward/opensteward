/**
 * awork listWorkspaces paging: a one-row collection, paged locally.
 *
 * awork has no workspace list endpoint. The adapter reads the current
 * workspace off GET /me, documented at
 * https://developers.awork.com/apiv1/users/get-me as:
 *
 *   "Returns the current user's profile together with the selected workspace."
 *   "`workspace` (WorkspaceOfUser, optional) — The user's current workspace model."
 *
 * and takes no query parameters. The whole collection is therefore that one
 * workspace (or none). Before the fix every page returned it, so page 2
 * repeated page 1; now it is sliced by `pageLocally`, which reports the total
 * and `pagedLocally`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { AworkAdapter } from '../../../../../../src/verticals/projects/adapters/awork/index'

const CREDS = { accessToken: 'awork_test' }
const WS_ID = 'ws-1'

/**
 * A fake awork honouring only what GET /me and GET /workspaces/{id} document:
 * neither takes a query parameter, so any parameter is refused.
 */
function fakeAwork(opts: { workspace?: boolean } = {}) {
  const withWorkspace = opts.workspace ?? true
  const get = vi.fn(async (p: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    if (Object.keys(params).length > 0) {
      throw new Error(`undocumented query parameter(s) on ${p}: ${Object.keys(params).join(', ')}`)
    }
    if (p === '/me') {
      return {
        data: withWorkspace ? { id: 'u-1', workspace: { id: WS_ID, name: 'Acme' } } : { id: 'u-1' },
      }
    }
    if (p === `/workspaces/${WS_ID}`) return { data: { id: WS_ID, name: 'Acme', memberCount: 3 } }
    throw new Error(`unexpected path ${p}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

const adapter = () =>
  new AworkAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'https://example.test/cb' })
const call = async (params: QueryParams) =>
  (await adapter().listWorkspaces(CREDS, params)).map((w) => w.id)

afterEach(() => vi.restoreAllMocks())

describe('awork listWorkspaces paging', () => {
  it('page 1 returns the one workspace and reports the end', async () => {
    fakeAwork()
    const params = withPageSink({ page: 1, limit: 1 })
    expect(await call(params)).toEqual([WS_ID])
    expect(readUpstreamPage(params)).toMatchObject({
      hasMore: false,
      totalCount: 1,
      pagedLocally: true,
    })
  })

  it('page 2 is empty instead of repeating page 1', async () => {
    fakeAwork()
    for (const limit of [1, 10]) {
      const params = withPageSink({ page: 2, limit })
      expect(await call(params)).toEqual([])
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: false,
        totalCount: 1,
        pagedLocally: true,
      })
    }
  })

  it('walking pages 1..3 like the sync worker yields the workspace exactly once', async () => {
    fakeAwork()
    const seen: string[] = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 1 })
      seen.push(...(await call(params)))
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    }
    expect(seen).toEqual([WS_ID])
  })

  it('sends no paging parameters to /me (it documents none)', async () => {
    const { get } = fakeAwork()
    await call(withPageSink({ page: 2, limit: 5 }))
    expect(get.mock.calls.map((c) => c[0])).toEqual(['/me', `/workspaces/${WS_ID}`])
  })

  it('a large limit still returns the single workspace', async () => {
    fakeAwork()
    const params = withPageSink({ page: 1, limit: 500 })
    expect(await call(params)).toEqual([WS_ID])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('no current workspace is an empty, finished collection', async () => {
    fakeAwork({ workspace: false })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await call(params)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({
      hasMore: false,
      totalCount: 0,
      pagedLocally: true,
    })
  })

  it('API path: parseListQuery + listPage report an exact end', async () => {
    fakeAwork()
    const p1 = withPageSink(parseListQuery({ page: '1', limit: '10' }))
    const env1 = listPage(await adapter().listWorkspaces(CREDS, p1), p1, 'awork')
    expect(env1.data.map((w) => w.id)).toEqual([WS_ID])
    expect(env1.meta).toMatchObject({ page: 1, hasMore: false, totalCount: 1 })

    const p2 = withPageSink(parseListQuery({ page: '2', limit: '10' }))
    const env2 = listPage(await adapter().listWorkspaces(CREDS, p2), p2, 'awork')
    expect(env2.data).toEqual([])
    expect(env2.meta).toMatchObject({ page: 2, hasMore: false, totalCount: 1 })
  })
})
