/**
 * Copper list paging: 1-based `page` + caller's `limit` → Copper's
 * `page_number` + `page_size` in the POST /{entity}/search body, in a stable
 * order, and never past the search cap.
 *
 * From https://developer.copper.com/introduction/pagination.html:
 *
 *   "The default value for page_size is 20, and its value can be set to any integer between 1 and 200."
 *   "to cycle through the pages we need to set the page_number parameter in the request to 1 initially"
 *   "search requests are limited to returning only the first 100,000 records regardless of the pagination parameters."
 *   "It is highly recommended that you sort the results you get back from a /search endpoint.
 *    This ensures that records are returned in a consistent fashion across requests."
 *
 * and on each search endpoint used below
 * (people/list-people-search.html, companies/list-companies-search.html,
 * opportunities/list-opportunities-search.html, activities/list-activities-search.html):
 *
 *   page_number: "The page number (starting with 1) that you would like to view."
 *   page_size:   "The number of entries included in a page of results"
 *   sort_by:     "The field on which to sort the results (see footnote 1)." — default
 *                `first_name` (people), `date_modified` (companies), `name` (opportunities);
 *                `date_created` is a listed field on all three. Activities search lists
 *                no `sort_by` at all.
 *   sort_direction: "The direction in which to sort the results. Possible values are: asc or desc."
 *
 * Notes. Copper documents no notes resource — POST /notes/search is not in its
 * developer docs — because a note IS an activity. From
 * https://developer.copper.com/activities/list-activity-types.html:
 *
 *   "By default, Copper has three user-entered activity types: Notes, Phone Calls,
 *    and Meetings. Notes have a hard-coded ID of 0."
 *   "When supplied as parameters for Activity creation or search, Activity Type
 *    objects need only specify the "category" and "id" fields."
 *
 * and from activities/list-activities-search.html:
 *
 *   activity_types: "The activity types to filter results on" — specified by
 *   {"id": activity_type_id, "category": category }
 *
 * So listNotes is POST /activities/search filtered to [{ category: 'user', id: 0 }],
 * paged exactly like listActivities. listPipelines (GET /pipelines) takes no paging.
 *
 * A listed note's id is an activity id, so the single-note calls go through the
 * activity endpoints too, never the undocumented /notes/{id}:
 *
 *   activities/fetch-an-activity-by-id.html: "GET https://api.copper.com/developer_api/v1/activities/{{example_activity_id}}"
 *   activities/create-a-new-activity.html:   "POST https://api.copper.com/developer_api/v1/activities",
 *     its "Create New Note" example body { "parent": { "type": "person", "id": 27140359 },
 *     "type": { "category": "user", "id": 0 }, "details": "This is the description of this note" }
 *   activities/delete-an-activity.html:      "DELETE https://api.copper.com/developer_api/v1/activities/{{delete_activity_id}}"
 *     "This request permanently removes a record from your Copper account."
 *
 * An activity that is not a note is not found through the notes calls: a
 * phone call's id must not read, or delete, as a note.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseListQuery, withPageSink, type QueryParams } from '@opensteward/shared'
import { CopperAdapter } from '../../../../../../src/verticals/crm/adapters/copper/index'

const CREDS = { accessToken: 'copper_test', extra: { email: 'ops@example.test' } }
/** Documented: "any integer between 1 and 200". */
const MAX = 200
/** Documented: "only the first 100,000 records". */
const CAP = 100_000
const N_ROWS = 1000

type Sent = { page_number: number; page_size: number }

interface Rec {
  id: number
  type?: { id: number; category: string }
  name: string
  first_name: string
  date_created: number
  date_modified: number
}

/** The fields a search can sort on (every one but the activity type). */
type SortKey = Exclude<keyof Rec, 'type'>

/** Each entity's documented default `sort_by`; activities documents none. */
const DEFAULT_SORT: Record<string, SortKey | undefined> = {
  people: 'first_name',
  companies: 'date_modified',
  opportunities: 'name',
  activities: undefined,
}
const SORTABLE = new Set(['date_created', 'date_modified', 'name', 'first_name'])

/**
 * A fake Copper that honours ONLY the documented search parameters:
 * `page_number` (from 1, default 1), `page_size` (1..200, default 20),
 * `sort_by` + `sort_direction` (each entity's documented default when absent),
 * and the first 100,000 matches only. Out-of-range values are refused rather
 * than silently corrected. `store` is live, so a test can edit or add a record
 * between pages.
 */
