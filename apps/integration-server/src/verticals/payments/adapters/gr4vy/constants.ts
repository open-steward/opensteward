/**
 * Gr4vy REST API constants.
 *
 * Gr4vy is a single-tenant-per-merchant payment-orchestration platform: each
 * merchant gets a dedicated instance addressed by its `gr4vyId`. The REST host
 * is derived from that id and the environment:
 *
 *   production  →  https://api.{gr4vyId}.gr4vy.app
 *   sandbox     →  https://api.sandbox.{gr4vyId}.gr4vy.app
 *
 * Docs: https://docs.gr4vy.com/guides/api/environments
 */

/** Build the REST API base URL for a given instance id + environment. */
export function buildBaseUrl(gr4vyId: string, environment: string): string {
  const id = gr4vyId.trim()
  return environment === 'sandbox'
    ? `https://api.sandbox.${id}.gr4vy.app`
    : `https://api.${id}.gr4vy.app`
}

/** List endpoints default to 20 items, hard-capped at 100. */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/**
 * Bearer JWTs are signed with ES512 and short-lived. We mint a fresh token
 * per request with this TTL (seconds), comfortably inside Gr4vy's window.
 */
export const TOKEN_TTL_SECONDS = 60

/** Default scopes — read + write across every resource (`*.read`, `*.write`). */
export const DEFAULT_SCOPES = ['*.read', '*.write'] as const
