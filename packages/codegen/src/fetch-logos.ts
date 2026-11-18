/**
 * Shared logo fetcher — downloads logos from the Brandfetch Logo API.
 *
 * Supports SVG and PNG formats with fallback chain:
 *   logo.svg → symbol.svg → logo.png → icon.png
 */
import { writeFileSync, statSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PlatformLike } from './types'

// Re-exported so consumers of the `@opensteward/codegen/logos` subpath get the
// input type without reaching past the entry point they were given.
export type { PlatformLike } from './types'

const BRANDFETCH_CDN = 'https://cdn.brandfetch.io'
/**
 * Last-resort Referer, and only ever correct for a maintainer running the CLI
 * from a checkout of THIS repo — for whom it genuinely is the request origin.
 *
 * Server-side callers must pass their own `referer`. Brandfetch requires the
 * header to carry "the request origin", and they bounce requests that do not
 * look like a logo embedded in a page; sending this project's URL from an
 * operator's deployment both misstates the origin and sidesteps that check.
 * `LogoFetchWorker` therefore always supplies an explicit value and refuses to
 * run without one.
 */
const DEFAULT_REFERER = 'https://github.com/open-steward/opensteward'

/**
 * Brandfetch answers a request that fails its `automated_traffic` check with a
 * redirect to the hotlinking guidelines rather than an error status — so
 * following it lands on an HTML page that fails the image sniff and looks
 * exactly like "this platform has no logo".
 */
const BLOCK_REDIRECT = /docs\.brandfetch\.com/i
const REQUEST_DELAY_MS = 250
const PLACEHOLDER_MAX_BYTES = 500

const FETCH_ATTEMPTS: Array<{ type: 'logo' | 'symbol' | 'icon'; format: 'svg' | 'png' }> = [
  { type: 'logo', format: 'svg' },
  { type: 'symbol', format: 'svg' },
  { type: 'logo', format: 'png' },
  { type: 'icon', format: 'png' },
]

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')
  }
}

function isPlaceholder(filePath: string): boolean {
  try {
    return statSync(filePath).size <= PLACEHOLDER_MAX_BYTES
  } catch {
    return true
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Statuses that mean "ask again later" rather than "there is no logo". */
const THROTTLE_STATUSES = new Set([429, 503])

type LogoAttempt =
  | { kind: 'hit'; data: Buffer; format: 'svg' | 'png' }
  | { kind: 'miss' }
  | { kind: 'throttled'; status: number; retryAfterMs: number | null }
  | { kind: 'rejected'; status: number }
  /** Refused by the automated-traffic check — see BLOCK_REDIRECT. */
  | { kind: 'blocked'; location: string }

/**
 * Parse `Retry-After`, which may be either a delay in seconds or an HTTP date.
 * Returns null when absent or unparseable, leaving the caller's own backoff to
 * decide.
 */
function retryAfterMs(raw: string | null): number | null {
  if (!raw) return null
  const secs = Number(raw)
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000)
  const when = Date.parse(raw)
  if (Number.isNaN(when)) return null
  return Math.max(0, when - Date.now())
}

async function tryFetchLogo(
  domain: string,
  type: 'logo' | 'symbol' | 'icon',
  format: 'svg' | 'png',
  clientId: string,
  referer: string,
): Promise<LogoAttempt> {
  const url = `${BRANDFETCH_CDN}/${domain}/${type}.${format}?c=${clientId}`

  const headers = {
    Referer: referer,
    'User-Agent': 'OpenSteward/1.0 (+logo-fetch-script)',
  }

  try {
    // `manual` rather than `follow`: the block is delivered AS a redirect, so
    // following it silently converts "you are not allowed to do this" into
    // "there is no logo here".
    let res = await fetch(url, { redirect: 'manual', headers })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location') ?? ''
      if (BLOCK_REDIRECT.test(location)) return { kind: 'blocked', location }
      // Anything else is ordinary CDN routing; follow it once.
      if (!location) return { kind: 'miss' }
      res = await fetch(new URL(location, url).toString(), { redirect: 'follow', headers })
    }

    if (!res.ok) {
      // Classified rather than collapsed into "miss". Callers without a
      // throttle policy flatten every one of these back to a miss;
      // the worker needs to tell a rate limit
      // (retry later) from a 404 (there is genuinely no logo) from a bad
      // client ID (stop, nothing will ever work).
      if (THROTTLE_STATUSES.has(res.status)) {
        return {
          kind: 'throttled',
          status: res.status,
          retryAfterMs: retryAfterMs(res.headers.get('retry-after')),
        }
      }
      if (res.status === 401 || res.status === 403) return { kind: 'rejected', status: res.status }
      return { kind: 'miss' }
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase()
    const buffer = Buffer.from(await res.arrayBuffer())

    if (buffer.length < 100) return { kind: 'miss' }

    if (format === 'svg') {
      if (!contentType.includes('svg') && !contentType.includes('xml')) return { kind: 'miss' }
      const text = buffer.toString('utf-8').trim()
      if (!text.includes('<svg')) return { kind: 'miss' }
      return { kind: 'hit', data: buffer, format: 'svg' }
    }

    if (format === 'png') {
      if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
        return { kind: 'hit', data: buffer, format: 'png' }
      }
      if (contentType.includes('png')) {
        return { kind: 'hit', data: buffer, format: 'png' }
      }
      return { kind: 'miss' }
    }

    return { kind: 'miss' }
  } catch {
    return { kind: 'miss' }
  }
}

