/**
 * Capsule listPipelines: request shape and paging.
 *
 * https://developer.capsulecrm.com/v2/operations/Pipeline (List pipelines):
 *   "The collection of pipelines on the Capsule account."
 *   "GET https://api.capsulecrm.com/api/v2/pipelines"
 *   Query Parameters: includeDeleted, page "The page of results to return. Default: 1",
 *   perPage "The number of entities to return per page. Value must be between 1 and 100 . Default: 50"
 *   "The body of the response will contain an object with a single property pipelines"
 *   Headers: "Link String Links to the next and previous pages, encoded as defined in RFC 5988"
 *
 * https://developer.capsulecrm.com/v2/operations/Milestone (List milestones by pipeline):
 *   "List milestones associated with a pipeline."
 *   "GET https://api.capsulecrm.com/api/v2/pipelines/{pipelineId}/milestones"
 *   same page / perPage parameters; body property "milestones"; same Link header.
 *   The legacy GET /milestones covers only "the oldest active pipeline".
 *
 * https://developer.capsulecrm.com/v2/overview/reading-from-the-api:
 *   "The pagination info is included in the Link header."
 *   Link: <…?page=3&perPage=100>; rel="next", <…?page=1&perPage=100>; rel="prev"
 *
 * The fake honours only those documented parameters and answers 400 to
 * anything else, and to a perPage outside 1..100.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { CapsuleAdapter } from '../../../../../../src/verticals/crm/adapters/capsule/index'
import { hasNextLink } from '../../../../../../src/verticals/crm/adapters/capsule/client'

const CREDS = { accessToken: 'capsule_test' }
const HOST = 'https://api.capsulecrm.com'

interface Recorded {
  path: string
  query: Record<string, string>
  auth: string | null
}

function makePipelines(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: 1000 + i, name: `Pipeline ${i}` }))
}

function makeMilestones(pipelineId: number, n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: pipelineId * 1000 + i,
    name: `Stage ${i}`,
    complete: false,
    probability: 10,
    pipeline: { id: pipelineId, name: `Pipeline ${pipelineId}` },
  }))
}

function json(body: unknown, link?: string): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (link) headers['Link'] = link
  return new Response(JSON.stringify(body), { status: 200, headers })
}

function pageOf<T>(rows: T[], url: URL, allowed: string[], key: string): Response {
  for (const k of url.searchParams.keys()) {
    if (!allowed.includes(k)) return new Response(`unknown parameter ${k}`, { status: 400 })
  }
  const page = Number(url.searchParams.get('page') ?? '1')
  const perPage = Number(url.searchParams.get('perPage') ?? '50')
  if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
    return new Response('perPage must be between 1 and 100', { status: 400 })
  }
  const start = (page - 1) * perPage
  const slice = rows.slice(start, start + perPage)
  const base = `${url.origin}${url.pathname}`
  const links: string[] = []
  if (start + perPage < rows.length)
    links.push(`<${base}?page=${page + 1}&perPage=${perPage}>; rel="next"`)
  if (page > 1) links.push(`<${base}?page=${page - 1}&perPage=${perPage}>; rel="prev"`)
  return json({ [key]: slice }, links.length ? links.join(', ') : undefined)
}

function installFake(
  pipelines: Array<{ id: number; name: string }>,
  milestonesPer: Record<number, number> = {},
) {
  const calls: Recorded[] = []
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    )
    const headers = new Headers(init?.headers)
    calls.push({
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      auth: headers.get('Authorization'),
    })
    if (url.origin !== HOST) return new Response('wrong host', { status: 404 })
    if (url.pathname === '/api/v2/pipelines') {
      return pageOf(pipelines, url, ['page', 'perPage', 'includeDeleted'], 'pipelines')
    }
    const m = /^\/api\/v2\/pipelines\/(\d+)\/milestones$/.exec(url.pathname)
    if (m) {
      const id = Number(m[1])
      return pageOf(
        makeMilestones(id, milestonesPer[id] ?? 2),
        url,
        ['page', 'perPage'],
        'milestones',
      )
    }
    return new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return calls
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function params(page: number, limit: number): QueryParams {
  return withPageSink({ page, limit } as QueryParams)
}

describe('capsule listPipelines', () => {
  it('declares the documented page maximum of 100', () => {
    expect(new CapsuleAdapter().capabilities.maxPageSize).toBe(100)
  })

  it('sends GET /pipelines with the caller page and limit, and only documented parameters', async () => {
    const calls = installFake(makePipelines(10))
    await new CapsuleAdapter().listPipelines(CREDS, params(2, 3))
    const list = calls.filter((c) => c.path === '/api/v2/pipelines')
    expect(list).toEqual([
      {
        path: '/api/v2/pipelines',
        query: { page: '2', perPage: '3' },
        auth: 'Bearer capsule_test',
      },
    ])
  })

  it('never calls the legacy /milestones endpoint', async () => {
    const calls = installFake(makePipelines(2))
    await new CapsuleAdapter().listPipelines(CREDS, params(1, 10))
    expect(calls.some((c) => c.path === '/api/v2/milestones')).toBe(false)
  })

  it('walks 2L+1 pipelines in three pages, every id once, hasMore from the Link header', async () => {
    const L = 4
    const all = makePipelines(2 * L + 1)
    installFake(all)
    const adapter = new CapsuleAdapter()
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const p = params(page, L)
      const rows = await adapter.listPipelines(CREDS, p)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(p)?.hasMore)
    }
    expect(seen).toEqual(all.map((p) => String(p.id)))
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports hasMore false on an exactly full last page (no rel="next")', async () => {
    installFake(makePipelines(6))
    const p = params(2, 3)
    const rows = await new CapsuleAdapter().listPipelines(CREDS, p)
    expect(rows).toHaveLength(3)
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
  })

  it('clamps a direct call past 100 to perPage=100 and reports the size sent', async () => {
    const calls = installFake(makePipelines(3))
    const p = params(1, 250)
    await new CapsuleAdapter().listPipelines(CREDS, p)
    expect(calls.find((c) => c.path === '/api/v2/pipelines')?.query).toEqual({
      page: '1',
      perPage: '100',
    })
    expect(readUpstreamPage(p)?.pageSize).toBe(100)
  })

  it('fetches every pipeline\'s own milestones, following rel="next" past one page', async () => {
    const pipelines = makePipelines(2)
    const calls = installFake(pipelines, { 1000: 150, 1001: 1 })
    const rows = await new CapsuleAdapter().listPipelines(CREDS, params(1, 10))
    expect(rows.map((r) => r.id)).toEqual(['1000', '1001'])
    expect(rows[0].stages).toHaveLength(150)
    expect(new Set(rows[0].stages?.map((s) => s.id)).size).toBe(150)
    expect(rows[1].stages?.map((s) => s.id)).toEqual(['1001000'])
    const stageCalls = calls.filter((c) => c.path.endsWith('/milestones'))
    expect(stageCalls).toEqual([
      {
        path: '/api/v2/pipelines/1000/milestones',
        query: { page: '1', perPage: '100' },
        auth: 'Bearer capsule_test',
      },
      {
        path: '/api/v2/pipelines/1000/milestones',
        query: { page: '2', perPage: '100' },
        auth: 'Bearer capsule_test',
      },
      {
        path: '/api/v2/pipelines/1001/milestones',
        query: { page: '1', perPage: '100' },
        auth: 'Bearer capsule_test',
      },
    ])
  })

  it('returns an empty page with hasMore false when the account has no pipelines', async () => {
    const calls = installFake([])
    const p = params(1, 10)
    expect(await new CapsuleAdapter().listPipelines(CREDS, p)).toEqual([])
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
    expect(calls.filter((c) => c.path.endsWith('/milestones'))).toEqual([])
  })

  it('sends perPage=100 when the caller gives no limit', async () => {
    const calls = installFake(makePipelines(3))
    await new CapsuleAdapter().listPipelines(CREDS, withPageSink({ page: 1 } as QueryParams))
    expect(calls.find((c) => c.path === '/api/v2/pipelines')?.query).toEqual({
      page: '1',
      perPage: '100',
    })
  })

  it('stops the milestones walk on an empty page even if rel="next" is present', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        )
        calls.push(url.pathname + url.search)
        if (url.pathname === '/api/v2/pipelines') return json({ pipelines: makePipelines(1) })
        // A pathological upstream: an empty page that still links onward. It stops
        // linking after page 5 so a missing guard fails the count instead of hanging.
        const page = Number(url.searchParams.get('page'))
        const next =
          page < 5 ? `<${url.origin}${url.pathname}?page=${page + 1}>; rel="next"` : undefined
        return json({ milestones: [] }, next)
      }),
    )
    const rows = await new CapsuleAdapter().listPipelines(CREDS, params(1, 10))
    expect(rows[0].stages ?? []).toEqual([])
    expect(calls.filter((c) => c.includes('/milestones'))).toHaveLength(1)
  })
})

describe('capsule hasNextLink', () => {
  // RFC 5988 does not order link-values; the docs' example happens to list rel="next" first.
  it('finds rel="next" when rel="prev" comes first', () => {
    expect(
      hasNextLink(
        '<https://api.capsulecrm.com/api/v2/pipelines?page=1&perPage=2>; rel="prev", ' +
          '<https://api.capsulecrm.com/api/v2/pipelines?page=3&perPage=2>; rel="next"',
      ),
    ).toBe(true)
  })

  it('is false for a header with only rel="prev", and for no header', () => {
    expect(hasNextLink('<https://api.capsulecrm.com/api/v2/pipelines?page=1>; rel="prev"')).toBe(
      false,
    )
    expect(hasNextLink(null)).toBe(false)
  })
})
