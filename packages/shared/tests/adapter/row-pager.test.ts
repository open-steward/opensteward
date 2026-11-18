/**
 * `pageByRows`: the caller's pages cut from rows an adapter fetched, for
 * lists where one upstream page is not one caller page. (`pageLocally`, for
 * an upstream that returns the whole collection at once, lives in
 * `router/list-envelope.ts` and is tested beside it.)
 *
 * Salesforce returns SOQL rows in batches of 200–2,000 whatever the caller
 * asked for; Shopify's fulfillments come out of pages of orders, 0 or 40 at a
 * time. Returned as-is, such a page is not `limit` rows: the router truncated
 * the surplus away, and the next page started after it. `pageByRows` serves
 * rows [(page-1)×limit, page×limit) of the flattened stream instead, and
 * reports `hasMore` exactly — the sync worker ends a collection on it.
 *
 * Ported from a prototype checked against 2,000 seeded walks, 1,000 seeded
 * random-access runs and 8 hand-made mutants (no peek, no slot reuse, no mark
 * invalidation, slot reuse ignoring `servedTo`, walk from mark 0, no clearing
 * of the walked end on growth, no `servedTo` update, no past-end shortcut).
 * Added since: page 1 always reads afresh, a concurrent call cannot corrupt
 * the marks, and every page reports `pagedLocally`. Then, from review: the
 * TTL counts from the end of a call, memory is bounded, neither a recorded end
 * nor a failed cursor is trusted forever, a page-1 retry resumes, and
 * identical calls in flight share one walk.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  MAX_ENTRIES,
  pageByRows,
  _resetRowPager,
  _rowPagerRowsHeld,
  _rowPagerSize,
  type RowPagerOptions,
} from '../../src/adapter/row-pager'
import { _resetCursorPager } from '../../src/adapter/cursor-pager'
import type { CursorPage } from '../../src/adapter/cursor-pager'
import { readUpstreamPage, withPageSink } from '../../src/adapter/page-meta'
import { DEFAULT_PAGE_LIMIT, listPage, parseListQuery } from '../../src/router/list-envelope'

/** A small seeded PRNG, so a failing seed can be replayed. */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Upstream page sizes: 1–24 pages of 0–11 rows, about 30% of them empty — so
 * trailing empty pages and all-empty collections are both generated.
 */
function gen(rnd: () => number): number[] {
  const n = Math.floor(rnd() * 25)
  return Array.from({ length: Math.max(1, n) }, () => (rnd() < 0.3 ? 0 : Math.floor(rnd() * 12)))
}

/** Rows 0..N-1 across upstream pages of `sizes`; the cursor is the next page's index. */
function source(sizes: number[]) {
  const starts: number[] = []
  let acc = 0
  for (const s of sizes) {
    starts.push(acc)
    acc += s
  }
  const calls: Array<number | undefined> = []
  const fetch = vi.fn(async (c: number | undefined): Promise<CursorPage<number, number>> => {
    calls.push(c)
    const i = c ?? 0
    return {
      items: Array.from({ length: sizes[i]! }, (_, k) => starts[i]! + k),
      next: i + 1 < sizes.length ? i + 1 : undefined,
    }
  })
  return { fetch, calls, total: acc }
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

function rows(
  key: string,
  page: number,
  limit: number,
  fetch: (c: number | undefined) => Promise<CursorPage<number, number>>,
  options?: RowPagerOptions,
) {
  return pageByRows<number, number>(key, { page, limit }, fetch, options)
}

beforeEach(() => _resetRowPager())
afterEach(() => vi.useRealTimers())

describe('pageByRows: properties', () => {
  it('a sequential walk serves every row once, in order, one fetch per upstream page', async () => {
    for (let seed = 1; seed <= 2000; seed++) {
      _resetRowPager()
      const rnd = mulberry32(seed)
      const sizes = gen(rnd)
      const L = 1 + Math.floor(rnd() * 15)
      const { fetch, calls, total } = source(sizes)
      const served: number[] = []
      let p = 1
      for (; ; p++) {
        const r = await rows('k', p, L, fetch)
        served.push(...r.items)
        if (r.hasMore) expect(r.items.length, `seed ${seed}`).toBe(L)
        else {
          expect(r.items.length, `seed ${seed}`).toBe(total === 0 ? 0 : total - (p - 1) * L)
          break
        }
        if (p > total + 2) throw new Error(`seed ${seed}: hasMore never ended`)
      }
      const ctx = `seed ${seed} sizes ${sizes} L ${L}`
      expect(p, ctx).toBe(Math.max(1, Math.ceil(total / L)))
      expect(served, ctx).toEqual(range(total))
      expect(calls.length, ctx).toBe(sizes.length)
      // A page past the walked end is empty and costs nothing.
      const before = calls.length
      expect(await rows('k', p + 1, L, fetch)).toEqual({ items: [], hasMore: false })
      expect(calls.length, ctx).toBe(before)
    }
  })

  it('random access, cold and warm, with the page size mixed on one key', async () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const rnd = mulberry32(seed * 7919)
      const sizes = gen(rnd)
      const { fetch, total } = source(sizes)
      _resetRowPager()
      for (let q = 0; q < 12; q++) {
        if (rnd() < 0.2) _resetRowPager()
        const L = 1 + Math.floor(rnd() * 15)
        const P = 1 + Math.floor(rnd() * (Math.ceil(total / L) + 2))
        const r = await rows('k', P, L, fetch)
        const ctx = `seed ${seed} sizes ${sizes} L ${L} P ${P}`
        expect(r.items, ctx).toEqual(range(total).slice((P - 1) * L, P * L))
        expect(r.hasMore, ctx).toBe(total > P * L)
      }
    }
  })
})

