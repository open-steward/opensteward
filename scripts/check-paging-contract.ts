/**
 * Ratchet: every adapter list method pages by the caller's limit and position.
 *
 * The router hands an adapter `{ page, limit }`. The sync worker walks pages
 * 1, 2, 3… with the same shape. Nothing checked what an adapter then SENDS
 * upstream, and a sweep that finally looked found every one of these:
 *
 *   - page-ignored     page 2 sends exactly page 1's request. A sync re-fetches
 *                      page 1 until its page cap; the API serves page 1 forever.
 *                      `-unsized` when no request carries the caller's limit:
 *                      still a repeat, but the repeated request may be an
 *                      unpaginated fetch or only a lookup that found nothing to
 *                      list, so it is counted apart and not as measured.
 *   - page1-skips      page 1 already starts one page in (`offset = page × limit`,
 *                      or a page number sent as `page + 1`), so the first page
 *                      of rows is unreachable on every path.
 *   - page-stride      page 2's position moves by neither 1 (a page number) nor
 *                      the limit (a row offset), so rows between pages are
 *                      skipped or served twice.
 *   - first-page-only  page 2 answers empty without asking upstream, after page
 *                      1 asked for only `limit` rows: nothing past the first
 *                      page is reachable, unless page 1 walks the whole upstream
 *                      itself, which an empty stub page cannot show.
 *   - over-asks        the adapter asks for more than the caller's limit (its
 *                      own `limit + 1` look-ahead), and the router truncates the
 *                      extra row away at every page boundary.
 *   - fixed-size       the page size does not follow the caller's limit — a
 *                      constant, or a whitelist that swaps a limit it does not
 *                      allow for its default — so page N upstream is not page N
 *                      for the caller.
 *
 * Four verdicts pass: `ok`; `refused` — the method refuses outright, before
 * sending anything, with the error the sync worker skips a resource on
 * (`statusCode: 501`, `code: 'NOT_SUPPORTED'`), on every probe call; it
 * serves no rows, so it has no paging to judge, and it is left out of the
 * coverage share altogether (numerator and denominator); `single-page` —
 * page 1 asks upstream for no size and page 2 answers empty without a
 * request, the fix for an unpaginated
 * upstream, right only while the collection fits the caller's page; and
 * `local-page` — page 1 and page 2 both report `pagedLocally` through the
 * page sink (`UpstreamPageMeta`) and neither threw; page 1 neither skips
 * rows nor over-asks; from page 1 to page 2 no position moves by more than
 * the limit, nor, beside a size that follows the limit, by neither 1 nor the
 * limit (both `page-stride`); and page 2 does not repeat a request whose
 * size follows the limit (`page-ignored`). A page cut from rows the
 * adapter already fetched (shared's `pageLocally` over a whole-collection
 * fetch, such as Shopify's locations; `pageByRows` re-cutting upstream pages
 * that are not the caller's size; a hand-rolled window such as Epos Now's)
 * sends the same request for every caller page inside one upstream page, so
 * its requests cannot show that it pages; the report is a claim, taken on
 * trust, that the shared helpers make themselves and whose slicing their unit
 * tests pin. A hand-rolled window that makes it is listed in
 * `LOCAL_PAGE_REPORTERS` with the test that pins its slicing, and a full
 * sweep fails on an unlisted one. So requests that are `ok` on their own stay
 * `ok`, and `local-page` is not counted as coverage.
 *
 * ## How it measures
 *
 * Every vertical's `ADAPTER_FACTORIES` is loaded and every `list*` method the
 * vertical's interface declares is called five times through the real
 * `parseListQuery`: page 1, page 2 and page 1 again at the caller's limit (10),
 * then page 1 at a second limit (7), and page 1 at the router's ceiling (500;
 * see below). HTTP never leaves the process — axios and
 * `fetch` are replaced by a recorder, and any socket that opens anyway is
 * refused and fails the gate. The recorded requests are then classified.
 *
 * Classification is by VALUES, never by parameter NAMES. A name-based
 * predecessor read OData's `$skip` as "no position parameter" and counted
 * Exact Online, which pages correctly, as ignoring `page`. Here a request
 * "moved" if any value changed between page 1 and page 2, and a size is a
 * value that equals the caller's limit AND becomes the second limit when page
 * 1 is asked for at that one — 10 alone is too common a default to prove the
 * adapter read `params.limit`. Values that change between the two page-1
 * calls (timestamps, nonces, signatures) are volatile and masked; page 2 is
 * called BETWEEN the two page-1 calls, so a clock value that ticked between
 * page 1 and page 2 has also ticked by the second page-1 call and is masked
 * rather than passing for a page move.
 *
 * ## Page sizes below the platform maximum the router knows about
 *
 * A fifth call asks for page 1 at the router's largest limit, 500, and reads
 * the size the method sends at the key that followed the limit (10 → 7). The
 * router asks an adapter for `min(limit, 500, capabilities.maxPageSize)`
 * (`parseListQuery`), and every judgement it then makes — `meta.hasMore`,
 * whether the cache may store the page as the whole collection — reads a page
 * shorter than that as the last one. The sync worker makes the same judgement
 * at `min(500, maxPageSize)`. So a method that sends less than that asks for
 * a page the router will misread: Plaid clamps to 25 and declared nothing, so
 * the default limit of 100 came back as 25 rows, `hasMore: false`, and a
 * cache that held those 25 as every charge. Each such method is
 *
 *   `<vertical>/<slug>:<method> serves <n> of <asked>`
 *
 * — it sends <n> when the router would ask for <asked> — and is banked in its
 * own strict baseline. The fix is to declare `capabilities.maxPageSize` when the
 * adapter's endpoints share one ceiling, or for one endpoint with a lower
 * ceiling than the rest, to report the size it sent
 * (`reportUpstreamPage(params, { pageSize })`): the router then judges the page
 * at that size, and so does this check. Banking one is the last resort. A
 * method that fills its page from several smaller upstream requests still
 * reads as serving one request's worth: the stub's first page is empty, so
 * the fill stops there.
 *
 * ## What it cannot see
 *
 * The recorder answers every request with the same stub body, so a list that
 * needs a real response before it sends its list request (a token exchange
 * the stub does not satisfy, a lookup of a parent record) sends nothing, and
 * a request built from a config key the stubs lack is never made. Those rows
 * are `unmeasured-*` — `unmeasured-error` when the call threw after requests
 * that did not move with `page` and carried no size — recorded in their own
 * baseline, and counted in the coverage line the gate always prints: a green
 * run is never full coverage unless that line says so. A deliberate refusal
 * (`refused`) is not one of them: the coverage share is measured ÷ (list
 * methods − refused), and the line prints the refused count apart. A refusal
 * that sent any request first, or that page 2 or another probe call does not
 * repeat, is not `refused` and is judged as before. Also invisible:
 *
 *   - a cursor walk through the shared pager is judged by page 1 only: the
 *     stub page carries no cursor;
 *   - a page number used as a row offset (`skip = page`: 1 → 2) is, by value,
 *     a correct 1-based page number; so is a 0-based API sent `page` unchanged;
 *   - a lookup that finds nothing and returns without error reads as
 *     `page-ignored-unsized` (or `single-page`, once page 2 returns early),
 *     though its list request was never seen;
 *   - a call that throws on the stub body is `unmeasured-error` even when what
 *     it sent WAS its unsized list request: after a throw the recorded
 *     requests are only a prefix of the call;
 *   - page 1 walking the whole upstream itself reads as `first-page-only`:
 *     the stub's first page is empty, so the walk stops;
 *   - an adapter that pages locally inside a fixed-size upstream page (Epos
 *     Now's V4 lists return 200 rows and take no size) sends the same request
 *     for every caller page inside it, and a size snapped to a documented
 *     whitelist (Lumin Sign's 10/25/50) does not follow the limit: each would
 *     read as `page-ignored-unsized` or `fixed-size` although it serves
 *     every row once, so both report `pagedLocally` and read as `local-page`;
 *   - a `local-page` verdict is the adapter's own report: the gate checks
 *     the requests for a skip, an over-ask, a jump past the limit and a
 *     repeated request sized by the limit, and nothing else, so whether the
 *     slicing serves every row once rests on the unit tests of `pageByRows`
 *     and `pageLocally`, or of the hand-rolled window. `pageLocally` over one
 *     page of a constant size (`?per_page=100`) truncates the collection and
 *     still reads as `local-page`: its requests are exactly those of a
 *     correct window over fixed 100-row upstream pages;
 *   - an over-return is invisible: the stub pages are empty, so a method that
 *     returns more rows than asked (two collections concatenated, for
 *     instance) is judged on its requests alone.
 *
 * ## Baselines
 *
 *   scripts/paging-contract-baseline.json             `<vertical>/<slug>:<method> <verdict>`
 *   scripts/paging-contract-unmeasured-baseline.json  `<vertical>/<slug>:<method>`, and
 *                                                     `<vertical>/<slug>:ctor` for a
 *                                                     constructor that throws
 *   scripts/paging-contract-clamp-baseline.json       `<vertical>/<slug>:<method> serves <n> of <asked>`
 *
 * All three are strict: a new identity fails, and so does a baseline identity that
 * is no longer produced, until `pnpm check:paging-contract --update` banks
 * it. The verdict is part of the failing identity, so an adapter that moves
 * from one failing class to another surfaces as new. Identities are keyed by
 * slug, so an adapter scaffolded from its vertical's reference adapter
 * inherits that adapter's paging verdicts under a NEW identity and fails on
 * its first run: fix its paging, and bank with `--update` only as a last
 * resort.
 *
 * ## The declared-max invariant
 *
 * An adapter that declares `capabilities.maxPageSize` is synced in pages of
 * `min(500, maxPageSize)`, and a shorter page is taken as the end of the
 * collection. So on such an adapter a list method whose verdict is in
 * `DECLARED_MAX_VIOLATIONS` (fixed-size, page1-skips, page-stride,
 * first-page-only, over-asks) fails the gate EVEN WITH a baseline entry: no
 * ratchet, the target is zero, and `--update` still writes the baselines but
 * exits 1 while one remains. There are two ways past it, and each is listed
 * with its evidence. `DECLARED_MAX_ALLOWLIST` takes one method per entry with
 * the reason the verdict is a false positive of this gate; an entry that no
 * longer names a violation fails until it is removed. And `local-page` is
 * never a violation: the shared pagers report `pagedLocally` themselves, and
 * a hand-rolled window that reports it is listed in `LOCAL_PAGE_REPORTERS`
 * with the test that pins its slicing; a full sweep fails on an unlisted
 * reporter, and on an entry that no longer reports.
 * `page-ignored(-unsized)` is not a violation (a repeated full page trips the
 * sync's identical-page detector; a whole unpaginated list is a real end);
 * `--report` lists those, and the declared-max methods the probe could not
 * measure. One exception: a `page-ignored-unsized` method that sends the SAME
 * plausible size on every call (`per_page=25` beside a constant `page=1`) is
 * not unpaginated, whatever the classifier's by-value size test says — a
 * paginated upstream serves it 25 rows, which reads as the end — so the
 * invariant fails it as `fixed-size`. Like every verdict, a violation only
 * warns under `--soft`. A full sweep that finds no declared maximum at all is
 * a harness failure: the invariant would have judged nothing.
 *
 * Run: `pnpm check:paging-contract` (`--soft` reports verdict regressions
 * without failing — a harness failure still exits 1: a request that escaped
 * the recorder, nothing measured or paged locally, a full sweep under the
 * coverage floor, or shared/axios not loadable or stale; `--update` rewrites
 * all three baselines, `--report` prints the vertical × verdict table,
 * `--json=<path>` dumps every probed row, `--only=<vertical>[/<slug>]` probes
 * a subset and compares only that subset).
 * Needs a built `@opensteward/shared`: the adapters load it from `dist`.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import dns from 'node:dns'
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import net from 'node:net'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { SIGN_API_HOSTS as NITRO_SIGN_API_HOSTS } from '../apps/integration-server/src/verticals/docsign/adapters/nitro-sign/constants.ts'
import { VERTICALS } from './check-adapter-declarations.ts'

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const APP_ROOT = join(REPO_ROOT, 'apps/integration-server')
const BASELINE_PATH = join(REPO_ROOT, 'scripts/paging-contract-baseline.json')
const UNMEASURED_BASELINE_PATH = join(REPO_ROOT, 'scripts/paging-contract-unmeasured-baseline.json')
const CLAMP_BASELINE_PATH = join(REPO_ROOT, 'scripts/paging-contract-clamp-baseline.json')

/**
 * The page size every probe asks for. It IS a common default — about twenty
 * adapters declare `DEFAULT_PAGE_SIZE = 10` — so a value of 10 alone does not
 * prove the adapter read `params.limit`; see RESIZED_LIMIT.
 */
export const CALLER_LIMIT = 10
/**
 * Page 1 is asked for once more at this limit, and a size has to follow it: a
 * hard-coded 10, or a whitelist that allows 10 and swaps anything else for
 * its default, is `fixed-size` rather than `ok`.
 */
export const RESIZED_LIMIT = 7
/**
 * The largest limit the router asks for — `MAX_PAGE_LIMIT` in shared's
 * list-envelope — and so the limit at which a method's own clamp shows.
 */
export const CEILING_LIMIT = 500
/** Per-call cap. A stubbed call returns in milliseconds; this only catches a hang. */
export const CALL_TIMEOUT_MS = 3000
/**
 * Below this share of list methods measured (see `isMeasured`), a full sweep
 * is assumed miswired and refuses to pass or to `--update`. It sits a few
 * points under the real level (about 79%) rather than at a round half, so one
 * `--update` cannot quietly bank a collapse in coverage.
 */
export const MIN_MEASURED_SHARE = 0.75

// ── types ────────────────────────────────────────────────────────────────

export interface RecordedRequest {
  method: string
  url: string
  body?: string
}

export interface ProbeCall {
  requests: RecordedRequest[]
  error: string | null
  /** The shared cursor pager held a walk after this call. */
  usedPager: boolean
  /**
   * The `pageSize` the method reported through `reportUpstreamPage`: the size
   * it asked the platform for, when smaller than `params.limit`.
   */
  reportedPageSize?: number
  /**
   * The adapter reported `pagedLocally` for this call: the page was cut from
   * rows it had already fetched (`pageLocally`, `pageByRows`, a hand-rolled
   * window), so its requests need not move with `page`.
   */
  pagedLocally?: boolean
  /**
   * The call threw a refusal: an error whose `statusCode` is 501 and whose
   * `code` is `'NOT_SUPPORTED'` (see `isRefusal`). Whether it sent anything
   * first is `requests`.
   */
  refused?: boolean
}

export interface ProbeRow {
  vertical: string
  slug: string
  method: string
  page1: ProbeCall
  page1Again: ProbeCall
  page2: ProbeCall
  /** Page 1 again, at RESIZED_LIMIT instead of the caller's limit. */
  page1Resized: ProbeCall
  /** Page 1 at CEILING_LIMIT, where the method's own clamp shows. */
  page1Ceiling?: ProbeCall
  /** The adapter's usable `capabilities.maxPageSize` (shared's `declaredPageMax`). */
  declaredMax?: number
}

export type Verdict =
  | 'ok'
  | 'refused'
  | 'single-page'
  | 'local-page'
  | 'page-ignored'
  | 'page-ignored-unsized'
  | 'page1-skips'
  | 'page-stride'
  | 'first-page-only'
  | 'over-asks'
  | 'fixed-size'
  | 'unmeasured-no-request'
  | 'unmeasured-error'
  | 'unmeasured-no-size'

export const FAILING: ReadonlySet<Verdict> = new Set<Verdict>([
  'page-ignored',
  'page-ignored-unsized',
  'page1-skips',
  'page-stride',
  'first-page-only',
  'over-asks',
  'fixed-size',
])

export const UNMEASURED: ReadonlySet<Verdict> = new Set<Verdict>([
  'unmeasured-no-request',
  'unmeasured-error',
  'unmeasured-no-size',
])

export const VERDICTS: readonly Verdict[] = [
  'ok',
  'refused',
  'single-page',
  'local-page',
  'page-ignored',
  'page-ignored-unsized',
  'page1-skips',
  'page-stride',
  'first-page-only',
  'over-asks',
  'fixed-size',
  'unmeasured-no-request',
  'unmeasured-error',
  'unmeasured-no-size',
]

/**
 * Whether a verdict rests on something the probe actually saw: a size that
 * follows the limit, a position, or page 2 declining to ask. Not the
 * unmeasured verdicts, and not `page-ignored-unsized`, whose repeated request
 * may be only a lookup — it fails, but it is not counted as coverage. Not
 * `local-page` either: it passes on the adapter's own report, and the
 * request behind it may be only a lookup too (a lookup that found nothing,
 * then `pageLocally([])`). Not `refused`: a method that refuses has no paging
 * to measure, and `coverageShare` leaves it out of the denominator too.
 */
