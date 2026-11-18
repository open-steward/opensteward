/**
 * Journey: an operator manages platform logos from Platforms → Logos.
 *
 * The load-bearing case is `logo settings take effect without a restart`: the
 * browse body must be derived from the resolved config on each request
 * (memoised), never captured at boot — a boot-time capture freezes the logo
 * config, so an operator saves a setting, reloads, and sees no change until
 * the container restarts. That test fails if the memo key ever stops tracking
 * the resolved config.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flashOf, flashCookieOf } from '../helpers/flash'

let settingsRows: Array<Record<string, unknown>> = []
let logoJobs: Array<Record<string, unknown>> = []
let logoStatus = { count: 0, totalBytes: 0, lastFetchedAt: null as string | null }

const mockUpdateSetting = vi.fn(async () => ({}))
const mockStartFetch = vi.fn(async () => ({ id: 'lfj_1', status: 'pending' }))
const mockCancelFetch = vi.fn(async () => ({ id: 'lfj_1', status: 'cancelled' }))
const mockListSettings = vi.fn(async () => settingsRows)

function row(key: string, value: unknown, isDefault = false) {
  return {
    key,
    value,
    valueType: 'string',
    defaultValue: '',
    description: '',
    category: 'logos',
    updatedAt: new Date().toISOString(),
    updatedBy: null,
    isDefault,
  }
}

vi.mock('../../src/core/proxy/admin-api-client', async () => {
  // `await import`: vi.mock is hoisted above this file's imports, but the
  // factory body runs later, so it can import what the top level cannot.
  const { adminApiStub } = await import('../helpers/admin-api-stub')
  return {
    AdminApiClient: adminApiStub({
      listRuntimeSettings: mockListSettings,
      updateRuntimeSetting: mockUpdateSetting,
      startLogoFetch: mockStartFetch,
      cancelLogoFetch: mockCancelFetch,
      listLogoFetchJobs: async () => {
        return logoJobs
      },
      getActiveLogoFetch: async () => {
        return logoJobs[0] ?? null
      },
      getLogoStatus: async () => {
        return logoStatus
      },
      purgeLogos: async () => {
        return { deleted: 3 }
      },
      getLoginOptions: async () => {
        return { providers: [], localLoginEnabled: true }
      },
      listConnections: async () => {
        return []
      },
      listPlatforms: async () => {
        return []
      },
    }),
  }
})

const { buildServer } = await import('../../src/core/server')
const { invalidateLogoSettingsCache } = await import('../../src/core/routes/logo-config')

const SESSION_SECRET = 'admin-platforms-logos-secret-long-enough'
let fastify: FastifyInstance

function session(role = 'admin') {
  return fastify.signCookie(JSON.stringify({ id: 'u1', username: 'admin', role, token: 'jwt' }))
}

const logosTab = (role = 'admin') =>
  fastify.inject({
    method: 'GET',
    url: '/platforms?tab=logos',
    cookies: { session: session(role) },
  })

const browseTab = () =>
  fastify.inject({ method: 'GET', url: '/platforms', cookies: { session: session() } })

async function post(url: string, payload: Record<string, string>) {
  const cookie = session()
  // The CSRF token is an HMAC of the session cookie, so it has to be derived
  // from the same value the request sends.
  const { generateCsrfToken } = await import('../../src/core/auth/csrf')
  return fastify.inject({
    method: 'POST',
    url,
    cookies: { session: cookie },
    payload: { ...payload, _csrf: generateCsrfToken(cookie, SESSION_SECRET) },
  })
}

beforeEach(async () => {
  settingsRows = [row('logos.source', 'none', true), row('logos.brandfetch_client_id', '')]
  logoJobs = []
  logoStatus = { count: 0, totalBytes: 0, lastFetchedAt: null }
  invalidateLogoSettingsCache()
  delete process.env.LOGO_SOURCE
  delete process.env.BRANDFETCH_CLIENT_ID

  const built = await buildServer({
    server: { port: 0, host: '127.0.0.1' },
    session: { secret: SESSION_SECRET },
    admin_api: { url: 'http://localhost:3001' },
    docs_server: { url: 'http://localhost:3003' },
    sso: { publicBaseUrl: 'http://localhost:3000' },
  })
  fastify = built.fastify
  await fastify.ready()
})

afterEach(async () => {
  await fastify?.close()
  invalidateLogoSettingsCache()
  vi.clearAllMocks()
})

describe('Journey: an operator manages platform logos', () => {
  it('renders the tab with all three modes and marks the saved one', async () => {
    const res = await logosTab()
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Monogram tiles')
    expect(res.body).toContain('Brandfetch CDN')
    expect(res.body).toContain('Fetch and self-host')
    // The selected card is what tells the operator where they stand.
    expect(res.body).toContain('aria-checked="true"')
  })

  it('does not fall through to the Browse tab', async () => {
    const res = await logosTab()
    expect(res.body).toContain('Logo source')
  })

  it('renders even when the Admin API cannot be read', async () => {
    mockListSettings.mockRejectedValueOnce(new Error('admin-api down'))
    const res = await logosTab()
    // A settings blip must not 500 the page — it degrades to a warning and
    // monogram tiles, the same direction resolveLogoConfig fails in.
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Could not read the logo settings')
  })

  it('is admin-only', async () => {
    expect((await logosTab('operator')).statusCode).toBe(403)
  })

  describe('saving settings', () => {
    it('writes the client ID before the source', async () => {
      const res = await post('/platforms/logos/settings', {
        source: 'cdn',
        brandfetchClientId: 'abc123',
      })
      expect(res.headers.location).toBe('/platforms?tab=logos')
      expect(flashOf(fastify, res)).toEqual([{ tone: 'success', body: 'Logo settings saved.' }])
      expect(mockUpdateSetting.mock.calls.map((c) => c[1])).toEqual([
        'logos.brandfetch_client_id',
        'logos.source',
      ])
    })

    it('refuses cdn with no client ID, and writes nothing', async () => {
      const res = await post('/platforms/logos/settings', { source: 'cdn', brandfetchClientId: '' })
      expect(res.headers.location).toBe('/platforms?tab=logos')
      expect(flashOf(fastify, res)[0].tone).toBe('danger')
      expect(mockUpdateSetting).not.toHaveBeenCalled()
    })

    it('allows cdn when the client ID comes from the environment', async () => {
      process.env.BRANDFETCH_CLIENT_ID = 'from-env'
      invalidateLogoSettingsCache()
      const res = await post('/platforms/logos/settings', { source: 'cdn', brandfetchClientId: '' })
      expect(res.headers.location).toBe('/platforms?tab=logos')
      expect(flashOf(fastify, res)[0].tone).toBe('success')
    })

    it('rejects a mode that is not one of the three', async () => {
      const res = await post('/platforms/logos/settings', { source: 'cnd' })
      expect(flashOf(fastify, res)[0].tone).toBe('danger')
      expect(mockUpdateSetting).not.toHaveBeenCalled()
    })

    it('always returns to the logos tab', async () => {
      for (const payload of [{ source: 'none' }, { source: 'cdn' }, { source: 'nonsense' }]) {
        const res = await post('/platforms/logos/settings', payload)
        // The navigational param survives; the message travels in the flash,
        // not the query string.
        expect(res.headers.location).toMatch(/tab=logos/)
        expect(res.headers.location).not.toContain('&')
      }
    })
  })

  describe('the saved mode reaches the catalog', () => {
    it('takes effect on the next request, with no restart', async () => {
      // platforms-ui always ships the CDN URL builder in its client script and
      // branches at runtime, so assert on the injected config rather than the
      // presence of the hostname.
      const injected = (body: string) => /var LOGO_SOURCE = "([^"]*)"/.exec(body)?.[1]
      const injectedId = (body: string) => /var BRANDFETCH_CLIENT_ID = "([^"]*)"/.exec(body)?.[1]

      expect(injected((await browseTab()).body)).toBe('none')

      settingsRows = [row('logos.source', 'cdn'), row('logos.brandfetch_client_id', 'abc123')]
      invalidateLogoSettingsCache()

      // Same server instance — a boot-time capture of the browse body would
      // fail this.
      const afterSave = (await browseTab()).body
      expect(injected(afterSave)).toBe('cdn')
      expect(injectedId(afterSave)).toBe('abc123')

      settingsRows = [row('logos.source', 'none'), row('logos.brandfetch_client_id', 'abc123')]
      invalidateLogoSettingsCache()
      expect(injected((await browseTab()).body)).toBe('none')
    })
  })

  describe('degraded states are surfaced', () => {
    it('warns when cdn is saved without a client ID', async () => {
      settingsRows = [row('logos.source', 'cdn'), row('logos.brandfetch_client_id', '')]
      invalidateLogoSettingsCache()

      const res = await logosTab()
      expect(res.body).toContain('Showing monogram tiles')
      expect(res.body).toContain('no Brandfetch client ID is')
    })

    it('says so when self-hosting is on but nothing is stored', async () => {
      settingsRows = [row('logos.source', 'local'), row('logos.brandfetch_client_id', 'abc')]
      invalidateLogoSettingsCache()

      const res = await logosTab()
      expect(res.body).toContain('no logos are stored yet')
    })
  })

  describe('fetch controls', () => {
    beforeEach(() => {
      // Fetching is gated on self-hosting; these tests are about what happens
      // once that is chosen.
      settingsRows = [row('logos.source', 'local'), row('logos.brandfetch_client_id', 'abc123')]
      invalidateLogoSettingsCache()
    })

    it('starts a fetch and returns to the tab', async () => {
      const res = await post('/platforms/logos/fetch', { scope: 'missing' })
      expect(mockStartFetch).toHaveBeenCalledWith('jwt', { force: false, vertical: undefined })
      expect(res.headers.location).toBe('/platforms?tab=logos')
    })

    it('passes force through for a full refetch', async () => {
      await post('/platforms/logos/fetch', { scope: 'all', vertical: 'accounting' })
      expect(mockStartFetch).toHaveBeenCalledWith('jwt', { force: true, vertical: 'accounting' })
    })

    it('surfaces a refusal from the Admin API', async () => {
      mockStartFetch.mockRejectedValueOnce({
        response: { data: { error: 'A logo fetch is already running.' } },
      })
      const res = await post('/platforms/logos/fetch', { scope: 'missing' })
      // The message reaches the operator via the flash, and its tone is
      // assertable — which a URL parameter could never express.
      expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'danger' })
      expect(flashOf(fastify, res)[0].body).toContain('already running')
    })

    it('renders live progress for a running job', async () => {
      logoJobs = [
        {
          id: 'lfj_1',
          status: 'running',
          error: null,
          progress: {
            total: 1545,
            processed: 900,
            fetched: 800,
            skipped: 20,
            notFound: 78,
            throttled: 2,
            currentSlug: 'xero',
            currentVertical: 'accounting',
            etaMs: 600000,
            byVertical: {},
            lastError: null,
          },
        },
      ]
      logoStatus = {
        count: 800,
        totalBytes: 8 * 1024 * 1024,
        lastFetchedAt: new Date().toISOString(),
      }

      const res = await logosTab()
      expect(res.body).toContain('58%')
      expect(res.body).toContain('Cancel fetch')
      // Skips are not failures — roughly 70 platforms have no logo at all, and
      // an operator reading those as errors would retry forever.
      expect(res.body).toContain('with no logo available')
      // Throttling gets its own explanation rather than looking like breakage.
      expect(res.body).toContain('rate-limiting')
    })

    it('cancels without navigating away when asked for JSON', async () => {
      logoJobs = [{ id: 'lfj_1', status: 'running', error: null, progress: null }]
      const cookie = session()
      const { generateCsrfToken } = await import('../../src/core/auth/csrf')
      const res = await fastify.inject({
        method: 'POST',
        url: '/platforms/logos/cancel',
        cookies: { session: cookie },
        headers: { accept: 'application/json' },
        payload: { id: 'lfj_1', _csrf: generateCsrfToken(cookie, SESSION_SECRET) },
      })
      expect(res.statusCode).toBe(200)
      expect(mockCancelFetch).toHaveBeenCalledWith('jwt', 'lfj_1')
    })
  })

  it('marks Platforms as the current page in the sidebar', async () => {
    // Render-level proof that the helper is actually wired into the layout —
    // the unit tests cover the matching rules, this covers the plumbing.
    const res = await logosTab()
    expect(res.body).toContain(
      '<a class="sidebar__link sidebar__link--active" aria-current="page" href="/platforms">',
    )
    // ...and that a query string does not make it a different page.
    expect(res.body.match(/aria-current="page"/g)).toHaveLength(1)
  })

  describe('the caching caveat is unmissable', () => {
    it('bolds the sentence about needing an agreement', async () => {
      const res = await logosTab()
      expect(res.body).toMatch(
        /<strong>\s*This is caching, which their terms say needs an agreement on your own account\.\s*<\/strong>/,
      )
    })

    it('arms a confirm before self-hosting can be saved', async () => {
      const res = await logosTab()
      // Selecting the mode that needs an agreement asks first; the other two
      // modes carry no prompt.
      expect(res.body).toContain('MODE_CONFIRMS')
      expect(res.body).toMatch(/agreement in place/)
      expect(res.body).toContain('window.confirm(question)')
    })
  })

  describe('stored-logo controls', () => {
    beforeEach(() => {
      settingsRows = [row('logos.source', 'local'), row('logos.brandfetch_client_id', 'abc123')]
      invalidateLogoSettingsCache()
    })

    it('offers neither fetch-remaining nor delete when nothing is stored', async () => {
      logoStatus = { count: 0, totalBytes: 0, lastFetchedAt: null }
      const res = await logosTab()
      // "Remaining" would just mean "all", which the main form already does.
      expect(res.body).not.toContain('Fetch remaining logos')
      expect(res.body).not.toContain('Delete stored logos')
    })

    it('offers both once logos are stored', async () => {
      logoStatus = { count: 472, totalBytes: 5_000_000, lastFetchedAt: new Date().toISOString() }
      const res = await logosTab()
      expect(res.body).toContain('Fetch remaining logos')
      expect(res.body).toContain('Delete stored logos')
    })

    it('fetch-remaining asks only for what is missing', async () => {
      await post('/platforms/logos/fetch', { scope: 'missing' })
      expect(mockStartFetch).toHaveBeenCalledWith('jwt', { force: false, vertical: undefined })
    })

    it('disables both while a fetch is running', async () => {
      logoStatus = { count: 472, totalBytes: 5_000_000, lastFetchedAt: null }
      logoJobs = [{ id: 'lfj_1', status: 'running', error: null, progress: null }]
      const res = await logosTab()
      const remaining = res.body.slice(res.body.indexOf('logoFetchRemaining'))
      expect(remaining.slice(0, 200)).toContain('disabled')
    })

    it('deletes stored logos and reports it as a success, not an error', async () => {
      const res = await post('/platforms/logos/purge', {})
      expect(res.headers.location).toBe('/platforms?tab=logos')
      // A success is not painted as an error — asserted on the flash payload
      // rather than a fragile regex over markup.
      expect(flashOf(fastify, res)).toEqual([{ tone: 'success', body: 'Deleted 3 stored logos.' }])

      const page = await fastify.inject({
        method: 'GET',
        url: '/platforms?tab=logos',
        cookies: { session: session(), os_flash: flashCookieOf(res)! },
      })
      expect(page.body).toContain('Deleted 3 stored logos')
    })

    it('confirms before deleting', async () => {
      logoStatus = { count: 472, totalBytes: 5_000_000, lastFetchedAt: null }
      const res = await logosTab()
      expect(res.body).toContain('data-logo-purge')
      expect(res.body).toMatch(/Delete all .* stored logos\?/)
    })
  })

  describe('a finished run is history, not live progress', () => {
    const cancelled = {
      id: 'lfj_1',
      status: 'cancelled',
      error: null,
      progress: {
        total: 1545,
        processed: 400,
        fetched: 380,
        skipped: 0,
        notFound: 20,
        throttled: 0,
        currentSlug: null,
        currentVertical: null,
        etaMs: null,
        byVertical: {},
        lastError: null,
      },
    }

    it('does not re-announce a cancelled run on every reload', async () => {
      logoJobs = [cancelled]
      logoStatus = { count: 380, totalBytes: 4_000_000, lastFetchedAt: null }

      const res = await logosTab()
      // The poller must start only for a live job — polling a terminal job
      // would treat its status as news and toast "cancelled" on every reload.
      expect(res.body).toContain('data-logo-active=""')
      expect(res.body).toContain("card.getAttribute('data-logo-active') === '1'")
      expect(res.body).toContain('window.oiToast && sawActive')
    })

    it('lists a cancelled run in Recent fetches rather than as live progress', async () => {
      logoJobs = [cancelled]
      const res = await logosTab()
      // The card is for a run in flight. A cancelled run is history, and the
      // operator needs to see it — excluding the newest entry from the list
      // would hide it.
      expect(res.body).toContain('Recent fetches')
      expect(res.body).toContain('cancelled')
      expect(res.body).toContain('data-logo-active=""')
    })

    it('still polls and announces while a run is active', async () => {
      logoJobs = [{ ...cancelled, status: 'running' }]
      const res = await logosTab()
      expect(res.body).toContain('data-logo-active="1"')
      expect(res.body).toContain('Fetch progress')
    })
  })

  describe('deleting stored logos', () => {
    it('keeps the run history after the library is emptied', async () => {
      // The history is a log of what ran, and it is most useful precisely when
      // the library is empty — including runs that were cancelled and stored
      // nothing. Deleting it with the logos would hide Recent fetches exactly
      // when they matter.
      logoJobs = [
        {
          id: 'lfj_1',
          status: 'cancelled',
          error: null,
          force: false,
          vertical: null,
          slug: null,
          startedAt: '2026-08-26T10:00:00.000Z',
          completedAt: '2026-08-26T10:05:00.000Z',
          progress: null,
        },
      ]
      logoStatus = { count: 0, totalBytes: 0, lastFetchedAt: null }

      const res = await fastify.inject({
        method: 'GET',
        url: '/platforms?tab=logos',
        cookies: { session: session() },
      })
      expect(res.body).toContain('No logos stored yet')
      // The library card is the single source of truth for what is stored now;
      // the progress card stays hidden because nothing is running.
      expect(res.body).toContain('Recent fetches')
      expect(res.body).toContain('data-logo-active=""')
    })

    describe('describes the real effect of deleting, per mode', () => {
      const withMode = async (mode: string) => {
        settingsRows = [row('logos.source', mode), row('logos.brandfetch_client_id', 'abc123')]
        logoStatus = { count: 380, totalBytes: 4_000_000, lastFetchedAt: null }
        invalidateLogoSettingsCache()
        return (await logosTab()).body
      }

      it('self-hosting: reverts to monograms', async () => {
        const body = await withMode('local')
        expect(body).toContain('reverts to monogram tiles')
      })

      it('cdn: says nothing on screen changes', async () => {
        // The catalog hotlinks in this mode, so the stored copies are not what
        // is being displayed — claiming a revert would be plainly wrong.
        const body = await withMode('cdn')
        expect(body).toContain('changes nothing on screen')
        expect(body).not.toContain('reverts to monogram tiles')
      })

      it('monograms: says nothing on screen changes', async () => {
        const body = await withMode('none')
        expect(body).toContain('changes nothing on screen')
        expect(body).not.toContain('reverts to monogram tiles')
      })

      it('the confirm dialog carries the same wording as the hint', async () => {
        const body = await withMode('cdn')
        expect(body).toContain('DELETE_EFFECT')
        // `count`, not `n` — `n` would shadow the n() number formatter
        // declared in the same scope.
        expect(body).toContain("window.confirm('Delete all ' + count + ' stored logos?")
      })
    })
  })

  describe('fetch history', () => {
    const finished = (id: string, status: string, over: Record<string, unknown> = {}) => ({
      id,
      status,
      error: null,
      force: false,
      vertical: null,
      slug: null,
      startedAt: '2026-08-26T10:00:00.000Z',
      completedAt: '2026-08-26T10:40:00.000Z',
      progress: {
        total: 1545,
        processed: 1545,
        fetched: 1402,
        skipped: 0,
        notFound: 143,
        throttled: 0,
        currentSlug: null,
        currentVertical: null,
        etaMs: null,
        byVertical: {},
        lastError: null,
      },
      ...over,
    })

    it('answers "did last night’s run finish?" without the audit log', async () => {
      // The newest run owns the "Last fetch" card; older ones fill the table.
      logoJobs = [finished('lfj_2', 'completed'), finished('lfj_1', 'cancelled')]
      const res = await logosTab()
      expect(res.body).toContain('Recent fetches')
      expect(res.body).toContain('1,402')
      expect(res.body).toContain('40 min')
    })

    it('lists a single finished run', async () => {
      logoJobs = [finished('lfj_1', 'completed')]
      const res = await logosTab()
      // One run is still history worth showing. Excluding the newest entry
      // would hide the whole list after a single cancelled fetch.
      expect(res.body).toContain('Recent fetches')
      expect(res.body).toContain('1,402')
    })

    it('is absent when nothing has ever run', async () => {
      logoJobs = []
      expect((await logosTab()).body).not.toContain('Recent fetches')
    })

    it('leaves a run that is still going to the progress card', async () => {
      logoJobs = [finished('lfj_1', 'running')]
      const res = await logosTab()
      // Live progress belongs in the card; the log is for finished runs.
      expect(res.body).toContain('data-logo-active="1"')
      expect(res.body).not.toContain('Recent fetches')
    })

    it('shows why a run failed', async () => {
      logoJobs = [
        finished('lfj_1', 'running'),
        finished('lfj_0', 'failed', { error: 'Brandfetch refused these requests' }),
      ]
      const res = await logosTab()
      expect(res.body).toContain('Recent fetches')
      expect(res.body).toContain('Brandfetch refused these requests')
    })
  })

  describe('fetching is gated on self-hosting', () => {
    const withMode = async (mode: string) => {
      settingsRows = [row('logos.source', mode), row('logos.brandfetch_client_id', 'abc123')]
      invalidateLogoSettingsCache()
    }

    it('offers the controls when self-hosting is selected', async () => {
      await withMode('local')
      const res = await logosTab()
      // The element, not the label text — the poller's inline JS also carries
      // the string "Start fetch" for its own button-state toggle.
      expect(res.body).toContain('id="logoFetchStart"')
      expect(res.body).not.toContain('Fetching needs')
    })

    it.each(['cdn', 'none'])('withholds them in %s mode, and says why', async (mode) => {
      await withMode(mode)
      const res = await logosTab()
      // Storing logos nothing serves burns forty minutes and the deployment's
      // Brandfetch quota for nothing.
      expect(res.body).not.toContain('id="logoFetchStart"')
      expect(res.body).toContain('Fetching needs')
    })

    it('names the compliance reason in cdn mode specifically', async () => {
      await withMode('cdn')
      const res = await logosTab()
      // Storing IS caching under their terms, and the agreement confirm is
      // attached to choosing self-hosting — so fetching from cdn mode would
      // slip past it.
      expect(res.body).toContain('needs an agreement on your own account')
    })

    it('hides "Fetch remaining" too, but keeps Delete available', async () => {
      logoStatus = { count: 380, totalBytes: 4_000_000, lastFetchedAt: null }
      await withMode('cdn')
      const res = await logosTab()
      expect(res.body).not.toContain('id="logoFetchRemaining"')
      // Deleting stored logos stays available in every mode — an operator who
      // switched to cdn should still be able to clear the library.
      expect(res.body).toContain('Delete stored logos')
    })

    it.each(['cdn', 'none'])('refuses a crafted POST in %s mode', async (mode) => {
      await withMode(mode)
      const res = await post('/platforms/logos/fetch', { scope: 'missing' })

      // A hidden button is presentation; this is the control.
      expect(mockStartFetch).not.toHaveBeenCalled()
      expect(flashOf(fastify, res)[0]).toMatchObject({ tone: 'danger' })
      expect(flashOf(fastify, res)[0].body).toContain('Fetch and self-host')
    })

    it('allows the POST once self-hosting is selected', async () => {
      await withMode('local')
      await post('/platforms/logos/fetch', { scope: 'missing' })
      expect(mockStartFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('status endpoint', () => {
    it('returns the job and stored totals, uncached', async () => {
      logoJobs = [{ id: 'lfj_1', status: 'running', error: null, progress: null }]
      const res = await fastify.inject({
        method: 'GET',
        url: '/platforms/logos/status',
        cookies: { session: session() },
      })
      expect(res.statusCode).toBe(200)
      expect(res.headers['cache-control']).toBe('no-store')
      expect(JSON.parse(res.body).job.id).toBe('lfj_1')
    })
  })

  describe('a finished run leaves the tab correct without a manual reload', () => {
    const panel = (role = 'admin') =>
      fastify.inject({
        method: 'GET',
        url: '/platforms/logos/panel',
        cookies: { session: session(role) },
      })

    const done = (status: string, over: Record<string, unknown> = {}) => ({
      id: 'lfj_1',
      status,
      error: null,
      startedAt: '2026-08-27T09:00:00.000Z',
      completedAt: '2026-08-27T09:20:00.000Z',
      progress: {
        total: 1545,
        processed: 900,
        fetched: 412,
        notFound: 3,
        skipped: 0,
        throttled: 0,
      },
      ...over,
    })

    it('renders each refreshable region even when it has nothing in it', async () => {
      // The property the whole mechanism rests on. Both the history card and
      // the stored-logo buttons are behind an `if`, so on a tab that has never
      // run a fetch they are absent from the DOM entirely — and a swap has
      // nowhere to put them. The wrappers are what make them addressable.
      logoJobs = []
      logoStatus = { count: 0, totalBytes: 0, lastFetchedAt: null }
      const res = await logosTab()
      expect(res.body).toContain('data-logo-region="summary"')
      expect(res.body).toContain('data-logo-region="stored-actions"')
      expect(res.body).toContain('data-logo-region="history"')
      // Genuinely empty, so the assertion above is not passing on stale content.
      expect(res.body).not.toContain('Recent fetches')
    })

    it('refreshes those regions when a run finishes, instead of reloading', async () => {
      logoJobs = [{ id: 'lfj_1', status: 'running', error: null, progress: null }]
      const res = await logosTab()
      expect(res.body).toContain('refreshRegions()')
      expect(res.body).toContain('data-logo-panel-url="/platforms/logos/panel"')
      // Without the swap, the operator's only recourse is a full reload.
      expect(res.body).not.toContain('window.location.reload()')
    })

    it('serves the cancelled run in the panel it swaps in', async () => {
      // The failure this pins: after cancel, the run must appear under Recent
      // fetches without a manual reload.
      logoJobs = [done('cancelled')]
      logoStatus = { count: 412, totalBytes: 4_000_000, lastFetchedAt: null }
      const res = await panel()
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('Recent fetches')
      expect(res.body).toContain('cancelled')
      expect(res.body).toContain('data-logo-region="history"')
    })

    it('carries the stored-logo buttons a cancelled run turns on', async () => {
      // A cancelled run is the case that creates them: some logos landed, the
      // rest did not, so "Fetch remaining" becomes meaningful for the first
      // time — on a page built when the count was still zero.
      settingsRows = [row('logos.source', 'local'), row('logos.brandfetch_client_id', 'cid')]
      invalidateLogoSettingsCache()
      logoJobs = [done('cancelled')]
      logoStatus = { count: 412, totalBytes: 4_000_000, lastFetchedAt: null }
      const res = await panel()
      expect(res.body).toContain('Fetch remaining logos')
      expect(res.body).toContain('Delete stored logos')
      expect(res.body).toContain('data-logo-region="stored-actions"')
    })

    it('is a fragment, not the catalog', async () => {
      // /platforms builds every adapter row in all nine verticals. Refetching
      // it for one card is the cost this endpoint exists to avoid.
      logoJobs = [done('completed')]
      const res = await panel()
      expect(res.headers['cache-control']).toBe('no-store')
      expect(res.body).not.toContain('<!DOCTYPE html>')
      expect(res.body).not.toContain('sidebar__link')
      expect(res.body).not.toContain('tab=browse')
    })

    it('still needs a session', async () => {
      const res = await fastify.inject({ method: 'GET', url: '/platforms/logos/panel' })
      expect(res.statusCode).toBe(302)
    })

    it('keeps the delete confirm working after a swap', async () => {
      // The confirm must not be bound to the form node: the form lives inside
      // a swapped region, so a node-bound handler would be dropped the first
      // time a run finished — deleting every stored logo on one click.
      logoStatus = { count: 412, totalBytes: 4_000_000, lastFetchedAt: null }
      const res = await logosTab()
      expect(res.body).toContain("closest('[data-logo-purge]')")
      expect(res.body).not.toContain('purgeForm.addEventListener')
    })
  })

  describe('the wizard shares the partial but not the history', () => {
    it('serves its own panel', async () => {
      // Without this route the partial's refresh 404s on the wizard, since the
      // URL is derived from actionBase.
      const res = await fastify.inject({
        method: 'GET',
        url: '/setup/wizard/logos/panel',
        cookies: { session: session() },
      })
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('data-logo-region="summary"')
    })

    it('leaves history out, as the step itself does', async () => {
      // The wizard is a first-run flow. A panel that returned history would
      // make a table appear there that the page never renders otherwise.
      logoJobs = [
        {
          id: 'lfj_1',
          status: 'cancelled',
          error: null,
          startedAt: '2026-08-27T09:00:00.000Z',
          completedAt: '2026-08-27T09:20:00.000Z',
          progress: { total: 10, processed: 5, fetched: 5, notFound: 0, skipped: 0, throttled: 0 },
        },
      ]
      const res = await fastify.inject({
        method: 'GET',
        url: '/setup/wizard/logos/panel',
        cookies: { session: session() },
      })
      expect(res.body).not.toContain('Recent fetches')
    })
  })
})
