/**
 * The sandbox test issuer is a registered issuer like any other, with two
 * exceptions the store has to make for it:
 *
 *   - it may be plain http without the private-hosts escape hatch, because
 *     nothing is ever fetched from it — the sandbox verifies its tokens
 *     against a key held in memory;
 *   - it never makes OIDC "ready": its tokens are refused on /v1/*, so it can
 *     admit nobody there, and it is the one issuer that gets verified by
 *     tokens the deployment minted itself. Counting it would let an operator
 *     switch API keys off on the strength of a credential that cannot reach
 *     production.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb, type DbHandle } from '../../src/db'
import { OAuthClientStore, InvalidIssuerError } from '../../src/auth/oauth-clients'
import { SANDBOX_ISSUER_PRESET } from '../../src/auth/mock-oidc-issuer'

let handle: DbHandle
let store: OAuthClientStore
let savedFlag: string | undefined

const SANDBOX = {
  name: 'Sandbox',
  preset: SANDBOX_ISSUER_PRESET,
  issuer: 'http://localhost:3010/test/oidc',
  jwksUri: 'http://localhost:3010/test/oidc/jwks',
  audience: 'https://opensteward.test',
  subjectClaim: 'sub',
  scopeClaim: 'scope',
}

beforeEach(async () => {
  savedFlag = process.env['OST_ALLOW_PRIVATE_HOSTS']
  delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  handle = await openDb({ sqlitePath: ':memory:' })
  store = await OAuthClientStore.create(handle)
})

afterEach(async () => {
  if (savedFlag === undefined) delete process.env['OST_ALLOW_PRIVATE_HOSTS']
  else process.env['OST_ALLOW_PRIVATE_HOSTS'] = savedFlag
  await handle?.close()
})

describe('the sandbox preset', () => {
  it('may be registered over plain http without the private-hosts flag', async () => {
    const issuer = await store.createIssuer(SANDBOX)
    expect(issuer.preset).toBe(SANDBOX_ISSUER_PRESET)
    expect(issuer.issuer).toBe(SANDBOX.issuer)
  })

  it('does not loosen the rule for any other preset', async () => {
    await expect(store.createIssuer({ ...SANDBOX, preset: 'generic' })).rejects.toBeInstanceOf(
      InvalidIssuerError,
    )
  })

  it('never makes OIDC ready on its own, even once verified with a client', async () => {
    const issuer = await store.createIssuer(SANDBOX)
    await store.createClient({
      issuerId: issuer.id,
      subject: 'billing-service',
      tenantId: 'default',
      scopes: ['customers:read'],
    })
    await store.markVerified(issuer.id)
    const readiness = await store.readiness()
    expect(readiness.ready).toBe(false)
    expect(readiness.reason).toContain('sandbox test issuer')
    expect(readiness.reason).toContain('/test/v1')
  })
})
