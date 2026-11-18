import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { SprinklrServiceClient } from '../../../../../../src/verticals/customer-support/adapters/sprinklr-service/client'
import { SprinklrServiceAdapter } from '../../../../../../src/verticals/customer-support/adapters/sprinklr-service/index'

/**
 * Paging against Sprinklr's Bootstrap Resources API
 * (https://dev.sprinklr.com/bootstrap-resources-v1, spec at
 * https://dev.sprinklr.com/portals/api/sites/spr-apigee-prod-apiprodportal/liveportal/apis/prod/spec):
 * `GET /api/v1/bootstrap/resources` declares only the `Key` header and the
 * `types` query parameter, and "retrieve[s] lists & metadata of objects
 * configured in the environment". There is no paging parameter, so the fake
 * honours none: it returns the whole list for the requested type, and the
 * adapter must slice it locally.
 */

const CREDS = {
  accessToken: 'tok',
  extra: { apiKey: 'k', env: '' },
} as unknown as Credentials

const L = 3
const N = 2 * L + 1

function fakeBootstrap(type: string, n: number) {
  const calls: Array<{ path: string; params: Record<string, unknown> | undefined }> = []
  const rows = Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: `n${i}` }))
  vi.spyOn(SprinklrServiceClient.prototype, 'getV1').mockImplementation(
    async (path: string, params?: Record<string, unknown>) => {
      calls.push({ path, params })
      if (path === '/bootstrap/resources' && params?.['types'] === type) {
        return { [type]: rows } as never
      }
      throw new Error(`unexpected request: ${path} ${JSON.stringify(params)}`)
    },
  )
  return { calls }
}

afterEach(() => vi.restoreAllMocks())

const adapter = new SprinklrServiceAdapter({
  clientId: 'id',
  clientSecret: 'secret',
  redirectUri: 'https://example.test/cb',
})

type ListFn = (creds: Credentials, params: QueryParams) => Promise<Array<{ id: string }>>

const METHODS: Array<{ method: string; type: string; list: ListFn }> = [
  { method: 'listUsers', type: 'ACCESSIBLE_USERS', list: (c, p) => adapter.listUsers(c, p) },
  { method: 'listTeams', type: 'CLIENT_QUEUES', list: (c, p) => adapter.listTeams(c, p) },
  { method: 'listMacros', type: 'MACROS', list: (c, p) => adapter.listMacros(c, p) },
]

for (const { method, type, list } of METHODS) {
  describe(`SprinklrServiceAdapter.${method} pages locally over bootstrap ${type}`, () => {
    it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
      fakeBootstrap(type, N)
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(CREDS, params)
        seen.push(...rows.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(Array.from({ length: N }, (_, i) => `r${i}`))
      expect(hasMore).toEqual([true, true, false])
    })

    it('fetches the unpaginated collection once on page 2 and reports it paged locally', async () => {
      const { calls } = fakeBootstrap(type, N)
      const params = withPageSink({ page: 2, limit: L })
      await list(CREDS, params)
      expect(calls).toEqual([{ path: '/bootstrap/resources', params: { types: type } }])
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      expect(readUpstreamPage(params)?.totalCount).toBe(N)
    })

    it('serves a limit above the old 50-row default in full', async () => {
      fakeBootstrap(type, 120)
      const params = withPageSink({ page: 1, limit: 100 })
      const rows = await list(CREDS, params)
      expect(rows).toHaveLength(100)
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })

    it('pages over the whole collection past the sync worker 500-row page', async () => {
      fakeBootstrap(type, 620)
      const params = withPageSink({ page: 2, limit: 500 })
      const rows = await list(CREDS, params)
      expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 120 }, (_, i) => `r${500 + i}`))
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
      expect(readUpstreamPage(params)?.totalCount).toBe(620)
    })

    it('serves page 2 through parseListQuery and listPage on the API path', async () => {
      fakeBootstrap(type, N)
      const params = parseListQuery(
        { page: '2', limit: String(L) },
        adapter as { capabilities?: { maxPageSize?: number } },
      )
      const env = listPage(await list(CREDS, params), params, 'sprinklr-service')
      expect(env.data.map((r) => r.id)).toEqual(['r3', 'r4', 'r5'])
      expect(env.meta.hasMore).toBe(true)
    })
  })
}

describe('SprinklrServiceAdapter single-record reads see the whole collection', () => {
  it('getUser finds a user beyond the first 50 rows', async () => {
    fakeBootstrap('ACCESSIBLE_USERS', 60)
    const user = await adapter.getUser(CREDS, 'r55')
    expect(user.id).toBe('r55')
  })

  it('getTeam finds a queue beyond the first 50 rows', async () => {
    fakeBootstrap('CLIENT_QUEUES', 60)
    const team = await adapter.getTeam(CREDS, 'r55')
    expect(team.id).toBe('r55')
  })

  it('getMacro finds a macro beyond the first 50 rows', async () => {
    fakeBootstrap('MACROS', 60)
    const macro = await adapter.getMacro(CREDS, 'r55')
    expect(macro.id).toBe('r55')
  })
})

describe('SprinklrServiceAdapter declares no page maximum', () => {
  // Sprinklr documents no maximum for case search rows or bulk-fetch ids, so
  // none is declared.
  it('leaves maxPageSize undeclared', () => {
    const caps = (adapter as { capabilities?: { maxPageSize?: number } }).capabilities
    expect(caps?.maxPageSize).toBeUndefined()
  })
})