/** Copper's note activity type ("Notes have a hard-coded ID of 0."). */
const NOTE = { id: 0, category: 'user' }
/** Another user-entered type, as a Phone Call's assigned id might be. */
const CALL = { id: 351, category: 'user' }

function fakeCopper(entity: string, total: number, opts: { callsBetweenNotes?: boolean } = {}) {
  const pad = (i: number) => String(i).padStart(7, '0')
  const store: Rec[] = Array.from({ length: total }, (_, i) => ({
    id: i + 1,
    name: `n${pad(i + 1)}`,
    first_name: `n${pad(i + 1)}`,
    date_created: i + 1,
    date_modified: i + 1,
    ...(entity === 'activities'
      ? { type: opts.callsBetweenNotes && (i + 1) % 2 === 0 ? CALL : NOTE }
      : {}),
  }))
  const sent: Sent[] = []
  const bodies: Record<string, unknown>[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    if (init?.method !== 'POST' || url.pathname !== `/developer_api/v1/${entity}/search`) {
      return new Response(`unexpected ${init?.method} ${url.pathname}`, { status: 404 })
    }
    const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>
    bodies.push(body)
    const pageNumber = body['page_number'] ?? 1
    const pageSize = body['page_size'] ?? 20
    if (typeof pageNumber !== 'number' || !Number.isInteger(pageNumber) || pageNumber < 1) {
      return new Response(`page_number must be >= 1 (got ${String(pageNumber)})`, { status: 422 })
    }
    if (
      typeof pageSize !== 'number' ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > MAX
    ) {
      return new Response(`page_size must be 1..${MAX} (got ${String(pageSize)})`, { status: 422 })
    }
    const types = body['activity_types']
    if (types !== undefined) {
      const valid =
        entity === 'activities' &&
        Array.isArray(types) &&
        types.every(
          (t: unknown) =>
            typeof (t as Rec['type'])?.id === 'number' &&
            ['user', 'system'].includes(String((t as Rec['type'])?.category)),
        )
      if (!valid) return new Response(`bad activity_types ${JSON.stringify(types)}`, { status: 422 })
    }
    sent.push({ page_number: pageNumber, page_size: pageSize })
    const field =
      DEFAULT_SORT[entity] === undefined
        ? undefined
        : SORTABLE.has(String(body['sort_by']))
          ? (body['sort_by'] as SortKey)
          : DEFAULT_SORT[entity]
    const wanted = types as Array<{ id: number; category: string }> | undefined
    const ordered = store.filter(
      (r) => !wanted || wanted.some((t) => t.id === r.type?.id && t.category === r.type?.category),
    )
    if (field) {
      ordered.sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : a.id - b.id))
      if (body['sort_direction'] === 'desc') ordered.reverse()
    }
    const start = (pageNumber - 1) * pageSize
    const page = ordered.slice(0, CAP).slice(start, start + pageSize)
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { 'content-type': 'application/json', 'X-PW-TOTAL': String(store.length) },
    })
  })
  return { sent, bodies, store }
}

function ids(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i))
}

type Row = { id: string }

const METHODS = [
  {
    name: 'listContacts',
    entity: 'people',
    call: (a: CopperAdapter, p: QueryParams): Promise<Row[]> => a.listContacts(CREDS, p),
  },
  {
    name: 'listCompanies',
    entity: 'companies',
    call: (a: CopperAdapter, p: QueryParams): Promise<Row[]> => a.listCompanies(CREDS, p),
  },
  {
    name: 'listDeals',
    entity: 'opportunities',
    call: (a: CopperAdapter, p: QueryParams): Promise<Row[]> => a.listDeals(CREDS, p),
  },
  {
    name: 'listActivities',
    entity: 'activities',
    call: (a: CopperAdapter, p: QueryParams): Promise<Row[]> => a.listActivities(CREDS, p),
  },
  {
    name: 'listNotes',
    entity: 'activities',
    call: (a: CopperAdapter, p: QueryParams): Promise<Row[]> => a.listNotes(CREDS, p),
  },
] as const

const SORTED = METHODS.filter((m) => DEFAULT_SORT[m.entity] !== undefined)

afterEach(() => vi.restoreAllMocks())

