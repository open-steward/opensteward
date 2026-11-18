/**
 * Admin UI for platform management.
 *
 *   GET  /platforms                         list view (admin-only)
 *   GET  /platforms/:vertical/:slug         detail (admin-only)
 *   POST /platforms/:vertical/:slug         save config + enable
 *   POST /platforms/:vertical/:slug/disable disable without clearing config
 *
 * The list view fans out `apiClient.listPlatforms(token, vertical)` for each
 * of the four verticals plus one `apiClient.listConnections` call to compute
 * connection counts. Filtering happens server-side via `?vertical`/`?search`/
 * `?status` so each keystroke is just a fresh GET — no client JS needed.
 *
 * The detail view prefills via the redacted `getPlatformConfig` endpoint, so
 * the encrypted `clientSecret` never re-traverses the wire after initial
 * entry. The form's POST handler drops the `clientSecret` field if blank;
 * the backend's `setConfig` merges with stored config so non-secret edits
 * leave the secret intact.
 */
import type { FastifyInstance } from 'fastify'
import { renderPlatformsBody } from '@opensteward/platforms-ui'
import { resolveLogoConfig, type LogoConfig } from '@opensteward/shared'
import {
  loadLogoSettings,
  invalidateLogoSettingsCache,
  LOGO_MODES,
  LOGO_SOURCE_KEY,
  LOGO_CLIENT_ID_KEY,
  renderLogoPanel,
} from './logo-config'
import { requireRole } from '../auth/middleware'
import { flashError, flashSuccess } from '../flash'
import type { AdminApiClient, UnsupportedPlatformInfo } from '../proxy/admin-api-client'
import { buildPlatformConfig } from './platform-config-body'
import { formatBackendError } from '../proxy/format-backend-error'
import { applyTableQuery, parseTableQuery, type TableSpec } from '../views/table-controls'
import { KNOWN_VERTICALS, VERTICAL_LABELS } from '../verticals'

// 1,545 platforms in one response is the reason the Configure tab — the only
// table in this plan — paginates at all.
const PLATFORMS_PAGE_LIMIT = 50

/**
 * Which columns of the Configure tab sort and filter, and on what.
 *
 * Platform matches slug only (`legacy: 'search'`, mirroring the `?search=`
 * param this absorbs): `listPlatforms` returns no display name on the row
 * (admin-api-client.ts's `listPlatforms` return type), and the cell renders
 * `row.slug` — a wider match against a catalog display name would need a
 * `listCatalog()` join, a real follow-up and not this task (see the plan's
 * corrected-manifests.md, Task 8).
 *
 * `status` (configured/enabled/connected/all) is deliberately NOT a column
 * here: it is a cross-cutting view over three different columns at once,
 * not a single field one column could filter or sort by, so it stays a
 * plain control above the table (see the view) and rides `preserve` so its
 * value survives a sort click or a pagination link the same way a real
 * column's filter does.
 *
 * Enabled and Configured are sort-only: their cells render a badge reading
 * "Enabled"/"Configured" or an em-dash, never the raw 'yes'/'no' sorted on
 * here — allowed because THE RULE THAT MATTERS MOST (an accessor must match
 * what the cell renders) binds only columns with a `filter`, and neither of
 * these has one.
 */
const PLATFORMS_TABLE: TableSpec = {
  id: 'platforms-filters',
  baseUrl: '/platforms',
  // `tab` decides which body renders at all, so losing it drops the operator
  // back to Browse on every sort click.
  preserve: ['tab', 'status'],
  columns: [
    {
      key: 'platform',
      header: 'Platform',
      sortable: true,
      filter: 'text',
      legacy: 'search',
      get: (row: any) => row.slug,
    },
    {
      key: 'vertical',
      header: 'Vertical',
      sortable: true,
      filter: 'text',
      legacy: 'vertical',
      get: (row: any) => row.vertical,
    },
    {
      key: 'enabled',
      header: 'Enabled',
      sortable: true,
      // Matches the old hardcoded <thead>'s `text-align: center` on this
      // header — the manifest replaced that markup, but the <td>s below
      // (:185) still centre their badge/em-dash, so the header must too or
      // the column visibly misaligns against its own cells.
      thAttrs: 'style="text-align: center"',
      get: (row: any) => (row.enabled ? 'yes' : 'no'),
    },
    {
      key: 'configured',
      header: 'Configured',
      sortable: true,
      thAttrs: 'style="text-align: center"',
      get: (row: any) => (row.hasConfig ? 'yes' : 'no'),
    },
    {
      key: 'connections',
      header: 'Connections',
      sortable: true,
      thAttrs: 'style="text-align: right"',
      get: (row: any) => row.connectionCount ?? 0,
    },
    { key: 'actions', header: '', thAttrs: 'style="text-align: right"' },
  ],
}

