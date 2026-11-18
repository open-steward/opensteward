import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { SandboxStore, SandboxQuotaError } from '../../src/sandbox/sandbox-store'

// SQLite always; Postgres too when TEST_DATABASE_URL is set, because the
// migration ships separate DDL per dialect and the count/delete helpers depend
// on driver return shapes that differ between them.
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env['TEST_DATABASE_URL']) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env['TEST_DATABASE_URL'] }),
  })
}

describe.each(BACKENDS)('SandboxStore [$name]', (backend) => {
  let handle: DbHandle
  let store: SandboxStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await SandboxStore.create(handle)
  })

  afterEach(async () => {
    // Stores are borrowers — close the shared handle, not the store.
    await handle?.close()
  })

  it('round-trips a record', async () => {
    await store.upsert('acme', 'accounting', 'invoices', 'inv_1', { id: 'inv_1', total: 100 })
    expect(await store.get('acme', 'accounting', 'invoices', 'inv_1')).toEqual({
      id: 'inv_1',
      total: 100,
    })
  })

  it('returns null for a miss rather than throwing', async () => {
    expect(await store.get('acme', 'accounting', 'invoices', 'nope')).toBeNull()
  })

  it('updates in place on a second upsert', async () => {
    await store.upsert('acme', 'accounting', 'invoices', 'inv_1', { total: 100 })
    await store.upsert('acme', 'accounting', 'invoices', 'inv_1', { total: 200 })
    expect(await store.get('acme', 'accounting', 'invoices', 'inv_1')).toEqual({ total: 200 })
    expect(await store.countFor('acme', 'accounting')).toBe(1)
  })

  it('isolates tenants', async () => {
    await store.upsert('acme', 'accounting', 'invoices', 'inv_1', { who: 'acme' })
    await store.upsert('globex', 'accounting', 'invoices', 'inv_1', { who: 'globex' })
    expect(await store.get('acme', 'accounting', 'invoices', 'inv_1')).toEqual({ who: 'acme' })
    expect(await store.get('globex', 'accounting', 'invoices', 'inv_1')).toEqual({ who: 'globex' })
  })

  it('isolates verticals and resource types under one tenant', async () => {
    await store.upsert('acme', 'accounting', 'invoices', 'x', { a: 1 })
    await store.upsert('acme', 'crm', 'invoices', 'x', { b: 2 })
    await store.upsert('acme', 'accounting', 'bills', 'x', { c: 3 })
    expect(await store.get('acme', 'accounting', 'invoices', 'x')).toEqual({ a: 1 })
    expect(await store.get('acme', 'crm', 'invoices', 'x')).toEqual({ b: 2 })
    expect(await store.get('acme', 'accounting', 'bills', 'x')).toEqual({ c: 3 })
  })

  it('lists oldest first so pagination is stable', async () => {
    await store.upsertMany('acme', 'accounting', 'invoices', [
      { id: 'a', data: { n: 1 } },
      { id: 'b', data: { n: 2 } },
      { id: 'c', data: { n: 3 } },
    ])
    const rows = await store.list('acme', 'accounting', 'invoices')
    expect(rows.map((r) => r.resourceId)).toEqual(['a', 'b', 'c'])
  })

  it('narrows by parent, and ignores the column when no parent is given', async () => {
    await store.upsert('acme', 'docsign', 'signers', 's1', { n: 1 }, 'env_1')
    await store.upsert('acme', 'docsign', 'signers', 's2', { n: 2 }, 'env_2')
    expect(
      (await store.list('acme', 'docsign', 'signers', 'env_1')).map((r) => r.resourceId),
    ).toEqual(['s1'])
    expect((await store.list('acme', 'docsign', 'signers')).length).toBe(2)
  })

  it('matches parent IS NULL rather than = NULL', async () => {
    // `= NULL` is never true on either dialect; the null case needs IS NULL.
    await store.upsert('acme', 'accounting', 'invoices', 'top', { n: 1 }, null)
    await store.upsert('acme', 'accounting', 'invoices', 'child', { n: 2 }, 'p1')
    expect(
      (await store.list('acme', 'accounting', 'invoices', null)).map((r) => r.resourceId),
    ).toEqual(['top'])
  })

  it('deletes, and reports whether anything went', async () => {
    await store.upsert('acme', 'accounting', 'invoices', 'inv_1', { n: 1 })
    expect(await store.delete('acme', 'accounting', 'invoices', 'inv_1')).toBe(true)
    expect(await store.delete('acme', 'accounting', 'invoices', 'inv_1')).toBe(false)
    expect(await store.get('acme', 'accounting', 'invoices', 'inv_1')).toBeNull()
  })

  it('counts per (tenant, vertical)', async () => {
    await store.upsert('acme', 'accounting', 'invoices', 'a', {})
    await store.upsert('acme', 'accounting', 'bills', 'b', {})
    await store.upsert('acme', 'crm', 'contacts', 'c', {})
    await store.upsert('globex', 'accounting', 'invoices', 'd', {})
    expect(await store.countFor('acme', 'accounting')).toBe(2)
    expect(await store.countFor('acme', 'crm')).toBe(1)
    expect(await store.countFor('globex', 'accounting')).toBe(1)
  })

  it('resets one tenant without touching another', async () => {
    await store.upsert('acme', 'accounting', 'invoices', 'a', {})
    await store.upsert('acme', 'crm', 'contacts', 'b', {})
    await store.upsert('globex', 'accounting', 'invoices', 'c', {})
    expect(await store.resetTenant('acme')).toBe(2)
    expect(await store.countFor('acme', 'accounting')).toBe(0)
    expect(await store.countFor('globex', 'accounting')).toBe(1)
  })

  it('resets one vertical without touching the tenant’s others', async () => {
    await store.upsert('acme', 'accounting', 'invoices', 'a', {})
    await store.upsert('acme', 'crm', 'contacts', 'b', {})
    expect(await store.resetVertical('acme', 'accounting')).toBe(1)
    expect(await store.countFor('acme', 'accounting')).toBe(0)
    expect(await store.countFor('acme', 'crm')).toBe(1)
  })
})

