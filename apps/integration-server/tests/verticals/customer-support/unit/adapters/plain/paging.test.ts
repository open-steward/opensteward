/**
 * plain — cursor paging for every list method.
 *
 * Plain's GraphQL API (https://www.plain.com/docs/graphql/pagination) pages
 * every connection with "Forward pagination with `after` (cursor) & `first`
 * (numeric count)", returns a `pageInfo` object (`hasNextPage`, `endCursor`),
 * and documents: "We will return 25 records per request by default and the
 * maximum page size is 100 records." The adapter used to drop the caller's
 * `page`, so page 2 of every list was page 1 again. Pages now resolve through
 * the shared cursor pager.
 *
 * The fake below honours ONLY the documented arguments: `first` and `after`.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import { PlainAdapter } from '../../../../../../src/verticals/customer-support/adapters/plain/index'
import { PlainClient } from '../../../../../../src/verticals/customer-support/adapters/plain/client'
import type { Credentials } from '@opensteward/shared'

const creds = { accessToken: 'plainApiKey_a', extra: {} } as Credentials

const DOC_MAX = 100
const DOC_DEFAULT = 25

interface Call {
  op: string
  variables: Record<string, unknown>
}

/** An opaque cursor, as the platform mints it: base64 of the owner and next offset. */
const encode = (offset: number, owner = 'x') => Buffer.from(`${owner}:${offset}`).toString('base64')
const decode = (cursor: unknown, owner = 'x') => {
  const [o, off] = Buffer.from(String(cursor), 'base64').toString('utf8').split(':')
  if (o !== owner) throw new Error(`400: cursor of ${o} sent to ${owner}`)
  return Number(off)
}

/** The collection a list query reads, keyed by its operation name. */
const OPS: Record<string, string> = {
  ListThreads: 'threads',
  ListTimelineEntries: 'timelineEntries',
  ListCustomers: 'customers',
  ListLabelTypes: 'labelTypes',
  ListSnippets: 'snippets',
  ListUsers: 'users',
}

/**
 * Fake Plain: `total` rows for operation `op`. Reads only `first` and `after`
 * (plus `threadId` for the thread-scoped timeline). A `first` over the
 * documented maximum of 100 is a validation error, so an unclamped request
 * fails loudly.
 */
function fakePlain(op: string, total: number, make: (i: number, owner: string) => unknown) {
  const calls: Call[] = []
  vi.spyOn(PlainClient.prototype, 'query').mockImplementation((async (
    query: string,
    variables?: Record<string, unknown>,
  ) => {
    const v = variables ?? {}
    const name = /query\s+(\w+)/.exec(query)?.[1] ?? ''
    calls.push({ op: name, variables: v })
    if (name !== op) throw new Error(`unexpected operation in test: ${name}`)
    const first = v['first'] === undefined ? DOC_DEFAULT : Number(v['first'])
    if (!(first >= 1 && first <= DOC_MAX))
      throw new Error(`validation: first ${String(v['first'])}`)
    const owner = v['threadId'] === undefined ? 'x' : String(v['threadId'])
    const offset = v['after'] === undefined ? 0 : decode(v['after'], owner)
    const n = Math.max(0, Math.min(first, total - offset))
    const edges = Array.from({ length: n }, (_, i) => ({ node: make(offset + i, owner) }))
    const end = offset + n
    const conn = {
      edges,
      pageInfo: { hasNextPage: end < total, endCursor: n > 0 ? encode(end, owner) : null },
    }
    const field = OPS[op]!
    return field === 'timelineEntries' ? { thread: { timelineEntries: conn } } : { [field]: conn }
  }) as typeof PlainClient.prototype.query)
  return calls
}

const thread = (i: number) => ({
  id: `th_${i}`,
  title: `T${i}`,
  status: 'OPEN',
  customer: { id: 'cu_1' },
})
const entry = (i: number, owner: string) => ({
  id: `${owner}_te_${i}`,
  timestamp: { iso8601: '2026-01-01T00:00:00.000Z' },
  type: 'NoteItem',
  text: { value: `n${i}` },
  userActor: { userId: 'u_1' },
})
const customer = (i: number) => ({
  id: `cu_${i}`,
  fullName: `C${i}`,
  email: { email: `c${i}@x.io` },
})
const labelType = (i: number) => ({ id: `lt_${i}`, name: `L${i}` })
const snippet = (i: number) => ({ id: `sn_${i}`, name: `S${i}`, text: `s${i}` })
const user = (i: number) => ({ id: `u_${i}`, fullName: `U${i}`, email: `u${i}@x.io` })

type Lister = (p: ReturnType<typeof withPageSink>) => Promise<Array<{ id: string }>>

