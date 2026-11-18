/**
 * Effective logo configuration for the admin UI.
 *
 * Reads the operator's `logos.*` runtime settings through the existing admin-api
 * proxy (JWT, per request) rather than a `RuntimeSettingsClient` — the admin
 * already holds a token per request, so this needs no SERVICE_SECRET.
 *
 * The important discipline here: `degraded` is derived by comparing what the
 * operator asked for against what `resolveLogoConfig()` actually returns. It is
 * never a reimplementation of those rules, so the banner on screen and the
 * behaviour of the catalog cannot disagree.
 */
import { join } from 'path'
import { renderFile } from 'ejs'
import { resolveLogoConfig, type LogoConfig } from '@opensteward/shared'
import { jsonForScript } from '../views/helpers'
import type { AdminApiClient, RuntimeSettingRow } from '../proxy/admin-api-client'

export const LOGO_SOURCE_KEY = 'logos.source'
export const LOGO_CLIENT_ID_KEY = 'logos.brandfetch_client_id'

/** Where a resolved value came from — drives the "(from environment)" hints. */
export interface LogoOrigin {
  source: 'db' | 'env' | 'default'
  clientId: 'db' | 'env' | 'none'
}

export interface EffectiveLogoConfig extends LogoConfig {
  /** What the operator asked for, before validation. */
  requestedSource: string
  requestedClientId: string
  /** True when resolveLogoConfig refused the request and fell back. */
  degraded: boolean
  degradeReason: 'unknown-mode' | 'cdn-missing-client-id' | null
  origin: LogoOrigin
  /** The setting is off its seeded default, i.e. somebody chose deliberately. */
  isExplicitChoice: boolean
}

export interface LoadedLogoSettings {
  rows: RuntimeSettingRow[]
  config: EffectiveLogoConfig
}

/**
 * Process-global, 45s. Runtime settings are deployment-wide and every reader
 * here is admin-gated, so there is nothing per-user to key on. Busted
 * synchronously on save so the redirect after a POST shows the truth.
 */
const TTL_MS = 45_000
let cache: { value: LoadedLogoSettings; expiresAt: number } | null = null

export function invalidateLogoSettingsCache(): void {
  cache = null
}

function readRow(rows: RuntimeSettingRow[], key: string): RuntimeSettingRow | undefined {
  return rows.find((r) => r.key === key)
}

export function buildEffectiveLogoConfig(rows: RuntimeSettingRow[]): EffectiveLogoConfig {
  const sourceRow = readRow(rows, LOGO_SOURCE_KEY)
  const clientIdRow = readRow(rows, LOGO_CLIENT_ID_KEY)

  const dbSource = typeof sourceRow?.value === 'string' ? sourceRow.value.trim() : ''
  const dbClientId = typeof clientIdRow?.value === 'string' ? clientIdRow.value.trim() : ''
  const envSource = (process.env.LOGO_SOURCE ?? '').trim()
  const envClientId = (process.env.BRANDFETCH_CLIENT_ID ?? '').trim()

  // warn: false — this call exists to render the degraded state on screen, and
  // warning about a condition the operator is looking at right now would just
  // fill the log on every page view.
  const config = resolveLogoConfig(
    { source: dbSource, brandfetchClientId: dbClientId },
    { warn: false },
  )

  const requestedSource = (dbSource || envSource || 'none').toLowerCase()
  const requestedClientId = dbClientId || envClientId
  const degraded = requestedSource !== config.logoSource

  return {
    ...config,
    requestedSource,
    requestedClientId,
    degraded,
    degradeReason: !degraded
      ? null
      : requestedSource === 'cdn'
        ? 'cdn-missing-client-id'
        : 'unknown-mode',
    origin: {
      source: dbSource ? 'db' : envSource ? 'env' : 'default',
      clientId: dbClientId ? 'db' : envClientId ? 'env' : 'none',
    },
    // `isDefault` already exists on the row and is already rendered as a
    // default/admin badge on /settings — reuse it rather than inventing a
    // second marker.
    isExplicitChoice: sourceRow ? !sourceRow.isDefault : false,
  }
}

