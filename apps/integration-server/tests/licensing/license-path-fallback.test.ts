import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { resolveDbConfig } from '@opensteward/shared'
import { buildServer } from '../../src/server'
import { TEST_STORE_SECRET } from '../integration/helpers'

/**
 * loadConfig always sets `license` (loadLicenseConfig returns an absolute
 * path). A hand-built config may leave it out, and buildServer then looks for
 * license.key next to the store: still absolute, or /admin/license and the
 * startup log would report a path relative to wherever the process started
 * (review m48).
 */
describe('buildServer without config.license', () => {
  it('looks for license.key next to a relative storePath, as an absolute path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lic-fallback-'))
    const storePath = relative(process.cwd(), join(dir, 'store.db'))
    expect(isAbsolute(storePath)).toBe(false)
    const dataPath = join(dir, 'resources.db')
    const built = await buildServer({
      port: 0,
      host: '127.0.0.1',
      storePath,
      credDb: resolveDbConfig({}, { sqlitePath: storePath }),
      dataDb: resolveDbConfig({}, { sqlitePath: dataPath }),
      storeSecret: TEST_STORE_SECRET,
      dataStore: { mode: 'passthrough', path: dataPath },
    })
    try {
      expect(built.license.current()).toMatchObject({
        state: 'MISSING',
        filePath: join(dir, 'license.key'),
      })
    } finally {
      await built.fastify.close()
      await built.closeStores()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
