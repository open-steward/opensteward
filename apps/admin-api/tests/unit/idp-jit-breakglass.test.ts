import { describe, it, expect, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { IdentityStore, type IdentityProviderRow } from '../../src/core/db/identity-store'
import { provisionAndMap, JitDisabledError } from '../../src/core/auth/idp/jit-provisioning'
import { assertBreakGlassPreserved, BreakGlassError, localAdminIds } from '../../src/core/auth/idp/break-glass'
import { createUser } from '../../src/core/auth/users'
import { verifyPassword } from '../../src/core/auth/users'

const SECRET = 'test-store-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbb'

describe('JIT provisioning + break-glass', () => {
  let admin: AdminStore
  let store: IdentityStore

  async function open() {
    const handle = await openDb({ sqlitePath: ':memory:' })
    admin = await AdminStore.create(handle)
    store = await IdentityStore.create(handle, SECRET)
  }
  afterEach(async () => {
    await admin?.close()
  })

  function provider(p: Partial<IdentityProviderRow> = {}): Promise<IdentityProviderRow> {
    return store.createProvider({
      name: 'Okta',
      slug: 'okta',
      protocol: 'oidc',
      jitEnabled: p.jitEnabled ?? true,
      defaultRole: p.defaultRole ?? 'viewer',
      config: {},
    })
  }

  it('creates a user on first login and reuses it on the second', async () => {
    await open()
    const prov = await provider()
    const first = await provisionAndMap(admin, store, prov, {
      externalId: 'ext-1',
      email: 'a@x.com',
      displayName: 'A',
      attributes: { groups: [] },
    })
    expect(first.created).toBe(true)
    const second = await provisionAndMap(admin, store, prov, {
      externalId: 'ext-1',
      email: 'a@x.com',
      displayName: 'A',
      attributes: { groups: [] },
    })
    expect(second.created).toBe(false)
    expect(second.user.id).toBe(first.user.id)
    expect(await admin.listUsers()).toHaveLength(1)
  })

  it('JIT-created users cannot log in with a password', async () => {
    await open()
    const prov = await provider()
    const r = await provisionAndMap(admin, store, prov, {
      externalId: 'ext-2',
      email: 'b@x.com',
      displayName: null,
      attributes: {},
    })
    // No known password maps to the random hash.
    expect(await verifyPassword(admin, r.user.username, 'b@x.com')).toBeNull()
    expect(await verifyPassword(admin, r.user.username, '')).toBeNull()
  })

  it('applies role mapping and re-syncs on subsequent login', async () => {
    await open()
    const prov = await provider({ defaultRole: 'viewer' })
    await store.createRule({ providerId: prov.id, claimPath: 'groups', matchType: 'equals', matchValue: 'Admins', role: 'admin' })
    const r1 = await provisionAndMap(admin, store, prov, { externalId: 'e', email: null, displayName: null, attributes: { groups: ['Admins'] } })
    expect(r1.user.role).toBe('admin')
    const r2 = await provisionAndMap(admin, store, prov, { externalId: 'e', email: null, displayName: null, attributes: { groups: ['Sales'] } })
    expect(r2.user.role).toBe('viewer')
    expect(r2.roleChanged).toBe(true)
  })

  it('rejects unknown identities when JIT is disabled', async () => {
    await open()
    const prov = await provider({ jitEnabled: false })
    await expect(
      provisionAndMap(admin, store, prov, { externalId: 'nope', email: null, displayName: null, attributes: {} }),
    ).rejects.toBeInstanceOf(JitDisabledError)
  })

  it('only counts password-usable, unlinked admins as local admins', async () => {
    await open()
    await createUser(admin, 'root', 'SecurePass123!', 'admin')
    const prov = await provider()
    await provisionAndMap(admin, store, prov, {
      externalId: 'sso-admin',
      email: 'sso@x.com',
      displayName: null,
      attributes: { groups: ['Admins'] },
    })
    await store.createRule({ providerId: prov.id, claimPath: 'groups', matchType: 'equals', matchValue: 'Admins', role: 'admin' })
    // Re-provision so the SSO user becomes admin via mapping.
    await provisionAndMap(admin, store, prov, {
      externalId: 'sso-admin',
      email: 'sso@x.com',
      displayName: null,
      attributes: { groups: ['Admins'] },
    })
    const locals = await localAdminIds(admin, store)
    expect(locals).toHaveLength(1) // only 'root' — the SSO admin is linked
  })

  it('refuses to remove the last local admin', async () => {
    await open()
    const root = await createUser(admin, 'root', 'SecurePass123!', 'admin')
    await expect(assertBreakGlassPreserved(admin, store, root.id)).rejects.toBeInstanceOf(BreakGlassError)
    // With a second local admin, removing one is allowed.
    const second = await createUser(admin, 'root2', 'SecurePass123!', 'admin')
    await expect(assertBreakGlassPreserved(admin, store, second.id)).resolves.toBeUndefined()
  })
})
