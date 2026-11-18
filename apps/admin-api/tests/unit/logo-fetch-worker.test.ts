/**
 * LogoFetchWorker — the tick loop, progress accounting, and the failure modes
 * an operator will actually hit.
 *
 * `fetchLogos` is stubbed: this is about what the worker does with the results,
 * not about the HTTP fetching, which `packages/codegen/tests/fetch-logos.test.ts`
 * covers directly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'

const mockFetchLogos = vi.fn()

vi.mock('@opensteward/codegen/logos', async (importOriginal) => {
  // Keep the real error classes: the worker branches on `instanceof` to decide
  // whether a failure message is worth showing the operator verbatim.
  const actual = await importOriginal<typeof import('@opensteward/codegen/logos')>()
  return { ...actual, fetchLogos: (...args: unknown[]) => mockFetchLogos(...args) }
})

const { AdminStore } = await import('../../src/core/db/admin-store')
const { LogoStore } = await import('../../src/core/db/logo-store')
const { RuntimeSettingsStore } = await import('../../src/core/db/runtime-settings-store')
const { LogoFetchWorker } = await import('../../src/core/workers/logo-fetch-worker')

const CATALOG = [
  {
    slug: 'xero',
    name: 'Xero',
    website: 'https://xero.com',
    vertical: 'accounting',
    auth_type: 'oauth2',
  },
  {
    slug: 'stripe',
    name: 'Stripe',
    website: 'https://stripe.com',
    vertical: 'payments',
    auth_type: 'api_key',
  },
  // No website — the fetcher has nothing to query, so it must be dropped.
  { slug: 'ghost', name: 'Ghost', vertical: 'crm', auth_type: 'oauth2' },
]

describe('LogoFetchWorker', () => {
  let handle: DbHandle
  let adminStore: InstanceType<typeof AdminStore>
  let logoStore: InstanceType<typeof LogoStore>
  let settings: InstanceType<typeof RuntimeSettingsStore>
  let listCatalog: ReturnType<typeof vi.fn>

  const buildWorker = (overrides: Record<string, unknown> = {}) =>
    new LogoFetchWorker({
      logoStore,
      settings,
      unifiedClient: { listCatalog } as never,
      adminStore,
      // Brandfetch requires the Referer to carry the request origin, so the
      // worker refuses to run without one rather than falling back to this
      // project's URL.
      adminUiUrl: 'https://os.acme.test',
      ...overrides,
    })

  const queueJob = (overrides: Record<string, unknown> = {}) =>
    logoStore.createJob({
      id: 'lfj_1',
      force: false,
      vertical: null,
      slug: null,
      delayMs: 400,
      total: 0,
      createdBy: 'admin',
      ...overrides,
    })

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    adminStore = await AdminStore.create(handle)
    logoStore = await LogoStore.create(handle)
    settings = await RuntimeSettingsStore.create(handle)
    await settings.set('logos.brandfetch_client_id', 'test-client-id', 'admin')
    listCatalog = vi.fn(async () => CATALOG)
    mockFetchLogos.mockReset()
    mockFetchLogos.mockResolvedValue({
      fetched: 0,
      skipped: 0,
      notFound: 0,
      throttled: 0,
      cancelled: false,
    })
  })

  afterEach(async () => {
    await handle.close()
  })

  it('does nothing when there is no pending job', async () => {
    await buildWorker().runOnce()
    expect(mockFetchLogos).not.toHaveBeenCalled()
  })

  it('claims a pending job and runs it to completion', async () => {
    await queueJob()
    await buildWorker().runOnce()

    expect(mockFetchLogos).toHaveBeenCalledTimes(1)
    const job = await logoStore.getJob('lfj_1')
    expect(job!.status).toBe('completed')
    expect(job!.workerId).toBeTruthy()
  })

  it('fails the job with an actionable message when no client ID is set', async () => {
    await settings.set('logos.brandfetch_client_id', '', 'admin')
    await queueJob()
    await buildWorker().runOnce()

    const job = await logoStore.getJob('lfj_1')
    expect(job!.status).toBe('failed')
    expect(job!.error).toMatch(/Platforms → Logos/)
    expect(mockFetchLogos).not.toHaveBeenCalled()
  })

  it('never falls back to the environment for the client ID', async () => {
    // The admin UI is the single source of truth; silently using a different
    // ID than the one on screen would be undebuggable.
    process.env.BRANDFETCH_CLIENT_ID = 'from-env'
    await settings.set('logos.brandfetch_client_id', '', 'admin')
    await queueJob()
    await buildWorker().runOnce()

    expect((await logoStore.getJob('lfj_1'))!.status).toBe('failed')
    delete process.env.BRANDFETCH_CLIENT_ID
  })

  it('passes only platforms that have a website, mapped for the fetcher', async () => {
    await queueJob()
    await buildWorker().runOnce()

    const [platforms, outputDir, opts] = mockFetchLogos.mock.calls[0]
    expect(platforms.map((p: { slug: string }) => p.slug)).toEqual(['xero', 'stripe'])
    // null outputDir + an onLogo sink is what makes this work on a read-only
    // filesystem.
    expect(outputDir).toBeNull()
    expect(typeof opts.onLogo).toBe('function')
    expect(opts.clientId).toBe('test-client-id')
    expect(opts.delayMs).toBe(400)
  })

  it('honours a vertical filter', async () => {
    await queueJob({ vertical: 'payments' })
    await buildWorker().runOnce()

    const [platforms] = mockFetchLogos.mock.calls[0]
    expect(platforms.map((p: { slug: string }) => p.slug)).toEqual(['stripe'])
  })

  it('stores each logo as the fetcher yields it', async () => {
    const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">logo</svg>')
    mockFetchLogos.mockImplementation(async (_p: unknown, _d: unknown, opts: any) => {
      await opts.onLogo({
        slug: 'xero',
        ext: 'svg',
        contentType: 'image/svg+xml',
        bytes,
        domain: 'xero.com',
      })
      return { fetched: 1, skipped: 0, notFound: 0, throttled: 0, cancelled: false }
    })

    await queueJob()
    await buildWorker().runOnce()

    const row = await logoStore.getLogo('xero', 'svg')
    expect(row!.bytes.equals(bytes)).toBe(true)
    // Attributed to the job, so a purge or audit can trace where it came from.
    expect((await logoStore.countLogos()).count).toBe(1)
  })

  it('skips platforms that already have bytes unless forced', async () => {
    await logoStore.putLogo({
      slug: 'xero',
      ext: 'svg',
      contentType: 'image/svg+xml',
      bytes: Buffer.from('x'),
      sourceDomain: 'xero.com',
      fetchedBy: null,
    })
    await queueJob()
    await buildWorker().runOnce()

    const opts = mockFetchLogos.mock.calls[0][2]
    expect(await opts.isSatisfied('xero')).toBe(true)
    expect(await opts.isSatisfied('stripe')).toBe(false)
  })

  it('refetches everything when forced', async () => {
    await logoStore.putLogo({
      slug: 'xero',
      ext: 'svg',
      contentType: 'image/svg+xml',
      bytes: Buffer.from('x'),
      sourceDomain: 'xero.com',
      fetchedBy: null,
    })
    await queueJob({ force: true })
    await buildWorker().runOnce()

    const opts = mockFetchLogos.mock.calls[0][2]
    expect(await opts.isSatisfied('xero')).toBe(false)
  })

  describe('Referer', () => {
    it('sends this deployment’s own origin, never the project URL', async () => {
      await queueJob()
      await buildWorker().runOnce()

      const opts = mockFetchLogos.mock.calls[0][2]
      expect(opts.referer).toBe('https://os.acme.test')
      expect(opts.referer).not.toMatch(/github\.com/)
    })

    it('prefers the operator-configured referer', async () => {
      await settings.set('logos.fetch_referer', 'https://logos.acme.test', 'admin')
      await queueJob()
      await buildWorker().runOnce()

      expect(mockFetchLogos.mock.calls[0][2].referer).toBe('https://logos.acme.test')
    })

    it('falls back to the company base URL before the admin origin', async () => {
      await adminStore.upsertCompanyInfo({ baseUrl: 'https://api.acme.test' } as never, 'admin')
      await queueJob()
      await buildWorker().runOnce()

      expect(mockFetchLogos.mock.calls[0][2].referer).toBe('https://api.acme.test')
    })

    it('refuses to run when no origin can be determined', async () => {
      await queueJob()
      await buildWorker({ adminUiUrl: '' }).runOnce()

      const job = await logoStore.getJob('lfj_1')
      expect(job!.status).toBe('failed')
      expect(job!.error).toMatch(/Referer/)
      expect(mockFetchLogos).not.toHaveBeenCalled()
    })
  })

  it('surfaces an automated-traffic block as the job error', async () => {
    const { BrandfetchBlockedError } = await import('@opensteward/codegen/logos')
    mockFetchLogos.mockRejectedValue(new BrandfetchBlockedError('https://os.acme.test'))

    await queueJob()
    await buildWorker().runOnce()

    const job = await logoStore.getJob('lfj_1')
    expect(job!.status).toBe('failed')
    // The operator needs to see that this is a permissions problem, not 1,545
    // platforms that happen to have no logo.
    expect(job!.error).toMatch(/automated traffic/i)
    expect(job!.error).toMatch(/caching/i)
  })

  it('records progress counters and the per-vertical breakdown', async () => {
    mockFetchLogos.mockImplementation(async (_p: unknown, _d: unknown, opts: any) => {
      await opts.onProgress({
        index: 0,
        total: 2,
        slug: 'xero',
        domain: 'xero.com',
        outcome: 'fetched',
        ext: 'svg',
      })
      await opts.onProgress({
        index: 1,
        total: 2,
        slug: 'stripe',
        domain: 'stripe.com',
        outcome: 'not_found',
      })
      return { fetched: 1, skipped: 0, notFound: 1, throttled: 0, cancelled: false }
    })

    await queueJob()
    await buildWorker().runOnce()

    const p = (await logoStore.getJob('lfj_1'))!.progress!
    expect(p).toMatchObject({ processed: 2, fetched: 1, notFound: 1, throttled: 0 })
    expect(p.byVertical.accounting).toMatchObject({ fetched: 1 })
    expect(p.byVertical.payments).toMatchObject({ notFound: 1 })
    // Cleared once the run ends so the UI does not claim to still be on one.
    expect(p.currentSlug).toBeNull()
  })

  it('marks the job cancelled when the fetcher reports it', async () => {
    mockFetchLogos.mockResolvedValue({
      fetched: 3,
      skipped: 0,
      notFound: 0,
      throttled: 0,
      cancelled: true,
    })
    await queueJob()
    await buildWorker().runOnce()

    expect((await logoStore.getJob('lfj_1'))!.status).toBe('cancelled')
  })

  it('aborts when the job is switched to cancelling by another replica', async () => {
    mockFetchLogos.mockImplementation(async (_p: unknown, _d: unknown, opts: any) => {
      // A cancel usually lands on the OTHER pod, so the only way this one finds
      // out is by re-reading its own row at a checkpoint.
      await logoStore.requestCancel('lfj_1')
      await opts.onProgress({
        index: 0,
        total: 2,
        slug: 'xero',
        domain: 'xero.com',
        outcome: 'fetched',
      })
      return {
        fetched: 1,
        skipped: 0,
        notFound: 0,
        throttled: 0,
        cancelled: opts.signal.aborted,
      }
    })

    await queueJob()
    await buildWorker().runOnce()

    expect((await logoStore.getJob('lfj_1'))!.status).toBe('cancelled')
  })

  it('breaks the circuit after sustained rate limiting rather than grinding on', async () => {
    mockFetchLogos.mockImplementation(async (_p: unknown, _d: unknown, opts: any) => {
      for (let i = 0; i < 20; i++) {
        await opts.onProgress({
          index: i,
          total: 40,
          slug: 'xero',
          domain: 'xero.com',
          outcome: 'throttled',
        })
      }
      return { fetched: 0, skipped: 0, notFound: 0, throttled: 20, cancelled: true }
    })

    await queueJob()
    await buildWorker().runOnce()

    const job = await logoStore.getJob('lfj_1')
    expect(job!.status).toBe('failed')
    // The remedy has to be in the message — an operator cannot guess it.
    expect(job!.error).toMatch(/logos\.fetch_delay_ms/)
    expect(job!.error).toMatch(/already fetched are kept/)
  })

  it('fails the job when the catalog cannot be read', async () => {
    listCatalog.mockRejectedValue(new Error('integration-server unreachable'))
    await queueJob()
    await buildWorker().runOnce()

    const job = await logoStore.getJob('lfj_1')
    expect(job!.status).toBe('failed')
    expect(job!.error).toMatch(/integration-server unreachable/)
  })

  describe('job-history retention', () => {
    const ageJob = async (id: string, days: number) => {
      await handle.kysely
        .updateTable('logo_fetch_jobs')
        .set({ created_at: Date.now() - days * 24 * 60 * 60 * 1000 })
        .where('id', '=', id)
        .execute()
    }

    it('prunes finished rows past the retention window', async () => {
      await queueJob()
      await logoStore.markCompleted('lfj_1', (await logoStore.getJob('lfj_1'))!.progress!)
      await ageJob('lfj_1', 40)

      await buildWorker().runOnce()

      // Without this the table grows a row per run forever: purging the
      // library clears history, but purging is manual.
      expect(await logoStore.getJob('lfj_1')).toBeNull()
    })

    it('keeps rows inside the window', async () => {
      await queueJob()
      await logoStore.markCompleted('lfj_1', (await logoStore.getJob('lfj_1'))!.progress!)
      await ageJob('lfj_1', 5)

      await buildWorker().runOnce()
      expect(await logoStore.getJob('lfj_1')).not.toBeNull()
    })

    it('keeps everything when retention is 0', async () => {
      await settings.set('logos.job_retention_days', 0, 'admin')
      await queueJob()
      await logoStore.markCompleted('lfj_1', (await logoStore.getJob('lfj_1'))!.progress!)
      await ageJob('lfj_1', 400)

      await buildWorker().runOnce()
      expect(await logoStore.getJob('lfj_1')).not.toBeNull()
    })

    it('sweeps at most once an hour, not on every tick', async () => {
      const worker = buildWorker()
      await worker.runOnce()

      await queueJob()
      await logoStore.markCompleted('lfj_1', (await logoStore.getJob('lfj_1'))!.progress!)
      await ageJob('lfj_1', 40)

      // Second tick within the hour: the sweep is skipped, so the stale row
      // survives until the next window.
      await worker.runOnce()
      expect(await logoStore.getJob('lfj_1')).not.toBeNull()
    })
  })

  it('writes a finish audit entry', async () => {
    await queueJob()
    await buildWorker().runOnce()

    const entries = await adminStore.listAudit()
    const entry = entries.find((e) => e.action === 'logo_fetch.finish')
    expect(entry).toBeDefined()
    // The worker has no human behind it, so the writer is the literal
    // 'system' — same convention as audit.retention.prune.
    expect(entry!.user_id).toBe('system')
    expect(JSON.parse(entry!.detail as string)).toMatchObject({
      jobId: 'lfj_1',
      status: 'completed',
    })
  })

  it('releases the singleton slot however the job ends', async () => {
    listCatalog.mockRejectedValue(new Error('boom'))
    await queueJob()
    await buildWorker().runOnce()
    // An operator has to be able to start another fetch after a failure.
    expect(await logoStore.findActive()).toBeNull()
  })

  it('does not run a second job concurrently in one process', async () => {
    let inFlight = 0
    let maxInFlight = 0
    mockFetchLogos.mockImplementation(async () => {
      maxInFlight = Math.max(maxInFlight, ++inFlight)
      await new Promise((r) => setTimeout(r, 20))
      inFlight--
      return { fetched: 0, skipped: 0, notFound: 0, throttled: 0, cancelled: false }
    })

    await queueJob()
    const worker = buildWorker()
    await Promise.all([worker.runOnce(), worker.runOnce(), worker.runOnce()])
    expect(maxInFlight).toBe(1)
  })
})