describe('pageByRows: deterministic cases', () => {
  it('a re-request of the same page refetches rather than serving the slot', async () => {
    const { fetch, calls } = source([10, 10])
    await rows('k', 1, 3, fetch)
    await rows('k', 1, 3, fetch)
    expect(calls).toHaveLength(2)
    // Page 2 continues from the slot; asking for page 2 again reads afresh.
    await rows('k', 2, 3, fetch)
    expect(calls).toHaveLength(2)
    await rows('k', 2, 3, fetch)
    expect(calls).toHaveLength(3)
  })

  it('a page ending exactly on an upstream boundary peeks, so hasMore is exact', async () => {
    const two = source([5, 5])
    expect(await rows('two', 1, 5, two.fetch)).toEqual({ items: range(5), hasMore: true })
    expect(two.calls).toHaveLength(2)
    // The peeked page is the next page's rows: no further request.
    expect(await rows('two', 2, 5, two.fetch)).toEqual({ items: [5, 6, 7, 8, 9], hasMore: false })
    expect(two.calls).toHaveLength(2)

    // A trailing empty page is not "more".
    const trailing = source([5, 0])
    expect(await rows('trailing', 1, 5, trailing.fetch)).toEqual({
      items: range(5),
      hasMore: false,
    })
  })

  it('page 1 is read afresh: a collection that was empty is asked again', async () => {
    const empty = source([0])
    expect(await rows('k', 1, 5, empty.fetch)).toEqual({ items: [], hasMore: false })
    expect(await rows('k', 1, 5, empty.fetch)).toEqual({ items: [], hasMore: false })
    expect(empty.calls).toHaveLength(2)
    const grown = source([2])
    expect(await rows('k', 1, 5, grown.fetch)).toEqual({ items: [0, 1], hasMore: false })
  })

  it('page 1 is read afresh: it starts at the chain, not past the empty pages a walk saw', async () => {
    await rows('k', 1, 3, source([0, 0, 3]).fetch)
    // The first upstream page gained two rows since.
    const grown = source([2, 0, 3])
    expect(await rows('k', 1, 3, grown.fetch)).toEqual({ items: [0, 1, 2], hasMore: true })
  })

  it('a page that names itself as the next throws at once instead of looping', async () => {
    const calls: Array<string | undefined> = []
    const fetch = async (c: string | undefined) => {
      calls.push(c)
      return { items: [] as number[], next: c ?? 'x' }
    }
    await expect(pageByRows<number, string>('loop', { page: 1, limit: 5 }, fetch)).rejects.toThrow(
      /names itself as the next page/,
    )
    // At once: not after the 1,000-page budget, or Shopify's 10,000.
    expect(calls).toEqual([undefined, 'x'])
  })

  it('a chain that cycles through two cursors stops at the budget', async () => {
    const fetch = async (c: string | undefined) => ({
      items: [] as number[],
      next: c === 'x' ? 'y' : 'x',
    })
    await expect(
      pageByRows<number, string>('cycle', { page: 1, limit: 5 }, fetch, { maxUpstreamPages: 50 }),
    ).rejects.toThrow(/more than 50 upstream pages/)
  })

  it('a peek that runs out of budget returns the page it completed, with hasMore true', async () => {
    // Page 1 at limit 5 ends exactly on a boundary, then empty pages follow.
    const { fetch, calls } = source([5, 0, 0, 0, 0, 0, 0, 2])
    const opts = { maxUpstreamPages: 3 }
    expect(await rows('k', 1, 5, fetch, opts)).toEqual({ items: range(5), hasMore: true })
    expect(calls).toHaveLength(3)
    // Page 2 has no row in hand, so running out there throws, but a retry
    // continues from the marks the failed call recorded.
    await expect(rows('k', 2, 5, fetch, opts)).rejects.toThrow(/more than 3/)
    expect(await rows('k', 2, 5, fetch, opts)).toEqual({ items: [5, 6], hasMore: false })
    expect(calls).toEqual([undefined, 1, 2, 3, 4, 5, 6, 7])
  })

  it('maxUpstreamPages bounds the requests one call may make', async () => {
    const { fetch, calls } = source([1, 1, 1, 1, 1])
    await expect(rows('k', 1, 5, fetch, { maxUpstreamPages: 2 })).rejects.toThrow(/more than 2/)
    expect(calls).toHaveLength(2)
  })

  it('reuseLastPage: false refetches the page a previous call ended in', async () => {
    const { fetch, calls } = source([10])
    await rows('k', 1, 3, fetch, { reuseLastPage: false })
    await rows('k', 2, 3, fetch, { reuseLastPage: false })
    expect(calls).toHaveLength(2)
  })

  it('refuses a page size below 1 rather than serving nothing forever', async () => {
    const { fetch } = source([3])
    await expect(rows('k', 1, 0, fetch)).rejects.toThrow(RangeError)
    await expect(rows('k', 1, Number.NaN, fetch)).rejects.toThrow(RangeError)
  })

  it('reads a numeric string limit as its number, floors a fractional one, and names what it refuses', async () => {
    const { fetch } = source([10])
    const asString = { page: 1, limit: '4' as unknown as number }
    expect((await pageByRows<number, number>('a', asString, fetch)).items).toEqual([0, 1, 2, 3])
    // 2.5 is 2: page 2 is rows 2 and 3, not a slice starting at row 2.5.
    const fractional = await pageByRows<number, number>('b', { page: 2, limit: 2.5 }, fetch)
    expect(fractional.items).toEqual([2, 3])
    const word = { page: 1, limit: 'ten' as unknown as number }
    await expect(pageByRows<number, number>('c', word, fetch)).rejects.toThrow(
      'limit must be a number >= 1 (got the string "ten")',
    )
    const flag = { limit: true as unknown as number }
    await expect(pageByRows<number, number>('d', flag, fetch)).rejects.toThrow('(got boolean true)')
  })

  it('a missing, zero or negative page is page 1; a missing limit is the default', async () => {
    const { fetch } = source([DEFAULT_PAGE_LIMIT + 5])
    for (const page of [undefined, 0, -3, Number.NaN]) {
      _resetRowPager()
      const r = await pageByRows<number, number>('k', { page, limit: 4 }, fetch)
      expect(r.items).toEqual([0, 1, 2, 3])
    }
    const byDefault = await pageByRows<number, number>('k', {}, fetch)
    expect(byDefault.items).toHaveLength(DEFAULT_PAGE_LIMIT)
    const adapterDefault = await pageByRows<number, number>('k', {}, fetch, { defaultLimit: 25 })
    expect(adapterDefault.items).toHaveLength(25)
  })
})

