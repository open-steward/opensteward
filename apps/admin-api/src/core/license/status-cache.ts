/**
 * admin-api's view of the license: integration-server's verdict, cached.
 *
 * integration-server is the single license authority (D-A): it reads the license,
 * evaluates it and enforces it. admin-api only asks (`GET /admin/license` with
 * X-Admin-Secret) and keeps the answer for a minute, so the System page, the
 * console banner and tenant creation cost one upstream read a minute.
 *
 * Lazy by design: no timer and no fetch at boot. That keeps `generatorMode` (the
 * OpenAPI generator) and every test server offline, and leaves nothing to stop at
 * shutdown.
 *
 * When integration-server stops answering, the last good answer is served with
 * `stale: true`; before any answer there is no snapshot and the caller decides
 * (503 on /api/license, community limits for tenants — P11). The latest failure
 * travels with the snapshot, so a 403 ADMIN_DISABLED is reported as the missing
 * ADMIN_SECRET it is. A 401/403 is configuration, not an outage, so it is never
 * backed off: the next request asks again.
 *
 * Logging: one warning when reads start failing, one info line when they work
 * again — the message and HTTP status only. Never log the error object: an axios
 * error's `config.headers` carries X-Admin-Secret.
 */
import type { LicenseStatusDTO } from '@opensteward/shared/licensing'
import type { LicenseStatusUpstream } from '../routes/_openapi'

// Compile-time wire checks (master plan, Canonical interfaces), both needed.
//
// 1. Assignability: integration-server's /admin/license body must stay assignable
//    to what admin-api parses. A required field, or a type, that differs fails
//    `tsc` here instead of turning into a permanent 503 in production. On its own
//    it misses OPTIONAL fields: an optional DTO key the upstream schema lacks (or
//    renamed on one side) still assigns, and the parse then strips it silently.
const _wire = (s: LicenseStatusDTO): LicenseStatusUpstream => s
void _wire
// 2. Same keys: every DTO key, optional ones included, is declared on
//    LicenseStatusUpstream, and it declares none the DTO lacks — so an optional
//    field renamed on either side fails `tsc` too. The error names the key.
type _Undeclared = Exclude<keyof LicenseStatusDTO, keyof LicenseStatusUpstream>
const _complete: [_Undeclared] extends [never] ? true : _Undeclared = true
void _complete
type _NeverSent = Exclude<keyof LicenseStatusUpstream, keyof LicenseStatusDTO>
const _noExtra: [_NeverSent] extends [never] ? true : _NeverSent = true
void _noExtra

export interface LicenseFetchFailure {
  /** HTTP status integration-server answered with; absent when it never answered. */
  status?: number
  /** Its error code (`ADMIN_DISABLED`, `FORBIDDEN`, …), when it sent one. */
  code?: string
  /** One line for logs and messages. */
  message: string
}

export interface LicenseSnapshot {
  status: LicenseStatusUpstream
  /** Epoch ms of the upstream answer. */
  fetchedAt: number
  /** True when the latest refresh failed and this is the last good answer. */
  stale: boolean
}

export interface LicenseLookup {
  /** The latest good answer, or null if integration-server has never answered. */
  snapshot: LicenseSnapshot | null
  /** Why the latest refresh failed; absent after a success. */
  failure?: LicenseFetchFailure
}

export interface LicenseStatusProvider {
  get(): Promise<LicenseLookup>
}

export interface LicenseCacheLog {
  warn(obj: object, msg: string): void
  info(obj: object, msg: string): void
}

/** The parts of a failed read worth keeping — never the request (it carries X-Admin-Secret). */
export function describeFetchFailure(err: unknown): LicenseFetchFailure {
  const e = err as {
    name?: unknown
    message?: unknown
    response?: { status?: unknown; data?: unknown }
  } | null
  if (e?.name === 'ZodError') {
    return {
      code: 'UNEXPECTED_RESPONSE',
      message:
        'integration-server answered GET /admin/license with a body this admin-api does not understand',
    }
  }
  const status = typeof e?.response?.status === 'number' ? e.response.status : undefined
  const body = e?.response?.data as { error?: { code?: unknown } } | undefined
  const code = typeof body?.error?.code === 'string' ? body.error.code : undefined
  const message = typeof e?.message === 'string' && e.message ? e.message : String(err)
  return { ...(status !== undefined ? { status } : {}), ...(code ? { code } : {}), message }
}

