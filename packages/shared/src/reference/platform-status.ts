/**
 * Unsupported platform status.
 *
 * A platform can be listed and viewable in the catalog while remaining
 * uninstallable: no new connections, no enabling. Existing connections made
 * before a platform was marked unsupported keep working — reads, sync,
 * token refresh, and any OAuth callback for a flow already in flight. Only
 * NEW connections and ENABLING refuse; disabling stays allowed.
 *
 * Every vertical's `platforms/metadata.ts` entry may carry an optional
 * `unsupported?: UnsupportedPlatform` field. The two helpers below are how
 * every server-side choke point (Connect Link, direct connect, admin
 * enable) turns that metadata into a lookup and a consistent refusal body.
 */

export interface UnsupportedPlatform {
  /** Why the platform cannot be connected today. Shown in admin, catalog, API errors. */
  reason: string
  /** Tracking issue, e.g. https://github.com/open-steward/opensteward/issues/<n> */
  issueUrl?: string
}

/**
 * Build a `${vertical}:${slug}` → `UnsupportedPlatform` index from a flat
 * platform list — the same shape `server.ts` merges from every vertical's
 * `PLATFORMS` array before handing it to the control-plane routers. Entries
 * without an `unsupported` field are omitted, so `.has()` / `.get()` is the
 * whole "is this platform unsupported" check.
 */
export function unsupportedIndex(
  platforms: ReadonlyArray<{
    vertical?: string
    slug: string
    unsupported?: UnsupportedPlatform
  }>,
): Map<string, UnsupportedPlatform> {
  const out = new Map<string, UnsupportedPlatform>()
  for (const p of platforms) {
    if (p.unsupported) out.set(`${p.vertical}:${p.slug}`, p.unsupported)
  }
  return out
}

/**
 * The HTTP 400 body every unsupported-platform refusal sends — Connect Link
 * oauth-start/credentials, direct connect GET/POST, and admin enable all
 * return exactly this shape, so a caller (or the admin UI) can branch on
 * `error.code === 'PLATFORM_UNSUPPORTED'` in one place regardless of which
 * route refused.
 */
export function unsupportedRefusal(
  displayName: string,
  info: UnsupportedPlatform,
): {
  error: {
    code: 'PLATFORM_UNSUPPORTED'
    message: string
    reason: string
    issueUrl?: string
  }
} {
  return {
    error: {
      code: 'PLATFORM_UNSUPPORTED',
      message: `${displayName} is not supported: ${info.reason}`,
      reason: info.reason,
      ...(info.issueUrl ? { issueUrl: info.issueUrl } : {}),
    },
  }
}
