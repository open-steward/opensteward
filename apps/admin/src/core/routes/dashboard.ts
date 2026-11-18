/**
 * The dashboard: a "Needs attention" panel, then the vertical cards.
 *
 * The panel is derived per request — see ./dashboard-tasks.ts — from the
 * connections this page loads anyway plus two best-effort sync-job reads.
 * Best-effort means: a read that fails renders a line saying the check did
 * not run, never an empty panel, because "nothing needs attention" and "we
 * could not ask" are the same sentence with opposite meanings. A 404 is the
 * one rejection that IS an answer: in `DATA_STORE_MODE=passthrough` there is
 * no sync engine, integration-server does not serve `/admin/sync-jobs`, and
 * there are genuinely no jobs to show.
 *
 * Rows can be cleared once (operator+, deployment-wide) through the two POSTs
 * below. The form carries keys and fingerprints, but the server re-derives
 * the tasks and forwards only the keys that are live AND whose fingerprint
 * still matches what the form saw: admin-api's dismissal table cannot become
 * a write sink for arbitrary keys, and a clear pressed on a stale page cannot
 * hide a condition that has since changed under it.
 *
 * Each card lists the adapters themselves, each one a link into its own
 * configuration — or, for a non-admin who cannot reach /platforms at all, into
 * that adapter's connections. A bare "<n> adapters registered" count would
 * answer nothing an operator asks: not *which* adapters are live, not whether
 * their credentials are in place, and it would lead nowhere.
 *
 * Cost is one extra upstream call: `listAllPlatformRows` returns every
 * vertical's rows in a single request (the per-vertical version costs nine
 * and can rate-limit the admin out of integration-server). Display names
 * come from the on-disk catalogue, so naming 1,545 platforms costs nothing on
 * the wire.
 */
import type { FastifyInstance } from 'fastify'
import { requireAuth, requireRole } from '../auth/middleware'
import { flashSuccess, setFlash } from '../flash'
import type {
  AdminApiClient,
  DashboardDismissalRecord,
  SyncJobRecord,
} from '../proxy/admin-api-client'
import { platformIndex, type CatalogPlatformSummary } from './platform-catalog'
import { loadLogoSettings } from './logo-config'
import { renderPlatformLogo } from '../platform-logo'
import type { LogoConfig } from '@opensteward/shared'
import { VERTICAL_LABELS, isKnownVertical } from '../verticals'
import {
  KIND_MIN_ROLE,
  UNDO_WINDOW_MS,
  deriveDashboardTasks,
  type DashboardRole,
  type DashboardTask,
  type DashboardTaskKind,
  type DashboardTasksOutput,
} from './dashboard-tasks'
import { loadWizardProgress } from './wizard'
import {
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  resumeHref,
  type WizardProgressClient,
  type WizardStepSlug,
} from './wizard-progress'

/** How many adapters a card lists before collapsing the rest into a link. */
export const ADAPTERS_PER_CARD = 6

/** The window of sync jobs the panel reasons over — integration-server's cap. */
const SYNC_JOB_WINDOW = 200

/** The keys admin-api accepts, minus `wizard:*`, which is not a panel row.
 *  `vertical:down:*` is absent on purpose: that row is not clearable. */
const TASK_KEY_RE =
  /^(conn:expired|platform:creds|sync:failed|refresh:failing):[A-Za-z0-9_.:/-]{1,300}$/

/** Every key a clear can be undone for: the panel rows, plus a skipped setup card. */
const UNDO_KEY_RE =
  /^(conn:expired|platform:creds|sync:failed|refresh:failing|wizard):[A-Za-z0-9_.:/-]{1,300}$/

const ROLE_LEVEL: Record<DashboardRole, number> = { viewer: 0, operator: 1, admin: 2 }

type PlatformRow = Awaited<ReturnType<AdminApiClient['listAllPlatformRows']>>[number]

