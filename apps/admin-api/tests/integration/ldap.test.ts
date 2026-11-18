/**
 * LDAP integration test — exercises the real `ldapts` bind/search path against
 * an in-process ldapjs server (no Docker, runs in CI). Covers search-then-bind,
 * attribute extraction, wrong-password rejection, and JIT + role mapping.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
// eslint-disable-next-line @typescript-eslint/no-require-imports
import ldap from 'ldapjs'
import type { AddressInfo } from 'net'
import { openDb } from '@opensteward/shared'
import { AdminStore } from '../../src/core/db/admin-store'
import { IdentityStore, type IdentityProviderRow } from '../../src/core/db/identity-store'
import { ldapAuthenticate, LdapAuthError } from '../../src/core/auth/idp/ldap-provider'
import { provisionAndMap } from '../../src/core/auth/idp/jit-provisioning'

const BASE = 'dc=example,dc=com'
const PEOPLE = `ou=people,${BASE}`
const ADMIN_DN = `cn=admin,${BASE}`
const ADMIN_PW = 'service-secret'
const ALICE_DN = `uid=alice,${PEOPLE}`
const ALICE_PW = 'alice-password'

const ALICE = {
  dn: ALICE_DN,
  attributes: {
    uid: ['alice'],
    cn: ['Alice Example'],
    mail: ['alice@example.com'],
    entryUUID: ['11111111-1111-1111-1111-111111111111'],
    memberOf: ['cn=Admins,ou=groups,dc=example,dc=com', 'cn=Staff,ou=groups,dc=example,dc=com'],
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function startServer(): Promise<{ url: string; close: () => void }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const server = (ldap as any).createServer()

  // Bind handler for the whole tree: validate the service account and the user.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.bind(BASE, (req: any, res: any, next: any) => {
    const dn = req.dn.toString()
    const pw = req.credentials
    const ok =
      (normalize(dn) === normalize(ADMIN_DN) && pw === ADMIN_PW) ||
      (normalize(dn) === normalize(ALICE_DN) && pw === ALICE_PW)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!ok) return next(new (ldap as any).InvalidCredentialsError())
    res.end()
    return next()
  })

  // Search handler — return Alice when the uid filter matches.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server.search(BASE, (req: any, res: any, next: any) => {
    if (req.filter.matches(ALICE.attributes)) res.send(ALICE)
    res.end()
    return next()
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.server.address() as AddressInfo).port
      resolve({ url: `ldap://127.0.0.1:${port}`, close: () => server.close() })
    })
  })
}

function normalize(dn: string): string {
  return dn.replace(/\s+/g, '').toLowerCase()
}

describe('LDAP integration (in-process ldapjs)', () => {
  let srv: { url: string; close: () => void }
  let admin: AdminStore
  let store: IdentityStore
  let provider: IdentityProviderRow

  beforeAll(async () => {
    srv = await startServer()
  })
  afterAll(() => srv.close())

  async function open() {
    const handle = await openDb({ sqlitePath: ':memory:' })
    admin = await AdminStore.create(handle)
    store = await IdentityStore.create(handle, 'test-store-secret-dddddddddddddddddddddddddddd')
    provider = await store.createProvider({
      name: 'Corp AD',
      slug: 'corp-ad',
      protocol: 'ldap',
      enabled: true,
      defaultRole: 'viewer',
      config: {
        url: srv.url,
        bindDn: ADMIN_DN,
        searchBase: PEOPLE,
        searchFilter: '(uid={{username}})',
        groupsAttribute: 'memberOf',
        emailAttribute: 'mail',
        displayNameAttribute: 'cn',
      },
      secret: { ldapBindPassword: ADMIN_PW },
    })
  }
  afterEach(async () => {
    await admin?.close()
  })

  it('authenticates a valid user and extracts attributes + groups', async () => {
    await open()
    const identity = await ldapAuthenticate(provider, ADMIN_PW, 'alice', ALICE_PW)
    expect(identity.externalId).toBe('11111111-1111-1111-1111-111111111111')
    expect(identity.email).toBe('alice@example.com')
    expect(identity.displayName).toBe('Alice Example')
    expect(identity.attributes.groups).toContain('cn=Admins,ou=groups,dc=example,dc=com')
  })

  it('rejects a wrong password', async () => {
    await open()
    await expect(ldapAuthenticate(provider, ADMIN_PW, 'alice', 'wrong')).rejects.toBeInstanceOf(LdapAuthError)
  })

  it('rejects an unknown user', async () => {
    await open()
    await expect(ldapAuthenticate(provider, ADMIN_PW, 'nobody', 'x')).rejects.toBeInstanceOf(LdapAuthError)
  })

  it('JIT-provisions and maps role from an LDAP group', async () => {
    await open()
    await store.createRule({
      providerId: provider.id,
      claimPath: 'groups',
      matchType: 'contains',
      matchValue: 'cn=Admins',
      role: 'admin',
    })
    const identity = await ldapAuthenticate(provider, ADMIN_PW, 'alice', ALICE_PW)
    const result = await provisionAndMap(admin, store, provider, identity)
    expect(result.created).toBe(true)
    expect(result.user.role).toBe('admin')
  })
})