/** One logo's bytes, handed to `onLogo` instead of being written to disk. */
export interface FetchedLogo {
  slug: string
  ext: 'svg' | 'png'
  /** Derived from `ext`, never from Brandfetch's Content-Type header. */
  contentType: 'image/svg+xml' | 'image/png'
  bytes: Buffer
  /** The domain actually queried — `extractDomain(platform.website)`. */
  domain: string
}

export interface FetchLogoProgress {
  /** 0-based position within the filtered platform list. */
  index: number
  total: number
  slug: string
  domain: string
  outcome: 'fetched' | 'skipped' | 'not_found' | 'throttled'
  ext?: 'svg' | 'png'
  byteSize?: number
}

export interface FetchLogosThrottleOptions {
  /** Retries per platform once a throttle status is seen. */
  maxRetries: number
  /** First backoff, doubling per retry and capped at 60s. */
  baseDelayMs: number
  onThrottle?: (attempt: number, waitMs: number, status: number) => void
}

export interface FetchLogosOptions {
  slug?: string
  force?: boolean
  clientId?: string
  referer?: string
  envPath?: string

  // ── Server-side options ────────────────────────────────────────────────
  // All optional, and every default reproduces the CLI's behaviour exactly.
  // `packages/codegen/tests/fetch-logos.test.ts` pins that.

  /** Inter-request delay. Defaults to REQUEST_DELAY_MS (250). */
  delayMs?: number
  /**
   * Byte sink. When supplied, nothing is written to disk and `outputDir` may
   * be null — which is what lets this run inside a container whose filesystem
   * is read-only.
   */
  onLogo?: (logo: FetchedLogo) => void | Promise<void>
  onProgress?: (progress: FetchLogoProgress) => void | Promise<void>
  /**
   * Replaces the on-disk placeholder test that decides whether a platform can
   * be skipped. The worker answers from the database instead of the filesystem,
   * which is also what makes a crashed run cheap to resume.
   */
  isSatisfied?: (slug: string) => boolean | Promise<boolean>
  /** Per-platform log sink. Defaults to `console.log` with identical strings. */
  log?: (line: string) => void
  signal?: AbortSignal
  /**
   * Retry policy for rate-limit responses. Absent — the CLI default — means a
   * non-2xx is simply a miss.
   */
  throttle?: FetchLogosThrottleOptions
}

export interface FetchLogosResult {
  fetched: number
  skipped: number
  notFound: number
  /** Platforms abandoned to rate limiting. Always 0 without `throttle`. */
  throttled: number
  /** True when `signal` aborted mid-run. Always false without `signal`. */
  cancelled: boolean
}

/**
 * Thrown when Brandfetch refuses the requests as automated traffic. Their check
 * keys on the request looking like an embedded logo, so this is deployment-wide
 * and retrying cannot help — the run stops rather than reporting the whole
 * catalog as "no logo available".
 */
