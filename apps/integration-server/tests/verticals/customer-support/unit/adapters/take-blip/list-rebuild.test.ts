/**
 * Take Blip contacts, attendants, tags and ticket messages.
 *
 * docs.blip.ai documents, for commands POSTed to
 * https://{contract_id}.http.msging.net/commands:
 *
 *   - GET /contacts to postmaster@crm.msging.net ("Get contacts"): `$skip`
 *     ("Number of items to be skipped for paging.") and `$take` ("When not
 *     using filters, values between 1 and 5000 are allowed. If not provided on
 *     the request, the default take value will be 100. If the provided value
 *     is outside this range, an error will be returned.");
 *   - GET /contacts/{identity} to postmaster@crm.msging.net ("Get contact");
 *   - GET /attendants to postmaster@desk.msging.net ("Get all bot's agents"):
 *     `$skip`, `$take`, `$ascending`; "By default, Blip will return 20 agents.";
 *   - GET /tags/active to postmaster@desk.msging.net ("Get tags"): no paging
 *     parameter;
 *   - GET /tickets/{ticketId}/messages ("Get all messages from a customer by a
 *     ticket"): only `$take`, `$ascending` and `getFromOwnerIfTunnel`.
 *
 * The fakes honour ONLY those parameters and destinations: anything else is a
 * command failure, as Blip answers an unknown resource.
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
let handler: (to: string, uri: string, auth: unknown) => unknown

beforeEach(() => {
  _resetRowPager()
  calls = []
  vi.spyOn(axios, 'create').mockImplementation((config) => {
    const auth = (config?.headers as Record<string, unknown> | undefined)?.['Authorization']
    return {
      post: async (_path: string, body: { to: string; uri: string }) => {
        calls.push({ to: body.to, uri: body.uri })
        return { data: handler(body.to, body.uri, auth) }
      },
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const failure = (description: string) => ({
  id: 'x',
  method: 'get',
  status: 'failure',
  reason: { code: 67, description },
})

function split(uri: string): { path: string; q: URLSearchParams } {
  const i = uri.indexOf('?')
  return {
    path: i < 0 ? uri : uri.slice(0, i),
    q: new URLSearchParams(i < 0 ? '' : uri.slice(i + 1)),
  }
}

function collection(items: unknown[], total = items.length) {
  return {
    id: 'x',
    method: 'get',
    status: 'success',
    type: 'application/vnd.lime.collection+json',
    resource: { total, itemType: 'x', items },
  }
}

/** crm /contacts honouring only $skip and $take (1..5000, default 100). */
function contacts(n: number, prefix = '') {
  return (to: string, uri: string) => {
    const { path, q } = split(uri)
    if (to !== 'postmaster@crm.msging.net' || path !== '/contacts')
      return failure('Resource not found')
    for (const k of q.keys()) if (k !== '$skip' && k !== '$take') return failure(`unknown ${k}`)
    const skip = Number(q.get('$skip') ?? 0)
    const take = Number(q.get('$take') ?? 100)
    if (take < 1 || take > 5000) return failure('take out of range')
    const all = Array.from({ length: n }, (_, i) => ({
      identity: `${prefix}c${i + 1}@wa.gw.msging.net`,
      name: `C${i + 1}`,
    }))
    return collection(all.slice(skip, skip + take), n)
  }
}

/** desk /attendants honouring only $skip and $take (default 20). */
function attendants(n: number, rowsPerPage?: (skip: number, take: number) => number) {
  return (to: string, uri: string) => {
    const { path, q } = split(uri)
    if (to !== 'postmaster@desk.msging.net' || path !== '/attendants')
      return failure('Resource not found')
    for (const k of q.keys())
      if (k !== '$skip' && k !== '$take' && k !== '$ascending') return failure(`unknown ${k}`)
    const skip = Number(q.get('$skip') ?? 0)
    let take = Number(q.get('$take') ?? 20)
    if (rowsPerPage) take = rowsPerPage(skip, take)
    const all = Array.from({ length: n }, (_, i) => ({
      identity: `a${i + 1}%40x.com@blip.ai`,
      teams: ['Default'],
      status: 'Online',
    }))
    return collection(all.slice(skip, skip + take), n)
  }
}

