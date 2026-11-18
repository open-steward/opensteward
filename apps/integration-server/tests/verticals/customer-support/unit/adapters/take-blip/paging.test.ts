/**
 * Take Blip list paging.
 *
 * The Blip API reference (https://docs.blip.ai/) documents, for commands sent
 * to postmaster@desk.msging.net:
 *
 *   - GET /tickets ("Get all tickets of a bot"): `skip` ("The number of
 *     elements to be skipped") and `take` ("The number of elements to be
 *     returned. The maximum value of this parameter is 100."), sent as
 *     `$skip` / `$take` in every example URI;
 *   - GET /teams ("Get all teams"): no paging parameter.
 *
 * The fakes below honour ONLY those parameters. The tickets fake rejects a
 * `$take` above 100, and the teams fake ignores the query and returns every
 * team.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { TakeBlipAdapter } from '../../../../../../src/verticals/customer-support/adapters/take-blip/index'

const creds: Credentials = { accessToken: 'key', extra: { contractId: 'acme' } }

interface Call {
  to: string
  uri: string
}

let calls: Call[] = []
let handler: (uri: string, auth: unknown) => unknown

beforeEach(() => {
  _resetRowPager()
  calls = []
  vi.spyOn(axios, 'create').mockImplementation((config) => {
    const auth = (config?.headers as Record<string, unknown> | undefined)?.['Authorization']
    return {
      post: async (_path: string, body: { to: string; uri: string }) => {
        calls.push({ to: body.to, uri: body.uri })
        return { data: handler(body.uri, auth) }
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function query(uri: string): URLSearchParams {
  const q = uri.indexOf('?')
  return new URLSearchParams(q < 0 ? '' : uri.slice(q + 1))
}

function collection(items: unknown[]) {
  return {
    id: 'x',
    method: 'get',
    status: 'success',
    type: 'application/vnd.lime.collection+json',
    resource: { total: items.length, itemType: 'x', items },
  }
}

/** /tickets honouring only $skip and $take (max 100). */
function tickets(n: number, prefix = '') {
  return (uri: string) => {
    const q = query(uri)
    const skip = Number(q.get('$skip') ?? 0)
    const take = Number(q.get('$take') ?? 20)
    if (take > 100) {
      return {
        id: 'x',
        method: 'get',
        status: 'failure',
        reason: { code: 1, description: 'take > 100' },
      }
    }
    const ids = Array.from({ length: n }, (_, i) => i + 1).slice(skip, skip + take)
    return collection(ids.map((id) => ({ id: `${prefix}${id}`, status: 'Open' })))
  }
}

/** /teams returns every team whatever the query. */
function teams(n: number) {
  return () => collection(Array.from({ length: n }, (_, i) => ({ name: `t${i + 1}` })))
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'take-blip').meta.hasMore ?? undefined)
  }
  return { ids, hasMore }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

describe('take-blip listTickets paging', () => {
  const adapter = new TakeBlipAdapter()
  const run = (p: QueryParams, c: Credentials = creds) => adapter.listTickets(c, p)

  it('serves every ticket once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    handler = tickets(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('an exact multiple of the upstream page ends on the empty page after it', async () => {
    handler = tickets(200)
    const { ids, hasMore } = await walk(run, 100)
    expect(ids).toEqual(range(200))
    expect(hasMore).toEqual([true, false, false])
  })

  it('page 2 at the upstream size requests $skip=100 with $take=100', async () => {
    handler = tickets(250)
    await run(withPageSink({ page: 2, limit: 100 }))
    expect(calls.every((c) => c.to === 'postmaster@desk.msging.net')).toBe(true)
    const page2 = calls.map((c) => query(c.uri)).filter((q) => q.get('$skip') === '100')
    expect(page2).toHaveLength(1)
    expect(page2[0]!.get('$take')).toBe('100')
  })

  it('every request asks for $take=100 and moves $skip by it', async () => {
    handler = tickets(21)
    await walk(run, 10)
    for (const c of calls) expect(query(c.uri).get('$take')).toBe('100')
  })

  it('a limit above the $take maximum is served whole from several upstream pages', async () => {
    handler = tickets(1200)
    const params = parseListQuery({ page: '2', limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(1000).slice(500))
    expect(calls.every((c) => query(c.uri).get('$take') === '100')).toBe(true)
    expect(listPage(rows, params, 'take-blip').meta.hasMore).toBe(true)
  })

  it('a second connection on the same contract walks on its own', async () => {
    handler = (uri, auth) => tickets(250, `${String(auth)}-`)(uri)
    await run(withPageSink({ page: 1, limit: 100 }))
    const other: Credentials = { ...creds, accessToken: 'other' }
    const rows = await run(withPageSink({ page: 2, limit: 100 }), other)
    expect(rows[0]!.id).toBe('Key other-101')
  })

  it('a second contract under the same key walks on its own', async () => {
    let base = ''
    vi.mocked(axios.create).mockImplementation((config) => {
      base = String(config?.baseURL)
      return {
        post: async (_path: string, body: { to: string; uri: string }) => {
          calls.push({ to: body.to, uri: body.uri })
          return { data: tickets(250, `${base}-`)(body.uri) }
        },
      } as unknown as ReturnType<typeof axios.create>
    })
    await run(withPageSink({ page: 1, limit: 100 }))
    const other: Credentials = { ...creds, extra: { contractId: 'globex' } }
    const rows = await run(withPageSink({ page: 2, limit: 100 }), other)
    expect(rows[0]!.id).toBe('https://globex.http.msging.net-101')
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = tickets(21)
    const params = parseListQuery({ page: '2', limit: '10' })
    const env = listPage(await run(params), params, 'take-blip')
    expect(env.data.map((r) => r.id)).toEqual(range(20).slice(10))
    expect(env.meta.hasMore).toBe(true)
  })

  it('a short upstream page ends the walk: 21 tickets at limit 10 cost one request', async () => {
    handler = tickets(21)
    const { ids } = await walk(run, 10)
    expect(ids).toEqual(range(21))
    expect(calls).toHaveLength(1)
    expect(query(calls[0]!.uri).get('$skip')).toBe('0')
  })

  it('a direct caller row offset goes straight through with $take clamped to 100', async () => {
    handler = tickets(400)
    const rows = await run({ cursor: '250', limit: 150 })
    expect(calls).toHaveLength(1)
    const q = query(calls[0]!.uri)
    expect(q.get('$skip')).toBe('250')
    expect(q.get('$take')).toBe('100')
    expect(rows.map((r) => r.id)).toEqual(range(350).slice(250))
  })
})

describe('take-blip listTeams paging', () => {
  const adapter = new TakeBlipAdapter()
  const run = (p: QueryParams) => adapter.listTeams(creds, p)

  it('serves every team once, in order, across pages of 2L+1 rows', async () => {
    const L = 3
    handler = teams(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1).map((i) => `t${i}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends the documented /teams uri with no paging parameter', async () => {
    handler = teams(7)
    await run(withPageSink({ page: 2, limit: 3 }))
    expect(calls).toEqual([{ to: 'postmaster@desk.msging.net', uri: '/teams' }])
  })

  it('a limit above the maximum is clamped and serves the whole list', async () => {
    handler = teams(12)
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows).toHaveLength(12)
    expect(listPage(rows, params, 'take-blip').meta.hasMore).toBe(false)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = teams(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const env = listPage(await run(params), params, 'take-blip')
    expect(env.data.map((r) => r.id)).toEqual(['t4', 't5', 't6'])
    expect(env.meta.hasMore).toBe(true)
  })
})
