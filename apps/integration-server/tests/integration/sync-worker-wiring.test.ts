import { describe, it, expect, afterEach } from 'vitest'
import { buildTestServer, type TestServer } from './helpers'

/**
 * Every sync worker stamps what it writes with the fingerprint the routers
 * read by.
 *
 * `SyncWorker` takes `normalizerVersion` as an option; the shared tests prove
 * the worker uses it, and nothing but this proves the server passes it. Before
 * it did, nothing any of the nine workers wrote was ever served: every router
 * here filters on the version, and every synced row was unversioned. Observed
 * live 2026-09-22 — the first list after a sync was `miss / reason: version`.
 */
describe('sync worker wiring', () => {
  let server: TestServer | undefined

  afterEach(async () => {
    await server?.cleanup()
    server = undefined
  })

  it('runs one worker per vertical in database mode', async () => {
    server = await buildTestServer({ dataStoreMode: 'database' })
    // A lower count would make the next test pass over fewer workers than ship.
    expect(server.syncWorkers).toHaveLength(9)
  })

  it('hands every worker the normalizer version the routers filter on', async () => {
    server = await buildTestServer({ dataStoreMode: 'database' })
    for (const worker of server.syncWorkers) {
      const version = (
        worker as unknown as {
          normalizerVersion?: (vertical: string, platform: string) => string
        }
      ).normalizerVersion
      expect(version).toBeTypeOf('function')
      expect(version!('inventory', 'shipbob-inventory')).toBe(
        server.normalizerVersion('inventory', 'shipbob-inventory'),
      )
    }
  })

  it('hands every worker a resolver for why a platform lacks a resource', async () => {
    // The shared tests prove the worker reports the reason; only this proves
    // the server hands each worker a resolver, for its own vertical.
    server = await buildTestServer({ dataStoreMode: 'database' })
    for (const worker of server.syncWorkers) {
      const w = worker as unknown as {
        vertical: string
        unavailableReason?: (
          platform: string,
          r: { resourceType: string; method: string },
        ) => Promise<string | undefined>
      }
      expect(w.unavailableReason, w.vertical).toBeTypeOf('function')
    }
    const accounting = server.syncWorkers.find(
      (w) => (w as unknown as { vertical: string }).vertical === 'accounting',
    ) as unknown as {
      unavailableReason: (
        platform: string,
        r: { resourceType: string; method: string },
      ) => Promise<string | undefined>
    }
    expect(
      await accounting.unavailableReason('bokio', {
        resourceType: 'taxrates',
        method: 'listTaxRates',
      }),
    ).toBe('VAT exists only as a per-line taxRate on invoices')
  })

  it('runs the sync scheduler in database mode and not in passthrough', async () => {
    server = await buildTestServer({ dataStoreMode: 'database' })
    expect(server.syncScheduler).toBeDefined()
    await server.cleanup()
    server = await buildTestServer({ dataStoreMode: 'passthrough' })
    expect(server.syncScheduler).toBeUndefined()
  })
})
