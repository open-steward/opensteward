/**
 * The setup wizard keeps no progress state of its own — no cursor, no
 * completion flag. Re-entering it dropped the operator at step 1 with the rail
 * showing nothing done and every later step unclickable, indistinguishable
 * from a fresh install even when branding and platform selection were saved.
 *
 * `computeWizardProgress` derives done-ness from what is actually persisted, so
 * work done outside the wizard (enabling a platform from /platforms, say)
 * counts, and a wiped record un-marks its step. Nothing to keep in sync.
 */
import { describe, it, expect, vi } from 'vitest'
import {
  WIZARD_RAIL_STEPS,
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  computeWizardProgress,
  resumeHref,
  type WizardProgressClient,
  type WizardStepSlug,
} from '../../../src/core/routes/wizard-progress.js'

/** Empty everywhere — a deployment where nothing has been set up yet. */
function freshClient(overrides: Partial<WizardProgressClient> = {}): WizardProgressClient {
  return {
    getVerticals: vi.fn(async () => [
      { name: 'accounting', status: 'up' as const, adapterCount: 0 },
      { name: 'crm', status: 'up' as const, adapterCount: 0 },
    ]),
    listAllPlatformRows: vi.fn(async () => []),
    getCompanyInfo: vi.fn(async () => null),
    listApiKeys: vi.fn(async () => []),
    listWebhookSubs: vi.fn(async () => []),
    ...overrides,
  }
}

const ADMIN = { role: 'admin', dsMode: 'database' }

