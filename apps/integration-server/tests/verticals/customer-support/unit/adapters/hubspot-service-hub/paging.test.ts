/**
 * hubspot-service-hub — paging for the list methods.
 *
 * Cursor lists (tickets, contacts, owners). HubSpot's first-party OpenAPI
 * specs (api.hubspot.com/public/api/spec/v2/specs/release/22189/version/3
 * for tickets, …/22150/version/3 for contacts, …/22153/version/3 for owners)
 * give each list `limit` and `after`; `after` is "The paging cursor token of
 * the last successfully read resource will be returned as the
 * `paging.next.after` JSON property of a paged response containing more
 * results", and `ForwardPaging` "Contains the next page reference when more
 * results are available; omitted or empty on the last page." The CRM object
 * guide (developers.hubspot.com/docs/guides/crm/using-object-apis): "To
 * retrieve a specific number of records under 100, add a value to the limit
 * parameter." Above 100 HubSpot answers 400 ("You can only request at most
 * 100 objects in one request."), so the adapter clamps to 100 and reports
 * the size it sent.
 *
 * Whole-collection lists (tags, teams). Tags are the enum options of one
 * property ("Read a property", no paging parameter); teams come back as
 * `CollectionResponsePublicTeamNoPaging`. Both are paged locally.
 *
 * The fake honours ONLY the documented parameters: `limit` and `after`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { HubspotServiceHubAdapter } from '../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/index'
import { HubspotServiceHubClient } from '../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/client'
import {
  DEFAULT_TICKET_PROPERTIES,
  DEFAULT_CONTACT_PROPERTIES,
} from '../../../../../../src/verticals/customer-support/adapters/hubspot-service-hub/constants'

const creds = { accessToken: 'at', refreshToken: 'rt' } as Credentials

/** "records under 100"; above it HubSpot answers 400. */
const DOC_MAX = 100
/** The spec's `limit` default on /crm/v3/objects/*. */
const DOC_DEFAULT = 10

interface Call {
  path: string
  params: Record<string, unknown>
}

/** HubSpot's `after` is opaque; mint one the adapter cannot compute. */
const encode = (offset: number) => Buffer.from(`a:${offset}`).toString('base64')
const decode = (after: unknown) =>
  Number(Buffer.from(String(after), 'base64').toString('utf8').slice(2))

function fakeCursorList(path: string, total: number, make: (i: number) => unknown) {
  const calls: Call[] = []
  vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockImplementation((async (
    p: string,
    params?: Record<string, unknown>,
  ) => {
    const q = params ?? {}
    calls.push({ path: p, params: q })
    if (p !== path) throw new Error(`unexpected path in test: ${p}`)
    const limit = q['limit'] === undefined ? DOC_DEFAULT : Number(q['limit'])
    if (!(Number.isInteger(limit) && limit >= 1 && limit <= DOC_MAX)) {
      throw Object.assign(
        new Error(`400: You can only request at most 100 objects in one request.`),
        {
          response: { status: 400 },
        },
      )
    }
    const offset = q['after'] === undefined ? 0 : decode(q['after'])
    const rows = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) =>
      make(offset + i),
    )
    const end = offset + rows.length
    return {
      results: rows,
      ...(end < total
        ? { paging: { next: { after: encode(end), link: `?after=${encode(end)}` } } }
        : {}),
    }
  }) as typeof HubspotServiceHubClient.prototype.get)
  return calls
}

function fakeWhole(path: string, body: unknown) {
  const calls: Call[] = []
  vi.spyOn(HubspotServiceHubClient.prototype, 'get').mockImplementation((async (
    p: string,
    params?: Record<string, unknown>,
  ) => {
    calls.push({ path: p, params: params ?? {} })
    if (p !== path) throw new Error(`unexpected path in test: ${p}`)
    return body
  }) as typeof HubspotServiceHubClient.prototype.get)
  return calls
}

const ticket = (i: number) => ({ id: `t${i}`, properties: { subject: `s${i}` } })
const contact = (i: number) => ({ id: `c${i}`, properties: { email: `c${i}@example.test` } })
const owner = (i: number) => ({ id: `o${i}`, email: `o${i}@example.test` })

type Lister = (p: QueryParams) => Promise<Array<{ id: string }>>

const adapter = new HubspotServiceHubAdapter({
  clientId: 'id',
  clientSecret: 'secret',
  redirectUri: 'https://x.test/cb',
})

