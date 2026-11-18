/**
 * Nimble read methods: request shape, paging, and refusals.
 *
 * First-party sources (OpenAPI spec embedded in
 * https://www.nimble.com/developers/docs/, and the legacy reference
 * https://github.com/nimblecrm/api-docs):
 *
 *   GET /api/v2/deals/pipelines — "List deals pipelines", no query
 *     parameters; 200 "Success executing of retrieving all user pipelines",
 *     body { pipelines: [...] }.
 *   GET /api/v2/deals/pipelines/{pipeline_id} — "Get deals' pipeline by id".
 *   GET /api/v1/contacts — query record_type (person | company | all),
 *     page ("default: 1"), per_page ("default: 30"), …; body { meta:
 *     Commons.PaginationMeta { page, pages, per_page, total }, resources }.
 *   GET /api/v1/contact/{contact_id}/notes — "Returns a list of notes for the
 *     specified contact", query page and per_page (legacy: "per_page —
 *     default: 5"); body { meta { has_more, page, pages, per_page, total },
 *     resources }.
 *   GET /api/v1/contacts/notes/{note_id} — "Returns note by id."
 *   GET /api/v2/deals — query sort (required) and limit only.
 *   Hosts: v1 on api.nimble.com (the docs' v1 examples, "POST
 *     https://api.nimble.com/api/v1/contacts?access_token=…"); v2 on the
 *     spec's servers entry, "https://app.nimble.com" (no v2 example exists).
 *   Auth: "You can also pass your token in HTTP header `Authorization` in
 *     format: `Bearer <your token>`."
 *
 * The fake honours only those documented parameters and answers 400 to
 * anything else.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  readUpstreamPage,
  withPageSink,
  _resetRowPager,
  type QueryParams,
} from '@opensteward/shared'
import { NimbleAdapter } from '../../../../../../src/verticals/crm/adapters/nimble/index'

const CREDS = { accessToken: 'nimble_test' }
const V1_HOST = 'https://api.nimble.com'
const V2_HOST = 'https://app.nimble.com'

interface Recorded {
  origin: string
  path: string
  query: Record<string, string>
  auth: string | null
}

interface FakeNote {
  id: string
  note: string
  owner_id: string
  created: string
  updated: string
  contacts: Array<{ id: string; contact_type: 'person' | 'company' }>
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function rejectUnknown(url: URL, allowed: string[]): Response | undefined {
  for (const k of url.searchParams.keys()) {
    if (!allowed.includes(k)) return new Response(`unknown parameter ${k}`, { status: 400 })
  }
  return undefined
}

function makePipeline(i: number) {
  return {
    pipeline_id: `pipe${i}`,
    name: `Pipeline ${i}`,
    archived_at: null,
    stages: [{ stage_id: `pipe${i}-s0`, name: 'Lead' }],
  }
}

function makeNote(id: string, contactIds: string[]): FakeNote {
  return {
    id,
    note: `body of ${id}`,
    owner_id: 'owner1',
    created: '2024-01-01T10:00:00+0000',
    updated: '2024-01-02T10:00:00+0000',
    contacts: contactIds.map((c) => ({ id: c, contact_type: 'person' as const })),
  }
}

interface World {
  pipelines: ReturnType<typeof makePipeline>[]
  contacts: string[]
  notes: FakeNote[]
}

function installFake(world: World) {
  const calls: Recorded[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    const headers = new Headers(init?.headers)
    calls.push({
      origin: url.origin,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      auth: headers.get('Authorization'),
    })
    const want = url.pathname.startsWith('/api/v2/') ? V2_HOST : V1_HOST
    if (url.origin !== want) return new Response('wrong host', { status: 404 })
    if (headers.get('Authorization') !== `Bearer ${CREDS.accessToken}`) {
      return new Response('{"message":"The access token is invalid or expired"}', { status: 401 })
    }

    if (url.pathname === '/api/v2/deals/pipelines') {
      return rejectUnknown(url, []) ?? json({ pipelines: world.pipelines })
    }
    const pipe = /^\/api\/v2\/deals\/pipelines\/([^/]+)$/.exec(url.pathname)
    if (pipe) {
      const found = world.pipelines.find((p) => p.pipeline_id === pipe[1])
      return found
        ? (rejectUnknown(url, []) ?? json(found))
        : new Response('{"object_type":"pipeline"}', { status: 404 })
    }

    if (url.pathname === '/api/v1/contacts') {
      const bad = rejectUnknown(url, [
        'keyword',
        'fields',
        'tags',
        'sort',
        'query',
        'record_type',
        'page',
        'per_page',
        'contexts',
      ])
      if (bad) return bad
      const page = Number(url.searchParams.get('page') ?? '1')
      const perPage = Number(url.searchParams.get('per_page') ?? '30')
      const all = world.contacts
      const pages = Math.max(1, Math.ceil(all.length / perPage))
      const slice = all.slice((page - 1) * perPage, page * perPage)
      return json({
        meta: { page, pages, per_page: perPage, total: all.length },
        resources: slice.map((id) => ({ id, record_type: 'person' })),
      })
    }
    const cn = /^\/api\/v1\/contact\/([^/]+)\/notes$/.exec(url.pathname)
    if (cn) {
      const bad = rejectUnknown(url, ['page', 'per_page'])
      if (bad) return bad
      const page = Number(url.searchParams.get('page') ?? '1')
      const perPage = Number(url.searchParams.get('per_page') ?? '5')
      const mine = world.notes.filter((n) => n.contacts.some((c) => c.id === cn[1]))
      const pages = Math.max(1, Math.ceil(mine.length / perPage))
      return json({
        meta: { page, pages, per_page: perPage, total: mine.length, has_more: page < pages },
        resources: mine.slice((page - 1) * perPage, page * perPage),
      })
    }
    const one = /^\/api\/v1\/contacts\/notes\/([^/]+)$/.exec(url.pathname)
    if (one) {
      const found = world.notes.find((n) => n.id === one[1])
      return found ? json(found) : new Response('not found', { status: 404 })
    }
    return new Response('<html>404</html>', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

function params(page: number, limit: number): QueryParams {
  return withPageSink({ page, limit } as QueryParams)
}

beforeEach(() => {
  _resetRowPager()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('nimble listPipelines', () => {
  it('reads GET /api/v2/deals/pipelines with no query parameters', async () => {
    const { calls } = installFake({ pipelines: [makePipeline(0)], contacts: [], notes: [] })
    const out = await new NimbleAdapter().listPipelines(CREDS, params(1, 10))
    expect(out.map((p) => p.id)).toEqual(['pipe0'])
    expect(out[0]!.stages).toEqual([{ id: 'pipe0-s0', name: 'Lead' }])
    expect(calls).toEqual([
      { origin: V2_HOST, path: '/api/v2/deals/pipelines', query: {}, auth: 'Bearer nimble_test' },
    ])
  })

  it('walks 2L+1 pipelines in pages of L, every id once, hasMore exact', async () => {
    const L = 2
    const world = {
      pipelines: Array.from({ length: 2 * L + 1 }, (_, i) => makePipeline(i)),
      contacts: [],
      notes: [],
    }
    installFake(world)
    const adapter = new NimbleAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const p = params(page, L)
      const rows = await adapter.listPipelines(CREDS, p)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(p)?.hasMore)
    }
    expect(seen).toEqual(world.pipelines.map((p) => p.pipeline_id))
    expect(new Set(seen).size).toBe(seen.length)
    expect(more).toEqual([true, true, false])
  })
})

describe('nimble getPipeline', () => {
  it('reads GET /api/v2/deals/pipelines/{pipeline_id}', async () => {
    const { calls } = installFake({
      pipelines: [makePipeline(0), makePipeline(1)],
      contacts: [],
      notes: [],
    })
    const out = await new NimbleAdapter().getPipeline(CREDS, 'pipe1')
    expect(out.id).toBe('pipe1')
    expect(calls.map((c) => c.origin + c.path)).toEqual([
      'https://app.nimble.com/api/v2/deals/pipelines/pipe1',
    ])
  })

  it('surfaces the documented 404', async () => {
    installFake({ pipelines: [], contacts: [], notes: [] })
    await expect(new NimbleAdapter().getPipeline(CREDS, 'missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('nimble listNotes', () => {
  // 32 contacts: two upstream contact pages at the documented per_page 30.
  // c00 has 7 notes (two note pages at the default per_page 5), c01 none,
  // c02 one of its own plus one shared with c31 (served once, under c02,
  // the first contact it names), c31 two of its own: 11 notes = 2L+1, L = 5.
  // Upstream pages hold 9 and 2 notes: uneven, and not a multiple of L.
  function world(): World {
    const contacts = Array.from({ length: 32 }, (_, i) => `c${String(i).padStart(2, '0')}`)
    const notes: FakeNote[] = [
      ...Array.from({ length: 7 }, (_, i) => makeNote(`n00-${i}`, ['c00'])),
      makeNote('n02-0', ['c02']),
      makeNote('shared', ['c02', 'c31']),
      makeNote('n31-0', ['c31']),
      makeNote('n31-1', ['c31']),
    ]
    return { pipelines: [], contacts, notes }
  }

  it('asks only documented parameters, with Bearer auth', async () => {
    const { calls } = installFake(world())
    await new NimbleAdapter().listNotes(CREDS, params(1, 5))
    const contactCalls = calls.filter((c) => c.path === '/api/v1/contacts')
    expect(contactCalls[0]!.query).toEqual({ record_type: 'all', per_page: '30', page: '1' })
    const noteCalls = calls.filter((c) => c.path.endsWith('/notes'))
    expect(noteCalls[0]).toEqual({
      origin: V1_HOST,
      path: '/api/v1/contact/c00/notes',
      query: { page: '1' },
      auth: 'Bearer nimble_test',
    })
    expect(noteCalls[1]!.query).toEqual({ page: '2' })
    expect(calls.every((c) => c.auth === 'Bearer nimble_test')).toBe(true)
  })

  it('walks 2L+1 notes in pages of L, every id once, hasMore exact', async () => {
    const w = world()
    installFake(w)
    const adapter = new NimbleAdapter()
    const L = 5
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const p = params(page, L)
      const rows = await adapter.listNotes(CREDS, p)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(p)?.hasMore)
    }
    expect(seen).toEqual(w.notes.map((n) => n.id))
    expect(seen).toHaveLength(2 * L + 1)
    expect(new Set(seen).size).toBe(seen.length)
    expect(more).toEqual([true, true, false])
  })

  it('serves a note shared by two contacts once, under the first it names', async () => {
    installFake(world())
    const rows = await new NimbleAdapter().listNotes(CREDS, params(1, 50))
    const shared = rows.filter((r) => r.id === 'shared')
    expect(shared).toHaveLength(1)
    expect(shared[0]!.contact_id).toBe('c02')
  })

  it('walks every contacts page, ending on meta.page reaching meta.pages', async () => {
    const { calls } = installFake(world())
    const p = params(1, 50)
    await new NimbleAdapter().listNotes(CREDS, p)
    const pages = calls.filter((c) => c.path === '/api/v1/contacts').map((c) => c.query['page'])
    expect(pages).toEqual(['1', '2'])
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
  })
})

describe('nimble listNotes edge cases', () => {
  it('serves a shared note where its first-named contact is walked, not its last', async () => {
    // "shared" names c31 first and c02 second; c31 comes later in the walk.
    installFake({
      pipelines: [],
      contacts: ['c02', 'c31'],
      notes: [
        makeNote('n02-0', ['c02']),
        makeNote('n31-0', ['c31']),
        makeNote('shared', ['c31', 'c02']),
      ],
    })
    const rows = await new NimbleAdapter().listNotes(CREDS, params(1, 50))
    expect(rows.map((r) => r.id)).toEqual(['n02-0', 'n31-0', 'shared'])
  })

  // A notes page shaped like the legacy list.rst example: meta
  // {per_page, total, pages, page} with no has_more.
  function stubNotes(pagesFor: (page: number) => { meta: object; resources: FakeNote[] }) {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        )
        calls.push(url.pathname + url.search)
        if (url.pathname === '/api/v1/contacts') {
          return json({
            meta: { page: 1, pages: 1, per_page: 30, total: 1 },
            resources: [{ id: 'c1' }],
          })
        }
        return json(pagesFor(Number(url.searchParams.get('page') ?? '1')))
      }),
    )
    return calls
  }

  it('reads every notes page by meta.page < meta.pages when has_more is absent', async () => {
    stubNotes((page) => ({
      meta: { per_page: 5, total: 6, pages: 2, page },
      resources:
        page === 1
          ? Array.from({ length: 5 }, (_, i) => makeNote(`a${i}`, ['c1']))
          : [makeNote('b0', ['c1'])],
    }))
    const rows = await new NimbleAdapter().listNotes(CREDS, params(1, 50))
    expect(rows.map((r) => r.id)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4', 'b0'])
  })

  it('stops on an empty notes page even when meta.pages claims more', async () => {
    const calls = stubNotes((page) => ({
      meta: { per_page: 5, total: 15, pages: 3, page, has_more: true },
      resources: [],
    }))
    const rows = await new NimbleAdapter().listNotes(CREDS, params(1, 50))
    expect(rows).toEqual([])
    expect(calls.filter((c) => c.includes('/notes'))).toEqual(['/api/v1/contact/c1/notes?page=1'])
  })
})

describe('nimble getNote', () => {
  it('reads GET /api/v1/contacts/notes/{note_id}', async () => {
    const { calls } = installFake(world2())
    const out = await new NimbleAdapter().getNote(CREDS, 'n1')
    expect(out.id).toBe('n1')
    expect(out.contact_id).toBe('c1')
    expect(calls.map((c) => c.path)).toEqual(['/api/v1/contacts/notes/n1'])
  })

  function world2(): World {
    return { pipelines: [], contacts: ['c1'], notes: [makeNote('n1', ['c1'])] }
  }
})

describe('nimble deals refuse before any request', () => {
  it('listDeals throws 501 NOT_SUPPORTED and sends nothing', async () => {
    const { fetchMock } = installFake({ pipelines: [], contacts: [], notes: [] })
    await expect(new NimbleAdapter().listDeals(CREDS, params(1, 10))).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('getDeal throws 501 NOT_SUPPORTED and sends nothing', async () => {
    const { fetchMock } = installFake({ pipelines: [], contacts: [], notes: [] })
    await expect(new NimbleAdapter().getDeal(CREDS, 'd1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