export function isMeasured(v: Verdict): boolean {
  return !UNMEASURED.has(v) && v !== 'page-ignored-unsized' && v !== 'local-page' && v !== 'refused'
}

/**
 * The share of list methods measured, with deliberate refusals left out of
 * both sides: measured ÷ (total − refused). A refusal serves no rows, so it is
 * neither coverage nor a gap in it; counting it in the denominator would push
 * every correct refusal toward the coverage floor. 0 when nothing is left.
 */
export function coverageShare(measured: number, total: number, refused = 0): number {
  const measurable = total - refused
  return measurable <= 0 ? 0 : measured / measurable
}

/**
 * Whether `err` is a deliberate refusal: `statusCode === 501` and
 * `code === 'NOT_SUPPORTED'`, what adapters throw for a list the platform
 * cannot serve and what the sync worker skips a resource on. Read
 * defensively: a thrown non-object, or a getter that throws, is not one.
 */
export function isRefusal(err: unknown): boolean {
  if (err === null || (typeof err !== 'object' && typeof err !== 'function')) return false
  try {
    const e = err as { statusCode?: unknown; code?: unknown }
    return e.statusCode === 501 && e.code === 'NOT_SUPPORTED'
  } catch {
    return false
  }
}

// ── request parameters ───────────────────────────────────────────────────

/**
 * `word <number>` / `word: <number>` / `word=<number>` inside a query-language
 * value: SOQL's `LIMIT 10 OFFSET 20`, QuickBooks' `MAXRESULTS 10`, an inline
 * GraphQL `first: 10`. A separator is required so `v59` is not `v5` + `9`.
 */
const EMBEDDED_NUMBER = /([A-Za-z_$][\w$]*)["']?(?:\s*[:=]\s*|\s+)(-?\d+)(?![\w.])/g
/** `<MaxRecords>10</MaxRecords>` in an XML/SOAP body. */
const XML_NUMBER = /<([A-Za-z_][\w:.-]*)[^>]*>\s*(-?\d+)\s*<\/\1>/g
/**
 * Dates and clock times, removed before numbers are lifted: `T21:10:05` would
 * otherwise yield a minute of 10 that reads as the page size on some runs and
 * not others.
 */
const DATE_TIME =
  /\d{4}-\d{2}-\d{2}(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?|\b\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?/g

function addParam(out: Map<string, string>, key: string, value: string): void {
  let k = key
  for (let n = 2; out.has(k); n++) k = `${key}#${n}`
  out.set(k, value)
  // PrestaShop's `limit=<offset>,<count>`.
  if (/^-?\d+(?:,-?\d+)+$/.test(value)) value.split(',').forEach((n, i) => out.set(`${k}[${i}]`, n))
  if (value.length > 4 && value.length <= 20_000 && /[\s:<(]/.test(value)) {
    const text = value.replace(DATE_TIME, ' ')
    for (const re of [EMBEDDED_NUMBER, XML_NUMBER]) {
      for (const m of text.matchAll(re)) addParam(out, `${k}~${m[1]}`, m[2]!)
    }
  }
}

function flatten(value: unknown, path: string, out: Map<string, string>): void {
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) addParam(out, path || '$', Array.isArray(value) ? '[]' : '{}')
    for (const [k, v] of entries) flatten(v, path ? `${path}.${k}` : k, out)
    return
  }
  addParam(out, path || '$', String(value))
}

/**
 * A request URL, resolved against a placeholder origin when it has no scheme:
 * an adapter that builds `${extra.host}/api/…` from a stub host still sent a
 * query worth reading.
 */
function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url, 'http://no-scheme.invalid/')
  } catch {
    return undefined
  }
}

/**
 * Every value a request carries, by a name that is only a label: the query
 * string verbatim (`$skip` stays `$skip`), a JSON body flattened to dotted
 * paths (`variables.first`), a form body, else the raw body. Numbers inside a
 * query-language value are lifted out as `<key>~<word>`.
 */
export function requestParams(req: RecordedRequest): Map<string, string> {
  const out = new Map<string, string>()
  const url = parseUrl(req.url)
  if (url) for (const [k, v] of url.searchParams) addParam(out, k, v)
  const body = req.body
  if (body === undefined || body === '') return out
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    json = undefined
  }
  if (json !== null && typeof json === 'object') flatten(json, '', out)
  else if (/^[^=&\s]+=[^&]*(?:&[^=&\s]+=[^&]*)*$/.test(body))
    for (const [k, v] of new URLSearchParams(body)) addParam(out, k, v)
  else addParam(out, 'body', body)
  return out
}

/** Which endpoint a request hits: method, origin and path, no query. */
function endpoint(req: RecordedRequest): string {
  const url = parseUrl(req.url)
  return `${req.method.toUpperCase()} ${url ? url.origin + url.pathname : req.url}`
}

/**
 * Requests of two calls paired by endpoint, in order within each endpoint. A
 * token request the first call made and the second served from cache pairs
 * with nothing instead of shifting every later pair by one.
 */
function pairByEndpoint(
  a: readonly RecordedRequest[],
  b: readonly RecordedRequest[],
): Array<[RecordedRequest, RecordedRequest]> {
  const byEndpoint = new Map<string, RecordedRequest[]>()
  for (const r of b) {
    const list = byEndpoint.get(endpoint(r)) ?? []
    list.push(r)
    byEndpoint.set(endpoint(r), list)
  }
  const pairs: Array<[RecordedRequest, RecordedRequest]> = []
  for (const r of a) {
    const match = byEndpoint.get(endpoint(r))?.shift()
    if (match) pairs.push([r, match])
  }
  return pairs
}

/** Params whose value differs between two calls that asked for the same page. */
export function volatileKeys(a: ProbeCall, b: ProbeCall): Set<string> {
  const out = new Set<string>()
  for (const [x, y] of pairByEndpoint(a.requests, b.requests)) {
    const px = requestParams(x)
    const py = requestParams(y)
    for (const k of new Set([...px.keys(), ...py.keys()])) {
      if (px.get(k) !== py.get(k)) out.add(k)
    }
  }
  return out
}

function stableParams(req: RecordedRequest, volatile: ReadonlySet<string>): Map<string, string> {
  return new Map([...requestParams(req)].filter(([k]) => !volatile.has(k)))
}