const adapter = new PlainAdapter()
const cases: Array<{
  name: string
  op: string
  make: (i: number, owner: string) => unknown
  prefix: string
  list: Lister
}> = [
  {
    name: 'listTickets',
    op: 'ListThreads',
    make: thread,
    prefix: 'th_',
    list: (p) => adapter.listTickets(creds, p),
  },
  {
    name: 'listMessages',
    op: 'ListTimelineEntries',
    make: entry,
    prefix: 'th_1_te_',
    list: (p) => adapter.listMessages(creds, 'th_1', p),
  },
  {
    name: 'listContacts',
    op: 'ListCustomers',
    make: customer,
    prefix: 'cu_',
    list: (p) => adapter.listContacts(creds, p),
  },
  {
    name: 'listTags',
    op: 'ListLabelTypes',
    make: labelType,
    prefix: 'lt_',
    list: (p) => adapter.listTags(creds, p),
  },
  {
    name: 'listMacros',
    op: 'ListSnippets',
    make: snippet,
    prefix: 'sn_',
    list: (p) => adapter.listMacros(creds, p),
  },
  {
    name: 'listUsers',
    op: 'ListUsers',
    make: user,
    prefix: 'u_',
    list: (p) => adapter.listUsers(creds, p),
  },
]

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('plain declares the documented page maximum', () => {
  it('capabilities.maxPageSize is 100', () => {
    expect(adapter.capabilities.maxPageSize).toBe(DOC_MAX)
  })
})

describe.each(cases)('plain $name pages by cursor', ({ op, make, prefix, list }) => {
  const owner = op === 'ListTimelineEntries' ? 'th_1' : 'x'

  it('pages 1..3 of 2L+1 rows serve every id once, in order, with exact hasMore', async () => {
    const L = 4
    const calls = fakePlain(op, 2 * L + 1, make)
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
    // One request per page, each sending the caller's size and the previous
    // page's `endCursor`.
    expect(calls.map((c) => c.variables['first'])).toEqual([L, L, L])
    expect(calls.map((c) => c.variables['after'])).toEqual([
      undefined,
      encode(L, owner),
      encode(2 * L, owner),
    ])
  })

  it('the page-2 request carries the documented `after` key', async () => {
    const calls = fakePlain(op, 10, make)
    await list(withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    await list(withPageSink({ page: 2, limit: 3 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.variables).toHaveProperty('after', encode(3, owner))
  })

  it('a limit above the documented maximum of 100 is clamped', async () => {
    const calls = fakePlain(op, 150, make)
    const params = withPageSink({ page: 1, limit: 1000 })
    const items = await list(params)
    expect(calls[0]!.variables['first']).toBe(DOC_MAX)
    expect(items).toHaveLength(DOC_MAX)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(readUpstreamPage(params)?.pageSize).toBe(DOC_MAX)
  })

  it('walks through parseListQuery and listPage to the end', async () => {
    const total = 11
    const limit = 5
    fakePlain(op, total, make)
    const ids: string[] = []
    const sizes: number[] = []
    for (let n = 1; n < 50; n++) {
      const params = parseListQuery({ limit: String(limit), page: String(n) })
      const env = listPage(await list(params), params, 'plain')
      ids.push(...env.data.map((x) => x.id))
      sizes.push(env.data.length)
      if (env.meta.hasMore !== true) break
    }
    expect(ids).toEqual(Array.from({ length: total }, (_, i) => `${prefix}${i}`))
    expect(sizes).toEqual([5, 5, 1])
  })
})

describe('plain cursor chains do not leak between keys', () => {
  it('a second connection walks its own chain (listUsers)', async () => {
    const calls = fakePlain('ListUsers', 10, user)
    await adapter.listUsers(creds, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const other = { accessToken: 'plainApiKey_b', extra: {} } as Credentials
    const items = await adapter.listUsers(other, withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((c) => c.variables['after'])).toEqual([undefined, encode(3)])
    expect(items.map((x) => x.id)).toEqual(['u_3', 'u_4', 'u_5'])
  })

  it("thread B's page 2 never uses thread A's cursor (listMessages)", async () => {
    const calls = fakePlain('ListTimelineEntries', 10, entry)
    await adapter.listMessages(creds, 'thA', withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const items = await adapter.listMessages(creds, 'thB', withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((c) => c.variables['threadId'])).toEqual(['thB', 'thB'])
    expect(items.map((x) => x.id)).toEqual(['thB_te_3', 'thB_te_4', 'thB_te_5'])
  })

  it('a different page size walks a fresh chain (listTickets)', async () => {
    const calls = fakePlain('ListThreads', 20, thread)
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const items = await adapter.listTickets(creds, withPageSink({ page: 2, limit: 5 }))
    expect(calls.map((c) => c.variables['after'])).toEqual([undefined, encode(5)])
    expect(items.map((x) => x.id)).toEqual(['th_5', 'th_6', 'th_7', 'th_8', 'th_9'])
  })
})

describe('plain explicit caller cursor', () => {
  it('is one request at that position and reports its end', async () => {
    const calls = fakePlain('ListCustomers', 10, customer)
    const mid = withPageSink({ limit: 3, cursor: encode(3) } as Parameters<typeof withPageSink>[0])
    const items = await adapter.listContacts(creds, mid)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.variables['after']).toBe(encode(3))
    expect(items.map((x) => x.id)).toEqual(['cu_3', 'cu_4', 'cu_5'])
    expect(readUpstreamPage(mid)?.hasMore).toBe(true)

    calls.length = 0
    const last = withPageSink({ limit: 3, cursor: encode(9) } as Parameters<typeof withPageSink>[0])
    await adapter.listContacts(creds, last)
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })
})
