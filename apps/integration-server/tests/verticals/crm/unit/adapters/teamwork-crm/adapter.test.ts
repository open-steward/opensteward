import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { TeamworkCrmAdapter } from '../../../../../../src/verticals/crm/adapters/teamwork-crm/index'
import { ACTIVITY, COMPANY, CONTACT, DEAL, NOTE, PIPELINE, STAGES } from './fixtures'

/**
 * Teamwork CRM API v2, from the vendor's archived first-party docs
 * (developer.teamwork.com/crm, Wayback 2019-11 / 2020-08):
 *   - every endpoint starts with https://{site}/crm/api/v2/ and ends in .json;
 *   - auth is `Authorization: Bearer {API key}`;
 *   - each list documents exactly five query parameters — orderMode
 *     (enum asc/desc), orderBy, include, pageSize (default 20, 1..200) and
 *     pageOffset (default 0) — plus filter[$target][$operator]=$value for the
 *     targets its page lists, and answers `{ <plural>: [...], included,
 *     meta: { page: { count, pageOffset, pageSize } } }`;
 *   - GET /{plural}/{id}.json answers `{ <singular>: {...}, included }`.
 * (GET /notes.json documents its 200 body with the single-note schema; the fake
 * follows "Response structure" instead: plural key on a list endpoint.)
 * The fake below honours exactly those parameters, rejects any other with a
 * 400, and without orderBy answers in each endpoint's documented default order.
 */

const SITE = 'https://acme.teamwork.com'
const API = `${SITE}/crm/api/v2`
const creds = { accessToken: 'tw-key', extra: { siteUrl: SITE } }

interface Endpoint {
  key: string
  single: string
  includes: string[]
  filters: string[]
  sorts: string[]
  /** The documented default order, applied when no orderBy is sent. */
  defaultOrder: (a: Row, b: Row) => number
}

type Row = { id: number; createdAt: string; updatedAt: string; [k: string]: unknown }

const byCreatedDesc = (a: Row, b: Row) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id
const byName = (a: Row, b: Row) =>
  String(a['name'] ?? a['lastName']).localeCompare(String(b['name'] ?? b['lastName']))

const ENDPOINTS: Record<string, Endpoint> = {
  contacts: {
    key: 'contacts',
    single: 'contact',
    includes: ['avatar', 'company.country', 'country', 'owner.avatar'],
    filters: [
      'companyExists',
      'companyId',
      'createdAt',
      'dealId',
      'email',
      'id',
      'name',
      'updatedAt',
    ],
    sorts: [
      'address',
      'country',
      'createdAt',
      'firstName',
      'lastName',
      'mainEmail',
      'mainPhone',
      'name',
      'updatedAt',
    ],
    defaultOrder: byName,
  },
  companies: {
    key: 'companies',
    single: 'company',
    includes: ['avatar', 'contacts', 'country', 'owner.avatar'],
    filters: ['createdAt', 'name', 'updatedAt', 'id'],
    sorts: [
      'address',
      'country',
      'createdAt',
      'mainEmail',
      'mainPhone',
      'name',
      'state',
      'updatedAt',
    ],
    defaultOrder: byName,
  },
  deals: {
    key: 'deals',
    single: 'deal',
    includes: [
      'company',
      'company.phoneNumbers.code',
      'contacts',
      'currency',
      'mainContact',
      'owner.avatar',
      'stage.pipeline',
    ],
    filters: [
      'companyCount',
      'companyId',
      'contactEmail',
      'contactId',
      'createdAt',
      'id',
      'isQualified',
      'isRotting',
      'mainContactCount',
      'mainContactEmail',
      'ownerId',
      'projectId',
      'state',
      'taskId',
      'title',
      'updatedAt',
    ],
    sorts: [
      'closedAt',
      'createdAt',
      'expectedCloseDate',
      'qualifiedAt',
      'state',
      'title',
      'totalValue',
      'updatedAt',
    ],
    defaultOrder: byCreatedDesc,
  },
  activities: {
    key: 'activities',
    single: 'activity',
    includes: ['activityType', 'assignees', 'contacts'],
    filters: ['createdAt', 'dealId', 'isComplete', 'typeId', 'updatedAt'],
    sorts: ['completedAt', 'createdAt', 'date', 'dueDate', 'duration', 'name', 'updatedAt'],
    defaultOrder: byCreatedDesc,
  },
  pipelines: {
    key: 'pipelines',
    single: 'pipeline',
    includes: ['stages'],
    filters: ['createdAt', 'isQualified', 'name', 'updatedAt'],
    sorts: ['createdAt', 'orderIndex', 'updatedAt'],
    defaultOrder: (a, b) => Number(a['orderIndex']) - Number(b['orderIndex']),
  },
  notes: {
    key: 'notes',
    single: 'note',
    includes: [],
    filters: ['createdAt', 'subjectId', 'subjectType', 'updatedAt'],
    sorts: ['createdAt', 'updatedAt'],
    defaultOrder: (a, b) => a.createdAt.localeCompare(b.createdAt),
  },
}