/** A request with its volatile values removed, as one comparable string. */
function fingerprint(req: RecordedRequest, volatile: ReadonlySet<string>): string {
  const params = [...stableParams(req, volatile)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `${endpoint(req)} ${JSON.stringify(params)}`
}

function asInt(value: string | undefined): number | undefined {
  return value !== undefined && /^-?\d+$/.test(value) ? Number(value) : undefined
}

// ── classification ───────────────────────────────────────────────────────

/**
 * The verdict for one probed list method, in precedence order:
 *
 *   refused                every probe call (page 1, page 2, page 1 again, the
 *                          resized and, when it ran, the ceiling call) threw a
 *                          refusal (`isRefusal`) and sent nothing.
 *   unmeasured-no-request  page 1 sent nothing.
 *   page1-skips            a value > 1 on page 1 grows by exactly the limit on
 *                          page 2 (a 0-based offset that started one page in),
 *                          beside a separate value equal to the limit — a
 *                          1-based start (1 → 11) is not a skip; or a counter
 *                          that is 2 on page 1 (the lowest any page-1 request to
 *                          that endpoint sends) and 3 on page 2 — a page
 *                          numbered from 0 and sent + 1, sized or not.
 *
 *   Page 1 and page 2 both report `pagedLocally` (a page cut from rows the
 *   adapter already fetched, whose requests need not move or follow the limit),
 *   neither threw, and the requests alone would not be `ok`:
 *   over-asks              page 1 carries limit + 1 and not the limit.
 *   page-stride            a size follows the limit and a position moves by
 *                          neither 1 nor the limit, or any position moves by
 *                          more than the limit (page 2 of a local window
 *                          starts in the upstream page holding row `limit`).
 *   page-ignored           page 2 repeats a page-1 request whose size follows
 *                          the limit: `pageLocally` over one sized page.
 *   local-page             anything else.
 *
 *   Otherwise, and when the requests alone are `ok`, the verdict is theirs:
 *
 *   Page 2 did not move (every page-2 request repeats a page-1 request once
 *   volatile values are masked) and the cursor pager did not run:
 *   single-page            page 2 sent nothing and threw nothing, and page 1
 *                          asked upstream for no size.
 *   first-page-only        the same, but page 1 asked for the caller's limit.
 *   unmeasured-error       a call threw and page 1 carried no size: what repeats
 *                          is a prerequisite the stub body failed (a token
 *                          exchange, a lookup), not the list request.
 *   page-ignored           page 1 carries the caller's limit.
 *   page-ignored-unsized   it does not.
 *
 *   Page 2 moved, or the pager ran:
 *   page-stride            a size follows the limit, but a value that is not
 *                          the limit on page 1 moves by neither 1 nor the limit.
 *   ok                     some value on page 1 equals the caller's limit and
 *                          becomes `resizedLimit` when page 1 is asked for at it.
 *   fixed-size             a value equals the caller's limit but does not follow
 *                          it (a hard-coded default, a whitelist).
 *   over-asks              none equals the limit; one equals limit + 1.
 *   fixed-size             none does; a constant integer that could be a page
 *                          size (5..100,000) rides along unchanged on every call.
 *   unmeasured-no-size     requests, but nothing that reads as a size.
 */
export function classify(
  row: ProbeRow,
  callerLimit: number,
  resizedLimit: number = RESIZED_LIMIT,
): Verdict {
  if (refusedOutright(row)) return 'refused'
  const p1 = row.page1.requests
  if (p1.length === 0) return 'unmeasured-no-request'

  const volatile = volatileKeys(row.page1, row.page1Again)
  const pairs = pairByEndpoint(p1, row.page2.requests)
  if (skipsFirstPage(p1, pairs, volatile, callerLimit)) return 'page1-skips'

  const byRequests = requestVerdict(row, callerLimit, resizedLimit, volatile, pairs)
  // What the requests prove outranks what the adapter says about them.
  if (!bothPagedLocally(row) || byRequests === 'ok') return byRequests
  return localVerdict(row, callerLimit, resizedLimit, volatile, pairs)
}

/**
 * Every probe call that ran refused before sending anything. One that sent a
 * request first, or one call that did not refuse, and the row is judged on
 * its requests like any other: a refusal is only a refusal if it is the
 * method's answer to every page and every size.
 */
function refusedOutright(row: ProbeRow): boolean {
  const calls = [row.page1, row.page2, row.page1Again, row.page1Resized, row.page1Ceiling]
  return calls.every(
    (c) => c === undefined || (c.refused === true && c.error !== null && c.requests.length === 0),
  )
}

/**
 * Page 1 and page 2 both say they were cut from rows already fetched, and
 * both returned: a call that threw served nothing, whatever it reported.
 */
function bothPagedLocally(row: ProbeRow): boolean {
  return (
    row.page1.pagedLocally === true &&
    row.page2.pagedLocally === true &&
    row.page1.error === null &&
    row.page2.error === null
  )
}

/** The verdict on the requests alone, once page 1 is known to start at row 0. */
function requestVerdict(
  row: ProbeRow,
  callerLimit: number,
  resizedLimit: number,
  volatile: ReadonlySet<string>,
  pairs: ReadonlyArray<[RecordedRequest, RecordedRequest]>,
): Verdict {
  const p1 = row.page1.requests
  const p2 = row.page2.requests
  const limitText = String(callerLimit)
  const page1Values = p1.flatMap((r) => [...stableParams(r, volatile).values()])
  const overAsks = !page1Values.includes(limitText) && page1Values.includes(String(callerLimit + 1))
  const sized = page1Values.includes(limitText) || page1Values.includes(String(callerLimit + 1))

  const usedPager = row.page1.usedPager || row.page2.usedPager || row.page1Again.usedPager
  const seen = new Set([...p1, ...row.page1Again.requests].map((r) => fingerprint(r, volatile)))
  const moved = p2.some((r) => !seen.has(fingerprint(r, volatile)))
  if (!moved && !usedPager) {
    if (p2.length === 0 && row.page2.error === null)
      return sized ? 'first-page-only' : 'single-page'
    if (!sized && (row.page1.error !== null || row.page2.error !== null)) return 'unmeasured-error'
    return sized ? 'page-ignored' : 'page-ignored-unsized'
  }

  if (followsLimit(p1, row.page1Resized.requests, volatile, callerLimit, resizedLimit))
    return badStride(pairs, volatile, callerLimit) ? 'page-stride' : 'ok'
  if (page1Values.includes(limitText)) return 'fixed-size'
  if (overAsks) return 'over-asks'

  for (const [x, y] of pairs) {
    const py = stableParams(y, volatile)
    for (const [k, v] of stableParams(x, volatile)) {
      const n = asInt(v)
      if (n !== undefined && isPlausibleSize(n) && py.get(k) === v) return 'fixed-size'
    }
  }
  return 'unmeasured-no-size'
}

/**
 * The verdict for a method whose page 1 and page 2 both report `pagedLocally`
 * and whose requests alone do not pass. Such a page is cut from rows already
 * fetched, so its requests need not move with `page` nor follow the limit,
 * but it can still over-ask, jump past rows, or claim to page locally over a
 * request that is itself one page of the caller's size.
 */
function localVerdict(
  row: ProbeRow,
  callerLimit: number,
  resizedLimit: number,
  volatile: ReadonlySet<string>,
  pairs: ReadonlyArray<[RecordedRequest, RecordedRequest]>,
): Verdict {
  const p1 = row.page1.requests
  const resized = row.page1Resized.requests
  const limitText = String(callerLimit)
  const page1Values = p1.flatMap((r) => [...stableParams(r, volatile).values()])
  if (!page1Values.includes(limitText) && page1Values.includes(String(callerLimit + 1)))
    return 'over-asks'
  const strides =
    (followsLimit(p1, resized, volatile, callerLimit, resizedLimit) &&
      badStride(pairs, volatile, callerLimit)) ||
    movesPastLimit(pairs, volatile, callerLimit)
  if (strides) return 'page-stride'
  // `pageLocally` over one page of `?limit=<limit>`: page 2 slices past the
  // end of the same rows. No window repeats a request its size follows: a
  // window whose upstream page is the caller's size moves to the next one.
  const page1ByPrint = new Map(p1.map((r) => [fingerprint(r, volatile), r] as const))
  for (const r of row.page2.requests) {
    const x = page1ByPrint.get(fingerprint(r, volatile))
    if (x && followsLimit([x], resized, volatile, callerLimit, resizedLimit)) return 'page-ignored'
  }
  return 'local-page'
}

/**
 * A position that moves by more than the caller's limit between page 1 and
 * page 2. A local window's page 2 is rows [limit, 2 × limit), which start in
 * the upstream page holding row `limit`: an offset moves by at most the
 * limit, and a page number by at most limit ÷ upstream size. Moving further
 * skips rows: a window over 200-row pages that asks for row 200 on page 2. A
 * size that grows with the page (`page × limit` rows, sliced) grows by the
 * limit, so it needs no exception.
 */
function movesPastLimit(
  pairs: ReadonlyArray<[RecordedRequest, RecordedRequest]>,
  volatile: ReadonlySet<string>,
  callerLimit: number,
): boolean {
  for (const [x, y] of pairs) {
    const py = stableParams(y, volatile)
    for (const [k, v] of stableParams(x, volatile)) {
      const n1 = asInt(v)
      const n2 = asInt(py.get(k))
      if (n1 !== undefined && n2 !== undefined && n2 - n1 > callerLimit) return true
    }
  }
  return false
}

/** Page 1 starts one page in: a late 0-based offset, or a page number sent + 1. */
function skipsFirstPage(
  p1: readonly RecordedRequest[],
  pairs: ReadonlyArray<[RecordedRequest, RecordedRequest]>,
  volatile: ReadonlySet<string>,
  callerLimit: number,
): boolean {
  const limitText = String(callerLimit)
  for (const [x, y] of pairs) {
    const px = stableParams(x, volatile)
    const py = stableParams(y, volatile)
    for (const [k, v] of px) {
      const n1 = asInt(v)
      const n2 = asInt(py.get(k))
      if (n1 === undefined || n2 === undefined) continue
      const beside = [...px].some(([other, ov]) => other !== k && ov === limitText)
      if (n1 > 1 && n2 === n1 + callerLimit && beside) return true
      // Lowest value on page 1, so a look-ahead that fetches pages 1 AND 2 for
      // page 1 (and 2 and 3 for page 2) is not read as starting at 2.
      if (n1 === 2 && n2 === 3 && lowestOnPage1(p1, x, k, volatile) === 2) return true
    }
  }
  return false
}

function lowestOnPage1(
  p1: readonly RecordedRequest[],
  like: RecordedRequest,
  key: string,
  volatile: ReadonlySet<string>,
): number {
  const values = p1
    .filter((r) => endpoint(r) === endpoint(like))
    .map((r) => asInt(stableParams(r, volatile).get(key)))
    .filter((n): n is number => n !== undefined)
  return Math.min(...values)
}

/** Some value equal to the caller's limit on page 1 is the resized limit on the resized call. */
function followsLimit(
  p1: readonly RecordedRequest[],
  resized: readonly RecordedRequest[],
  volatile: ReadonlySet<string>,
  callerLimit: number,
  resizedLimit: number,
): boolean {
  for (const [x, y] of pairByEndpoint(p1, resized)) {
    const py = requestParams(y)
    for (const [k, v] of stableParams(x, volatile))
      if (v === String(callerLimit) && py.get(k) === String(resizedLimit)) return true
  }
  return false
}

/**
 * A position that moves by neither 1 (a page number) nor the limit (a row
 * offset). A value that IS the limit on page 1 is a size, not a position, and
 * may legitimately grow (fetch `page × limit` rows and slice; Stripe's skip
 * walk asks for 100 at a time).
 */
function badStride(
  pairs: ReadonlyArray<[RecordedRequest, RecordedRequest]>,
  volatile: ReadonlySet<string>,
  callerLimit: number,
): boolean {
  for (const [x, y] of pairs) {
    const py = stableParams(y, volatile)
    for (const [k, v] of stableParams(x, volatile)) {
      if (v === String(callerLimit)) continue
      const n1 = asInt(v)
      const n2 = asInt(py.get(k))
      if (n1 === undefined || n2 === undefined || n1 === n2) continue
      if (n2 - n1 !== 1 && n2 - n1 !== callerLimit) return true
    }
  }
  return false
}

/**
 * Could this constant be a page size? Below 5 it is a flag, an enum or a
 * version (`status=4`, `api_version=2`); above 100,000 it is an id or a Unix
 * timestamp that only looked constant because three calls fell in one second.
 */
function isPlausibleSize(n: number): boolean {
  return n >= 5 && n <= 100_000
}

export function identity(row: Pick<ProbeRow, 'vertical' | 'slug' | 'method'>, v: Verdict): string {
  return `${row.vertical}/${row.slug}:${row.method} ${v}`
}

export function unmeasuredIdentity(row: Pick<ProbeRow, 'vertical' | 'slug' | 'method'>): string {
  return `${row.vertical}/${row.slug}:${row.method}`
}

// ── page size at the router's ceiling ────────────────────────────────────

/**
 * The page size the method sends when asked for `ceilingLimit` rows, or
 * undefined when that cannot be read: no value followed the limit (10 → 7),
 * or the ceiling call did not carry one at the key that did. The smallest
 * such size across the method's requests: a page is only as large as its
 * smallest request.
 */
export function sizeAtCeiling(
  row: ProbeRow,
  callerLimit: number = CALLER_LIMIT,
  resizedLimit: number = RESIZED_LIMIT,
  ceilingLimit: number = CEILING_LIMIT,
): number | undefined {
  const ceiling = row.page1Ceiling?.requests ?? []
  if (ceiling.length === 0) return undefined
  const volatile = volatileKeys(row.page1, row.page1Again)
  const p1 = row.page1.requests
  const atCeiling = new Map(pairByEndpoint(p1, ceiling))
  const sizes: number[] = []
  for (const [x, y] of pairByEndpoint(p1, row.page1Resized.requests)) {
    const c = atCeiling.get(x)
    if (!c) continue
    const py = requestParams(y)
    const pc = requestParams(c)
    for (const [k, v] of stableParams(x, volatile)) {
      if (v !== String(callerLimit) || py.get(k) !== String(resizedLimit)) continue
      const n = asInt(pc.get(k))
      // Above the ceiling is an over-ask, not a clamp.
      if (n !== undefined && n >= 1 && n <= ceilingLimit) sizes.push(n)
    }
  }
  return sizes.length > 0 ? Math.min(...sizes) : undefined
}

/**
 * The clamp identity for a method that sends fewer rows than the router asks
 * it for, else undefined. The router asks for the ceiling, capped at the
 * adapter's declared maximum.
 */
export function clampIdentity(
  row: ProbeRow,
  callerLimit: number = CALLER_LIMIT,
  resizedLimit: number = RESIZED_LIMIT,
  ceilingLimit: number = CEILING_LIMIT,
): string | undefined {
  const served = sizeAtCeiling(row, callerLimit, resizedLimit, ceilingLimit)
  if (served === undefined) return undefined
  // A size the method reported is the size the router judges it at.
  const reported = row.page1Ceiling?.reportedPageSize
  if (reported !== undefined && reported <= served) return undefined
  const asked = Math.min(ceilingLimit, row.declaredMax ?? ceilingLimit)
  return served < asked
    ? `${row.vertical}/${row.slug}:${row.method} serves ${served} of ${asked}`
    : undefined
}

// ── the declared-max invariant ───────────────────────────────────────────

/**
 * Verdicts that break the promise a declared `capabilities.maxPageSize` makes.
 *
 * The sync worker asks for pages of `min(500, maxPageSize)` and takes a page
 * shorter than that as the end of the collection: it marks the collection
 * complete, serves it from cache and sweeps cached rows the sync did not see.
 * Each of these makes a short or missing page that is not the end:
 *
 *   fixed-size       25 rows under a declared 100 is "the end" after 25 rows.
 *   page1-skips      the first page is never written, yet the collection is
 *                    marked complete.
 *   page-stride      rows between pages are never written.
 *   first-page-only  everything past the first page is never written.
 *   over-asks        the extra row is truncated away at every page boundary.
 *
 * Not in the set, nor in DECLARED_MAX_UNPAGED: `refused`, which sends no
 * request and which the sync worker skips, so it makes no page at all.
 *
 * Not in the set: `page-ignored` and `page-ignored-unsized`. A repeated full
 * page trips the worker's identical-page detector and fails loudly, and an
 * unpaginated list returned whole is a real end. They are listed by
 * `--report` only.
 */
export const DECLARED_MAX_VIOLATIONS: ReadonlySet<Verdict> = new Set<Verdict>([
  'fixed-size',
  'page1-skips',
  'page-stride',
  'first-page-only',
  'over-asks',
])

/** Verdicts on a declared-max adapter that are reported, never failed. */
export const DECLARED_MAX_UNPAGED: ReadonlySet<Verdict> = new Set<Verdict>([
  'page-ignored',
  'page-ignored-unsized',
])

/**
 * One of the two ways past the declared-max invariant (the other is a
 * `local-page` verdict; see LOCAL_PAGE_REPORTERS): `<vertical>/<slug>:<method>`
 * → why the verdict is a false positive of THIS gate. Not a baseline — nothing
 * is banked here, and the target stays zero. An entry the sweep no longer
 * reports as a violation fails the gate until it is removed.
 *
 * Empty. Its one entry was Lumin Sign's listTemplates, whose upstream size
 * snaps to 10/25/50 and so read as `fixed-size`; it now reports
 * `pagedLocally` and reads as `local-page`, which judges the page it serves.
 * A local window is the usual false positive here: report `pagedLocally`
 * from it (tested, and listed in LOCAL_PAGE_REPORTERS) before reaching for
 * this list.
 */
export const DECLARED_MAX_ALLOWLIST: Readonly<Record<string, string>> = Object.freeze({})

/**
 * Adapter source files that report `pagedLocally: true` themselves: a
 * hand-rolled window, not shared's `pageLocally` or `pageByRows`, whose own
 * tests pin their slicing. Path → the test that pins this window's slicing
 * and its report.
 *
 * The report turns a method's verdict into `local-page`, which passes, is
 * never a declared-max violation, and is taken on trust. So, like
 * DECLARED_MAX_ALLOWLIST, each use is listed with its evidence: a full sweep
 * fails on a file under `apps/` that makes the claim without an entry here,
 * on an entry whose file no longer makes it, and on an entry whose test does
 * not exist or never mentions `pagedLocally`.
 */
export const LOCAL_PAGE_REPORTERS: Readonly<Record<string, string>> = Object.freeze({
  'apps/integration-server/src/verticals/ecommerce/adapters/eposnow/index.ts':
    'apps/integration-server/tests/verticals/ecommerce/unit/adapters/eposnow/request-shape.test.ts',
  'apps/integration-server/src/verticals/docsign/adapters/lumin-sign/index.ts':
    'apps/integration-server/tests/verticals/docsign/unit/adapters/lumin-sign/request-shape.test.ts',
})

/** A source line that reports the flag: `pagedLocally: true`, not a comment naming it. */
export const LOCAL_PAGE_CLAIM = /\bpagedLocally\s*:\s*true\b/

/**
 * Why LOCAL_PAGE_REPORTERS disagrees with the source. `reporters` are the
 * repo-relative source files whose code matches LOCAL_PAGE_CLAIM; `readTest`
 * returns a test file's text, or undefined when it does not exist.
 */
export function localReporterProblems(
  reporters: readonly string[],
  inventory: Readonly<Record<string, string>>,
  readTest: (path: string) => string | undefined,
): string[] {
  const problems: string[] = []
  const found = new Set(reporters)
  for (const file of [...found].sort())
    if (!(file in inventory))
      problems.push(
        `${file} reports pagedLocally but is not in LOCAL_PAGE_REPORTERS: list it with the test ` +
          'that proves its window serves every row once, or page through pageByRows/pageLocally.',
      )
  for (const [file, test] of Object.entries(inventory)) {
    if (!found.has(file))
      problems.push(
        `${file} is in LOCAL_PAGE_REPORTERS but no longer reports pagedLocally: remove it.`,
      )
    const text = readTest(test)
    if (text === undefined) problems.push(`${file}: its test ${test} does not exist.`)
    else if (!/\bpagedLocally\b/.test(text))
      problems.push(`${file}: its test ${test} never checks pagedLocally.`)
  }
  return problems
}

/**
 * The repo-relative `.ts` files under `apps/<app>/src` whose code reports
 * `pagedLocally: true`. A comment line that names the flag does not count.
 */
export function findLocalReporters(repoRoot: string = REPO_ROOT): string[] {
  const out: string[] = []
  const appsDir = join(repoRoot, 'apps')
  for (const app of readdirSync(appsDir)) {
    const src = join(appsDir, app, 'src')
    if (!existsSync(src)) continue
    for (const rel of readdirSync(src, { recursive: true }) as string[]) {
      if (!rel.endsWith('.ts') || rel.endsWith('.d.ts')) continue
      const text = readFileSync(join(src, rel), 'utf8')
      if (!text.includes('pagedLocally')) continue
      const claims = text
        .split('\n')
        .some((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && LOCAL_PAGE_CLAIM.test(line))
      if (claims) out.push(`apps/${app}/src/${rel.split(sep).join('/')}`)
    }
  }
  return out.sort()
}

/**
 * `capabilities.maxPageSize` as the sync worker and the router read it:
 * shared's `declaredPageMax`, where only a finite integer ≥ 1 counts (a
 * string, fraction, 0, negative, NaN or Infinity declares nothing, and both
 * readers page it at the default). Restated here so the pure classifier needs
 * no built shared; the sweep's rows go through it, so the invariant judges
 * exactly the adapters whose short pages the worker trusts.
 */
export function declaredMaxOf(adapter: object): number | undefined {
  const max = (adapter as { capabilities?: { maxPageSize?: unknown } }).capabilities?.maxPageSize
  return typeof max === 'number' && Number.isInteger(max) && max >= 1 ? max : undefined
}

/**
 * One probed method as the sweep records it, carrying the adapter's declared
 * maximum when it has one — the only way the invariant learns of it.
 */
export function probeRow(
  adapter: object,
  at: Pick<ProbeRow, 'vertical' | 'slug' | 'method'>,
  calls: Pick<ProbeRow, 'page1' | 'page1Again' | 'page2' | 'page1Resized' | 'page1Ceiling'>,
): ProbeRow {
  const declaredMax = declaredMaxOf(adapter)
  return {
    vertical: at.vertical,
    slug: at.slug,
    method: at.method,
    page1: calls.page1,
    page1Again: calls.page1Again,
    page2: calls.page2,
    page1Resized: calls.page1Resized,
    ...(calls.page1Ceiling !== undefined ? { page1Ceiling: calls.page1Ceiling } : {}),
    ...(declaredMax !== undefined ? { declaredMax } : {}),
  }
}

/**
 * The constant size an unpaged method sends, as `key=value`, or undefined.
 *
 * The classifier spots a size by the caller's limit, so a method that ignores
 * `page` AND sends a size of its own (`page=1&per_page=25` on every call) reads
 * as `page-ignored-unsized`, the verdict for an unpaginated fetch. It is not
 * one: a paginated upstream serves it 25 rows, and 25 under a declared 100 is
 * "the end". Found here as a value that could be a page size (5..100,000), not
 * volatile, sent unchanged on page 1, page 2 and the resized call.
 */
export function constantSizeOf(
  row: Pick<ProbeRow, 'page1' | 'page1Again' | 'page2' | 'page1Resized'>,
): string | undefined {
  const volatile = volatileKeys(row.page1, row.page1Again)
  const page2 = pairByEndpoint(row.page1.requests, row.page2.requests)
  const resized = new Map(pairByEndpoint(row.page1.requests, row.page1Resized.requests))
  for (const [x, y] of page2) {
    const z = resized.get(x)
    if (!z) continue
    const py = stableParams(y, volatile)
    const pz = stableParams(z, volatile)
    for (const [k, v] of stableParams(x, volatile)) {
      const n = asInt(v)
      if (n !== undefined && isPlausibleSize(n) && py.get(k) === v && pz.get(k) === v)
        return `${k}=${v}`
    }
  }
  return undefined
}

export interface DeclaredMaxFinding {
  /** `<vertical>/<slug>:<method>`, the allowlist key. */
  id: string
  verdict: Verdict
  declaredMax: number
  /** Why an unpaged verdict is a violation after all: the constant size it sends. */
  detail?: string
}

export interface DeclaredMaxResult {
  /** Break the invariant and are not allowlisted: these fail the gate. */
  violations: DeclaredMaxFinding[]
  /** Would be violations, but the allowlist names them. */
  allowed: DeclaredMaxFinding[]
  /** `page-ignored(-unsized)` on a declared-max adapter: reported, not failed. */
  unpaged: DeclaredMaxFinding[]
  /** Declared-max methods the probe could not measure, so could not judge. */
  unmeasured: DeclaredMaxFinding[]
  /** In-scope allowlist keys that no longer name a violation: remove them. */
  staleAllowlist: string[]
  /** Why the allowlist itself is malformed (see `allowlistProblems`). */
  malformedAllowlist: string[]
}

type Probed = Pick<ProbeRow, 'page1' | 'page1Again' | 'page2' | 'page1Resized'>

function hasProbeCalls(row: object): row is Probed {
  return 'page1' in row && 'page1Again' in row && 'page2' in row && 'page1Resized' in row
}

/**
 * Apply the invariant to classified rows. Rows of adapters that declare no
 * maximum are ignored; the ratchet still judges them. A row that carries its
 * probe calls is also checked for a constant size under `page-ignored-unsized`
 * (see `constantSizeOf`).
 */
export function checkDeclaredMax<
  R extends Pick<ProbeRow, 'vertical' | 'slug' | 'method' | 'declaredMax'> & Partial<Probed>,
>(
  rows: readonly R[],
  verdictOf: (row: R) => Verdict,
  allowlist: Readonly<Record<string, string>> = DECLARED_MAX_ALLOWLIST,
  inScope: (id: string) => boolean = () => true,
): DeclaredMaxResult {
  const result: DeclaredMaxResult = {
    violations: [],
    allowed: [],
    unpaged: [],
    unmeasured: [],
    staleAllowlist: [],
    malformedAllowlist: allowlistProblems(allowlist),
  }
  const byId = (a: DeclaredMaxFinding, b: DeclaredMaxFinding): number =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  for (const row of rows) {
    if (row.declaredMax === undefined) continue
    const verdict = verdictOf(row)
    const constant =
      verdict === 'page-ignored-unsized' && hasProbeCalls(row) ? constantSizeOf(row) : undefined
    const finding: DeclaredMaxFinding = constant
      ? {
          id: unmeasuredIdentity(row),
          verdict: 'fixed-size',
          declaredMax: row.declaredMax,
          detail: `ignores page and sends ${constant} on every call`,
        }
      : { id: unmeasuredIdentity(row), verdict, declaredMax: row.declaredMax }
    if (DECLARED_MAX_VIOLATIONS.has(finding.verdict))
      (Object.hasOwn(allowlist, finding.id) ? result.allowed : result.violations).push(finding)
    else if (DECLARED_MAX_UNPAGED.has(finding.verdict)) result.unpaged.push(finding)
    else if (UNMEASURED.has(finding.verdict)) result.unmeasured.push(finding)
  }
  const allowedIds = new Set(result.allowed.map((f) => f.id))
  result.staleAllowlist = Object.keys(allowlist)
    .filter((id) => inScope(id) && !allowedIds.has(id))
    .sort()
  for (const list of [result.violations, result.allowed, result.unpaged, result.unmeasured])
    list.sort(byId)
  return result
}

/** Whether the invariant fails the run: a violation, a stale or a malformed allowlist. */
export function declaredMaxFailed(d: DeclaredMaxResult): boolean {
  return d.violations.length > 0 || d.staleAllowlist.length > 0 || d.malformedAllowlist.length > 0
}

/**
 * The gate's exit code. A declared-max failure is never banked: it fails a
 * `--update` too, which writes the baselines all the same, and so does a
 * LOCAL_PAGE_REPORTERS that disagrees with the source (`reportersFailed`).
 * The ratchet's regressions and stale entries fail a plain run only —
 * `--update` is what banks them. `--soft` turns every failure into a warning
 * (a harness failure exits 1 before this is reached).
 */
export function gateExitCode(o: {
  declared: DeclaredMaxResult
  ratchetFailed: boolean
  reportersFailed?: boolean
  update: boolean
  soft: boolean
}): 0 | 1 {
  const failed =
    declaredMaxFailed(o.declared) || o.reportersFailed === true || (!o.update && o.ratchetFailed)
  return failed && !o.soft ? 1 : 0
}

/** Why an allowlist is malformed: a key that is not one list method, or a missing reason. */
export function allowlistProblems(allowlist: Readonly<Record<string, string>>): string[] {
  const problems: string[] = []
  for (const [id, reason] of Object.entries(allowlist)) {
    if (!/^[a-z0-9-]+\/[a-z0-9-]+:list\w+$/.test(id))
      problems.push(`"${id}" is not <vertical>/<slug>:<list method>`)
    if (typeof reason !== 'string' || reason.trim().length < 20)
      problems.push(`"${id}" needs a reason: why the verdict is a false positive of this gate`)
  }
  return problems
}

/** One violation as printed: the method, its verdict and the maximum it breaks. */
export function describeViolation(f: DeclaredMaxFinding): string {
  const detail = f.detail ? `, ${f.detail}` : ''
  return `${f.id} ${f.verdict} (the adapter declares maxPageSize ${f.declaredMax}${detail})`
}

// ── ratchet and flags ────────────────────────────────────────────────────

/** Identities produced but not banked, and banked but no longer produced. */
export function ratchet(
  produced: readonly string[],
  baseline: readonly string[],
  inScope: (id: string) => boolean = () => true,
): { regressions: string[]; stale: string[] } {
  const producedSet = new Set(produced)
  const baselineSet = new Set(baseline)
  return {
    regressions: [...producedSet].filter((id) => inScope(id) && !baselineSet.has(id)).sort(),
    stale: [...baselineSet].filter((id) => inScope(id) && !producedSet.has(id)).sort(),
  }
}

/** An `--only` scope: one vertical, or one adapter in it. */
export interface Scope {
  vertical: string
  slug?: string
}

/**
 * `<vertical>` or `<vertical>/<slug>`, else undefined. Anything looser once
 * probed a vertical, compared its verdicts against nothing and printed OK:
 * `crm/` probed all of crm under an identity prefix (`crm/:`) that matches no
 * identity, and `crm/apollo/x` probed apollo the same way.
 */
export function parseOnly(only: string): Scope | undefined {
  const m = /^([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/.exec(only)
  if (!m) return undefined
  return m[2] === undefined ? { vertical: m[1]! } : { vertical: m[1]!, slug: m[2] }
}

/** Identities an `--only` run is answerable for. */
export function scopeFilter(only: Scope | undefined): (id: string) => boolean {
  if (!only) return () => true
  const prefix = only.slug === undefined ? `${only.vertical}/` : `${only.vertical}/${only.slug}:`
  return (id) => id.startsWith(prefix)
}

export interface Flags {
  soft: boolean
  update: boolean
  report: boolean
  json?: string
  only?: Scope
  error?: string
}

export function parseFlags(argv: readonly string[]): Flags {
  const flags: Flags = { soft: false, update: false, report: false }
  for (const arg of argv) {
    if (arg === '--soft') flags.soft = true
    else if (arg === '--update') flags.update = true
    else if (arg === '--report') flags.report = true
    else if (arg.startsWith('--json=')) flags.json = arg.slice('--json='.length)
    else if (arg.startsWith('--only=')) {
      const raw = arg.slice('--only='.length)
      const scope = parseOnly(raw)
      if (scope) flags.only = scope
      else flags.error ??= `--only takes <vertical> or <vertical>/<slug>, got "${raw}"`
    } else flags.error ??= `Unknown argument ${arg}`
  }
  if (flags.update && flags.only)
    flags.error ??= '--update rewrites the whole baseline and cannot be combined with --only'
  return flags
}

// ── recorder ─────────────────────────────────────────────────────────────

/**
 * The one body every recorded request is answered with. It satisfies the
 * common token and session exchanges so an adapter that logs in first still
 * reaches its list request; as a list response it holds no rows and no
 * cursor, so every walk ends at page 1.
 */
export const STUB_RESPONSE = Object.freeze({
  access_token: 'stub-access-token',
  accessToken: 'stub-access-token',
  token: 'stub-token',
  AuthToken: 'stub-token',
  ticket: 'stub-ticket',
  sessionId: 'stub-session',
  token_type: 'Bearer',
  expires_in: 3600,
})

/**
 * One request a probe answers with something other than STUB_RESPONSE: the
 * documented envelope of a list method's own response, holding no rows.
 * Some adapters were rebuilt to throw on any body but their documented
 * envelope, which the token-shaped stub never is, so without this they
 * would stay unmeasured-error however they page.
 */
export interface StubEnvelope {
  /** The request's HTTP method, upper case. */
  method: string
  /** Tested against the request URL's pathname: host and query are not part of it. */
  path: RegExp
  /** The body. A string is served as text (an XML document); anything else as JSON. */
  body: unknown
}

/** The envelope `envelopes` answers this request with, if any. */
export function envelopeFor(
  envelopes: readonly StubEnvelope[] | undefined,
  method: string,
  url: string,
): StubEnvelope | undefined {
  if (!envelopes || envelopes.length === 0) return undefined
  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return undefined
  }
  const verb = method.toUpperCase()
  return envelopes.find((e) => e.method === verb && e.path.test(pathname))
}

/**
 * Per-identity envelopes, keyed `<vertical>/<slug>:<method>`. Each body is
 * the envelope the adapter's own parser requires, with zero rows, and the
 * comment on each names the parser line it satisfies and the unit-test
 * fixture it mirrors. Every other request of the probe (a token exchange, a
 * lookup) still gets STUB_RESPONSE, and no verdict is special-cased: the
 * method is judged on the values it sends, as every other method is.
 *
 * Left out: logistics/dpd:listCarriers sends no request at all (it pages a
 * static self-descriptor, adapters/dpd/index.ts:142-144), so there is no
 * response to shape.
 *
 * `deadEnvelopes` fails the sweep on an entry whose identity was not probed
 * or whose probe made no matching request, so a renamed method or a moved
 * path cannot leave an entry that silently does nothing.
 */
export const STUB_ENVELOPES: Readonly<Record<string, readonly StubEnvelope[]>> = {
  // Xledger's relay lists read data[root] (adapters/xledger/client.ts:35,
  // index.ts:173,258) and relayPage throws on a missing connection
  // (relay.ts:82). An empty register is the documented `"edges": null` with
  // hasNextPage false (relay.ts:24-25), as
  // tests/.../xledger/paging.test.ts:146-151,253-258 serve it.
  'accounting/xledger:listInvoices': [
    {
      method: 'POST',
      path: /^\/graphql$/,
      body: { data: { arTransactions: { edges: null, pageInfo: { hasNextPage: false } } } },
    },
  ],
  'accounting/xledger:listCreditMemos': [
    {
      method: 'POST',
      path: /^\/graphql$/,
      body: { data: { arTransactions: { edges: null, pageInfo: { hasNextPage: false } } } },
    },
  ],
  'accounting/xledger:listBills': [
    {
      method: 'POST',
      path: /^\/graphql$/,
      body: { data: { apTransactions: { edges: null, pageInfo: { hasNextPage: false } } } },
    },
  ],
  // Customers, then suppliers, from the same endpoint (index.ts:246-262).
  'accounting/xledger:listContacts': [
    {
      method: 'POST',
      path: /^\/graphql$/,
      body: {
        data: {
          customers: { edges: null, pageInfo: { hasNextPage: false } },
          suppliers: { edges: null, pageInfo: { hasNextPage: false } },
        },
      },
    },
  ],
  // Bokio's paged lists require the documented `pagedResponse` + `items`
  // envelope and throw a 502 on anything else (adapters/bokio/index.ts
  // listPage); tests/.../bokio/adapter.test.ts "answers an empty items array"
  // serves this body. The chart of accounts is a documented plain array
  // (listAccounts), served empty as in the same file's 502 test's inverse.
  ...Object.fromEntries(
    (
      [
        ['listInvoices', 'invoices'],
        ['listJournals', 'journal-entries'],
        ['listCreditMemos', 'credit-notes'],
        ['listBills', 'supplier-invoices'],
      ] as const
    ).map(([m, p]) => [
      `accounting/bokio:${m}`,
      [
        {
          method: 'GET',
          path: new RegExp(`^/v1/companies/[^/]*/${p}$`),
          body: { totalItems: 0, totalPages: 0, currentPage: 1, items: [] },
        },
      ],
    ]),
  ),
  // listContacts streams customers then suppliers (pageByRows); an empty
  // customers envelope moves on to suppliers, which must answer too.
  'accounting/bokio:listContacts': ['customers', 'suppliers'].map((p) => ({
    method: 'GET',
    path: new RegExp(`^/v1/companies/[^/]*/${p}$`),
    body: { totalItems: 0, totalPages: 0, currentPage: 1, items: [] },
  })),
  'accounting/bokio:listAccounts': [
    { method: 'GET', path: /^\/v1\/companies\/[^/]*\/chart-of-accounts$/, body: [] },
  ],
  // getListData requires code "200", an array result.content and an integer
  // result.page_last (adapters/barantum/client.ts:43-51); the envelope of
  // tests/.../barantum/adapter.test.ts:108-121 over no rows (page_last 1).
  ...Object.fromEntries(
    ['listContacts', 'listCompanies', 'listDeals', 'listActivities', 'listNotes'].map((m) => [
      `crm/barantum:${m}`,
      [
        {
          method: 'POST',
          path: /^\/api\/get_list_data$/,
          body: {
            code: '200',
            result: {
              total: 0,
              page_total: 1,
              page_last: 1,
              page_first: 1,
              per_page: 20,
              page_current: 1,
              page_previous: 0,
              page_next: 2,
              content: [],
            },
          },
        },
      ],
    ]),
  ),
  // listPage requires rows in result (adapters/bitrix24/client.ts:101-103),
  // here result.categories; tests/.../bitrix24/pipelines.test.ts:124-127 with
  // no funnels, so no stage request follows.
  'crm/bitrix24:listPipelines': [
    {
      method: 'POST',
      path: /^\/rest\/crm\.category\.list$/,
      body: { result: { categories: [] }, total: 0 },
    },
  ],
  // page requires an array `results` (adapters/clientify/client.ts:59-62);
  // tests/.../clientify/paging.test.ts:101-106 over no rows.
  ...Object.fromEntries(
    (
      [
        ['listContacts', 'contacts'],
        ['listCompanies', 'companies'],
        ['listDeals', 'deals'],
        ['listPipelines', 'deals\\/pipelines'],
        ['listActivities', 'tasks'],
      ] as const
    ).map(([m, p]) => [
      `crm/clientify:${m}`,
      [
        {
          method: 'GET',
          path: new RegExp(`^\\/v1\\/${p}\\/$`),
          body: { count: 0, next: null, previous: null, results: [] },
        },
      ],
    ]),
  ),
  // listContacts requires an array `data` and metaData.totalResults equal to
  // its length (adapters/cobra-crm/index.ts:134-149); the envelope of
  // tests/.../cobra-crm/adapter.test.ts:90-98 over no people.
  'crm/cobra-crm:listContacts': [
    {
      method: 'GET',
      path: /^\/v1\/people$/,
      body: {
        data: [],
        message: null,
        metaData: { totalResults: 0, responseTimeStamp: '2024-02-19T08:57:43.041Z' },
        statusCode: 200,
      },
    },
  ],
  // page requires a bare array (adapters/forcemanager/client.ts:123-127);
  // tests/.../forcemanager/adapter.test.ts:63-66 serve a slice of one.
  ...Object.fromEntries(
    (
      [
        ['listContacts', 'contacts'],
        ['listCompanies', 'accounts'],
        ['listDeals', 'opportunities'],
        ['listPipelines', '(?:opportunityTypes|opportunityStatuses)'],
        ['listActivities', 'activities'],
      ] as const
    ).map(([m, p]) => [
      `crm/forcemanager:${m}`,
      [{ method: 'GET', path: new RegExp(`^\\/api\\/v4\\/${p}$`), body: [] }],
    ]),
  ),
  // page requires items and numeric count/from/to (adapters/membrain/client.ts:113-122);
  // tests/.../membrain/adapter.test.ts:91-97 over no rows.
  ...Object.fromEntries(
    (
      [
        ['listContacts', 'contacts'],
        ['listCompanies', 'companies'],
        ['listDeals', 'opportunities'],
        ['listActivities', 'activities'],
        ['listNotes', 'activities'],
      ] as const
    ).map(([m, p]) => [
      `crm/membrain:${m}`,
      [
        {
          method: 'GET',
          path: new RegExp(`^\\/API\\/v2\\/${p}\\/$`),
          body: { count: '0', from: '0', to: '0', items: [] },
        },
      ],
    ]),
  ),
  // salesProcesses requires a bare array (adapters/membrain/index.ts:300-302);
  // tests/.../membrain/adapter.test.ts:80,132 serve an empty one.
  'crm/membrain:listPipelines': [
    { method: 'GET', path: /^\/API\/v2\/salesProcesses\/$/, body: [] },
  ],
  // listPage requires a bare array (adapters/moskit/client.ts:72-78), for each
  // note parent in turn (index.ts:89-93,371); tests/.../moskit/paging.test.ts:34
  // serves empty collections.
  'crm/moskit:listNotes': [
    { method: 'GET', path: /^\/v2\/(?:deals|contacts|companies)$/, body: [] },
  ],
  // listWhole and listDeals require an array `response`
  // (adapters/qontak/index.ts:135-141,278-283); tests/.../qontak/index.test.ts:211
  // over no rows.
  ...Object.fromEntries(
    (
      [
        ['listContacts', 'contacts'],
        ['listCompanies', 'companies'],
        ['listPipelines', 'pipelines'],
        ['listActivities', 'tasks'],
        ['listNotes', 'notes'],
      ] as const
    ).map(([m, p]) => [
      `crm/qontak:${m}`,
      [
        {
          method: 'GET',
          path: new RegExp(`^\\/qontak\\/crm\\/${p}$`),
          body: { response: [], page: 1, total_page: 1, current_data: 0, total_data: 0 },
        },
      ],
    ]),
  ),
  // listAll requires a bare array (adapters/sage-crm/client.ts:90-95);
  // tests/.../sage-crm/index.test.ts:220 serves an empty one.
  ...Object.fromEntries(
    (
      [
        ['listContacts', 'Person'],
        ['listCompanies', 'Company'],
        ['listDeals', 'Opportunity'],
        ['listActivities', 'Communication'],
        ['listNotes', 'Notes'],
      ] as const
    ).map(([m, p]) => [
      `crm/sage-crm:${m}`,
      [{ method: 'GET', path: new RegExp(`^\\/sdata\\/[^/]+\\/sagecrm2\\/-\\/${p}$`), body: [] }],
    ]),
  ),
  // listPipelines requires a bare array (adapters/superoffice/index.ts:371-375);
  // tests/.../superoffice/adapter.test.ts:305 serves an empty one.
  'crm/superoffice:listPipelines': [{ method: 'GET', path: /^\/List\/SaleType\/Items$/, body: [] }],
  // get requires success true and returns `result` (adapters/vtiger/client.ts:42-47);
  // tests/.../vtiger/activities.test.ts:105 over no rows.
  'crm/vtiger:listActivities': [
    { method: 'GET', path: /^\/webservice\.php$/, body: { success: true, result: [] } },
  ],
  // Users/Login requires status 1, result.token and
  // result.preferences.raw_time_zone (adapters/yetiforce/client.ts:131-153), as
  // tests/.../yetiforce/fixtures/login.json:2-18 carries them, and Fields an
  // object result.fields (client.ts:274-277), as tests/.../yetiforce/adapter.test.ts:229
  // serves it; here with no fields, so no sales-process status to page.
  'crm/yetiforce:listPipelines': [
    {
      method: 'POST',
      path: /^\/webservice\/WebservicePremium\/Users\/Login$/,
      body: { status: 1, result: { token: 'stub-token', preferences: { raw_time_zone: 'UTC' } } },
    },
    {
      method: 'GET',
      path: /^\/webservice\/WebservicePremium\/SSalesProcesses\/Fields$/,
      body: { status: 1, result: { fields: {} } },
    },
  ],
  // ── customer-support ──
  // listMessages requires an array data.messages_ids (adapters/edesk/index.ts:143-148);
  // Read Ticket as tests/.../edesk/messages.test.ts:63 serves it, with no ids.
  'customer-support/edesk:listMessages': [
    { method: 'GET', path: /^\/v1\/tickets\/[^/]+$/, body: { data: { messages_ids: [] } } },
  ],
  // dependency requires an array data.<type> (adapters/faveo-helpdesk/index.ts:174-183);
  // tests/.../faveo-helpdesk/adapter.test.ts:113-120 over no rows.
  'customer-support/faveo-helpdesk:listUsers': [
    {
      method: 'GET',
      path: /^\/v3\/api\/dependency\/agents$/,
      body: { success: true, data: { agents: [] } },
    },
  ],
  'customer-support/faveo-helpdesk:listTeams': [
    {
      method: 'GET',
      path: /^\/v3\/api\/dependency\/teams$/,
      body: { success: true, data: { teams: [] } },
    },
  ],
  // documentedRows requires the array under `tag` / `team`
  // (adapters/richpanel/index.ts:86-96); tests/.../richpanel/rebuild.test.ts:64-65.
  'customer-support/richpanel:listTags': [
    { method: 'GET', path: /^\/v1\/tags$/, body: { tag: [] } },
  ],
  'customer-support/richpanel:listTeams': [
    { method: 'GET', path: /^\/v1\/teams$/, body: { team: [] } },
  ],
  // listMessages requires an array `data` of message ids
  // (adapters/sprinklr-service/index.ts:247-254), and an empty one sends no
  // bulk-fetch; tests/.../sprinklr-service/cases-messages.test.ts:21,71.
  'customer-support/sprinklr-service:listMessages': [
    {
      method: 'GET',
      path: /^(?:\/[^/]+)?\/api\/v2\/case\/associated-messages$/,
      body: { data: [] },
    },
  ],
  // listMessages requires an array `comments` (adapters/usedesk/index.ts:199-203);
  // POST /ticket as tests/.../usedesk/rebuild.test.ts:90-96 serves it, with no comments.
  'customer-support/usedesk:listMessages': [
    { method: 'POST', path: /^\/ticket$/, body: { comments: [] } },
  ],
  // listUsers requires a bare array per user_type (adapters/usedesk/index.ts:253-256);
  // tests/.../usedesk/rebuild.test.ts:143-150.
  'customer-support/usedesk:listUsers': [{ method: 'POST', path: /^\/users$/, body: [] }],
  // listTags requires a bare array (adapters/usedesk/index.ts:290-291);
  // tests/.../usedesk/rebuild.test.ts:229-236.
  'customer-support/usedesk:listTags': [{ method: 'POST', path: /^\/tags$/, body: [] }],
  // ── docsign ──
  // fetchAllTemplates requires an array templateList (adapters/a-trust/index.ts:165-169);
  // tests/.../a-trust/templates.test.ts:36-37 over no templates.
  'docsign/a-trust:listTemplates': [
    { method: 'GET', path: /^\/v2\/templates$/, body: { templateList: [] } },
  ],
  // expectArray (adapters/annature/index.ts:75-77) over `envelopes`
  // (index.ts:158), `recipients` (index.ts:212-214), and the bare document and
  // template arrays; tests/.../annature/paging.test.ts:7-16,94-106.
  'docsign/annature:listEnvelopes': [
    { method: 'GET', path: /^\/v2\/envelopes$/, body: { envelopes: [], has_more: false } },
  ],
  'docsign/annature:listSigners': [
    { method: 'GET', path: /^\/v1\/envelopes\/[^/]+$/, body: { recipients: [] } },
  ],
  'docsign/annature:listDocuments': [{ method: 'GET', path: /^\/v1\/documents$/, body: [] }],
  'docsign/annature:listTemplates': [{ method: 'GET', path: /^\/v1\/templates$/, body: [] }],
  // parseConcatenatedJson reads a stream of JSON objects and throws on anything
  // else (adapters/autenti/client.ts:44-60); a stream of no records is the
  // empty text that tests/.../autenti/http.test.ts:74-75 builds over none.
  ...Object.fromEntries(
    (
      [
        ['listSigners', 'parties'],
        ['listDocuments', 'files'],
        ['listAuditTrailEntries', 'actions'],
      ] as const
    ).map(([m, p]) => [
      `docsign/autenti:${m}`,
      [
        {
          method: 'GET',
          path: new RegExp(`^\\/api\\/v2\\/document-processes\\/[^/]+\\/${p}$`),
          body: '',
        },
      ],
    ]),
  ),
  // expectArray (adapters/concord/index.ts:96-97) over `attachments`
  // (index.ts:237) and `activities` (index.ts:349);
  // tests/.../concord/paging.test.ts:16-17,112.
  'docsign/concord:listDocuments': [
    {
      method: 'GET',
      path: /^\/api\/rest\/1\/organizations\/[^/]+\/agreements\/[^/]+\/attachments$/,
      body: { attachments: [] },
    },
  ],
  'docsign/concord:listAuditTrailEntries': [
    {
      method: 'GET',
      path: /^\/api\/rest\/1\/organizations\/[^/]+\/agreements\/[^/]+\/activities$/,
      body: { activities: [] },
    },
  ],
  // signersOf requires an array signersData (adapters/dochub/index.ts:218-223);
  // tests/.../dochub/sign-request-reads.test.ts:12-13,69.
  'docsign/dochub:listSigners': [
    { method: 'GET', path: /^\/api\/v2\/sign-requests\/[^/]+$/, body: { signersData: [] } },
  ],
  // requireArray (adapters/dokobit/index.ts:55-58) over list.json `signings`
  // (index.ts:45,106-107) and status.json `signers` / `files` (index.ts:137-155);
  // tests/.../dokobit/paging.test.ts:83-96 over no signings.
  'docsign/dokobit:listEnvelopes': [
    { method: 'GET', path: /^\/api\/signing\/list\.json$/, body: { status: 'ok', signings: [] } },
  ],
  'docsign/dokobit:listSigners': [
    {
      method: 'GET',
      path: /^\/api\/signing\/[^/]+\/status\.json$/,
      body: { status: 'ok', signers: [], files: [] },
    },
  ],
  'docsign/dokobit:listDocuments': [
    {
      method: 'GET',
      path: /^\/api\/signing\/[^/]+\/status\.json$/,
      body: { status: 'ok', signers: [], files: [] },
    },
  ],
  // unwrap requires IsSuccess true (adapters/emsigner/client.ts:66-75), and
  // AuthorizeApp a Response.AuthToken (client.ts:103-110); the ReturnObject of
  // tests/.../emsigner/transform/fixtures.ts:154-162 as
  // tests/.../emsigner/paging.test.ts:154,176 serve it, with no documents.
  'docsign/emsigner:listEnvelopes': [
    {
      method: 'POST',
      path: /^\/api\/AuthorizeApp$/,
      body: { IsSuccess: true, Messages: [], ErrorCode: 0, Response: { AuthToken: 'stub-token' } },
    },
    {
      method: 'POST',
      path: /^\/api\/GetAllDocuments$/,
      body: { IsSuccess: true, Messages: [], ErrorCode: 0, Response: [] },
    },
  ],
  // The audit log must be a bare array (adapters/eversign/index.ts:254-262);
  // tests/.../eversign/audit-log.test.ts:49.
  'docsign/eversign:listAuditTrailEntries': [
    { method: 'GET', path: /^\/api\/document\/[^/]+\/audit_log$/, body: [] },
  ],
  // The log must be a bare array (adapters/getaccept/index.ts:231-236);
  // tests/.../getaccept/audit-trail.test.ts:38-40.
  'docsign/getaccept:listAuditTrailEntries': [
    { method: 'GET', path: /^\/v1\/documents\/[^/]+\/log$/, body: [] },
  ],
  // versionsPage requires an array `data` (adapters/linksquares/index.ts:208-215);
  // tests/.../linksquares/list-methods.test.ts:80-85 over no versions.
  'docsign/linksquares:listDocuments': [
    {
      method: 'GET',
      path: /^\/api\/finalize\/v2\/agreements\/[^/]+\/agreement_versions$/,
      body: { data: [], total_count: 0, _links: { next: { href: null }, prev: { href: null } } },
    },
  ],
  // envelopeItems requires an array `items` (adapters/nitro-sign/index.ts:176-189);
  // tests/.../nitro-sign/lists.test.ts:57-62.
  'docsign/nitro-sign:listSigners': [
    { method: 'GET', path: /^\/sign\/envelopes\/[^/]+\/participants$/, body: { items: [] } },
  ],
  'docsign/nitro-sign:listDocuments': [
    { method: 'GET', path: /^\/sign\/envelopes\/[^/]+\/documents$/, body: { items: [] } },
  ],
  // GET /template must be a bare array (adapters/signeasy/index.ts:217);
  // tests/.../signeasy/list-rebuild.test.ts:13,76.
  'docsign/signeasy:listTemplates': [{ method: 'GET', path: /^\/v3\/template$/, body: [] }],
  // signersOf requires an array `Signers` (adapters/signhost/index.ts:66-70);
  // tests/.../signhost/paging.test.ts:89 with no signers.
  'docsign/signhost:listSigners': [
    { method: 'GET', path: /^\/api\/transaction\/[^/]+$/, body: { Signers: [] } },
  ],
  'docsign/signhost:listAuditTrailEntries': [
    { method: 'GET', path: /^\/api\/transaction\/[^/]+$/, body: { Signers: [] } },
  ],
  // historyfull as a bare array (adapters/signnow/index.ts:225-227);
  // tests/.../signnow/audit-trail.test.ts:53.
  'docsign/signnow:listAuditTrailEntries': [
    { method: 'GET', path: /^\/document\/[^/]+\/historyfull$/, body: [] },
  ],
  // GET /invitation-template must be an array (adapters/visma-sign/index.ts:255);
  // tests/.../visma-sign/auth.test.ts:63.
  'docsign/visma-sign:listTemplates': [
    { method: 'GET', path: /^\/api\/v1\/invitation-template$/, body: [] },
  ],
  // "List steps" is a bare array (adapters/webdox/index.ts:196-198), and no step
  // means no signers request; tests/.../webdox/paging.test.ts:8,108.
  'docsign/webdox:listSigners': [
    { method: 'GET', path: /^\/api\/v2\/decision_workflows\/[^/]+\/steps$/, body: [] },
  ],
  // Both answer a bare array (adapters/yousign/index.ts:57);
  // tests/.../yousign/rebuild.test.ts:82,110-111.
  'docsign/yousign:listSigners': [
    { method: 'GET', path: /^\/v3\/signature_requests\/[^/]+\/signers$/, body: [] },
  ],
  'docsign/yousign:listDocuments': [
    { method: 'GET', path: /^\/v3\/signature_requests\/[^/]+\/documents$/, body: [] },
  ],
  // ── ecommerce ──
  // call requires code "0" (adapters/alibaba/client.ts:91-95); listCollections
  // pages `data` locally (index.ts:589-595), as
  // tests/.../alibaba/fixtures.ts:365-379 carries it, with no categories.
  'ecommerce/alibaba:listCollections': [
    {
      method: 'POST',
      path: /^\/rest\/alibaba\/icbu\/category\/get\/v2$/,
      body: { msg_code: 'null', code: '0', data: [], success: 'true', message: 'null' },
    },
  ],
  // productPage requires result.total_item (adapters/alibaba/index.ts:298-316);
  // tests/.../alibaba/fixtures.ts:11-13,49 with no products.
  'ecommerce/alibaba:listInventoryLevels': [
    {
      method: 'POST',
      path: /^\/rest\/alibaba\/icbu\/product\/list$/,
      body: { result: { total_item: '0', products: [] }, code: '0' },
    },
  ],
  // call requires success true (adapters/temu/client.ts:124-130) and
  // listProducts reads result.goodsList / total (index.ts:219-228);
  // tests/.../temu/adapter.test.ts:116 with no goods. The path /^\/$/ is a
  // probe artifact, not the documented router path (constants.ts:22): the
  // probe builds TemuAdapter with baseUrl https://example.test, so every
  // call lands on POST /. Temu sends every call to that one endpoint, so
  // the envelope answering all of them is harmless here.
  'ecommerce/temu:listProducts': [
    {
      method: 'POST',
      path: /^\/$/,
      body: {
        success: true,
        errorCode: 1000000,
        errorMsg: '',
        result: { goodsList: [], total: 0 },
      },
    },
  ],
  // get requires a numeric code 0 and a `data` (adapters/wish/client.ts:130-141);
  // tests/.../wish/paging.test.ts:88 over no products.
  'ecommerce/wish:listVariants': [
    { method: 'GET', path: /^\/api\/v3\/products$/, body: { message: '', code: 0, data: [] } },
  ],
  'ecommerce/wish:listInventoryLevels': [
    { method: 'GET', path: /^\/api\/v3\/products$/, body: { message: '', code: 0, data: [] } },
  ],
  // ── projects ──
  // listWorkspaces requires an array `subteams` (adapters/nifty/index.ts:234-245);
  // GetSubTeamsResponse as tests/.../nifty/projects-workspaces.test.ts:10-11 has it.
  'projects/nifty:listWorkspaces': [
    {
      method: 'GET',
      path: /^\/api\/v1\.0\/subteams$/,
      body: { subteams: [], items: false, hasMore: false },
    },
  ],
  // listProjects requires an array `personal` (adapters/seatable/index.ts:209-221);
  // the example of tests/.../seatable/account-lists.test.ts:140-142 with no bases.
  'projects/seatable:listProjects': [
    {
      method: 'GET',
      path: /^\/api\/v2\.1\/user-admin-dtables\/$/,
      body: { personal: [], groups: [] },
    },
  ],
  // get requires status 1 (adapters/tapd/client.ts:72-78) and getList reads
  // `data` (client.ts:86-89); tests/.../tapd/rebuild.test.ts:73.
  'projects/tapd:listUsers': [
    {
      method: 'GET',
      path: /^\/workspaces\/users$/,
      body: { status: 1, data: [], info: 'success' },
    },
  ],
  // flattenPages requires pages.pages.trash (adapters/teamwork-desk/index.ts:95-120);
  // tests/.../teamwork-desk/tasks.test.ts:38-43 with an empty tree.
  'projects/teamwork-desk:listTasks': [
    {
      method: 'GET',
      path: /^\/spaces\/api\/v1\/spaces\/[^/]+\/pages\.json$/,
      body: { pages: { pages: { trash: [] } } },
    },
  ],
  // A queue's tags are a bare array (adapters/yandex-tracker/index.ts:251-256);
  // tests/.../yandex-tracker/tags.test.ts:4,47.
  'projects/yandex-tracker:listTags': [
    { method: 'GET', path: /^\/v3\/queues\/[^/]+\/tags$/, body: [] },
  ],
  // gqlData requires `data` (adapters/zenhub/index.ts:323-327) and
  // listWorkspaces viewer.zenhubOrganizations (index.ts:448-458);
  // tests/.../zenhub/lists.test.ts:198-207 with no organizations.
  'projects/zenhub:listWorkspaces': [
    {
      method: 'POST',
      path: /^\/public\/graphql$/,
      body: {
        data: {
          viewer: {
            zenhubOrganizations: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
          },
        },
      },
    },
  ],
  // parseXml requires a string (adapters/bpost/xml.ts:107) and
  // parseProductConfiguration a <productConfiguration> root (transform/carrier.ts:63);
  // mirrors the fixture's document with no <deliveryMethod>
  // (tests/.../bpost/fixtures.ts:17-18,57).
  'logistics/bpost:listCarriers': [
    {
      method: 'GET',
      path: /^\/services\/shm\/[^/]+\/productconfig$/,
      body: '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>\n<productConfiguration>\n</productConfiguration>',
    },
  ],
  // The client requires code 1 (adapters/flash-express/client.ts:91) and
  // listWarehouses an array `data` (index.ts:236); mirrors the tests' envelope
  // (tests/.../flash-express/reads.test.ts:89).
  'logistics/flash-express:listWarehouses': [
    {
      method: 'POST',
      path: /^\/open\/v1\/warehouses$/,
      body: { code: 1, message: 'success', data: [] },
    },
  ],
  // listWarehouses requires an array `pudos` (adapters/jadlog/index.ts:234);
  // mirrors tests/.../jadlog/adapter.test.ts:34-37.
  'logistics/jadlog:listWarehouses': [
    { method: 'GET', path: /^\/pickup\/address\/pudos$/, body: { pudos: [] } },
  ],
  // requireArray over the bare body (adapters/kitchenhub/index.ts:272-276);
  // mirrors `install(() => [])` in tests/.../kitchenhub/list-methods.test.ts:94.
  'logistics/kitchenhub:listCarriers': [{ method: 'GET', path: /^\/v2\/providers\/$/, body: [] }],
  // requireArray over the bare body (adapters/kitchenhub/index.ts:159-160); an
  // empty page is the chain's documented end (index.ts:152-153).
  'logistics/kitchenhub:listOrders': [{ method: 'GET', path: /^\/v2\/orders\/$/, body: [] }],
  // requireArray over `deliveries` (adapters/kitchenhub/index.ts:57-59,202).
  'logistics/kitchenhub:listShipments': [
    { method: 'GET', path: /^\/v2\/deliveries\/$/, body: { deliveries: [] } },
  ],
  // requireArray over `stores` (adapters/kitchenhub/index.ts:61-64,303).
  'logistics/kitchenhub:listWarehouses': [
    { method: 'GET', path: /^\/v2\/stores\/$/, body: { stores: [] } },
  ],
  // unwrap requires result "1" (adapters/shipmozo/client.ts:73) and
  // listWarehouses an array `data` (index.ts:341); mirrors
  // tests/.../shipmozo/lists.test.ts:87.
  'logistics/shipmozo:listWarehouses': [
    {
      method: 'GET',
      path: /^\/app\/api\/v1\/get-warehouses$/,
      body: { result: '1', message: 'Success', data: [] },
    },
  ],
  // fetchCouriers requires status true and an array `data`
  // (adapters/xpressbees/index.ts:80); mirrors tests/.../xpressbees/fixtures.ts:8-10.
  'logistics/xpressbees:listCarriers': [
    { method: 'GET', path: /^\/api\/courier$/, body: { status: true, data: [] } },
  ],
  // listOrders reads only an array `data` (adapters/nova-poshta/index.ts:422-426);
  // the `data` of tests/.../nova-poshta/orders.test.ts:90 with no rows.
  'logistics/nova-poshta:listOrders': [
    {
      method: 'GET',
      path: /^\/v\.1\.0\/fulfillment\/[^/]+\/v1\/orders\/status$/,
      body: { data: [] },
    },
  ],
  // getCarriers requires a bare array (adapters/packeta/client.ts:140);
  // mirrors serveFeed's `{ data: rows }` in tests/.../packeta/carriers.test.ts:69-73.
  'logistics/packeta:listCarriers': [
    { method: 'GET', path: /^\/v5\/[^/]+\/carrier\/json$/, body: [] },
  ],
  // nextPage requires pagination.current_page and total_pages
  // (adapters/mx/index.ts, nextPage); an empty UsersResponseBody on its only
  // page, the shape of fakeMx's `{ users, pagination }` in
  // tests/.../mx/adapter.test.ts with no rows.
  'payments/mx:listCustomers': [
    {
      method: 'GET',
      path: /^\/users$/,
      body: {
        users: [],
        pagination: { current_page: 1, per_page: 10, total_entries: 0, total_pages: 0 },
      },
    },
  ],
  // The same users page: with no users, listPaymentMethods ends before it
  // asks for any accounts (tests/.../mx/adapter.test.ts, "ends on an empty
  // user list without asking for accounts").
  'payments/mx:listPaymentMethods': [
    {
      method: 'GET',
      path: /^\/users$/,
      body: {
        users: [],
        pagination: { current_page: 1, per_page: 1000, total_entries: 0, total_pages: 0 },
      },
    },
  ],
  // pageList requires an array `results` (adapters/intasend/index.ts, pageList);
  // the DRF page `{ count, next, previous, results }` it documents, empty.
  ...Object.fromEntries(
    (
      [
        ['listBalanceTransactions', /^\/api\/v1\/transactions\/$/],
        ['listCustomers', /^\/api\/v1\/subscriptions-customers\/$/],
        ['listDisputes', /^\/api\/v1\/chargebacks\/$/],
        ['listInvoices', /^\/api\/v1\/invoices\/$/],
        ['listPayouts', /^\/api\/v1\/send-money\/transactions\/$/],
        ['listPlans', /^\/api\/v1\/subscriptions-plans\/$/],
        ['listRefunds', /^\/api\/v1\/chargebacks\/$/],
        ['listSubscriptions', /^\/api\/v1\/subscriptions\/$/],
      ] as const
    ).map(([method, path]) => [
      `payments/intasend:${method}`,
      [{ method: 'GET', path, body: { count: 0, next: null, previous: null, results: [] } }],
    ]),
  ),
  // readPage requires an array `data` (adapters/yoco/index.ts, readPage);
  // PaginatedResponse's required data and next_cursor, empty. With no
  // payouts, listBalanceTransactions asks for no payout entries.
  'payments/yoco:listBalanceTransactions': [
    { method: 'GET', path: /^\/v1\/payouts\/$/, body: { data: [], next_cursor: null } },
  ],
  // fetchPickupLocations reads only an array data.shipping_address
  // (adapters/shiprocket/index.ts:58-59); the data.shipping_address of
  // tests/.../shiprocket/paging.test.ts:168-182 with no rows.
  'logistics/shiprocket:listWarehouses': [
    {
      method: 'GET',
      path: /^\/v1\/external\/settings\/company\/pickup$/,
      body: { data: { shipping_address: [] } },
    },
  ],
}

/**
 * Entries of `table` in scope that did nothing this sweep: no row by that
 * identity, or a row none of whose requests the entry matches.
 */
export function deadEnvelopes(
  table: Readonly<Record<string, readonly StubEnvelope[]>>,
  rows: readonly ProbeRow[],
  inScope: (id: string) => boolean,
): string[] {
  const dead: string[] = []
  for (const [id, envelopes] of Object.entries(table)) {
    if (!inScope(id)) continue
    const row = rows.find((r) => `${r.vertical}/${r.slug}:${r.method}` === id)
    if (!row) {
      dead.push(`${id}: no list method by that identity was probed`)
      continue
    }
    const calls = [row.page1, row.page2, row.page1Again, row.page1Resized, row.page1Ceiling]
    const hit = calls.some((c) =>
      c?.requests.some((q) => envelopeFor(envelopes, q.method, q.url) !== undefined),
    )
    if (!hit)
      dead.push(
        `${id}: no request it made matches ` +
          envelopes.map((e) => `${e.method} ${e.path.source}`).join(' or '),
      )
  }
  return dead.sort()
}

export interface Recorder {
  /** Install as `axios.defaults.adapter`. */
  axiosAdapter: (config: Record<string, unknown>) => Promise<unknown>
  /** Install as `globalThis.fetch`. */
  fetch: typeof fetch
  /**
   * Run `fn`, returning the requests made inside it (and nothing made
   * outside). A request made inside it that one of `envelopes` matches is
   * answered with that envelope's body; every other with STUB_RESPONSE.
   */
  run(
    fn: () => unknown,
    timeoutMs: number,
    envelopes?: readonly StubEnvelope[],
  ): Promise<{ requests: RecordedRequest[]; error: string | null; refused?: boolean }>
  /** Requests made outside any `run` — by a constructor or a timer. */
  stray: RecordedRequest[]
}

function bodyText(data: unknown): string | undefined {
  if (data === undefined || data === null) return undefined
  if (typeof data === 'string') return data
  if (data instanceof URLSearchParams) return data.toString()
  if (data instanceof Uint8Array) return Buffer.from(data).toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  try {
    return JSON.stringify(data)
  } catch {
    return undefined
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Requests are attributed to a probe through AsyncLocalStorage, not a shared
 * "current" slot: a call that timed out can still fire its request later, and
 * that request belongs to it, not to whichever probe is running by then.
 * A probe's envelopes travel in the same store, for the same reason: a late
 * request is answered as its own probe would answer it.
 */
export function createRecorder(
  opts: { getUri?: (config: Record<string, unknown>) => string } = {},
): Recorder {
  const context = new AsyncLocalStorage<{
    requests: RecordedRequest[]
    envelopes?: readonly StubEnvelope[]
  }>()
  const stray: RecordedRequest[] = []
  /** Record `req` and return the body to answer it with. */
  const note = (req: RecordedRequest): unknown => {
    const store = context.getStore()
    if (store) store.requests.push(req)
    else stray.push(req)
    const hit = envelopeFor(store?.envelopes, req.method, req.url)
    return hit ? structuredClone(hit.body) : { ...STUB_RESPONSE }
  }

  const axiosAdapter = async (config: Record<string, unknown>): Promise<unknown> => {
    const url = opts.getUri
      ? opts.getUri(config)
      : new URL(String(config['url'] ?? ''), String(config['baseURL'] ?? 'http://unknown')).href
    const body = bodyText(config['data'])
    const data = note({
      method: String(config['method'] ?? 'get').toUpperCase(),
      url,
      ...(body !== undefined ? { body } : {}),
    })
    return {
      data,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
      request: {},
    }
  }

  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const isRequest = typeof input === 'object' && 'url' in input && !(input instanceof URL)
    const url = isRequest ? (input as Request).url : String(input)
    const method = init?.method ?? (isRequest ? (input as Request).method : 'GET')
    const body = bodyText(init?.body)
    const data = note({
      method: method.toUpperCase(),
      url,
      ...(body !== undefined ? { body } : {}),
    })
    return typeof data === 'string'
      ? new Response(data, { status: 200, headers: { 'content-type': 'application/xml' } })
      : new Response(JSON.stringify(data), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
  }) as typeof fetch

  const run: Recorder['run'] = async (fn, timeoutMs, envelopes) => {
    const requests: RecordedRequest[] = []
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs)
    })
    try {
      const done = context.run({ requests, ...(envelopes ? { envelopes } : {}) }, async () => {
        await fn()
        return 'done' as const
      })
      const outcome = await Promise.race([done, timeout])
      return {
        requests: [...requests],
        error: outcome === 'timeout' ? `timed out after ${timeoutMs}ms` : null,
      }
    } catch (err) {
      return {
        requests: [...requests],
        error: errorText(err),
        ...(isRefusal(err) ? { refused: true } : {}),
      }
    } finally {
      clearTimeout(timer)
    }
  }

  return { axiosAdapter, fetch: fetchStub, run, stray }
}

// ── probing one method ───────────────────────────────────────────────────

export interface ProbeDeps {
  recorder: Pick<Recorder, 'run'>
  parseListQuery: (query: Record<string, string>) => unknown
  resetCursorPager: () => void
  cursorPagerSize: () => number
  /**
   * Shared's `readUpstreamPage`: what the adapter reported into each call's
   * page sink — a `pageSize` below the limit, and `pagedLocally`.
   */
  readUpstreamPage: (params: never) => { pageSize?: number; pagedLocally?: boolean } | undefined
  credentials: unknown
  /** Arguments between `credentials` and `params`, e.g. a parent record id. */
  leadingArgs?: readonly unknown[]
  timeoutMs?: number
  /** This identity's STUB_ENVELOPES entry, handed to every call of the probe. */
  envelopes?: readonly StubEnvelope[]
  callerLimit?: number
  resizedLimit?: number
  ceilingLimit?: number
}

/**
 * Call `method` for page 1, page 2, page 1 again, then page 1 at the resized
 * limit and at the ceiling limit, recording what each call sends. Page 2 sits
 * between the two page-1 calls so a clock-derived value that ticked between page 1 and page 2 also
 * differs between the two page-1 calls — and is masked as volatile instead of
 * passing for a page move.
 */
export async function probeMethod(
  adapter: object,
  method: string,
  deps: ProbeDeps,
): Promise<Pick<ProbeRow, 'page1' | 'page1Again' | 'page2' | 'page1Resized' | 'page1Ceiling'>> {
  const fn = (adapter as Record<string, unknown>)[method]
  if (typeof fn !== 'function') throw new Error(`${method} is not a function on this adapter`)
  const limit = deps.callerLimit ?? CALLER_LIMIT
  const timeoutMs = deps.timeoutMs ?? CALL_TIMEOUT_MS
  deps.resetCursorPager()
  const once = async (page: number, size = limit): Promise<ProbeCall> => {
    const params = deps.parseListQuery({ limit: String(size), page: String(page) })
    const { requests, error, refused } = await deps.recorder.run(
      () => fn.call(adapter, deps.credentials, ...(deps.leadingArgs ?? []), params),
      timeoutMs,
      deps.envelopes,
    )
    const reported = deps.readUpstreamPage(params as never)
    return {
      requests,
      error,
      usedPager: deps.cursorPagerSize() > 0,
      ...(typeof reported?.pageSize === 'number' ? { reportedPageSize: reported.pageSize } : {}),
      ...(reported?.pagedLocally === true ? { pagedLocally: true } : {}),
      ...(refused === true ? { refused: true } : {}),
    }
  }
  const page1 = await once(1)
  const page2 = await once(2)
  const page1Again = await once(1)
  const page1Resized = await once(1, deps.resizedLimit ?? RESIZED_LIMIT)
  const page1Ceiling = await once(1, deps.ceilingLimit ?? CEILING_LIMIT)
  return { page1, page1Again, page2, page1Resized, page1Ceiling }
}

// ── the sweep ────────────────────────────────────────────────────────────

export interface ListSignature {
  method: string
  /** Parameter names between `credentials` and `params`. */
  leading: string[]
}

/**
 * Every `list*` member an `adapter/interface.ts` declares, with the parent-id
 * parameters some take before `params` (`listTasks(credentials, projectId,
 * params)`). Multi-line signatures are read to their closing parenthesis.
 */
export function listSignatures(source: string): ListSignature[] {
  const out: ListSignature[] = []
  const re = /^ {2}(list\w*)\??\s*\(/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    let depth = 1
    let i = re.lastIndex
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++
      else if (source[i] === ')') depth--
      i++
    }
    const names = source
      .slice(re.lastIndex, i - 1)
      .split(',')
      .map((p) => p.trim().split(/[?:\s]/)[0]!)
      .filter(Boolean)
    const at = names.indexOf('params')
    if (at < 1) continue
    out.push({ method: m[1]!, leading: names.slice(1, at) })
  }
  return out
}