export interface DashboardAdapter {
  slug: string
  name: string
  /** False when the adapter is enabled but its OAuth client id/secret is unset. */
  hasConfig: boolean
  connectionCount: number
  /** At least one connection is in `platform_error` — the platform rejected the
   *  operator's client credentials, so re-authorizing the customer won't help. */
  credsInvalid: boolean
  href: string
  /** The platform's logo, or its monogram — see ../platform-logo.ts. */
  logoHtml: string
}

/** The "Finish setting up" card — see ../../views/_setup-resume.ejs. */
export interface SetupResume {
  step: WizardStepSlug
  stepLabel: string
  /** 1-based, of `stepCount`. */
  stepIndex: number
  stepCount: number
  /** Where "Continue setup" goes: the resume target, or step 1 held open. */
  href: string
}

/** A "Skip for now" recent enough that Undo is still worth offering. */
export interface SetupSkipped {
  /** The dismissal key, `wizard:<step>` — what the Undo form carries. */
  key: string
  stepLabel: string
}

/** The dismissal key "Skip for now" stores; its fingerprint is the step again. */
const skipKey = (step: WizardStepSlug) => `wizard:${step}`
const isSkipKey = (key: string) => key.startsWith('wizard:')

function isWizardStep(value: unknown): value is WizardStepSlug {
  return typeof value === 'string' && (WIZARD_STEPS as readonly string[]).includes(value)
}

/** A panel row with what the view needs beyond the derived task. */
export interface DashboardTaskRow extends DashboardTask {
  logoHtml: string
}

function statusOf(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status
}

/**
 * The two sync-job reads the panel needs. Null halves mean "could not ask";
 * empty halves mean "asked, none" — including the 404 a passthrough
 * deployment answers, where there is no sync engine to have jobs.
 *
 * That 404 is kept as `passthrough`: it is the one place the dashboard can
 * tell a passthrough deployment from an outage, which the setup card needs
 * (see `loadSetupResume`).
 */
interface SyncJobReads {
  failed: SyncJobRecord[] | null
  recent: SyncJobRecord[] | null
  passthrough: boolean
}

async function loadSyncJobs(apiClient: AdminApiClient, token: string): Promise<SyncJobReads> {
  try {
    const [failed, recent] = await Promise.all([
      apiClient.listSyncJobs(token, { status: 'failed', limit: SYNC_JOB_WINDOW }),
      apiClient.listSyncJobs(token, { limit: SYNC_JOB_WINDOW }),
    ])
    return { failed, recent, passthrough: false }
  } catch (err) {
    if (statusOf(err) === 404) return { failed: [], recent: [], passthrough: true }
    return { failed: null, recent: null, passthrough: false }
  }
}

/** Everything the panel derives from, fetched together. */
async function loadTasks(
  apiClient: AdminApiClient,
  token: string,
  role: DashboardRole,
  opts: {
    connections?: Awaited<ReturnType<AdminApiClient['listConnections']>>
    /** Already fetched by the caller. The clear route leaves it out: a down
     *  vertical is not a clearable row, so it has no key to match. */
    verticals?: Awaited<ReturnType<AdminApiClient['getVerticals']>>
    /** Already fetched by the caller; `null` when that read failed. */
    dismissals?: DashboardDismissalRecord[] | null
    /** Already fetched by the caller (the dashboard shares it with the setup card). */
    syncJobs?: SyncJobReads
    cap?: number
    platformName?: (vertical: string, platform: string) => string
  } = {},
): Promise<DashboardTasksOutput> {
  const [connections, syncJobs, dismissals] = await Promise.all([
    opts.connections ?? apiClient.listConnections(token),
    opts.syncJobs ?? loadSyncJobs(apiClient, token),
    opts.dismissals !== undefined
      ? opts.dismissals
      : apiClient.listDashboardDismissals(token).catch(() => null),
  ])
  return deriveDashboardTasks({
    connections,
    verticals: opts.verticals,
    failedJobs: syncJobs.failed,
    recentJobs: syncJobs.recent,
    dismissals,
    role,
    now: Date.now(),
    cap: opts.cap,
    platformName: opts.platformName,
  })
}

