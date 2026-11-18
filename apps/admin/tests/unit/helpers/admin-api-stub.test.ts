/**
 * The shared AdminApiClient stub.
 *
 * This exists because hand-rolled mocks broke six times in a day whenever a
 * route grew a new `apiClient` call. The properties below are the ones that
 * make it safe to rely on — particularly the thenable trap, which would fail in
 * a way nobody would connect back to this file.
 */
import { describe, it, expect, vi } from 'vitest'
import { adminApiStub } from '../../helpers/admin-api-stub'

/** The stub is a class; tests use instances of it, as the routes do. */
const build = (overrides: Record<string, unknown> = {}) =>
  new (adminApiStub(overrides) as new () => Record<string, (...a: unknown[]) => unknown>)()

describe('reads answer with something harmless', () => {
  it('returns an empty array for list*', async () => {
    await expect(build().listWebhookSubs()).resolves.toEqual([])
    await expect(build().listConnections()).resolves.toEqual([])
  })

  it('answers listTenants with the seeded tenant, not an empty list', async () => {
    // Every deployment has a `default` tenant, so `[]` describes a state that
    // cannot exist — and pages branching on `tenants.length > 1` read
    // differently against empty versus singular. Three files had to override
    // this back to reality before it became a default.
    await expect(build().listTenants()).resolves.toEqual([{ id: 'default', name: 'Default' }])
  })

  it('returns null for get*', async () => {
    await expect(build().getCompanyInfo()).resolves.toBeNull()
  })

  it('says the deployment already has users', async () => {
    // Not a prefix rule, and not false: `hasUsers() === false` means "fresh
    // install", so the first-run guard redirects every admin page to
    // /setup/init and every test sees a 302 with an empty body. A test that has
    // not said otherwise is exercising an installed deployment.
    await expect(build().hasUsers()).resolves.toBe(true)
  })

  it('still lets a test claim a fresh install', async () => {
    const stub = build({ hasUsers: async () => false })
    await expect(stub.hasUsers()).resolves.toBe(false)
  })

  it('does not treat a merely-similar name as a read', async () => {
    // `listen`/`hasty`-shaped names are not reads. Without the capital-letter
    // check they would silently resolve to [] instead of failing.
    expect(() => build().listener()).toThrow(/not stubbed/)
    expect(() => build().gettysburg()).toThrow(/not stubbed/)
    // And a has* name that is not the one named default.
    expect(() => build().hasty()).toThrow(/not stubbed/)
  })
})

describe('writes refuse, by name', () => {
  it('throws naming the method that was called', async () => {
    // The whole point: the next person should not repeat the 403 hunt this
    // helper was written to end.
    expect(() => build().mintApiKey()).toThrow(/AdminApiClient\.mintApiKey/)
    expect(() => build().mintApiKey()).toThrow(/not stubbed in this test/)
  })

  it('tells you how to fix it', async () => {
    expect(() => build().createEndUser()).toThrow(/adminApiStub\(\{ createEndUser/)
  })

  it('throws for the irregular names too', async () => {
    // ~20 methods match no prefix at all — acknowledgeAll, exportAudit,
    // ldapLogin. They must fail rather than silently default.
    for (const name of ['acknowledgeAll', 'exportAudit', 'ldapLogin', 'enablePlatform']) {
      expect(() => build()[name]()).toThrow(new RegExp(`AdminApiClient\\.${name}`))
    }
  })
})

describe('overrides win', () => {
  it('replaces a read default', async () => {
    const stub = build({ listTenants: async () => [{ id: 'dept-a' }] })
    await expect(stub.listTenants()).resolves.toEqual([{ id: 'dept-a' }])
  })

  it('makes a write callable', async () => {
    const stub = build({ mintApiKey: async () => ({ id: 'k1' }) })
    await expect(stub.mintApiKey()).resolves.toEqual({ id: 'k1' })
  })

  it('records calls when the override is a vi.fn()', async () => {
    // How most journey tests assert, so it has to survive the Proxy.
    const spy = vi.fn(async () => ({ ok: true }))
    const stub = build({ createWebhookSub: spy })
    await stub.createWebhookSub('jwt', { url: 'https://x.example' })
    expect(spy).toHaveBeenCalledWith('jwt', { url: 'https://x.example' })
  })

  it('does not mistake Object.prototype members for named defaults', async () => {
    // `NAMED_DEFAULTS['hasOwnProperty']` finds Object.prototype's copy under
    // plain indexing, so plain indexing would answer a resolved promise rather
    // than refusing. No AdminApiClient method collides today — the next one
    // would, and would do so silently.
    for (const name of ['hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable']) {
      expect(() => build()[name]('x')).toThrow(/not stubbed/)
    }
  })

  it('does not mistake inherited object properties for overrides', async () => {
    // `'listTenants' in {}` is false, but `'toString' in {}` is true via the
    // prototype chain — a naive `in` check would hand Object.prototype.toString
    // back as though the caller had passed it. hasOwnProperty is why it does not.
    const stub = build({})
    expect(stub.toString).toBe(Object.prototype.toString)
  })
})

describe('the stub is not a thenable', () => {
  it('leaves then undefined', () => {
    // A callable `then` makes the instance a thenable, so `await client` — or
    // just returning it from an async function — would try to unwrap it and
    // hang. This is the failure most likely to cost someone an afternoon.
    expect(build().then).toBeUndefined()
    expect(build().catch).toBeUndefined()
    expect(build().finally).toBeUndefined()
  })

  it('can be awaited without hanging', async () => {
    const stub = build()
    const resolved = await Promise.race([
      Promise.resolve(stub),
      new Promise((r) => setTimeout(() => r('TIMED_OUT'), 200)),
    ])
    expect(resolved).toBe(stub)
  })

  it('can be turned into a string', () => {
    // String(obj) reads Symbol.toPrimitive, then toString/valueOf. Stubbing any
    // of those throws from inside the runtime, nowhere near this file.
    expect(() => String(build())).not.toThrow()
    expect(() => `${build()}`).not.toThrow()
    expect(() => JSON.stringify({ client: build() })).not.toThrow()
  })
})