/** Constructor config: the scope-override test's stubs, plus hosts a few factories insist on. */
const STUB_CONFIG = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'https://example.test/callback',
  scopes: ['default-scope-a', 'default-scope-b'],
  shop: 'test.myshopify.com',
  tenantId: 'common',
  apiKey: 'test-api-key',
  apiSecret: 'test-api-secret',
  baseUrl: 'https://example.test',
}

/**
 * A plausible string for any `credentials.extra` key the table below does not
 * name — a merchant id, a partner key, a store name — so an adapter that
 * insists on one still reaches its list request instead of going unmeasured.
 */
function stubExtraValue(key: string): string {
  if (/(url|endpoint)$/i.test(key)) return `https://${key.toLowerCase()}.example.test`
  if (/(host|domain)$/i.test(key)) return `${key.toLowerCase()}.example.test`
  return `stub-${key}`
}

/** Per-connection values adapters most often read from `credentials.extra`. */
const KNOWN_EXTRA: Record<string, unknown> = {
  baseUrl: 'https://api.example.test',
  instanceUrl: 'https://instance.example.test',
  serverUrl: 'https://server.example.test',
  siteUrl: 'https://site.example.test',
  host: 'host.example.test',
  domain: 'domain.example.test',
  subdomain: 'stub',
  site: 'stub',
  shop: 'test.myshopify.com',
  region: 'us',
  environment: 'sandbox',
  env: 'sandbox',
  dataCentre: 'us',
  dataCenter: 'us',
  // Optional with a working default; any stub is worse than none.
  apiDomain: undefined,
  sapClient: undefined,
  clientId: 'stub-client-id',
  clientSecret: 'stub-client-secret',
  apiKey: 'stub-api-key',
  apiSecret: 'stub-api-secret',
  appKey: 'stub-app-key',
  appSecret: 'stub-app-secret',
  consumerKey: 'stub-consumer-key',
  consumerSecret: 'stub-consumer-secret',
  secretKey: 'stub-secret-key',
  username: 'stub-user',
  password: 'stub-password',
  email: 'stub@example.test',
  account: 'stub-account',
  accountId: 'stub-account-id',
  accountName: 'stub-account',
  company: 'stub-company',
  companyId: 'stub-company-id',
  organizationId: 'stub-org-id',
  tenant: 'stub-tenant',
  userId: 'stub-user-id',
  country: 'US',
  domainPrefix: 'stub',
  // Odoo's shared client speaks the API the connection names; 'json2' is Odoo 19+.
  apiVersion: 'json2',
  token: 'stub-token',
  // Nitro Sign throws before any request unless this is one of its documented
  // regional hosts exactly (adapters/nitro-sign/client.ts:82-95), so the stub
  // is the first of the adapter's own allowlist, not a made-up host.
  signApiBaseUrl: NITRO_SIGN_API_HOSTS[0],
}