const OPERATORS = new Set(['eq', 'in', 'like', 'gt', 'gte', 'lt', 'lte'])

let requests: { url: URL; headers: Record<string, string> }[] = []
let collections: Record<string, Row[]> = {}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function fail(detail: string, status = 400): Response {
  return json({ errors: [{ code: 'bad-request', title: 'Bad Request', detail }] }, status)
}

function serve() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input)
      const headers = init.headers as Record<string, string>
      requests.push({ url, headers })
      if (url.origin !== SITE || !url.pathname.startsWith('/crm/api/v2/'))
        return fail('not found', 404)
      if (headers['Authorization'] !== 'Bearer tw-key') return fail('unauthorized', 401)
      const path = url.pathname.slice('/crm/api/v2'.length)

      const one = /^\/(contacts|companies|deals|activities|notes)\/(\d+)\.json$/.exec(path)
      if (one) {
        for (const k of url.searchParams.keys())
          if (k !== 'include') return fail(`unknown parameter ${k}`)
        const ep = ENDPOINTS[one[1]]
        const row = (collections[one[1]] ?? []).find((r) => r.id === Number(one[2]))
        if (!row) return fail('not found', 404)
        return json({ [ep.single]: row, included: {} })
      }

      const list = /^\/(contacts|companies|deals|activities|pipelines|notes)\.json$/.exec(path)
      if (!list) return fail('not found', 404)
      const ep = ENDPOINTS[list[1]]
      let rows = [...(collections[list[1]] ?? [])]
      let orderBy: string | null = null
      let orderMode = 'asc'
      let pageSize = 20
      let pageOffset = 0
      let include: string[] = []
      for (const [k, v] of url.searchParams) {
        const filter = /^filter\[([^\]]+)\](?:\[([^\]]+)\])?$/.exec(k)
        if (filter) {
          if (!ep.filters.includes(filter[1])) return fail(`filter target ${filter[1]}`)
          const op = filter[2] ?? 'eq'
          if (!OPERATORS.has(op)) return fail(`operator ${op}`)
          if (filter[1] !== 'updatedAt' || op !== 'gte')
            return fail('fake implements only updatedAt gte')
          rows = rows.filter((r) => r.updatedAt >= v)
        } else if (k === 'orderBy') {
          if (!ep.sorts.includes(v)) return fail(`orderBy ${v}`)
          orderBy = v
        } else if (k === 'orderMode') {
          if (v !== 'asc' && v !== 'desc') return fail(`orderMode ${v}`)
          orderMode = v
        } else if (k === 'include') {
          include = v.split(',')
          if (include.some((i) => !ep.includes.includes(i))) return fail(`include ${v}`)
        } else if (k === 'pageSize') {
          pageSize = Number(v)
          if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200)
            return fail(`pageSize ${v}`)
        } else if (k === 'pageOffset') {
          pageOffset = Number(v)
          if (!Number.isInteger(pageOffset) || pageOffset < 0) return fail(`pageOffset ${v}`)
        } else {
          return fail(`unknown parameter ${k}`)
        }
      }
      if (orderBy === 'createdAt') {
        rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
        if (orderMode === 'desc') rows.reverse()
      } else if (orderBy === null) {
        rows.sort(ep.defaultOrder)
      }
      const page = rows.slice(pageOffset, pageOffset + pageSize)
      const included: Record<string, unknown> = {}
      if (include.includes('stages')) {
        const ids = new Set(
          page.flatMap((p) => ((p['stages'] as { id: number }[]) ?? []).map((s) => s.id)),
        )
        included['stages'] = STAGES.filter((s) => ids.has(s.id))
      }
      return json({
        [ep.key]: page,
        included,
        meta: { page: { count: rows.length, pageOffset, pageSize } },
      })
    }),
  )
}

/** `n` rows cloned from `base`, created one minute apart, newest id last. */
function rowsFrom(
  base: Record<string, unknown>,
  n: number,
  extra: (i: number) => Record<string, unknown> = () => ({}),
): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    ...base,
    id: 1000 + i,
    // Names descend so name order differs from creation order.
    ...(base['name'] !== undefined ? { name: `row ${String(99 - i).padStart(2, '0')}` } : {}),
    ...(base['lastName'] !== undefined
      ? { lastName: `row ${String(99 - i).padStart(2, '0')}` }
      : {}),
    ...(base['title'] !== undefined ? { title: `row ${i}` } : {}),
    createdAt: new Date(Date.UTC(2020, 0, 1, 0, i)).toISOString().replace('.000Z', 'Z'),
    updatedAt: new Date(Date.UTC(2020, 5, 1, 0, i)).toISOString().replace('.000Z', 'Z'),
    ...extra(i),
  })) as Row[]
}

