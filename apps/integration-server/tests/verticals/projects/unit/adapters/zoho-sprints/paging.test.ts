/**
 * Zoho Sprints listWorkspaces paging: GET /zsapi/teams/ documents no paging
 * parameter and returns every workspace the user belongs to, so the adapter
 * pages the `portals` array locally.
 *
 * Zoho Sprints API docs (https://sprints.zoho.com/apidoc.html, "Get all
 * workspaces"): "Fetch the list of all the workspaces in which you are
 * associated." — method GET, url "/teams/", no Parameters section, example
 * request "https://sprintsapi.zoho.com/zsapi/teams/".
 *
 * Before the fix listWorkspaces ignored `page` and `limit`, so page 2 repeated
 * page 1 and every page returned the whole collection.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { ZohoSprintsAdapter } from '../../../../../../src/verticals/projects/adapters/zoho-sprints/index'

const CREDS = { accessToken: 'tok' }
const L = 3
const N = 2 * L + 1

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => String(i + 1))
}

function fakeTeams(n = N) {
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    if (path !== '/teams/') throw new Error(`unexpected path ${path}`)
    // The endpoint documents no parameters: any query param is refused.
    const keys = Object.keys(config?.params ?? {})
    if (keys.length) throw new Error(`undocumented params ${keys.join(',')} on /teams/`)
    return {
      data: {
        myTeamId: '1',
        portals: rows(n).map((id) => ({ zsoid: id, teamName: `team${id}`, type: 0 })),
        status: 'success',
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get }
}

const adapter = () =>
  new ZohoSprintsAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'https://x.test/cb' })

afterEach(() => vi.restoreAllMocks())

describe('zoho-sprints listWorkspaces paging (GET /teams/ is unpaginated)', () => {
  it('walks pages 1..3 at limit L and yields every workspace once, in order, with exact hasMore', async () => {
    fakeTeams()
    const seen: string[] = []
    const expectedHasMore = [true, true, false]
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const got = (await adapter().listWorkspaces(CREDS, params)).map((w) => w.id)
      expect(got.length).toBe(k < 3 ? L : 1)
      seen.push(...got)
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: expectedHasMore[k - 1],
        totalCount: N,
        pagedLocally: true,
      })
    }
    expect(seen).toEqual(rows(N))
  })

  it('page 2 sends no paging parameter upstream (none is documented) and differs from page 1', async () => {
    const { get } = fakeTeams()
    const p1 = (await adapter().listWorkspaces(CREDS, withPageSink({ page: 1, limit: L }))).map(
      (w) => w.id,
    )
    const p2 = (await adapter().listWorkspaces(CREDS, withPageSink({ page: 2, limit: L }))).map(
      (w) => w.id,
    )
    expect(p2).not.toEqual(p1)
    expect(p2).toEqual(['4', '5', '6'])
    for (const [path, config] of get.mock.calls) {
      expect(path).toBe('/teams/')
      expect(Object.keys((config as { params?: object } | undefined)?.params ?? {})).toEqual([])
    }
  })

  it('a limit above the collection size returns everything and reports the end', async () => {
    fakeTeams()
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await adapter().listWorkspaces(CREDS, params)).length).toBe(N)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: N })
  })

  it('getWorkspace still finds a workspace past the first page', async () => {
    fakeTeams()
    expect((await adapter().getWorkspace(CREDS, String(N))).id).toBe(String(N))
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    fakeTeams()
    const p2 = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env2 = listPage(await adapter().listWorkspaces(CREDS, p2), p2, 'zoho-sprints')
    expect(env2.data.map((w) => w.id)).toEqual(['4', '5', '6'])
    expect(env2.meta).toMatchObject({ page: 2, hasMore: true, totalCount: N })

    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env3 = listPage(await adapter().listWorkspaces(CREDS, p3), p3, 'zoho-sprints')
    expect(env3.data.map((w) => w.id)).toEqual(['7'])
    expect(env3.meta).toMatchObject({ page: 3, hasMore: false, totalCount: N })
  })
})
