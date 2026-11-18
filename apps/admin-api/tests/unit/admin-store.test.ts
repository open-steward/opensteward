import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'

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

describe.each(BACKENDS)('AdminStore [$name]', (backend) => {
  let handle: DbHandle
  let store: AdminStore

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    store = await AdminStore.create(handle)
  })

  afterEach(async () => {
    await store?.close()
  })

  // ── Users ───────────────────────────────────────────────

  it('creates a user and retrieves by id', async () => {
    const s = store
    const user = await s.createUser('alice', 'hash-abc', 'admin')
    expect(user.username).toBe('alice')
    expect(user.role).toBe('admin')
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/)

    const byId = await s.getUserById(user.id)
    expect(byId).not.toBeNull()
    expect(byId!.username).toBe('alice')
  })

  it('retrieves user by username', async () => {
    const s = store
    await s.createUser('bob', 'hash-bob', 'operator')
    const user = await s.getUserByUsername('bob')
    expect(user).not.toBeNull()
    expect(user!.role).toBe('operator')
  })

  it('returns null for non-existent user', async () => {
    const s = store
    expect(await s.getUserById('no-such-id')).toBeNull()
    expect(await s.getUserByUsername('nobody')).toBeNull()
  })

  it('lists users in creation order', async () => {
    const s = store
    await s.createUser('first', 'h1', 'admin')
    await s.createUser('second', 'h2', 'viewer')
    const users = await s.listUsers()
    expect(users).toHaveLength(2)
    expect(users[0].username).toBe('first')
    expect(users[1].username).toBe('second')
  })

  it('deletes a user', async () => {
    const s = store
    const user = await s.createUser('deleteme', 'h', 'viewer')
    expect(await s.deleteUser(user.id)).toBe(true)
    expect(await s.getUserById(user.id)).toBeNull()
  })

  it('deleteUser returns false for non-existent id', async () => {
    const s = store
    expect(await s.deleteUser('fake-id')).toBe(false)
  })

  it('hasUsers returns true after creating a user', async () => {
    const s = store
    expect(await s.hasUsers()).toBe(false)
    await s.createUser('x', 'h', 'admin')
    expect(await s.hasUsers()).toBe(true)
  })

  it('throws on duplicate username', async () => {
    const s = store
    await s.createUser('dup', 'h1', 'admin')
    await expect(s.createUser('dup', 'h2', 'viewer')).rejects.toThrow()
  })

  // ── Audit ───────────────────────────────────────────────

  // Fresh-store boot now writes a `schema.migrate` audit row per
  // applied migration (so operators can see in /audit when their
  // upgrade applied a schema change). Tests that count user-written
  // audit rows filter that prefix out.
  function userAudit(entries: { action: string }[]) {
    return entries.filter((e) => e.action !== 'schema.migrate')
  }

  it('writes and lists audit entries', async () => {
    const s = store
    await s.writeAudit('user-1', 'connection.create', 'accounting', 'conn-1')
    await s.writeAudit('user-1', 'connection.delete', 'logistics', 'conn-2')
    const entries = userAudit(await s.listAudit())
    expect(entries).toHaveLength(2)
    const actions = entries.map((e) => e.action)
    expect(actions).toContain('connection.create')
    expect(actions).toContain('connection.delete')
  })

  it('audit pagination works', async () => {
    const s = store
    // Cycle through registered no-payload actions so the typed registry
    // accepts every row — pagination is action-agnostic.
    const ACTIONS = [
      'user.login',
      'user.delete',
      'connection.delete',
      'api_key.revoke',
      'end_user.delete',
    ] as const
    for (const action of ACTIONS) {
      await s.writeAudit('u', action)
    }
    // Add 1 to each expected page size to account for the auto-written
    // schema.migrate row from boot. The test still verifies pagination
    // boundaries: 6 total → pages of 2 give [2, 2, 2].
    const page1 = await s.listAudit(2, 0)
    expect(page1).toHaveLength(2)
    const page2 = await s.listAudit(2, 2)
    expect(page2).toHaveLength(2)
    const page3 = await s.listAudit(2, 4)
    expect(page3).toHaveLength(2)
  })

  it('audit detail is stored as JSON', async () => {
    const s = store
    await s.writeAudit('u', 'user.create', undefined, undefined, { username: 'bob', role: 'viewer' })
    const entries = userAudit(await s.listAudit())
    expect(entries[0].detail).toBe('{"username":"bob","role":"viewer"}')
  })

  it('filters audit entries by action and user', async () => {
    const s = store
    await s.writeAudit('alice', 'user.login')
    await s.writeAudit('bob', 'user.login')
    await s.writeAudit('alice', 'user.delete')

    expect(await s.listAudit(100, 0, { action: 'user.login' })).toHaveLength(2)
    expect(await s.countAudit({ action: 'user.login' })).toBe(2)
    expect((await s.listAudit(100, 0, { userId: 'alice' })).every((e) => e.user_id === 'alice')).toBe(true)
    expect(await s.countAudit({ action: 'user.login', userId: 'bob' })).toBe(1)
  })

  it('filters audit entries by created_at range', async () => {
    const s = store
    await s.writeAudit('u', 'user.login')
    const mid = Date.now() + 1
    // Everything written so far is < mid; a far-future lower bound matches none.
    expect(await s.countAudit({ to: mid })).toBeGreaterThan(0)
    expect(await s.countAudit({ from: Date.now() + 60_000 })).toBe(0)
  })

  it('iterateAudit streams all matching rows newest-first', async () => {
    const s = store
    await s.writeAudit('u', 'user.login')
    await s.writeAudit('u', 'user.delete')
    const rows = await s.iterateAudit({ userId: 'u' })
    expect(rows.map((r) => r.action)).toEqual(['user.delete', 'user.login'])
  })

  it('pruneAuditLogBefore deletes only older rows', async () => {
    const s = store
    await s.writeAudit('u', 'user.login')
    const before = await s.countAudit()
    expect(before).toBeGreaterThan(0)
    // Cut off in the future → everything (including the boot schema.migrate
    // rows) is older and removed.
    const removed = await s.pruneAuditLogBefore(Date.now() + 60_000)
    expect(removed).toBe(before)
    expect(await s.countAudit()).toBe(0)
    // A past cutoff removes nothing newly written.
    await s.writeAudit('u', 'user.login')
    expect(await s.pruneAuditLogBefore(Date.now() - 60_000)).toBe(0)
  })

  it('writes a schema.migrate audit row on fresh boot', async () => {
    const s = store
    const migrate = (await s.listAudit()).filter((e) => e.action === 'schema.migrate')
    expect(migrate.length).toBeGreaterThan(0)
    expect(migrate[0].target_id).toBe('admin_store')
    expect(migrate[0].user_id).toBe('system')
    // One row per applied migration version. The schema is a single squashed
    // v1 baseline, so a fresh boot applies exactly version 1.
    const versions = migrate.map((e) => JSON.parse(e.detail!).version)
    expect(versions).toContain(1)
  })

  // ── Notifications ───────────────────────────────────────

  it('creates and lists unacknowledged notifications', async () => {
    const s = store
    await s.createNotification('alert', 'Something happened')
    await s.createNotification('info', 'FYI', 'accounting', 'conn-1', 'fortnox')
    const notifs = await s.listUnacknowledged()
    expect(notifs).toHaveLength(2)
    const withVertical = notifs.find((n) => n.vertical === 'accounting')
    expect(withVertical).toBeDefined()
    expect(withVertical!.connection_id).toBe('conn-1')
    expect(withVertical!.platform).toBe('fortnox')
  })

  it('acknowledgeNotification returns false for non-existent id', async () => {
    const s = store
    expect(await s.acknowledgeNotification(9999)).toBe(false)
  })

  it('acknowledgeAll clears all unacknowledged', async () => {
    const s = store
    await s.createNotification('a', 'msg1')
    await s.createNotification('b', 'msg2')
    expect(await s.listUnacknowledged()).toHaveLength(2)
    await s.acknowledgeAll()
    expect(await s.listUnacknowledged()).toHaveLength(0)
  })

  it('listUnacknowledged respects limit', async () => {
    const s = store
    for (let i = 0; i < 5; i++) {
      await s.createNotification('t', `msg-${i}`)
    }
    expect(await s.listUnacknowledged(3)).toHaveLength(3)
  })

  it('countUnacknowledged excludes the given types', async () => {
    const s = store
    await s.createNotification('credential_expiring', 'soon', 'accounting', 'conn-1', 'fortnox')
    await s.createNotification('credential_expired', 'gone', 'accounting', 'conn-2', 'fortnox')
    await s.createNotification('vertical_down', 'down', 'crm')
    expect(await s.countUnacknowledged()).toBe(3)
    expect(await s.countUnacknowledged({ excludeTypes: ['credential_expiring'] })).toBe(2)
    await s.acknowledgeAll()
    expect(await s.countUnacknowledged()).toBe(0)
  })

  it('acknowledgeNotificationsMatching acknowledges only the matching unacknowledged rows', async () => {
    const s = store
    await s.createNotification('credential_expired', 'a', 'accounting', 'conn-1', 'fortnox')
    await s.createNotification('credential_expired', 'b', 'accounting', 'conn-2', 'fortnox')
    await s.createNotification('platform_credentials_invalid', 'c', 'accounting', undefined, 'xero')
    await s.createNotification('platform_credentials_invalid', 'd', 'crm', undefined, 'xero')

    expect(
      await s.acknowledgeNotificationsMatching({ type: 'credential_expired', connectionId: 'conn-1' }),
    ).toBe(1)
    expect(
      await s.acknowledgeNotificationsMatching({
        type: 'platform_credentials_invalid',
        vertical: 'accounting',
        platform: 'xero',
      }),
    ).toBe(1)
    // Already acknowledged — nothing left to match.
    expect(
      await s.acknowledgeNotificationsMatching({ type: 'credential_expired', connectionId: 'conn-1' }),
    ).toBe(0)
    const left = await s.listUnacknowledged()
    expect(left.map((n) => n.message).sort()).toEqual(['b', 'd'])
  })

  // ── Dashboard task dismissals ───────────────────────────

  it('dismissDashboardTasks upserts rows the list reads back with the caller and a timestamp', async () => {
    const s = store
    const before = Date.now()
    await s.dismissDashboardTasks(
      [
        { key: 'conn:expired:conn-1', fingerprint: '2026-09-01T00:00:00.000Z' },
        { key: 'sync:failed:job-9', fingerprint: '' },
      ],
      'user-1',
    )
    const rows = await s.listDashboardDismissals()
    expect(rows.map((r) => r.key).sort()).toEqual(['conn:expired:conn-1', 'sync:failed:job-9'])
    const conn = rows.find((r) => r.key === 'conn:expired:conn-1')!
    expect(conn.fingerprint).toBe('2026-09-01T00:00:00.000Z')
    expect(conn.by).toBe('user-1')
    expect(conn.createdAt).toBeGreaterThanOrEqual(before)

    // Re-dismissing the same key replaces the fingerprint and the author.
    await s.dismissDashboardTasks(
      [{ key: 'conn:expired:conn-1', fingerprint: '2026-10-01T00:00:00.000Z' }],
      'user-2',
    )
    const again = await s.listDashboardDismissals()
    expect(again).toHaveLength(2)
    const replaced = again.find((r) => r.key === 'conn:expired:conn-1')!
    expect(replaced.fingerprint).toBe('2026-10-01T00:00:00.000Z')
    expect(replaced.by).toBe('user-2')
  })

  it('dismissals live in the settings table under the dashboard.dismissed: prefix and leave other settings alone', async () => {
    const s = store
    await s
      .getHandle()
      .kysely.insertInto('settings')
      .values({ key: 'unrelated.flag', value: 'not-json' })
      .execute()
    await s.dismissDashboardTasks([{ key: 'conn:expired:c-1', fingerprint: '' }], 'user-1')
    expect(await s.listDashboardDismissals()).toEqual([
      expect.objectContaining({ key: 'conn:expired:c-1', fingerprint: '', by: 'user-1' }),
    ])
    const raw = await s
      .getHandle()
      .kysely.selectFrom('settings')
      .select(['key', 'value'])
      .where('key', '=', 'dashboard.dismissed:conn:expired:c-1')
      .executeTakeFirst()
    expect(JSON.parse(String(raw!.value))).toEqual({
      fp: '',
      by: 'user-1',
      at: expect.any(Number),
    })
    expect(await s.pruneDashboardDismissals(Date.now() + 1)).toBe(1)
    const other = await s
      .getHandle()
      .kysely.selectFrom('settings')
      .select('key')
      .where('key', '=', 'unrelated.flag')
      .executeTakeFirst()
    expect(other).toBeDefined()
  })

  it('undismissDashboardTask removes one key and reports whether it existed', async () => {
    const s = store
    await s.dismissDashboardTasks(
      [
        { key: 'conn:expired:conn-1', fingerprint: 'x' },
        { key: 'conn:expired:conn-2', fingerprint: 'y' },
      ],
      'user-1',
    )
    expect(await s.undismissDashboardTask('conn:expired:conn-1')).toBe(true)
    expect(await s.undismissDashboardTask('conn:expired:conn-1')).toBe(false)
    expect((await s.listDashboardDismissals()).map((r) => r.key)).toEqual(['conn:expired:conn-2'])
  })

  it('pruneDashboardDismissals deletes only rows dismissed before the cutoff', async () => {
    const s = store
    await s.dismissDashboardTasks([{ key: 'conn:expired:old', fingerprint: 'x' }], 'user-1')
    const cutoff = Date.now() + 1
    // A row written after the cutoff must survive.
    await new Promise((r) => setTimeout(r, 2))
    await s.dismissDashboardTasks([{ key: 'conn:expired:new', fingerprint: 'y' }], 'user-1')
    expect(await s.pruneDashboardDismissals(cutoff)).toBe(1)
    expect((await s.listDashboardDismissals()).map((r) => r.key)).toEqual(['conn:expired:new'])
    expect(await s.pruneDashboardDismissals(cutoff)).toBe(0)
  })

  it('pruneDashboardDismissals never prunes wizard skips and keeps the keys the caller says are live', async () => {
    const s = store
    await s.dismissDashboardTasks(
      [
        { key: 'wizard:api-keys', fingerprint: '' },
        { key: 'conn:expired:live', fingerprint: 'x' },
        { key: 'platform:creds:accounting/xero', fingerprint: 'y' },
        { key: 'conn:expired:gone', fingerprint: 'z' },
      ],
      'user-1',
    )
    const cutoff = Date.now() + 1
    expect(
      await s.pruneDashboardDismissals(cutoff, {
        keep: new Set(['conn:expired:live', 'platform:creds:accounting/xero']),
      }),
    ).toBe(1)
    expect((await s.listDashboardDismissals()).map((r) => r.key)).toEqual([
      'conn:expired:live',
      'platform:creds:accounting/xero',
      'wizard:api-keys',
    ])
    // With nothing live, only the wizard skip survives.
    expect(await s.pruneDashboardDismissals(cutoff)).toBe(2)
    expect((await s.listDashboardDismissals()).map((r) => r.key)).toEqual(['wizard:api-keys'])
  })

  // ── Company info ──────────────────────────────────────────

  it('getCompanyInfo returns null when nothing has been saved', async () => {
    const s = store
    expect(await s.getCompanyInfo()).toBeNull()
  })

  it('upsertCompanyInfo inserts a new record and returns it', async () => {
    const s = store
    const result = await s.upsertCompanyInfo(
      { name: 'Acme', website: 'https://acme.example.com' },
      'user-123',
    )
    expect(result.name).toBe('Acme')
    expect(result.website).toBe('https://acme.example.com')
    expect(result.updatedBy).toBe('user-123')
    expect(typeof result.updatedAt).toBe('number')
  })

  it('upsertCompanyInfo round-trips the branding fields', async () => {
    const s = store
    const result = await s.upsertCompanyInfo(
      {
        secondaryColor: '#1B4FB0',
        fontFamily: 'IBM Plex Sans',
        fontDataUrl: 'data:font/woff2;base64,d09GMgABAAAA',
        fontUrl: 'https://fonts.googleapis.com/css2?family=Roboto',
        faviconDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      },
      'user-123',
    )
    expect(result.secondaryColor).toBe('#1B4FB0')
    expect(result.fontFamily).toBe('IBM Plex Sans')
    expect(result.fontDataUrl).toBe('data:font/woff2;base64,d09GMgABAAAA')
    expect(result.fontUrl).toBe('https://fonts.googleapis.com/css2?family=Roboto')
    expect(result.faviconDataUrl).toBe('data:image/png;base64,iVBORw0KGgo=')
    // Survives a reopen (column persistence / migration sanity).
    expect((await s.getCompanyInfo())?.secondaryColor).toBe('#1B4FB0')
  })

  it('upsertCompanyInfo round-trips the hideAttribution flag', async () => {
    const s = store
    // Unset by default.
    expect((await s.upsertCompanyInfo({ name: 'Acme' }, 'u1')).hideAttribution).toBeNull()
    // Turned on, then back off — and the value persists across reads.
    expect((await s.upsertCompanyInfo({ hideAttribution: true }, 'u2')).hideAttribution).toBe(true)
    expect((await s.getCompanyInfo())?.hideAttribution).toBe(true)
    expect((await s.upsertCompanyInfo({ hideAttribution: false }, 'u3')).hideAttribution).toBe(false)
    // Unrelated patches leave it untouched.
    expect((await s.upsertCompanyInfo({ name: 'Acme 2' }, 'u4')).hideAttribution).toBe(false)
  })

  it('upsertCompanyInfo merges patches without losing previous values', async () => {
    const s = store
    await s.upsertCompanyInfo({ name: 'Acme', website: 'https://acme.example.com' }, 'u1')
    const second = await s.upsertCompanyInfo({ supportEmail: 'support@acme.example.com' }, 'u2')
    expect(second.name).toBe('Acme')
    expect(second.website).toBe('https://acme.example.com')
    expect(second.supportEmail).toBe('support@acme.example.com')
    expect(second.updatedBy).toBe('u2')
  })

  it('upsertCompanyInfo treats empty string as a clear', async () => {
    const s = store
    await s.upsertCompanyInfo({ name: 'Acme', website: 'https://acme.example.com' }, 'u1')
    const second = await s.upsertCompanyInfo({ website: '' }, 'u2')
    expect(second.name).toBe('Acme')
    expect(second.website).toBeNull()
  })

  it('upsertCompanyInfo treats explicit null as a clear', async () => {
    const s = store
    await s.upsertCompanyInfo({ name: 'Acme', country: 'SE' }, 'u1')
    const second = await s.upsertCompanyInfo({ country: null }, 'u2')
    expect(second.name).toBe('Acme')
    expect(second.country).toBeNull()
  })

  it('upsertCompanyInfo always uses id = 1 (single-row guard)', async () => {
    const s = store
    await s.upsertCompanyInfo({ name: 'A' }, 'u1')
    await s.upsertCompanyInfo({ name: 'B' }, 'u2')
    await s.upsertCompanyInfo({ name: 'C' }, 'u3')
    const row = (await s.getCompanyInfo())!
    expect(row.name).toBe('C')
    // Only one row exists
    const countRow = await s
      .getHandle()
      .kysely.selectFrom('company_info')
      .select((eb) => eb.fn.countAll().as('n'))
      .executeTakeFirstOrThrow()
    expect(Number((countRow as { n: number | bigint | string }).n)).toBe(1)
  })

  it('upsertCompanyInfo persists the full field set', async () => {
    const s = store
    const full = await s.upsertCompanyInfo(
      {
        name: 'Acme Inc.',
        legalName: 'Acme Holdings B.V.',
        description: 'A description',
        website: 'https://acme.example.com',
        logoDataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
        primaryColor: '#2D6ADB',
        supportEmail: 'support@acme.example.com',
        privacyPolicyUrl: 'https://acme.example.com/privacy',
        termsOfServiceUrl: 'https://acme.example.com/terms',
        addressLine1: '1 Main St',
        addressLine2: 'Suite 200',
        city: 'Stockholm',
        region: 'Stockholms län',
        postalCode: '11122',
        country: 'SE',
        baseUrl: 'https://oi.acme.example.com',
      },
      'u1',
    )
    expect(full.name).toBe('Acme Inc.')
    expect(full.legalName).toBe('Acme Holdings B.V.')
    expect(full.logoDataUrl).toContain('PHN2Zy8+')
    expect(full.primaryColor).toBe('#2D6ADB')
    expect(full.country).toBe('SE')
    expect(full.baseUrl).toBe('https://oi.acme.example.com')
  })

  // ── Scope groups ────────────────────────────────────────

  it('createScopeGroup persists scopes and round-trips', async () => {
    const s = store
    const g = await s.createScopeGroup({
      vertical: 'accounting',
      platform: 'dynamics365bc',
      name: 'Read-only bundle',
      scopes: ['read:invoices', 'read:contacts'],
    })
    expect(g.id).toBeGreaterThan(0)
    expect(g.vertical).toBe('accounting')
    expect(g.scopes).toEqual(['read:invoices', 'read:contacts'])
    const fetched = await s.getScopeGroup(g.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.scopes).toEqual(['read:invoices', 'read:contacts'])
  })

  it('listScopeGroups filters by vertical and platform', async () => {
    const s = store
    await s.createScopeGroup({ vertical: 'accounting', platform: 'xero', name: 'A', scopes: ['x'] })
    await s.createScopeGroup({ vertical: 'accounting', platform: 'quickbooks', name: 'B', scopes: ['y'] })
    await s.createScopeGroup({ vertical: 'crm', platform: 'hubspot', name: 'C', scopes: ['z'] })
    expect(await s.listScopeGroups()).toHaveLength(3)
    expect(await s.listScopeGroups({ vertical: 'accounting' })).toHaveLength(2)
    expect(await s.listScopeGroups({ vertical: 'accounting', platform: 'xero' })).toHaveLength(1)
    expect(await s.listScopeGroups({ platform: 'hubspot' })).toHaveLength(1)
  })

  it('createScopeGroup rejects duplicate (vertical, platform, name)', async () => {
    const s = store
    await s.createScopeGroup({ vertical: 'accounting', platform: 'xero', name: 'Dup', scopes: ['a'] })
    await expect(
      s.createScopeGroup({ vertical: 'accounting', platform: 'xero', name: 'Dup', scopes: ['b'] }),
    ).rejects.toThrow(/unique/i)
  })

  it('updateScopeGroup mutates name and scopes; deleteScopeGroup removes', async () => {
    const s = store
    const g = await s.createScopeGroup({
      vertical: 'crm',
      platform: 'hubspot',
      name: 'Initial',
      scopes: ['contacts.read'],
    })
    const updated = await s.updateScopeGroup(g.id, { name: 'Renamed', scopes: ['contacts.write', 'deals.read'] })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('Renamed')
    expect(updated!.scopes).toEqual(['contacts.write', 'deals.read'])
    expect(await s.deleteScopeGroup(g.id)).toBe(true)
    expect(await s.getScopeGroup(g.id)).toBeNull()
  })

  it('updateScopeGroup returns null for unknown id', async () => {
    const s = store
    expect(await s.updateScopeGroup(9999, { name: 'x' })).toBeNull()
  })

  // ── Connect link templates ──────────────────────────────

  it('createConnectLinkTemplate persists every field and round-trips', async () => {
    const s = store
    const t = await s.createConnectLinkTemplate({
      tenantId: 'default',
      name: 'Read-only Shopify',
      description: '24h, one-time pull',
      linkMode: 'pinned',
      allowedVerticals: ['ecommerce'],
      allowedPlatforms: [{ vertical: 'ecommerce', slug: 'shopify' }],
      scopeGroupId: 42,
      expiryDays: 1,
      oneTimeOnly: true,
      redirectUrl: 'https://example.com/done',
      createdBy: 'user-1',
    })
    expect(t.id).toBeGreaterThan(0)
    expect(t.linkMode).toBe('pinned')
    expect(t.allowedPlatforms).toEqual([{ vertical: 'ecommerce', slug: 'shopify' }])
    expect(t.oneTimeOnly).toBe(true)
    expect(t.expiryDays).toBe(1)
    const fetched = await s.getConnectLinkTemplate(t.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.scopeGroupId).toBe(42)
    expect(fetched!.redirectUrl).toBe('https://example.com/done')
  })

  it('listConnectLinkTemplates filters by tenantId', async () => {
    const s = store
    await s.createConnectLinkTemplate({ tenantId: 'a', name: 'A1', linkMode: 'pinned' })
    await s.createConnectLinkTemplate({ tenantId: 'a', name: 'A2', linkMode: 'self-register' })
    await s.createConnectLinkTemplate({ tenantId: 'b', name: 'B1', linkMode: 'customer-picks-adapter' })
    expect(await s.listConnectLinkTemplates()).toHaveLength(3)
    expect(await s.listConnectLinkTemplates({ tenantId: 'a' })).toHaveLength(2)
    expect(await s.listConnectLinkTemplates({ tenantId: 'b' })).toHaveLength(1)
  })

  it('createConnectLinkTemplate rejects duplicate (tenant, name)', async () => {
    const s = store
    await s.createConnectLinkTemplate({ tenantId: 'a', name: 'Dup', linkMode: 'pinned' })
    await expect(
      s.createConnectLinkTemplate({ tenantId: 'a', name: 'Dup', linkMode: 'self-register' }),
    ).rejects.toThrow(/unique/i)
  })

  it('updateConnectLinkTemplate mutates fields; deleteConnectLinkTemplate removes', async () => {
    const s = store
    const t = await s.createConnectLinkTemplate({ tenantId: 'a', name: 'Init', linkMode: 'pinned' })
    const updated = await s.updateConnectLinkTemplate(t.id, {
      name: 'Renamed',
      linkMode: 'customer-picks-adapter',
      allowedVerticals: ['accounting'],
      expiryDays: 30,
      oneTimeOnly: true,
    })
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('Renamed')
    expect(updated!.linkMode).toBe('customer-picks-adapter')
    expect(updated!.expiryDays).toBe(30)
    expect(updated!.oneTimeOnly).toBe(true)
    expect(await s.deleteConnectLinkTemplate(t.id)).toBe(true)
    expect(await s.getConnectLinkTemplate(t.id)).toBeNull()
  })

  it('clamps expiryDays to [1, 90]', async () => {
    const s = store
    const lo = await s.createConnectLinkTemplate({ tenantId: 'a', name: 'lo', linkMode: 'pinned', expiryDays: 0 })
    const hi = await s.createConnectLinkTemplate({ tenantId: 'a', name: 'hi', linkMode: 'pinned', expiryDays: 9999 })
    expect(lo.expiryDays).toBe(1)
    expect(hi.expiryDays).toBe(90)
  })

  // ── Tenants & custom domains ────────────────────────────

  it('seeds the default tenant on fresh boot (migration v4)', async () => {
    const s = store
    const ids = (await s.listTenants()).map((t) => t.id)
    expect(ids).toContain('default')
  })

  it('creates, renames and lists tenants', async () => {
    const s = store
    const t = await s.createTenant('dept-a', 'Department A')
    expect(t).toMatchObject({ id: 'dept-a', name: 'Department A' })
    expect((await s.getTenant('dept-a'))?.name).toBe('Department A')
    expect((await s.updateTenant('dept-a', 'Dept A renamed'))?.name).toBe('Dept A renamed')
    // default + dept-a, sorted by id.
    expect((await s.listTenants()).map((x) => x.id)).toEqual(['default', 'dept-a'])
  })

  it('rejects a duplicate tenant id', async () => {
    const s = store
    await s.createTenant('dept-a', 'A')
    await expect(s.createTenant('dept-a', 'A again')).rejects.toThrow()
  })

  it('attaches a domain and resolves the flat map (lowercased)', async () => {
    const s = store
    await s.createTenant('dept-a', 'A')
    const d = await s.addDomain('Dept-A.Acme.Com', 'dept-a')
    expect(d.domain).toBe('dept-a.acme.com')
    expect(await s.listDomainMap()).toContainEqual({ domain: 'dept-a.acme.com', tenantId: 'dept-a' })
    expect((await s.listDomainsForTenant('dept-a')).map((x) => x.domain)).toEqual(['dept-a.acme.com'])
  })

  it('rejects a domain for an unknown tenant (app-level FK)', async () => {
    const s = store
    await expect(s.addDomain('x.acme.com', 'ghost')).rejects.toThrow(/Unknown tenant/)
  })

  it('rejects a duplicate domain (PK conflict)', async () => {
    const s = store
    await s.createTenant('dept-a', 'A')
    await s.createTenant('dept-b', 'B')
    await s.addDomain('shared.acme.com', 'dept-a')
    await expect(s.addDomain('shared.acme.com', 'dept-b')).rejects.toThrow()
  })

  it('removes a domain', async () => {
    const s = store
    await s.createTenant('dept-a', 'A')
    await s.addDomain('x.acme.com', 'dept-a')
    expect(await s.removeDomain('X.Acme.Com')).toBe(true)
    expect(await s.listDomains()).toHaveLength(0)
    expect(await s.removeDomain('x.acme.com')).toBe(false)
  })

  it('guards tenant deletion: default, missing, and domains-attached', async () => {
    const s = store
    expect(await s.deleteTenant('default')).toEqual({ ok: false, reason: 'default' })
    expect(await s.deleteTenant('nope')).toEqual({ ok: false, reason: 'not_found' })
    await s.createTenant('dept-a', 'A')
    await s.addDomain('x.acme.com', 'dept-a')
    expect(await s.deleteTenant('dept-a')).toEqual({ ok: false, reason: 'has_domains' })
    await s.removeDomain('x.acme.com')
    expect(await s.deleteTenant('dept-a')).toEqual({ ok: true })
    expect(await s.getTenant('dept-a')).toBeNull()
  })
})