// Pre-rendered Browse-tab body. Same platforms-ui component the docs-server
// catalog uses, but with `showOverlay: true` (configured chip + connection
// count) and `configureBasePath: '/platforms'` so each card gains a
// Configure / Edit-config button shortcutting to the detail view.
//
// `guideHrefBase` is configured per-deployment (env DOCS_SERVER_URL or
// admin's config.yml docs_server.url) and prefixes the "Guide" link so
// it resolves on docs-server's origin rather than the admin's. Built
// lazily so the env var has been read before renderPlatformsBody runs.
function buildBrowseBody(guideHrefBase: string, logo: LogoConfig): string {
  return renderPlatformsBody({
    dataUrl: '/data/platforms/platforms.json',
    logoBasePath: '/data/platforms/logos',
    showOverlay: true,
    configureBasePath: '/platforms',
    guideHrefBase,
    // Logos are not shipped; the resolved logo config decides whether this
    // deployment loads any. Default 'none' means the admin UI makes no
    // third-party request — see docs/operations/platform-logos.md.
    ...logo,
  })
}

type VerticalName = (typeof KNOWN_VERTICALS)[number]

interface PlatformListRow {
  vertical: VerticalName
  slug: string
  enabled: boolean
  hasConfig: boolean
  connectionCount: number
  /** True when at least one connection for this platform is in `platform_error`
   *  (the OAuth client id/secret was rejected — operator must fix it). */
  credsInvalid: boolean
  /** Set when this platform cannot be enabled or connected today — see
   *  UnsupportedPlatformInfo. */
  unsupported?: UnsupportedPlatformInfo
}

function isKnownVertical(v: string): v is VerticalName {
  return (KNOWN_VERTICALS as readonly string[]).includes(v)
}