describe('copper capabilities', () => {
  it('declares the documented 200-per-page ceiling so the sync worker never asks for more', () => {
    expect(new CopperAdapter().capabilities).toEqual(expect.objectContaining({ maxPageSize: MAX }))
  })
})

describe.each(METHODS)('copper $name paging', ({ entity, call }) => {
  const adapter = () => new CopperAdapter()
  const run = async (query: Record<string, string>) =>
    (await call(adapter(), parseListQuery(query))).map((r) => r.id)
  /** Params at a page the router never sends, as a direct caller builds them. */
  const runAt = async (page: number) => {
    const params = parseListQuery({ limit: '10' })
    params.page = page
    return (await call(adapter(), params)).map((r) => r.id)
  }

  it('page 1 returns the first rows and sends page_number 1 with the caller limit', async () => {
    const { sent } = fakeCopper(entity, N_ROWS)
    expect(await run({ page: '1', limit: '10' })).toEqual(ids(1, 10))
    expect(sent).toEqual([{ page_number: 1, page_size: 10 }])
  })

  it('page 2 returns the next rows', async () => {
    const { sent } = fakeCopper(entity, N_ROWS)
    expect(await run({ page: '2', limit: '10' })).toEqual(ids(11, 10))
    expect(sent).toEqual([{ page_number: 2, page_size: 10 }])
  })

  it('a missing page returns the first rows', async () => {
    const { sent } = fakeCopper(entity, N_ROWS)
    expect(await run({ limit: '10' })).toEqual(ids(1, 10))
    expect(sent).toEqual([{ page_number: 1, page_size: 10 }])
  })

  // parseListQuery reads 0, -3 and non-numbers as the first page before an
  // adapter sees them, so this guard is for direct callers: built directly.
  it.each([0, -3])('a direct page %s is treated as page 1', async (page) => {
    const { sent } = fakeCopper(entity, N_ROWS)
    expect(await runAt(page)).toEqual(ids(1, 10))
    expect(sent).toEqual([{ page_number: 1, page_size: 10 }])
  })

  it('a limit above the documented 200 is clamped, and page 2 strides by the clamp', async () => {
    const { sent } = fakeCopper(entity, N_ROWS)
    expect(await run({ page: '1', limit: '500' })).toEqual(ids(1, MAX))
    expect(await run({ page: '2', limit: '500' })).toEqual(ids(MAX + 1, MAX))
    expect(sent).toEqual([
      { page_number: 1, page_size: MAX },
      { page_number: 2, page_size: MAX },
    ])
  })

  it('a direct call with no limit keeps the adapter default of 25', async () => {
    const { sent } = fakeCopper(entity, N_ROWS)
    expect((await call(adapter(), {})).map((r) => r.id)).toEqual(ids(1, 25))
    expect(sent).toEqual([{ page_number: 1, page_size: 25 }])
  })

  it.each([
    [Number.NaN, 25],
    [0, 25],
    [-5, 25],
    [7.5, 7],
    ['10', 10],
    ['abc', 25],
  ])('a direct call with limit %s sends a valid page_size (%i)', async (limit, size) => {
    const { sent } = fakeCopper(entity, N_ROWS)
    const params = { limit } as unknown as QueryParams
    expect((await call(adapter(), params)).map((r) => r.id)).toEqual(ids(1, size))
    expect(sent).toEqual([{ page_number: 1, page_size: size }])
  })

  it('a direct call with page "2" as a string reads it as page 2', async () => {
    const { sent } = fakeCopper(entity, N_ROWS)
    const params = { page: '2', limit: 10 } as unknown as QueryParams
    expect((await call(adapter(), params)).map((r) => r.id)).toEqual(ids(11, 10))
    expect(sent).toEqual([{ page_number: 2, page_size: 10 }])
  })

  it.each([10, 7, MAX])(
    'walks every row exactly once, in order, driven like the sync (limit %i, N = 2L + 1)',
    async (limit) => {
      const n = 2 * limit + 1
      fakeCopper(entity, n)
      const seen: string[] = []
      for (let k = 1; k <= 10; k++) {
        const page = (await call(adapter(), withPageSink({ page: k, limit }))).map((r) => r.id)
        // The router truncates an over-return to the caller's limit.
        expect(page.length).toBeLessThanOrEqual(limit)
        seen.push(...page)
        if (page.length < limit) break
      }
      expect(seen).toEqual(ids(1, n))
    },
  )
})