export class BrandfetchBlockedError extends Error {
  constructor(readonly referer: string) {
    super(
      'Brandfetch refused these requests as automated traffic and redirected them to ' +
        `their hotlinking guidelines (Referer sent: ${referer}). Their terms allow logo ` +
        'links embedded in a page, not server-side fetching, and storing the results is ' +
        'caching — which needs an agreement on your own Brandfetch account. ' +
        'See https://docs.brandfetch.com/docs/logo-link/guidelines.',
    )
    this.name = 'BrandfetchBlockedError'
  }
}

/** Thrown when Brandfetch rejects the client ID outright — retrying cannot help. */
export class BrandfetchRejectedError extends Error {
  constructor(readonly status: number) {
    super(
      `Brandfetch rejected the client ID (${status}) — check the Brandfetch client ID. ` +
        'Get a free one at https://brandfetch.com/developers.',
    )
    this.name = 'BrandfetchRejectedError'
  }
}

function readEnvFile(envPath: string): Record<string, string> {
  if (!existsSync(envPath)) {
    throw new Error(`.env file not found at ${envPath}`)
  }
  const env = readFileSync(envPath, 'utf-8')
  const vars: Record<string, string> = {}
  for (const line of env.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const [key, ...rest] = trimmed.split('=')
    vars[key.trim()] = rest.join('=').trim()
  }
  return vars
}

/**
 * Resolve the Brandfetch client ID, preferring the process environment.
 *
 * `process.env` comes first because operators run this in a container, where
 * there is no repo root and so no `.env.scripts` to read — they pass
 * BRANDFETCH_CLIENT_ID as an ordinary env var, Docker secret, or Helm value.
 * The file fallback keeps the maintainer flow (`cp .env.scripts.example
 * .env.scripts`) working unchanged.
 *
 * Reading it via `process.env` is also what puts the var into `.env.example`:
 * `scripts/generate-env-example.ts` builds that file by grepping for
 * `process.env.X`, so a file-only read would stay invisible to operators.
 */
function loadClientIdFromEnv(envPath: string): string {
  const fromProcess = process.env.BRANDFETCH_CLIENT_ID || process.env.BRANDFETCH_API_KEY
  if (fromProcess) return fromProcess

  if (!existsSync(envPath)) {
    throw new Error(
      'BRANDFETCH_CLIENT_ID is not set.\n\n' +
        '  Logos are not shipped with OpenSteward — see docs/operations/platform-logos.md.\n' +
        '  Get a free client ID at https://brandfetch.com/developers, then either:\n\n' +
        '    BRANDFETCH_CLIENT_ID=<id> pnpm --filter integration-server fetch:logos\n\n' +
        `  or put it in ${envPath} (see .env.scripts.example).`,
    )
  }

  const vars = readEnvFile(envPath)
  const id = vars.BRANDFETCH_CLIENT_ID || vars.BRANDFETCH_API_KEY
  if (!id) {
    throw new Error(`BRANDFETCH_CLIENT_ID not found in ${envPath} or the environment`)
  }
  return id
}

function loadRefererFromEnv(envPath: string): string | undefined {
  if (process.env.BRANDFETCH_REFERER) return process.env.BRANDFETCH_REFERER
  if (!existsSync(envPath)) return undefined
  try {
    return readEnvFile(envPath).BRANDFETCH_REFERER || undefined
  } catch {
    return undefined
  }
}

/**
 * @param outputDir Directory to write into, or `null` when `options.onLogo`
 *   is supplied. Passing null means no `mkdir` and no writes happen at all.
 */
