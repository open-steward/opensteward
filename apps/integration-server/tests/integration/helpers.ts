/**
 * Test bootstrap for the unified OpenSteward server.
 *
 * Spins up a real Fastify instance backed by a throwaway SQLite store, with
 * every vertical's adapter registry hydrated. Suitable for end-to-end tests
 * that exercise the control plane + a vertical's resource routes through the
 * full HTTP stack.
 *
 * Each test file gets its own server (via beforeEach + afterEach) — sharing
 * across tests would cross-pollinate the connection store.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveDbConfig } from '@opensteward/shared'
import type { LicenseConfig } from '@opensteward/shared/licensing'
import { buildServer, type BuildServerResult } from '../../src/server'
import type { ServiceConfig } from '../../src/config'
import { signDevLicense } from '../licensing/dev-license'

/** The store secret every test server uses: seed its databases with the same one. */
export const TEST_STORE_SECRET = 'integration-test-secret-must-be-32-chars'

export interface BootPaths {
  dir: string
  storePath: string
  dataStorePath: string
  licenseFile: string
}

export interface TestServerOptions {
  dataStoreMode?: 'database' | 'passthrough' | 'external'
  /** The license token. Default: signDevLicense() (every known feature, limits no test reaches). null: no license (MISSING). */
  license?: string | null
  /** 'env' (default) hands it over as OPENSTEWARD_LICENSE would; 'file' writes it to licenseFile first. */
  licenseVia?: 'env' | 'file'
  /** Default: license.key in the server's directory. */
  licenseFile?: string
  /** Use this license config verbatim (overrides license/licenseVia), e.g. one loadLicenseConfig() produced. */
  licenseConfig?: LicenseConfig
  /** Use this directory instead of a fresh tmp dir. Still removed on cleanup. */
  dir?: string
  /** Runs before buildServer, after the license file is written: leave the databases as an install would have. */
  beforeBoot?: (paths: BootPaths) => Promise<void> | void
}

export interface TestServer {
  fastify: BuildServerResult['fastify']
  store: BuildServerResult['store']
  registry: BuildServerResult['registry']
  apiKeys: BuildServerResult['apiKeys']
  oauthClients: BuildServerResult['oauthClients']
  /** Defined when the test server boots in `database` or `external` mode. */
  resourceStore: BuildServerResult['resourceStore']
  /** Stamp for seeding the cache — see the Finding 26 note in the journeys. */
  normalizerVersion: (vertical: string, platform: string) => string
  /** The server's sync workers; empty in `passthrough` mode. */
  syncWorkers: BuildServerResult['syncWorkers']
  syncScheduler: BuildServerResult['syncScheduler']
  /** The license manager: rewrite licenseFile, then `license.refresh()`. */
  license: BuildServerResult['license']
  /** Where this server looks for its license file. */
  licenseFile: string
  /** The server's directory (stores, and by default the license file). */
  dir: string
  cleanup: () => Promise<void>
}

/**
 * Boot a unified test server. Uses an empty in-memory adapter-settings db
 * and a unique tmp dir per call so parallel runs don't collide.
 *
 * `dataStoreMode` defaults to `passthrough` so the bulk of integration
 * tests don't have to think about the resource cache. Pass `database` (or
 * `external`) to exercise the read-through cache + sync path.
 *
 * Every server boots on a license. The default is a generous dev1 license, so
 * suites that are not about licensing behave exactly as before.
 */
export async function buildTestServer(opts: TestServerOptions = {}): Promise<TestServer> {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'oi-int-'))
  const storePath = join(dir, 'store.db')
  const dataStorePath = join(dir, 'resources.db')
  const licenseFile = opts.licenseConfig?.filePath ?? opts.licenseFile ?? join(dir, 'license.key')
  const token = opts.license === undefined ? signDevLicense() : opts.license
  if (!opts.licenseConfig && opts.licenseVia === 'file' && token !== null) {
    writeFileSync(licenseFile, token)
  }
  await opts.beforeBoot?.({ dir, storePath, dataStorePath, licenseFile })
  const license: LicenseConfig = opts.licenseConfig ?? {
    envToken: opts.licenseVia === 'file' ? undefined : (token ?? undefined),
    filePath: licenseFile,
  }
  const config: ServiceConfig = {
    port: 0,
    host: '127.0.0.1',
    storePath,
    credDb: resolveDbConfig({}, { sqlitePath: storePath }),
    dataDb: resolveDbConfig({}, { sqlitePath: dataStorePath }),
    storeSecret: TEST_STORE_SECRET,
    dataStore: {
      mode: opts.dataStoreMode ?? 'passthrough',
      path: dataStorePath,
    },
    license,
  }
  const built = await buildServer(config)

  return {
    fastify: built.fastify,
    store: built.store,
    registry: built.registry,
    apiKeys: built.apiKeys,
    oauthClients: built.oauthClients,
    resourceStore: built.resourceStore,
    normalizerVersion: built.normalizerVersion,
    syncWorkers: built.syncWorkers,
    syncScheduler: built.syncScheduler,
    license: built.license,
    licenseFile,
    dir,
    cleanup: async () => {
      await built.fastify.close()
      await built.closeStores()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/**
 * Seed a connection straight into the credential store, bypassing OAuth.
 * Returns the new connection's UUID.
 */
export function seedConnection(
  server: TestServer,
  opts: {
    vertical: string
    platform: string
    accessToken: string
    tenantId?: string | null
    label?: string | null
  },
): Promise<string> {
  return server.store.create(
    opts.platform,
    opts.tenantId ?? null,
    { accessToken: opts.accessToken },
    opts.label ?? null,
    opts.vertical,
  )
}