describe.each(METHODS)('copper $name at the 100,000-record search cap', ({ entity, call }) => {
  it('refuses a page that starts past the cap, sending nothing', async () => {
    const { sent } = fakeCopper(entity, CAP + 10)
    await expect(
      call(new CopperAdapter(), parseListQuery({ page: '501', limit: '200' })),
    ).rejects.toMatchObject({ statusCode: 422, code: 'UPSTREAM_LIMIT' })
    expect(sent).toEqual([])
  })

  it('serves the last full page inside the cap', async () => {
    fakeCopper(entity, CAP + 10)
    const rows = await call(new CopperAdapter(), parseListQuery({ page: '500', limit: '200' }))
    expect(rows.map((r) => r.id)).toEqual(ids(CAP - 199, 200))
  })

  it('refuses a page the cap cuts short, whose end cannot be told from the real one', async () => {
    fakeCopper(entity, CAP + 10)
    // limit 7, page 14286 → records 99,996..100,002; Copper returns only to 100,000.
    await expect(
      call(new CopperAdapter(), parseListQuery({ page: '14286', limit: '7' })),
    ).rejects.toMatchObject({ statusCode: 422, code: 'UPSTREAM_LIMIT' })
  })

  it('still ends normally on a short page below the cap', async () => {
    fakeCopper(entity, 25)
    const rows = await call(new CopperAdapter(), parseListQuery({ page: '3', limit: '10' }))
    expect(rows.map((r) => r.id)).toEqual(ids(21, 5))
  })
})

describe.each(SORTED)('copper $name order', ({ entity, call }) => {
  it('asks for oldest-created first on every page', async () => {
    const { bodies } = fakeCopper(entity, N_ROWS)
    await call(new CopperAdapter(), parseListQuery({ page: '2', limit: '10' }))
    expect(bodies).toEqual([
      expect.objectContaining({ sort_by: 'date_created', sort_direction: 'asc' }),
    ])
  })

  it('an edit and a new record between pages move no row across a page boundary', async () => {
    const limit = 10
    const n = 2 * limit + 5
    const { store } = fakeCopper(entity, n)
    const seen: string[] = []
    for (let k = 1; k <= 10; k++) {
      const page = (await call(new CopperAdapter(), withPageSink({ page: k, limit }))).map(
        (r) => r.id,
      )
      seen.push(...page)
      if (k === 1) {
        // Record 3 is edited — renamed and re-stamped — and a record is created.
        Object.assign(store[2]!, { name: 'a-edited', first_name: 'a-edited', date_modified: 1e6 })
        store.push({
          id: n + 1,
          name: 'a-new',
          first_name: 'a-new',
          date_created: 1e6 + 1,
          date_modified: 1e6 + 1,
        })
      }
      if (page.length < limit) break
    }
    expect(seen).toEqual(ids(1, n + 1))
  })
})

describe('copper listActivities order', () => {
  it('sends no sort_by, which activities search does not document', async () => {
    const { bodies } = fakeCopper('activities', N_ROWS)
    await new CopperAdapter().listActivities(CREDS, parseListQuery({ limit: '10' }))
    expect(bodies[0]).not.toHaveProperty('sort_by')
    expect(bodies[0]).not.toHaveProperty('sort_direction')
  })
})

describe('copper listNotes lists note activities', () => {
  it('searches activities for the documented note type, never the undocumented /notes/search', async () => {
    const { bodies } = fakeCopper('activities', N_ROWS)
    const requests: string[] = []
    const fetchSpy = vi.mocked(globalThis.fetch)
    await new CopperAdapter().listNotes(CREDS, parseListQuery({ limit: '10' }))
    for (const [input, init] of fetchSpy.mock.calls)
      requests.push(`${init?.method} ${new URL(String(input)).pathname}`)
    expect(requests).toEqual(['POST /developer_api/v1/activities/search'])
    expect(bodies).toEqual([
      { page_number: 1, page_size: 10, activity_types: [{ category: 'user', id: 0 }] },
    ])
  })

  it('pages over notes only when other activities sit between them', async () => {
    // Odd ids are notes, even ids phone calls: note k is activity 2k - 1.
    fakeCopper('activities', 200, { callsBetweenNotes: true })
    const notes = (start: number, count: number) =>
      Array.from({ length: count }, (_, i) => String(2 * (start + i) - 1))
    const adapter = new CopperAdapter()
    const page = async (p: string) =>
      (await adapter.listNotes(CREDS, parseListQuery({ page: p, limit: '10' }))).map((r) => r.id)
    expect(await page('1')).toEqual(notes(1, 10))
    expect(await page('2')).toEqual(notes(11, 10))
  })

  it('returns canonical notes, their text from the activity details', async () => {
    fakeCopper('activities', 3)
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: 9, type: NOTE, parent: { id: 5, type: 'company' }, details: 'Renewal call booked' },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    const [note] = await new CopperAdapter().listNotes(CREDS, parseListQuery({ limit: '10' }))
    expect(note).toMatchObject({ id: '9', content: 'Renewal call booked', company_id: '5' })
  })
})

