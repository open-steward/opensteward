/**
 * An agent could not tell a cached answer from a live one.
 *
 * The server already reports it: `X-OpenSteward-Cache` is `hit` / `miss` /
 * `live` / `passthrough`, and `X-OpenSteward-Synced-At` carries the age of a
 * hit. The MCP client threw both away — `request()` returned `res.data` and
 * nothing else — so nothing survived to the tool result.
 *
 * That matters beyond curiosity. The raw-payload policy is a live runtime
 * setting, and a row cached under one setting is served under whatever is in
 * force later, so the same record can legitimately answer two ways depending on
 * whether the cache happened to be warm. Without the header an agent sees the
 * difference and has no way to explain it; with it, `status: "hit"` plus a
 * `syncedAt` is the whole explanation.
 *
 * It rides in `meta`, beside the `platform` and `fetchedAt` the server already
 * puts there, so an agent reads one envelope rather than two channels.
 */
import { describe, it, expect } from 'vitest'
import { attachCacheMeta } from '../src/rest-client'

describe('attachCacheMeta', () => {
  it('records a cache hit and how old the rows are', () => {
    const out = attachCacheMeta(
      { data: [{ id: '1' }], meta: { platform: 'fortnox' } },
      { 'x-opensteward-cache': 'hit', 'x-opensteward-synced-at': '2026-09-01T12:00:00.000Z' },
    ) as { meta: { cache?: { status?: string; syncedAt?: string } } }

    expect(out.meta.cache).toEqual({ status: 'hit', syncedAt: '2026-09-01T12:00:00.000Z' })
  })

  it('records a miss without inventing an age', () => {
    const out = attachCacheMeta(
      { data: [], meta: { platform: 'fortnox' } },
      { 'x-opensteward-cache': 'miss' },
    ) as { meta: { cache?: { status?: string; syncedAt?: string } } }

    expect(out.meta.cache).toEqual({ status: 'miss' })
  })

  it('leaves the rest of meta untouched', () => {
    const out = attachCacheMeta(
      { data: [], meta: { platform: 'fortnox', totalCount: 1339, hasMore: true } },
      { 'x-opensteward-cache': 'live' },
    ) as { meta: Record<string, unknown> }

    expect(out.meta).toMatchObject({ platform: 'fortnox', totalCount: 1339, hasMore: true })
  })

  it('is a no-op when the server sent no cache header', () => {
    const body = { data: [], meta: { platform: 'x' } }
    expect(attachCacheMeta(body, {})).toEqual(body)
  })

  it('does not invent a meta object on a body that has none', () => {
    const body = { something: 'else' }
    expect(attachCacheMeta(body, { 'x-opensteward-cache': 'hit' })).toEqual(body)
  })

  it('tolerates a non-object body', () => {
    expect(attachCacheMeta('plain', { 'x-opensteward-cache': 'hit' })).toBe('plain')
    expect(attachCacheMeta(null, { 'x-opensteward-cache': 'hit' })).toBeNull()
  })
})
