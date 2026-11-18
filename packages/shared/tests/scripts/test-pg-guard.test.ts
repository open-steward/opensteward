/**
 * scripts/test-pg-guard.mts — the check `pnpm test:pg` runs on a TEST_PG_URL
 * before letting the suites drop its public schema. The name rule needs no
 * database; the `_schema_migrations` rule runs against a throwaway database
 * when TEST_DATABASE_URL is set (`pnpm test:pg`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { Client } from 'pg'
import { testDatabaseRefusal } from '../../../../scripts/test-pg-guard.mts'

const BASE = process.env.TEST_DATABASE_URL

describe('testDatabaseRefusal', () => {
  it('refuses a database named opensteward without connecting, unless forced', async () => {
    const url = 'postgres://u:p@127.0.0.1:1/opensteward'
    expect(await testDatabaseRefusal(url, {})).toMatch(/named "opensteward"/)
    expect(await testDatabaseRefusal(url, { TEST_PG_FORCE: '1' })).toBeNull()
  })

  describe.skipIf(!BASE)('against a real database', () => {
    const name = `tpg_guard_${randomBytes(5).toString('hex')}`
    let url = ''
    async function onBase(sql: string): Promise<void> {
      const c = new Client({ connectionString: BASE })
      await c.connect()
      try {
        await c.query(sql)
      } finally {
        await c.end()
      }
    }
    async function onDb(sql: string): Promise<void> {
      const c = new Client({ connectionString: url })
      await c.connect()
      try {
        await c.query(sql)
      } finally {
        await c.end()
      }
    }
    beforeAll(async () => {
      await onBase(`CREATE DATABASE ${name}`)
      const u = new URL(BASE!)
      u.pathname = `/${name}`
      url = u.toString()
    })
    afterAll(async () => {
      await onBase(`DROP DATABASE IF EXISTS ${name}`)
    })

    it('lets through a database with no migration history', async () => {
      expect(await testDatabaseRefusal(url, {})).toBeNull()
      await onDb(
        `CREATE TABLE public._schema_migrations (namespace TEXT, version INTEGER, applied_at BIGINT)`,
      )
      expect(await testDatabaseRefusal(url, {})).toBeNull()
    })

    it('refuses one whose public._schema_migrations has rows, unless forced', async () => {
      await onDb(`INSERT INTO public._schema_migrations VALUES ('admin_store', 1, 0)`)
      const reason = await testDatabaseRefusal(url, {})
      expect(reason).toMatch(/1 applied migration/)
      expect(reason).not.toContain(new URL(url).password || '@@')
      expect(await testDatabaseRefusal(url, { TEST_PG_FORCE: '1' })).toBeNull()
    })
  })
})