describe('pageByRows: a collection that changed', () => {
  it('a page that changed size invalidates the marks after it', async () => {
    const sizes = [3, 3, 3]
    const { fetch } = source(sizes)
    for (let p = 1; p <= 3; p++) await rows('k', p, 3, fetch)
    sizes[1] = 4
    const src2 = source(sizes)
    const all: number[] = []
    for (let p = 2; p <= 4; p++) {
      const r = await rows('k', p, 3, src2.fetch)
      all.push(...r.items)
      if (!r.hasMore) break
    }
    expect(all).toEqual([3, 4, 5, 6, 7, 8, 9])
  })

  it('a refetched page that changed size forgets the walked end, so a jump still finds the new last row', async () => {
    const sizes = [3, 3, 3, 3]
    for (let p = 1; p <= 4; p++) await rows('k', p, 3, source(sizes).fetch)
    sizes[1] = 4
    const src2 = source(sizes)
    expect((await rows('k', 2, 3, src2.fetch)).items).toEqual([3, 4, 5])
    expect(await rows('k', 5, 3, src2.fetch)).toEqual({ items: [12], hasMore: false })
  })

  it('a last page that grew a next cursor forgets the walked end', async () => {
    for (let p = 1; p <= 2; p++) await rows('k', p, 3, source([3, 3]).fetch)
    const grown = source([3, 3, 3])
    expect((await rows('k', 2, 3, grown.fetch)).hasMore).toBe(true)
    expect(await rows('k', 3, 3, grown.fetch)).toEqual({ items: [6, 7, 8], hasMore: false })
  })

  it('a page that grew and became the last one drops the marks after it', async () => {
    for (let p = 1; p <= 3; p++) await rows('k', p, 3, source([3, 3, 3]).fetch)
    // Upstream page 1 absorbed page 2: [3, 3, 3] is now [3, 4]. A mark left
    // behind for page 2 would start page 3 at a page that no longer exists.
    const now = source([3, 4])
    const served: number[] = []
    for (let p = 1; ; p++) {
      const r = await rows('k', p, 3, now.fetch)
      served.push(...r.items)
      if (!r.hasMore) break
    }
    expect(served).toEqual(range(7))
  })

  it('a recorded end answers a jump for a TTL after it was seen, then is checked again', async () => {
    vi.useFakeTimers()
    for (let p = 1; p <= 2; p++) await rows('k', p, 3, source([3, 3]).fetch)
    const grown = source([3, 3, 3])
    vi.advanceTimersByTime(30_000)
    // Within the TTL a jump past the end asks nothing, though rows were added.
    expect(await rows('k', 3, 3, grown.fetch)).toEqual({ items: [], hasMore: false })
    expect(grown.calls).toHaveLength(0)
    // That jump kept the walk alive, but the end it answered from is now a
    // TTL old: a poller jumping to page 3 every 30 s must not be told "empty"
    // forever.
    vi.advanceTimersByTime(30_000)
    expect(await rows('k', 3, 3, grown.fetch)).toEqual({ items: [6, 7, 8], hasMore: false })
  })

  it('growth noticed mid-page (no walk to the new end) still clears the old end', async () => {
    for (let p = 1; p <= 2; p++) await rows('k', p, 3, source([3, 3]).fetch)
    const grown = source([3, 3, 3])
    expect(await rows('k', 2, 2, grown.fetch)).toEqual({ items: [2, 3], hasMore: true })
    expect(await rows('k', 4, 2, grown.fetch)).toEqual({ items: [6, 7], hasMore: true })
  })

  it('a page past a walked end costs no request, even after the reuse slot has moved', async () => {
    const src = source([3, 3, 3])
    for (let p = 1; p <= 3; p++) await rows('k', p, 3, src.fetch)
    await rows('k', 1, 3, src.fetch)
    const before = src.calls.length
    expect(await rows('k', 50, 3, src.fetch)).toEqual({ items: [], hasMore: false })
    expect(src.calls.length).toBe(before)
  })
})