export async function fetchLogos(
  platforms: PlatformLike[],
  outputDir: string | null,
  options?: FetchLogosOptions,
): Promise<FetchLogosResult> {
  const envPath = options?.envPath ?? '.env'
  const clientId = options?.clientId ?? loadClientIdFromEnv(envPath)
  const referer = options?.referer ?? loadRefererFromEnv(envPath) ?? DEFAULT_REFERER
  const force = options?.force ?? false
  const delayMs = options?.delayMs ?? REQUEST_DELAY_MS
  const log = options?.log ?? console.log
  const sink = options?.onLogo
  const filtered = options?.slug ? platforms.filter((p) => p.slug === options.slug) : platforms

  if (!sink && !outputDir) {
    throw new Error('fetchLogos: outputDir is required unless options.onLogo is supplied')
  }
  if (outputDir) mkdirSync(outputDir, { recursive: true })

  let fetched = 0
  let skipped = 0
  let notFound = 0
  let throttled = 0
  let cancelled = false
  let consecutiveRejections = 0
  let consecutiveBlocks = 0

  for (const [index, provider] of filtered.entries()) {
    if (options?.signal?.aborted) {
      cancelled = true
      break
    }

    const domain = extractDomain(provider.website)
    const svgPath = outputDir ? join(outputDir, `${provider.slug}.svg`) : ''
    const pngPath = outputDir ? join(outputDir, `${provider.slug}.png`) : ''

    const satisfied = options?.isSatisfied
      ? await options.isSatisfied(provider.slug)
      : !isPlaceholder(svgPath) || !isPlaceholder(pngPath)

    if (!force && satisfied) {
      skipped++
      await options?.onProgress?.({
        index,
        total: filtered.length,
        slug: provider.slug,
        domain,
        outcome: 'skipped',
      })
      continue
    }

    let hit: { data: Buffer; format: 'svg' | 'png' } | null = null
    let wasThrottled = false

    attempts: for (const attempt of FETCH_ATTEMPTS) {
      // Retries sit inside the attempt loop so a rate limit re-tries the same
      // URL rather than falling through to the next format — a throttled
      // logo.svg says nothing about whether logo.svg exists.
      for (let retry = 0; ; retry++) {
        const res = await tryFetchLogo(domain, attempt.type, attempt.format, clientId, referer)

        if (res.kind === 'hit') {
          hit = { data: res.data, format: res.format }
          consecutiveRejections = 0
          consecutiveBlocks = 0
          break attempts
        }

        if (res.kind === 'blocked') {
          // Unambiguous — the redirect target is their guidelines page. Allow a
          // couple through in case of a transient CDN quirk, then stop.
          if (++consecutiveBlocks >= 3) throw new BrandfetchBlockedError(referer)
          break
        }

        if (res.kind === 'rejected') {
          // A bad client ID fails identically for every platform. Grinding
          // through the whole catalog to discover that would take 40 minutes.
          if (++consecutiveRejections >= 5) throw new BrandfetchRejectedError(res.status)
          break
        }

        if (res.kind === 'throttled' && options?.throttle && retry < options.throttle.maxRetries) {
          const backoff = Math.min(options.throttle.baseDelayMs * 2 ** retry, 60_000)
          const wait = res.retryAfterMs ?? backoff
          options.throttle.onThrottle?.(retry + 1, wait, res.status)
          await sleep(wait)
          if (options?.signal?.aborted) break attempts
          continue
        }

        if (res.kind === 'throttled' && options?.throttle) wasThrottled = true
        break
      }

      await sleep(delayMs)
    }

    if (hit) {
      const ext = hit.format
      if (sink) {
        await sink({
          slug: provider.slug,
          ext,
          contentType: ext === 'svg' ? 'image/svg+xml' : 'image/png',
          bytes: hit.data,
          domain,
        })
      } else {
        writeFileSync(ext === 'svg' ? svgPath : pngPath, hit.data)
      }
      log(`  ✅ ${provider.slug} → ${ext} (${formatBytes(hit.data.length)})`)
      fetched++
      await options?.onProgress?.({
        index,
        total: filtered.length,
        slug: provider.slug,
        domain,
        outcome: 'fetched',
        ext,
        byteSize: hit.data.length,
      })
    } else if (wasThrottled) {
      // Deliberately NOT counted as notFound: the skip logic keys on "we have
      // bytes", so miscounting a rate limit as "no logo exists" would make the
      // obvious remedy — re-run it later — skip every platform it gave up on.
      log(`  ⏳ ${provider.slug} (${domain}) — rate limited, not fetched`)
      throttled++
      await options?.onProgress?.({
        index,
        total: filtered.length,
        slug: provider.slug,
        domain,
        outcome: 'throttled',
      })
    } else {
      log(`  ⚠️  ${provider.slug} (${domain}) — no logo found`)
      notFound++
      await options?.onProgress?.({
        index,
        total: filtered.length,
        slug: provider.slug,
        domain,
        outcome: 'not_found',
      })
    }

    await sleep(delayMs)
  }

  return { fetched, skipped, notFound, throttled, cancelled }
}