describe('copper single notes are note activities', () => {
  /** A fake Copper activity store: id 9 is a note, id 10 a phone call. */
  function fakeActivities() {
    const store: Record<string, Record<string, unknown>> = {
      '9': { id: 9, type: NOTE, parent: { id: 5, type: 'person' }, details: 'Renewal call booked', user_id: 7 },
      '10': { id: 10, type: CALL, parent: { id: 5, type: 'person' }, details: 'Called about renewal' },
    }
    const requests: string[] = []
    const bodies: unknown[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input))
      const method = init?.method ?? 'GET'
      requests.push(`${method} ${url.pathname}`)
      const json = (status: number, payload: unknown): Response =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'content-type': 'application/json' },
        })
      const one = /^\/developer_api\/v1\/activities\/(\d+)$/.exec(url.pathname)
      if (one && method === 'GET') {
        const row = store[one[1]!]
        return row ? json(200, row) : json(404, { message: 'Resource not found' })
      }
      if (one && method === 'DELETE') return json(200, { id: Number(one[1]), is_deleted: true })
      if (url.pathname === '/developer_api/v1/activities' && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>
        bodies.push(body)
        return json(200, { id: 3064242278, user_id: 137658, date_created: 1496772355, ...body })
      }
      return json(404, { message: `unexpected ${method} ${url.pathname}` })
    })
    return { requests, bodies }
  }

  it('getNote fetches the activity by id, never the undocumented /notes/{id}', async () => {
    const { requests } = fakeActivities()
    const note = await new CopperAdapter().getNote(CREDS, '9')
    expect(requests).toEqual(['GET /developer_api/v1/activities/9'])
    expect(note).toMatchObject({ id: '9', content: 'Renewal call booked', contact_id: '5', owner_id: '7' })
  })

  it('getNote on an activity that is not a note is not found', async () => {
    fakeActivities()
    await expect(new CopperAdapter().getNote(CREDS, '10')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  })

  it('createNote creates a note-type activity with the documented body', async () => {
    const { requests, bodies } = fakeActivities()
    const note = await new CopperAdapter().createNote(CREDS, {
      content: 'This is the description of this note',
      contact_id: '27140359',
    })
    expect(requests).toEqual(['POST /developer_api/v1/activities'])
    expect(bodies).toEqual([
      {
        parent: { type: 'person', id: 27140359 },
        type: { category: 'user', id: 0 },
        details: 'This is the description of this note',
      },
    ])
    expect(note).toMatchObject({ id: '3064242278', content: 'This is the description of this note' })
  })

  it.each([
    ['company_id', 'company'],
    ['deal_id', 'opportunity'],
  ] as const)('createNote attaches a %s as a %s parent', async (field, type) => {
    const { bodies } = fakeActivities()
    await new CopperAdapter().createNote(CREDS, { content: 'x', [field]: '42' })
    expect(bodies[0]).toMatchObject({ parent: { type, id: 42 } })
  })

  it('deleteNote deletes the note activity, after checking it is a note', async () => {
    const { requests } = fakeActivities()
    await new CopperAdapter().deleteNote(CREDS, '9')
    expect(requests).toEqual([
      'GET /developer_api/v1/activities/9',
      'DELETE /developer_api/v1/activities/9',
    ])
  })

  it('deleteNote refuses an activity that is not a note, deleting nothing', async () => {
    const { requests } = fakeActivities()
    await expect(new CopperAdapter().deleteNote(CREDS, '10')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    })
    expect(requests).toEqual(['GET /developer_api/v1/activities/10'])
  })
})
