/**
 * Kaiten boards → Projects.
 *
 * Kaiten documents one board list, scoped to a space
 * (https://developers.kaiten.ru/space-boards/get-list-of-boards):
 *
 *   "Get list of boards GET https://example.kaiten.ru/api/latest/spaces/{space_id}/boards
 *    Path parameters ... space_idrequired | integer | Space ID"
 *
 * with no query parameters. The company-wide `/space-boards` the adapter used
 * to call is not documented at all. Every space in "Retrieve list of spaces"
 * (https://developers.kaiten.ru/spaces/retrieve-list-of-spaces) carries its
 * boards ("boards | array of objects ... | Space boards", each with
 * "space_id | integer | Space id"), and that list pages by `limit` ("a value
 * greater than 100 is treated as 100") and `offset` ("Number of spaces to
 * skip"). So:
 *
 *   - listProjects with a workspace_id reads GET /spaces/{id} (for the
 *     documented `archived` flag) and GET /spaces/{id}/boards, paged locally;
 *   - listProjects without one flattens the boards out of the spaces pages
 *     with pageByRows (uneven: a space holds 0..n boards);
 *   - getProject finds the board in that same walk, since GET /boards/{id}
 *     documents no space_id and the space-scoped read needs the space id.
 *
 * The fake honours only the documented inputs and rejects every other path.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { KaitenAdapter } from '../../../../../../src/verticals/projects/adapters/kaiten/index'
import { ProjectSchema } from '../../../../../../src/verticals/projects/schema/project'

vi.mock('axios')

const BASE = 'https://acme.kaiten.ru'
const C1: Credentials = { accessToken: 'tok-1', extra: { baseUrl: BASE } }
const C2: Credentials = { accessToken: 'tok-2', extra: { baseUrl: BASE } }

const KAITEN_MAX = 100

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

/** Boards in the space at index `s`: 0, 1, 2, 3, 0, 1, ... (uneven pages). */
const boardsIn = (s: number): number => s % 4

function spaceId(token: string, s: number): number {
  return (token === 'tok-2' ? 100_000 : 0) + s + 1
}

function boardId(token: string, s: number, j: number): number {
  return (token === 'tok-2' ? 10_000_000 : 0) + (s + 1) * 10 + j
}

function board(token: string, s: number, j: number): Record<string, unknown> {
  return {
    created: '2022-10-14T12:52:52.922Z',
    updated: '2022-10-14T12:52:52.922Z',
    id: boardId(token, s, j),
    title: `board ${s}/${j}`,
    description: null,
    external_id: null,
    space_id: spaceId(token, s),
    board_id: boardId(token, s, j),
    type: 1,
  }
}

function space(token: string, s: number, archivedAt: number[]): Record<string, unknown> {
  return {
    created: '2022-10-17T13:47:47.876Z',
    updated: '2022-10-17T13:47:47.876Z',
    archived: archivedAt.includes(s),
    id: spaceId(token, s),
    title: `space ${s}`,
    company_id: 1,
    boards: Array.from({ length: boardsIn(s) }, (_, j) => board(token, s, j)),
  }
}