/** desk /tags/active: every active tag, no paging. */
function tags(n: number) {
  return (to: string, uri: string) => {
    if (to !== 'postmaster@desk.msging.net' || uri !== '/tags/active')
      return failure('Resource not found')
    return collection(
      Array.from({ length: n }, (_, i) => ({
        name: `tag${i + 1}`,
        closedTickets: 0,
        ticketsCount: i,
      })),
    )
  }
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

const contactIds = (n: number, prefix = '') =>
  Array.from({ length: n }, (_, i) => `${prefix}c${i + 1}@wa.gw.msging.net`)
const attendantIds = (n: number) => Array.from({ length: n }, (_, i) => `a${i + 1}%40x.com@blip.ai`)

describe('take-blip listContacts', () => {
  const adapter = new TakeBlipAdapter()
  const run = (p: QueryParams, c: Credentials = creds) => adapter.listContacts(c, p)

  it('sends GET /contacts to postmaster@crm.msging.net', async () => {
    handler = contacts(3)
    await run(withPageSink({ page: 1, limit: 10 }))
    expect(calls).toEqual([{ to: 'postmaster@crm.msging.net', uri: '/contacts?$skip=0&$take=100' }])
  })

  it('serves every contact once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    handler = contacts(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(contactIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks several upstream pages, moving $skip by the $take of 100', async () => {
    handler = contacts(250)
    const { ids, hasMore } = await walk(run, 100)
    expect(ids).toEqual(contactIds(250))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => split(c.uri).q.get('$skip'))).toEqual(['0', '100', '200'])
    for (const c of calls) expect(split(c.uri).q.get('$take')).toBe('100')
  })

  it('an exact multiple of the upstream page ends on the empty page after it', async () => {
    handler = contacts(200)
    const { ids, hasMore } = await walk(run, 100)
    expect(ids).toEqual(contactIds(200))
    expect(hasMore).toEqual([true, false, false])
  })

  it('API path: a clamped limit of 500 is served from five upstream pages', async () => {
    handler = contacts(1200)
    const params = parseListQuery({ page: '2', limit: '9999' })
    expect(params.limit).toBe(500)
    const env = listPage(await run(params), params, 'take-blip')
    expect(env.data.map((r) => r.id)).toEqual(contactIds(1000).slice(500))
    expect(env.meta.hasMore).toBe(true)
  })

  it('a second connection walks on its own', async () => {
    handler = (to, uri, auth) => contacts(250, `${String(auth)}-`)(to, uri)
    await run(withPageSink({ page: 1, limit: 100 }))
    const rows = await run(withPageSink({ page: 2, limit: 100 }), {
      ...creds,
      accessToken: 'other',
    })
    expect(rows[0]!.id).toBe('Key other-c101@wa.gw.msging.net')
  })

  it('getContact reads GET /contacts/{identity} from postmaster@crm.msging.net', async () => {
    handler = (to, uri) =>
      to === 'postmaster@crm.msging.net' &&
      uri === '/contacts/11121023102013021@messenger.gw.msging.net'
        ? {
            id: 'x',
            method: 'get',
            status: 'success',
            type: 'application/vnd.lime.contact+json',
            resource: {
              name: 'John Doe',
              group: 'friends',
              identity: '11121023102013021@messenger.gw.msging.net',
              gender: 'male',
            },
          }
        : failure('Resource not found')
    const c = await adapter.getContact(creds, '11121023102013021@messenger.gw.msging.net')
    expect(c.id).toBe('11121023102013021@messenger.gw.msging.net')
    expect(c.name).toBe('John Doe')
  })

  it('getContact escapes only the path-breaking characters of the identity', async () => {
    handler = (to, uri) =>
      to === 'postmaster@crm.msging.net' && uri === '/contacts/a%2Fb%3Fc%23d@take.io'
        ? {
            id: 'x',
            method: 'get',
            status: 'success',
            type: 'application/vnd.lime.contact+json',
            resource: { identity: 'a/b?c#d@take.io' },
          }
        : failure('Resource not found')
    expect((await adapter.getContact(creds, 'a/b?c#d@take.io')).id).toBe('a/b?c#d@take.io')
  })
})

