/**
 * Digits reads: paths, parameters, paging and refusals.
 *
 * First-party sources (fetched 2026-09-25):
 *   Spec https://developer.digits.com/openapi/openapi.yaml, server
 *   https://connect.digits.com:
 *     GET /v1/ledger/parties  — limit ("The number of items to return per
 *       request. Default and max size is 100."), cursor ("Cursor for
 *       pagination"), updatedAfter (date-time), ...; 200 body
 *       `{ parties: Party[], next: Page }`.
 *     GET /v1/ledger/entries  — the same limit and cursor, updatedAfter;
 *       200 body `{ entryDetails: EntryDetail[], next: Page }`.
 *     GET /v1/ledger/categories — "Fetch the full Chart of Accounts from the
 *       Ledger."; only created/updated before/after and the entity selector;
 *       200 body `{ categories: Category[] }`, no `next`.
 *     GET /v1/ledger/category/{id} → Category; GET /v1/ledger/party/{id} →
 *       `{ party }`; GET /v1/ledger/transaction/{id} → `{ transaction }`.
 *   Pagination guide https://developer.digits.com/docs/pagination.md:
 *     "Continue fetching pages while `more` is `true`." and a final page of
 *     `"next": { "cursor": "", "more": false }`.
 *
 * The adapter used to call /v1/parties, /v1/categories and /v1/entries, none
 * of which exist, read entries from `entries` (the key is `entryDetails`),
 * sent an undocumented `startDate`, and always served page 1.
 *
 * The fake upstream answers only the documented paths, honours only the
 * documented parameters, and rejects anything else with a 400.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { DigitsAdapter } from '../../../../../../src/verticals/accounting/adapters/digits/index'
import { AccountSchema } from '../../../../../../src/verticals/accounting/schema/account'
import { ContactSchema } from '../../../../../../src/verticals/accounting/schema/contact'
import { JournalSchema } from '../../../../../../src/verticals/accounting/schema/journal'
import { TransactionSchema } from '../../../../../../src/verticals/accounting/schema/transaction'

const CREDS = { accessToken: 'at', refreshToken: 'rt' }
const adapter = new DigitsAdapter({
  clientId: 'cid',
  clientSecret: 'secret',
  redirectUri: 'https://app.example/cb',
  scopes: ['ledger:read'],
})

const MAX = 100

interface Recorded {
  url: string
  params: Record<string, unknown>
}

const day = (i: number): string => new Date(Date.UTC(2026, 0, 1 + i)).toISOString()

function party(i: number) {
  return {
    id: { issuer: 'digits.com', id: `party-${i}` },
    name: `Party ${i}`,
    kind: 'Business',
    updatedAt: day(i),
    roles: ['EntityCustomerRole'],
  }
}

function entryDetail(i: number) {
  return {
    transactionId: `txn-${Math.floor(i / 2)}`,
    transactionType: 'PayIn',
    date: day(i),
    updatedAt: day(i),
    entry: { id: `entry-${i}`, amount: { amount: 100 * i, code: 'USD' }, type: 'Credit' },
  }
}

function category(i: number) {
  return {
    id: `cat-${i}`,
    name: `Category ${i}`,
    type: 'Expenses',
    active: true,
    updatedAt: day(i),
  }
}

function badRequest(detail: string): Error {
  return Object.assign(new Error(detail), { response: { status: 400, data: { message: detail } } })
}

const CURSOR_LISTS: Record<string, { key: string; row: (i: number) => { updatedAt: string } }> = {
  'ledger/parties': { key: 'parties', row: party },
  'ledger/entries': { key: 'entryDetails', row: entryDetail },
}

const LIST_PARAMS = new Set(['limit', 'cursor', 'updatedAfter'])
const CATEGORY_PARAMS = new Set(['updatedAfter'])

type Get = (url: string, config?: { params?: Record<string, unknown> }) => Promise<unknown>

function scripted(get: Get): Recorded[] {
  const requests: Recorded[] = []
  const recording: Get = async (url, config) => {
    requests.push({ url, params: { ...(config?.params ?? {}) } })
    return get(url, config)
  }
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: recording,
  })) as unknown as typeof axios.create)
  return requests
}

function fakeUpstream(counts: Partial<Record<string, number>>): Recorded[] {
  return scripted(async (url, config) => {
    const params = { ...(config?.params ?? {}) }
    const since = params['updatedAfter']
    const filter = <T extends { updatedAt: string }>(list: T[]): T[] =>
      since === undefined ? list : list.filter((r) => r.updatedAt > String(since))

    if (url === 'ledger/categories') {
      for (const k of Object.keys(params))
        if (!CATEGORY_PARAMS.has(k)) throw badRequest(`unknown parameter ${k}`)
      const all = Array.from({ length: counts[url] ?? 0 }, (_, i) => category(i))
      return { data: { categories: filter(all) } }
    }

    const list = CURSOR_LISTS[url]
    if (!list) throw badRequest(`no route ${url}`)
    for (const k of Object.keys(params))
      if (!LIST_PARAMS.has(k)) throw badRequest(`unknown parameter ${k}`)
    const limit = params['limit'] === undefined ? MAX : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX) throw badRequest(`limit ${limit}`)
    const all = filter(Array.from({ length: counts[url] ?? 0 }, (_, i) => list.row(i)))
    const offset = params['cursor'] === undefined ? 0 : Number(String(params['cursor']).slice(2))
    const page = all.slice(offset, offset + limit)
    const end = offset + page.length
    const more = end < all.length
    return { data: { [list.key]: page, next: { cursor: more ? `c-${end}` : '', more } } }
  })
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

type ListMethod = 'listContacts' | 'listTransactions' | 'listAccounts'

async function drive(
  method: ListMethod,
  limit: number,
  pages: number,
  extra: Partial<QueryParams> = {},
) {
  const served: string[][] = []
  const hasMore: Array<boolean | undefined> = []
  const pageSize: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params: QueryParams = withPageSink({ page, limit, ...extra })
    const got = (await adapter[method](CREDS, params)) as Array<{ id?: string }>
    served.push(got.map((r) => String(r.id)))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    pageSize.push(meta?.pageSize)
  }
  return { served, hasMore, pageSize }
}

describe('Digits cursor lists (parties, entries)', () => {
  const L = 3
  const N = 2 * L + 1

  it.each([
    ['listContacts', 'ledger/parties', 'party-'],
    ['listTransactions', 'ledger/entries', 'entry-'],
  ] as const)('%s walks %s: every row once, hasMore exact', async (method, path, prefix) => {
    const requests = fakeUpstream({ [path]: N })
    const { served, hasMore } = await drive(method, L, 3)
    expect(served).toEqual([
      [`${prefix}0`, `${prefix}1`, `${prefix}2`],
      [`${prefix}3`, `${prefix}4`, `${prefix}5`],
      [`${prefix}6`],
    ])
    expect(hasMore).toEqual([true, true, false])
    expect(requests.map((r) => r.url)).toEqual([path, path, path])
    expect(requests.map((r) => r.params)).toEqual([
      { limit: L },
      { limit: L, cursor: 'c-3' },
      { limit: L, cursor: 'c-6' },
    ])
  })

  it.each([
    ['listContacts', 'ledger/parties'],
    ['listTransactions', 'ledger/entries'],
  ] as const)('%s jumps to page 3 by walking the cursor chain', async (method, path) => {
    const requests = fakeUpstream({ [path]: N })
    const params = withPageSink({ page: 3, limit: L })
    const got = (await adapter[method](CREDS, params)) as Array<{ id?: string }>
    expect(got).toHaveLength(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests).toHaveLength(3)
  })

  it.each([
    ['listContacts', 'ledger/parties'],
    ['listTransactions', 'ledger/entries'],
  ] as const)('%s clamps a limit above 100 and reports the size sent', async (method, path) => {
    const requests = fakeUpstream({ [path]: 150 })
    const { served, hasMore, pageSize } = await drive(method, 500, 2)
    expect(requests.map((r) => r.params['limit'])).toEqual([MAX, MAX])
    expect(served.map((s) => s.length)).toEqual([100, 50])
    expect(hasMore).toEqual([true, false])
    expect(pageSize).toEqual([MAX, MAX])
  })

  it.each([
    ['listContacts', 'ledger/parties'],
    ['listTransactions', 'ledger/entries'],
  ] as const)(
    '%s sends updatedAfter as a date-time and serves only matches',
    async (method, path) => {
      const requests = fakeUpstream({ [path]: 5 })
      const since = new Date(day(2))
      const params = withPageSink({ page: 1, limit: 10, updatedAfter: since })
      const got = (await adapter[method](CREDS, params)) as Array<{ id?: string }>
      expect(got).toHaveLength(2)
      expect(requests[0]?.params).toEqual({ limit: 10, updatedAfter: since.toISOString() })
    },
  )

  it.each([
    ['listContacts', 'ledger/parties', 'party-'],
    ['listTransactions', 'ledger/entries', 'entry-'],
  ] as const)(
    '%s keeps filtered and unfiltered cursor chains apart',
    async (method, path, prefix) => {
      // Opaque cursors that name the last row served, so a cursor cached by the
      // unfiltered walk points somewhere else in the filtered list.
      const list = CURSOR_LISTS[path]!
      const all = Array.from({ length: 7 }, (_, i) => list.row(i))
      const requests = scripted(async (url, config) => {
        const params = { ...(config?.params ?? {}) }
        if (url !== path) throw badRequest(`no route ${url}`)
        for (const k of Object.keys(params))
          if (!LIST_PARAMS.has(k)) throw badRequest(`unknown parameter ${k}`)
        const since = params['updatedAfter']
        const after =
          params['cursor'] === undefined ? -1 : Number(String(params['cursor']).slice(6))
        const rest = all.filter(
          (r, i) => i > after && (since === undefined || r.updatedAt > String(since)),
        )
        const page = rest.slice(0, Number(params['limit']))
        const more = rest.length > page.length
        const last = all.indexOf(page[page.length - 1]!)
        return { data: { [list.key]: page, next: { cursor: more ? `after-${last}` : '', more } } }
      })
      // Interleave two walks: unfiltered caches after-1 for its page 2, the
      // filtered one (rows 3..6) caches after-4 for its page 2.
      const since = new Date(day(2))
      const ids = async (page: number, extra: Partial<QueryParams> = {}) =>
        (
          (await adapter[method](CREDS, { page, limit: 2, ...extra })) as Array<{ id?: string }>
        ).map((r) => String(r.id))
      expect(await ids(1)).toEqual([`${prefix}0`, `${prefix}1`])
      expect(await ids(1, { updatedAfter: since })).toEqual([`${prefix}3`, `${prefix}4`])
      expect(await ids(2)).toEqual([`${prefix}2`, `${prefix}3`])
      expect(await ids(2, { updatedAfter: since })).toEqual([`${prefix}5`, `${prefix}6`])
      expect(requests.map((r) => r.params['cursor'])).toEqual([
        undefined,
        undefined,
        'after-1',
        'after-4',
      ])
    },
  )

  it('a page claiming more with no cursor throws rather than ending the list', async () => {
    scripted(async () => ({ data: { parties: [party(0)], next: { cursor: '', more: true } } }))
    await expect(adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 1 }))).rejects.toThrow(
      /next\.more is true but next\.cursor is empty/,
    )
  })

  it('rows parse against the canonical schemas', async () => {
    fakeUpstream({ 'ledger/parties': 2, 'ledger/entries': 2 })
    for (const c of await adapter.listContacts(CREDS, { page: 1, limit: 5 })) ContactSchema.parse(c)
    for (const t of await adapter.listTransactions(CREDS, { page: 1, limit: 5 }))
      TransactionSchema.parse(t)
  })
})

describe('Digits listAccounts (whole chart, sliced locally)', () => {
  it('fetches the chart once per page with no paging params and slices it', async () => {
    const requests = fakeUpstream({ 'ledger/categories': 7 })
    const { served, hasMore } = await drive('listAccounts', 3, 3)
    expect(served).toEqual([['cat-0', 'cat-1', 'cat-2'], ['cat-3', 'cat-4', 'cat-5'], ['cat-6']])
    expect(hasMore).toEqual([true, true, false])
    expect(requests.map((r) => r.url)).toEqual(Array(3).fill('ledger/categories'))
    expect(requests.every((r) => Object.keys(r.params).length === 0)).toBe(true)
  })

  it('passes updatedAfter, the one documented filter it uses', async () => {
    const requests = fakeUpstream({ 'ledger/categories': 5 })
    const since = new Date(day(1))
    const got = await adapter.listAccounts(CREDS, { page: 1, limit: 10, updatedAfter: since })
    expect(got.map((a) => a.id)).toEqual(['cat-2', 'cat-3', 'cat-4'])
    expect(requests[0]?.params).toEqual({ updatedAfter: since.toISOString() })
    for (const a of got) AccountSchema.parse(a)
  })
})

describe('Digits reads by id', () => {
  it('getAccount reads GET /v1/ledger/category/{id}', async () => {
    const requests = scripted(async () => ({ data: category(4) }))
    const got = await adapter.getAccount(CREDS, 'cat-4')
    expect(requests.map((r) => r.url)).toEqual(['ledger/category/cat-4'])
    expect(AccountSchema.parse(got).id).toBe('cat-4')
  })

  it('getContact reads GET /v1/ledger/party/{id} and unwraps `party`', async () => {
    const requests = scripted(async () => ({ data: { party: party(3) } }))
    const got = await adapter.getContact(CREDS, 'party-3')
    expect(requests.map((r) => r.url)).toEqual(['ledger/party/party-3'])
    expect(ContactSchema.parse(got).id).toBe('party-3')
  })

  it('getJournal reads GET /v1/ledger/transaction/{id} and unwraps `transaction`', async () => {
    const requests = scripted(async () => ({
      data: {
        transaction: {
          transactionId: 'txn-1',
          memo: 'm',
          entries: [{ id: 'entry-1', type: 'Debit', amount: { amount: 5, code: 'USD' } }],
        },
      },
    }))
    const got = await adapter.getJournal(CREDS, 'txn-1')
    expect(requests.map((r) => r.url)).toEqual(['ledger/transaction/txn-1'])
    expect(JournalSchema.parse(got).id).toBe('txn-1')
  })
})

describe('Digits refusals send nothing', () => {
  it('listJournals throws 501 NOT_SUPPORTED with no request', async () => {
    const requests = scripted(async () => {
      throw new Error('no request expected')
    })
    await expect(adapter.listJournals(CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toHaveLength(0)
  })

  it('getTransaction throws 501 NOT_SUPPORTED with no request', async () => {
    const requests = scripted(async () => {
      throw new Error('no request expected')
    })
    await expect(adapter.getTransaction(CREDS, 'entry-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toHaveLength(0)
  })
})
