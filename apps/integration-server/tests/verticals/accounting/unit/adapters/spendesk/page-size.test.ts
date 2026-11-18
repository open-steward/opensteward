/**
 * Spendesk serves at most 30 rows a page and declares no `maxPageSize`
 * (listContacts merges two endpoints into one page, which one adapter-wide
 * number cannot describe). The router asks for 100 by default, so a full page
 * of 30 read as the last one: `meta.hasMore: false`, and a cache that stored
 * 30 rows as the whole collection. Each list now tells the router what it
 * actually asked for.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  collectionIsComplete,
  listPage,
  parseListQuery,
  readUpstreamPage,
} from '@opensteward/shared'
import { SpendeskAdapter } from '../../../../../../src/verticals/accounting/adapters/spendesk/index'

const CREDS = { accessToken: 'tok' }

/** A fake Spendesk: `sizes[path]` rows on page 1, none after. */
function fakeSpendesk(sizes: Record<string, number>) {
  const calls: Array<{ path: string; params: Record<string, unknown> }> = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    const page = Number(params['page'] ?? 1)
    const n = page === 1 ? (sizes[path] ?? 0) : 0
    return { data: { data: Array.from({ length: n }, (_, i) => ({ id: `${path}-${i}` })) } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return calls
}

const adapter = () => new SpendeskAdapter({ clientId: 'c', clientSecret: 's' })

afterEach(() => vi.restoreAllMocks())

describe('Spendesk lists are judged at the 30 rows they ask for', () => {
  it('a full page of settlements is not the last page', async () => {
    const calls = fakeSpendesk({ '/v1/settlements': 30 })
    const params = parseListQuery({})
    const rows = await adapter().listTransactions(CREDS, params)
    expect(calls[0]!.params).toMatchObject({ pageSize: 30 })
    expect(readUpstreamPage(params)?.pageSize).toBe(30)
    const env = listPage(rows, params, 'spendesk')
    expect(env.meta.limit).toBe(30)
    expect(env.meta.hasMore).toBeNull()
    expect(collectionIsComplete(params, rows)).toBe(false)
  })

  it('a short page of settlements still ends the list', async () => {
    fakeSpendesk({ '/v1/settlements': 12 })
    const params = parseListQuery({})
    const rows = await adapter().listTransactions(CREDS, params)
    expect(listPage(rows, params, 'spendesk').meta.hasMore).toBe(false)
    expect(collectionIsComplete(params, rows)).toBe(true)
  })

  it('contacts: a full page from either endpoint means there may be more', async () => {
    // 30 suppliers and 10 users is 40 rows — a short page against 100 by
    // length, while suppliers have not run out.
    fakeSpendesk({ '/v1/suppliers': 30, '/v1/users': 10 })
    const params = parseListQuery({})
    const rows = await adapter().listContacts(CREDS, params)
    expect(rows).toHaveLength(40)
    expect(listPage(rows, params, 'spendesk').meta.hasMore).toBe(true)
    expect(collectionIsComplete(params, rows)).toBe(false)
  })

  it('contacts: both endpoints short is the end', async () => {
    fakeSpendesk({ '/v1/suppliers': 5, '/v1/users': 3 })
    const params = parseListQuery({})
    const rows = await adapter().listContacts(CREDS, params)
    expect(listPage(rows, params, 'spendesk').meta.hasMore).toBe(false)
    expect(collectionIsComplete(params, rows)).toBe(true)
  })
})
