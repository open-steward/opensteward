/**
 * Resolve the canonical public URL of the integration-server deployment.
 *
 * Used to emit absolute URLs that an end-customer or third-party (an
 * OAuth provider) will see — Connect Link URLs, OAuth `redirect_uri`,
 * thank-you page redirects.
 *
 * Precedence (most explicit wins):
 *   1. `PUBLIC_BASE_URL` env var (operator override; pin a canonical
 *      URL regardless of how the request arrived).
 *   2. `tenantBaseUrl` — the tenant's own custom domain, when the URL is being
 *      emitted for a specific tenant (e.g. a Connect Link minted for a
 *      department). Lets each tenant's links live on its own domain without an
 *      operator-wide env override.
 *   3. `companyInfo.baseUrl` (admin-set value via the Company Info form).
 *   4. The request's own protocol + host (Fastify's `request.protocol` /
 *      `request.host`, which respect `X-Forwarded-*` when the server is
 *      configured with `trustProxy: true`). `host` rather than `hostname`:
 *      Fastify 5 strips the port from the latter, which would point every
 *      emitted URL at :80 on a deployment served from any other port.
 *
 * Trailing slashes are stripped so callers can append `/connect/...`
 * directly.
 */
import type { FastifyRequest } from 'fastify'

/** The slice of a Fastify request these helpers read. `host` is optional so
 *  callers holding a partial request (and tests) still typecheck. */
export type RequestLike = Pick<FastifyRequest, 'protocol'> &
  Partial<Pick<FastifyRequest, 'hostname' | 'host'>>

export interface PublicBaseUrlInputs {
  /** Optional override fetched from `companyInfo`. */
  companyBaseUrl?: string | null
  /** Falls back to `process.env['PUBLIC_BASE_URL']` when omitted. */
  envBaseUrl?: string | null
  /** The tenant's custom domain (bare hostname or full URL). When set, links
   *  are emitted on this domain unless the `PUBLIC_BASE_URL` env override wins.
   *  Do NOT pass this for OAuth `redirect_uri` — those stay on the canonical
   *  domain so providers need only one allowlisted callback. */
  tenantBaseUrl?: string | null
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

/** Coerce a tenant domain (which may be a bare hostname) into an absolute URL,
 *  defaulting to https. */
function normalizeTenantBaseUrl(value: string, requestProtocol: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimTrailingSlash(trimmed)
  // Bare hostname stored in tenant_domains → scheme it. https in production;
  // mirror the request's protocol so loopback/dev (http) still works.
  const scheme = requestProtocol === 'http' ? 'http' : 'https'
  return trimTrailingSlash(`${scheme}://${trimmed}`)
}

/** Host including port. `hostname` is the port-stripped fallback for callers
 *  (and tests) that pass a partial request object. */
function requestHost(request: RequestLike): string {
  return (request.host ?? request.hostname ?? '').trim()
}

export function resolvePublicBaseUrl(request: RequestLike, inputs?: PublicBaseUrlInputs): string {
  const envValue = inputs?.envBaseUrl ?? process.env['PUBLIC_BASE_URL']
  if (envValue && envValue.trim()) return trimTrailingSlash(envValue.trim())
  if (inputs?.tenantBaseUrl && inputs.tenantBaseUrl.trim()) {
    return normalizeTenantBaseUrl(inputs.tenantBaseUrl, request.protocol)
  }
  if (inputs?.companyBaseUrl && inputs.companyBaseUrl.trim()) {
    return trimTrailingSlash(inputs.companyBaseUrl.trim())
  }
  return `${request.protocol}://${requestHost(request)}`
}

/**
 * Is this host something a customer's browser could actually reach?
 *
 * Inside compose, a request from admin-api arrives at integration-server with
 * `Host: integration-server:3010`. Emitting that as a Connect Link hands the
 * customer an address that resolves nowhere. Real deployments are reached
 * through a dotted name (`connect.acme.example`), an IP, or localhost when the
 * operator is browsing their own machine — a bare single-label name is the
 * signature of a docker service alias.
 */
function isBrowserAddressable(hostname: string): boolean {
  const host = hostname.split(':')[0]?.trim().toLowerCase() ?? ''
  if (!host) return false
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  // Dotted names and IPv4 both qualify; IPv6 arrives bracketed or with colons,
  // which the port split above would mangle, so accept it on the raw value.
  if (host.includes('.') || hostname.includes('[')) return true
  return false
}

/**
 * Same precedence as `resolvePublicBaseUrl`, but returns `null` rather than a
 * base that no customer could open — use it for URLs that leave the
 * deployment (Connect Links). Server-side URLs that merely need a best-effort
 * string should keep using `resolvePublicBaseUrl`.
 */
export function resolvePublicBaseUrlOrNull(
  request: RequestLike,
  inputs?: PublicBaseUrlInputs,
): string | null {
  const envValue = inputs?.envBaseUrl ?? process.env['PUBLIC_BASE_URL']
  if (envValue && envValue.trim()) return trimTrailingSlash(envValue.trim())
  const addressable = isBrowserAddressable(requestHost(request))
  if (inputs?.tenantBaseUrl && inputs.tenantBaseUrl.trim()) {
    // A bare tenant hostname inherits the request's scheme so loopback dev
    // stays on http — but an internal hop's scheme describes the compose
    // network, not the customer's browser, so default those to https.
    return normalizeTenantBaseUrl(inputs.tenantBaseUrl, addressable ? request.protocol : 'https')
  }
  if (inputs?.companyBaseUrl && inputs.companyBaseUrl.trim()) {
    return trimTrailingSlash(inputs.companyBaseUrl.trim())
  }
  return addressable ? `${request.protocol}://${requestHost(request)}` : null
}

/** Build an absolute URL by appending `path` to the resolved base. */
export function publicUrl(
  request: RequestLike,
  path: string,
  inputs?: PublicBaseUrlInputs,
): string {
  const base = resolvePublicBaseUrl(request, inputs)
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`
}
