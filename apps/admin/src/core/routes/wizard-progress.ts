/**
 * Derives how far setup has actually got, from what is persisted upstream.
 *
 * The wizard stores no progress of its own — no cursor, no completion flag —
 * progress is derived from what is persisted upstream. Deriving instead of
 * recording means work done outside the wizard counts (enabling a platform
 * from /platforms), a wiped record un-marks its step, and there is no second
 * source of truth to drift.
 *
 * Every step here is one an admin can finish alone. That is a constraint, not
 * an observation: a step gated on a third party — e.g. "verify connections"
 * derived as `connections.length > 0`, which requires a *customer* to
 * authorize OAuth — can never complete on a fresh deployment, so
 * `firstIncomplete` would return it on every re-entry and setup could never
 * be finished.
 *
 * Cost is the reason for the `adapterCount` gate below: the full catalogue is
 * ~800KB and per-vertical operator rows ~22KB each. `/api/verticals` is a few
 * hundred bytes and answers "is anything enabled at all", which is the common
 * case on a deployment mid-setup.
 */

export const WIZARD_STEPS = [
  'data-store',
  'company-info',
  'logos',
  'platforms',
  'configure',
  'tenants',
  'api-key',
  'webhooks',
] as const

export type WizardStepSlug = (typeof WIZARD_STEPS)[number]

/**
 * What each step is called wherever it is named — the wizard rail and the
 * dashboard's "Finish setting up" card. One table, so "next: Credentials"
 * on the dashboard can never disagree with the rail's "Credentials".
 */
export const WIZARD_STEP_LABELS: Readonly<Record<WizardStepSlug, string>> = {
  'data-store': 'Data store',
  'company-info': 'Branding',
  logos: 'Logos',
  platforms: 'Platforms',
  configure: 'Credentials',
  tenants: 'Tenants',
  'api-key': 'API key',
  webhooks: 'Webhooks',
}

/**
 * Where each step lives. `resumeHref` and the rail both read this, so the
 * resume redirect and the rail's own link cannot drift apart.
 */
const WIZARD_STEP_HREFS: Readonly<Record<WizardStepSlug, string>> = {
  // ?stay=1 — without it, following this link would redirect straight back
  // to the resume target and step 1 could never be revisited.
  'data-store': '/setup/wizard?stay=1',
  'company-info': '/setup/wizard/company-info',
  logos: '/setup/wizard/logos',
  platforms: '/setup/wizard/platforms',
  // Deliberately bare: the route resolves the adapter itself, so the resume
  // redirect and the rail's own link go to the same place and cannot drift.
  configure: '/setup/wizard/configure',
  tenants: '/setup/wizard/tenants',
  'api-key': '/setup/wizard/api-key',
  webhooks: '/setup/wizard/webhooks',
}

/**
 * Steps that are optional whatever the deployment: never resume targets (see
 * `firstIncomplete`), and always linkable from the rail, since not-yet-done is
 * their resting state. Webhooks are optional only outside external mode, which
 * the rail decides per request from `dsMode`.
 */
const OPTIONAL_STEPS: ReadonlySet<WizardStepSlug> = new Set(['logos', 'tenants'])

export interface WizardRailStep {
  slug: WizardStepSlug
  label: string
  href: string
  optional: boolean
}

/**
 * The rail's rows, in order. views/wizard/_rail.ejs reads these from
 * `reply.locals.wizardSteps` — the view cannot import this module, and a
 * second copy of the list in the template is how the two drifted before.
 */
export const WIZARD_RAIL_STEPS: readonly WizardRailStep[] = WIZARD_STEPS.map((slug) => ({
  slug,
  label: WIZARD_STEP_LABELS[slug],
  href: WIZARD_STEP_HREFS[slug],
  optional: OPTIONAL_STEPS.has(slug),
}))

/** Steps behind `requireRole('admin')` — redirecting anyone else there is a 403. */
const ADMIN_ONLY: ReadonlySet<WizardStepSlug> = new Set(['api-key', 'webhooks'])