const adapter = new TeamworkCrmAdapter()

function sinkParams(page: number, limit: number, extra: Partial<QueryParams> = {}): QueryParams {
  return withPageSink({ page, limit, ...extra })
}

beforeEach(() => {
  requests = []
  collections = {}
  serve()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

type ListMethod =
  'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities' | 'listPipelines' | 'listNotes'

const LISTS: { method: ListMethod; collection: string; base: Record<string, unknown> }[] = [
  { method: 'listContacts', collection: 'contacts', base: CONTACT },
  { method: 'listCompanies', collection: 'companies', base: COMPANY },
  { method: 'listDeals', collection: 'deals', base: DEAL },
  { method: 'listActivities', collection: 'activities', base: ACTIVITY },
  {
    method: 'listPipelines',
    collection: 'pipelines',
    base: { ...PIPELINE, stages: [], stagesCount: 0 },
  },
  { method: 'listNotes', collection: 'notes', base: NOTE },
]

describe.each(LISTS)('teamwork-crm $method', ({ method, collection, base }) => {
  it('walks N = 2L+1 rows in three pages, every id once, hasMore exact', async () => {
    const L = 3
    collections[collection] = rowsFrom(base, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = sinkParams(page, L)
      const rows = await adapter[method](creds, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
    }
    expect(seen).toEqual(collections[collection].map((r) => String(r.id)))
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends the documented path, Bearer auth and paging parameters only', async () => {
    collections[collection] = rowsFrom(base, 5)
    await adapter[method](creds, { page: 2, limit: 2 })
    expect(requests).toHaveLength(1)
    const { url, headers } = requests[0]
    expect(url.origin + url.pathname).toBe(`${API}/${collection}.json`)
    expect(headers['Authorization']).toBe('Bearer tw-key')
    expect(url.searchParams.get('pageSize')).toBe('2')
    expect(url.searchParams.get('pageOffset')).toBe('2')
    expect(url.searchParams.get('orderBy')).toBe('createdAt')
    expect(url.searchParams.get('orderMode')).toBe('asc')
    expect(url.searchParams.has('page')).toBe(false)
  })

  it('clamps the page size to the documented maximum of 200 and reports it', async () => {
    collections[collection] = rowsFrom(base, 450)
    const p1 = sinkParams(1, 500)
    const first = await adapter[method](creds, p1)
    const p2 = sinkParams(2, 500)
    const second = await adapter[method](creds, p2)
    expect(requests.map((r) => r.url.searchParams.get('pageSize'))).toEqual(['200', '200'])
    expect(requests.map((r) => r.url.searchParams.get('pageOffset'))).toEqual(['0', '200'])
    expect(readUpstreamPage(p1)).toMatchObject({ pageSize: 200, totalCount: 450, hasMore: true })
    expect(readUpstreamPage(p2)).toMatchObject({ pageSize: 200, totalCount: 450, hasMore: true })
    expect(first.map((r) => r.id)).toEqual(
      collections[collection].slice(0, 200).map((r) => String(r.id)),
    )
    expect(second.map((r) => r.id)).toEqual(
      collections[collection].slice(200, 400).map((r) => String(r.id)),
    )
  })

  it('sends the documented default page size of 20 when no limit is given', async () => {
    collections[collection] = rowsFrom(base, 25)
    const params = withPageSink({ page: 1 })
    const rows = await adapter[method](creds, params)
    expect(requests[0].url.searchParams.get('pageSize')).toBe('20')
    expect(requests[0].url.searchParams.get('pageOffset')).toBe('0')
    expect(rows).toHaveLength(20)
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 25, hasMore: true })
  })

  it('sends updatedAfter as filter[updatedAt][gte]', async () => {
    collections[collection] = rowsFrom(base, 6)
    const params = sinkParams(1, 10, { updatedAfter: new Date(Date.UTC(2020, 5, 1, 0, 3)) })
    const rows = await adapter[method](creds, params)
    expect(requests[0].url.searchParams.get('filter[updatedAt][gte]')).toBe('2020-06-01T00:03:00Z')
    expect(rows.map((r) => r.id)).toEqual(['1003', '1004', '1005'])
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 3, hasMore: false })
  })
})