describe('take-blip listUsers', () => {
  const adapter = new TakeBlipAdapter()
  const run = (p: QueryParams) => adapter.listUsers(creds, p)

  it('sends GET /attendants to postmaster@desk.msging.net', async () => {
    handler = attendants(3)
    const rows = await run(withPageSink({ page: 1, limit: 10 }))
    // The empty page after the rows is what ends the walk.
    expect(calls).toEqual([
      { to: 'postmaster@desk.msging.net', uri: '/attendants?$skip=0&$take=100' },
      { to: 'postmaster@desk.msging.net', uri: '/attendants?$skip=3&$take=100' },
    ])
    expect(rows.map((r) => r.id)).toEqual(attendantIds(3))
  })

  it('serves every attendant once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    handler = attendants(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(attendantIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('walks upstream pages of 100 by $skip, and an empty one ends the walk', async () => {
    handler = attendants(230)
    const { ids, hasMore } = await walk(run, 100)
    expect(ids).toEqual(attendantIds(230))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => split(c.uri).q.get('$skip'))).toEqual(['0', '100', '200', '230'])
  })

  it('uneven caller pages across upstream pages: limit 70 over 230 attendants', async () => {
    handler = attendants(230)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3, 4]) {
      const params = withPageSink({ page, limit: 70 })
      const rows = await run(params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(listPage(rows, params, 'take-blip').meta.hasMore ?? undefined)
    }
    expect(ids).toEqual(attendantIds(230))
    expect(hasMore).toEqual([true, true, true, false])
  })

  it('a second connection walks on its own', async () => {
    handler = (to, uri, auth) => {
      const res = attendants(250)(to, uri) as { resource?: { items: { identity: string }[] } }
      for (const a of res.resource?.items ?? []) a.identity = `${String(auth)}-${a.identity}`
      return res
    }
    await run(withPageSink({ page: 1, limit: 100 }))
    const rows = await adapter.listUsers(
      { ...creds, accessToken: 'other' },
      withPageSink({ page: 2, limit: 100 }),
    )
    expect(rows[0]!.id).toBe('Key other-a101%40x.com@blip.ai')
  })

  it('a server that silently caps $take below 100 still serves every attendant', async () => {
    // "By default, Blip will return 20 agents." and no $take maximum is
    // documented: a short upstream page is not proof of the end, an empty one is.
    handler = attendants(45, (_skip, take) => Math.min(take, 20))
    const { ids, hasMore } = await walk(run, 20)
    expect(ids).toEqual(attendantIds(45))
    expect(hasMore).toEqual([true, true, false])
  })

  it('getUser refuses with 501 and sends nothing', async () => {
    handler = attendants(3)
    await expect(adapter.getUser(creds, 'a1%40x.com@blip.ai')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toHaveLength(0)
  })
})

describe('take-blip listTags', () => {
  const adapter = new TakeBlipAdapter()
  const run = (p: QueryParams) => adapter.listTags(creds, p)

  it('sends the documented /tags/active uri with no paging parameter', async () => {
    handler = tags(7)
    await run(withPageSink({ page: 2, limit: 3 }))
    expect(calls).toEqual([{ to: 'postmaster@desk.msging.net', uri: '/tags/active' }])
  })

  it('serves every tag once, in order, across pages of 2L+1 rows', async () => {
    const L = 3
    handler = tags(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(Array.from({ length: 7 }, (_, i) => `tag${i + 1}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('getTag finds a tag by its name', async () => {
    handler = tags(4)
    expect((await adapter.getTag(creds, 'tag3')).name).toBe('tag3')
    await expect(adapter.getTag(creds, 'nope')).rejects.toThrow(/not found/)
  })
})

describe('take-blip listMessages', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    handler = () =>
      collection([
        {
          id: 'm1',
          direction: 'sent',
          type: 'text/plain',
          content: 'oi',
          date: '2019-12-04T16:14:51.952Z',
        },
      ])
    const err = await new TakeBlipAdapter()
      .listMessages(
        creds,
        'f1e95e10-2e21-4438-a076-71183b253981',
        withPageSink({ page: 1, limit: 10 }),
      )
      .catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(String((err as Error).message)).toMatch(/cannot list ticket messages/)
    expect(calls).toHaveLength(0)
  })
})
