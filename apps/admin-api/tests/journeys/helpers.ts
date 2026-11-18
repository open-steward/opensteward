/**
 * Test bootstrap for the admin-api journey suite.
 *
 * Boots a real admin-api Fastify instance backed by a throwaway SQLite db,
 * in `generatorMode` so no background workers (health poller, audit retention)
 * hold the event loop open. `verticals: []` means nothing reaches out to a
 * live integration-server, so the suite is fully self-contained.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { resolveDbConfig } from '@opensteward/shared'
import { buildServer } from '../../src/core/server'
import type { Config } from '../../src/config'
import type { AdminStore } from '../../src/core/db/admin-store'
import type { AvatarFetcher, IdpProfileSync } from '../../src/core/auth/idp/profile-sync'
import { AvatarFetchError } from '../../src/core/auth/idp/avatar-fetch'
import type { LicenseStatusProvider } from '../../src/core/license/status-cache'
import { PERMISSIVE_TEST_LICENSE } from './license-fixtures'

export interface AdminApiTestServer {
  fastify: FastifyInstance
  /** The live store — for seeding what only a background worker writes
   *  (notifications) and for reading back what a route persisted. */
  adminStore: AdminStore
  /** SSO/SCIM profile sync; `await idpProfileSync.idle()` to wait for the
   *  background picture fetches a sign-in or SCIM call started. */
  idpProfileSync: IdpProfileSync
  cleanup: () => Promise<void>
}

/** The default picture fetcher in tests: refuses, so no suite can reach the
 *  network through an IdP picture URL by accident. */
const noNetwork: AvatarFetcher = async () => {
  throw new AvatarFetchError('network', 'tests never fetch real pictures')
}

export async function buildAdminApiTestServer(
  opts: {
    avatarFetcher?: AvatarFetcher
    licenseStatus?: LicenseStatusProvider | 'integration-server'
  } = {},
): Promise<AdminApiTestServer> {
  const dir = mkdtempSync(join(tmpdir(), 'oi-admin-api-'))
  const config: Config = {
    server: { port: 0, host: '127.0.0.1' },
    jwt: { secret: 'journey-test-jwt-secret-that-is-long-enough', expiresIn: '24h' },
    // Throwaway SQLite db per journey run (env-free → never Postgres).
    db: resolveDbConfig({}, { sqlitePath: join(dir, 'admin.db') }),
    verticals: [],
    storeSecret: 'journey-test-store-secret-must-be-32-chars',
    sso: { publicBaseUrl: 'http://localhost:3001', adminUiUrl: 'http://localhost:3000' },
  }
  const { fastify, adminStore, idpProfileSync } = await buildServer(config, {
    generatorMode: true,
    avatarFetcher: opts.avatarFetcher ?? noNetwork,
    // Suites that are not about licensing get a license with room to spare, so
    // POST /api/tenants is never refused and no suite reaches integration-server.
    // 'integration-server' keeps the real lazy cache (license-route.test.ts).
    licenseStatus:
      opts.licenseStatus === 'integration-server'
        ? undefined
        : (opts.licenseStatus ?? PERMISSIVE_TEST_LICENSE),
  })
  await fastify.ready()

  return {
    fastify,
    adminStore,
    idpProfileSync,
    cleanup: async () => {
      await idpProfileSync.idle()
      await fastify.close()
      await adminStore.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** Complete first-run setup and return the admin JWT. */
export async function setupAdmin(
  server: AdminApiTestServer,
  username = 'admin',
  password = 'AdminPass123!',
): Promise<string> {
  const res = await server.fastify.inject({
    method: 'POST',
    url: '/api/auth/setup',
    payload: { username, password },
  })
  if (res.statusCode !== 201) {
    throw new Error(`setup failed: ${res.statusCode} ${res.payload}`)
  }
  return res.json().token as string
}

/** Create a second user with the given role (via the admin token) and return its login JWT. */
export async function createUserAndLogin(
  server: AdminApiTestServer,
  adminToken: string,
  username: string,
  role: 'admin' | 'operator' | 'viewer',
  password = 'OperatorPass123!',
): Promise<string> {
  const created = await server.fastify.inject({
    method: 'POST',
    url: '/api/users',
    headers: { authorization: `Bearer ${adminToken}` },
    payload: { username, password, role },
  })
  if (created.statusCode !== 201) {
    throw new Error(`create user failed: ${created.statusCode} ${created.payload}`)
  }
  const login = await server.fastify.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username, password },
  })
  if (login.statusCode !== 200) {
    throw new Error(`login failed: ${login.statusCode} ${login.payload}`)
  }
  return login.json().token as string
}