/** Why there is no license status, in words an operator can act on. */
export function unavailableReason(failure: LicenseFetchFailure | undefined): string {
  if (failure?.code === 'ADMIN_DISABLED') {
    return 'integration-server has no ADMIN_SECRET, so it refuses admin-api (ADMIN_DISABLED). Set the same ADMIN_SECRET on integration-server and admin-api (Helm: secrets.generate.includeAdminSecret=true) and restart both'
  }
  if (failure?.status === 401 || failure?.status === 403) {
    return `integration-server refused admin-api's X-Admin-Secret (${failure.code ?? failure.status}). Set the same ADMIN_SECRET on integration-server and admin-api`
  }
  if (failure?.code === 'UNEXPECTED_RESPONSE') {
    return `${failure.message}. Run the same OpenSteward release on both`
  }
  if (failure?.status !== undefined) {
    return `integration-server answered GET /admin/license with ${failure.status}${failure.code ? ` ${failure.code}` : ''}`
  }
  return `integration-server has not answered${failure ? ` (${failure.message})` : ''}`
}

export interface LicenseStatusCacheOptions {
  /** How long a good answer is served without asking again. Default 60 s. */
  ttlMs?: number
  /** How long to wait after an outage before asking again. Default 15 s. */
  retryAfterMs?: number
  now?: () => number
  log?: LicenseCacheLog
}

export class LicenseStatusCache implements LicenseStatusProvider {
  private last: { status: LicenseStatusUpstream; fetchedAt: number } | null = null
  private failure: LicenseFetchFailure | null = null
  private retryAt = 0
  private inflight: Promise<LicenseLookup> | null = null
  private readonly ttlMs: number
  private readonly retryAfterMs: number
  private readonly now: () => number
  private readonly log: LicenseCacheLog | undefined

  constructor(
    private readonly fetchStatus: () => Promise<LicenseStatusUpstream>,
    opts: LicenseStatusCacheOptions = {},
  ) {
    this.ttlMs = opts.ttlMs ?? 60_000
    this.retryAfterMs = opts.retryAfterMs ?? 15_000
    this.now = opts.now ?? Date.now
    this.log = opts.log
  }

  get(): Promise<LicenseLookup> {
    const now = this.now()
    const fresh =
      this.last !== null && this.failure === null && now - this.last.fetchedAt < this.ttlMs
    const backingOff = this.failure !== null && now < this.retryAt
    if (fresh || backingOff) return Promise.resolve(this.lookup())
    return (this.inflight ??= this.refresh().finally(() => {
      this.inflight = null
    }))
  }

  private async refresh(): Promise<LicenseLookup> {
    try {
      const status = await this.fetchStatus()
      if (this.failure) {
        this.log?.info(
          { licenseState: status.state },
          'license status: integration-server answers GET /admin/license again',
        )
      }
      this.last = { status, fetchedAt: this.now() }
      this.failure = null
    } catch (err) {
      const failure = describeFetchFailure(err)
      if (!this.failure) {
        // Before any answer (the common first boot without ADMIN_SECRET) there is nothing to serve.
        const serving = this.last
          ? 'serving the last known status'
          : 'no license status to serve yet: GET /api/license answers 503 and new tenants get the community limit until it answers'
        this.log?.warn(
          { upstreamStatus: failure.status, code: failure.code, error: failure.message },
          `license status: ${unavailableReason(failure)}; ${serving}`,
        )
      }
      this.failure = failure
      this.retryAt =
        failure.status === 401 || failure.status === 403 ? 0 : this.now() + this.retryAfterMs
    }
    return this.lookup()
  }

  private lookup(): LicenseLookup {
    return {
      snapshot: this.last ? { ...this.last, stale: this.failure !== null } : null,
      ...(this.failure ? { failure: this.failure } : {}),
    }
  }
}