/**
 * The "Finish setting up" card's inputs, or null when the scan could not run.
 *
 * Admins only — the caller gates on role. The last two wizard steps are
 * admin-gated, and two of the reads behind the scan (`listApiKeys`,
 * `listWebhookSubs`) are operator+ on admin-api, so for anyone else the card
 * would be wrong or the reads refused.
 *
 * The verticals and platform rows are the dashboard's own, already fetched;
 * only the reads the page does not otherwise make go upstream. Company info
 * is one of them, on purpose: the layout's branding hook has a copy, but its
 * null means "could not read", not "not saved", and the scan must not mark
 * step 2 undone on an outage.
 *
 * Those reads are made HERE, strictly, and handed to the scan already
 * resolved. `computeWizardProgress` swallows a failed read as "not done" —
 * right for the wizard rail, which degrades to an unticked item, wrong for a
 * card that would then name step 2 or 7 on a finished deployment. One
 * rejection means the scan cannot run, and the card is hidden.
 *
 * The data-store mode is the awkward input: the client answers `null` both
 * on an outage and on a passthrough deployment, where there is no store to
 * have metrics. The sync-jobs read tells them apart (passthrough has no sync
 * engine and answers 404). With the mode unknown and nothing else
 * outstanding the deployment may be external with webhooks still to do, so
 * the answer is "cannot say", not "finished". While an earlier step is
 * outstanding the mode changes nothing, and the card names that step.
 *
 * `complete` is separate from `card` because the two questions differ: the
 * card is null on a skipped step, but the deployment is not finished.
 * `honourSkip: false` shows the card past a skip — the `?wizard=complete`
 * landing needs an answer, and a card is one where silence is not.
 */
async function loadSetupResume(
  apiClient: AdminApiClient,
  user: { token: string; role: string },
  input: {
    verticals: Awaited<ReturnType<AdminApiClient['getVerticals']>>
    rows: PlatformRow[]
    dismissals: DashboardDismissalRecord[] | null
    /** The sync engine answered 404: no data store, so no metrics to expect. */
    passthrough: boolean
    honourSkip: boolean
    now: number
  },
): Promise<{ complete: boolean; card: SetupResume | null; skipped: SetupSkipped | null } | null> {
  const token = user.token
  let company: Awaited<ReturnType<AdminApiClient['getCompanyInfo']>>
  let apiKeys: Awaited<ReturnType<AdminApiClient['listApiKeys']>>
  let webhookSubs: Awaited<ReturnType<AdminApiClient['listWebhookSubs']>>
  let metrics: Awaited<ReturnType<AdminApiClient['getDataStoreMetrics']>>
  try {
    // try/catch rather than `.catch` on the Promise.all: a read that throws
    // synchronously does so while the array is being built, before there is
    // a promise to catch on.
    ;[company, apiKeys, webhookSubs, metrics] = await Promise.all([
      apiClient.getCompanyInfo(token),
      apiClient.listApiKeys(token),
      apiClient.listWebhookSubs(token),
      apiClient.getDataStoreMetrics(token),
    ])
  } catch {
    return null
  }
  const dsMode = metrics?.mode ?? (input.passthrough ? 'passthrough' : null)

  const client: WizardProgressClient = {
    getVerticals: async () => input.verticals,
    listAllPlatformRows: async () => input.rows,
    getCompanyInfo: async () => company,
    listApiKeys: async () => apiKeys,
    listWebhookSubs: async () => webhookSubs,
  }
  const progress = await loadWizardProgress(apiClient, user, {
    withRailInputs: false,
    client,
    dsMode,
  }).catch(() => null)
  if (!progress) return null
  const step = progress.firstIncomplete
  if (step === null) return dsMode === null ? null : { complete: true, card: null, skipped: null }

  const skip = input.honourSkip
    ? input.dismissals?.find((d) => d.key === skipKey(step) && d.fingerprint === step)
    : undefined
  if (skip) {
    // The same window as the panel's "Cleared recently" strip: a mis-click
    // next to "Continue setup" is a deployment-wide write, and needs a way
    // back that is not "wait for the next step to change".
    const clearedAt = Date.parse(skip.createdAt)
    const recent = Number.isFinite(clearedAt) && input.now - clearedAt <= UNDO_WINDOW_MS
    return {
      complete: false,
      card: null,
      skipped: recent ? { key: skip.key, stepLabel: WIZARD_STEP_LABELS[step] } : null,
    }
  }
  return {
    complete: false,
    card: {
      step,
      stepLabel: WIZARD_STEP_LABELS[step],
      stepIndex: WIZARD_STEPS.indexOf(step) + 1,
      stepCount: WIZARD_STEPS.length,
      // `null` from resumeHref means step 1, which needs the escape hatch or
      // GET /setup/wizard would redirect straight back to it.
      href: resumeHref(progress) ?? '/setup/wizard?stay=1',
    },
    skipped: null,
  }
}

