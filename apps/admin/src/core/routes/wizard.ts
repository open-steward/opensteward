import type { FastifyInstance } from 'fastify'
import { reference } from '@opensteward/shared'
import { requireAuth, requireRole } from '../auth/middleware'
import type { AdminApiClient, CompanyInfo } from '../proxy/admin-api-client'
import { formatBackendError } from '../proxy/format-backend-error'
import { SAFE_DEFAULT_SCOPES, VERTICAL_SCOPE_ITEMS } from './api-keys-defaults'
import { buildPlatformConfig } from './platform-config-body'
import { KNOWN_VERTICALS } from '../verticals'
import {
  loadLogoSettings,
  invalidateLogoSettingsCache,
  LOGO_MODES,
  LOGO_SOURCE_KEY,
  LOGO_CLIENT_ID_KEY,
  renderLogoPanel,
} from './logo-config'
import {
  WIZARD_RAIL_STEPS,
  computeWizardProgress,
  resumeHref,
  type WizardProgress,
  type WizardProgressClient,
} from './wizard-progress'
import { parseHeaderLines } from '../views/parse-header-lines'
import {
  readWebhookFormat,
  validateWebhookLabel,
  validateWebhookUrl,
} from '../views/webhook-subscription-input'

const COUNTRY_OPTIONS = reference.COUNTRY_OPTIONS

const COMPANY_FIELDS: Array<keyof CompanyInfo> = [
  'name',
  'legalName',
  'description',
  'website',
  'logoDataUrl',
  'primaryColor',
  'secondaryColor',
  'fontFamily',
  'fontDataUrl',
  'fontUrl',
  'faviconDataUrl',
  'supportEmail',
  'privacyPolicyUrl',
  'termsOfServiceUrl',
  'addressLine1',
  'addressLine2',
  'city',
  'region',
  'postalCode',
  'country',
  'baseUrl',
]

function companyBodyToPatch(body: Record<string, unknown>): Partial<CompanyInfo> {
  const patch: Record<string, unknown> = {}
  for (const key of COMPANY_FIELDS) {
    if (key in body) patch[key] = body[key]
  }
  return patch as Partial<CompanyInfo>
}

/**
 * Derive {scheme, host, port} from the wizard's baseUrl and seed the
 * three openapi.servers.* runtime_settings rows. Best-effort: any failure
 * (bad URL, admin-api transient error, validation reject) is swallowed —
 * the operator can still set these manually from /settings later. We never
 * want a wizard step to halt because of a derivative side-effect.
 *
 * Each enum keeps a fallback (the previous default) so local dev access
 * via http://localhost:3010 still works without re-editing.
 */