describe('pageByRows: time-to-live', () => {
  it('slides with use, so a long walk never re-walks', async () => {
    vi.useFakeTimers()
    const { fetch, calls } = source([3, 3, 3, 3, 3])
    for (let p = 1; p <= 5; p++) {
      await rows('k', p, 3, fetch)
      vi.advanceTimersByTime(50_000) // each gap is under a minute; the total is not
    }
    expect(calls).toHaveLength(5)
  })

  it('does not slide the reuse slot: rows fetched over a minute ago are fetched again', async () => {
    vi.useFakeTimers()
    const { fetch, calls } = source([10])
    await rows('k', 1, 3, fetch)
    vi.advanceTimersByTime(30_000)
    await rows('k', 2, 3, fetch) // from the slot
    expect(calls).toHaveLength(1)
    vi.advanceTimersByTime(31_000) // the marks slid at 30s; the slot is 61s old
    expect((await rows('k', 3, 3, fetch)).items).toEqual([6, 7, 8])
    expect(calls).toHaveLength(2)
  })

  it('forgets a walk that stalled past the time-to-live', async () => {
    vi.useFakeTimers()
    const { fetch, calls } = source([3, 3, 3])
    await rows('k', 1, 3, fetch) // page 0, and a peek at page 1
    expect(calls).toEqual([undefined, 1])
    vi.advanceTimersByTime(61_000)
    expect((await rows('k', 2, 3, fetch)).items).toEqual([3, 4, 5])
    expect(calls).toEqual([undefined, 1, undefined, 1, 2])
  })

  it('prunes expired entries instead of growing forever', async () => {
    vi.useFakeTimers()
    for (let i = 0; i < 20; i++) await rows(`k${i}`, 1, 3, source([3]).fetch)
    expect(_rowPagerSize()).toBe(20)
    vi.advanceTimersByTime(61_000)
    await rows('fresh', 1, 3, source([3]).fetch)
    expect(_rowPagerSize()).toBe(1)
  })

  it('counts from the end of a call, so a call slower than the TTL keeps its walk', async () => {
    // One upstream page of Shopify transactions is a request per order: 250
    // of them at 2 a second is over two minutes. Counted from the start of
    // the call, every page expired its own walk and re-walked from row 0.
    vi.useFakeTimers()
    const { fetch, calls } = source([3, 3, 3, 3, 3])
    const slow = async (c: number | undefined) => {
      vi.advanceTimersByTime(70_000)
      return fetch(c)
    }
    const served: number[] = []
    for (let p = 1; ; p++) {
      const r = await rows('k', p, 3, slow)
      served.push(...r.items)
      if (!r.hasMore) break
    }
    expect(served).toEqual(range(15))
    expect(calls).toHaveLength(5)
  })

  it('never prunes a walk while a call on it is in progress', async () => {
    vi.useFakeTimers()
    const a = source([3, 3, 3])
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const slowA = async (c: number | undefined) => {
      const res = a.fetch(c)
      if (c === 1) await gate
      return res
    }
    // Page 1 fetches upstream page 0, then peeks at page 1 and waits there.
    const pending = rows('a', 1, 3, slowA)
    for (let i = 0; i < 20; i++) await Promise.resolve()
    expect(a.calls).toEqual([undefined, 1])
    vi.advanceTimersByTime(61_000)
    // Another key's call prunes expired walks; 'a' started 61 s ago but is busy.
    await rows('b', 1, 3, source([1]).fetch)
    release()
    await pending
    // So page 2 of 'a' still comes from the page it peeked at.
    expect((await rows('a', 2, 3, slowA)).items).toEqual([3, 4, 5])
    expect(a.calls).toEqual([undefined, 1, 2])
  })

  it('a second call on a walk in use joins it, however long the first has run', async () => {
    vi.useFakeTimers()
    const a = source([3, 3, 3])
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const slow = async (c: number | undefined) => {
      const res = a.fetch(c)
      if (c === 1) await gate
      return res
    }
    // Page 1 reads upstream page 0, records where page 1 starts, and waits on its peek.
    const first = rows('k', 1, 3, slow)
    for (let i = 0; i < 20; i++) await Promise.resolve()
    vi.advanceTimersByTime(61_000)
    // Page 3 starts from the mark the running call recorded: upstream page 2
    // is two hops away, not three.
    const third = rows('k', 3, 3, a.fetch)
    release()
    expect((await third).items).toEqual([6, 7, 8])
    await first
    expect(a.calls).toEqual([undefined, 1, 1, 2])
  })

  it('prunes on every call, not only when a new walk starts', async () => {
    vi.useFakeTimers()
    await rows('a', 1, 3, source([10]).fetch)
    vi.advanceTimersByTime(30_000)
    const b = source([10])
    await rows('b', 1, 3, b.fetch)
    vi.advanceTimersByTime(31_000)
    // A hit on 'b', whose walk is 31 s idle; 'a' is 61 s idle.
    await rows('b', 2, 3, b.fetch)
    expect(_rowPagerSize()).toBe(1)
  })

  it('releases a slot whose rows are over a TTL old, even while its walk is alive', async () => {
    vi.useFakeTimers()
    const a = source([10])
    await rows('a', 1, 3, a.fetch)
    vi.advanceTimersByTime(50_000)
    await rows('a', 2, 3, a.fetch) // from the slot; the walk slides, the slot does not
    expect(a.calls).toHaveLength(1)
    expect(_rowPagerRowsHeld()).toBe(10)
    vi.advanceTimersByTime(20_000)
    await rows('z', 1, 3, source([3]).fetch)
    // 'a' is 20 s idle and kept; its rows, fetched 70 s ago, are not.
    expect(_rowPagerSize()).toBe(2)
    expect(_rowPagerRowsHeld()).toBe(0)
  })

  it('drops the slot once the last upstream page has been served', async () => {
    const { fetch } = source([4, 4])
    await rows('k', 1, 3, fetch)
    expect(_rowPagerRowsHeld()).toBe(4)
    await rows('k', 2, 3, fetch)
    await rows('k', 3, 3, fetch)
    expect(_rowPagerRowsHeld()).toBe(0)
  })

  it(`remembers at most ${MAX_ENTRIES} walks, dropping the least recently used`, async () => {
    const { fetch, calls } = source([1])
    for (let i = 0; i < MAX_ENTRIES; i++) await rows(`k${i}`, 1, 1, fetch)
    await rows('k0', 1, 1, fetch) // k0 is now the most recently used
    for (let i = 0; i < 5; i++) await rows(`extra${i}`, 1, 1, fetch)
    expect(_rowPagerSize()).toBe(MAX_ENTRIES)
    // A remembered walk answers a page past its end without a request.
    const before = calls.length
    expect(await rows('k0', 2, 1, fetch)).toEqual({ items: [], hasMore: false })
    expect(calls.length).toBe(before)
    // k1 was the least recently used, so it was dropped and asks again.
    expect(await rows('k1', 2, 1, fetch)).toEqual({ items: [], hasMore: false })
    expect(calls.length).toBe(before + 1)
  })

  it('is reset with the cursor pager, which is what adapter tests reset', async () => {
    await rows('k', 1, 3, source([3]).fetch)
    expect(_rowPagerSize()).toBe(1)
    _resetCursorPager()
    expect(_rowPagerSize()).toBe(0)
  })
})

