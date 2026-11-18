import { describe, it, expect, vi } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { withPageSink, reportUpstreamPage } from '@opensteward/shared'
import { parseListQuery, listPage, collectionIsComplete } from '../../../../../src/verticals/accounting/router/helpers'

/**
 * Finding 25 — `meta` must have the same shape on every list endpoint.
 *
 * Finding 5 asked for `hasMore` and `totalCount`. The fix landed on
 * `list_accounts`, the endpoint the finding happened to cite, and nowhere
 * else — so `accounts` reported `totalCount: 58, hasMore: true` while
 * `invoices` and `contacts` reported neither.
 *
 * Partial presence is worse than uniform absence. With none of them reporting
 * it, a client writes one truncation strategy and applies it everywhere. With
 * some reporting it, a client that trusts `meta` paginates correctly on
 * accounts and silently truncates elsewhere, and nothing in either response
 * distinguishes the two cases.
 *
 * The keys are therefore ALWAYS present. `null` means "the upstream does not
 * tell us", which is a fact the client can act on; absence is indistinguishable
 * from a field that was never implemented. Only 2 of 282 accounting adapters
 * report a count, so `null` is the common case and has to be a first-class
 * answer rather than an omission.
 *
 * `hasMore` is still derivable without a count, from what the adapter returned
 * against the page it was asked for — the same last-page signal `SyncWorker`
 * stops on.
 */

const log = () => ({ warn: vi.fn(), debug: vi.fn(), info: vi.fn() })
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }))

describe('meta is uniformly shaped on every list response', () => {
  it('always carries totalCount and hasMore, even when unknown', () => {
    const res = listPage(rows(3), parseListQuery({ limit: '10' }), 'xero', log())
    expect(res.meta).toHaveProperty('totalCount')
    expect(res.meta).toHaveProperty('hasMore')
    expect(res.meta).toHaveProperty('page')
    expect(res.meta).toHaveProperty('limit')
  })

  it('reports totalCount null rather than omitting it when upstream gives no count', () => {
    const res = listPage(rows(3), parseListQuery({ limit: '10' }), 'xero', log())
    expect(res.meta.totalCount).toBeNull()
  })

  it('derives hasMore=false from a short page with no count at all', () => {
    // 3 rows returned against a page of 10 — there is provably nothing more.
    const res = listPage(rows(3), parseListQuery({ limit: '10' }), 'xero', log())
    expect(res.meta.hasMore).toBe(false)
  })

  it('reports hasMore=null when the page came back exactly full', () => {
    // A full page is indistinguishable from "there is more", so claiming
    // either way would be a guess. `null` says so.
    const res = listPage(rows(10), parseListQuery({ limit: '10' }), 'xero', log())
    expect(res.meta.hasMore).toBeNull()
  })

  it('reports hasMore=true when the adapter over-returned past the limit', () => {
    // The router truncated, so it KNOWS more exists — no guessing needed.
    const res = listPage(rows(60), parseListQuery({ limit: '10' }), 'xero', log())
    expect(res.meta.hasMore).toBe(true)
    expect(res.data).toHaveLength(10)
  })

  it('uses the upstream count when the adapter does report one', () => {
    const params = withPageSink(parseListQuery({ limit: '10', page: '1' }))
    reportUpstreamPage(params, { totalCount: 58 })
    const res = listPage(rows(10), params, 'xero', log())
    expect(res.meta.totalCount).toBe(58)
    expect(res.meta.hasMore).toBe(true)
  })

  it('reports hasMore=false on the last page of a counted collection', () => {
    const params = withPageSink(parseListQuery({ limit: '10', page: '6' }))
    reportUpstreamPage(params, { totalCount: 58 })
    const res = listPage(rows(8), params, 'xero', log())
    expect(res.meta.hasMore).toBe(false)
  })

  it('reports hasMore=false for an empty result', () => {
    const res = listPage([], parseListQuery({ limit: '10' }), 'xero', log())
    expect(res.meta.hasMore).toBe(false)
    expect(res.meta.totalCount).toBeNull()
  })
})

/**
 * The class guard. Handover 5 put it plainly: every finding describes a class,
 * and the cited endpoint is an example rather than the scope. A per-endpoint
 * assertion would have passed on `accounts` while `invoices` and `contacts`
 * stayed broken, which is exactly what happened.
 */
