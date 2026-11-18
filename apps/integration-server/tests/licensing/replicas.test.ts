/**
 * Review Focus #4: two integration-server replicas on one database. A refusal
 * is always re-checked against a fresh count, so a connection deleted through
 * replica A frees its slot on replica B at once, whatever B has cached.
 * SQLite: two servers on one file (always runs). Postgres: two servers on one
 * throwaway schema (`pnpm test:pg integration-server` runs this file because it
 * reads TEST_DATABASE_URL).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, resolveDbConfig } from '@opensteward/shared'
import { buildServer, type BuildServerResult } from '../../src/server'
import { TEST_STORE_SECRET } from '../integration/helpers'
import { signDevLicense } from './dev-license'

const PG = process.env['TEST_DATABASE_URL']
const ADMIN = 'replica-admin-secret'
const admin = { 'x-admin-secret': ADMIN }
const limit = (connections: number) => signDevLicense({ limits: { connections, tenants: 1 } })

async function replica(dir: string, databaseUrl?: string): Promise<BuildServerResult> {
  const storePath = join(dir, 'credentials.db')
  const dataStorePath = join(dir, 'resources.db')
  const env = databaseUrl ? { DATABASE_URL: databaseUrl } : {}
  return buildServer({
    port: 0,
    host: '127.0.0.1',
    storePath,
    credDb: resolveDbConfig(env, { sqlitePath: storePath }),
    dataDb: resolveDbConfig(env, { sqlitePath: dataStorePath }),
    storeSecret: TEST_STORE_SECRET,
    dataStore: { mode: 'passthrough', path: dataStorePath },
    license: { filePath: join(dir, 'license.key') },
  })
}

async function scenario(dir: string, databaseUrl?: string): Promise<void> {
  const licenseFile = join(dir, 'license.key')
  writeFileSync(licenseFile, limit(5))
  const a = await replica(dir, databaseUrl)
  const b = await replica(dir, databaseUrl)
  try {
    const one = await a.store.create('hubspot', null, { accessToken: 't' }, 'one', 'crm')
    const two = await a.store.create('hubspot', null, { accessToken: 't' }, 'two', 'crm')
    const [writable] = await a.store.listIdsInCreationOrder(1)
    const readOnly = writable === one ? two : one
    writeFileSync(licenseFile, limit(1))
    await a.license.refresh()
    await b.license.refresh()
    const write = (s: BuildServerResult, id: string) =>
      s.fastify.inject({
        method: 'POST',
        url: `/v1/crm/contacts?connection_id=${id}`,
        headers: admin,
        payload: {},
      })

    const refused = await write(b, readOnly) // B refuses, and caches who may write
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error.code).toBe('LICENSE_LIMIT_EXCEEDED')
    // A deletes the writable connection. B's delete listeners never hear of it.
    expect(
      (
        await a.fastify.inject({
          method: 'DELETE',
          url: `/admin/connections/${writable}`,
          headers: admin,
        })
      ).statusCode,
    ).toBe(204)
    // B lets the write through at once (hubspot is not enabled, so 404 ADAPTER_UNAVAILABLE).
    const res = await write(b, readOnly)
    expect(res.statusCode).not.toBe(403)
    expect(String(res.json().error?.code ?? '')).not.toMatch(/^LICENSE_/)
  } finally {
    await a.fastify.close()
    await b.fastify.close()
    await a.closeStores()
    await b.closeStores()
  }
}

describe('[L7:G13] two replicas on one database (Review Focus #4)', () => {
  let dir = ''
  beforeEach(() => {
    process.env['ADMIN_SECRET'] = ADMIN
    dir = mkdtempSync(join(tmpdir(), 'lic-replicas-'))
  })
  afterEach(() => {
    delete process.env['ADMIN_SECRET']
    rmSync(dir, { recursive: true, force: true })
  })

  it('SQLite: a slot freed through replica A is usable through replica B at once', async () => {
    await scenario(dir)
  }, 60_000)

  it.runIf(!!PG)(
    'Postgres: the same, on one throwaway schema',
    async () => {
      const schema = `lic_rep_${randomBytes(6).toString('hex')}`
      const pg = await openDb({ databaseUrl: PG, poolMax: 1 })
      await pg.execScript(`CREATE SCHEMA ${schema}`)
      try {
        const url = new URL(PG!)
        url.searchParams.set('options', `-c search_path=${schema}`)
        await scenario(dir, url.toString())
      } finally {
        await pg.execScript(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await pg.close()
      }
    },
    120_000,
  )
})