/**
 * Upstream pages whose cursors carry a generation, `<index>@<generation>`.
 * After `expire()` every cursor minted before is refused, the way a platform
 * refuses a cursor whose query locator or session has gone.
 */
function expiring(sizes: number[]) {
  const starts: number[] = []
  let acc = 0
  for (const s of sizes) {
    starts.push(acc)
    acc += s
  }
  let generation = 0
  const log: Array<string | undefined> = []
  const fetch = async (c: string | undefined): Promise<CursorPage<number, string>> => {
    log.push(c)
    const [index, gen] = c === undefined ? [0, generation] : c.split('@').map(Number)
    if (gen !== generation) throw new Error(`cursor ${c} expired`)
    const i = index!
    return {
      items: Array.from({ length: sizes[i]! }, (_, k) => starts[i]! + k),
      next: i + 1 < sizes.length ? `${i + 1}@${generation}` : undefined,
    }
  }
  return { fetch, log, expire: () => generation++ }
}

const byRows = (
  key: string,
  page: number,
  limit: number,
  fetch: (c: string | undefined) => Promise<CursorPage<number, string>>,
  options?: RowPagerOptions,
) => pageByRows<number, string>(key, { page, limit }, fetch, options)

describe('pageByRows: failures', () => {
  it('forgets a cursor that failed, so a retry starts from the mark before it', async () => {
    const src = expiring([3, 3, 3])
    for (let p = 1; p <= 3; p++) await byRows('k', p, 3, src.fetch)
    src.expire()
    // Each failure forgets the mark it failed on; the third attempt reaches
    // the first page, which needs no cursor.
    await expect(byRows('k', 3, 3, src.fetch)).rejects.toThrow('cursor 2@0 expired')
    await expect(byRows('k', 3, 3, src.fetch)).rejects.toThrow('cursor 1@0 expired')
    expect(await byRows('k', 3, 3, src.fetch)).toEqual({ items: [6, 7, 8], hasMore: false })
  })

  it('restartOn: an expired chain is walked again from the first page, in the same call', async () => {
    const src = expiring([3, 3, 3])
    for (let p = 1; p <= 3; p++) await byRows('k', p, 3, src.fetch)
    src.expire()
    const restartOn = (err: unknown) => /expired/.test(String(err))
    const before = src.log.length
    expect(await byRows('k', 3, 3, src.fetch, { restartOn })).toEqual({
      items: [6, 7, 8],
      hasMore: false,
    })
    expect(src.log.slice(before)).toEqual(['2@0', undefined, '1@1', '2@1'])
    // An error restartOn does not name propagates.
    await expect(
      byRows('j', 1, 3, async () => Promise.reject(new Error('boom')), { restartOn }),
    ).rejects.toThrow('boom')
  })

  it('restartOn: the restarted walk fetches every page again, the slot included', async () => {
    const src = expiring([3, 3, 3])
    // Page 1 at limit 2 leaves upstream page 0, and its cursor to page 1, in the slot.
    await byRows('k', 1, 2, src.fetch)
    src.expire()
    const restartOn = (err: unknown) => /expired/.test(String(err))
    // Page 3 starts at row 4, in upstream page 1: the remembered cursor fails,
    // and serving page 0 from the slot would hand back its expired cursor.
    expect(await byRows('k', 3, 2, src.fetch, { restartOn })).toEqual({
      items: [4, 5],
      hasMore: true,
    })
  })

  it('restartOn: rows the call held before the failure are not served twice', async () => {
    const src = expiring([3, 3, 3])
    // Page 1 at limit 3 ends on a boundary and peeks: upstream page 1 is in the slot.
    await byRows('k', 1, 3, src.fetch)
    src.expire()
    const restartOn = (err: unknown) => /expired/.test(String(err))
    // Rows 4 and 5 come from the slot, then the peek at page 2 finds its cursor expired.
    expect(await byRows('k', 3, 2, src.fetch, { restartOn })).toEqual({
      items: [4, 5],
      hasMore: true,
    })
  })

  it('restartOn forgets the whole expired chain, so a later jump does not trip over it again', async () => {
    const src = expiring([3, 3, 3, 3, 3])
    for (let p = 1; p <= 5; p++) await byRows('k', p, 3, src.fetch)
    src.expire()
    const restartOn = (err: unknown) => /expired/.test(String(err))
    // The restart re-walks upstream pages 0 to 2 only.
    expect((await byRows('k', 2, 3, src.fetch, { restartOn })).items).toEqual([3, 4, 5])
    const before = src.log.length
    // Page 5 is past what the restart re-walked. A mark left over from the
    // expired chain would fail and restart a second time.
    expect(await byRows('k', 5, 3, src.fetch, { restartOn })).toEqual({
      items: [12, 13, 14],
      hasMore: false,
    })
    expect(src.log.slice(before)).toEqual(['3@1', '4@1'])
  })

  it('restartOn restarts once: a chain that fails again throws', async () => {
    let n = 0
    const fetch = async (c: string | undefined): Promise<CursorPage<number, string>> => {
      if (c !== undefined) throw new Error('expired')
      return { items: [n++], next: 'more' }
    }
    await expect(
      byRows('k', 1, 3, fetch, { restartOn: (err) => /expired/.test(String(err)) }),
    ).rejects.toThrow('expired')
    expect(n).toBe(2)
  })

  it('a page-1 retry after a failure resumes past the empty pages the failed call walked', async () => {
    const { fetch, calls } = source([0, 0, 0, 0, 0, 0, 3])
    const opts = { maxUpstreamPages: 4 }
    await expect(rows('k', 1, 5, fetch, opts)).rejects.toThrow(/more than 4/)
    expect(await rows('k', 1, 5, fetch, opts)).toEqual({ items: [0, 1, 2], hasMore: false })
    expect(calls).toEqual([undefined, 1, 2, 3, 4, 5, 6])
    // Once it succeeded, page 1 is read from the start again.
    await rows('k', 1, 5, fetch)
    expect(calls[7]).toBeUndefined()
    expect(calls).toHaveLength(14)
  })

  it('a page-1 retry more than a TTL after the failure starts from the first page', async () => {
    vi.useFakeTimers()
    const { fetch, calls } = source([0, 0, 0, 0, 0, 0, 3])
    const opts = { maxUpstreamPages: 4 }
    await expect(rows('k', 1, 5, fetch, opts)).rejects.toThrow(/more than 4/)
    vi.advanceTimersByTime(40_000)
    await rows('k', 9, 5, fetch, opts) // keeps the walk alive
    vi.advanceTimersByTime(21_000)
    const before = calls.length
    await expect(rows('k', 1, 5, fetch, opts)).rejects.toThrow(/more than 4/)
    expect(calls[before]).toBeUndefined()
  })
})

