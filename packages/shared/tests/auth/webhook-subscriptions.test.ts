import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { WebhookSubscriptionStore } from '../../src/auth/webhook-subscriptions'

const SECRET = 'test-secret-must-be-at-least-32-chars!'

// SQLite always (`:memory:` is fresh per open); Postgres when TEST_DATABASE_URL
// is set (CI service container / local docker). For Postgres each test drops the
// public schema before creating the store so the shared db stays isolated.
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('WebhookSubscriptionStore [$name]', (backend) => {
  let handle: DbHandle
  let store: WebhookSubscriptionStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await WebhookSubscriptionStore.create(handle, SECRET)
  })

  afterEach(async () => {
    await handle?.close()
  })

  it('create returns plaintext secret once and persists encrypted', async () => {
    const s = store
    const created = await s.create({
      tenantId: 't_demo',
      url: 'https://example.com/webhooks',
      events: ['customer.created'],
    })
    expect(created.secret).toMatch(/^[a-f0-9]{64}$/)
    expect(created.tenantId).toBe('t_demo')
    expect(created.url).toBe('https://example.com/webhooks')
    expect(created.events).toEqual(['customer.created'])

    const listed = await s.list('t_demo')
    expect(listed).toHaveLength(1)
    expect((listed[0] as Record<string, unknown>).secret).toBeUndefined()
  })

  it('matching honours wildcard, exact, and prefix-* events', async () => {
    const s = store
    const all = await s.create({ tenantId: 't', url: 'https://a.example/x' })
    const customers = await s.create({ tenantId: 't', url: 'https://b.example/x', events: ['customer.*'] })
    const exact = await s.create({ tenantId: 't', url: 'https://c.example/x', events: ['connect_link.consumed'] })

    expect((await s.matching('t', 'customer.created')).map((m) => m.id).sort())
      .toEqual([all.id, customers.id].sort())
    expect((await s.matching('t', 'customer.deleted')).map((m) => m.id).sort())
      .toEqual([all.id, customers.id].sort())
    expect((await s.matching('t', 'connect_link.consumed')).map((m) => m.id).sort())
      .toEqual([all.id, exact.id].sort())
    expect(await s.matching('other-tenant', 'customer.created')).toEqual([])
  })

  it('matching decrypts the per-row secret on the way out', async () => {
    const s = store
    const created = await s.create({ tenantId: 't', url: 'https://x.example/' })
    const matches = await s.matching('t', 'customer.created')
    expect(matches[0].secret).toBe(created.secret)
  })

  it('paused subscriptions are retained but excluded from matching', async () => {
    const s = store
    const c = await s.create({ tenantId: 't', url: 'https://x.example/' })
    expect((await s.matching('t', 'customer.created')).map((m) => m.id)).toContain(c.id)

    expect(await s.setPaused(c.id, true)).toBe(true)
    expect(await s.matching('t', 'customer.created')).toEqual([])
    expect((await s.list('t'))[0].paused).toBe(true)

    expect(await s.setPaused(c.id, false)).toBe(true)
    expect((await s.matching('t', 'customer.created')).map((m) => m.id)).toContain(c.id)
    expect(await s.setPaused('nope', true)).toBe(false)
  })

  it('rotateSecret replaces the signing secret and returns it once', async () => {
    const s = store
    const c = await s.create({ tenantId: 't', url: 'https://x.example/' })
    const rotated = await s.rotateSecret(c.id)
    expect(rotated).toBeTruthy()
    expect(rotated).not.toBe(c.secret)
    const matches = await s.matching('t', 'customer.created')
    expect(matches[0].secret).toBe(rotated)
    expect(await s.rotateSecret('nope')).toBeNull()
  })

  it('recordResult and delete', async () => {
    const s = store
    const c = await s.create({ tenantId: 't', url: 'https://x.example/' })
    await s.recordResult(c.id, { status: 200 })
    let after = (await s.list('t'))[0]
    expect(after.lastStatus).toBe(200)
    expect(after.lastError).toBeNull()

    await s.recordResult(c.id, { status: null, error: 'timeout' })
    after = (await s.list('t'))[0]
    expect(after.lastStatus).toBeNull()
    expect(after.lastError).toBe('timeout')

    expect(await s.delete(c.id)).toBe(true)
    expect(await s.list('t')).toEqual([])
    expect(await s.delete(c.id)).toBe(false)
  })

  describe('format and custom headers', () => {
    it('defaults format to opensteward and headers to null', async () => {
      const c = await store.create({ tenantId: 't', url: 'https://x.example/' })
      expect(c.format).toBe('opensteward')
      const listed = (await store.list('t'))[0]
      expect(listed.format).toBe('opensteward')
      expect(listed.headerNames).toEqual([])
      expect(await store.headersFor(c.id)).toBeNull()
    })

    it('round-trips headers through encryption at rest', async () => {
      const c = await store.create({
        tenantId: 't',
        url: 'https://x.example/',
        format: 'slack',
        headers: { 'X-Api-Key': 'super-secret-value' },
      })
      expect(await store.headersFor(c.id)).toEqual({ 'X-Api-Key': 'super-secret-value' })

      // The plaintext must not be readable in the column.
      const raw = (await handle.kysely
        .selectFrom('webhook_subscriptions')
        .select(['headers_encrypted'])
        .where('id', '=', c.id)
        .executeTakeFirst()) as { headers_encrypted: string }
      expect(raw.headers_encrypted).not.toContain('super-secret-value')
    })

    it('list exposes header names but never values', async () => {
      await store.create({
        tenantId: 't',
        url: 'https://x.example/',
        headers: { 'X-Api-Key': 'super-secret-value', Authorization: 'Bearer nope' },
      })
      const listed = (await store.list('t'))[0]
      expect(listed.headerNames.sort()).toEqual(['Authorization', 'X-Api-Key'])
      expect(JSON.stringify(listed)).not.toContain('super-secret-value')
      expect(JSON.stringify(listed)).not.toContain('Bearer nope')
    })

    it('matching carries the format and decrypted headers for delivery', async () => {
      await store.create({
        tenantId: 't',
        url: 'https://x.example/',
        format: 'teams',
        headers: { 'X-Api-Key': 'k' },
      })
      const [m] = await store.matching('t', 'customer.created')
      expect(m.format).toBe('teams')
      expect(m.headers).toEqual({ 'X-Api-Key': 'k' })
    })

    it('updateSettings replaces format and headers wholesale', async () => {
      const c = await store.create({
        tenantId: 't',
        url: 'https://x.example/',
        format: 'slack',
        headers: { 'X-Old': 'a', 'X-Also-Old': 'b' },
      })

      expect(await store.updateSettings(c.id, { headers: { 'X-New': 'c' } })).toBe(true)
      expect(await store.headersFor(c.id)).toEqual({ 'X-New': 'c' })
      // Format untouched when the caller does not name it.
      expect((await store.list('t'))[0].format).toBe('slack')

      expect(await store.updateSettings(c.id, { format: 'flat' })).toBe(true)
      expect((await store.list('t'))[0].format).toBe('flat')
      expect(await store.headersFor(c.id)).toEqual({ 'X-New': 'c' })

      // An empty map clears them; the column goes back to NULL.
      expect(await store.updateSettings(c.id, { headers: {} })).toBe(true)
      expect(await store.headersFor(c.id)).toBeNull()
      expect((await store.list('t'))[0].headerNames).toEqual([])
    })

    it('updateSettings reports a missing subscription rather than throwing', async () => {
      expect(await store.updateSettings('does-not-exist', { format: 'slack' })).toBe(false)
    })

    it('headersFor returns null for a subscription that no longer exists', async () => {
      expect(await store.headersFor('does-not-exist')).toBeNull()
    })

    it('rejects a format the renderer does not know', async () => {
      await expect(
        store.create({
          tenantId: 't',
          url: 'https://x.example/',
          format: 'carrier-pigeon' as never,
        }),
      ).rejects.toThrow(/format/i)
    })
  })

  describe('getWithSecret', () => {
    it('returns one subscription with its secret and decrypted headers', async () => {
      const c = await store.create({
        tenantId: 't',
        url: 'https://x.example/',
        format: 'slack',
        headers: { 'X-Api-Key': 'k' },
      })
      const got = await store.getWithSecret(c.id)
      expect(got?.secret).toBe(c.secret)
      expect(got?.format).toBe('slack')
      expect(got?.headers).toEqual({ 'X-Api-Key': 'k' })
    })

    it('returns a paused subscription too', async () => {
      // Test-sending to a paused subscription is legitimate: the operator is
      // checking configuration, not resuming delivery. matching() excludes
      // paused rows, which is why this cannot reuse it.
      const c = await store.create({ tenantId: 't', url: 'https://x.example/' })
      await store.setPaused(c.id, true)
      const got = await store.getWithSecret(c.id)
      expect(got?.id).toBe(c.id)
      expect(got?.paused).toBe(true)
    })

    it('returns null for an unknown id', async () => {
      expect(await store.getWithSecret('does-not-exist')).toBeNull()
    })
  })

  describe('label', () => {
    it('round-trips through create and list', async () => {
      const c = await store.create({
        tenantId: 't',
        url: 'https://x.example/',
        label: 'Billing service',
      })
      expect(c.label).toBe('Billing service')
      expect((await store.list('t'))[0].label).toBe('Billing service')
    })

    it('is null, never the empty string, when it is not supplied', async () => {
      // Four ways to say "no label" collapsing to one is what lets the admin
      // views have a single "Unnamed" branch and the search a single check.
      for (const label of [undefined, null, '', '   '] as const) {
        const c = await store.create({ tenantId: 'blank', url: 'https://x.example/', label })
        expect(c.label).toBeNull()
        const listed = (await store.list('blank')).find((r) => r.id === c.id)
        expect(listed?.label).toBeNull()
      }
    })

    it('is trimmed, so a pasted trailing space cannot make a search miss', async () => {
      const c = await store.create({
        tenantId: 't',
        url: 'https://x.example/',
        label: '  Billing service  ',
      })
      expect(c.label).toBe('Billing service')
    })

    it('reads back null on a row created without a label', async () => {
      // The `label` column is nullable with no default. A row created
      // without one must hydrate as `label: null` rather than as undefined,
      // which would render "undefined" into the table cell.
      const c = await store.create({ tenantId: 't', url: 'https://x.example/' })
      const listed = (await store.list('t')).find((r) => r.id === c.id)
      expect(listed).toHaveProperty('label', null)
    })

    it('can be changed without touching format or headers', async () => {
      const c = await store.create({
        tenantId: 't',
        url: 'https://x.example/',
        format: 'slack',
        headers: { 'X-Api-Key': 'k' },
        label: 'Before',
      })
      expect(await store.updateSettings(c.id, { label: 'After' })).toBe(true)
      const [row] = await store.list('t')
      expect(row.label).toBe('After')
      expect(row.format).toBe('slack')
      expect(await store.headersFor(c.id)).toEqual({ 'X-Api-Key': 'k' })
    })

    it('survives an update that only changes the format', async () => {
      // The bug this guards: a PATCH that names one field wiping another.
      const c = await store.create({
        tenantId: 't',
        url: 'https://x.example/',
        label: 'Keep me',
      })
      await store.updateSettings(c.id, { format: 'teams' })
      expect((await store.list('t'))[0].label).toBe('Keep me')
    })

    it('is cleared by an explicitly empty value, which is the only way to remove it', async () => {
      const c = await store.create({ tenantId: 't', url: 'https://x.example/', label: 'Gone soon' })
      expect(await store.updateSettings(c.id, { label: '' })).toBe(true)
      expect((await store.list('t'))[0].label).toBeNull()
      await store.updateSettings(c.id, { label: 'Back' })
      expect(await store.updateSettings(c.id, { label: null })).toBe(true)
      expect((await store.list('t'))[0].label).toBeNull()
    })

    it('travels on the delivery path too, so a log line can name the subscription', async () => {
      const c = await store.create({
        tenantId: 't',
        url: 'https://x.example/',
        label: 'Billing service',
      })
      expect((await store.matching('t', 'customer.created'))[0].label).toBe('Billing service')
      expect((await store.getWithSecret(c.id))?.label).toBe('Billing service')
    })

    it('is truncated rather than rejected at the column limit', async () => {
      const c = await store.create({
        tenantId: 't',
        url: 'https://x.example/',
        label: 'x'.repeat(500),
      })
      expect(c.label).toHaveLength(200)
    })
  })
})