describe('teamwork-crm listPipelines stages', () => {
  it('side-loads stages with the documented include and maps them', async () => {
    collections['pipelines'] = [PIPELINE as unknown as Row]
    const [pipeline] = await adapter.listPipelines(creds, { page: 1, limit: 10 })
    expect(requests[0].url.searchParams.get('include')).toBe('stages')
    expect(pipeline.stages?.map((s) => s.id)).toEqual(['72', '73'])
  })
})

describe('teamwork-crm get methods', () => {
  it.each([
    ['getContact', 'contacts', CONTACT],
    ['getCompany', 'companies', COMPANY],
    ['getDeal', 'deals', DEAL],
    ['getActivity', 'activities', ACTIVITY],
    ['getNote', 'notes', NOTE],
  ] as const)('%s reads GET /%s/{id}.json', async (method, collection, row) => {
    collections[collection] = [row as unknown as Row]
    const result = await adapter[method](creds, String(row.id))
    expect(result.id).toBe(String(row.id))
    expect(requests).toHaveLength(1)
    expect(requests[0].url.href).toBe(`${API}/${collection}/${row.id}.json`)
    expect(requests[0].headers['Authorization']).toBe('Bearer tw-key')
  })

  it('surfaces a 404 for an unknown id', async () => {
    await expect(adapter.getDeal(creds, '5')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('teamwork-crm listNotes', () => {
  it('reads the plural notes key and maps each note', async () => {
    collections['notes'] = [NOTE as unknown as Row]
    const notes = await adapter.listNotes(creds, { page: 1, limit: 10 })
    expect(requests[0].url.origin + requests[0].url.pathname).toBe(`${API}/notes.json`)
    expect(notes).toEqual([expect.objectContaining({ id: '4001', deal_id: '9001' })])
  })
})

describe('teamwork-crm response envelope', () => {
  function answer(body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(body)),
    )
  }

  it('throws 502 when a list response lacks its documented array key', async () => {
    answer({ data: [], meta: { page: { count: 0 } } })
    await expect(adapter.listDeals(creds, { page: 1, limit: 5 })).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining("no 'deals' array"),
    })
  })

  it('throws 502 when a single-entity response lacks its documented object key', async () => {
    answer({ data: DEAL })
    await expect(adapter.getDeal(creds, '9001')).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining("no 'deal' object"),
    })
  })
})

describe('teamwork-crm connection', () => {
  it('uses only the origin of a stored site URL', async () => {
    collections['deals'] = [DEAL as unknown as Row]
    await adapter.getDeal({ accessToken: 'tw-key', extra: { siteUrl: `${SITE}/crm/` } }, '9001')
    expect(requests[0].url.href).toBe(`${API}/deals/9001.json`)
  })

  it.each([
    ['http://acme.teamwork.com', /not https/],
    ['not a url', /not a URL/],
  ])('refuses a stored site URL %s before sending anything', async (siteUrl, message) => {
    await expect(
      adapter.getDeal({ accessToken: 'tw-key', extra: { siteUrl } }, '9001'),
    ).rejects.toMatchObject({ statusCode: 400, code: 'MISSING_CREDENTIAL', message })
    expect(requests).toHaveLength(0)
  })

  it('builds the base URL from a legacy subdomain', async () => {
    collections['deals'] = [DEAL as unknown as Row]
    await adapter.getDeal({ accessToken: 'tw-key', extra: { subdomain: 'acme' } }, '9001')
    expect(requests[0].url.href).toBe(`${API}/deals/9001.json`)
  })

  it('refuses a connection with no site URL before sending anything', async () => {
    await expect(
      adapter.listDeals({ accessToken: 'tw-key' }, { page: 1, limit: 5 }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'MISSING_CREDENTIAL',
    })
    expect(requests).toHaveLength(0)
  })

  it('collects the site URL and API key, keeping only the origin', async () => {
    const fields = adapter.credentialFields().map((f) => f.name)
    expect(fields).toEqual(['siteUrl', 'apiKey'])
    await expect(
      adapter.exchangeCredentials({
        siteUrl: 'https://acme.teamwork.com/crm/deals',
        apiKey: ' tw-key ',
      }),
    ).resolves.toEqual({ accessToken: 'tw-key', extra: { siteUrl: 'https://acme.teamwork.com' } })
    await expect(
      adapter.exchangeCredentials({ siteUrl: 'http://acme.teamwork.com', apiKey: 'k' }),
    ).rejects.toThrow(/https/)
    await expect(adapter.exchangeCredentials({ siteUrl: '', apiKey: 'k' })).rejects.toThrow(
      /Site URL/,
    )
  })
})
