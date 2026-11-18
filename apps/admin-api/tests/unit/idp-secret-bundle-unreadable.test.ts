/**
 * "This provider has no secrets" and "this provider's secrets cannot be read"
 * must not be the same answer.
 *
 * If `getSecretBundle` returned `{}` for an undecryptable bundle, that would
 * be indistinguishable from a provider that was never given a secret. Change
 * STORE_SECRET (rotate it, or restore admin.db onto a host that has a different
 * one) and every stored bundle becomes undecryptable, so `{}` would mean:
 *
 *   - SAML answers `500 "SAML provider missing IdP certificate"` — a specific,
 *     confident, wrong statement about a certificate the operator entered and
 *     can still see marked as configured in the UI;
 *   - OIDC sends `clientSecret ?? ''` and lets the IdP reject an empty client
 *     secret, so the cause surfaces one system away, if at all;
 *   - `updateProvider` merges `{ ...{}, ...patch }` and re-encrypts, quietly
 *     dropping every key the operator has not resent.
 *
 * So an unreadable bundle throws, which the SSO routes log and report as a
 * failure. The one path that must still work is the repair: an operator
 * re-entering the secret.
 */
import { describe, it, expect, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { IdentityStore } from '../../src/core/db/identity-store'
import type { IdpProtocol, IdpSecretBundle } from '../../src/core/db/identity-store'
import { createSsoRoutes } from '../../src/core/routes/sso'
import { createIdentityProvidersRoutes } from '../../src/core/routes/identity-providers'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { isoifyTimestamps } from '../../src/core/routes/_openapi'

const SECRET = 'test-store-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaa'
/** What the same deployment looks like after STORE_SECRET is rotated. */
const ROTATED_SECRET = 'test-store-secret-bbbbbbbbbbbbbbbbbbbbbbbbbbbb'

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('IdentityStore.getSecretBundle [$name]', (backend) => {
  let admin: AdminStore | undefined

  /** The same rows read back through a store keyed with a different secret. */
  async function openPair() {
    const handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    admin = await AdminStore.create(handle)
    return {
      handle,
      original: await IdentityStore.create(handle, SECRET),
      rotated: await IdentityStore.create(handle, ROTATED_SECRET),
    }
  }

  /** The stored ciphertext, straight out of the column. */
  async function rawSecret(handle: DbHandle, id: string): Promise<string | null> {
    const row = (await handle.kysely
      .selectFrom('identity_providers')
      .select('secret_enc')
      .where('id', '=', id)
      .executeTakeFirst()) as { secret_enc: string | null } | undefined
    return row?.secret_enc ?? null
  }

  afterEach(async () => {
    await admin?.close()
    admin = undefined
  })

  it('still returns an empty bundle for a provider that has no secrets', async () => {
    const { rotated } = await openPair()
    const p = await rotated.createProvider({ name: 'Okta', slug: 'okta', protocol: 'oidc' })
    await expect(rotated.getSecretBundle(p.id)).resolves.toEqual({})
  })

  it('reads the bundle back under the secret it was written with', async () => {
    const { original } = await openPair()
    const p = await original.createProvider({
      name: 'Okta',
      slug: 'okta',
      protocol: 'oidc',
      secret: { clientSecret: 'super-secret' },
    })
    await expect(original.getSecretBundle(p.id)).resolves.toEqual({ clientSecret: 'super-secret' })
  })

  it('does not report a stored-but-unreadable bundle as "no secrets"', async () => {
    const { original, rotated } = await openPair()
    const p = await original.createProvider({
      name: 'Entra',
      slug: 'entra',
      protocol: 'saml',
      secret: { idpCert: '-----BEGIN CERTIFICATE-----' },
    })
    await expect(rotated.getSecretBundle(p.id)).rejects.toThrow()
  })

  it('names the cause so the operator is pointed at STORE_SECRET', async () => {
    const { original, rotated } = await openPair()
    const p = await original.createProvider({
      name: 'Entra',
      slug: 'entra',
      protocol: 'saml',
      secret: { idpCert: '-----BEGIN CERTIFICATE-----' },
    })
    await expect(rotated.getSecretBundle(p.id)).rejects.toThrow(/STORE_SECRET/)
  })

  it('lets the operator repair the provider when they say so explicitly', async () => {
    const { original, rotated } = await openPair()
    const p = await original.createProvider({
      name: 'Entra',
      slug: 'entra',
      protocol: 'saml',
      secret: { idpCert: 'old-cert', spPrivateKey: 'old-key' },
    })
    await rotated.updateProvider(p.id, {
      secret: { idpCert: 'new-cert' },
      replaceUnreadableSecret: true,
    })
    // Only what was re-entered survives, and the operator asked for exactly
    // that: the acknowledgement is what makes discarding spPrivateKey a choice
    // rather than something that happened to them.
    await expect(rotated.getSecretBundle(p.id)).resolves.toEqual({ idpCert: 'new-cert' })
  })

  it('still merges untouched keys when the bundle IS readable', async () => {
    const { original } = await openPair()
    const p = await original.createProvider({
      name: 'AD',
      slug: 'ad',
      protocol: 'ldap',
      secret: { ldapBindPassword: 'pw1', idpCert: 'cert' },
    })
    await original.updateProvider(p.id, { secret: { ldapBindPassword: 'pw2' } })
    await expect(original.getSecretBundle(p.id)).resolves.toEqual({
      ldapBindPassword: 'pw2',
      idpCert: 'cert',
    })
  })
})

/**
 * Throwing out of `getSecretBundle` is only half the fix. Every SSO login path
 * wraps its work in a catch that answers with a fixed string, so the typed
 * error was landing right back in a generic bucket one level up:
 *
 *   - `/login` → `502 "Failed to start SSO login"`, naming no cause;
 *   - `/acs` and `/ldap-login` → `401 "SSO authentication failed"`, which
 *     blames the password of whoever is trying to log in for a STORE_SECRET
 *     mismatch on the server. An operator reading that goes and resets user
 *     accounts.
 *
 * These assert the reply itself distinguishes it — not just a log line.
 */
describe.each(BACKENDS)('SSO routes report unreadable secrets as ours [$name]', (backend) => {
  let admin: AdminStore | undefined
  let app: FastifyInstance | undefined

  async function buildApp(protocol: IdpProtocol, secret: IdpSecretBundle) {
    const handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    admin = await AdminStore.create(handle)
    const original = await IdentityStore.create(handle, SECRET)
    await original.createProvider({
      name: 'Corp',
      slug: 'corp',
      protocol,
      enabled: true,
      secret,
    })
    // The same rows, read by a server whose STORE_SECRET has since rotated.
    const rotated = await IdentityStore.create(handle, ROTATED_SECRET)
    app = Fastify({ logger: false })
    // The routes declare zod schemas; the bridge is what compiles them.
    await registerOpenApiBridge(app)
    await app.register(
      createSsoRoutes(
        admin,
        rotated,
        {
          sso: { publicBaseUrl: 'http://localhost:3001', adminUiUrl: 'http://localhost:3000' },
        } as unknown as Parameters<typeof createSsoRoutes>[2],
        { get: async () => undefined } as unknown as Parameters<typeof createSsoRoutes>[3],
      ),
    )
    await app.ready()
    return app
  }

  afterEach(async () => {
    await app?.close()
    app = undefined
    await admin?.close()
    admin = undefined
  })

  it('does not answer the SAML initiate with a bare "failed to start"', async () => {
    const a = await buildApp('saml', { idpCert: '-----BEGIN CERTIFICATE-----' })
    const res = await a.inject({ method: 'GET', url: '/api/sso/corp/login' })
    expect(res.json().error).toMatch(/STORE_SECRET/)
    expect(res.statusCode).toBe(500)
  })

  it('does not blame the user\'s credentials on the SAML ACS', async () => {
    const a = await buildApp('saml', { idpCert: '-----BEGIN CERTIFICATE-----' })
    const res = await a.inject({
      method: 'POST',
      url: '/api/sso/corp/acs',
      payload: { SAMLResponse: 'irrelevant-the-secret-is-read-first' },
    })
    expect(res.statusCode).not.toBe(401)
    expect(res.json().error).toMatch(/STORE_SECRET/)
  })

  it('does not blame the user\'s password on LDAP login', async () => {
    const a = await buildApp('ldap', { ldapBindPassword: 'bind-pw' })
    const res = await a.inject({
      method: 'POST',
      url: '/api/sso/corp/ldap-login',
      payload: { username: 'alice', password: 'correct-horse' },
    })
    expect(res.statusCode).not.toBe(401)
    expect(res.json().error).toMatch(/STORE_SECRET/)
  })

  it('reports "missing IdP certificate" for a provider that genuinely has no secrets', async () => {
    // Nothing stored → an empty bundle → the "missing IdP certificate" answer,
    // which is true here; the unreadable-bundle path must not swallow it.
    const a = await buildApp('saml', {})
    const res = await a.inject({ method: 'GET', url: '/api/sso/corp/login' })
    expect(res.json().error).toMatch(/IdP certificate/)
  })
})

describe.each(BACKENDS)('IdentityStore.updateProvider with an unreadable bundle [$name]', (backend) => {
  let admin: AdminStore | undefined

  async function openPair() {
    const handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    admin = await AdminStore.create(handle)
    return {
      handle,
      original: await IdentityStore.create(handle, SECRET),
      rotated: await IdentityStore.create(handle, ROTATED_SECRET),
    }
  }

  async function rawSecret(handle: DbHandle, id: string): Promise<string | null> {
    const row = (await handle.kysely
      .selectFrom('identity_providers')
      .select('secret_enc')
      .where('id', '=', id)
      .executeTakeFirst()) as { secret_enc: string | null } | undefined
    return row?.secret_enc ?? null
  }

  afterEach(async () => {
    await admin?.close()
    admin = undefined
  })

  async function seedUnreadable() {
    const pair = await openPair()
    const p = await pair.original.createProvider({
      name: 'Entra',
      slug: 'entra',
      protocol: 'saml',
      secret: { idpCert: 'the-cert', spPrivateKey: 'the-key' },
    })
    return { ...pair, id: p.id }
  }

  it('refuses a partial secret update rather than discarding the rest', async () => {
    const { rotated, id } = await seedUnreadable()
    await expect(
      rotated.updateProvider(id, { secret: { idpCert: 'new-cert' } }),
    ).rejects.toThrow(/STORE_SECRET/)
  })

  it('leaves the stored ciphertext byte-for-byte intact when it refuses', async () => {
    // The whole point. "Unreadable" means unreadable UNDER THIS KEY — rotate
    // STORE_SECRET without running rotate-store-secret, or restore admin.db
    // onto a host with a different one, and the bytes are still perfectly good.
    // Overwriting them destroys secrets that fixing the key would have returned.
    const { handle, id } = await seedUnreadable()
    const before = await rawSecret(handle, id)
    const { rotated } = { rotated: await IdentityStore.create(handle, ROTATED_SECRET) }
    await expect(
      rotated.updateProvider(id, { secret: { idpCert: 'new-cert' } }),
    ).rejects.toThrow()
    expect(await rawSecret(handle, id)).toBe(before)
  })

  it('the secrets are still recoverable afterwards under the original key', async () => {
    const { handle, id } = await seedUnreadable()
    const rotated = await IdentityStore.create(handle, ROTATED_SECRET)
    await expect(rotated.updateProvider(id, { secret: { idpCert: 'x' } })).rejects.toThrow()
    // Put the right key back — which is what an operator who rotated by mistake
    // would do — and nothing was lost.
    const repaired = await IdentityStore.create(handle, SECRET)
    await expect(repaired.getSecretBundle(id)).resolves.toEqual({
      idpCert: 'the-cert',
      spPrivateKey: 'the-key',
    })
  })

  it('names both ways out in the error', async () => {
    const { rotated, id } = await seedUnreadable()
    const err = await rotated.updateProvider(id, { secret: { idpCert: 'x' } }).catch((e) => e)
    expect(String(err.message)).toMatch(/STORE_SECRET/)
    expect(String(err.message)).toMatch(/rotate-store-secret|restore/i)
  })

  it('still allows an update that does not touch secrets', async () => {
    // Renaming a provider has nothing to do with its secrets, and refusing it
    // would leave a provider with an unreadable bundle uneditable entirely.
    const { handle, rotated, id } = await seedUnreadable()
    const before = await rawSecret(handle, id)
    const updated = await rotated.updateProvider(id, { name: 'Entra ID' })
    expect(updated?.name).toBe('Entra ID')
    expect(await rawSecret(handle, id)).toBe(before)
  })

  it('replaces the bundle when the operator acknowledges the loss', async () => {
    const { handle, rotated, id } = await seedUnreadable()
    const before = await rawSecret(handle, id)
    await rotated.updateProvider(id, {
      secret: { idpCert: 'new-cert' },
      replaceUnreadableSecret: true,
    })
    expect(await rawSecret(handle, id)).not.toBe(before)
    await expect(rotated.getSecretBundle(id)).resolves.toEqual({ idpCert: 'new-cert' })
  })

  it('does not require the acknowledgement when the bundle reads fine', async () => {
    const { original, id } = await seedUnreadable()
    await original.updateProvider(id, { secret: { idpCert: 'rotated-cert' } })
    await expect(original.getSecretBundle(id)).resolves.toEqual({
      idpCert: 'rotated-cert',
      spPrivateKey: 'the-key',
    })
  })
})

describe.each(BACKENDS)('PUT /api/identity-providers/:id with an unreadable bundle [$name]', (backend) => {
  let admin: AdminStore | undefined
  let fastify: FastifyInstance | undefined

  afterEach(async () => {
    await fastify?.close()
    fastify = undefined
    await admin?.close()
    admin = undefined
  })

  async function setup() {
    const handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    admin = await AdminStore.create(handle)
    const original = await IdentityStore.create(handle, SECRET)
    const rotated = await IdentityStore.create(handle, ROTATED_SECRET)
    const provider = await original.createProvider({
      name: 'Entra',
      slug: 'entra',
      protocol: 'saml',
      secret: { idpCert: 'the-cert', spPrivateKey: 'the-key' },
    })

    fastify = Fastify({ logger: false })
    // The route's own auth is not what is under test here.
    fastify.decorate('authenticate', async () => {})
    fastify.decorate('adminOnly', async () => {})
    fastify.addHook('preHandler', async (request) => {
      ;(request as unknown as { jwtUser: { id: string } }).jwtUser = { id: 'u1' }
    })
    registerOpenApiBridge(fastify)
    // The real server normalises epoch-millis timestamps to ISO in a
    // preSerialization hook; without it the response fails its own schema.
    fastify.addHook('preSerialization', async (_request, _reply, payload) =>
      isoifyTimestamps(payload),
    )
    await fastify.register(
      createIdentityProvidersRoutes(admin, rotated, {
        sso: { publicBaseUrl: 'http://localhost:3001', adminUiUrl: 'http://localhost:3000' },
      } as unknown as Parameters<typeof createIdentityProvidersRoutes>[2]),
    )
    await fastify.ready()
    return { fastify, handle, original, rotated, id: provider.id }
  }

  it('answers 409 naming the cause, not a 500', async () => {
    const h = await setup()
    const res = await h.fastify.inject({
      method: 'PUT',
      url: `/api/identity-providers/${h.id}`,
      payload: { secret: { idpCert: 'new-cert' } },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/STORE_SECRET/)
    expect(res.json().error).toMatch(/rotate-store-secret|restore/i)
  })

  it('writes nothing, so the secrets survive the refusal', async () => {
    const h = await setup()
    await h.fastify.inject({
      method: 'PUT',
      url: `/api/identity-providers/${h.id}`,
      payload: { secret: { idpCert: 'new-cert' } },
    })
    // Read back under the key they were written with: still all there.
    await expect(h.original.getSecretBundle(h.id)).resolves.toEqual({
      idpCert: 'the-cert',
      spPrivateKey: 'the-key',
    })
  })

  it('accepts the update when the operator acknowledges the loss', async () => {
    const h = await setup()
    const res = await h.fastify.inject({
      method: 'PUT',
      url: `/api/identity-providers/${h.id}`,
      payload: { secret: { idpCert: 'new-cert' }, replaceUnreadableSecret: true },
    })
    expect(res.statusCode).toBe(200)
    await expect(h.rotated.getSecretBundle(h.id)).resolves.toEqual({ idpCert: 'new-cert' })
  })

  it('still updates a non-secret field without the acknowledgement', async () => {
    const h = await setup()
    const res = await h.fastify.inject({
      method: 'PUT',
      url: `/api/identity-providers/${h.id}`,
      payload: { name: 'Entra ID' },
    })
    expect(res.statusCode).toBe(200)
    await expect(h.original.getSecretBundle(h.id)).resolves.toEqual({
      idpCert: 'the-cert',
      spPrivateKey: 'the-key',
    })
  })
})
