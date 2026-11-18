import { describe, it, expect } from 'vitest'
import { listPage, withPageSink, reportUpstreamPage } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'

/**
 * `listPage` decided `meta.hasMore` from `upstream.totalCount` and the
 * returned-vs-limit heuristic, and never read `upstream.hasMore` — even though
 * `UpstreamPageMeta.hasMore` exists for exactly the case the heuristic cannot
 * answer.
 *
 * On an exact-page-size response the heuristic must report `null` ("cannot
 * tell"): a full page is indistinguishable from a collection that happens to
 * be a multiple of the page size. But a cursor platform already told the
 * adapter the answer — Salesforce's SOQL `done`, HubSpot's `paging.next` —
 * and the adapter reported it. Dropping it forced the caller into a
 * guess-and-check request for something upstream had already stated.
 *
 * Precedence is deliberate: `totalCount` arithmetic stays first, because it is
 * exact and adapters that report it (Fortnox, Xero) already depend on it. The
 * explicit signal only displaces the length-based guess.
 */

function paramsWith(meta: { hasMore?: boolean; totalCount?: number }, limit: number): QueryParams {
  const params = withPageSink({ page: 1, limit })
  reportUpstreamPage(params, meta)
  return params
}

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String(i) }))

describe('listPage meta.hasMore', () => {
  it('reports the adapter\'s hasMore on a full page instead of "cannot tell"', () => {
    const params = paramsWith({ hasMore: true }, 25)
    const out = listPage(rows(25), params, 'salesforce')
    expect(out.meta.hasMore).toBe(true)
  })

  it('reports a definitive end on a full page when the adapter says so', () => {
    // The case that costs a wasted round-trip: exactly one page of rows, and
    // upstream has already said there is no cursor.
    const params = paramsWith({ hasMore: false }, 25)
    const out = listPage(rows(25), params, 'hubspot')
    expect(out.meta.hasMore).toBe(false)
  })

  it('still answers null on a full page when the adapter reported nothing', () => {
    const params = paramsWith({}, 25)
    const out = listPage(rows(25), params, 'someplatform')
    expect(out.meta.hasMore).toBeNull()
  })

  it('keeps totalCount arithmetic ahead of the explicit signal', () => {
    // Fortnox and Xero report a total; that path is exact and must not change.
    const params = paramsWith({ totalCount: 25, hasMore: true }, 25)
    const out = listPage(rows(25), params, 'fortnox')
    expect(out.meta.hasMore).toBe(false)
    expect(out.meta.totalCount).toBe(25)
  })

  it('still reports true when the adapter over-returned, whatever it claimed', () => {
    // Over-return is proof more exists, independent of what was reported.
    const params = paramsWith({ hasMore: false }, 10)
    const out = listPage(rows(11), params, 'someplatform')
    expect(out.meta.hasMore).toBe(true)
  })

  it('reports false on a short page, matching the adapter', () => {
    const params = paramsWith({ hasMore: false }, 25)
    const out = listPage(rows(3), params, 'someplatform')
    expect(out.meta.hasMore).toBe(false)
  })
})