describe('computeWizardProgress', () => {
  it('marks nothing done on a fresh deployment', async () => {
    const progress = await computeWizardProgress(freshClient(), 'jwt', ADMIN)
    expect(Object.values(progress.done).every((d) => d === false)).toBe(true)
  })

  it('sends a fresh deployment to step 1, so first-run still reads the explainer', async () => {
    const progress = await computeWizardProgress(freshClient(), 'jwt', ADMIN)
    expect(progress.firstIncomplete).toBe('data-store')
  })

  it('counts branding as done once a company name is saved', async () => {
    const client = freshClient({
      getCompanyInfo: vi.fn(async () => ({ name: 'ACME' })),
    })
    const progress = await computeWizardProgress(client, 'jwt', ADMIN)
    expect(progress.done['company-info']).toBe(true)
  })

  it('counts an empty company record as not done', async () => {
    const client = freshClient({
      getCompanyInfo: vi.fn(async () => ({ name: '', baseUrl: null })),
    })
    const progress = await computeWizardProgress(client, 'jwt', ADMIN)
    expect(progress.done['company-info']).toBe(false)
  })

  it('marks the data-store step done once any later step is', async () => {
    // Step 1 persists nothing — it is an explainer. Treating it as done the
    // moment anything else is done is what keeps a fresh install landing on it
    // while a returning operator skips past.
    const client = freshClient({
      getCompanyInfo: vi.fn(async () => ({ name: 'ACME' })),
    })
    const progress = await computeWizardProgress(client, 'jwt', ADMIN)
    expect(progress.done['data-store']).toBe(true)
  })

  it('skips the per-vertical fan-out when no adapter is enabled anywhere', async () => {
    // 22KB of operator rows per vertical, nine verticals. The tiny
    // /api/verticals call answers "is anything enabled at all" first.
    const client = freshClient()
    await computeWizardProgress(client, 'jwt', ADMIN)
    expect(client.listAllPlatformRows).not.toHaveBeenCalled()
  })

  it('counts platforms as done when one is enabled but unconfigured', async () => {
    const client = freshClient({
      getVerticals: vi.fn(async () => [
        { name: 'accounting', status: 'up' as const, adapterCount: 1 },
      ]),
      listAllPlatformRows: vi.fn(async () => [
        { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: false },
      ]),
      // Branding saved too, so the first gap is credentials rather than an
      // earlier step — that is what makes the resume target meaningful here.
      getCompanyInfo: vi.fn(async () => ({ name: 'ACME' })),
    })
    const progress = await computeWizardProgress(client, 'jwt', ADMIN)
    expect(progress.done.platforms).toBe(true)
    expect(progress.done.configure).toBe(false)
    expect(progress.firstIncomplete).toBe('configure')
  })

  it('counts credentials as done when an enabled platform carries config', async () => {
    const client = freshClient({
      getVerticals: vi.fn(async () => [
        { name: 'accounting', status: 'up' as const, adapterCount: 1 },
      ]),
      listAllPlatformRows: vi.fn(async () => [
        { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
      ]),
    })
    const progress = await computeWizardProgress(client, 'jwt', ADMIN)
    expect(progress.done.configure).toBe(true)
  })

  it('ignores config on a platform that is not enabled', async () => {
    const client = freshClient({
      getVerticals: vi.fn(async () => [
        { name: 'accounting', status: 'up' as const, adapterCount: 1 },
      ]),
      listAllPlatformRows: vi.fn(async () => [
        { vertical: 'accounting', slug: 'fortnox', enabled: false, hasConfig: true },
        { vertical: 'accounting', slug: 'xero', enabled: true, hasConfig: false },
      ]),
    })
    const progress = await computeWizardProgress(client, 'jwt', ADMIN)
    expect(progress.done.configure).toBe(false)
  })

  it('names the platform to resume credentials on', async () => {
    // `/setup/wizard/configure` with no vertical+slug bounces back to the
    // platform picker, so resuming into it needs the first enabled adapter
    // that still has no config.
    const client = freshClient({
      getVerticals: vi.fn(async () => [
        { name: 'accounting', status: 'up' as const, adapterCount: 2 },
      ]),
      listAllPlatformRows: vi.fn(async () => [
        { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
        { vertical: 'accounting', slug: 'xero', enabled: true, hasConfig: false },
      ]),
    })
    const progress = await computeWizardProgress(client, 'jwt', ADMIN)
    expect(progress.nextUnconfigured).toEqual({ vertical: 'accounting', slug: 'xero' })
  })

  it('names no platform when every enabled one is configured', async () => {
    const client = freshClient({
      getVerticals: vi.fn(async () => [
        { name: 'accounting', status: 'up' as const, adapterCount: 1 },
      ]),
      listAllPlatformRows: vi.fn(async () => [
        { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
      ]),
    })
    const progress = await computeWizardProgress(client, 'jwt', ADMIN)
    expect(progress.nextUnconfigured).toBeNull()
  })

  it('counts the API-key step as done once a key exists', async () => {
    const client = freshClient({ listApiKeys: vi.fn(async () => [{ id: 'k1' }]) })
    const progress = await computeWizardProgress(client, 'jwt', ADMIN)
    expect(progress.done['api-key']).toBe(true)
  })

  it('counts webhooks as done once a subscription exists', async () => {
    const client = freshClient({ listWebhookSubs: vi.fn(async () => [{ id: 'w1' }]) })
    const progress = await computeWizardProgress(client, 'jwt', ADMIN)
    expect(progress.done.webhooks).toBe(true)
  })

  it('never sends a non-admin to the admin-only steps', async () => {
    // Steps 6 and 7 are requireRole('admin'). Redirecting an operator there is
    // a 403, not a resume.
    const client = freshClient({
      getVerticals: vi.fn(async () => [
        { name: 'accounting', status: 'up' as const, adapterCount: 1 },
      ]),
      listAllPlatformRows: vi.fn(async () => [
        { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
      ]),
      getCompanyInfo: vi.fn(async () => ({ name: 'ACME' })),
      listConnections: vi.fn(async () => [{ id: 'c1' }]),
    })
    const progress = await computeWizardProgress(client, 'jwt', {
      role: 'operator',
      dsMode: 'database',
    })
    expect(progress.firstIncomplete).toBeNull()
  })

  it('treats webhooks as required only in external data-store mode', async () => {
    const configured = {
      getVerticals: vi.fn(async () => [
        { name: 'accounting', status: 'up' as const, adapterCount: 1 },
      ]),
      listAllPlatformRows: vi.fn(async () => [
        { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
      ]),
      getCompanyInfo: vi.fn(async () => ({ name: 'ACME' })),
      listConnections: vi.fn(async () => [{ id: 'c1' }]),
      listApiKeys: vi.fn(async () => [{ id: 'k1' }]),
    }
    const database = await computeWizardProgress(freshClient(configured), 'jwt', {
      role: 'admin',
      dsMode: 'database',
    })
    const external = await computeWizardProgress(freshClient(configured), 'jwt', {
      role: 'admin',
      dsMode: 'external',
    })
    expect(database.firstIncomplete).toBeNull()
    expect(external.firstIncomplete).toBe('webhooks')
  })

  it('treats an unreachable upstream as not done rather than throwing', async () => {
    const client = freshClient({
      getCompanyInfo: vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
      listApiKeys: vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      }),
    })
    const progress = await computeWizardProgress(client, 'jwt', ADMIN)
    expect(progress.done['company-info']).toBe(false)
    expect(progress.done['api-key']).toBe(false)
  })

  describe('every step is one an admin can finish alone', () => {
    /** Branding, one platform enabled and configured, nothing connected. */
    const readyButUnconnected = () =>
      freshClient({
        getCompanyInfo: vi.fn(async () => ({ name: 'ACME' })),
        getVerticals: vi.fn(async () => [
          { name: 'accounting', status: 'up' as const, adapterCount: 1 },
        ]),
        listAllPlatformRows: vi.fn(async () => [
          { vertical: 'accounting', slug: 'fortnox', enabled: true, hasConfig: true },
        ]),
      })

    it('does not stall on a deployment no customer has connected to', async () => {
      // The bug this replaces: a `verify` step derived as
      // `connections.length > 0` and absent from the firstIncomplete skip list.
      // On a fresh deployment it never went done, so this returned 'verify'
      // forever and setup could not be finished.
      const progress = await computeWizardProgress(readyButUnconnected(), 'jwt', ADMIN)
      expect(progress.firstIncomplete).toBe('api-key')
    })

    it('reaches null once the key is minted', async () => {
      const client = readyButUnconnected()
      client.listApiKeys = vi.fn(async () => [{ id: 'k1' }])
      const progress = await computeWizardProgress(client, 'jwt', ADMIN)
      // Webhooks are optional outside external mode, so nothing is left.
      expect(progress.firstIncomplete).toBeNull()
    })

    it('exposes no step that depends on a third party', async () => {
      // A guard on the shape rather than one case: if a future step is derived
      // from something only a customer can cause, this is where it shows up.
      const progress = await computeWizardProgress(readyButUnconnected(), 'jwt', ADMIN)
      expect(Object.keys(progress.done)).not.toContain('verify')
    })
  })
})

describe('resumeHref', () => {
  const at = (firstIncomplete: WizardStepSlug | null) =>
    resumeHref({ done: {} as never, firstIncomplete, nextUnconfigured: null, firstEnabled: null })

  it('stays put when nothing is outstanding', () => {
    expect(at(null)).toBeNull()
  })

  it('stays put when the outstanding step is step 1 itself', () => {
    // The explainer is where a fresh install lands anyway; redirecting to it
    // from itself would loop.
    expect(at('data-store')).toBeNull()
  })

  it('names the step route for every other step', () => {
    for (const step of WIZARD_STEPS) {
      if (step === 'data-store') continue
      expect(at(step), step).toBe(`/setup/wizard/${step}`)
    }
  })
})

describe('the rail and the resume card read one step table', () => {
  it('labels every step, once', () => {
    const labels = WIZARD_STEPS.map((s) => WIZARD_STEP_LABELS[s])
    expect(labels.every((l) => typeof l === 'string' && l.trim().length > 0)).toBe(true)
    expect(new Set(labels).size).toBe(WIZARD_STEPS.length)
  })

  it('keeps the rail rows in WIZARD_STEPS order, each with its label', () => {
    expect(WIZARD_RAIL_STEPS.map((s) => s.slug)).toEqual([...WIZARD_STEPS])
    for (const row of WIZARD_RAIL_STEPS) expect(row.label).toBe(WIZARD_STEP_LABELS[row.slug])
  })

  it('sends the rail back to step 1 with the escape hatch', () => {
    // Without ?stay=1 the rail's own link would redirect straight back to the
    // resume target and step 1 could never be revisited.
    expect(WIZARD_RAIL_STEPS.find((s) => s.slug === 'data-store')?.href).toBe(
      '/setup/wizard?stay=1',
    )
  })

  it('marks exactly the steps the resume scan always skips as optional', () => {
    const optional = WIZARD_RAIL_STEPS.filter((s) => s.optional).map((s) => s.slug)
    expect(optional).toEqual(['logos', 'tenants'])
  })

  it('links each later step where resumeHref would send you', () => {
    for (const row of WIZARD_RAIL_STEPS) {
      if (row.slug === 'data-store') continue
      expect(row.href).toBe(
        resumeHref({
          done: {} as never,
          firstIncomplete: row.slug,
          nextUnconfigured: null,
          firstEnabled: null,
        }),
      )
    }
  })
})