/** No maxPageSize is declared on this adapter; the cursor lists clamp and report. */
const bearing = adapter as { capabilities?: { maxPageSize?: number } }

const cursorCases: Array<{
  name: string
  path: string
  make: (i: number) => unknown
  prefix: string
  list: Lister
}> = [
  {
    name: 'listTickets',
    path: '/crm/v3/objects/tickets',
    make: ticket,
    prefix: 't',
    list: (p) => adapter.listTickets(creds, p),
  },
  {
    name: 'listContacts',
    path: '/crm/v3/objects/contacts',
    make: contact,
    prefix: 'c',
    list: (p) => adapter.listContacts(creds, p),
  },
  {
    name: 'listUsers',
    path: '/crm/v3/owners',
    make: owner,
    prefix: 'o',
    list: (p) => adapter.listUsers(creds, p),
  },
]

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(cursorCases)(
  'hubspot-service-hub $name pages by `after`',
  ({ path, make, prefix, list }) => {
    it('pages 1..3 of 2L+1 rows serve every id once, in order, with exact hasMore', async () => {
      const L = 4
      const calls = fakeCursorList(path, 2 * L + 1, make)
      const ids: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const items = await list(params)
        ids.push(...items.map((x) => x.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(ids).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => `${prefix}${i}`))
      expect(more).toEqual([true, true, false])
      expect(calls.map((c) => c.params['limit'])).toEqual([L, L, L])
      expect(calls.map((c) => c.params['after'])).toEqual([undefined, encode(L), encode(2 * L)])
    })

    it('the page-2 request carries the documented `after` key', async () => {
      const calls = fakeCursorList(path, 10, make)
      await list(withPageSink({ page: 1, limit: 3 }))
      calls.length = 0
      await list(withPageSink({ page: 2, limit: 3 }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.params).toHaveProperty('after', encode(3))
    })

    it('a cold page 3 walks the cursor chain rather than repeating page 1', async () => {
      fakeCursorList(path, 9, make)
      const items = await list(withPageSink({ page: 3, limit: 4 }))
      expect(items.map((x) => x.id)).toEqual([`${prefix}8`])
    })

    it('a limit above the maximum of 100 is clamped, and the size sent is reported', async () => {
      const calls = fakeCursorList(path, 150, make)
      const params = withPageSink({ page: 1, limit: 500 })
      const items = await list(params)
      expect(calls[0]!.params['limit']).toBe(DOC_MAX)
      expect(items).toHaveLength(DOC_MAX)
      expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: DOC_MAX })
    })

    it('walks through parseListQuery and listPage to the end', async () => {
      const total = 11
      fakeCursorList(path, total, make)
      const ids: string[] = []
      const sizes: number[] = []
      for (let n = 1; n < 50; n++) {
        const params = parseListQuery({ limit: '5', page: String(n) }, bearing)
        const env = listPage(await list(params), params, 'hubspot-service-hub')
        ids.push(...env.data.map((x) => x.id))
        sizes.push(env.data.length)
        if (env.meta.hasMore !== true) break
      }
      expect(ids).toEqual(Array.from({ length: total }, (_, i) => `${prefix}${i}`))
      expect(sizes).toEqual([5, 5, 1])
    })
  },
)

describe.each([
  {
    name: 'listTickets',
    path: '/crm/v3/objects/tickets',
    make: ticket,
    properties: DEFAULT_TICKET_PROPERTIES,
    list: ((p) => adapter.listTickets(creds, p)) as Lister,
  },
  {
    name: 'listContacts',
    path: '/crm/v3/objects/contacts',
    make: contact,
    properties: DEFAULT_CONTACT_PROPERTIES,
    list: ((p) => adapter.listContacts(creds, p)) as Lister,
  },
])(
  'hubspot-service-hub $name keeps its property list while paging',
  ({ path, make, properties, list }) => {
    it('every page request carries the mapped `properties`', async () => {
      const calls = fakeCursorList(path, 10, make)
      await list(withPageSink({ page: 1, limit: 3 }))
      await list(withPageSink({ page: 2, limit: 3 }))
      expect(calls).toHaveLength(2)
      for (const c of calls) expect(c.params['properties']).toEqual(properties)
    })
  },
)