function fakeKaiten(spaces: number, archivedAt: number[] = []) {
  const requests: Req[] = []
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const all = Array.from({ length: spaces }, (_, s) => space(token, s, archivedAt))
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      if (path === '/spaces') {
        const limRaw = params['limit']
        const lim = limRaw === undefined ? all.length : Math.min(Number(limRaw), KAITEN_MAX)
        if (!Number.isInteger(lim) || lim < 1) throw new Error(`limit ${String(limRaw)} invalid`)
        const off = params['offset'] === undefined ? 0 : Number(params['offset'])
        if (!Number.isInteger(off) || off < 0) throw new Error('offset invalid')
        return { data: all.slice(off, off + lim) }
      }
      const one = path.match(/^\/spaces\/(\d+)$/)
      const list = path.match(/^\/spaces\/(\d+)\/boards$/)
      const m = one ?? list
      if (m) {
        if (Object.keys(params).length > 0) throw new Error(`${path} documents no query`)
        const sp = all.find((x) => x['id'] === Number(m[1]))
        if (!sp) throw Object.assign(new Error('Not found'), { response: { status: 404 } })
        if (one) {
          const { boards: _b, ...rest } = sp
          return { data: rest }
        }
        return { data: sp['boards'] }
      }
      throw new Error(`undocumented path ${path}`)
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

/** Every board id of the fake, in walk order. */
function allBoardIds(token: string, spaces: number): string[] {
  const out: string[] = []
  for (let s = 0; s < spaces; s++) {
    for (let j = 0; j < boardsIn(s); j++) out.push(String(boardId(token, s, j)))
  }
  return out
}

afterEach(() => vi.clearAllMocks())

// 150 spaces hold 223 boards: 150 on the first spaces page, 73 on the second.
const SPACES = 150
const BOARDS = 223
const L = (BOARDS - 1) / 2

describe('kaiten listProjects without a workspace walks the spaces list', () => {
  it('N = 2L+1 boards over uneven spaces pages: pages 1-3 serve every id once, hasMore exact', async () => {
    const { requests } = fakeKaiten(SPACES)
    const adapter = new KaitenAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listProjects(C1, params)
      for (const r of rows) ProjectSchema.parse(r)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(allBoardIds('tok-1', SPACES))
    expect(new Set(served).size).toBe(BOARDS)
    expect(more).toEqual([true, true, false])
    for (const r of requests) {
      expect(r.path).toBe('/spaces')
      expect(r.params['limit']).toBe(KAITEN_MAX)
      expect([0, KAITEN_MAX]).toContain(r.params['offset'])
    }
  })

  it('API path: parseListQuery + listPage walks every board once', async () => {
    fakeKaiten(SPACES)
    const adapter = new KaitenAdapter()
    const served: string[] = []
    for (let page = 1; page < 30; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await adapter.listProjects(C1, params), params, 'kaiten')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(allBoardIds('tok-1', SPACES))
  })

  it('maps workspaceId from space_id and status from the parent space', async () => {
    fakeKaiten(8, [2])
    const adapter = new KaitenAdapter()
    const rows = await adapter.listProjects(C1, withPageSink({ page: 1, limit: 50 }))
    const byId = new Map(rows.map((r) => [r.id, r]))
    expect(byId.get(String(boardId('tok-1', 2, 1)))).toMatchObject({
      workspaceId: String(spaceId('tok-1', 2)),
      status: 'archived',
    })
    expect(byId.get(String(boardId('tok-1', 3, 0)))).toMatchObject({
      workspaceId: String(spaceId('tok-1', 3)),
      status: 'active',
    })
  })

  it('two connections interleaved each walk their own boards', async () => {
    fakeKaiten(SPACES)
    const adapter = new KaitenAdapter()
    const a1 = await adapter.listProjects(C1, withPageSink({ page: 1, limit: L }))
    const b2 = await adapter.listProjects(C2, withPageSink({ page: 2, limit: L }))
    const a2 = await adapter.listProjects(C1, withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(allBoardIds('tok-1', SPACES).slice(0, L))
    expect(b2.map((r) => r.id)).toEqual(allBoardIds('tok-2', SPACES).slice(L, 2 * L))
    expect(a2.map((r) => r.id)).toEqual(allBoardIds('tok-1', SPACES).slice(L, 2 * L))
  })
})

describe('kaiten listProjects with a workspace_id reads that space', () => {
  it('reads GET /spaces/{id}/boards with no query and slices it locally', async () => {
    const { requests } = fakeKaiten(8, [3])
    const adapter = new KaitenAdapter()
    const sid = spaceId('tok-1', 3)
    const params = withPageSink({ page: 2, limit: 2, workspace_id: String(sid) })
    const rows = await adapter.listProjects(C1, params)
    expect(rows.map((r) => r.id)).toEqual([String(boardId('tok-1', 3, 2))])
    for (const r of rows) {
      expect(ProjectSchema.parse(r)).toMatchObject({ workspaceId: String(sid), status: 'archived' })
    }
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 3,
      hasMore: false,
      pagedLocally: true,
    })
    expect(requests.map((r) => r.path).sort()).toEqual([`/spaces/${sid}`, `/spaces/${sid}/boards`])
  })
})

describe('kaiten getProject', () => {
  it('finds the board on a later spaces page and never calls /space-boards', async () => {
    const { requests } = fakeKaiten(SPACES, [121])
    const adapter = new KaitenAdapter()
    const id = boardId('tok-1', 121, 0)
    const p = ProjectSchema.parse(await adapter.getProject(C1, String(id)))
    expect(p).toMatchObject({
      id: String(id),
      workspaceId: String(spaceId('tok-1', 121)),
      status: 'archived',
    })
    expect(requests.map((r) => [r.path, r.params['offset']])).toEqual([
      ['/spaces', 0],
      ['/spaces', KAITEN_MAX],
    ])
  })

  it('throws not found after the last spaces page', async () => {
    const { requests } = fakeKaiten(SPACES)
    const adapter = new KaitenAdapter()
    await expect(adapter.getProject(C1, '999999')).rejects.toThrow(/not found/)
    expect(requests).toHaveLength(2)
  })
})