async function seedOpenapiServersFromBaseUrl(
  apiClient: AdminApiClient,
  token: string,
  baseUrl: string | undefined,
): Promise<void> {
  if (!baseUrl) return
  let u: URL
  try {
    u = new URL(baseUrl)
  } catch {
    return
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return
  const scheme = u.protocol.slice(0, -1)
  const host = u.hostname
  const port = u.port || (scheme === 'https' ? '443' : '80')
  try {
    await Promise.all([
      apiClient.updateRuntimeSetting(token, 'openapi.servers.scheme', {
        default: scheme,
        enum: scheme === 'https' ? ['https', 'http'] : ['http', 'https'],
      }),
      apiClient.updateRuntimeSetting(token, 'openapi.servers.host', {
        default: host,
        enum: host === 'localhost' ? ['localhost'] : [host, 'localhost'],
      }),
      apiClient.updateRuntimeSetting(token, 'openapi.servers.port', {
        default: port,
        enum: port === '3010' ? ['3010'] : [port, '3010'],
      }),
    ])
  } catch {
    // Swallowed: the wizard's primary job (saving company info) already
    // succeeded. The operator can fix this from /settings.
  }
}

/** Current data-store mode, or null when metrics are unavailable. */
async function currentDsMode(apiClient: AdminApiClient, token: string): Promise<string | null> {
  try {
    const metrics = await apiClient.getDataStoreMetrics(token)
    return (metrics as { mode?: string } | null)?.mode ?? null
  } catch {
    return null
  }
}

/**
 * Derive how far setup has got — the wizard preHandler's body, exported so
 * the dashboard's "Finish setting up" card reads the same scan.
 *
 * `withRailInputs` covers the two inputs only the rail shows: the logo
 * choice and whether a second tenant exists. Neither can be a resume target,
 * so `firstIncomplete` is the same with or without them, and a caller that
 * only needs the next step (the dashboard) skips their two reads.
 *
 * `client` swaps the reads behind `computeWizardProgress` — the dashboard
 * hands in the verticals and platform rows it has already fetched rather
 * than paying for them twice. `dsMode` does the same for the data-store
 * mode, which decides whether webhooks are outstanding: left out, it is read
 * from `apiClient`, and reads as `null` — webhooks optional — when the
 * metrics are unavailable. The dashboard resolves it itself, because from
 * here a passthrough deployment (no metrics to have) and an outage look the
 * same, and the card must not call an outage finished.
 *
 * Rejects when the scan itself fails. Callers decide what that means: the
 * wizard logs and renders position-only, the dashboard hides the card.
 */
export async function loadWizardProgress(
  apiClient: AdminApiClient,
  user: { token: string; role: string },
  opts: { withRailInputs: boolean; client?: WizardProgressClient; dsMode?: string | null },
): Promise<WizardProgress> {
  const [logosDone, tenantsDone, dsMode] = await Promise.all([
    opts.withRailInputs
      ? loadLogoSettings(apiClient, user.token)
          .then(({ config }) => config.isExplicitChoice)
          // Undefined → reads as not-done → an unticked rail item and nothing
          // else, since 'logos' is never a resume target.
          .catch(() => undefined)
      : undefined,
    // Same channel as logosDone, for the same reason: adding a method to
    // WizardProgressClient breaks every stub silently.
    opts.withRailInputs
      ? apiClient
          .listTenants(user.token)
          .then((rows) => rows.some((t) => t.id !== 'default'))
          .catch(() => undefined)
      : undefined,
    opts.dsMode !== undefined ? opts.dsMode : currentDsMode(apiClient, user.token),
  ])
  return computeWizardProgress(opts.client ?? apiClient, user.token, {
    role: user.role,
    dsMode,
    logosDone,
    tenantsDone,
  })
}

export function createWizardRoutes(apiClient: AdminApiClient) {
  return async function wizardRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireAuth)

    // Derive how far setup has got, once per page view, and hand it to the
    // rail via reply.locals — the same channel server.ts uses for csrfToken,
    // so seven view payloads don't each have to thread it. GET only: a POST
    // redirects to a GET that recomputes anyway.
    fastify.addHook('preHandler', async (request, reply) => {
      // The rail's rows, on every method: a POST that fails validation
      // re-renders its step, rail included.
      const locals = ((reply as any).locals ??= {})
      locals.wizardSteps = WIZARD_RAIL_STEPS
      if (request.method !== 'GET') return
      const user = request.sessionUser
      if (!user) return
      try {
        const progress = await loadWizardProgress(apiClient, user, { withRailInputs: true })
        ;(request as any).wizardProgress = progress
        locals.wizardProgress = progress
      } catch (err) {
        // Progress is decoration: the rail degrades to position-only and the
        // resume redirect stays put. Never let it 500 the step itself.
        request.log.warn({ err }, 'wizard progress unavailable')
      }
    })

    // ── Step 1 — pick the data-store strategy ───────────────────────────────
    // Foundational choice: cache locally (database, default), don't cache
    // (passthrough), or cache + fan out resource.* events (external). The
    // active mode is set via DATA_STORE_MODE on the integration-server; this
    // step shows the current value and explains the trade-offs so the
    // operator can confirm or restart with a different env.
    fastify.get<{ Querystring: { stay?: string } }>('/setup/wizard', async (request, reply) => {
      const token = request.sessionUser!.token

      // Resume where setup actually stands. `?stay=1` opts out — the rail's own
      // link back to this step carries it, or the redirect would bounce
      // straight out again and the step would be unreachable.
      const progress = (request as any).wizardProgress as WizardProgress | undefined
      if (!request.query.stay && progress?.firstIncomplete) {
        const target = resumeHref(progress)
        if (target) return reply.redirect(target)
      }

      const metrics = await apiClient.getDataStoreMetrics(token)
      return reply.view('wizard/step1-data-store.ejs', {
        user: request.sessionUser,
        metrics,
      })
    })

    // ── Step 2 — brand the deployment (company info) ────────────────────────
    // Wraps the same form as /company-info but with wizard chrome and posts
    // back to /setup/wizard/company-info, then advances to step 3. The
    // operator can also Skip to fill it in later from the standalone
    // /company-info page.
    fastify.get('/setup/wizard/company-info', async (request, reply) => {
      const token = request.sessionUser!.token
      const company = await apiClient.getCompanyInfo(token)
      return reply.view('wizard/step2-company-info.ejs', {
        user: request.sessionUser,
        company: company ?? {},
        countries: COUNTRY_OPTIONS,
        error: null,
        csrfToken: (request as any).csrfToken,
      })
    })

    fastify.post<{ Body: Record<string, unknown> }>(
      '/setup/wizard/company-info',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const patch = companyBodyToPatch(request.body ?? {})
        try {
          await apiClient.setCompanyInfo(token, patch)
          // Best-effort: derive the Swagger UI Servers dropdown defaults
          // from the same baseUrl. The operator can override via /settings.
          await seedOpenapiServersFromBaseUrl(
            apiClient,
            token,
            typeof patch.baseUrl === 'string' ? patch.baseUrl : undefined,
          )
          return reply.redirect('/setup/wizard/logos')
        } catch (err: any) {
          const apiError =
            err?.response?.data?.error ?? err?.message ?? 'Failed to save company info'
          return reply.view('wizard/step2-company-info.ejs', {
            user: request.sessionUser,
            company: { ...patch },
            countries: COUNTRY_OPTIONS,
            error: apiError,
            csrfToken: (request as any).csrfToken,
          })
        }
      },
    )

    // ── Step 3 — platform logos (optional, cosmetic) ────────────────────────
    // GET sits at the plugin's requireAuth floor: an operator walking the
    // wizard has to be able to see and pass this step, and step 2's Continue
    // now funnels through it. The writes escalate to admin, matching
    // /platforms and /settings — this is deployment-wide config, not an
    // operational action.
    fastify.get('/setup/wizard/logos', async (request, reply) => {
      const token = request.sessionUser!.token
      const [settings, job, status] = await Promise.all([
        loadLogoSettings(apiClient, token).catch(() => null),
        apiClient.getActiveLogoFetch(token).catch(() => null),
        apiClient.getLogoStatus(token).catch(() => null),
      ])
      return reply.view('wizard/logos.ejs', {
        user: request.sessionUser,
        logo: settings?.config ?? null,
        logoSettingsUnavailable: settings === null,
        logoJob: job,
        logoStatus: status,
        // The wizard is a first-run flow; history belongs on the platforms tab.
        logoHistory: [],
        logoModes: LOGO_MODES,
        verticals: KNOWN_VERTICALS,
        csrfToken: (request as any).csrfToken,
      })
    })

    fastify.post<{ Body: { source?: string; brandfetchClientId?: string } }>(
      '/setup/wizard/logos',
      { preHandler: [requireRole('admin')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const source = (request.body?.source ?? '').trim()
        const submittedId = (request.body?.brandfetchClientId ?? '').trim()

        const rerender = async (error: string) => {
          const [settings, job, status] = await Promise.all([
            loadLogoSettings(apiClient, token).catch(() => null),
            apiClient.getActiveLogoFetch(token).catch(() => null),
            apiClient.getLogoStatus(token).catch(() => null),
          ])
          return reply.view('wizard/logos.ejs', {
            user: request.sessionUser,
            logo: settings?.config ?? null,
            logoSettingsUnavailable: settings === null,
            logoJob: job,
            logoStatus: status,
            logoHistory: [],
            logoModes: LOGO_MODES,
            verticals: KNOWN_VERTICALS,
            error,
            csrfToken: (request as any).csrfToken,
          })
        }

        if (!['none', 'cdn', 'local'].includes(source)) {
          return rerender('Pick one of Monogram tiles, Brandfetch CDN, or Fetch and self-host.')
        }

        const current = await loadLogoSettings(apiClient, token).catch(() => null)
        const effectiveId =
          submittedId ||
          current?.config.requestedClientId ||
          (process.env.BRANDFETCH_CLIENT_ID ?? '').trim()
        if (source === 'cdn' && !effectiveId) {
          return rerender(
            'Brandfetch CDN needs a client ID — enter one, or choose Monogram tiles or ' +
              'Fetch and self-host.',
          )
        }

        try {
          // Client ID first, then the source — a partial failure must never
          // leave the deployment on cdn with no ID.
          if (submittedId) {
            await apiClient.updateRuntimeSetting(token, LOGO_CLIENT_ID_KEY, submittedId)
          }
          await apiClient.updateRuntimeSetting(token, LOGO_SOURCE_KEY, source)
        } catch (err: any) {
          return rerender(
            err?.response?.data?.error ?? err?.message ?? 'Failed to save logo settings',
          )
        } finally {
          invalidateLogoSettingsCache()
        }

        return reply.redirect('/setup/wizard/platforms')
      },
    )

    fastify.post<{ Body: { scope?: string; vertical?: string } }>(
      '/setup/wizard/logos/fetch',
      { preHandler: [requireRole('admin')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        // Same gate as the platforms tab — see the comment there.
        const current = await loadLogoSettings(apiClient, token).catch(() => null)
        if (current && current.config.logoSource !== 'local') {
          return reply.redirect('/setup/wizard/logos')
        }
        try {
          await apiClient.startLogoFetch(token, {
            force: request.body?.scope === 'all',
            vertical: request.body?.vertical || undefined,
          })
        } catch {
          // The step is optional; a refused fetch must not block the wizard.
        }
        return reply.redirect('/setup/wizard/logos')
      },
    )

    fastify.post<{ Body: { id?: string } }>(
      '/setup/wizard/logos/cancel',
      { preHandler: [requireRole('admin')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        if (request.body?.id) {
          await apiClient.cancelLogoFetch(token, request.body.id).catch(() => null)
        }
        if ((request.headers.accept ?? '').includes('application/json')) {
          return reply.send({ ok: true })
        }
        return reply.redirect('/setup/wizard/logos')
      },
    )

    fastify.post(
      '/setup/wizard/logos/purge',
      { preHandler: [requireRole('admin')] },
      async (request, reply) => {
        // The shared partial posts to `<actionBase>/purge` on both surfaces, so
        // the wizard needs this route or its Delete button 404s.
        await apiClient.purgeLogos(request.sessionUser!.token).catch(() => null)
        return reply.redirect('/setup/wizard/logos')
      },
    )

    fastify.get('/setup/wizard/logos/status', async (request, reply) => {
      const token = request.sessionUser!.token
      try {
        const [job, status] = await Promise.all([
          apiClient.getActiveLogoFetch(token),
          apiClient.getLogoStatus(token),
        ])
        return reply.header('cache-control', 'no-store').send({ job, status })
      } catch (err: any) {
        return reply.code(502).send({ error: err?.message ?? 'Status unavailable.' })
      }
    })

    // The partial posts to `<actionBase>/panel` on both surfaces, so the wizard
    // needs this route for the same reason it needs its own /purge — otherwise
    // a run finishing here refreshes nothing.
    fastify.get('/setup/wizard/logos/panel', async (request, reply) => {
      const token = request.sessionUser!.token
      const [settings, job, status] = await Promise.all([
        loadLogoSettings(apiClient, token).catch(() => null),
        apiClient.getActiveLogoFetch(token).catch(() => null),
        apiClient.getLogoStatus(token).catch(() => null),
      ])
      const html = await renderLogoPanel({
        user: request.sessionUser,
        csrfToken: (request as any).csrfToken,
        logo: settings?.config ?? null,
        logoJob: job,
        logoStatus: status,
        // Empty for the same reason the step itself passes it empty: the
        // wizard is a first-run flow. A panel that returned history would make
        // a table appear here that this page never renders otherwise.
        logoHistory: [],
        verticals: KNOWN_VERTICALS,
        actionBase: '/setup/wizard/logos',
        readOnly: !request.sessionUser || request.sessionUser.role !== 'admin',
      })
      return reply.header('cache-control', 'no-store').type('text/html; charset=utf-8').send(html)
    })

    // ── Step 4 — pick adapters to enable per vertical ───────────────────────
    fastify.get<{ Querystring: { vertical?: string } }>(
      '/setup/wizard/platforms',
      async (request, reply) => {
        const token = request.sessionUser!.token
        const verticals = await apiClient.getVerticals(token)
        const selected = request.query.vertical ?? verticals[0]?.name
        if (!selected) {
          return reply.view('wizard/step3-platforms.ejs', {
            user: request.sessionUser,
            verticals,
            selected: null,
            adapters: [],
            error: null,
            csrfToken: (request as any).csrfToken,
          })
        }
        let adapters: Awaited<ReturnType<AdminApiClient['listPlatforms']>> = []
        try {
          adapters = await apiClient.listPlatforms(token, selected)
        } catch {
          // vertical may be unreachable — show empty list with a warning
        }
        return reply.view('wizard/step3-platforms.ejs', {
          user: request.sessionUser,
          verticals,
          selected,
          adapters,
          error: null,
          csrfToken: (request as any).csrfToken,
        })
      },
    )

    // ── Step 3 form submit — toggle adapters ────────────────────────────────
    fastify.post<{
      Body: { vertical: string; enabled?: string | string[] }
    }>('/setup/wizard/platforms', async (request, reply) => {
      const token = request.sessionUser!.token
      const { vertical, enabled } = request.body ?? ({} as Record<string, unknown>)
      if (!vertical) {
        return reply.status(400).send({ error: 'vertical is required' })
      }
      const enabledSlugs = new Set(Array.isArray(enabled) ? enabled : enabled ? [enabled] : [])

      // Reconcile: enable selected, disable everything else that was previously on
      const current = await apiClient.listPlatforms(token, vertical)
      const toggleErrors: string[] = []
      for (const a of current) {
        // An unsupported platform's checkbox renders disabled (so a real
        // browser submits nothing for it), but a hand-crafted request could
        // still name it — never attempt to enable or disable one.
        if (a.unsupported) continue
        try {
          if (enabledSlugs.has(a.slug) && !a.enabled) {
            await apiClient.enablePlatform(token, vertical, a.slug)
          } else if (!enabledSlugs.has(a.slug) && a.enabled) {
            await apiClient.disablePlatform(token, vertical, a.slug)
          }
        } catch (err) {
          // Caught per-slug: one platform refusing (the upstream rejects it,
          // it just went unsupported, admin-api is flaky) must not 500 the
          // whole step and lose every other toggle the operator made.
          toggleErrors.push(`${a.slug}: ${formatBackendError(err, 'Failed to update this platform.')}`)
        }
      }

      if (toggleErrors.length > 0) {
        const verticals = await apiClient.getVerticals(token).catch(() => [])
        return reply.view('wizard/step3-platforms.ejs', {
          user: request.sessionUser,
          verticals,
          selected: vertical,
          adapters: current,
          error: toggleErrors.join(' '),
          csrfToken: (request as any).csrfToken,
        })
      }

      // After enabling, advance to credential entry for the first enabled adapter
      const firstEnabled = [...enabledSlugs][0]
      if (firstEnabled) {
        return reply.redirect(`/setup/wizard/configure?vertical=${vertical}&slug=${firstEnabled}`)
      }
      return reply.redirect(`/setup/wizard/platforms?vertical=${vertical}`)
    })

    // ── Step 4 — enter credentials for an enabled adapter ───────────────────
    fastify.get<{ Querystring: { vertical: string; slug: string } }>(
      '/setup/wizard/configure',
      async (request, reply) => {
        const token = request.sessionUser!.token
        // The rail links here with no query string — it is static markup and
        // cannot know which adapter to name. Resolving the adapter here is
        // what makes the bare rail link work at all; redirecting away would
        // leave the Platforms POST (which supplies the params) as the only
        // way in.
        //
        // Preference order matters: the adapter still missing credentials is
        // the one an operator is being sent to finish, but once nothing is
        // outstanding the step must still open — reviewing or rotating a
        // credential is precisely why they clicked it.
        const progress = (request as any).wizardProgress as WizardProgress | undefined
        const target =
          request.query.vertical && request.query.slug
            ? { vertical: request.query.vertical, slug: request.query.slug }
            : (progress?.nextUnconfigured ?? progress?.firstEnabled ?? null)
        // Nothing enabled at all — the picker is where you go to change that.
        // Also the fallback when the progress scan failed, which is the
        // behaviour this route had unconditionally.
        if (!target) {
          return reply.redirect('/setup/wizard/platforms')
        }
        const { vertical, slug } = target
        const [adapters, prefill, scopeGroups] = await Promise.all([
          apiClient.listPlatforms(token, vertical),
          // Redacted config carries recommendedScopes + readScopes + the saved
          // values, so the wizard's scope picker can surface the platform's
          // read-only option just like the standalone configure page.
          apiClient.getPlatformConfig(token, vertical, slug).catch(() => null),
          apiClient.listScopeGroups(token, { vertical, platform: slug }).catch(() => []),
        ])
        const enabled = adapters.filter((a) => a.enabled)
        const idx = enabled.findIndex((a) => a.slug === slug)
        const next = idx >= 0 && idx < enabled.length - 1 ? enabled[idx + 1] : null
        return reply.view('wizard/step4-configure.ejs', {
          user: request.sessionUser,
          vertical,
          slug,
          adapter: adapters.find((a) => a.slug === slug),
          enabledAdapters: enabled,
          prefill,
          scopeGroups,
          next,
          error: null,
          csrfToken: (request as any).csrfToken,
        })
      },
    )

    fastify.post<{
      Body: {
        vertical: string
        slug: string
        clientId?: string
        clientSecret?: string
        redirectUri?: string
        // `string[]` for 2+ ticked boxes, `string` for exactly one. This step
        // renders the same `platforms/_credentials-form.ejs` partial as the
        // standalone platform page, so the body shape is identical to it.
        scopes?: string | string[]
        scopesCustom?: string
        next?: string
      }
    }>('/setup/wizard/configure', async (request, reply) => {
      const token = request.sessionUser!.token
      const body = request.body ?? ({} as Record<string, string>)
      const { vertical, slug, next } = body
      if (!vertical || !slug) {
        return reply.status(400).send({ error: 'vertical and slug required' })
      }

      // Shared with POST /platforms/:vertical/:slug — one parser, so the two
      // surfaces cannot drift.
      const config = buildPlatformConfig(body)

      try {
        await apiClient.setPlatformConfig(token, vertical, slug, config)
      } catch (err) {
        // Without this the operator would get Fastify's raw JSON error page
        // and lose everything typed. Mirror the standalone platform page: stay
        // on the step, show the upstream reason, keep the input. The secret is
        // deliberately not echoed back — it is re-typed or left blank to keep
        // whatever is already stored.
        const message =
          err instanceof Error && err.message ? err.message : 'Failed to save platform config.'
        const [adapters, stored, scopeGroups] = await Promise.all([
          apiClient.listPlatforms(token, vertical).catch(() => []),
          apiClient.getPlatformConfig(token, vertical, slug).catch(() => null),
          apiClient.listScopeGroups(token, { vertical, platform: slug }).catch(() => []),
        ])
        const enabled = adapters.filter((a) => a.enabled)
        const idx = enabled.findIndex((a) => a.slug === slug)
        const { clientSecret: _submittedSecret, ...typed } = config
        return reply.view('wizard/step4-configure.ejs', {
          user: request.sessionUser,
          vertical,
          slug,
          adapter: adapters.find((a) => a.slug === slug),
          enabledAdapters: enabled,
          // Redisplay what was submitted, falling back to what is stored, so a
          // rejected save is one correction away rather than a full re-entry.
          prefill: { ...(stored ?? {}), ...typed },
          scopeGroups,
          next: idx >= 0 && idx < enabled.length - 1 ? enabled[idx + 1] : null,
          error: message,
          csrfToken: (request as any).csrfToken,
        })
      }

      if (next) {
        return reply.redirect(`/setup/wizard/configure?vertical=${vertical}&slug=${next}`)
      }
      // The step that actually follows this one. This pointed at api-key while
      // credentials was the last step before it; inserting tenants at 6 left it
      // jumping straight over the new step, which — combined with the rail not
      // linking a step that is neither done nor current — made tenants
      // reachable only by typing the URL.
      return reply.redirect('/setup/wizard/tenants')
    })

    // ── Step 6 — tenants & domains (optional) ───────────────────────────────
    // Renders the same partial /tenants does, from the same two calls, so the
    // two surfaces cannot drift. The partial's forms post to the real /tenants
    // routes — there are deliberately no wizard copies of them.
    fastify.get('/setup/wizard/tenants', async (request, reply) => {
      const token = request.sessionUser!.token
      const [tenants, domains, metrics] = await Promise.all([
        apiClient.listTenants(token).catch(() => []),
        apiClient.listTenantDomains(token).catch(() => []),
        apiClient.getDataStoreMetrics(token).catch(() => null),
      ])
      const domainsByTenant = new Map<string, string[]>()
      for (const d of domains) {
        const list = domainsByTenant.get(d.tenantId) ?? []
        list.push(d.domain)
        domainsByTenant.set(d.tenantId, list)
      }
      return reply.view('wizard/step6-tenants.ejs', {
        user: request.sessionUser,
        tenants: tenants.map((t) => ({ ...t, domains: domainsByTenant.get(t.id) ?? [] })),
        metrics,
        csrfToken: (request as any).csrfToken,
      })
    })

    // ── Step 6 — mint your first dev API key (admin-only) ──────────────────
    fastify.get(
      '/setup/wizard/api-key',
      { preHandler: [requireRole('admin')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        // `connectionCount` is informational only: it says whether a key
        // minted here has anything to read yet, without gating the wizard
        // on a customer having authorized OAuth. Never fatal — an unreachable
        // integration-server must not block minting a key.
        const [metrics, connections, tenants] = await Promise.all([
          apiClient.getDataStoreMetrics(token),
          apiClient.listConnections(token).catch(() => []),
          // Only used to decide whether there is a choice to offer; an
          // unreachable admin-api must not block minting a key.
          apiClient.listTenants(token).catch(() => []),
        ])
        return reply.view('wizard/step6-api-key.ejs', {
          user: request.sessionUser,
          connectionCount: connections.length,
          tenants,
          knownVerticals: VERTICAL_SCOPE_ITEMS,
          safeDefaultScopes: [...SAFE_DEFAULT_SCOPES],
          dsMode: metrics?.mode ?? null,
          defaults: { label: '', scopeMode: 'safe-default', scopes: [...SAFE_DEFAULT_SCOPES] },
          mintedKey: null,
          mintedMcpKey: null,
          error: null,
          csrfToken: (request as any).csrfToken,
        })
      },
    )

    fastify.post<{
      Body: {
        tenantId?: string
        label?: string
        scopeMode?: string
        scopes?: string | string[]
      }
    }>('/setup/wizard/api-key', { preHandler: [requireRole('admin')] }, async (request, reply) => {
      const token = request.sessionUser!.token
      const tenantId = (request.body?.tenantId ?? 'default').trim() || 'default'
      const label = (request.body?.label ?? '').trim()
      const rawMode = request.body?.scopeMode
      const scopeMode =
        rawMode === 'all' || rawMode === 'custom' || rawMode === 'safe-default'
          ? rawMode
          : 'safe-default'
      const rawScopes = request.body?.scopes
      const selected = Array.isArray(rawScopes)
        ? rawScopes
        : typeof rawScopes === 'string' && rawScopes.length > 0
          ? [rawScopes]
          : []
      const scopes =
        scopeMode === 'safe-default'
          ? [...SAFE_DEFAULT_SCOPES]
          : scopeMode === 'custom' && selected.length > 0
            ? selected
            : undefined

      // Tenants too: without them `pickTenant` is false on every re-render and
      // the select silently degrades to a hidden field — the operator loses the
      // control (though not the value) the moment they mistype a label.
      const [metrics, tenants] = await Promise.all([
        apiClient.getDataStoreMetrics(token),
        apiClient.listTenants(token).catch(() => []),
      ])

      const renderError = (msg: string) =>
        reply.view('wizard/step6-api-key.ejs', {
          user: request.sessionUser,
          knownVerticals: VERTICAL_SCOPE_ITEMS,
          safeDefaultScopes: [...SAFE_DEFAULT_SCOPES],
          dsMode: metrics?.mode ?? null,
          // `tenantId` too: every other render path carries it, and without it
          // a validation error silently resets the operator's chosen tenant to
          // `default` — harmless while the field was hardcoded, not once it is
          // a picker.
          defaults: { label, scopeMode, scopes: selected, tenantId },
          tenants,
          mintedKey: null,
          mintedMcpKey: null,
          error: msg,
          csrfToken: (request as any).csrfToken,
        })

      // Before the upstream call, so the operator gets the field name rather
      // than a status code, and keeps their selections. A key with no label
      // cannot be told apart from any other when revoking.
      if (!label) {
        return renderError(
          'Give the key a label so you can tell it apart later — e.g. "Local dev" or "CI runner".',
        )
      }
      if (scopeMode === 'custom' && selected.length === 0) {
        return renderError('Pick at least one scope, or choose "All access".')
      }

      try {
        const minted = await apiClient.mintApiKey(token, {
          tenantId,
          label: label || null,
          scopes,
          // Onboarding mints a key for the operator's real deployment, so it is
          // live. Stated rather than left to the default: the mint form makes
          // this an explicit choice, and this call should not quietly change
          // meaning if that default ever moves.
          mode: 'live',
        })
        return reply.view('wizard/step6-api-key.ejs', {
          user: request.sessionUser,
          knownVerticals: VERTICAL_SCOPE_ITEMS,
          safeDefaultScopes: [...SAFE_DEFAULT_SCOPES],
          dsMode: metrics?.mode ?? null,
          defaults: { label, scopeMode, scopes: selected, tenantId },
          tenants,
          mintedKey: minted,
          mintedMcpKey: null,
          error: null,
          csrfToken: (request as any).csrfToken,
        })
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : 'Failed to mint API key.'
        return renderError(message)
      }
    })

    // ── Step 6b — optional MCP read-only key (admin-only) ───────────────────
    // mcp:read is incompatible with any *:write scope on the same key (the
    // mint flow refuses), so MCP-capable agents need a SECOND key separate
    // from the primary dev key minted in step 7. This sub-step surfaces the
    // requirement where developers are already minting — no need to hunt
    // through docs/mcp.md first.
    fastify.post<{ Body: { tenantId?: string } }>(
      '/setup/wizard/api-key/mcp',
      { preHandler: [requireRole('admin')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const tenantId = (request.body?.tenantId ?? 'default').trim() || 'default'
        // This route re-renders the api-key view, so it needs the tenant list
        // for the same reason the main POST does.
        const [metrics, tenants] = await Promise.all([
          apiClient.getDataStoreMetrics(token),
          apiClient.listTenants(token).catch(() => []),
        ])
        try {
          const minted = await apiClient.mintApiKey(token, {
            tenantId,
            label: 'MCP read-only (wizard)',
            scopes: ['mcp:read', 'customers:read', 'vertical:read'],
            // As above: an agent wired during onboarding reads real data.
            mode: 'live',
          })
          return reply.view('wizard/step6-api-key.ejs', {
            user: request.sessionUser,
            knownVerticals: VERTICAL_SCOPE_ITEMS,
            safeDefaultScopes: [...SAFE_DEFAULT_SCOPES],
            dsMode: metrics?.mode ?? null,
            defaults: {
              label: '',
              scopeMode: 'safe-default',
              scopes: [...SAFE_DEFAULT_SCOPES],
              tenantId,
            },
            tenants,
            mintedKey: null,
            mintedMcpKey: minted,
            error: null,
            csrfToken: (request as any).csrfToken,
          })
        } catch (err) {
          const message =
            err instanceof Error && err.message ? err.message : 'Failed to mint MCP key.'
          return reply.view('wizard/step6-api-key.ejs', {
            user: request.sessionUser,
            knownVerticals: VERTICAL_SCOPE_ITEMS,
            safeDefaultScopes: [...SAFE_DEFAULT_SCOPES],
            dsMode: metrics?.mode ?? null,
            defaults: {
              label: '',
              scopeMode: 'safe-default',
              scopes: [...SAFE_DEFAULT_SCOPES],
              tenantId,
            },
            tenants,
            mintedKey: null,
            mintedMcpKey: null,
            error: message,
            csrfToken: (request as any).csrfToken,
          })
        }
      },
    )

    // ── Step 7 — register a webhook subscription (admin-only) ──────────────
    fastify.get(
      '/setup/wizard/webhooks',
      { preHandler: [requireRole('admin')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        // Tenants for the picker. Never fatal: an unreachable admin-api must
        // not stop an operator creating a subscription.
        const [metrics, tenants] = await Promise.all([
          apiClient.getDataStoreMetrics(token),
          apiClient.listTenants(token).catch(() => []),
        ])
        const dsMode = metrics?.mode ?? null
        // Default-pre-checks based on mode (only relevant when user picks 'custom')
        const defaultEvents =
          dsMode === 'external'
            ? ['resource.synced', 'resource.updated', 'resource.deleted']
            : ['customer.created', 'customer.updated', 'connect_link.consumed']
        return reply.view('wizard/step7-webhook.ejs', {
          user: request.sessionUser,
          dsMode,
          tenants,
          defaults: {
            tenantId: 'default',
            label: '',
            url: '',
            eventMode: 'all',
            events: defaultEvents,
            format: 'opensteward',
            headers: '',
          },
          createdSub: null,
          error: null,
          csrfToken: (request as any).csrfToken,
        })
      },
    )

    fastify.post<{
      Body: {
        tenantId?: string
        label?: string
        url?: string
        eventMode?: string
        events?: string | string[]
        format?: string
        headers?: string
      }
    }>('/setup/wizard/webhooks', { preHandler: [requireRole('admin')] }, async (request, reply) => {
      const token = request.sessionUser!.token
      const tenantId = (request.body?.tenantId ?? 'default').trim() || 'default'
      const label = (request.body?.label ?? '').trim()
      const url = (request.body?.url ?? '').trim()
      const eventMode = request.body?.eventMode === 'custom' ? 'custom' : 'all'
      const rawEvents = request.body?.events
      const selected = Array.isArray(rawEvents)
        ? rawEvents
        : typeof rawEvents === 'string' && rawEvents.length > 0
          ? [rawEvents]
          : []
      const events = eventMode === 'custom' && selected.length > 0 ? selected : undefined
      const rawFormat = request.body?.format
      const rawHeaders = request.body?.headers ?? ''

      // Same list, for the same reason — and for all of this handler's renders,
      // not just the happy one: without it the select silently degrades to a
      // hidden field the moment a field fails validation.
      const [metrics, tenants] = await Promise.all([
        apiClient.getDataStoreMetrics(token),
        apiClient.listTenants(token).catch(() => []),
      ])
      const dsMode = metrics?.mode ?? null

      const renderError = (msg: string) =>
        reply.view('wizard/step7-webhook.ejs', {
          user: request.sessionUser,
          dsMode,
          tenants,
          defaults: {
            tenantId,
            label,
            url,
            eventMode,
            events: selected,
            format: rawFormat ?? 'opensteward',
            headers: rawHeaders,
          },
          createdSub: null,
          error: msg,
          csrfToken: (request as any).csrfToken,
        })

      const format = readWebhookFormat(rawFormat)
      if (!format) return renderError('Pick a payload format.')
      const headers = parseHeaderLines(rawHeaders)
      if (!headers.ok) return renderError(headers.error)
      const labelError = validateWebhookLabel(label)
      if (labelError) return renderError(labelError)

      if (!url) return renderError('Endpoint URL is required.')
      // Same rule as /webhooks. It was missing here, so the wizard accepted a
      // plain-http endpoint that the standalone form rejects — a signed
      // payload in cleartext, waved through on the one path a new operator is
      // most likely to take.
      const urlError = validateWebhookUrl(url)
      if (urlError) return renderError(urlError)
      if (eventMode === 'custom' && selected.length === 0) {
        return renderError('Pick at least one event, or choose "All events".')
      }

      try {
        const created = await apiClient.createWebhookSub(token, {
          tenantId,
          label: label || null,
          url,
          events,
          format,
          headers: Object.keys(headers.value).length > 0 ? headers.value : undefined,
        })
        return reply.view('wizard/step7-webhook.ejs', {
          user: request.sessionUser,
          dsMode,
          tenants,
          defaults: {
            tenantId,
            label,
            url,
            eventMode,
            events: selected,
            format,
            headers: rawHeaders,
          },
          createdSub: created,
          error: null,
          csrfToken: (request as any).csrfToken,
        })
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Failed to create webhook subscription.'
        return renderError(message)
      }
    })
  }
}
