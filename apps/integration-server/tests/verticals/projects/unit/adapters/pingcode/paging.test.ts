/**
 * PingCode `GET /v1/directory/team` ("获取企业信息" — "用于获取当前企业的基本信息。")
 * takes no paging parameters and returns one enterprise object, not a paged
 * `values` list (https://open.pingcode.com/api_data.js). A credential sees
 * exactly one enterprise, so `listWorkspaces` pages that one-row collection
 * locally.
 *
 * It used to return `[team]` for every page, so caller page 2 repeated page 1
 * and the sync worker could never see an end. The fake honours no paging input
 * at all, as documented.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { PingcodeAdapter } from '../../../../../../src/verticals/projects/adapters/pingcode/index'

vi.mock('axios')

const C: Credentials = { accessToken: 'tok-1', extra: {} }

interface Req {
  path: string
  params: Record<string, unknown> | undefined
}

function fakeTeam(requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation((() => ({
    get: vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      requests.push({ path, params: cfg?.params })
      if (path !== '/v1/directory/team') throw new Error(`unexpected path ${path}`)
      return {
        data: {
          id: 'ent-1',
          url: 'https://open.pingcode.com/v1/directory/team',
          name: 'YCtech',
          secondary_domain: 'yctech',
        },
      }
    }),
  })) as unknown as typeof axios.create)
  return { requests }
}

describe('pingcode listWorkspaces pages its single enterprise locally', () => {
  beforeEach(() => vi.resetAllMocks())

  it('limit 1: page 1 has the enterprise and ends; pages 2 and 3 are empty', async () => {
    fakeTeam()
    const adapter = new PingcodeAdapter()
    const seen: string[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 1 })
      const rows = await adapter.listWorkspaces(C, params)
      seen.push(...rows.map((r) => r.id))
      expect(rows).toHaveLength(page === 1 ? 1 : 0)
      const meta = readUpstreamPage(params)
      expect(meta?.hasMore).toBe(false)
      expect(meta?.totalCount).toBe(1)
      expect(meta?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(['ent-1'])
  })

  it('page 2 at the sync worker size is empty, not a repeat of page 1', async () => {
    fakeTeam()
    const adapter = new PingcodeAdapter()
    const p1 = await adapter.listWorkspaces(C, withPageSink({ page: 1, limit: 500 }))
    const p2 = await adapter.listWorkspaces(C, withPageSink({ page: 2, limit: 500 }))
    expect(p1.map((r) => r.id)).toEqual(['ent-1'])
    expect(p2).toEqual([])
  })

  it('sends no paging parameters (the endpoint documents none)', async () => {
    const { requests } = fakeTeam()
    await new PingcodeAdapter().listWorkspaces(C, withPageSink({ page: 2, limit: 7 }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.path).toBe('/v1/directory/team')
    expect(requests[0]!.params ?? {}).toEqual({})
  })

  it('API path: parseListQuery + listPage serves the enterprise once and reports the end', async () => {
    fakeTeam()
    const adapter = new PingcodeAdapter()
    const p1 = parseListQuery({ limit: '25', page: '1' })
    const env1 = listPage(await adapter.listWorkspaces(C, p1), p1, 'pingcode')
    expect(env1.data.map((r) => r.id)).toEqual(['ent-1'])
    expect(env1.meta.hasMore).toBe(false)
    expect(env1.meta.totalCount).toBe(1)

    const p2 = parseListQuery({ limit: '25', page: '2' })
    const env2 = listPage(await adapter.listWorkspaces(C, p2), p2, 'pingcode')
    expect(env2.data).toEqual([])
    expect(env2.meta.hasMore).toBe(false)
  })
})
