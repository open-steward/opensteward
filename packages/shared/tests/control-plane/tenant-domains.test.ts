import { describe, it, expect, vi } from 'vitest'
import { TenantDomainFetcher, DEFAULT_TENANT } from '../../src/control-plane/tenant-domains'

function jsonResponse(data: unknown, ok = true): Response {
  return {
    ok,
    json: async () => ({ data }),
  } as unknown as Response
}

const MAP = [
  { domain: 'dept-b.acme.com', tenantId: 'dept-b' },
  { domain: 'dept-a.acme.com', tenantId: 'dept-a' },
  { domain: 'extra.acme.com', tenantId: 'dept-a' },
]

function fetcher(fetchImpl: typeof fetch, cacheMs = 60_000) {
  return new TenantDomainFetcher({ adminApiUrl: 'http://admin-api:3001', cacheMs, fetchImpl })
}

describe('TenantDomainFetcher', () => {
  it('resolves a mapped host to its tenant (case-insensitive)', async () => {
    const f = fetcher(vi.fn(async () => jsonResponse(MAP)) as unknown as typeof fetch)
    expect(await f.resolve('dept-a.acme.com')).toBe('dept-a')
    expect(await f.resolve('DEPT-A.ACME.COM')).toBe('dept-a')
    expect(await f.resolve('dept-b.acme.com')).toBe('dept-b')
  })

  it('falls back to the default tenant for an unknown host', async () => {
    const f = fetcher(vi.fn(async () => jsonResponse(MAP)) as unknown as typeof fetch)
    expect(await f.resolve('nope.example.com')).toBe(DEFAULT_TENANT)
    expect(await f.resolve('')).toBe(DEFAULT_TENANT)
  })

  it('domainForTenant returns the alphabetically-first domain, or null', async () => {
    const f = fetcher(vi.fn(async () => jsonResponse(MAP)) as unknown as typeof fetch)
    // dept-a has both dept-a.acme.com and extra.acme.com → dept-a.* sorts first.
    expect(await f.domainForTenant('dept-a')).toBe('dept-a.acme.com')
    expect(await f.domainForTenant('dept-b')).toBe('dept-b.acme.com')
    expect(await f.domainForTenant('unknown')).toBeNull()
    expect(await f.domainForTenant(DEFAULT_TENANT)).toBeNull()
  })

  it('fails soft (everything → default) when admin-api returns non-ok', async () => {
    const f = fetcher(vi.fn(async () => jsonResponse([], false)) as unknown as typeof fetch)
    expect(await f.resolve('dept-a.acme.com')).toBe(DEFAULT_TENANT)
  })

  it('fails soft when fetch throws', async () => {
    const f = fetcher(vi.fn(async () => {
      throw new Error('network down')
    }) as unknown as typeof fetch)
    expect(await f.resolve('dept-a.acme.com')).toBe(DEFAULT_TENANT)
  })

  it('caches within the TTL and refetches after invalidate', async () => {
    const impl = vi.fn(async () => jsonResponse(MAP))
    const f = fetcher(impl as unknown as typeof fetch)
    await f.resolve('dept-a.acme.com')
    await f.resolve('dept-b.acme.com')
    expect(impl).toHaveBeenCalledTimes(1) // second call served from cache
    f.invalidate()
    await f.resolve('dept-a.acme.com')
    expect(impl).toHaveBeenCalledTimes(2)
  })

  // The compose smoke stack deadlocked on this: admin-api starts only once
  // integration-server is healthy, and /health awaited a fetch to admin-api
  // that never settled.
  it('gives up on a fetch that never settles, after timeoutMs, and resolves to default', async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))
        }),
    )
    const f = new TenantDomainFetcher({
      adminApiUrl: 'http://admin-api:3001',
      timeoutMs: 20,
      fetchImpl: hang as unknown as typeof fetch,
    })
    const started = Date.now()
    expect(await f.resolve('dept-a.acme.com')).toBe(DEFAULT_TENANT)
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(hang).toHaveBeenCalledTimes(1)
  })

  it('concurrent lookups share one in-flight fetch', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const impl = vi.fn(async () => {
      await gate
      return jsonResponse(MAP)
    })
    const f = fetcher(impl as unknown as typeof fetch)
    const all = Promise.all([
      f.resolve('dept-a.acme.com'),
      f.resolve('dept-b.acme.com'),
      f.domainForTenant('dept-a'),
    ])
    release()
    expect(await all).toEqual(['dept-a', 'dept-b', 'dept-a.acme.com'])
    expect(impl).toHaveBeenCalledTimes(1)
  })

  it('with no admin-api URL configured, resolves everything to default without fetching', async () => {
    const impl = vi.fn(async () => jsonResponse(MAP))
    const f = new TenantDomainFetcher({ adminApiUrl: undefined, fetchImpl: impl as unknown as typeof fetch })
    expect(await f.resolve('dept-a.acme.com')).toBe(DEFAULT_TENANT)
    expect(impl).not.toHaveBeenCalled()
  })
})