describe('pageByRows: identical calls in flight', () => {
  it('share one walk, and each gets its own array', async () => {
    const { fetch, calls } = source([3, 3, 0, 0, 3])
    const [a, b] = await Promise.all([rows('k', 1, 3, fetch), rows('k', 1, 3, fetch)])
    expect(a).toEqual({ items: [0, 1, 2], hasMore: true })
    expect(b).toEqual(a)
    expect(a.items).not.toBe(b.items)
    expect(calls).toEqual([undefined, 1])
  })

  it('a shared walk that failed is not shared with the next call', async () => {
    let fail = true
    const fetch = async (): Promise<CursorPage<number, number>> => {
      if (fail) throw new Error('down')
      return { items: [1] }
    }
    const both = await Promise.allSettled([rows('k', 1, 3, fetch), rows('k', 1, 3, fetch)])
    expect(both.map((r) => r.status)).toEqual(['rejected', 'rejected'])
    fail = false
    expect(await rows('k', 1, 3, fetch)).toEqual({ items: [1], hasMore: false })
  })
})

describe('pageByRows: concurrent calls on one key', () => {
  /**
   * `source`, with every fetch yielding a random number of microtasks first
   * and minting a fresh cursor token per response — Salesforce's
   * `nextRecordsUrl` names a new query locator each time a query runs.
   */
  function racySource(sizes: number[], rnd: () => number) {
    const starts: number[] = []
    let acc = 0
    for (const s of sizes) {
      starts.push(acc)
      acc += s
    }
    let minted = 0
    const fetch = async (c: string | undefined): Promise<CursorPage<number, string>> => {
      const ticks = Math.floor(rnd() * 6)
      for (let t = 0; t < ticks; t++) await Promise.resolve()
      const i = c === undefined ? 0 : Number(c.split(':')[0])
      return {
        items: Array.from({ length: sizes[i]! }, (_, k) => starts[i]! + k),
        next: i + 1 < sizes.length ? `${i + 1}:${minted++}` : undefined,
      }
    }
    return { fetch, total: acc }
  }

  it('Promise.all over random pages: every answer is right, and a walk after it still is', async () => {
    for (let seed = 1; seed <= 300; seed++) {
      _resetRowPager()
      const rnd = mulberry32(seed * 104729)
      const sizes = gen(rnd)
      const { fetch, total } = racySource(sizes, rnd)
      const asks = Array.from({ length: 8 }, () => {
        const L = 1 + Math.floor(rnd() * 10)
        return { L, P: 1 + Math.floor(rnd() * (Math.ceil(total / L) + 1)) }
      })
      const answers = await Promise.all(
        asks.map(({ L, P }) => pageByRows<number, string>('k', { page: P, limit: L }, fetch)),
      )
      answers.forEach((r, i) => {
        const { L, P } = asks[i]!
        const ctx = `seed ${seed} sizes ${sizes} L ${L} P ${P}`
        expect(r.items, ctx).toEqual(range(total).slice((P - 1) * L, P * L))
        expect(r.hasMore, ctx).toBe(total > P * L)
      })
      const served: number[] = []
      for (let p = 1; ; p++) {
        const r = await pageByRows<number, string>('k', { page: p, limit: 4 }, fetch)
        served.push(...r.items)
        if (!r.hasMore) break
      }
      expect(served, `seed ${seed} sizes ${sizes}`).toEqual(range(total))
    }
  })

  it('a call whose marks were rewritten while it waited leaves them alone', async () => {
    // A walk on [3,3,3,3], then the first upstream page grows to 4 rows.
    for (let p = 1; p <= 4; p++) await rows('k', p, 3, source([3, 3, 3, 3]).fetch)
    const now = source([4, 3, 3, 3])
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const slow = async (c: number | undefined) => {
      await gate
      return now.fetch(c)
    }
    // A asks for page 4 and waits on upstream page 3; B re-reads page 1,
    // sees the new size and truncates the marks A is walking.
    const a = rows('k', 4, 3, slow)
    const b = await rows('k', 1, 3, now.fetch)
    expect(b).toEqual({ items: [0, 1, 2], hasMore: true })
    release()
    await expect(a).resolves.toBeDefined()
    // A's stale page must not have been recorded over B's history.
    const served: number[] = []
    for (let p = 1; ; p++) {
      const r = await rows('k', p, 3, now.fetch)
      served.push(...r.items)
      if (!r.hasMore) break
    }
    expect(served).toEqual(range(13))
  })

  it('a call that lost the race keeps walking its own cursors, so its page is still whole', async () => {
    for (let p = 1; p <= 4; p++) await rows('k', p, 3, source([3, 3, 3, 3]).fetch)
    const now = source([4, 3, 3, 3])
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    let first = true
    const slow = async (c: number | undefined) => {
      if (first) {
        first = false
        await gate
      }
      return now.fetch(c)
    }
    // A starts page 2 at limit 5 from the old mark of upstream page 1 (row 3)
    // and waits there. B re-walks two pages at limit 3 and records the new
    // marks — upstream page 2 now starts at row 7, not 6.
    const a = rows('k', 2, 5, slow)
    await rows('k', 1, 3, now.fetch)
    await rows('k', 2, 3, now.fetch)
    release()
    // A's history puts upstream page 1 at row 3, so its page 2 is rows 5..9
    // of that history: five consecutive rows. Hopping onto B's mark for
    // upstream page 2 would drop one and still claim more.
    expect(await a).toEqual({ items: [6, 7, 8, 9, 10], hasMore: true })
  })

  /**
   * A collection of ids in upstream pages, fetched by page index. A response
   * is built when its request is made; `hold(cursor)` delays the next answer
   * for that cursor, which then arrives stale, as a slow upstream's does.
   * Assign `state.pages` to change the collection.
   */
  function live(pages: string[][]) {
    const state = { pages }
    const log: Array<number | undefined> = []
    const gates = new Map<number | undefined, Promise<void>>()
    const hold = (cursor: number | undefined): (() => void) => {
      let release!: () => void
      gates.set(cursor, new Promise<void>((resolve) => (release = resolve)))
      return () => release()
    }
    const fetch = async (c: number | undefined): Promise<CursorPage<string, number>> => {
      log.push(c)
      const i = c ?? 0
      const res = {
        items: [...state.pages[i]!],
        next: i + 1 < state.pages.length ? i + 1 : undefined,
      }
      const gate = gates.get(c)
      gates.delete(c)
      if (gate) await gate
      return res
    }
    return { state, log, hold, fetch }
  }
  const ids = (
    page: number,
    limit: number,
    fetch: (c: number | undefined) => Promise<CursorPage<string, number>>,
  ) => pageByRows<string, number>('k', { page, limit }, fetch)

  it('a stale answer to a call that lost the race never lands in the slot', async () => {
    const src = live([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ])
    for (let p = 1; p <= 3; p++) await ids(p, 3, src.fetch)
    // D asks for page 3 again. Its answer for upstream page 2 is the
    // collection as it is now, and it is held back.
    const release = src.hold(2)
    const d = ids(3, 3, src.fetch)
    // Then a row is added to upstream page 0 and one removed from page 1, so
    // page 2 still starts at row 6, and page 2 gains a row.
    src.state.pages = [
      ['a', 'b', 'c', 'x'],
      ['d', 'f'],
      ['g', 'h', 'i', 'j'],
    ]
    const served = [...(await ids(1, 3, src.fetch)).items, ...(await ids(2, 3, src.fetch)).items]
    release()
    await d
    // Page 3 continues from the page 2 this walk peeked at, not from D's
    // stale copy of it, which ended the collection at 'i'.
    for (let p = 3; ; p++) {
      const r = await ids(p, 3, src.fetch)
      served.push(...r.items)
      if (!r.hasMore) break
    }
    expect(served).toEqual(['a', 'b', 'c', 'x', 'd', 'f', 'g', 'h', 'i', 'j'])
  })

  it('a call that lost the race neither reads the slot nor moves how far it was served', async () => {
    const src = live([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ])
    for (let p = 1; p <= 3; p++) await ids(p, 3, src.fetch)
    // D asks for rows 4..7 and waits on upstream page 1 (rows 3..5 as it knows them).
    const release = src.hold(1)
    const d = ids(2, 4, src.fetch)
    // Upstream page 0 loses two rows and page 2 gains one: page 2 now starts at row 4.
    src.state.pages = [['a'], ['d', 'e', 'f'], ['g', 'h', 'i', 'j']]
    // W's page 1 ends exactly at row 4 and peeks at upstream page 2.
    expect(await ids(1, 4, src.fetch)).toEqual({ items: ['a', 'd', 'e', 'f'], hasMore: true })
    const before = src.log.length
    release()
    // D, detached, walks on to its own upstream page 2 and fetches it: the
    // slot holds page 2 of a history D no longer shares.
    expect(await d).toEqual({ items: ['e', 'f', 'g', 'h'], hasMore: true })
    expect(src.log.slice(before)).toEqual([2])
    // And W's page 2 is still served from the page it peeked at: D did not
    // mark the slot's rows as served further than W took them.
    expect(await ids(2, 4, src.fetch)).toEqual({ items: ['g', 'h', 'i', 'j'], hasMore: false })
    expect(src.log.slice(before)).toEqual([2])
  })

  /**
   * `racySource` over ids, with the collection changing while calls are in
   * flight: a response is built when its request is made, and some fetches
   * then insert or delete an id before they answer, so answers can be stale.
   */
  function changingSource(sizes: number[], rnd: () => number) {
    let nextId = 0
    const pages = sizes.map((n) => Array.from({ length: n }, () => nextId++))
    let changing = true
    let minted = 0
    const change = () => {
      const page = pages[Math.floor(rnd() * pages.length)]!
      if (rnd() < 0.5 && page.length > 0) page.splice(Math.floor(rnd() * page.length), 1)
      else page.splice(Math.floor(rnd() * (page.length + 1)), 0, 100_000 + nextId++)
    }
    const fetch = async (c: string | undefined): Promise<CursorPage<number, string>> => {
      const i = c === undefined ? 0 : Number(c.split(':')[0])
      const res = {
        items: [...pages[i]!],
        next: i + 1 < pages.length ? `${i + 1}:${minted++}` : undefined,
      }
      const ticks = Math.floor(rnd() * 6)
      for (let t = 0; t < ticks; t++) await Promise.resolve()
      if (changing && rnd() < 0.25) change()
      return res
    }
    return { fetch, all: () => pages.flat(), settle: () => (changing = false) }
  }

  it('Promise.all while the collection changes: no page claiming more is short, and a walk after it is exact', async () => {
    for (let seed = 1; seed <= 400; seed++) {
      _resetRowPager()
      const rnd = mulberry32(seed * 15485863)
      const src = changingSource(gen(rnd), rnd)
      const total = src.all().length
      const asks = Array.from({ length: 8 }, () => {
        const L = 1 + Math.floor(rnd() * 10)
        return { L, P: 1 + Math.floor(rnd() * (Math.ceil(total / L) + 1)) }
      })
      const answers = await Promise.all(
        asks.map(({ L, P }) => pageByRows<number, string>('k', { page: P, limit: L }, src.fetch)),
      )
      answers.forEach((r, i) => {
        if (r.hasMore) expect(r.items, `seed ${seed} ask ${i}`).toHaveLength(asks[i]!.L)
      })
      src.settle()
      const served: number[] = []
      for (let p = 1; ; p++) {
        const r = await pageByRows<number, string>('k', { page: p, limit: 4 }, src.fetch)
        served.push(...r.items)
        if (!r.hasMore) break
        if (p > 500) throw new Error(`seed ${seed}: the walk never ended`)
      }
      expect(served, `seed ${seed}`).toEqual(src.all())
    }
  })
})

describe('pageByRows: reporting', () => {
  it('reports hasMore and pagedLocally through the page sink, and the router envelope agrees', async () => {
    const { fetch, total } = source([4, 0, 7, 2])
    for (let p = 1; ; p++) {
      const params = parseListQuery({ limit: '5', page: String(p) })
      const r = await pageByRows<number, number>('k', params, fetch)
      const reported = readUpstreamPage(params)
      expect(reported?.hasMore).toBe(r.hasMore)
      expect(reported?.pagedLocally).toBe(true)
      expect(listPage(r.items, params, 'fixture').meta.hasMore).toBe(r.hasMore)
      if (!r.hasMore) {
        expect(p).toBe(Math.ceil(total / 5))
        break
      }
    }
  })

  it('reports a page answered past the walked end too', async () => {
    const { fetch } = source([3])
    await rows('k', 1, 3, fetch)
    const params = withPageSink({ page: 9, limit: 3 })
    await pageByRows<number, number>('k', params, fetch)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false })
    expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
  })
})
