import { describe, it, expect, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { IdentityStore } from '../../src/core/db/identity-store'

const SECRET = 'test-store-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa'

// SQLite always (`:memory:`); Postgres when TEST_DATABASE_URL is set (CI service
// container / local docker). Per test we open a fresh handle and (on Postgres)
// drop the schema first so the shared db stays isolated. IdentityStore borrows
// the SAME handle as AdminStore — audit_log lives in admin_store, so AdminStore
// is created first to own (and close) the shared connection.
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('IdentityStore [$name]', (backend) => {
  let admin: AdminStore | undefined
  let store: IdentityStore

  async function open() {
    const handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    admin = await AdminStore.create(handle)
    store = await IdentityStore.create(handle, SECRET)
  }

  afterEach(async () => {
    await admin?.close()
    admin = undefined
  })

  it('encrypts the secret bundle at rest and decrypts it back', async () => {
    await open()
    const p = await store.createProvider({
      name: 'Okta',
      slug: 'okta',
      protocol: 'oidc',
      config: { issuer: 'https://x', clientId: 'c' },
      secret: { clientSecret: 'super-secret' },
    })
    expect(p.hasSecret).toBe(true)
    // Raw row never exposes plaintext.
    const raw = (await admin!
      .getHandle()
      .kysely.selectFrom('identity_providers')
      .select('secret_enc')
      .where('id', '=', p.id)
      .executeTakeFirst()) as { secret_enc: string }
    expect(raw.secret_enc).not.toContain('super-secret')
    expect((await store.getSecretBundle(p.id)).clientSecret).toBe('super-secret')
  })

  it('merges secrets on update and preserves untouched keys', async () => {
    await open()
    const p = await store.createProvider({ name: 'AD', slug: 'ad', protocol: 'ldap', secret: { ldapBindPassword: 'pw1' } })
    await store.updateProvider(p.id, { name: 'AD2' })
    expect((await store.getSecretBundle(p.id)).ldapBindPassword).toBe('pw1')
  })

  it('verifies SCIM tokens by constant-time hash and supports revocation', async () => {
    await open()
    const p = await store.createProvider({ name: 'Okta', slug: 'okta', protocol: 'oidc' })
    const mint = await store.mintScimToken({ providerId: p.id })
    expect((await store.verifyScimToken(mint.plaintext))?.providerId).toBe(p.id)
    expect(await store.verifyScimToken('scim_wrong')).toBeNull()
    await store.revokeScimToken(mint.id)
    expect(await store.verifyScimToken(mint.plaintext)).toBeNull()
  })

  it('consumes transactions exactly once', async () => {
    await open()
    const p = await store.createProvider({ name: 'Okta', slug: 'okta', protocol: 'oidc' })
    await store.createTransaction({ state: 's1', providerId: p.id, returnTo: '/', nonce: 'n', codeVerifier: 'v' })
    const first = await store.consumeTransaction('s1')
    expect(first?.codeVerifier).toBe('v')
    expect(await store.consumeTransaction('s1')).toBeNull()
  })

  it('rejects replayed SAML assertion ids', async () => {
    await open()
    expect(await store.recordSamlAssertion('a1', Date.now() + 10_000)).toBe(true)
    expect(await store.recordSamlAssertion('a1', Date.now() + 10_000)).toBe(false)
  })

  it('hands off the JWT through a single-use code', async () => {
    await open()
    const code = await store.createHandoff('jwt-token', { id: 'u1', username: 'a', role: 'admin' })
    const out = await store.consumeHandoff(code)
    expect(out?.token).toBe('jwt-token')
    expect(await store.consumeHandoff(code)).toBeNull()
  })

  it('computes group membership for role feeds', async () => {
    await open()
    const p = await store.createProvider({ name: 'Okta', slug: 'okta', protocol: 'oidc' })
    await store.createScimGroup(p.id, 'Admins', ['u1', 'u2'])
    expect(await store.groupsForUser(p.id, 'u1')).toEqual(['Admins'])
    expect(await store.groupsForUser(p.id, 'u3')).toEqual([])
  })
})
