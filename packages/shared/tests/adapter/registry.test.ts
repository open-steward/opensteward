import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { AdapterRegistry } from '../../src/adapter/registry'
import { AdapterSettingsStore } from '../../src/adapter/settings-store'
import type { BaseAdapter } from '../../src/adapter/base'

const SECRET = 'test-secret-must-be-at-least-32-chars!'

interface TestAdapter extends BaseAdapter {
  config: Record<string, unknown>
}

function makeFactory(slug: string) {
  return (config?: Record<string, unknown>): TestAdapter => ({
    platform: slug,
    config: config ?? {},
  })
}

const FACTORIES = {
  fortnox: makeFactory('fortnox'),
  fedex: makeFactory('fedex'),
  dhl: makeFactory('dhl'),
}

describe('AdapterRegistry — static API', () => {
  it('register/get/list/has/count', () => {
    const r = new AdapterRegistry<TestAdapter>()
    const a: TestAdapter = { platform: 'fortnox', config: {} }
    r.register(a)
    expect(r.count()).toBe(1)
    expect(r.has('fortnox')).toBe(true)
    expect(r.get('fortnox')).toBe(a)
    expect(r.list()).toEqual(['fortnox'])
  })

  it('unregister removes the adapter', () => {
    const r = new AdapterRegistry<TestAdapter>()
    r.register({ platform: 'fortnox', config: {} })
    expect(r.unregister('fortnox')).toBe(true)
    expect(r.count()).toBe(0)
    expect(r.unregister('fortnox')).toBe(false)
  })
})

describe('AdapterRegistry — mutable API with settings store', () => {
  let dir: string
  let handle: DbHandle
  let store: AdapterSettingsStore
  let registry: AdapterRegistry<TestAdapter>

  afterEach(async () => {
    // Stores BORROW the handle — close the handle, never the store.
    await handle?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  const TEST_VERTICAL = 'test-vertical'

  async function open(): Promise<{
    store: AdapterSettingsStore
    registry: AdapterRegistry<TestAdapter>
  }> {
    dir = mkdtempSync(join(tmpdir(), 'registry-test-'))
    handle = await openDb({ sqlitePath: join(dir, 'test.db') })
    store = await AdapterSettingsStore.create(handle, SECRET, { salt: 'test-salt' })
    registry = new AdapterRegistry<TestAdapter>({
      vertical: TEST_VERTICAL,
      factories: FACTORIES,
      settingsStore: store,
    })
    return { store, registry }
  }

  it('knownSlugs returns factory keys', async () => {
    const { registry } = await open()
    expect(registry.knownSlugs().sort()).toEqual(['dhl', 'fedex', 'fortnox'])
  })

  it('enable instantiates and persists', async () => {
    const { registry, store } = await open()
    const adapter = await registry.enable('fortnox', { clientId: 'abc' })
    expect(adapter.platform).toBe('fortnox')
    expect(adapter.config.clientId).toBe('abc')
    expect(registry.has('fortnox')).toBe(true)

    const persisted = await store.get(TEST_VERTICAL, 'fortnox')
    expect(persisted!.enabled).toBe(true)
    expect(persisted!.config.clientId).toBe('abc')
  })

  it('enable throws on unknown slug', async () => {
    const { registry } = await open()
    await expect(registry.enable('nonexistent')).rejects.toThrow(/unknown adapter slug/i)
  })

  it('disable removes from registry and persists enabled=false', async () => {
    const { registry, store } = await open()
    await registry.enable('fortnox', { clientId: 'abc' })
    expect(await registry.disable('fortnox')).toBe(true)
    expect(registry.has('fortnox')).toBe(false)

    // Settings row preserved with enabled=false and config intact
    const persisted = await store.get(TEST_VERTICAL, 'fortnox')
    expect(persisted!.enabled).toBe(false)
    expect(persisted!.config.clientId).toBe('abc')
  })

  it('hydrate restores enabled adapters from store', async () => {
    const { registry, store } = await open()
    await store.upsert(TEST_VERTICAL, 'fedex', { enabled: true, config: { clientId: 'fed' } })
    await store.upsert(TEST_VERTICAL, 'dhl', { enabled: false, config: { clientId: 'dhl-c' } })

    await registry.hydrate()
    expect(registry.has('fedex')).toBe(true)
    expect(registry.has('dhl')).toBe(false)
    expect(registry.get('fedex')!.config.clientId).toBe('fed')
  })

  it('setConfig updates config and re-instantiates if enabled', async () => {
    const { registry } = await open()
    await registry.enable('fortnox', { clientId: 'old' })
    const before = registry.get('fortnox')

    await registry.setConfig('fortnox', { clientId: 'new' })
    const after = registry.get('fortnox')

    expect(after!.config.clientId).toBe('new')
    // New instance, not the same object
    expect(after).not.toBe(before)
  })

  it('setConfig persists without re-instantiating if disabled', async () => {
    const { registry, store } = await open()
    await store.upsert(TEST_VERTICAL, 'fortnox', { enabled: false, config: {} })
    await registry.setConfig('fortnox', { clientId: 'persisted' })

    expect(registry.has('fortnox')).toBe(false) // still disabled
    expect((await store.get(TEST_VERTICAL, 'fortnox'))!.config.clientId).toBe('persisted')
  })

  it('listAll merges factory map with settings', async () => {
    const { registry } = await open()
    await registry.enable('fortnox', { clientId: 'x' })
    // fedex and dhl never enabled

    const all = await registry.listAll()
    expect(all).toHaveLength(3)
    expect(all.find((r) => r.slug === 'fortnox')).toEqual({
      slug: 'fortnox',
      enabled: true,
      hasConfig: true,
    })
    expect(all.find((r) => r.slug === 'fedex')).toEqual({
      slug: 'fedex',
      enabled: false,
      hasConfig: false,
    })
  })

  it('hydrate skips unknown slugs in store', async () => {
    const { registry, store } = await open()
    await store.upsert(TEST_VERTICAL, 'removed-adapter', { enabled: true, config: {} })
    await registry.hydrate()
    expect(registry.has('removed-adapter')).toBe(false)
  })

  it('isolates settings between verticals sharing a slug', async () => {
    const { store } = await open()
    await store.upsert('accounting', 'bexio', { enabled: true, config: { clientId: 'acc' } })
    await store.upsert('crm', 'bexio', { enabled: false, config: { clientId: 'crm' } })

    const FACTORIES_BEXIO = { bexio: makeFactory('bexio') }
    const accReg = new AdapterRegistry<TestAdapter>({
      vertical: 'accounting',
      factories: FACTORIES_BEXIO,
      settingsStore: store,
    })
    const crmReg = new AdapterRegistry<TestAdapter>({
      vertical: 'crm',
      factories: FACTORIES_BEXIO,
      settingsStore: store,
    })

    await accReg.hydrate()
    await crmReg.hydrate()

    expect(accReg.has('bexio')).toBe(true)
    expect(accReg.get('bexio')!.config.clientId).toBe('acc')
    expect(crmReg.has('bexio')).toBe(false) // disabled in crm, enabled in accounting
  })

  it('throws when settingsStore is given without vertical', async () => {
    dir = mkdtempSync(join(tmpdir(), 'registry-test-'))
    handle = await openDb({ sqlitePath: join(dir, 'test.db') })
    const tmpStore = await AdapterSettingsStore.create(handle, SECRET, { salt: 'test-salt' })
    // The registry constructor is synchronous, so this still throws eagerly.
    expect(
      () => new AdapterRegistry<TestAdapter>({ factories: FACTORIES, settingsStore: tmpStore }),
    ).toThrow(/`vertical` is required/)
  })
})
