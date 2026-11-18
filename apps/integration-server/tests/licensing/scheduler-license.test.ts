import { afterEach, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { buildTestServer, seedConnection, type TestServer } from '../integration/helpers'
import type { SyncScheduler } from '../../src/workers/sync-scheduler'
import { signDevLicense } from './dev-license'

let server: TestServer | undefined
afterEach(async () => {
  await server?.cleanup()
  server = undefined
})

/**
 * P8 through the real wiring: server.ts hands the scheduler
 * `verticalEntitled: (v) => license.entitlements().has(`vertical:${v}`)`.
 * The SyncScheduler unit tests inject their own predicate, so only a built
 * server catches that line deleted or its feature string mistyped (review m45).
 */
describe('the sync scheduler skips a vertical the license does not include (P8)', () => {
  it('a license without vertical:crm: the crm connection is skipped, accounting is enqueued', async () => {
    // Connections are created under a license that includes both verticals
    // (creating one in an unlicensed vertical is refused), then the license
    // is replaced: the scheduler reads the license every tick.
    server = await buildTestServer({ dataStoreMode: 'database', licenseVia: 'file' })
    await seedConnection(server, { vertical: 'crm', platform: 'bexio', accessToken: 't' })
    await seedConnection(server, { vertical: 'accounting', platform: 'bexio', accessToken: 't' })
    writeFileSync(server.licenseFile, signDevLicense({ features: ['mcp', 'vertical:accounting'] }))
    await server.license.refresh()
    expect(server.license.entitlements().has('vertical:crm')).toBe(false)

    const scheduler = server.syncScheduler as unknown as SyncScheduler
    expect(scheduler).toBeDefined()
    const tick = await scheduler.tick()
    expect(tick).toMatchObject({ disabled: false, due: 2, skippedUnentitled: 1, enqueued: 1 })
  })

  it('the full license schedules both', async () => {
    server = await buildTestServer({ dataStoreMode: 'database' })
    await seedConnection(server, { vertical: 'crm', platform: 'bexio', accessToken: 't' })
    await seedConnection(server, { vertical: 'accounting', platform: 'bexio', accessToken: 't' })
    const tick = await (server.syncScheduler as unknown as SyncScheduler).tick()
    expect(tick).toMatchObject({ due: 2, skippedUnentitled: 0, enqueued: 2 })
  })
})
