/**
 * Richpanel tags, teams, tickets and contacts: rebuilt onto the documented API.
 *
 * https://developer.richpanel.com/reference/list-tags (append .md for the spec):
 *   GET /tags, no parameters, 200 schema `{ "tag": { "type": "array", ... } }`.
 * https://developer.richpanel.com/reference/list-teams:
 *   GET /teams, no parameters, 200 schema `{ "team": { "type": "array", ... } }`.
 * https://developer.richpanel.com/reference/the-tag-object and .../the-team-object show
 *   the same `GET /v1/tags` / `GET /v1/teams` "Response Example" as a bare JSON array.
 *   Both documented shapes are read; a missing or non-array envelope key or a non-object body
 *   throws, so an unreadable response never reaches the sync as an empty
 *   (complete) collection.
 *
 * Tickets: https://developer.richpanel.com/reference/the-conversation-object lists
 *   retrieval only by id, by conversation number, or by customer email/phone
 *   ("Fetch all conversations for a specific customer"); `/v1/tickets` is documented
 *   only as "Create conversation | `POST /v1/tickets`". No list endpoint exists.
 * Contacts: https://developer.richpanel.com/reference/the-customer-object documents
 *   only "Fetch customer details using their email or phone number" and the upsert.
 *
 * The fake honours ONLY documented paths and refuses any query parameter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { RichpanelAdapter } from '../../../../../../src/verticals/customer-support/adapters/richpanel/index'

const creds: Credentials = { accessToken: 'rp_test' }

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let total = 0
let bareArray = false
let override: unknown = undefined

const ids = () => Array.from({ length: total }, (_, i) => `id-${i + 1}`)

function row(id: string) {
  return {
    id,
    name: `name ${id}`,
    organization_id: 'org_id_1',
    created_at: '2025-04-25T12:11:46.718Z',
    updated_at: '2025-04-25T12:11:46.718Z',
  }
}

function respond(path: string, params: Record<string, unknown>): unknown {
  if (Object.keys(params).length > 0)
    throw new Error(`undocumented params on ${path}: ${Object.keys(params).join(',')}`)
  if (override !== undefined) return override
  const rows = ids().map(row)
  if (path === '/v1/tags') return bareArray ? rows : { tag: rows }
  if (path === '/v1/teams') return bareArray ? rows : { team: rows }
  throw new Error(`undocumented path ${path}`)
}

beforeEach(() => {
  calls = []
  total = 0
  bareArray = false
  override = undefined
  vi.spyOn(axios, 'create').mockImplementation(() => {
    return {
      get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = { ...(cfg?.params ?? {}) }
        calls.push({ path, params })
        return { data: respond(path, params) }
      },
      post: vi.fn(),
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new RichpanelAdapter({})

const lists: {
  name: string
  path: string
  run: (p: QueryParams) => Promise<Array<{ id: string }>>
}[] = [
  { name: 'listTags', path: '/v1/tags', run: (p) => adapter.listTags(creds, p) },
  { name: 'listTeams', path: '/v1/teams', run: (p) => adapter.listTeams(creds, p) },
]

for (const { name, path, run } of lists) {
  describe(`richpanel ${name} reads ${path} and pages it locally`, () => {
    it('serves 2L+1 rows once, in order, over pages 1..3, with hasMore exact', async () => {
      const L = 4
      total = 2 * L + 1
      const seen: string[] = []
      const reported: Array<boolean | undefined> = []
      const meta: Array<boolean | null | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await run(params)
        seen.push(...rows.map((r) => r.id))
        reported.push(readUpstreamPage(params)?.hasMore)
        meta.push(listPage(rows, params, 'richpanel').meta.hasMore)
      }
      expect(seen).toEqual(ids())
      expect(reported).toEqual([true, true, false])
      expect(meta).toEqual([true, true, false])
    })

    it('sends the documented path with no query parameters', async () => {
      total = 3
      await run(withPageSink({ page: 2, limit: 1 }))
      expect(calls).toEqual([{ path, params: {} }])
    })

    it('reads the documented bare-array response example too', async () => {
      total = 3
      bareArray = true
      const rows = await run(withPageSink({ page: 1, limit: 10 }))
      expect(rows.map((r) => r.id)).toEqual(['id-1', 'id-2', 'id-3'])
    })

    it('throws when the envelope is not an array instead of returning an empty list', async () => {
      override = 'not json'
      await expect(run(withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(/unexpected/i)
      override = { tag: 'x', team: 'x' }
      await expect(run(withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(/unexpected/i)
    })

    it('throws on an object without the documented key instead of reading it as an empty, complete list', async () => {
      override = {}
      await expect(run(withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(/unexpected/i)
      override = { tags: [{ id: 'a', name: 'a' }], teams: [{ id: 'a', name: 'a' }] }
      await expect(run(withPageSink({ page: 1, limit: 10 }))).rejects.toThrow(/unexpected/i)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      total = 9
      const params = parseListQuery({ page: '2', limit: '4' })
      const env = listPage(await run(params), params, 'richpanel')
      expect(env.data.map((r) => r.id)).toEqual(['id-5', 'id-6', 'id-7', 'id-8'])
      expect(env.meta.hasMore).toBe(true)
      expect(env.meta.totalCount).toBe(9)
    })
  })
}

describe('richpanel getTeam reads back a listed team through the documented GET /v1/teams', () => {
  it('returns the team whose id matches', async () => {
    total = 3
    const team = await adapter.getTeam(creds, 'id-2')
    expect(team.id).toBe('id-2')
    expect(team.name).toBe('name id-2')
    expect(calls).toEqual([{ path: '/v1/teams', params: {} }])
  })

  it('throws 404 when no listed team has that id', async () => {
    total = 2
    await expect(adapter.getTeam(creds, 'nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('richpanel getTag reads back a listed tag through the documented GET /v1/tags', () => {
  it('returns the tag whose id matches', async () => {
    total = 3
    const tag = await adapter.getTag(creds, 'id-3')
    expect(tag.id).toBe('id-3')
    expect(tag.name).toBe('name id-3')
    expect(calls).toEqual([{ path: '/v1/tags', params: {} }])
  })

  it('throws 404 when no listed tag has that id', async () => {
    total = 2
    await expect(adapter.getTag(creds, 'nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('richpanel refuses lists the API does not document, before sending anything', () => {
  it('listTickets throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(
      adapter.listTickets(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
  })

  it('listContacts throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(
      adapter.listContacts(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
  })
})