const STUB_EXTRA = new Proxy(KNOWN_EXTRA, {
  get(target, key) {
    if (typeof key !== 'string' || key in target) return Reflect.get(target, key)
    // Never look like a thenable or a serialisation hook.
    if (key === 'then' || key === 'toJSON') return undefined
    return stubExtraValue(key)
  },
})

const STUB_CREDENTIALS = {
  accessToken: 'stub-access-token',
  refreshToken: 'stub-refresh-token',
  expiresAt: new Date('2099-01-01T00:00:00Z'),
  scope: 'stub-scope',
  // Numeric: QuickBooks refuses a non-numeric realmId before any request, and
  // no adapter rejects a numeric one.
  tenantId: '1234567890',
  extra: STUB_EXTRA,
}

const STUB_PARENT_ID = 'stub-parent-id'

// Odoo record ids are positive integers and Salesforce ids are 15 or 18
// base-62 characters. Those adapters 404 any other parent before a request,
// which would leave their child lists unmeasured.
const STUB_PARENT_IDS: Readonly<Record<string, string>> = {
  'customer-support/odoo-helpdesk': '1',
  'customer-support/salesforce-service': '500D000000IRFmaIAH',
  'docsign/odoo-sign': '1',
  'projects/odoo-project': '1',
}

export class HarnessError extends Error {}