export async function loadLogoSettings(
  apiClient: AdminApiClient,
  token: string,
): Promise<LoadedLogoSettings> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.value

  const rows = await apiClient.listRuntimeSettings(token)
  const value: LoadedLogoSettings = { rows, config: buildEffectiveLogoConfig(rows) }
  cache = { value, expiresAt: now + TTL_MS }
  return value
}

/** The three modes, with the trade-offs the operator is actually choosing between. */
export interface LogoMode {
  value: 'none' | 'cdn' | 'local'
  title: string
  desc: string
  external: boolean
  airgap: boolean
  disk: string
  privacy: string
  privacyTone: string
  /** Rendered in bold under the description. The compliance caveat, if any. */
  warning?: string
  /** Shown in a confirm() before this mode can be saved. */
  confirm?: string
}

/**
 * Mirrors the comparison table in docs/operations/platform-logos.md. That page
 * is the source of truth for the argument; keep the two in step.
 */
export const LOGO_MODES: LogoMode[] = [
  {
    value: 'none',
    title: 'Monogram tiles',
    desc: 'Each platform renders as its initials, tinted with that platform’s own brand colour. No account, no licensing surface, nothing to fetch.',
    external: false,
    airgap: true,
    disk: 'No disk',
    privacy: 'Nothing leaves your network',
    privacyTone: 'badge--success',
  },
  {
    value: 'cdn',
    title: 'Brandfetch CDN',
    desc: 'Logos load directly from Brandfetch in the browser. This is the mode their terms ask for, and nothing is stored on your servers.',
    external: true,
    airgap: false,
    disk: 'No disk',
    privacy: 'Brandfetch sees your origin and which platforms are viewed',
    privacyTone: 'badge--warning',
  },
  {
    value: 'local',
    title: 'Fetch and self-host',
    desc: 'Fetch logos once into this deployment’s database, then serve them yourself. No runtime calls to Brandfetch.',
    warning: 'This is caching, which their terms say needs an agreement on your own account.',
    confirm:
      'Storing logos is caching under Brandfetch’s terms, which require an agreement on your own Brandfetch account — server-side fetching is not covered by the standard logo link terms.\n\nDo you have that agreement in place?\n\nOK — yes, continue.\nCancel — go back without saving.',
    external: false,
    airgap: true,
    disk: '~17 MB stored',
    privacy: 'Nothing leaves your network',
    privacyTone: 'badge--success',
  },
]

/**
 * Render the logo panel on its own, with no page chrome around it.
 *
 * This cannot go through `reply.view`. The app sets a global layout, and
 * @fastify/view refuses a per-render one on top of it — "A layout can either be
 * set globally or on render, not both" — so every reply.view in this app is a
 * whole page. What the browser wants here is a fragment to splice into a page
 * it already has.
 *
 * Both surfaces that include the partial render it through this, so the
 * Recent fetches table has exactly one renderer. Rebuilding that markup in
 * JavaScript instead would be a second one, and the two would drift.
 */
export function renderLogoPanel(locals: Record<string, unknown>): Promise<string> {
  // routes/ -> core/ -> src/ -> the app root, which is where views/ lives.
  // Mirrors how server.ts resolves the same directory.
  return renderFile(join(__dirname, '..', '..', '..', 'views', 'platforms', '_logo-fetch.ejs'), {
    // The partial guards `logoHistory` with a typeof check but reads the rest
    // directly, so anything absent here is a render-time throw, not a blank.
    logoHistory: [],
    // This partial is rendered via ejs.renderFile (not @fastify/view), so it
    // does NOT inherit server.ts's defaultContext — pass the inline-script
    // escaper explicitly or its `<%- jsonForScript(...) %>` sites throw.
    jsonForScript,
    ...locals,
  })
}
