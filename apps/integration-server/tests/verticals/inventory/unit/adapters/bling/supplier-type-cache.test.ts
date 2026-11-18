import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { BlingAdapter } from '../../../../../../src/verticals/inventory/adapters/bling'
import { BlingClient } from '../../../../../../src/verticals/inventory/adapters/bling/client'

/**
 * `listSuppliers` resolved the account's "Fornecedor" contact-type id with its
 * own `GET /contatos/tipos` on every call, including every page of a
 * paginated sync — doubling the round-trips for a value that does not change.
 *
 * The obvious fix is unsafe. `AdapterRegistry` keys instances by platform
 * alone (`packages/shared/src/adapter/registry.ts:42`), so ONE `BlingAdapter`
 * serves every tenant. A bare instance field would hand tenant A's contact-type
 * id to tenant B, and the id is per-account — the interface comment says so.
 *
 * So the cache is keyed by the credential it was resolved with, which makes a
 * cross-tenant hit impossible by construction rather than by care, and makes a
 * rotated token miss rather than serve a stale id.
 */

const tenantA = { accessToken: 'tok-a' } as Credentials
const tenantB = { accessToken: 'tok-b' } as Credentials

function adapter(): BlingAdapter {
  return new BlingAdapter({
    clientId: 'client-id',
    clientSecret: 'client-secret',
    redirectUri: 'https://example.com/callback',
  })
}

/** Types endpoint answers a different id per token, as a real account would. */
function stubClient(idFor: Record<string, number> = { 'tok-a': 111, 'tok-b': 222 }) {
  return vi
    .spyOn(BlingClient.prototype, 'get')
    .mockImplementation(async function (this: unknown, path: string) {
      // BlingClient keeps no credentials field — the token survives only on the
      // axios instance it built, which is the honest place to read it from.
      const auth = (this as { http: { defaults: { headers: Record<string, string> } } }).http
        .defaults.headers.Authorization
      const token = auth?.replace(/^Bearer /, '')
      if (path === '/contatos/tipos') {
        const id = idFor[token ?? ''] ?? 999
        return { data: [{ id: 9, descricao: 'Cliente' }, { id, descricao: 'Fornecedor' }] } as never
      }
      return { data: [] } as never
    })
}

/** The idTipoContato each /contatos call was filtered by. */
function filterIds(get: ReturnType<typeof stubClient>): unknown[] {
  return get.mock.calls
    .filter((c) => c[0] === '/contatos')
    .map((c) => (c[1] as { idTipoContato?: unknown })?.idTipoContato)
}

function typesCallCount(get: ReturnType<typeof stubClient>): number {
  return get.mock.calls.filter((c) => c[0] === '/contatos/tipos').length
}

afterEach(() => vi.restoreAllMocks())

describe('bling Fornecedor type id caching', () => {
  it('resolves once across repeated calls for the same connection', async () => {
    const get = stubClient()
    const a = adapter()
    await a.listSuppliers(tenantA, { page: 1 })
    await a.listSuppliers(tenantA, { page: 2 })
    await a.listSuppliers(tenantA, { page: 3 })
    expect(typesCallCount(get)).toBe(1)
    expect(filterIds(get)).toEqual([111, 111, 111])
  })

  it('never serves one tenant the id resolved for another', async () => {
    const get = stubClient()
    const shared = adapter() // one instance, as AdapterRegistry hands out
    await shared.listSuppliers(tenantA, {})
    await shared.listSuppliers(tenantB, {})
    // Each must have filtered by its OWN account's id.
    expect(filterIds(get)).toEqual([111, 222])
    expect(typesCallCount(get)).toBe(2)
  })

  it('re-resolves after the token rotates, rather than reusing the old entry', async () => {
    const get = stubClient({ 'tok-a': 111, 'tok-a-rotated': 333 })
    const a = adapter()
    await a.listSuppliers(tenantA, {})
    await a.listSuppliers({ accessToken: 'tok-a-rotated' } as Credentials, {})
    expect(filterIds(get)).toEqual([111, 333])
  })

  it('re-resolves once the entry has expired', async () => {
    vi.useFakeTimers()
    try {
      const get = stubClient()
      const a = adapter()
      await a.listSuppliers(tenantA, {})
      expect(typesCallCount(get)).toBe(1)
      // Well past any sane TTL. An entry that never expires would survive a
      // contact type being renamed or recreated for the life of the process.
      vi.advanceTimersByTime(25 * 60 * 60 * 1000)
      await a.listSuppliers(tenantA, {})
      expect(typesCallCount(get)).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not cache a failed resolution', async () => {
    let attempt = 0
    const get = vi
      .spyOn(BlingClient.prototype, 'get')
      .mockImplementation(async (path: string) => {
        if (path === '/contatos/tipos') {
          attempt += 1
          // First call has no Fornecedor row; the second does.
          if (attempt === 1) return { data: [{ id: 9, descricao: 'Cliente' }] } as never
          return { data: [{ id: 111, descricao: 'Fornecedor' }] } as never
        }
        return { data: [] } as never
      })
    const a = adapter()
    await expect(a.listSuppliers(tenantA, {})).rejects.toThrow(/Fornecedor/)
    // A transient failure must not poison the entry for the life of the process.
    await a.listSuppliers(tenantA, {})
    expect(filterIds(get)).toEqual([111])
  })
})