interface AxiosLike {
  defaults: { adapter: unknown }
  getUri: (config: unknown) => string
}

interface Shared {
  parseListQuery: (query: Record<string, string>) => unknown
  declaredPageMax: (adapter: object) => number | undefined
  readUpstreamPage: (params: never) => { pageSize?: number; pagedLocally?: boolean } | undefined
  withPageSink: (params: { page?: number; limit?: number }) => unknown
  pageLocally: (rows: readonly unknown[], params: never) => unknown[]
  pageByRows: (
    key: string,
    params: never,
    fetch: (cursor: unknown) => Promise<{ items: unknown[]; next?: unknown }>,
  ) => Promise<unknown>
  _resetCursorPager: () => void
  _cursorPagerSize: () => number
  setDnsResolver: (resolver: (host: string) => Promise<Array<{ address: string }>>) => void
}

/**
 * What the sweep needs from `@opensteward/shared`'s built `dist`.
 * `declaredPageMax` is not called: it ships with what the gate reads back (a
 * reported `pageSize`), and a dist that predates it would report nothing and
 * turn every adapter that reports its size into a regression. `pageLocally`
 * and `pageByRows` are called once each, by `stalePagedLocallyReporters`.
 */
export const REQUIRED_SHARED_EXPORTS = [
  'parseListQuery',
  'declaredPageMax',
  'readUpstreamPage',
  'withPageSink',
  'pageLocally',
  'pageByRows',
  '_resetCursorPager',
  '_cursorPagerSize',
  'setDnsResolver',
] as const