export interface WizardProgress {
  done: Record<WizardStepSlug, boolean>
  /** Where a returning operator should resume; `null` when nothing is left. */
  firstIncomplete: WizardStepSlug | null
  /**
   * First enabled platform still missing config. The credentials step needs a
   * `vertical` + `slug` — without them it bounces back to the platform picker.
   */
  nextUnconfigured: { vertical: string; slug: string } | null
  /**
   * First enabled platform at all, configured or not.
   *
   * What the credentials step falls back on once nothing is outstanding. The
   * rail links there with no query string — it is static markup and cannot know
   * the adapter — so without this the step is unreachable by its own nav entry
   * the moment every adapter is configured, which is exactly when an operator
   * clicks it to review or rotate a credential.
   */
  firstEnabled: { vertical: string; slug: string } | null
}

/**
 * The slice of AdminApiClient this needs. Structural so tests can pass a stub
 * without standing up the whole client.
 */
export interface WizardProgressClient {
  getVerticals(token: string): Promise<Array<{ name: string; adapterCount: number }>>
  listAllPlatformRows(
    token: string,
  ): Promise<Array<{ vertical?: string; slug: string; enabled: boolean; hasConfig: boolean }>>
  getCompanyInfo(token: string): Promise<{ name?: string | null; baseUrl?: string | null } | null>
  listApiKeys(token: string): Promise<unknown[]>
  listWebhookSubs(token: string): Promise<unknown[]>
}

/** Upstream being down means "not done", never an error page mid-wizard. */
async function orEmpty<T>(p: Promise<T[]>): Promise<T[]> {
  return p.catch(() => [])
}

async function orNull<T>(p: Promise<T | null>): Promise<T | null> {
  return p.catch(() => null)
}

export async function computeWizardProgress(
  apiClient: WizardProgressClient,
  token: string,
  opts: {
    role?: string
    dsMode?: string | null
    /**
     * Whether the operator has made an explicit logo choice.
     *
     * Passed in rather than read here on purpose: the caller already has it
     * behind loadLogoSettings' TTL cache, and adding a seventh method to
     * `WizardProgressClient` would break every existing test stub silently —
     * the call would throw before `orEmpty` ever saw a promise, the wizard
     * preHandler's catch would swallow it, and the whole rail would quietly
     * stop rendering.
     */
    logosDone?: boolean
    /**
     * Whether a tenant beyond the seeded `default` exists.
     *
     * Passed in for the same reason as `logosDone`: a seventh method on
     * `WizardProgressClient` would throw on every existing test stub before
     * `orEmpty` saw a promise, the preHandler's catch would swallow it, and the
     * whole rail would quietly stop rendering.
     */
    tenantsDone?: boolean
  },
): Promise<WizardProgress> {
  const [verticals, company, apiKeys, webhookSubs] = await Promise.all([
    orEmpty(apiClient.getVerticals(token)),
    orNull(apiClient.getCompanyInfo(token)),
    orEmpty(apiClient.listApiKeys(token)),
    orEmpty(apiClient.listWebhookSubs(token)),
  ])

  // `adapterCount` is the global enabled count repeated per vertical, so it
  // says whether anything is enabled but not where. Only when it says yes is
  // fetching the rows worth its payload — on a fresh install this is every
  // wizard page load, so the check stays.
  //
  // One request for all verticals, not one each: this ran on every wizard GET
  // and the per-vertical version cost nine, which is a large share of
  // integration-server's per-IP budget for a progress indicator.
  const anyEnabled = verticals.some((v) => v.adapterCount > 0)
  const rows: Array<{ vertical: string; slug: string; enabled: boolean; hasConfig: boolean }> =
    anyEnabled
      ? (await orEmpty(apiClient.listAllPlatformRows(token))).filter(
          (r): r is typeof r & { vertical: string } => typeof r.vertical === 'string',
        )
      : []

  const done: Record<WizardStepSlug, boolean> = {
    // Filled in below — step 1 persists nothing of its own.
    'data-store': false,
    'company-info': hasText(company?.name) || hasText(company?.baseUrl),
    // Cosmetic step. "Done" means somebody chose deliberately — the
    // logos.source row is off its seeded default — NOT that the row exists,
    // since it is seeded on first boot and would otherwise read as done before
    // anyone had seen the step.
    logos: opts.logosDone ?? false,
    platforms: rows.some((r) => r.enabled),
    // `hasConfig` is coarse by construction: upstream computes it as "the
    // stored config object has at least one key", and the redacted read
    // whitelists four fields, so a leftover key from an earlier caller reads
    // as configured. Erring toward done is the right way round — it lets the
    // operator move on, and the credentials page shows the truth when they
    // open it. The alternative (a per-platform config read) still cannot see
    // api-key or basic-auth credentials through the redaction.
    configure: rows.some((r) => r.enabled && r.hasConfig),
    // `default` is seeded, so its presence says nothing about intent. Only a
    // tenant somebody actually created counts as having made this decision.
    tenants: opts.tenantsDone ?? false,
    'api-key': apiKeys.length > 0,
    webhooks: webhookSubs.length > 0,
  }

  // Step 1 is an explainer with nothing to save. Counting it done as soon as
  // anything else is keeps a first run landing on it while a returning
  // operator skips past.
  done['data-store'] = Object.values(done).some(Boolean)

  const unconfigured = rows.find((r) => r.enabled && !r.hasConfig)
  // Same already-fetched rows, so this costs nothing beyond the scan.
  const enabled = rows.find((r) => r.enabled)

  return {
    done,
    firstIncomplete: firstIncomplete(done, opts),
    nextUnconfigured: unconfigured
      ? { vertical: unconfigured.vertical, slug: unconfigured.slug }
      : null,
    firstEnabled: enabled ? { vertical: enabled.vertical, slug: enabled.slug } : null,
  }
}