describe('hubspot-service-hub cursor chains do not leak between keys', () => {
  it('a second connection walks its own chain', async () => {
    const calls = fakeCursorList('/crm/v3/owners', 10, owner)
    await adapter.listUsers(creds, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const other = { accessToken: 'at2', refreshToken: 'rt2' } as Credentials
    const items = await adapter.listUsers(other, withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((c) => c.params['after'])).toEqual([undefined, encode(3)])
    expect(items.map((x) => x.id)).toEqual(['o3', 'o4', 'o5'])
  })

  it('a different page size walks a fresh chain', async () => {
    const calls = fakeCursorList('/crm/v3/objects/tickets', 20, ticket)
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const items = await adapter.listTickets(creds, withPageSink({ page: 2, limit: 5 }))
    expect(calls.map((c) => c.params['after'])).toEqual([undefined, encode(5)])
    expect(items.map((x) => x.id)).toEqual(['t5', 't6', 't7', 't8', 't9'])
  })
})

describe('hubspot-service-hub explicit caller cursor', () => {
  it('sends it as `after` in one request and reports hasMore', async () => {
    const calls = fakeCursorList('/crm/v3/objects/contacts', 10, contact)
    const mid = withPageSink({ limit: 3, cursor: encode(3) } as QueryParams)
    const items = await adapter.listContacts(creds, mid)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params['after']).toBe(encode(3))
    expect(items.map((x) => x.id)).toEqual(['c3', 'c4', 'c5'])
    expect(readUpstreamPage(mid)?.hasMore).toBe(true)

    const last = withPageSink({ limit: 3, cursor: encode(9) } as QueryParams)
    await adapter.listContacts(creds, last)
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })
})

const tagBody = (n: number) => ({
  options: [
    { label: 'hidden', value: 'hidden', hidden: true, displayOrder: -1 },
    ...Array.from({ length: n }, (_, i) => ({
      label: `Tag ${i}`,
      value: `tag${i}`,
      hidden: false,
      displayOrder: i,
    })),
  ],
})
const teamBody = (n: number) => ({
  results: Array.from({ length: n }, (_, i) => ({ id: `tm${i}`, name: `Team ${i}`, userIds: [] })),
})

const wholeCases: Array<{
  name: string
  path: string
  body: (n: number) => unknown
  list: Lister
}> = [
  {
    name: 'listTags',
    path: '/crm/v3/properties/tickets/hs_tag_ids',
    body: tagBody,
    list: (p) => adapter.listTags!(creds, p),
  },
  {
    name: 'listTeams',
    path: '/settings/v3/users/teams',
    body: teamBody,
    list: (p) => adapter.listTeams!(creds, p),
  },
]

describe.each(wholeCases)(
  'hubspot-service-hub $name pages the whole collection locally',
  ({ path, body, list }) => {
    it('pages 1..3 of 2L+1 rows serve every id once, in order, with exact hasMore', async () => {
      const L = 3
      const N = 2 * L + 1
      const calls = fakeWhole(path, body(N))
      const all = await list({})
      expect(all).toHaveLength(N)
      const ids: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const items = await list(params)
        ids.push(...items.map((x) => x.id))
        more.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)).toMatchObject({ pagedLocally: true, totalCount: N })
      }
      expect(ids).toEqual(all.map((x) => x.id))
      expect(more).toEqual([true, true, false])
      // The endpoint takes no paging parameter; none is sent.
      expect(calls.every((c) => Object.keys(c.params).length === 0)).toBe(true)
    })

    it('walks through parseListQuery and listPage to the end', async () => {
      fakeWhole(path, body(11))
      const ids: string[] = []
      const sizes: number[] = []
      for (let n = 1; n < 50; n++) {
        const params = parseListQuery({ limit: '5', page: String(n) }, bearing)
        const env = listPage(await list(params), params, 'hubspot-service-hub')
        ids.push(...env.data.map((x) => x.id))
        sizes.push(env.data.length)
        if (env.meta.hasMore !== true) break
      }
      expect(new Set(ids).size).toBe(11)
      expect(sizes).toEqual([5, 5, 1])
    })
  },
)

describe('hubspot-service-hub API path above the maximum', () => {
  it('limit=500 page=2 serves rows 100..199 and reports more', async () => {
    fakeCursorList('/crm/v3/objects/tickets', 250, ticket)
    const params = parseListQuery({ limit: '500', page: '2' }, bearing)
    const env = listPage(await adapter.listTickets(creds, params), params, 'hubspot-service-hub')
    expect(env.data.map((x) => x.id)).toEqual(
      Array.from({ length: DOC_MAX }, (_, i) => `t${DOC_MAX + i}`),
    )
    expect(env.meta.hasMore).toBe(true)
  })
})