describe('every accounting list router builds its envelope the same way', () => {
  const dir = join(__dirname, '../../../../../src/verticals/accounting/router')
  const routers = readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'helpers.ts')

  it('finds the routers it means to check', () => {
    expect(routers.length).toBeGreaterThan(10)
  })

  it('no list route hand-rolls listResponse instead of going through listPage', () => {
    // listPage is the single place the envelope is assembled. A route calling
    // listResponse directly bypasses both the limit backstop and the
    // pagination metadata, which is how the surface drifted apart before.
    const offenders: string[] = []
    for (const f of routers) {
      const src = readFileSync(join(dir, f), 'utf8')
      if (/\blistResponse\s*\(/.test(src)) offenders.push(f)
    }
    expect(offenders).toEqual([])
  })

  it('every router that lists uses listPage', () => {
    const missing: string[] = []
    for (const f of routers) {
      const src = readFileSync(join(dir, f), 'utf8')
      if (/cachedList\s*\(/.test(src) && !/listPage\s*\(/.test(src)) missing.push(f)
    }
    expect(missing).toEqual([])
  })
})

/**
 * Finding 25, second half — where `hasMore` comes from without a count.
 *
 * With a count, `hasMore` is arithmetic. Without a count or an adapter report
 * it is `null` whenever a page comes back exactly full: `limit=1` against 32
 * invoices reported `hasMore: null` when there were demonstrably more.
 *
 * An earlier fix answered that by asking upstream for one row more than the caller
 * wanted and discarding it. That lost rows: every upstream that positions the
 * next page from what it was sent — a cursor minted after the extra row, an
 * offset computed from the inflated limit — skipped that row at every page
 * boundary on the API path (measured on at least 580 adapters). The router now
 * asks for exactly the caller's limit. A full page gets a real answer only from
 * something the platform said: a count, or the adapter's own report through
 * `reportUpstreamPage` (a cursor platform's next cursor). Without either, a
 * full page is honestly `null`.
 */
describe('the router asks the adapter for exactly the caller’s limit', () => {
  it('passes the caller’s limit through unchanged', () => {
    // Was 26: the probe. The walk tests in
    // packages/shared/tests/router/list-envelope-paging.test.ts show the rows
    // that cost.
    const params = parseListQuery({ limit: '25' })
    expect(params.limit).toBe(25)
  })

  it('answers hasMore=false when the page came back short of the caller’s limit', () => {
    const res = listPage(rows(24), parseListQuery({ limit: '25' }), 'xero', log())
    expect(res.data).toHaveLength(24)
    expect(res.meta.hasMore).toBe(false)
  })

  it('the reported case: a full page answers from the adapter’s report, else null', () => {
    // `list_invoices(limit=1)` against 32 invoices reported `hasMore: null`.
    // The probe used to turn that into `true` by fetching a second row; with
    // no probe, a full page the adapter says nothing about is `null` again,
    // and an adapter whose platform knows (a next cursor) reports it.
    const silent = parseListQuery({ limit: '1' })
    expect(listPage(rows(1), silent, 'xero', log()).meta.hasMore).toBeNull()

    const more = parseListQuery({ limit: '1' })
    reportUpstreamPage(more, { hasMore: true })
    const res = listPage(rows(1), more, 'xero', log())
    expect(res.data).toHaveLength(1)
    expect(res.meta.hasMore).toBe(true)

    // A collection that is an exact multiple of the page size: the last page
    // is full, and the adapter's `false` must survive rather than become a
    // guess.
    const last = parseListQuery({ limit: '1' })
    reportUpstreamPage(last, { hasMore: false })
    expect(listPage(rows(1), last, 'xero', log()).meta.hasMore).toBe(false)
  })

  it('stays null on a full page at the default limit with no report', () => {
    // A full page with no count and no adapter report is indistinguishable
    // from a collection that is an exact multiple of the page size. Answering
    // `false` would silently truncate a paginating client; `true` would be a
    // guess. `null` says which case this is.
    const res = listPage(rows(100), parseListQuery({}), 'xero', log())
    expect(res.meta.hasMore).toBeNull()
  })

  it('warns on a single extra row, now that the router never asks for one', () => {
    // 26 rows against a limit of 25 used to be the probe row the router had
    // requested, so it was exempt from the warning. With no probe it is an
    // adapter ignoring `limit`. The envelope still reports the caller's limit,
    // truncates, and answers `hasMore: true` (more rows provably exist), and
    // now it warns as well.
    const l = log()
    const res = listPage(rows(26), parseListQuery({ limit: '25' }), 'xero', l)
    expect(l.warn).toHaveBeenCalledTimes(1)
    expect(res.meta.limit).toBe(25)
    expect(res.data).toHaveLength(25)
    expect(res.meta.hasMore).toBe(true)
  })

  it('still warns when the adapter genuinely ignored the limit', () => {
    const l = log()
    listPage(rows(60), parseListQuery({ limit: '25' }), 'xero', l)
    expect(l.warn).toHaveBeenCalledTimes(1)
  })

  it('does not mark a full page complete', () => {
    // A page of exactly `limit` rows is full, not short; calling it complete
    // would cache a partial collection as the whole thing.
    const params = parseListQuery({})
    expect(collectionIsComplete(params, rows(100))).toBe(false)
    expect(collectionIsComplete(params, rows(99))).toBe(true)
  })
})