/**
 * Where to send a returning operator. `null` means stay on step 1 — either
 * nothing is outstanding, or the outstanding step is step 1 itself.
 *
 * 'logos' is currently unreachable here — `firstIncomplete` skips it by
 * design, so an operator who wants monogram tiles is never redirected there.
 * It resolves through the same table anyway, so the mapping stays honest if
 * that skip is ever lifted.
 */
export function resumeHref(progress: Pick<WizardProgress, 'firstIncomplete'>): string | null {
  const step = progress.firstIncomplete
  if (step === null || step === 'data-store') return null
  return WIZARD_STEP_HREFS[step]
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function firstIncomplete(
  done: Record<WizardStepSlug, boolean>,
  opts: { role?: string; dsMode?: string | null },
): WizardStepSlug | null {
  const isAdmin = opts.role === 'admin'
  for (const step of WIZARD_STEPS) {
    if (done[step]) continue
    if (ADMIN_ONLY.has(step) && !isAdmin) continue
    // Webhooks are optional outside external mode — the rail already labels
    // them so. Resuming into a step the operator deliberately skipped would
    // make the wizard impossible to finish.
    // Logos are decoration. An operator happy with monogram tiles will never
    // touch this step, so resuming into it would make the wizard impossible to
    // finish — the same reasoning as the webhooks skip above. Never a resume
    // target: the step is reached by walking forward from Branding, from the
    // rail once ticked, or from /platforms?tab=logos. Its done flag only drives
    // the rail's checkmark.
    if (step === 'logos') continue
    // Tenants are optional in the strong sense: one team running the whole
    // deployment never needs a second one, so this can never go done for them.
    // A step that cannot complete and is not skipped is what made the old
    // "verify connections" step impossible to get past.
    if (step === 'tenants') continue
    if (step === 'webhooks' && opts.dsMode !== 'external') continue
    return step
  }
  return null
}