/**
 * The key → fingerprint pairs a clear form carried, or null when the field is
 * not what the panel renders. `@fastify/formbody` is flat, so the batch
 * travels as one JSON string in a hidden field rather than `items[i][key]`.
 */
function parseRequestedItems(raw: unknown): Map<string, string> | null {
  if (typeof raw !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 50) return null
  const items = new Map<string, string>()
  for (const item of parsed) {
    const { key, fingerprint } = (item ?? {}) as { key?: unknown; fingerprint?: unknown }
    if (typeof key !== 'string' || !TASK_KEY_RE.test(key)) return null
    if (typeof fingerprint !== 'string') return null
    items.set(key, fingerprint)
  }
  return items
}

function kindOfKey(key: string): DashboardTaskKind {
  if (key.startsWith('platform:creds:')) return 'platform_creds'
  if (key.startsWith('sync:failed:')) return 'sync_failed'
  if (key.startsWith('refresh:failing:')) return 'refresh_failing'
  return 'conn_expired'
}

function badRequest(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400 })
}

export function createDashboardRoutes(apiClient: AdminApiClient) {
  return async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', requireAuth)

    fastify.get<{ Querystring: { wizard?: string } }>('/', async (request, reply) => {
      const token = request.sessionUser!.token
      const role = request.sessionUser!.role as DashboardRole
      // /platforms is admin-only in its entirety, so an operator or viewer sent
      // there gets a 403. They can read /connections, which is the useful half
      // of what the link is for.
      const isAdmin = role === 'admin'
      // Step 8's Finish / Skip-for-now lands here: the page owes an answer
      // about setup, so a skipped card is shown again and a scan that could
      // not run says so rather than rendering nothing.
      const confirming = request.query.wizard === 'complete'

      const [verticals, connections, platformRows, logoSettings, dismissals, syncJobs] =
        await Promise.all([
          apiClient.getVerticals(token),
          apiClient.listConnections(token),
          // Best-effort: the cards degrade to a plain adapter count rather than
          // taking the whole dashboard down with them.
          apiClient
            .listAllPlatformRows(token)
            .then((rows) => ({ ok: true, rows }))
            .catch(() => ({ ok: false, rows: [] as PlatformRow[] })),
          // Logos are decoration: if the settings cannot be read, rows show
          // monograms rather than the dashboard showing an error.
          loadLogoSettings(apiClient, token).catch(() => null),
          // Read once here for both the panel's clears and the card's skip.
          // Null means "could not ask" — the panel says so; the card shows,
          // since a reminder that was skipped is a smaller wrong than one that
          // was not and is hidden.
          apiClient.listDashboardDismissals(token).catch(() => null),
          // Read once here for the panel's rows and the card's passthrough test.
          loadSyncJobs(apiClient, token),
        ])
      const logo: LogoConfig = logoSettings?.config ?? { logoSource: 'none' }
      const logoOpts = {
        logoSource: logo.logoSource,
        brandfetchClientId: logo.brandfetchClientId,
        size: 'xs' as const,
      }

      // Only pay for the catalogue when there is something to name. On a fresh
      // install — every dashboard load until the first adapter is enabled —
      // this skips parsing a megabyte of JSON. The panel asks for it lazily,
      // per row, so a healthy deployment with no rows still skips it.
      let catalogCache: Map<string, CatalogPlatformSummary> | null = null
      const catalogOf = () => (catalogCache ??= platformIndex())
      const platformName = (vertical: string, platform: string) =>
        catalogOf().get(`${vertical}/${platform}`)?.name ?? platform

      const [attention, setupResume] = await Promise.all([
        loadTasks(apiClient, token, role, {
          connections,
          verticals,
          dismissals,
          syncJobs,
          platformName,
        }),
        isAdmin && platformRows.ok
          ? loadSetupResume(apiClient, request.sessionUser!, {
              verticals,
              rows: platformRows.rows,
              dismissals,
              passthrough: syncJobs.passthrough,
              honourSkip: !confirming,
              now: Date.now(),
            })
          : null,
      ])
      // Tenant names for the rows' tenant column — only when a row has one to
      // name, and non-fatal as on every page that shows one: the partial falls
      // back to the bare id, which still identifies the tenant.
      const tenants = attention.tasks.some((t) => t.tenantId)
        ? await apiClient.listTenants(token).catch(() => [])
        : []

      const statusCounts = { valid: 0, expiring_soon: 0, expired: 0, platform_error: 0 }
      const connectionCounts = new Map<string, number>()
      const credsInvalid = new Set<string>()
      for (const c of connections) {
        const s = c.status as keyof typeof statusCounts
        if (s in statusCounts) statusCounts[s]++
        const key = `${c.vertical}/${c.platform}`
        connectionCounts.set(key, (connectionCounts.get(key) ?? 0) + 1)
        if (c.status === 'platform_error') credsInvalid.add(key)
      }

      const catalog = platformRows.rows.length
        ? catalogOf()
        : (catalogCache ?? new Map<string, CatalogPlatformSummary>())

      const tasks: DashboardTaskRow[] = attention.tasks.map((t) => {
        // A vertical row has no platform, so nothing to draw a logo for.
        if (t.kind === 'vertical_down') return { ...t, logoHtml: '' }
        const entry = catalog.get(`${t.vertical}/${t.platform}`)
        return {
          ...t,
          logoHtml: renderPlatformLogo(
            {
              slug: t.platform,
              name: t.platformName,
              vertical: t.vertical,
              primaryColor: entry?.primaryColor,
              domain: entry?.domain,
            },
            logoOpts,
          ),
        }
      })

      const enabled = new Map<string, DashboardAdapter[]>()
      const configuredButOff = new Map<string, number>()
      for (const row of platformRows.rows) {
        const vertical = row.vertical
        if (!vertical) continue
        const key = `${vertical}/${row.slug}`
        if (!row.enabled) {
          // Credentials saved, adapter switched off — worth a line, because it
          // is invisible everywhere else on this page.
          if (row.hasConfig) {
            configuredButOff.set(vertical, (configuredButOff.get(vertical) ?? 0) + 1)
          }
          continue
        }
        const list = enabled.get(vertical) ?? []
        const entry = catalog.get(key)
        list.push({
          slug: row.slug,
          name: entry?.name ?? row.slug,
          logoHtml: renderPlatformLogo(
            {
              // No catalogue name means no name: the renderer then takes the
              // slug's initials upper-cased, which read at 20px where the
              // slug's own lowercase pair would not.
              slug: row.slug,
              name: entry?.name ?? '',
              vertical,
              primaryColor: entry?.primaryColor,
              domain: entry?.domain,
            },
            logoOpts,
          ),
          hasConfig: row.hasConfig,
          connectionCount: connectionCounts.get(key) ?? 0,
          credsInvalid: credsInvalid.has(key),
          href: isAdmin
            ? `/platforms/${encodeURIComponent(vertical)}/${encodeURIComponent(row.slug)}`
            : `/connections?vertical=${encodeURIComponent(vertical)}&platform=${encodeURIComponent(row.slug)}`,
        })
        enabled.set(vertical, list)
      }

      const cards = verticals.map((v) => {
        // Anything needing attention first, then busiest, then by name — the
        // card shows six, so the order decides what an operator actually sees.
        const adapters = (enabled.get(v.name) ?? []).sort(
          (a, b) =>
            Number(b.credsInvalid) - Number(a.credsInvalid) ||
            Number(!b.hasConfig) - Number(!a.hasConfig) ||
            b.connectionCount - a.connectionCount ||
            a.name.localeCompare(b.name),
        )
        return {
          ...v,
          label: isKnownVertical(v.name) ? VERTICAL_LABELS[v.name] : v.name,
          adapters,
          visible: adapters.slice(0, ADAPTERS_PER_CARD),
          more: Math.max(0, adapters.length - ADAPTERS_PER_CARD),
          configuredButOff: configuredButOff.get(v.name) ?? 0,
          allHref: isAdmin
            ? `/platforms?tab=configure&vertical=${encodeURIComponent(v.name)}&status=enabled`
            : `/connections?vertical=${encodeURIComponent(v.name)}`,
        }
      })

      // A cleared row must not come back from the browser's cache on Back.
      reply.header('cache-control', 'no-store')
      return reply.view('dashboard.ejs', {
        user: request.sessionUser,
        isAdmin,
        verticals: cards,
        // False when the rows could not be fetched: the cards say so instead of
        // reporting an empty list as "nothing configured".
        adaptersKnown: platformRows.ok,
        connections,
        statusCounts,
        totalConnections: connections.length,
        // Only when the scan agrees: step 8's Skip-for-now links here whatever
        // the state of steps 1-7, and "Setup complete" above "Finish setting
        // up" is a contradiction.
        wizardComplete: confirming && setupResume?.complete === true,
        // ...and when the scan could not say (or was not run — a non-admin
        // landing here), say that, rather than neither panel nor card.
        setupUnconfirmed: confirming && setupResume === null,
        setupResume: setupResume?.card ?? null,
        setupSkipped: setupResume?.skipped ?? null,
        tasks,
        tasksHidden: attention.hidden,
        tasksHiddenHref: attention.hiddenHref,
        tasksUnavailable: attention.unavailable,
        // Labelled here: the panel says "Accounting", as the cards below do.
        tasksUnavailableVerticals: attention.unavailableVerticals.map((v) =>
          isKnownVertical(v) ? VERTICAL_LABELS[v] : v,
        ),
        tasksAllVerticalsDown: attention.allVerticalsDown,
        recentlyCleared: attention.recentlyCleared,
        tenants,
      })
    })

    /**
     * Clear one or more rows. Operator+ on this hop; admin-api enforces the
     * same floor and refuses `platform:creds:*` from an operator. Rather than
     * let that 403 the whole batch, the keys are filtered here by the same
     * policy table the panel rendered from — an operator's "Clear all" never
     * carries a platform row in the first place, but a stale page might.
     *
     * A stale page can also carry a fingerprint the condition has moved past
     * (a re-expiry, a third connection joining a platform failure). Such an
     * item is dropped, not rewritten: storing the live fingerprint would hide
     * a breakage the operator never looked at.
     *
     * No try/catch around the write: a clear that failed upstream must not
     * answer with a redirect and "Cleared", so it goes to the error page
     * carrying the upstream reason.
     */
    fastify.post<{ Body: { items?: string } }>(
      '/dashboard/tasks/dismiss',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const role = request.sessionUser!.role as DashboardRole
        const wanted = parseRequestedItems(request.body?.items)
        if (!wanted) throw badRequest('The clear request did not carry a list of task keys.')

        const live = await loadTasks(apiClient, token, role, { cap: Infinity })
        const items = live.tasks
          .filter((t) => wanted.get(t.key) === t.fingerprint && t.canClear)
          .map((t) => ({ key: t.key, fingerprint: t.fingerprint }))
        if (items.length === 0) {
          // The row is already gone (someone else cleared it, or the
          // condition resolved), has changed since the page was loaded, or
          // is one this role cannot clear. Not an error, but not "Cleared"
          // either.
          setFlash(reply, {
            tone: 'warning',
            body: 'Nothing to clear — the dashboard has changed since it was loaded.',
          })
          return reply.redirect('/')
        }
        await apiClient.dismissDashboardTasks(token, items)
        flashSuccess(
          reply,
          items.length === 1
            ? 'Cleared — Undo is on the dashboard.'
            : `Cleared ${items.length} items.`,
        )
        return reply.redirect('/')
      },
    )

    /**
     * Undo one clear. The role floor is per key, as on admin-api: an operator
     * may not un-clear a platform row any more than clear one, and is refused
     * here rather than one hop down. A `wizard:*` key is the setup card's
     * "Skip for now", admin on both hops like the card itself.
     *
     * The Undo strip is deployment-wide, so two people can press it, and a
     * browser can double-submit. admin-api answers the second with 404 — the
     * clear is already gone. The row is visible either way, which is what was
     * asked for, so that one status is a flash, not the error page. Every
     * other failure still is one: an undo that did not happen must not say it did.
     */
    fastify.post<{ Body: { key?: string } }>(
      '/dashboard/tasks/undismiss',
      { preHandler: [requireRole('operator')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const user = request.sessionUser!
        const key = request.body?.key
        if (typeof key !== 'string' || !UNDO_KEY_RE.test(key)) {
          throw badRequest('The undo request did not name a task key.')
        }
        // `clear` is null only for `vertical_down`, whose key UNDO_KEY_RE
        // does not admit; the fallback is for the type, not a reachable case.
        const floor: DashboardRole = isSkipKey(key)
          ? 'admin'
          : (KIND_MIN_ROLE[kindOfKey(key)].clear ?? 'admin')
        if ((ROLE_LEVEL[user.role as DashboardRole] ?? 0) < ROLE_LEVEL[floor]) {
          return reply.status(403).view('error.ejs', {
            user,
            status: 403,
            message: `Restoring this item needs the ${floor} role. You are signed in as ${user.role}.`,
            requestId: null,
          })
        }
        try {
          await apiClient.undismissDashboardTask(token, key)
        } catch (err) {
          if (statusOf(err) !== 404) throw err
          setFlash(reply, { tone: 'warning', body: 'Already restored.' })
          return reply.redirect('/')
        }
        flashSuccess(reply, isSkipKey(key) ? 'Setup reminder restored.' : 'Restored.')
        return reply.redirect('/')
      },
    )

    /**
     * "Skip for now" on the setup-resume card. Admin-only on both hops:
     * admin-api refuses a `wizard:*` key from an operator, and the card is
     * never rendered for one.
     *
     * The step is validated against the wizard's own list and stored as is —
     * not re-derived. A skip that arrives after the next step has moved on
     * stores a key the card no longer reads, so the card stays; nothing is
     * hidden that the admin did not look at. Same rule as the panel's clears,
     * reached by a cheaper route.
     */
    fastify.post<{ Body: { step?: string } }>(
      '/dashboard/setup/skip',
      { preHandler: [requireRole('admin')] },
      async (request, reply) => {
        const token = request.sessionUser!.token
        const step = request.body?.step
        if (!isWizardStep(step)) throw badRequest('The skip request did not name a wizard step.')
        await apiClient.dismissDashboardTasks(token, [{ key: skipKey(step), fingerprint: step }])
        flashSuccess(
          reply,
          `Setup reminder hidden — Undo is on the dashboard, and the wizard stays under Setup wizard in the sidebar. It returns by itself once the next step is no longer ${WIZARD_STEP_LABELS[step]}.`,
        )
        return reply.redirect('/')
      },
    )
  }
}