describe('SandboxStore quota', () => {
  let handle: DbHandle
  let store: SandboxStore

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    store = await SandboxStore.create(handle, { quota: 3 })
  })

  afterEach(async () => {
    await handle?.close()
  })

  it('refuses an insert past the cap — a test key must not be a disk-fill primitive', async () => {
    for (const id of ['a', 'b', 'c']) await store.upsert('acme', 'accounting', 'invoices', id, {})
    await expect(store.upsert('acme', 'accounting', 'invoices', 'd', {})).rejects.toBeInstanceOf(
      SandboxQuotaError,
    )
  })

  it('still allows updating an existing record at the cap', async () => {
    // Refusing this would strand a sandbox with no way to correct a record.
    for (const id of ['a', 'b', 'c']) await store.upsert('acme', 'accounting', 'invoices', id, {})
    await expect(
      store.upsert('acme', 'accounting', 'invoices', 'a', { v: 2 }),
    ).resolves.toBeUndefined()
    expect(await store.get('acme', 'accounting', 'invoices', 'a')).toEqual({ v: 2 })
  })

  it('applies the cap per vertical, not globally', async () => {
    for (const id of ['a', 'b', 'c']) await store.upsert('acme', 'accounting', 'invoices', id, {})
    await expect(store.upsert('acme', 'crm', 'contacts', 'x', {})).resolves.toBeUndefined()
  })

  it('rejects a batch that would cross the cap, without partially applying it', async () => {
    await store.upsert('acme', 'accounting', 'invoices', 'a', {})
    await expect(
      store.upsertMany('acme', 'accounting', 'invoices', [
        { id: 'b', data: {} },
        { id: 'c', data: {} },
        { id: 'd', data: {} },
      ]),
    ).rejects.toBeInstanceOf(SandboxQuotaError)
    expect(await store.countFor('acme', 'accounting')).toBe(1)
  })

  it('frees room again after a reset', async () => {
    for (const id of ['a', 'b', 'c']) await store.upsert('acme', 'accounting', 'invoices', id, {})
    await store.resetTenant('acme')
    await expect(store.upsert('acme', 'accounting', 'invoices', 'd', {})).resolves.toBeUndefined()
  })
})