/** The required exports a loaded `@opensteward/shared` lacks: non-empty means a stale dist. */
export function missingSharedExports(shared: unknown): string[] {
  const loaded = (shared ?? {}) as Record<string, unknown>
  return REQUIRED_SHARED_EXPORTS.filter((name) => typeof loaded[name] !== 'function')
}

/**
 * The shared pagers that do not report `pagedLocally` when they page: [] for
 * a current dist. A name check cannot see this. A dist built before the flag
 * took its name exports every helper the gate needs, but its pagers report
 * the old one, so every method they page would read as its request verdict
 * (first-page-only, page-ignored) and fail as new, or be banked by an
 * `--update`, instead of being refused as stale.
 */
export async function stalePagedLocallyReporters(
  shared: Pick<Shared, 'withPageSink' | 'readUpstreamPage' | 'pageLocally' | 'pageByRows'>,
): Promise<string[]> {
  const stale: string[] = []
  const sliced = shared.withPageSink({ page: 1, limit: 1 })
  shared.pageLocally([1, 2], sliced as never)
  if (shared.readUpstreamPage(sliced as never)?.pagedLocally !== true) stale.push('pageLocally')
  const walked = shared.withPageSink({ page: 1, limit: 1 })
  await shared.pageByRows('check-paging-contract::self-test', walked as never, async () => ({
    items: [1, 2],
    next: null,
  }))
  if (shared.readUpstreamPage(walked as never)?.pagedLocally !== true) stale.push('pageByRows')
  return stale
}

/**
 * The probe's hooks into a loaded `@opensteward/shared`: how it builds each
 * call's params, resets and reads the cursor pager, and reads back what the
 * adapter reported (`pageSize`, `pagedLocally`). The sweep wires every probe
 * through this, and the tests drive it with shared's own source.
 */
export function sharedProbeDeps(
  shared: Pick<
    Shared,
    'parseListQuery' | 'readUpstreamPage' | '_resetCursorPager' | '_cursorPagerSize'
  >,
): Pick<ProbeDeps, 'parseListQuery' | 'readUpstreamPage' | 'resetCursorPager' | 'cursorPagerSize'> {
  return {
    parseListQuery: shared.parseListQuery,
    readUpstreamPage: shared.readUpstreamPage,
    resetCursorPager: shared._resetCursorPager,
    cursorPagerSize: shared._cursorPagerSize,
  }
}

export interface SweepResult {
  rows: ProbeRow[]
  /** `<vertical>/<slug>:ctor` → the constructor's error. */
  ctorErrors: Map<string, string>
  /** Sockets and DNS lookups that got past the recorder and were refused. */
  escapes: string[]
  strayRequests: number
  asyncErrors: number
  adapters: number
}

/**
 * Refuse every socket and DNS lookup, recording each in `escapes`, until the
 * returned function restores them (the sweep never does: it exits). The
 * recorder should see every request; one that reaches the network instead
 * means the recorder is not wired into the adapters' axios or fetch, and the
 * sweep would otherwise report that adapter as sending nothing.
 */
export function blockNetwork(escapes: string[]): () => void {
  const saved = {
    connect: net.Socket.prototype.connect,
    lookup: dns.lookup,
    lookupAsync: dns.promises.lookup,
  }
  const refuse = (what: string): Error => {
    escapes.push(what)
    return new Error(`check:paging-contract refused ${what}: requests must go through the recorder`)
  }
  net.Socket.prototype.connect = function connect(this: net.Socket, ...args: unknown[]) {
    // Node's own callers pass the normalised `[options, callback]` array.
    const first = Array.isArray(args[0]) ? args[0][0] : args[0]
    const target = first as { host?: string; port?: number; path?: string } | number | string
    const where =
      typeof target === 'object' && target !== null
        ? (target.path ?? `${target.host ?? 'localhost'}:${target.port}`)
        : String(target)
    this.destroy(refuse(`a socket to ${where}`))
    return this
  } as typeof net.Socket.prototype.connect
  const refuseLookup = (host: unknown, ...rest: unknown[]): void => {
    const cb = rest.find((a) => typeof a === 'function') as ((err: Error) => void) | undefined
    const err = refuse(`a DNS lookup of ${String(host)}`)
    if (cb) process.nextTick(cb, err)
  }
  dns.lookup = refuseLookup as unknown as typeof dns.lookup
  dns.promises.lookup = (async (host: string) => {
    throw refuse(`a DNS lookup of ${host}`)
  }) as typeof dns.promises.lookup
  return () => {
    net.Socket.prototype.connect = saved.connect
    dns.lookup = saved.lookup
    dns.promises.lookup = saved.lookupAsync
  }
}

export async function sweep(
  opts: { only?: Scope; timeoutMs?: number; log?: (line: string) => void } = {},
): Promise<SweepResult> {
  const log = opts.log ?? (() => {})
  // The same module instances the adapters resolve — NOT the script's own
  // `axios`, which reaches a hoisted copy only by accident of pnpm layout. A
  // second instance would leave the adapters on the real HTTP adapter.
  const appRequire = createRequire(join(APP_ROOT, 'package.json'))
  let axios: AxiosLike
  let shared: Shared
  try {
    axios = appRequire('axios')
    shared = appRequire('@opensteward/shared')
  } catch (err) {
    throw new HarnessError(
      `could not load axios or @opensteward/shared from apps/integration-server: ${errorText(err)}\n` +
        'Build shared first: pnpm --filter "@opensteward/shared..." run build',
    )
  }
  const missing = missingSharedExports(shared)
  if (missing.length > 0)
    throw new HarnessError(
      `@opensteward/shared has no ${missing.map((n) => `${n}()`).join(', ')} — its dist is stale. ` +
        'Rebuild: pnpm --filter "@opensteward/shared..." run build',
    )
  const silent = await stalePagedLocallyReporters(shared)
  if (silent.length > 0)
    throw new HarnessError(
      `@opensteward/shared's ${silent.map((n) => `${n}()`).join(' and ')} ` +
        `${silent.length === 1 ? 'does' : 'do'} not report pagedLocally — its dist is stale. ` +
        'Rebuild: pnpm --filter "@opensteward/shared..." run build',
    )

  // axios ships a CJS and an ESM build, and each keeps its own `defaults`.
  // Adapters `import axios from 'axios'` (compiled to require → CJS), but an
  // adapter that does `await import('axios')` gets the ESM build, so the
  // recorder goes on both. The ESM entry is read from axios's exports map and
  // resolved from the app, the same file the adapters' import resolves to.
  let axiosEsm: AxiosLike
  try {
    const pkgPath = appRequire.resolve('axios/package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      exports: { '.': { default: { default: string } } }
    }
    const entry = join(dirname(pkgPath), pkg.exports['.'].default.default)
    axiosEsm = ((await import(pathToFileURL(entry).href)) as { default: AxiosLike }).default
  } catch (err) {
    throw new HarnessError(`could not load the ESM build of axios: ${errorText(err)}`)
  }

  const escapes: string[] = []
  blockNetwork(escapes)
  const recorder = createRecorder({ getUri: (config) => axios.getUri(config) })
  // Before any factories.ts is required: an adapter that creates its axios
  // instance at module load copies the defaults as they are at that moment.
  axios.defaults.adapter = recorder.axiosAdapter
  axiosEsm.defaults.adapter = recorder.axiosAdapter
  globalThis.fetch = recorder.fetch
  shared.setDnsResolver(async () => [{ address: '93.184.216.34' }])

  // Adapter code fires and forgets; a stray rejection or a refused socket's
  // late 'error' must not kill the sweep. Left installed: the process exits
  // explicitly once the verdicts are printed.
  let asyncErrors = 0
  const onAsyncError = (): void => {
    asyncErrors++
  }
  process.on('unhandledRejection', onAsyncError)
  process.on('uncaughtException', onAsyncError)

  const onlySlug = opts.only?.slug
  const verticals = opts.only ? VERTICALS.filter((v) => v === opts.only!.vertical) : VERTICALS
  if (verticals.length === 0)
    throw new HarnessError(`--only names no vertical: ${opts.only!.vertical}`)

  const rows: ProbeRow[] = []
  const ctorErrors = new Map<string, string>()
  let adapters = 0
  for (const vertical of verticals) {
    const loadStarted = Date.now()
    const dir = join(APP_ROOT, 'src/verticals', vertical, 'adapter')
    const signatures = listSignatures(readFileSync(join(dir, 'interface.ts'), 'utf8'))
    const { ADAPTER_FACTORIES } = appRequire(join(dir, 'factories.ts')) as {
      ADAPTER_FACTORIES: Record<string, (config: unknown) => object>
    }
    const slugs = Object.keys(ADAPTER_FACTORIES)
      .filter((s) => !onlySlug || s === onlySlug)
      .sort()
    if (onlySlug && slugs.length === 0)
      throw new HarnessError(`--only names no adapter: ${vertical}/${onlySlug}`)
    const probeStarted = Date.now()
    for (const slug of slugs) {
      adapters++
      let adapter: object
      try {
        adapter = ADAPTER_FACTORIES[slug]!(STUB_CONFIG)
      } catch (err) {
        ctorErrors.set(`${vertical}/${slug}:ctor`, errorText(err))
        continue
      }
      for (const { method, leading } of signatures) {
        if (typeof (adapter as Record<string, unknown>)[method] !== 'function') continue
        const calls = await probeMethod(adapter, method, {
          recorder,
          ...sharedProbeDeps(shared),
          credentials: STUB_CREDENTIALS,
          leadingArgs: leading.map(() => STUB_PARENT_IDS[`${vertical}/${slug}`] ?? STUB_PARENT_ID),
          timeoutMs: opts.timeoutMs ?? CALL_TIMEOUT_MS,
          envelopes: STUB_ENVELOPES[`${vertical}/${slug}:${method}`],
        })
        rows.push(probeRow(adapter, { vertical, slug, method }, calls))
      }
    }
    const secs = (from: number, to: number): string => ((to - from) / 1000).toFixed(1)
    log(
      `  ${vertical.padEnd(17)} ${String(slugs.length).padStart(4)} adapters: loaded in ` +
        `${secs(loadStarted, probeStarted)}s, probed in ${secs(probeStarted, Date.now())}s`,
    )
  }
  return { rows, ctorErrors, escapes, strayRequests: recorder.stray.length, asyncErrors, adapters }
}

// ── main ─────────────────────────────────────────────────────────────────

function readBaseline(path: string): string[] {
  if (!existsSync(path)) {
    console.log(`  ${path} is missing; comparing against an empty baseline.`)
    return []
  }
  return JSON.parse(readFileSync(path, 'utf8')) as string[]
}

function writeBaseline(path: string, ids: readonly string[]): void {
  writeFileSync(path, JSON.stringify([...new Set(ids)].sort(), null, 2) + '\n')
}

function printList(title: string, ids: readonly string[]): void {
  console.error(`\n${title}`)
  for (const id of ids.slice(0, 25)) console.error(`  ${id}`)
  if (ids.length > 25) console.error(`  ... and ${ids.length - 25} more`)
}

function printReport(rows: readonly ProbeRow[], verdicts: ReadonlyMap<ProbeRow, Verdict>): void {
  const short: Record<Verdict, string> = {
    ok: 'ok',
    refused: 'refused',
    'single-page': 'single',
    'local-page': 'local',
    'page-ignored': 'ignored',
    'page-ignored-unsized': 'ign-unsz',
    'page1-skips': 'skips',
    'page-stride': 'stride',
    'first-page-only': '1st-only',
    'over-asks': 'over',
    'fixed-size': 'fixed',
    'unmeasured-no-request': 'no-req',
    'unmeasured-error': 'error',
    'unmeasured-no-size': 'no-size',
  }
  const header = VERDICTS.map((v) => short[v].padStart(11)).join('')
  console.log(`\n  ${'methods (adapters)'.padEnd(18)}${header}`)
  const byVertical = new Map<string, ProbeRow[]>()
  for (const r of rows) byVertical.set(r.vertical, [...(byVertical.get(r.vertical) ?? []), r])
  for (const [vertical, list] of [...byVertical, ['all', rows] as const]) {
    const cells = VERDICTS.map((v) => {
      const hits = list.filter((r) => verdicts.get(r) === v)
      const slugs = new Set(hits.map((r) => `${r.vertical}/${r.slug}`))
      return `${hits.length}(${slugs.size})`.padStart(11)
    })
    console.log(`  ${vertical.padEnd(18)}${cells.join('')}`)
  }
}

