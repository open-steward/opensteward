/**
 * ConnectWise PSA list paging.
 *
 * ConnectWise publishes its PSA swagger as public files on the Developer
 * Network (Service.json, Company.json, System.json under
 * https://developer.connectwise.com/@api/deki/files/). Every list endpoint
 * this adapter calls (/service/tickets, /service/tickets/{id}/notes,
 * /company/contacts, /system/members, /service/boards) takes the shared
 * `page` and `pageSize` query parameters ("type": "integer", no maximum
 * documented) and answers 200 with a top-level array plus a `Link` header:
 * "Pagination header; potentially includes first, prev, next, and/or last."
 *
 * The fake below honours ONLY `page` and `pageSize`, and sends a Link header
 * with rel="next" only while rows remain.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { ConnectwisePsaAdapter } from '../../../../../../src/verticals/customer-support/adapters/connectwise-psa/index'

const creds: Credentials = {
  accessToken: 'b64',
  extra: { clientId: 'cid', siteUrl: 'https://cw.example.test' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let total = 0
let sendLink = true
let nullBody = false

/** The rows of one upstream page, as the documented parameters select them. */
function upstreamPage(params: Record<string, unknown>): { ids: number[]; more: boolean } {
  const page = Number(params['page'] ?? 1)
  const size = Number(params['pageSize'] ?? 25)
  const start = (page - 1) * size
  const ids = Array.from({ length: total }, (_, i) => i + 1).slice(start, start + size)
  return { ids, more: start + size < total }
}

function row(path: string, id: number): Record<string, unknown> {
  if (path.startsWith('/system/members'))
    return { id, identifier: `m${id}`, firstName: 'A', lastName: 'B' }
  if (path.startsWith('/company/contacts')) return { id, firstName: 'C', lastName: `${id}` }
  if (path.startsWith('/service/boards')) return { id, name: `board ${id}` }
  if (path.includes('/notes')) return { id, text: 'hi', dateCreated: '2026-01-01T00:00:00Z' }
  return { id, summary: `ticket ${id}` }
}

beforeEach(() => {
  calls = []
  total = 0
  sendLink = true
  nullBody = false
  vi.spyOn(axios, 'create').mockImplementation(() => {
    return {
      get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = { ...(cfg?.params ?? {}) }
        calls.push({ path, params })
        const { ids, more } = upstreamPage(params)
        const page = Number(params['page'] ?? 1)
        const rels = [`<https://cw.example.test${path}?page=1>; rel="first"`]
        if (more) rels.push(`<https://cw.example.test${path}?page=${page + 1}>; rel="next"`)
        return {
          data: nullBody ? null : ids.map((id) => row(path, id)),
          headers: sendLink ? { link: rels.join(', ') } : {},
        }
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | null)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'connectwise-psa').meta.hasMore)
  }
  return { ids, hasMore }
}

const adapter = new ConnectwisePsaAdapter()

const methods: {
  name: string
  path: string
  run: (p: QueryParams) => Promise<{ id: string }[]>
  extra?: Record<string, unknown>
}[] = [
  { name: 'listTickets', path: '/service/tickets', run: (p) => adapter.listTickets(creds, p) },
  {
    name: 'listMessages',
    path: '/service/tickets/77/notes',
    run: (p) => adapter.listMessages(creds, '77', p),
  },
  { name: 'listContacts', path: '/company/contacts', run: (p) => adapter.listContacts(creds, p) },
  {
    name: 'listUsers',
    path: '/system/members',
    run: (p) => adapter.listUsers(creds, p),
    extra: { conditions: "inactiveFlag=false AND licenseClass!='A'" },
  },
  { name: 'listTeams', path: '/service/boards', run: (p) => adapter.listTeams(creds, p) },
]

for (const { name, path, run, extra } of methods) {
  describe(`connectwise-psa ${name} paging`, () => {
    it('serves every row once, in order, across pages of 2L+1 rows', async () => {
      const L = 4
      total = 2 * L + 1
      const { ids, hasMore } = await walk(run, L)
      expect(ids).toEqual(range(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
    })

    it('page 2 requests upstream page=2 at pageSize=limit', async () => {
      total = 9
      await run(withPageSink({ page: 2, limit: 4 }))
      expect(calls).toEqual([{ path, params: { pageSize: 4, page: 2, ...(extra ?? {}) } }])
    })

    it('an exact multiple of the limit ends on the Link header, not a guess', async () => {
      total = 8
      const { ids, hasMore } = await walk(run, 4)
      expect(ids).toEqual(range(8))
      expect(hasMore).toEqual([true, false, false])
    })

    it('without a Link header a short page still ends the walk', async () => {
      sendLink = false
      total = 9
      const { ids, hasMore } = await walk(run, 4)
      expect(ids).toEqual(range(9))
      expect(hasMore).toEqual([null, null, false])
    })

    it('a limit above the maximum is clamped', async () => {
      total = 3
      const params = parseListQuery({ limit: '9999' })
      expect(params.limit).toBe(500)
      await run(params)
      expect(calls[0]!.params['pageSize']).toBe(500)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      total = 9
      const params = parseListQuery({ page: '2', limit: '4' })
      const env = listPage(await run(params), params, 'connectwise-psa')
      expect(env.data.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
      expect(env.meta.hasMore).toBe(true)
      expect(calls[0]!.params['page']).toBe(2)
    })

    it('an empty (null) upstream body is an empty page, not a crash', async () => {
      nullBody = true
      total = 9
      const rows = await run(withPageSink({ page: 1, limit: 4 }))
      expect(rows).toEqual([])
    })
  })
}