export function createPlatformsRoutes(apiClient: AdminApiClient, opts: { docsServerUrl: string }) {
  // Memoised per resolved config, never built once at registration — a
  // boot-time constant would freeze the logo config until a restart, so an
  // operator changing the mode would see no effect. Rebuilding is cheap
  // string concatenation, but the Browse tab is this route's default page, so
  // the memo keeps steady state to a single Map lookup.
  const browseCache = new Map<string, string>()
  function browseBodyFor(logo: LogoConfig): string {
    const key = `${logo.logoSource}\u0000${logo.brandfetchClientId ?? ''}`
    const hit = browseCache.get(key)
    if (hit) return hit
    // Bounded in practice — three modes times however many client IDs an
    // operator types in one process lifetime. Clearing wholesale beats an LRU
    // for a map this small.
    if (browseCache.size > 8) browseCache.clear()
    const html = buildBrowseBody(opts.docsServerUrl, logo)
    browseCache.set(key, html)
    return html
  }
  return async function platformsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireRole('admin'))

    // ── List view (two tabs: Browse + Configure) ───────────────────────
    // Default tab = Browse (the public-style catalog with Configure buttons).
    // Configure tab shows only platforms the operator has actually configured
    // — list / edit. ?tab=configure switches; bare /platforms shows Browse.
    fastify.get<{
      Querystring: {
        tab?: string
        vertical?: string
        search?: string
        status?: string
        sort?: string
        dir?: string
        page?: string
        f_platform?: string
        f_vertical?: string
      }
    }>('/platforms', async (request, reply) => {
      const tab =
        request.query.tab === 'configure'
          ? 'configure'
          : request.query.tab === 'logos'
            ? 'logos'
            : 'browse'
      const token = request.sessionUser!.token

      // Both the Browse and Logos tabs need the effective config; Configure
      // does not. A failure here must not blank the catalog — falling back to
      // monograms is the same direction resolveLogoConfig already fails in.
      const logoSettings =
        tab === 'browse' || tab === 'logos'
          ? await loadLogoSettings(apiClient, token).catch(() => null)
          : null
      const logoJob =
        tab === 'logos' ? await apiClient.getActiveLogoFetch(token).catch(() => null) : null
      const logoStatus =
        tab === 'logos' ? await apiClient.getLogoStatus(token).catch(() => null) : null
      // Recent runs, so "did last night's fetch finish?" is answerable without
      // going to the audit log.
      const logoHistory =
        tab === 'logos' ? await apiClient.listLogoFetchJobs(token).catch(() => []) : []

      // Both tabs need the same totals strip so we always fetch. Every
      // vertical, not a hardcoded subset: this listed five of nine, so four
      // verticals' adapters were invisible here and the totals under-counted
      // by hundreds.
      const unavailable: string[] = []
      const [perVertical, connections] = await Promise.all([
        Promise.all(
          KNOWN_VERTICALS.map(async (vertical) => {
            try {
              const rows = await apiClient.listPlatforms(token, vertical)
              return rows.map((a) => ({ ...a, vertical }))
            } catch {
              // A vertical admin-api does not know 404s here. Record it — the
              // silent `.catch(() => [])` this replaces is precisely what hid
              // payments dropping out of the totals.
              unavailable.push(vertical)
              return []
            }
          }),
        ),
        apiClient.listConnections(token).catch(() => []),
      ])

      const connCounts = new Map<string, number>()
      const credsInvalidKeys = new Set<string>()
      for (const c of connections) {
        const key = `${c.vertical}/${c.platform}`
        connCounts.set(key, (connCounts.get(key) ?? 0) + 1)
        if (c.status === 'platform_error') credsInvalidKeys.add(key)
      }

      const all: PlatformListRow[] = perVertical.flat().map((row) => ({
        ...row,
        connectionCount: connCounts.get(`${row.vertical}/${row.slug}`) ?? 0,
        credsInvalid: credsInvalidKeys.has(`${row.vertical}/${row.slug}`),
      }))

      const totals = {
        all: all.length,
        configured: all.filter((r) => r.hasConfig).length,
        enabled: all.filter((r) => r.enabled).length,
        connected: all.filter((r) => r.connectionCount > 0).length,
      }

      // Configure tab applies the Platform/Vertical filters and any sort
      // through the table-controls contract, plus the cross-cutting `status`
      // view (configured/enabled/connected/all) — defaults to
      // status=configured so operators see only what they've actually wired
      // up. `status` rides `preserve` rather than `applyTableQuery` since it
      // is not a column (see PLATFORMS_TABLE's doc comment).
      const tableState = parseTableQuery(request.query, PLATFORMS_TABLE)
      const status = tableState.extra.status || (tab === 'configure' ? 'configured' : 'all')

      const statusFiltered = all.filter((row) => {
        if (status === 'configured' && !row.hasConfig) return false
        if (status === 'enabled' && !row.enabled) return false
        if (status === 'connected' && row.connectionCount === 0) return false
        return true
      })
      // Filter and sort BEFORE slicing — sorting a page rather than the
      // whole filtered set would reorder a fraction of the rows while
      // looking authoritative, and slicing the unfiltered set would put the
      // wrong rows on page 2.
      const filtered = applyTableQuery(statusFiltered, tableState, PLATFORMS_TABLE)
      const rowsTotal = filtered.length
      const start = (tableState.page - 1) * PLATFORMS_PAGE_LIMIT
      const pageRows = filtered.slice(start, start + PLATFORMS_PAGE_LIMIT)

      return reply.view('platforms/index.ejs', {
        user: request.sessionUser,
        tab,
        browseBody: browseBodyFor(logoSettings?.config ?? { logoSource: 'none' }),
        logo: logoSettings?.config ?? null,
        logoSettingsUnavailable: tab === 'logos' && logoSettings === null,
        logoJob,
        logoStatus,
        logoHistory,
        logoModes: LOGO_MODES,
        rows: pageRows,
        rowsTotal,
        pageLimit: PLATFORMS_PAGE_LIMIT,
        totals,
        unavailable,
        status,
        tableSpec: PLATFORMS_TABLE,
        tableState,
        verticals: KNOWN_VERTICALS,
      })
    })

    // ── Detail view ──────────────────────────────────────────────────────
    fastify.get<{
      Params: { vertical: string; slug: string }
    }>('/platforms/:vertical/:slug', async (request, reply) => {
      const { vertical, slug } = request.params
      if (!isKnownVertical(vertical)) {
        return reply.status(404).send({ error: 'Unknown vertical' })
      }

      const token = request.sessionUser!.token
      // `listPlatforms` is uncaught: `[]` makes the `find` below miss and the
      // page answers "Unknown platform" — telling the operator the adapter
      // does not exist when admin-api merely could not be reached. The 404
      // must only ever come from a list we actually got. The overlays stay
      // best-effort: they decorate a page that is already correct without
      // them, and each renders its own absence honestly.
      const [platforms, prefill, connections, scopeGroups] = await Promise.all([
        apiClient.listPlatforms(token, vertical),
        apiClient.getPlatformConfig(token, vertical, slug).catch(() => null),
        apiClient.listConnections(token, { vertical, platform: slug }).catch(() => []),
        apiClient.listScopeGroups(token, { vertical, platform: slug }).catch(() => []),
      ])

      const platform = platforms.find((a) => a.slug === slug)
      if (!platform) return reply.status(404).send({ error: 'Unknown platform' })

      return reply.view('platforms/detail.ejs', {
        user: request.sessionUser,
        vertical,
        slug,
        platform,
        prefill,
        connections,
        scopeGroups,
        error: null,
        csrfToken: (request as any).csrfToken,
      })
    })

    // ── Detail form submit ───────────────────────────────────────────────
    fastify.post<{
      Params: { vertical: string; slug: string }
      Body: {
        clientId?: string
        clientSecret?: string
        redirectUri?: string
        // Checkbox values — Fastify gives us `string | string[]` depending on
        // how many boxes the operator ticked.
        scopes?: string | string[]
        // Free-text fallback for unlisted scopes (comma- or whitespace-sep).
        scopesCustom?: string
      }
    }>('/platforms/:vertical/:slug', async (request, reply) => {
      const { vertical, slug } = request.params
      if (!isKnownVertical(vertical)) {
        return reply.status(404).send({ error: 'Unknown vertical' })
      }

      const token = request.sessionUser!.token
      const body = request.body ?? {}

      // Defence in depth: the detail page never renders a working
      // Save/Enable form for an unsupported platform (see the GET handler
      // below), but a stale page or a hand-crafted request must still be
      // refused server-side — never save credentials or attempt to enable
      // a platform that can never be connected. Renders an inline error in
      // place of the normal save flow rather than doing a partial save.
      const platformsBefore = await apiClient.listPlatforms(token, vertical).catch(() => [])
      const currentBefore = platformsBefore.find((a) => a.slug === slug)
      if (currentBefore?.unsupported) {
        const [prefillBefore, connectionsBefore, scopeGroupsBefore] = await Promise.all([
          apiClient.getPlatformConfig(token, vertical, slug).catch(() => null),
          apiClient.listConnections(token, { vertical, platform: slug }).catch(() => []),
          apiClient.listScopeGroups(token, { vertical, platform: slug }).catch(() => []),
        ])
        return reply.view('platforms/detail.ejs', {
          user: request.sessionUser,
          vertical,
          slug,
          platform: currentBefore,
          prefill: prefillBefore,
          connections: connectionsBefore,
          scopeGroups: scopeGroupsBefore,
          saved: false,
          error: `${slug} is not supported: ${currentBefore.unsupported.reason}`,
          csrfToken: (request as any).csrfToken,
        })
      }

      // Shared with POST /setup/wizard/configure, which renders the same
      // credentials partial — a single parser keeps the two surfaces from
      // drifting apart.
      const config = buildPlatformConfig(body)

      try {
        await apiClient.setPlatformConfig(token, vertical, slug, config)

        // Saving credentials on a disabled platform is a clear "I want this on"
        // signal — flip enabled to match. Operators who explicitly want config
        // without enabling can use the Disable button afterward. `!current.unsupported`
        // guards the enable call itself, not just the decision to attempt it —
        // belt-and-braces against the platform having flipped to unsupported in
        // the moment between the pre-check above and this re-fetch.
        const platforms = await apiClient.listPlatforms(token, vertical)
        const current = platforms.find((a) => a.slug === slug)
        if (current && !current.enabled && !current.unsupported) {
          await apiClient.enablePlatform(token, vertical, slug)
        }

        flashSuccess(reply, 'Platform configuration saved.')
        return reply.redirect(`/platforms/${vertical}/${slug}`)
      } catch (err) {
        const message = formatBackendError(err, 'Failed to save platform config.')
        const [platforms, prefill, connections, scopeGroups] = await Promise.all([
          apiClient.listPlatforms(token, vertical).catch(() => []),
          apiClient.getPlatformConfig(token, vertical, slug).catch(() => null),
          apiClient.listConnections(token, { vertical, platform: slug }).catch(() => []),
          apiClient.listScopeGroups(token, { vertical, platform: slug }).catch(() => []),
        ])
        const platform = platforms.find((a) => a.slug === slug)
        return reply.view('platforms/detail.ejs', {
          user: request.sessionUser,
          vertical,
          slug,
          platform: platform ?? { slug, enabled: false, hasConfig: false },
          prefill,
          connections,
          scopeGroups,
          saved: false,
          error: message,
          csrfToken: (request as any).csrfToken,
        })
      }
    })

    // ── Disable ─────────────────────────────────────────────────────────
    fastify.post<{ Params: { vertical: string; slug: string } }>(
      '/platforms/:vertical/:slug/disable',
      async (request, reply) => {
        const { vertical, slug } = request.params
        if (!isKnownVertical(vertical)) {
          return reply.status(404).send({ error: 'Unknown vertical' })
        }
        await apiClient.disablePlatform(request.sessionUser!.token, vertical, slug)
        return reply.redirect(`/platforms/${vertical}/${slug}`)
      },
    )

    // ── Logos tab ────────────────────────────────────────────────────────
    // Every redirect below carries `tab=logos`. Dropping it silently returns
    // the operator to the Browse tab after each action.

    fastify.post<{ Body: { source?: string; brandfetchClientId?: string } }>(
      '/platforms/logos/settings',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const source = (request.body?.source ?? '').trim()
        const submittedId = (request.body?.brandfetchClientId ?? '').trim()

        const fail = (message: string) => {
          flashError(reply, message)
          return reply.redirect('/platforms?tab=logos')
        }

        if (!['none', 'cdn', 'local'].includes(source)) {
          return fail('Pick one of Monogram tiles, Brandfetch CDN, or Fetch and self-host.')
        }

        const current = await loadLogoSettings(apiClient, token).catch(() => null)

        // Resolved, not submitted: an env-configured deployment and an
        // unchanged stored value both legitimately satisfy the requirement, so
        // an operator switching to cdn should not have to retype an ID that is
        // already in effect.
        const effectiveId =
          submittedId ||
          current?.config.requestedClientId ||
          (process.env.BRANDFETCH_CLIENT_ID ?? '').trim()

        if (source === 'cdn' && !effectiveId) {
          return fail(
            'Brandfetch CDN needs a client ID — enter one, or choose Monogram tiles or ' +
              'Fetch and self-host. Free at https://brandfetch.com/developers.',
          )
        }

        try {
          // Client ID first, then the source. If the second write fails the
          // deployment is left on its OLD mode with a new (public, harmless)
          // client ID. The reverse order can leave it on `cdn` with no ID —
          // exactly the silently-degraded state this form exists to prevent.
          if (submittedId) {
            await apiClient.updateRuntimeSetting(token, LOGO_CLIENT_ID_KEY, submittedId)
          }
          await apiClient.updateRuntimeSetting(token, LOGO_SOURCE_KEY, source)
        } catch (err: any) {
          return fail(err?.response?.data?.error ?? err?.message ?? 'Could not save logo settings.')
        } finally {
          invalidateLogoSettingsCache()
        }

        flashSuccess(reply, 'Logo settings saved.')
        return reply.redirect('/platforms?tab=logos')
      },
    )

    fastify.post<{ Body: { scope?: string; vertical?: string; force?: string } }>(
      '/platforms/logos/fetch',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const scope = request.body?.scope ?? 'missing'

        // Hiding the button is presentation; this is the control. Fetching
        // stores logos, only self-hosting serves them, and storing is caching
        // under Brandfetch's terms — so a fetch outside that mode would both
        // waste the run and sidestep the agreement confirm attached to
        // choosing it.
        const current = await loadLogoSettings(apiClient, token).catch(() => null)
        if (current && current.config.logoSource !== 'local') {
          flashError(
            reply,
            'Choose “Fetch and self-host” before fetching — in any other mode the ' +
              'stored logos are never served.',
          )
          return reply.redirect('/platforms?tab=logos')
        }

        try {
          await apiClient.startLogoFetch(token, {
            force: scope === 'all',
            vertical: request.body?.vertical || undefined,
          })
        } catch (err: any) {
          flashError(
            reply,
            err?.response?.data?.error ?? err?.message ?? 'Could not start the fetch.',
          )
          return reply.redirect('/platforms?tab=logos')
        }
        return reply.redirect('/platforms?tab=logos')
      },
    )

    fastify.post<{ Body: { id?: string } }>('/platforms/logos/cancel', async (request, reply) => {
      const token = request.sessionUser!.token
      const id = request.body?.id
      if (id) {
        try {
          await apiClient.cancelLogoFetch(token, id)
        } catch {
          // A cancel that races the job finishing is not worth surfacing —
          // the poller shows the real terminal state either way.
        }
      }
      // Answered as JSON as well as a redirect target: the tab cancels via
      // fetch() so the page does not navigate away mid-watch.
      if ((request.headers.accept ?? '').includes('application/json')) {
        return reply.send({ ok: true })
      }
      return reply.redirect('/platforms?tab=logos')
    })

    fastify.post('/platforms/logos/purge', async (request, reply) => {
      const token = request.sessionUser!.token
      try {
        const { deleted } = await apiClient.purgeLogos(token)
        // Composed here rather than in the view: the message is data and the
        // view receives no count. One sentence only — a toast is not the
        // place for two, and the tab this lands on states the active mode two
        // blocks down.
        flashSuccess(
          reply,
          deleted === 1 ? 'Deleted 1 stored logo.' : `Deleted ${deleted} stored logos.`,
        )
        return reply.redirect('/platforms?tab=logos')
      } catch (err: any) {
        flashError(
          reply,
          err?.response?.data?.error ?? err?.message ?? 'Could not delete the logos.',
        )
        return reply.redirect('/platforms?tab=logos')
      }
    })

    // Polled for the length of a fetch (tens of minutes), so it is exempted
    // from admin's two global preHandlers in core/server.ts — each of those
    // makes an uncached admin-api call. It keeps this plugin's admin gate.
    fastify.get('/platforms/logos/status', async (request, reply) => {
      const token = request.sessionUser!.token
      try {
        const [job, status] = await Promise.all([
          apiClient.getActiveLogoFetch(token),
          apiClient.getLogoStatus(token),
        ])
        return reply.header('cache-control', 'no-store').send({ job, status })
      } catch (err: any) {
        // A poll failure is transient by nature; the client backs off and
        // keeps the widget on screen rather than tearing it down.
        return reply
          .code(502)
          .send({ error: err?.response?.data?.error ?? err?.message ?? 'Status unavailable.' })
      }
    })

    // The fragment the Logos tab swaps in when a run finishes, so the stored
    // count, the stored-logo buttons and the run history catch up without the
    // operator reloading the page by hand.
    //
    // It renders the same partial the tab does — one renderer for that table,
    // not a second copy of it in JavaScript — but on its own: the tab itself
    // lists every adapter in all nine verticals, which is thirteen upstream
    // calls and 1,545 rows to build for one card.
    //
    // Not exempted from the setup gate the way /status is: that one is polled
    // for the length of a run, this is fetched once when it ends. Both skip
    // the layout-level reads (company info, unread count) in core/server.ts —
    // a fragment draws no header.
    fastify.get('/platforms/logos/panel', async (request, reply) => {
      const token = request.sessionUser!.token
      const [logoSettings, logoJob, logoStatus, logoHistory] = await Promise.all([
        loadLogoSettings(apiClient, token).catch(() => null),
        apiClient.getActiveLogoFetch(token).catch(() => null),
        apiClient.getLogoStatus(token).catch(() => null),
        apiClient.listLogoFetchJobs(token).catch(() => []),
      ])
      const html = await renderLogoPanel({
        user: request.sessionUser,
        csrfToken: (request as any).csrfToken,
        logo: logoSettings?.config ?? null,
        logoJob,
        logoStatus,
        logoHistory,
        verticals: KNOWN_VERTICALS,
        actionBase: '/platforms/logos',
        readOnly: false,
      })
      return reply.header('cache-control', 'no-store').type('text/html; charset=utf-8').send(html)
    })
  }
}