/** `--report` only: what the declared-max invariant saw but does not fail. */
function printDeclaredMaxReport(d: DeclaredMaxResult): void {
  const byAdapter = new Map<string, DeclaredMaxFinding[]>()
  for (const f of d.unpaged) {
    const adapter = f.id.slice(0, f.id.indexOf(':'))
    byAdapter.set(adapter, [...(byAdapter.get(adapter) ?? []), f])
  }
  console.log(
    `\n  Declared-max adapters with unpaged methods (${byAdapter.size}; not violations: a repeated ` +
      "full page trips the sync's identical-page detector, and a whole list is a real end):",
  )
  for (const [adapter, list] of byAdapter) {
    const methods = list.map((f) => `${f.id.slice(f.id.indexOf(':') + 1)} ${f.verdict}`)
    console.log(`    ${adapter} (maxPageSize ${list[0]!.declaredMax}): ${methods.join(', ')}`)
  }
  if (d.unmeasured.length > 0) {
    console.log(
      `\n  Declared-max methods the probe could not measure (${d.unmeasured.length}; the ` +
        'invariant cannot judge them):',
    )
    for (const f of d.unmeasured) console.log(`    ${f.id} ${f.verdict}`)
  }
  if (d.allowed.length > 0) {
    console.log('\n  Declared-max violations allowlisted as gate false positives:')
    for (const f of d.allowed)
      console.log(`    ${describeViolation(f)}\n      ${DECLARED_MAX_ALLOWLIST[f.id]}`)
  }
}

/** Print what fails the declared-max invariant (`declaredMaxFailed` decides). */
function printDeclaredMaxFailures(d: DeclaredMaxResult): void {
  if (d.violations.length > 0) {
    // Every one, untruncated: the target is zero, so the list is the to-do.
    console.error(
      `\n${d.violations.length} list method(s) break the maxPageSize their adapter declares ` +
        '(no baseline and no ratchet: the target is zero):',
    )
    for (const f of d.violations) console.error(`  ${describeViolation(f)}`)
    console.error(
      '\nThe sync worker asks a declared-max adapter for pages of min(500, maxPageSize) and\n' +
        'takes a shorter page as the end of the collection. Each method above makes a short or\n' +
        'missing page that is not the end. Page it at the requested size (clamped to the\n' +
        'maximum), report its own end with reportUpstreamPage(params, { hasMore }), or refuse\n' +
        "before sending anything with statusCode 501, code 'NOT_SUPPORTED'. A window that\n" +
        "serves exactly the caller's rows out of larger upstream pages reports { pagedLocally:\n" +
        'true }, with a test that proves it, listed in LOCAL_PAGE_REPORTERS. Any other gate\n' +
        'false positive goes in DECLARED_MAX_ALLOWLIST in scripts/check-paging-contract.ts,\n' +
        'with a reason.',
    )
  }
  if (d.staleAllowlist.length > 0)
    printList(
      `${d.staleAllowlist.length} DECLARED_MAX_ALLOWLIST entr${d.staleAllowlist.length === 1 ? 'y no longer names' : 'ies no longer name'} a violation — remove ${d.staleAllowlist.length === 1 ? 'it' : 'them'}:`,
      d.staleAllowlist,
    )
  if (d.malformedAllowlist.length > 0)
    printList('DECLARED_MAX_ALLOWLIST is malformed:', d.malformedAllowlist)
}

/**
 * Why a sweep's verdicts cannot be trusted at all, or [] when they can. Each
 * one means the harness, not the adapters, is broken — a sweep that measured
 * nothing proves nothing — so it fails even under `--soft` and refuses
 * `--update`. The coverage floor applies to a full sweep only: one vertical's
 * share varies too much (docsign's unpaginated sub-resources put it near a
 * third) for any fixed floor to fit every `--only` run. So does the
 * declared-max check: dozens of adapters declare `maxPageSize`, so a full
 * sweep that saw none has stopped reading it, and the invariant judged
 * nothing; one vertical or adapter may legitimately declare none.
 *
 * A `local-page` row is not coverage, but it does prove the harness ran the
 * method and read its report, so a sweep of adapters that all page locally
 * (`--only=ecommerce/eposnow`) has measured something. The floor still
 * counts measured rows only, over the methods that did not refuse
 * (`coverageShare`). A refusal alone does not prove the harness measured
 * anything: a sweep of nothing but refusals still fails.
 */
export function harnessProblems(h: {
  escapes: readonly string[]
  measured: number
  /** Probed list methods read as `local-page`. */
  local?: number
  /** Probed list methods read as `refused`: left out of the share entirely. */
  refused?: number
  total: number
  /** Probed list methods whose adapter declares `maxPageSize`. */
  declared: number
  only?: Scope
}): string[] {
  const problems: string[] = []
  if (h.escapes.length > 0)
    problems.push(
      `${h.escapes.length} network attempt(s) got past the recorder (first: ${h.escapes[0]}). ` +
        "The recorder is not installed on the adapters' axios/fetch.",
    )
  const share = coverageShare(h.measured, h.total, h.refused ?? 0)
  if (h.measured === 0 && (h.local ?? 0) === 0)
    problems.push('no list method was measured or paged locally.')
  else if (!h.only && share < MIN_MEASURED_SHARE)
    problems.push(
      `only ${(share * 100).toFixed(1)}% of list methods were measured ` +
        `(floor ${MIN_MEASURED_SHARE * 100}%). If an adapter change really cost that much ` +
        'coverage, add stubs for what it now needs rather than lowering the floor.',
    )
  if (!h.only && h.total > 0 && h.declared === 0)
    problems.push(
      'no probed adapter declares capabilities.maxPageSize, so the declared-max invariant ' +
        'judged nothing. Dozens do: the sweep has stopped reading it (see probeRow).',
    )
  return problems
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  if (flags.error) {
    console.error(flags.error)
    return 2
  }

  const started = Date.now()
  let result: SweepResult
  try {
    result = await sweep({ only: flags.only, log: (line) => console.log(line) })
  } catch (err) {
    if (!(err instanceof HarnessError)) throw err
    console.error(`\ncheck:paging-contract could not run: ${err.message}`)
    return 1
  }
  const { rows, ctorErrors } = result
  const verdicts = new Map(rows.map((r) => [r, classify(r, CALLER_LIMIT)] as const))

  const failing = rows
    .filter((r) => FAILING.has(verdicts.get(r)!))
    .map((r) => identity(r, verdicts.get(r)!))
  const unmeasured = [
    ...rows.filter((r) => UNMEASURED.has(verdicts.get(r)!)).map(unmeasuredIdentity),
    ...ctorErrors.keys(),
  ]
  const clamps = rows.map((r) => clampIdentity(r)).filter((id): id is string => id !== undefined)
  const measured = rows.filter((r) => isMeasured(verdicts.get(r)!)).length
  const unsized = rows.filter((r) => verdicts.get(r) === 'page-ignored-unsized').length
  const local = rows.filter((r) => verdicts.get(r) === 'local-page').length
  const refused = rows.filter((r) => verdicts.get(r) === 'refused').length
  const measurable = rows.length - refused

  if (flags.json) {
    const dump = rows.map((r) => ({ ...r, verdict: verdicts.get(r) }))
    writeFileSync(
      flags.json,
      JSON.stringify({ rows: dump, ctorErrors: Object.fromEntries(ctorErrors) }, null, 2),
    )
    console.log(`  wrote ${rows.length} rows to ${flags.json}`)
  }
  if (flags.report) printReport(rows, verdicts)

  const counts = VERDICTS.map((v) => `${v} ${rows.filter((r) => verdicts.get(r) === v).length}`)
  console.log(
    `\nPaging contract: ${rows.length} list methods on ${result.adapters} adapters ` +
      `(${ctorErrors.size} constructor errors) in ${((Date.now() - started) / 1000).toFixed(1)}s.`,
  )
  console.log(`  ${counts.join(', ')}`)
  const pct = (n: number): string => (coverageShare(n, rows.length, refused) * 100).toFixed(1)
  console.log(
    `Coverage: ${measured} of ${measurable} list methods measured (${pct(measured)}%): ` +
      'a size that follows the limit, a position, or page 2 declining to ask.',
  )
  if (refused > 0)
    console.log(
      `  Left out: ${refused} refused — they throw statusCode 501, code NOT_SUPPORTED before ` +
        'sending anything, on every probe call, and serve no rows, so they are neither ' +
        `coverage nor a gap in it (${rows.length} list methods in all).`,
    )
  // Named, not only counted: refused sits in no baseline, so a method that
  // went from ok to a refusal would otherwise move nothing but this number.
  if (refused > 0)
    printList(
      `${refused} refused list method(s), each one a list the platform cannot serve:`,
      rows.filter((r) => verdicts.get(r) === 'refused').map(unmeasuredIdentity),
    )
  if (unsized > 0)
    console.log(
      `  Not counted: ${unsized} (${pct(unsized)}%) page-ignored-unsized — page 2 repeats a ` +
        'request that carries no size, which may be an unpaginated fetch or only a lookup ' +
        'that found nothing to list. They fail, but they are not coverage.',
    )
  if (local > 0)
    console.log(
      `  Not counted: ${local} (${pct(local)}%) local-page — they pass on the adapter's own ` +
        'pagedLocally report, which the gate takes on trust; their unit tests are the net.',
    )
  console.log(
    `Page sizes: ${rows.filter((r) => sizeAtCeiling(r) !== undefined).length} list methods ` +
      `read at limit ${CEILING_LIMIT}; ${clamps.length} send less than the router asks for.`,
  )
  if (result.strayRequests > 0 || result.asyncErrors > 0)
    console.log(
      `  ${result.strayRequests} request(s) made outside a probe and ${result.asyncErrors} ` +
        'unhandled async error(s) from adapter code were ignored.',
    )

  const declaredRows = rows.filter((r) => r.declaredMax !== undefined)
  const harness = harnessProblems({
    escapes: result.escapes,
    measured,
    local,
    refused,
    total: rows.length,
    declared: declaredRows.length,
    only: flags.only,
  })
  if (harness.length > 0) {
    console.error('\ncheck:paging-contract is not measuring the adapters:')
    for (const h of harness) console.error(`  - ${h}`)
    console.error(
      'Is packages/shared/dist current? pnpm --filter "@opensteward/shared..." run build',
    )
    return 1
  }

  const inScope = scopeFilter(flags.only)
  // A stale entry is a harness fault, not a verdict: it fails --soft as well.
  const dead = deadEnvelopes(STUB_ENVELOPES, rows, inScope)
  if (dead.length > 0) {
    console.error('\ncheck:paging-contract has STUB_ENVELOPES entries that answered nothing:')
    for (const d of dead) console.error(`  - ${d}`)
    console.error('Rename or remove the entry to match the adapter it was written for.')
    return 1
  }
  const declared = checkDeclaredMax(rows, (r) => verdicts.get(r)!, DECLARED_MAX_ALLOWLIST, inScope)
  console.log(
    `Declared maxPageSize: ${declaredRows.length} list methods on ` +
      `${new Set(declaredRows.map((r) => `${r.vertical}/${r.slug}`)).size} adapters that declare one — ` +
      `${declared.violations.length} violation(s), ${declared.allowed.length} allowlisted, ` +
      `${declared.unpaged.length} unpaged, ${declared.unmeasured.length} unmeasured.`,
  )
  if (flags.report) printDeclaredMaxReport(declared)
  printDeclaredMaxFailures(declared)

  // Every adapter's source, so a full sweep only: an --only run cannot vouch for the rest.
  const reporterProblems = flags.only
    ? []
    : localReporterProblems(findLocalReporters(), LOCAL_PAGE_REPORTERS, (test) =>
        existsSync(join(REPO_ROOT, test)) ? readFileSync(join(REPO_ROOT, test), 'utf8') : undefined,
      )
  if (reporterProblems.length > 0)
    printList(
      'LOCAL_PAGE_REPORTERS disagrees with the adapters (a hand-rolled pagedLocally report is ' +
        'taken on trust, so each one is listed with its test):',
      reporterProblems,
    )
  const reportersFailed = reporterProblems.length > 0

  if (flags.update) {
    writeBaseline(BASELINE_PATH, failing)
    writeBaseline(UNMEASURED_BASELINE_PATH, unmeasured)
    writeBaseline(CLAMP_BASELINE_PATH, clamps)
    console.log(
      `\nBaselines updated: ${new Set(failing).size} failing list method(s), ` +
        `${new Set(unmeasured).size} unmeasured (constructor errors included), ` +
        `${new Set(clamps).size} serving less than the router asks for.`,
    )
    // The baselines are written, but a declared-max violation is never banked.
    return gateExitCode({
      declared,
      ratchetFailed: false,
      reportersFailed,
      update: true,
      soft: flags.soft,
    })
  }

  const failingBaseline = readBaseline(BASELINE_PATH)
  const unmeasuredBaseline = readBaseline(UNMEASURED_BASELINE_PATH)
  const clampBaseline = readBaseline(CLAMP_BASELINE_PATH)
  const fail = ratchet(failing, failingBaseline, inScope)
  const blind = ratchet(unmeasured, unmeasuredBaseline, inScope)
  const short = ratchet(clamps, clampBaseline, inScope)
  console.log(
    `Baseline allows ${failingBaseline.filter(inScope).length} failing, ` +
      `${unmeasuredBaseline.filter(inScope).length} unmeasured and ` +
      `${clampBaseline.filter(inScope).length} serving less than the router asks for.`,
  )

  let ratchetFailed = false
  if (fail.regressions.length > 0) {
    ratchetFailed = true
    printList(
      `${fail.regressions.length} list method(s) newly break the paging contract:`,
      fail.regressions,
    )
    console.error(
      "\nA list method must send the caller's limit as its page size and move its position\n" +
        'with `page` (page 1 is the first row). Fix the adapter; see the verdicts at the top of\n' +
        'scripts/check-paging-contract.ts. `--only=<vertical>/<slug> --json=<path>` shows the requests.\n' +
        "A new adapter scaffolded from its reference adapter inherits that adapter's paging\n" +
        'verdicts under its own slug: fix its paging for the new vendor, and bank them with\n' +
        '`pnpm check:paging-contract --update` only as a last resort.',
    )
  }
  const newCtor = blind.regressions.filter((id) => id.endsWith(':ctor'))
  const newBlind = blind.regressions.filter((id) => !id.endsWith(':ctor'))
  if (newCtor.length > 0) {
    ratchetFailed = true
    printList(`${newCtor.length} adapter constructor(s) newly throw on the stub config:`, newCtor)
    for (const id of newCtor.slice(0, 5)) console.error(`  ${id}: ${ctorErrors.get(id)}`)
  }
  if (newBlind.length > 0) {
    ratchetFailed = true
    printList(
      `${newBlind.length} list method(s) are newly unmeasured — the gate can no longer see them:`,
      newBlind,
    )
    console.error(
      '\nUnder the stub credentials the method sends no request, throws before its list\n' +
        'request (a token exchange or lookup the stub body cannot satisfy), or sends nothing\n' +
        'that reads as a size. Usually a new required config or credential key: add a stub\n' +
        'for it in scripts/check-paging-contract.ts rather than banking the blind spot.',
    )
  }
  if (short.regressions.length > 0) {
    ratchetFailed = true
    printList(
      `${short.regressions.length} list method(s) newly send less than the router asks for:`,
      short.regressions,
    )
    console.error(
      '\nThe router asks for min(limit, 500, capabilities.maxPageSize) and reads a page shorter\n' +
        'than that as the last one: meta.hasMore is false, and the cache stores the page as the\n' +
        "whole collection. Declare the platform's page maximum in capabilities.maxPageSize; a\n" +
        'method whose endpoint takes fewer rows than the rest reports the size it sent with\n' +
        'reportUpstreamPage(params, { pageSize }). Bank it with\n' +
        '`pnpm check:paging-contract --update` only as a last resort.',
    )
  }
  const stale = [...fail.stale, ...blind.stale, ...short.stale]
  if (stale.length > 0) {
    ratchetFailed = true
    printList(
      `${stale.length} baseline entr${stale.length === 1 ? 'y is' : 'ies are'} no longer produced:`,
      stale,
    )
    console.error('\nRun `pnpm check:paging-contract --update` to bank the progress.')
  }
  const code = gateExitCode({
    declared,
    ratchetFailed,
    reportersFailed,
    update: false,
    soft: flags.soft,
  })
  if (!ratchetFailed && !reportersFailed && !declaredMaxFailed(declared))
    console.log(
      'OK — no list method newly breaks the paging contract, and none breaks a declared maximum.',
    )
  return code
}

async function exit(code: number): Promise<never> {
  // Adapter timers and keep-alives would hold the loop open; flush and leave.
  await new Promise((resolve) => process.stdout.write('', resolve))
  await new Promise((resolve) => process.stderr.write('', resolve))
  process.exit(code)
}

/**
 * Whether `argv1` is this module. Both sides are resolved through symlinks: a
 * checkout reached through a symlinked path passes the link as argv[1] while
 * `import.meta.url` names the real file, and a plain comparison made the gate
 * do nothing and exit 0.
 */
export function isMainModule(argv1: string | undefined, metaUrl: string): boolean {
  if (argv1 === undefined) return false
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(metaUrl))
  } catch {
    return false
  }
}

if (isMainModule(process.argv[1], import.meta.url))
  main().then(exit, (err: unknown) => {
    console.error(err)
    return exit(1)
  })
