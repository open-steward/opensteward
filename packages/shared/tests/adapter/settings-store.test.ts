import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { AdapterSettingsStore } from '../../src/adapter/settings-store'

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'adapter-settings-test-'))
}

const SECRET = 'test-secret-must-be-at-least-32-chars!'

describe('AdapterSettingsStore', () => {
  let dir: string
  let handle: DbHandle
  let store: AdapterSettingsStore
  let dbPath: string

  afterEach(async () => {
    // The store BORROWS the handle — close the handle, never the store.
    await handle?.close()
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  async function open(): Promise<AdapterSettingsStore> {
    dir = makeTmpDir()
    dbPath = join(dir, 'test.db')
    handle = await openDb({ sqlitePath: dbPath })
    store = await AdapterSettingsStore.create(handle, SECRET, { salt: 'test-salt' })
    return store
  }

  it('upserts settings and round-trips encrypted config', async () => {
    const s = await open()
    const result = await s.upsert('accounting', 'fortnox', {
      enabled: true,
      config: { clientId: 'abc', clientSecret: 'xyz', scopes: ['a', 'b'] },
    })
    expect(result.vertical).toBe('accounting')
    expect(result.slug).toBe('fortnox')
    expect(result.enabled).toBe(true)
    expect(result.config).toEqual({ clientId: 'abc', clientSecret: 'xyz', scopes: ['a', 'b'] })

    const fetched = await s.get('accounting', 'fortnox')
    expect(fetched).toBeDefined()
    expect(fetched!.config.clientSecret).toBe('xyz')
  })

  it('updates the enabled flag without losing config', async () => {
    const s = await open()
    await s.upsert('accounting', 'fortnox', { enabled: true, config: { clientId: 'abc' } })
    await s.upsert('accounting', 'fortnox', { enabled: false })
    const fetched = await s.get('accounting', 'fortnox')
    expect(fetched!.enabled).toBe(false)
    expect(fetched!.config.clientId).toBe('abc')
  })

  it('updates config without losing enabled flag', async () => {
    const s = await open()
    await s.upsert('logistics', 'fedex', { enabled: true, config: { clientId: 'old' } })
    await s.upsert('logistics', 'fedex', { config: { clientId: 'new' } })
    const fetched = await s.get('logistics', 'fedex')
    expect(fetched!.enabled).toBe(true)
    expect(fetched!.config.clientId).toBe('new')
  })

  it('keeps colliding slugs in distinct verticals isolated', async () => {
    const s = await open()
    await s.upsert('accounting', 'bexio', { enabled: true, config: { clientId: 'acc' } })
    await s.upsert('crm', 'bexio', { enabled: false, config: { clientId: 'crm' } })

    const acc = await s.get('accounting', 'bexio')
    const crm = await s.get('crm', 'bexio')
    expect(acc!.enabled).toBe(true)
    expect(acc!.config.clientId).toBe('acc')
    expect(crm!.enabled).toBe(false)
    expect(crm!.config.clientId).toBe('crm')
  })

  it('lists all settings across verticals', async () => {
    const s = await open()
    await s.upsert('accounting', 'a', { enabled: true })
    await s.upsert('crm', 'b', { enabled: false })
    await s.upsert('logistics', 'c', { enabled: true })
    const all = await s.list()
    expect(all).toHaveLength(3)
    expect(all.map((r) => `${r.vertical}:${r.slug}`).sort()).toEqual([
      'accounting:a',
      'crm:b',
      'logistics:c',
    ])
  })

  it('list filters by vertical when given', async () => {
    const s = await open()
    await s.upsert('accounting', 'a', { enabled: true })
    await s.upsert('crm', 'b', { enabled: true })
    const acc = await s.list('accounting')
    expect(acc).toHaveLength(1)
    expect(acc[0].slug).toBe('a')
  })

  it('listEnabled returns only enabled', async () => {
    const s = await open()
    await s.upsert('accounting', 'a', { enabled: true })
    await s.upsert('accounting', 'b', { enabled: false })
    await s.upsert('accounting', 'c', { enabled: true })
    const enabled = await s.listEnabled('accounting')
    expect(enabled).toHaveLength(2)
    expect(enabled.map((r) => r.slug)).toEqual(['a', 'c'])
  })

  it('returns undefined for missing (vertical, slug) pair', async () => {
    const s = await open()
    expect(await s.get('accounting', 'nonexistent')).toBeUndefined()
  })

  it('deletes a settings row', async () => {
    const s = await open()
    await s.upsert('accounting', 'fortnox', { enabled: true, config: { x: 1 } })
    expect(await s.delete('accounting', 'fortnox')).toBe(true)
    expect(await s.get('accounting', 'fortnox')).toBeUndefined()
  })

  it('delete returns false for missing pair', async () => {
    const s = await open()
    expect(await s.delete('accounting', 'nope')).toBe(false)
  })

  it('config is encrypted at rest', async () => {
    const s = await open()
    await s.upsert('crm', 'secret-adapter', {
      enabled: true,
      config: { apiKey: 'super-secret-value' },
    })
    // Close the handle so the WAL is flushed before we reopen the file raw.
    await handle.close()

    const Database = require('better-sqlite3')
    const raw = new Database(dbPath)
    const row = raw
      .prepare('SELECT encrypted_config FROM adapter_settings WHERE vertical = ? AND slug = ?')
      .get('crm', 'secret-adapter')
    expect(row.encrypted_config).not.toContain('super-secret-value')
    expect(row.encrypted_config).not.toContain('apiKey')
    raw.close()

    // Reopen so afterEach's handle.close() has a live handle to close.
    handle = await openDb({ sqlitePath: dbPath })
  })

  it('handles empty config object', async () => {
    const s = await open()
    await s.upsert('accounting', 'empty', { enabled: false })
    const fetched = await s.get('accounting', 'empty')
    expect(fetched!.config).toEqual({})
  })
})
