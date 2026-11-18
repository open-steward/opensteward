/**
 * Richpanel list paging.
 *
 * From https://developer.richpanel.com/reference/list-users (append .md for the spec):
 *   "List Users" — "Use this API to fetch the details of all the users(agents)."
 *   GET /users declares no query parameters at all: no page, no per_page, no cursor.
 *
 * From https://developer.richpanel.com/reference/use-cases-examples:
 *   "**`GET /v1/tickets/{id}`**" — "Retrieve a single conversation by its ID." The
 *   response carries every message inline as `"comments": [ ... ]`.
 * From https://developer.richpanel.com/reference/retrieve-a-conversation-with-conversation-number:
 *   include_private_notes — "Set this to true to receive private notes along with
 *   messages/comments".
 *
 * Both are whole collections, so the adapter pages them locally. The fake honours
 * ONLY those parameters and refuses any other.
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

const ids = () => Array.from({ length: total }, (_, i) => `id-${i + 1}`)

function only(path: string, params: Record<string, unknown>, allowed: string[]): void {
  for (const k of Object.keys(params)) {
    if (!allowed.includes(k)) throw new Error(`undocumented param ${k} on ${path}`)
  }
}

function respond(path: string, params: Record<string, unknown>): unknown {
  if (path === '/v1/users') {
    only(path, params, [])
    return { users: ids().map((id) => ({ id, name: `Agent ${id}` })) }
  }
  const m = /^\/v1\/tickets\/([^/]+)$/.exec(path)
  if (m) {
    only(path, params, ['include_private_notes'])
    return {
      ticket: {
        id: m[1],
        status: 'OPEN',
        comments: ids().map((id) => ({
          id,
          body: `b ${id}`,
          created_at: '2026-01-01T00:00:00.000Z',
        })),
      },
    }
  }
  throw new Error(`unexpected path ${path}`)
}

beforeEach(() => {
  calls = []
  total = 0
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

const methods: {
  name: string
  path: string
  // Exact query sent. listMessages must keep include_private_notes, or private
  // notes silently drop out of every message page.
  sent: Record<string, unknown>
  run: (p: QueryParams) => Promise<Array<{ id: string }>>
}[] = [
  { name: 'listUsers', path: '/v1/users', sent: {}, run: (p) => adapter.listUsers(creds, p) },
  {
    name: 'listMessages',
    path: '/v1/tickets/t-1',
    sent: { include_private_notes: true },
    run: (p) => adapter.listMessages(creds, 't-1', p),
  },
]

for (const { name, path, sent, run } of methods) {
  describe(`richpanel ${name} pages the whole collection locally`, () => {
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

    it('the page-2 request sends no paging parameters (the endpoint documents none)', async () => {
      total = 9
      await run(withPageSink({ page: 2, limit: 4 }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.path).toBe(path)
      expect(calls[0]!.params).not.toHaveProperty('page')
      expect(calls[0]!.params).not.toHaveProperty('per_page')
      expect(calls[0]!.params).toEqual(sent)
    })

    it('a limit above the router cap is clamped', async () => {
      total = 600
      const params = parseListQuery({ limit: '9999' })
      expect(params.limit).toBe(500)
      const rows = await run(params)
      expect(rows).toHaveLength(500)
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
