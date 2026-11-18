/**
 * Tests for the paging-contract gate.
 *
 * The classifier is pinned with fixtures taken from real requests the sweep
 * recorded, one per verdict. It works on the VALUES a request carries, never
 * on parameter names: a name-based predecessor read OData's `$skip` as "no
 * position" and counted Exact Online as ignoring `page` when it paged
 * perfectly well.
 *
 * The last block drives `probeMethod` end to end against in-test fake
 * adapters over the real axios instance the adapters load, so the check is
 * shown to fail on a broken adapter rather than only to pass on a good one.
 *
 * Run: `pnpm exec tsx --test scripts/check-paging-contract.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import dns from 'node:dns'
import net from 'node:net'
import { tmpdir } from 'node:os'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  CEILING_LIMIT,
  DECLARED_MAX_ALLOWLIST,
  DECLARED_MAX_UNPAGED,
  DECLARED_MAX_VIOLATIONS,
  FAILING,
  MIN_MEASURED_SHARE,
  RESIZED_LIMIT,
  STUB_ENVELOPES,
  STUB_RESPONSE,
  UNMEASURED,
  VERDICTS,
  allowlistProblems,
  blockNetwork,
  clampIdentity,
  checkDeclaredMax,
  classify,
  constantSizeOf,
  createRecorder,
  deadEnvelopes,
  envelopeFor,
  declaredMaxFailed,
  declaredMaxOf,
  describeViolation,
  findLocalReporters,
  gateExitCode,
  coverageShare,
  harnessProblems,
  isRefusal,
  identity,
  isMainModule,
  isMeasured,
  listSignatures,
  localReporterProblems,
  LOCAL_PAGE_REPORTERS,
  missingSharedExports,
  REQUIRED_SHARED_EXPORTS,
  sharedProbeDeps,
  stalePagedLocallyReporters,
  parseFlags,
  parseOnly,
  probeMethod,
  probeRow,
  ratchet,
  requestParams,
  scopeFilter,
  sizeAtCeiling,
  unmeasuredIdentity,
  volatileKeys,
  type ProbeCall,
  type ProbeRow,
  type RecordedRequest,
  type StubEnvelope,
  type Verdict,
} from './check-paging-contract.ts'
import { pageLocally, parseListQuery } from '../packages/shared/src/router/list-envelope.ts'
import {
  declaredPageMax,
  readUpstreamPage,
  reportUpstreamPage,
  withPageSink,
} from '../packages/shared/src/adapter/page-meta.ts'
import {
  _cursorPagerSize,
  _resetCursorPager,
  pageByCursor,
} from '../packages/shared/src/adapter/cursor-pager.ts'
import { pageByRows } from '../packages/shared/src/adapter/row-pager.ts'
import { isRefusal as workerIsRefusal } from '../packages/shared/src/data-store/sync-error.ts'
import type { QueryParams } from '../packages/shared/src/adapter/base.ts'

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const L = 10

// ── fixture helpers ──────────────────────────────────────────────────────

function get(url: string): RecordedRequest {
  return { method: 'GET', url }
}

function call(
  requests: RecordedRequest[],
  usedPager = false,
  error: string | null = null,
  pagedLocally = false,
): ProbeCall {
  return { requests, error, usedPager, ...(pagedLocally ? { pagedLocally } : {}) }
}

/**
 * Page 1 as an adapter whose size follows the caller's limit sends it at
 * RESIZED_LIMIT: every standalone `10` becomes the resized limit.
 */
function resized(requests: RecordedRequest[]): RecordedRequest[] {
  const swap = (s: string): string => s.replace(/(?<![\d.])10(?![\d.])/g, String(RESIZED_LIMIT))
  return requests.map((r) => ({
    ...r,
    url: swap(r.url),
    ...(r.body ? { body: swap(r.body) } : {}),
  }))
}

/**
 * A row whose page-1 call is repeated verbatim unless `page1Again` is given,
 * and re-sent at the resized limit as a size-following adapter would unless
 * `page1Resized` is given. `error` is set on every call; `pagedLocally` on
 * every call unless `pagedLocallyOn` names the ones that report it.
 */
function row(
  page1: RecordedRequest[],
  page2: RecordedRequest[],
  opts: {
    page1Again?: RecordedRequest[]
    page1Resized?: RecordedRequest[]
    usedPager?: boolean
    error?: string
    pagedLocally?: boolean
    pagedLocallyOn?: ReadonlyArray<'page1' | 'page2' | 'page1Again' | 'page1Resized'>
  } = {},
): ProbeRow {
  const pager = opts.usedPager ?? false
  const error = opts.error ?? null
  const local = (which: 'page1' | 'page2' | 'page1Again' | 'page1Resized'): boolean =>
    opts.pagedLocallyOn ? opts.pagedLocallyOn.includes(which) : (opts.pagedLocally ?? false)
  return {
    vertical: 'accounting',
    slug: 'fixture',
    method: 'listInvoices',
    page1: call(page1, pager, error, local('page1')),
    page1Again: call(opts.page1Again ?? page1, pager, error, local('page1Again')),
    page2: call(page2, pager, error, local('page2')),
    page1Resized: call(opts.page1Resized ?? resized(page1), pager, error, local('page1Resized')),
  }
}

// ── requestParams ────────────────────────────────────────────────────────

test('requestParams reads the query string, keeping OData `$` keys verbatim', () => {
  const p = requestParams(
    get('https://start.exactonline.nl/api/v1/1/salesinvoice/SalesInvoices?$top=10&$skip=0'),
  )
  assert.equal(p.get('$top'), '10')
  assert.equal(p.get('$skip'), '0')
})

test('requestParams flattens a GraphQL JSON body, variables included', () => {
  const p = requestParams({
    method: 'POST',
    url: 'https://shop.example.test/admin/api/2024-01/graphql.json',
    body: JSON.stringify({
      query: 'query($first:Int!,$after:String){orders(first:$first,after:$after){edges{node{id}}}}',
      variables: { first: 10, after: null },
    }),
  })
  assert.equal(p.get('variables.first'), '10')
  assert.equal(p.get('variables.after'), 'null')
})

test('requestParams reads the query of a URL with no scheme (a stub host used as a base URL)', () => {
  const p = requestParams(get('stub/wp-json/wc/v3/products?per_page=10&page=1'))
  assert.equal(p.get('per_page'), '10')
  assert.equal(p.get('page'), '1')
})

test('requestParams splits a comma-separated number list (PrestaShop `limit=offset,count`)', () => {
  const p = requestParams(get('https://shop.example.test/api/products?limit=10,10'))
  assert.equal(p.get('limit[0]'), '10')
  assert.equal(p.get('limit[1]'), '10')
  const base = 'https://shop.example.test/api/products?display=full'
  const v = classify(row([get(`${base}&limit=0,10`)], [get(`${base}&limit=10,10`)]), L)
  assert.equal(v, 'ok')
})

test('requestParams reads a form-encoded body', () => {
  const p = requestParams({
    method: 'POST',
    url: 'https://api.example.test/list',
    body: 'page=2&per_page=10',
  })
  assert.equal(p.get('page'), '2')
  assert.equal(p.get('per_page'), '10')
})

test('requestParams lifts numbers embedded in a query-language value (SOQL, inline GraphQL)', () => {
  const soql = requestParams(
    get(
      'https://x.my.salesforce.com/services/data/v59.0/query?q=' +
        encodeURIComponent('SELECT Id FROM Account ORDER BY Id LIMIT 10 OFFSET 20'),
    ),
  )
  assert.equal(soql.get('q~LIMIT'), '10')
  assert.equal(soql.get('q~OFFSET'), '20')
  const gql = requestParams({
    method: 'POST',
    url: 'https://api.example.test/graphql',
    body: JSON.stringify({ query: '{ orders(first: 10, skip: 0) { id } }' }),
  })
  assert.equal(gql.get('query~first'), '10')
  assert.equal(gql.get('query~skip'), '0')
})

// ── volatileKeys ─────────────────────────────────────────────────────────

test('volatileKeys names exactly the params that differ between two identical page-1 calls', () => {
  const a = call([get('https://api.example.test/orders?limit=10&timestamp=1000&sign=aa')])
  const b = call([get('https://api.example.test/orders?limit=10&timestamp=1001&sign=bb')])
  assert.deepEqual([...volatileKeys(a, b)].sort(), ['sign', 'timestamp'])
})

test('volatileKeys pairs requests by endpoint, so a cached token request does not shift the pairing', () => {
  const token: RecordedRequest = { method: 'POST', url: 'https://auth.example.test/oauth/token' }
  const a = call([token, get('https://api.example.test/orders?limit=10&nonce=1')])
  const b = call([get('https://api.example.test/orders?limit=10&nonce=2')])
  assert.deepEqual([...volatileKeys(a, b)], ['nonce'])
})

// ── classify: one fixture per verdict ────────────────────────────────────

test('Exact Online `$top`/`$skip` paging is ok — the `$skip` a name-based classifier misread', () => {
  const base = 'https://start.exactonline.nl/api/v1/1/salesinvoice/SalesInvoices'
  const v = classify(row([get(`${base}?$top=10&$skip=0`)], [get(`${base}?$top=10&$skip=10`)]), L)
  assert.equal(v, 'ok')
})

test('DocuSign sending the same request for page 1 and page 2 is page-ignored', () => {
  const url =
    'https://demo.docusign.net/restapi/v2.1/accounts/acc-1/envelopes?count=10&include=recipients,documents,custom_fields'
  assert.equal(classify(row([get(url)], [get(url)]), L), 'page-ignored')
})

test('Clover starting page 1 at offset=10 is page1-skips', () => {
  const base = 'https://api.clover.com/v3/merchants/m-1/items'
  const v = classify(
    row([get(`${base}?offset=10&limit=10`)], [get(`${base}?offset=20&limit=10`)]),
    L,
  )
  assert.equal(v, 'page1-skips')
})

test('a 1-based row offset (start=1 → start=11) is ok, not page1-skips', () => {
  const base = 'https://api.example.test/records'
  const v = classify(row([get(`${base}?start=1&max=10`)], [get(`${base}?start=11&max=10`)]), L)
  assert.equal(v, 'ok')
})

test('a size that grows with the page (fetch page × limit rows, slice locally) is not page1-skips', () => {
  // 10 → 20 is "grew by the limit" too, but with nothing else equal to the
  // limit there is no separate offset that could have started late.
  const base = 'https://api.example.test/orders'
  const v = classify(row([get(`${base}?limit=10`)], [get(`${base}?limit=20`)]), L)
  assert.equal(v, 'ok')
})

test('a volatile timestamp does not hide page-ignored', () => {
  const base = 'https://partner.shopeemobile.com/api/v2/product/get_item_list'
  const v = classify(
    row(
      [get(`${base}?page_size=10&timestamp=1000&sign=aa`)],
      [get(`${base}?page_size=10&timestamp=1002&sign=cc`)],
      { page1Again: [get(`${base}?page_size=10&timestamp=1001&sign=bb`)] },
    ),
    L,
  )
  assert.equal(v, 'page-ignored')
})

test('a volatile timestamp beside a moving page is still ok', () => {
  const base = 'https://api.example.test/orders'
  const v = classify(
    row([get(`${base}?page=1&limit=10&ts=1000`)], [get(`${base}?page=2&limit=10&ts=1002`)], {
      page1Again: [get(`${base}?page=1&limit=10&ts=1001`)],
    }),
    L,
  )
  assert.equal(v, 'ok')
})

test('a GraphQL body whose variables never move is page-ignored unless the cursor pager ran', () => {
  const gql: RecordedRequest = {
    method: 'POST',
    url: 'https://shop.example.test/admin/api/2024-01/graphql.json',
    body: JSON.stringify({ query: 'query Q', variables: { first: 10, after: null } }),
  }
  assert.equal(classify(row([gql], [gql]), L), 'page-ignored')
  // Through the cursor pager, page 2 is resolved from page 1's cursor; a stub
  // page 1 carries none, so page 2 legitimately repeats or skips the request.
  assert.equal(classify(row([gql], [], { usedPager: true }), L), 'ok')
})

test('a page size one above the caller limit is over-asks', () => {
  const base = 'https://api.example.test/orders'
  const v = classify(row([get(`${base}?page=1&limit=11`)], [get(`${base}?page=2&limit=11`)]), L)
  assert.equal(v, 'over-asks')
})

test('a constant page size that is not the caller limit is fixed-size', () => {
  const base = 'https://api.example.test/orders'
  const v = classify(
    row([get(`${base}?page=1&pageSize=100`)], [get(`${base}?page=2&pageSize=100`)]),
    L,
  )
  assert.equal(v, 'fixed-size')
})

test('a Unix timestamp that held still for all three calls is not a fixed page size', () => {
  // mabang-erp, verbatim apart from the host: the timestamp only reads as a
  // constant when all three calls land in one second, so calling it a size
  // would make the verdict flip between runs.
  const body = (page: string): RecordedRequest => ({
    method: 'POST',
    url: 'http://openapi.mabangerp.com/',
    body: JSON.stringify({ timestamp: '1790113536', action: 'get-storage-log-data', page }),
  })
  assert.equal(classify(row([body('1')], [body('2')]), L), 'unmeasured-no-size')
})

test('a small constant filter value (status=4) is not a fixed page size', () => {
  const base = 'https://api.cloudsign.jp/documents'
  const v = classify(row([get(`${base}?status=4&page=1`)], [get(`${base}?status=4&page=2`)]), L)
  assert.equal(v, 'unmeasured-no-size')
})

test('numbers inside a date-time are never lifted, so a minute of 10 is not a page size', () => {
  const p = requestParams(get('https://api.example.test/orders?since=2026-09-22T21:10:05Z'))
  assert.deepEqual([...p.keys()], ['since'])
  const base = 'https://api.example.test/orders'
  const v = classify(
    row(
      [get(`${base}?page=1&window=${encodeURIComponent('from 2026-09-22 21:10:05')}`)],
      [get(`${base}?page=2&window=${encodeURIComponent('from 2026-09-22 21:10:05')}`)],
    ),
    L,
  )
  assert.equal(v, 'unmeasured-no-size')
})

test('no requests at all is unmeasured-no-request', () => {
  assert.equal(classify(row([], []), L), 'unmeasured-no-request')
})

test('requests that carry nothing equal to the limit, and no size at all, are unmeasured-no-size', () => {
  const base = 'https://api.example.test/orders'
  const v = classify(
    row([get(`${base}?page=1&include=lines`)], [get(`${base}?page=2&include=lines`)]),
    L,
  )
  assert.equal(v, 'unmeasured-no-size')
})

test('an unrelated constant equal to a page number (api_version=2) is not read as position', () => {
  const base = 'https://api.example.test/orders'
  assert.equal(
    classify(
      row(
        [get(`${base}?api_version=2&per_page=10&page=1`)],
        [get(`${base}?api_version=2&per_page=10&page=2`)],
      ),
      L,
    ),
    'ok',
  )
  assert.equal(
    classify(
      row([get(`${base}?api_version=2&per_page=10`)], [get(`${base}?api_version=2&per_page=10`)]),
      L,
    ),
    'page-ignored',
  )
})

test('a token request made only on the first call does not mask or fake a page move', () => {
  const token: RecordedRequest = { method: 'POST', url: 'https://auth.example.test/oauth/token' }
  const base = 'https://api.example.test/orders'
  const moved = row([token, get(`${base}?limit=10&page=1`)], [get(`${base}?limit=10&page=2`)], {
    page1Again: [get(`${base}?limit=10&page=1`)],
  })
  assert.equal(classify(moved, L), 'ok')
  const ignored = row([token, get(`${base}?limit=10`)], [get(`${base}?limit=10`)], {
    page1Again: [get(`${base}?limit=10`)],
  })
  assert.equal(classify(ignored, L), 'page-ignored')
})

test('a position carried in the path (not the query) counts as a page move', () => {
  const v = classify(
    row(
      [get('https://api.example.test/orders/page/1?size=10')],
      [get('https://api.example.test/orders/page/2?size=10')],
    ),
    L,
  )
  assert.equal(v, 'ok')
})

// ── classify: page 2 that sends nothing ──────────────────────────────────

test('an unpaginated list fetched whole on page 1 and answered empty on page 2 is single-page', () => {
  // Ozon's listLocations: `if (params.page > 1) return []` after reporting
  // hasMore:false. Page 2 sends nothing because it has nothing to ask for;
  // that is a fix for an unpaginated upstream, not page-ignored.
  const url = 'https://test.myshopify.com/admin/api/2025-01/locations.json'
  const v = classify(row([get(url)], []), L)
  assert.equal(v, 'single-page')
  assert.equal(FAILING.has(v), false)
  assert.equal(isMeasured(v), true)
})

test('a whole collection paged locally on both pages is local-page, not page-ignored-unsized', () => {
  // Shopify's listLocations: the same unsized request on page 1 and page 2,
  // each sliced by shared's pageLocally, which says so through the sink. The
  // requests alone are identical to an adapter that ignores `page`.
  const url = 'https://test.myshopify.com/admin/api/2025-01/locations.json'
  const local = (r: ProbeRow): ProbeRow => ({
    ...r,
    page1: { ...r.page1, pagedLocally: true },
    page2: { ...r.page2, pagedLocally: true },
  })
  assert.equal(classify(row([get(url)], [get(url)]), L), 'page-ignored-unsized')
  assert.equal(classify(local(row([get(url)], [get(url)])), L), 'local-page')
  // Page 1 alone saying so is not enough: page 2 must have sliced too.
  const onlyFirst = row([get(url)], [get(url)])
  onlyFirst.page1.pagedLocally = true
  assert.equal(classify(onlyFirst, L), 'page-ignored-unsized')
})

test('page 2 answered empty after page 1 asked upstream for only the limit is first-page-only', () => {
  // `if (page > 1) return []` in front of a request sized by the caller's
  // limit serves the first `limit` rows and nothing after them, unless page 1
  // walks the upstream itself — which an empty stub page cannot show.
  const v = classify(row([get('https://api.fortnox.se/3/invoices?limit=10&page=1')], []), L)
  assert.equal(v, 'first-page-only')
  assert.equal(FAILING.has(v), true)
})

test('a page 2 that threw before sending anything is not single-page', () => {
  const v = classify(
    row([get('https://apis.haravan.com/com/shop.json')], [], { error: 'no currency' }),
    L,
  )
  assert.notEqual(v, 'single-page')
  assert.equal(v, 'unmeasured-error')
})

// ── classify: calls that threw ───────────────────────────────────────────

test('a call that threw after only its auth request is unmeasured-error, not page-ignored', () => {
  // Eudonet, verbatim: the stub body fails its token exchange, so the list
  // request (RowsPerPage/NumPage, correctly paged) is never sent, and page 2
  // repeating the token request says nothing about paging.
  const token: RecordedRequest = {
    method: 'POST',
    url: 'https://instance.example.test/Authenticate/Token',
    body: '{"SubscriberLogin":"stub-subscriberLogin","SubscriberPassword":"stub-subscriberPassword"}',
  }
  const v = classify(row([token], [token], { error: 'Eudonet authentication error' }), L)
  assert.equal(v, 'unmeasured-error')
  assert.equal(UNMEASURED.has(v), true)
})

test('a call that threw after a lookup only (bling, korona-pos) is unmeasured-error', () => {
  const lookup = get('https://host.example.test/web/api/v3/accounts/a/currencies?page=1&size=50')
  assert.equal(classify(row([lookup], [lookup], { error: 'reading find' }), L), 'unmeasured-error')
})

test('a call that threw AFTER sending a list request that moves with page is still judged', () => {
  // Copper, verbatim: the list request goes out, then the stub body fails to
  // parse. The request moved with `page`, so it is the list request.
  const search = (page: number): RecordedRequest => ({
    method: 'POST',
    url: 'https://api.copper.com/developer_api/v1/people/search',
    body: JSON.stringify({ page_size: 25, page_number: page }),
  })
  const v = classify(row([search(1)], [search(2)], { error: 'items.map is not a function' }), L)
  assert.equal(v, 'fixed-size')
})

test('a call that threw after a request carrying the limit is still page-ignored when it repeats', () => {
  const url = 'https://api.example.test/orders?limit=10'
  assert.equal(classify(row([get(url)], [get(url)], { error: 'bad body' }), L), 'page-ignored')
})

// ── classify: identical pages with no size ───────────────────────────────

test('identical pages that carry no size are page-ignored-unsized, apart from page-ignored', () => {
  // access-financials, verbatim apart from the query text: a GraphQL cursor
  // query sent with `after: null` on every page. Still a failure — page 2
  // repeats page 1 — but with no size seen, the repeated request might be an
  // unpaginated fetch or only a lookup that found nothing, so it is counted
  // apart and not as measured.
  const gql: RecordedRequest = {
    method: 'POST',
    url: 'https://api.erp.accessacloud.com/financials-graphql',
    body: JSON.stringify({
      query: 'query ($after: String) { header(after: $after) { items { id } } }',
      variables: { after: null },
    }),
  }
  const v = classify(row([gql], [gql]), L)
  assert.equal(v, 'page-ignored-unsized')
  assert.equal(FAILING.has(v), true)
  assert.equal(isMeasured(v), false)
  const lookup = get('https://public-api.crunch.co.uk/v1/banking/bank-accounts')
  assert.equal(classify(row([lookup], [lookup]), L), 'page-ignored-unsized')
})

// ── classify: position moves the wrong way ───────────────────────────────

test('a row offset that strides by neither 1 nor the limit is page-stride (abraflexi start 0 → 50)', () => {
  const base = 'https://demo.abraflexi.eu/c/demo/faktura-vydana'
  const v = classify(row([get(`${base}?start=0&limit=10`)], [get(`${base}?start=50&limit=10`)]), L)
  assert.equal(v, 'page-stride')
  assert.equal(FAILING.has(v), true)
})

test("Stripe's skip walk (limit 10 → 100 on page 2) is not page-stride: its page-1 value is the limit", () => {
  const v = classify(
    row(
      [get('https://api.stripe.com/v1/customers?limit=10')],
      [get('https://api.stripe.com/v1/customers?limit=100')],
    ),
    L,
  )
  assert.equal(v, 'ok')
})

test('a page counter sent as page + 1 (page 1 asks for page 2) is page1-skips, sized or not', () => {
  // Shopee, verbatim apart from the signature: `page_no: (params.page ?? 0) + 1`.
  const base = 'https://partner.shopeemobile.com/api/v2/returns/get_return_list'
  const sized = row(
    [get(`${base}?page_no=2&page_size=10&timestamp=1790115313&sign=aa`)],
    [get(`${base}?page_no=3&page_size=10&timestamp=1790115313&sign=aa`)],
  )
  assert.equal(classify(sized, L), 'page1-skips')
  // eposnow, verbatim: no size at all, still skips page 1.
  const unsized = row(
    [get('https://api.eposnowhq.com/api/v4/Product?page=2')],
    [get('https://api.eposnowhq.com/api/v4/Product?page=3')],
  )
  assert.equal(classify(unsized, L), 'page1-skips')
})

test('a look-ahead that fetches pages 1 and 2 for page 1 is not page1-skips', () => {
  const base = 'https://api.example.test/orders'
  const v = classify(
    row(
      [get(`${base}?page=1&per_page=10`), get(`${base}?page=2&per_page=10`)],
      [get(`${base}?page=2&per_page=10`), get(`${base}?page=3&per_page=10`)],
    ),
    L,
  )
  assert.equal(v, 'ok')
})

// ── classify: the size must follow the caller's limit ────────────────────

test('a size that equals the limit but does not follow it is fixed-size (lumin-sign whitelist)', () => {
  // lumin-sign sends the caller's limit only when it is in ALLOWED_PAGE_SIZES
  // and its default otherwise, so a probe at 10 alone reads it as ok.
  const base = 'https://api-sandbox.luminpdf.com/v1/templates'
  const whitelist = row([get(`${base}?page=1&limit=10`)], [get(`${base}?page=2&limit=10`)], {
    page1Resized: [get(`${base}?page=1&limit=20`)],
  })
  assert.equal(classify(whitelist, L), 'fixed-size')
  const hardCoded = row([get(`${base}?page=1&limit=10`)], [get(`${base}?page=2&limit=10`)], {
    page1Resized: [get(`${base}?page=1&limit=10`)],
  })
  assert.equal(classify(hardCoded, L), 'fixed-size')
})

// ── classify: pages served locally ───────────────────────────────────────

// A page cut from rows the adapter already fetched (pageLocally, pageByRows,
// a hand-rolled window) repeats its request for every caller page inside one
// upstream page, by design. The adapter reports `pagedLocally` through the
// page sink; the requests alone would read as page-ignored or fixed-size.

test('a local window that repeats its request is local-page when it says so (eposnow V4 pages)', () => {
  // Epos Now's V4 lists return 200 rows and take no size: caller pages 1 and 2
  // at limit 10 both come out of upstream page 1.
  const url = 'https://api.eposnowhq.com/api/v4/Product?page=1'
  const local = classify(row([get(url)], [get(url)], { pagedLocally: true }), L)
  assert.equal(local, 'local-page')
  assert.equal(FAILING.has(local), false)
  assert.equal(UNMEASURED.has(local), false)
  // It passes on the adapter's word, so it is not coverage.
  assert.equal(isMeasured(local), false)
  // Without the report it is the failure it always was.
  assert.equal(classify(row([get(url)], [get(url)]), L), 'page-ignored-unsized')
})

test('a local window over a whitelisted size is local-page when it says so (lumin-sign 10/25/50)', () => {
  const base = 'https://api-sandbox.luminpdf.com/v1/templates'
  const opts = { page1Resized: [get(`${base}?page=1&limit=10`)] }
  const snapped = row([get(`${base}?page=1&limit=10`)], [get(`${base}?page=2&limit=10`)], opts)
  assert.equal(classify(snapped, L), 'fixed-size')
  const local = row([get(`${base}?page=1&limit=10`)], [get(`${base}?page=2&limit=10`)], {
    ...opts,
    pagedLocally: true,
  })
  assert.equal(classify(local, L), 'local-page')
})

test('pageByRows answering page 2 from a walked end is local-page, not first-page-only or single-page', () => {
  // The stub's first upstream page is empty and carries no cursor, so the row
  // pager knows the end and page 2 asks nothing, sized by the limit or not.
  const sized = get('https://test.myshopify.com/admin/api/2025-01/orders.json?limit=10&status=any')
  assert.equal(classify(row([sized], []), L), 'first-page-only')
  assert.equal(classify(row([sized], [], { pagedLocally: true }), L), 'local-page')
  const batch = get('https://test.myshopify.com/admin/api/2025-01/orders.json?limit=250&status=any')
  assert.equal(classify(row([batch], [], { pagedLocally: true }), L), 'local-page')
})

test('pagedLocally does not excuse page 1 skipping rows', () => {
  const v = classify(
    row(
      [get('https://api.eposnowhq.com/api/v4/Product?page=2')],
      [get('https://api.eposnowhq.com/api/v4/Product?page=3')],
      { pagedLocally: true },
    ),
    L,
  )
  assert.equal(v, 'page1-skips')
})

test('pagedLocally does not excuse asking upstream for more than the limit', () => {
  const url = 'https://api.example.test/orders?limit=11'
  assert.equal(classify(row([get(url)], [get(url)], { pagedLocally: true }), L), 'over-asks')
})

test('pagedLocally does not excuse a position that moves by neither 1 nor the limit', () => {
  const base = 'https://demo.abraflexi.eu/c/demo/faktura-vydana'
  // A move of 5 with a size that follows the limit serves rows 5..9 twice;
  // a move of 50 skips 40.
  for (const start of [5, 50]) {
    const v = classify(
      row([get(`${base}?start=0&limit=10`)], [get(`${base}?start=${start}&limit=10`)], {
        pagedLocally: true,
      }),
      L,
    )
    assert.equal(v, 'page-stride', `start=${start}`)
  }
})

test('pagedLocally counts only when page 1 AND page 2 report it', () => {
  const url = 'https://api.example.test/locations'
  for (const on of [['page1'], ['page2'], ['page1Again', 'page1Resized']] as const) {
    const v = classify(row([get(url)], [get(url)], { pagedLocallyOn: on }), L)
    assert.equal(v, 'page-ignored-unsized', `reported on ${on.join(', ')}`)
  }
  const both = row([get(url)], [get(url)], { pagedLocallyOn: ['page1', 'page2'] })
  assert.equal(classify(both, L), 'local-page')
})

test('a call that threw served nothing, whatever it reported: its requests are judged', () => {
  const url = 'https://api.example.test/locations'
  const threw = (on: 'page1' | 'page2'): ProbeRow => {
    const r = row([get(url)], [get(url)], { pagedLocally: true })
    return { ...r, [on]: { ...r[on], error: 'stub body has no rows' } }
  }
  assert.equal(classify(row([get(url)], [get(url)], { pagedLocally: true }), L), 'local-page')
  assert.equal(classify(threw('page1'), L), 'unmeasured-error')
  assert.equal(classify(threw('page2'), L), 'unmeasured-error')
})

test('a page 1 that sent nothing is unmeasured-no-request, whatever it reports', () => {
  assert.equal(classify(row([], [], { pagedLocally: true }), L), 'unmeasured-no-request')
})

test('a page that passes on its requests keeps its verdict and does not need the report', () => {
  const base = 'https://api.example.test/orders'
  const moving = row([get(`${base}?page=1&per_page=10`)], [get(`${base}?page=2&per_page=10`)])
  assert.equal(classify(moving, L), 'ok')
  assert.equal(classify(row([get(`${base}/all`)], []), L), 'single-page')
})

test('ok outranks local-page: what the requests prove beats what the adapter says', () => {
  const base = 'https://api.example.test/orders'
  const moving = row([get(`${base}?page=1&per_page=10`)], [get(`${base}?page=2&per_page=10`)], {
    pagedLocally: true,
  })
  assert.equal(classify(moving, L), 'ok')
})

test("pageLocally over one page of the caller's size is still page-ignored", () => {
  // Page 2 slices past the end of the same ten rows: the report does not
  // turn a sized repeat into a pass, whether the size is a limit or a count
  // beside a fixed offset.
  for (const url of ['https://x.test/things?limit=10', 'https://x.test/things?offset=0&limit=10']) {
    const v = classify(row([get(url)], [get(url)], { pagedLocally: true }), L)
    assert.equal(v, 'page-ignored', url)
  }
})

test('a window over fixed 100-row pages repeats a constant size and is local-page', () => {
  // Caller pages 1 and 2 at limit 10 both lie in upstream page 1. The same
  // requests come from pageLocally over one truncated page of 100: a
  // constant size cannot tell the two apart, so the gate does not try.
  const url = 'https://api.example.test/orders?page=1&per_page=100'
  const v = classify(row([get(url)], [get(url)], { pagedLocally: true }), L)
  assert.equal(v, 'local-page')
})

test('a local window that moves a position past the limit skips rows: page-stride', () => {
  // Over fixed 200-row pages, caller page 2 (rows 10..19) is in upstream page
  // 1. Asking for row 200 is the bug a local window exists to fix.
  const base = 'https://api.example.test/orders'
  const v = classify(
    row([get(`${base}?start=0&count=200`)], [get(`${base}?start=200&count=200`)], {
      pagedLocally: true,
    }),
    L,
  )
  assert.equal(v, 'page-stride')
})

test('a local window over upstream pages smaller than the limit may move by several pages', () => {
  // 5-row pages numbered from 1: caller page 1 is upstream pages 1 and 2,
  // caller page 2 is upstream pages 3 and 4. A page number moving by 2 is
  // neither 1 nor the limit, and still right.
  const base = 'https://api.example.test/orders'
  const v = classify(
    row(
      [get(`${base}?page=1&per_page=5`), get(`${base}?page=2&per_page=5`)],
      [get(`${base}?page=3&per_page=5`), get(`${base}?page=4&per_page=5`)],
      {
        pagedLocally: true,
        page1Resized: [get(`${base}?page=1&per_page=5`), get(`${base}?page=2&per_page=5`)],
      },
    ),
    L,
  )
  assert.equal(v, 'local-page')
  // The same by offset: page 2 starts at row 10 exactly, a move of the limit.
  const byOffset = classify(
    row(
      [get(`${base}?offset=0&count=5`), get(`${base}?offset=5&count=5`)],
      [get(`${base}?offset=10&count=5`), get(`${base}?offset=15&count=5`)],
      {
        pagedLocally: true,
        page1Resized: [get(`${base}?offset=0&count=5`), get(`${base}?offset=5&count=5`)],
      },
    ),
    L,
  )
  assert.equal(byOffset, 'local-page')
})

test('a local window that sends the limit is not over-asking because limit + 1 also appears', () => {
  const url = 'https://api.example.test/v4/orders?limit=10&api=11'
  const v = classify(
    row([get(url)], [get(url)], { pagedLocally: true, page1Resized: [get(url)] }),
    L,
  )
  assert.equal(v, 'local-page')
})

// ── the declared-max invariant ───────────────────────────────────────────

/** A classified row for the invariant: only its identity, maximum and verdict matter. */
function declaredRow(
  id: string,
  verdict: Verdict,
  declaredMax?: number,
): { vertical: string; slug: string; method: string; declaredMax?: number; verdict: Verdict } {
  const [adapter, method] = id.split(':') as [string, string]
  const [vertical, slug] = adapter.split('/') as [string, string]
  return { vertical, slug, method, verdict, ...(declaredMax !== undefined ? { declaredMax } : {}) }
}

const byVerdict = (r: { verdict: Verdict }): Verdict => r.verdict

test('DECLARED_MAX_VIOLATIONS is exactly the verdicts that make a false end under a declared max', () => {
  assert.deepEqual([...DECLARED_MAX_VIOLATIONS].sort(), [
    'first-page-only',
    'fixed-size',
    'over-asks',
    'page-stride',
    'page1-skips',
  ])
  // A repeated page trips the sync's identical-page detector; a whole list is
  // a real end. Reported, never failed.
  assert.deepEqual([...DECLARED_MAX_UNPAGED].sort(), ['page-ignored', 'page-ignored-unsized'])
  for (const v of DECLARED_MAX_VIOLATIONS) assert.equal(FAILING.has(v), true, `${v} is failing`)
  for (const v of DECLARED_MAX_UNPAGED)
    assert.equal(DECLARED_MAX_VIOLATIONS.has(v), false, `${v} is not a violation`)
})

test('checkDeclaredMax fails every violating verdict on a declared-max adapter, and only there', () => {
  const rows = [
    declaredRow('crm/a:listDeals', 'fixed-size', 100),
    declaredRow('crm/a:listNotes', 'page1-skips', 100),
    declaredRow('crm/a:listContacts', 'page-stride', 100),
    declaredRow('crm/a:listCompanies', 'first-page-only', 100),
    declaredRow('crm/a:listActivities', 'over-asks', 100),
    declaredRow('crm/a:listPipelines', 'ok', 100),
    declaredRow('crm/a:listTasks', 'single-page', 100),
    // No declared maximum: the ratchet judges it, the invariant does not.
    declaredRow('crm/b:listDeals', 'fixed-size'),
  ]
  const d = checkDeclaredMax(rows, byVerdict, {})
  assert.deepEqual(
    d.violations.map((f) => `${f.id} ${f.verdict}`),
    [
      'crm/a:listActivities over-asks',
      'crm/a:listCompanies first-page-only',
      'crm/a:listContacts page-stride',
      'crm/a:listDeals fixed-size',
      'crm/a:listNotes page1-skips',
    ],
  )
  assert.ok(d.violations.every((f) => f.declaredMax === 100))
  assert.deepEqual(d.allowed, [])
  assert.deepEqual(d.unpaged, [])
})

test('a declared-max violation fails although the baseline banks it: there is no ratchet', () => {
  // Copper's notes search, verbatim: `page_size: 25` whatever the caller asks,
  // under a declared maxPageSize of 200. 25 rows would read as the last page.
  const search = (page: number): RecordedRequest => ({
    method: 'POST',
    url: 'https://api.copper.com/developer_api/v1/notes/search',
    body: JSON.stringify({ page_size: 25, page_number: page }),
  })
  const r: ProbeRow = {
    ...row([search(1)], [search(2)]),
    vertical: 'crm',
    slug: 'copper',
    method: 'listNotes',
    declaredMax: 200,
  }
  const verdict = classify(r, L)
  assert.equal(verdict, 'fixed-size')
  const id = identity(r, verdict)
  assert.deepEqual(ratchet([id], [id]).regressions, [], 'the ratchet is satisfied by the baseline')
  const d = checkDeclaredMax([r], (x) => classify(x, L), {})
  assert.deepEqual(d.violations, [
    { id: 'crm/copper:listNotes', verdict: 'fixed-size', declaredMax: 200 },
  ])
  assert.equal(
    describeViolation(d.violations[0]!),
    'crm/copper:listNotes fixed-size (the adapter declares maxPageSize 200)',
  )
})

test('checkDeclaredMax lists page-ignored and unmeasured methods apart, never as violations', () => {
  const d = checkDeclaredMax(
    [
      declaredRow('ecommerce/e:listOrders', 'page-ignored-unsized', 200),
      declaredRow('ecommerce/e:listCustomers', 'page-ignored', 200),
      declaredRow('ecommerce/e:listVariants', 'unmeasured-no-request', 200),
    ],
    byVerdict,
    {},
  )
  assert.deepEqual(d.violations, [])
  assert.deepEqual(
    d.unpaged.map((f) => f.id),
    ['ecommerce/e:listCustomers', 'ecommerce/e:listOrders'],
  )
  assert.deepEqual(
    d.unmeasured.map((f) => f.id),
    ['ecommerce/e:listVariants'],
  )
})

test('local-page is not a declared-max violation, so an allowlist entry for one is stale', () => {
  // Lumin Sign's listTemplates, which declares maxPageSize 50: the snapped size
  // reads as fixed-size by value; reporting pagedLocally makes it local-page.
  const base = 'https://api-sandbox.luminpdf.com/v1/templates'
  const r: ProbeRow = {
    ...row([get(`${base}?page=1&limit=10`)], [get(`${base}?page=2&limit=10`)], {
      page1Resized: [get(`${base}?page=1&limit=10`)],
      pagedLocally: true,
    }),
    vertical: 'docsign',
    slug: 'lumin-sign',
    method: 'listTemplates',
    declaredMax: 50,
  }
  assert.equal(classify(r, L), 'local-page')
  const allow = { 'docsign/lumin-sign:listTemplates': 'snaps to a documented size whitelist' }
  const d = checkDeclaredMax([r], (x) => classify(x, L), allow)
  assert.deepEqual(d.violations, [])
  assert.deepEqual(d.allowed, [])
  assert.deepEqual(d.unpaged, [])
  assert.deepEqual(d.unmeasured, [])
  assert.deepEqual(d.staleAllowlist, ['docsign/lumin-sign:listTemplates'])
  assert.equal(declaredMaxFailed(checkDeclaredMax([r], (x) => classify(x, L), {})), false)
})

test('the allowlist is the only escape, and an entry that no longer names a violation is stale', () => {
  const allow = { 'docsign/l:listTemplates': 'snaps to a documented size whitelist' }
  const flagged = checkDeclaredMax(
    [declaredRow('docsign/l:listTemplates', 'fixed-size', 50)],
    byVerdict,
    allow,
  )
  assert.deepEqual(flagged.violations, [])
  assert.deepEqual(
    flagged.allowed.map((f) => f.id),
    ['docsign/l:listTemplates'],
  )
  assert.deepEqual(flagged.staleAllowlist, [])
  // Fixed, or no longer measured as a violation: the entry has to go.
  const fixed = checkDeclaredMax(
    [declaredRow('docsign/l:listTemplates', 'ok', 50)],
    byVerdict,
    allow,
  )
  assert.deepEqual(fixed.staleAllowlist, ['docsign/l:listTemplates'])
  // An --only run outside the entry's adapter cannot vouch either way.
  const elsewhere = checkDeclaredMax([], byVerdict, allow, scopeFilter({ vertical: 'crm' }))
  assert.deepEqual(elsewhere.staleAllowlist, [])
})

test('allowlistProblems refuses an entry that is not one list method or carries no reason', () => {
  assert.deepEqual(allowlistProblems({ 'crm/a:listDeals': 'a documented size whitelist' }), [])
  assert.equal(allowlistProblems({ 'crm/a': 'a documented size whitelist' }).length, 1)
  assert.equal(allowlistProblems({ 'crm/a:getDeal': 'a documented size whitelist' }).length, 1)
  assert.equal(allowlistProblems({ 'crm/a:listDeals': '' }).length, 1)
  assert.equal(allowlistProblems({ 'crm/a:listDeals': '   false positive  ' }).length, 1)
})

/** Allowlist entries that are not exactly one banked baseline entry with a violation verdict. */
function unbankedAllowlistEntries(
  allowlist: Readonly<Record<string, string>>,
  baseline: readonly string[],
): string[] {
  return Object.keys(allowlist).filter((id) => {
    const banked = baseline.filter((b) => b.startsWith(`${id} `))
    if (banked.length !== 1) return true
    return !DECLARED_MAX_VIOLATIONS.has(banked[0]!.slice(id.length + 1) as Verdict)
  })
}

test('DECLARED_MAX_ALLOWLIST is well-formed and names only banked violations', () => {
  // The check bites on a fixture: the real allowlist is empty today, so the
  // assertions on it below would pass on any check.
  const fixtureBaseline = ['crm/a:listDeals fixed-size', 'crm/b:listDeals page-ignored']
  assert.deepEqual(
    unbankedAllowlistEntries(
      {
        'crm/a:listDeals': 'banked as a violation verdict',
        'crm/b:listDeals': 'banked, but page-ignored is not a violation',
        'crm/c:listDeals': 'not banked at all',
      },
      fixtureBaseline,
    ),
    ['crm/b:listDeals', 'crm/c:listDeals'],
  )
  assert.deepEqual(allowlistProblems(DECLARED_MAX_ALLOWLIST), [])
  const baseline: string[] = JSON.parse(
    readFileSync(join(REPO_ROOT, 'scripts', 'paging-contract-baseline.json'), 'utf8'),
  )
  assert.deepEqual(unbankedAllowlistEntries(DECLARED_MAX_ALLOWLIST, baseline), [])
})

// ── hand-rolled pagedLocally reporters are listed, with their tests ──────

test('localReporterProblems: an unlisted reporter, a stale entry and a test that proves nothing all fail', () => {
  const tests: Record<string, string> = {
    'tests/a.test.ts': 'expect(readUpstreamPage(p)?.pagedLocally).toBe(true)',
    'tests/b.test.ts': 'expect(rows).toEqual(all)',
  }
  const read = (path: string): string | undefined => tests[path]
  assert.deepEqual(localReporterProblems(['src/a.ts'], { 'src/a.ts': 'tests/a.test.ts' }, read), [])
  const unlisted = localReporterProblems(
    ['src/a.ts', 'src/z.ts'],
    { 'src/a.ts': 'tests/a.test.ts' },
    read,
  )
  assert.equal(unlisted.length, 1)
  assert.match(unlisted[0]!, /src\/z\.ts reports pagedLocally but is not in LOCAL_PAGE_REPORTERS/)
  const stale = localReporterProblems([], { 'src/a.ts': 'tests/a.test.ts' }, read)
  assert.equal(stale.length, 1)
  assert.match(stale[0]!, /no longer reports pagedLocally/)
  const missingTest = localReporterProblems(
    ['src/a.ts'],
    { 'src/a.ts': 'tests/gone.test.ts' },
    read,
  )
  assert.equal(missingTest.length, 1)
  assert.match(missingTest[0]!, /does not exist/)
  const silentTest = localReporterProblems(['src/b.ts'], { 'src/b.ts': 'tests/b.test.ts' }, read)
  assert.equal(silentTest.length, 1)
  assert.match(silentTest[0]!, /never checks pagedLocally/)
})

test('findLocalReporters finds a reporting line under apps/*/src, and not a comment naming the flag', () => {
  const root = mkdtempSync(join(tmpdir(), 'paging-reporters-'))
  try {
    const src = join(root, 'apps', 'server', 'src', 'adapters', 'x')
    mkdirSync(src, { recursive: true })
    writeFileSync(join(src, 'window.ts'), 'reportUpstreamPage(params, { pagedLocally: true })\n')
    writeFileSync(
      join(src, 'doc.ts'),
      '/**\n * reports `pagedLocally: true` from its window\n */\n// pagedLocally: true\n',
    )
    writeFileSync(join(src, 'plain.ts'), 'export const x = { pagedLocally: false }\n')
    mkdirSync(join(root, 'apps', 'no-src'), { recursive: true })
    assert.deepEqual(findLocalReporters(root), ['apps/server/src/adapters/x/window.ts'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('LOCAL_PAGE_REPORTERS lists exactly the adapters that report pagedLocally themselves, each with its test', () => {
  const found = findLocalReporters()
  assert.deepEqual(found, Object.keys(LOCAL_PAGE_REPORTERS).sort())
  const read = (path: string): string | undefined =>
    existsSync(join(REPO_ROOT, path)) ? readFileSync(join(REPO_ROOT, path), 'utf8') : undefined
  assert.deepEqual(localReporterProblems(found, LOCAL_PAGE_REPORTERS, read), [])
})

test('declaredMaxOf declares exactly what the sync worker pages by', () => {
  // The worker and the router read it through shared's declaredPageMax: only a
  // finite integer >= 1 declares a maximum.
  assert.equal(declaredMaxOf({ capabilities: { maxPageSize: 100 } }), 100)
  class Declares {
    get capabilities() {
      return { maxPageSize: 50 }
    }
  }
  assert.equal(declaredMaxOf(new Declares()), 50)
  assert.equal(declaredMaxOf({}), undefined)
  assert.equal(declaredMaxOf({ capabilities: { search: true } }), undefined)
  assert.equal(declaredMaxOf({ capabilities: { maxPageSize: null } }), undefined)
  assert.equal(declaredMaxOf({ capabilities: { maxPageSize: 0 } }), undefined)
  assert.equal(declaredMaxOf({ capabilities: { maxPageSize: -1 } }), undefined)
  assert.equal(declaredMaxOf({ capabilities: { maxPageSize: 'abc' } }), undefined)
  assert.equal(declaredMaxOf({ capabilities: { maxPageSize: Number.NaN } }), undefined)
  // declaredPageMax declares nothing for these, so the worker pages them at
  // its default and judges no short page by them; neither does the invariant.
  assert.equal(declaredMaxOf({ capabilities: { maxPageSize: '100' } }), undefined)
  assert.equal(declaredMaxOf({ capabilities: { maxPageSize: 50.5 } }), undefined)
  assert.equal(
    declaredMaxOf({ capabilities: { maxPageSize: Number.POSITIVE_INFINITY } }),
    undefined,
  )
})

test('probeRow carries the adapter maximum into the row, and only when it declares one', () => {
  const calls = row(
    [get('https://x.test/a?page=1&limit=10')],
    [get('https://x.test/a?page=2&limit=10')],
  )
  const at = { vertical: 'crm', slug: 'a', method: 'listDeals' }
  const declared = probeRow({ capabilities: { maxPageSize: 100 } }, at, calls)
  assert.equal(declared.declaredMax, 100)
  assert.equal(unmeasuredIdentity(declared), 'crm/a:listDeals')
  assert.deepEqual(declared.page2, calls.page2)
  const undeclared = probeRow({ capabilities: {} }, at, calls)
  assert.equal('declaredMax' in undeclared, false)
  // Through probeRow a violating row reaches the invariant; built without it,
  // the same row is invisible to it.
  const verdictOf = (): Verdict => 'fixed-size'
  assert.equal(checkDeclaredMax([declared], verdictOf, {}).violations.length, 1)
  assert.equal(checkDeclaredMax([undeclared], verdictOf, {}).violations.length, 0)
})

test('harnessProblems fails a full sweep that found no declared maximum, and only a full sweep', () => {
  const sweep = { escapes: [], measured: 7000, total: 8000 }
  assert.match(harnessProblems({ ...sweep, declared: 0 })[0] ?? '', /maxPageSize/)
  assert.deepEqual(harnessProblems({ ...sweep, declared: 185 }), [])
  // One adapter or vertical may declare none at all.
  assert.deepEqual(harnessProblems({ ...sweep, declared: 0, only: { vertical: 'crm' } }), [])
})

// Apollo's deal stages as the sweep recorded them: `page=1&per_page=25` on every
// call, whatever the caller asked. By value that is page-ignored-unsized.
const constantPager = (): ProbeRow => {
  const req = get('https://api.apollo.io/api/v1/opportunity_stages?page=1&per_page=25')
  return {
    ...row([req], [req], { page1Resized: [req] }),
    vertical: 'crm',
    slug: 'apollo',
    method: 'listPipelines',
    declaredMax: 100,
  }
}

test('constantSizeOf finds a size sent unchanged on every call, and nothing else', () => {
  assert.equal(classify(constantPager(), L), 'page-ignored-unsized')
  assert.equal(constantSizeOf(constantPager()), 'per_page=25')
  // Truly unpaginated: nothing that could be a size rides along.
  const bare = get('https://api.apollo.io/api/v1/opportunity_stages')
  assert.equal(constantSizeOf(row([bare], [bare], { page1Resized: [bare] })), undefined)
  // Below 5 is a flag or a page number, not a size (Epos Now's `page=1`).
  const page1 = get('https://api.eposnowhq.com/api/v4/Product?page=1')
  assert.equal(constantSizeOf(row([page1], [page1], { page1Resized: [page1] })), undefined)
  // A value that changed between the two page-1 calls is volatile, not a size.
  const at = (ts: number): RecordedRequest => get(`https://x.test/a?ts=${ts}`)
  assert.equal(
    constantSizeOf(
      row([at(1000)], [at(1000)], { page1Again: [at(2000)], page1Resized: [at(1000)] }),
    ),
    undefined,
  )
  // A size that follows the resized limit is the caller's, not a constant.
  const sized = (n: number): RecordedRequest => get(`https://x.test/a?limit=${n}`)
  assert.equal(constantSizeOf(row([sized(10)], [sized(10)])), undefined)
})

test('an unpaged method that sends a constant size breaks a declared maximum as fixed-size', () => {
  const d = checkDeclaredMax([constantPager()], (r) => classify(r, L), {})
  assert.deepEqual(d.violations, [
    {
      id: 'crm/apollo:listPipelines',
      verdict: 'fixed-size',
      declaredMax: 100,
      detail: 'ignores page and sends per_page=25 on every call',
    },
  ])
  assert.deepEqual(d.unpaged, [])
  assert.equal(
    describeViolation(d.violations[0]!),
    'crm/apollo:listPipelines fixed-size (the adapter declares maxPageSize 100, ' +
      'ignores page and sends per_page=25 on every call)',
  )
  // Without a declared maximum the ratchet alone judges it.
  const { declaredMax: _drop, ...undeclared } = constantPager()
  assert.deepEqual(checkDeclaredMax([undeclared], (r) => classify(r, L), {}).violations, [])
  // The allowlist is still the only escape.
  const allowed = checkDeclaredMax([constantPager()], (r) => classify(r, L), {
    'crm/apollo:listPipelines': 'a documented constant the upstream ignores',
  })
  assert.deepEqual(allowed.violations, [])
  assert.deepEqual(
    allowed.allowed.map((f) => f.id),
    ['crm/apollo:listPipelines'],
  )
  // The same method sending no size at all is only reported.
  const bare = get('https://api.apollo.io/api/v1/opportunity_stages')
  const unsized: ProbeRow = { ...constantPager(), ...row([bare], [bare], { page1Resized: [bare] }) }
  unsized.vertical = 'crm'
  unsized.slug = 'apollo'
  unsized.method = 'listPipelines'
  const reported = checkDeclaredMax([unsized], (r) => classify(r, L), {})
  assert.deepEqual(reported.violations, [])
  assert.deepEqual(
    reported.unpaged.map((f) => `${f.id} ${f.verdict}`),
    ['crm/apollo:listPipelines page-ignored-unsized'],
  )
})

test('gateExitCode: a declared-max failure fails every run but a --soft one, --update included', () => {
  const clean = checkDeclaredMax([], byVerdict, {})
  const violating = checkDeclaredMax(
    [declaredRow('crm/a:listDeals', 'fixed-size', 100)],
    byVerdict,
    {},
  )
  const stale = checkDeclaredMax([], byVerdict, {
    'crm/a:listDeals': 'snaps to a documented size whitelist',
  })
  const malformed = checkDeclaredMax([], byVerdict, { 'crm/a': '' }, () => false)
  assert.deepEqual(stale.staleAllowlist, ['crm/a:listDeals'])
  assert.equal(malformed.malformedAllowlist.length, 2)
  assert.deepEqual(malformed.staleAllowlist, [], 'out of scope, so only malformed')

  for (const declared of [violating, stale, malformed]) {
    assert.equal(declaredMaxFailed(declared), true)
    for (const ratchetFailed of [false, true]) {
      // The ratchet banks what it can; the invariant never banks anything.
      assert.equal(gateExitCode({ declared, ratchetFailed, update: false, soft: false }), 1)
      assert.equal(gateExitCode({ declared, ratchetFailed, update: true, soft: false }), 1)
      assert.equal(gateExitCode({ declared, ratchetFailed, update: false, soft: true }), 0)
      assert.equal(gateExitCode({ declared, ratchetFailed, update: true, soft: true }), 0)
    }
  }
  assert.equal(declaredMaxFailed(clean), false)
  // A ratchet regression or stale entry fails a plain run; --update banks it.
  assert.equal(
    gateExitCode({ declared: clean, ratchetFailed: true, update: false, soft: false }),
    1,
  )
  assert.equal(gateExitCode({ declared: clean, ratchetFailed: true, update: true, soft: false }), 0)
  assert.equal(gateExitCode({ declared: clean, ratchetFailed: true, update: false, soft: true }), 0)
  assert.equal(
    gateExitCode({ declared: clean, ratchetFailed: false, update: false, soft: false }),
    0,
  )
  // A reporter inventory that disagrees with the source is never banked either.
  for (const update of [false, true]) {
    const o = { declared: clean, ratchetFailed: false, reportersFailed: true, update }
    assert.equal(gateExitCode({ ...o, soft: false }), 1)
    assert.equal(gateExitCode({ ...o, soft: true }), 0)
  }
})

test('a banked violation still fails the gate: the ratchet passes, the invariant does not', () => {
  // Copper's old notes search, as recorded: `page_size: 25` whatever the caller
  // asked, under a declared maxPageSize of 200.
  const search = (page: number): RecordedRequest => ({
    method: 'POST',
    url: 'https://api.copper.com/developer_api/v1/notes/search',
    body: JSON.stringify({ page_size: 25, page_number: page }),
  })
  const r: ProbeRow = {
    ...row([search(1)], [search(2)]),
    vertical: 'crm',
    slug: 'copper',
    method: 'listNotes',
    declaredMax: 200,
  }
  const id = identity(r, classify(r, L))
  const fail = ratchet([id], [id])
  const ratchetFailed = fail.regressions.length > 0 || fail.stale.length > 0
  assert.equal(ratchetFailed, false, 'the baseline banks it')
  const declared = checkDeclaredMax([r], (x) => classify(x, L), {})
  assert.deepEqual(declared.staleAllowlist, [])
  assert.deepEqual(declared.malformedAllowlist, [])
  assert.equal(declared.violations.length, 1)
  assert.equal(gateExitCode({ declared, ratchetFailed, update: false, soft: false }), 1)
})

// ── interface parsing ────────────────────────────────────────────────────

test('listSignatures reads list members, parent ids and multi-line signatures, and nothing else', () => {
  const source = [
    'export interface DocSignAdapter {',
    '  listEnvelopes?(credentials: Credentials, params: QueryParams): Promise<Envelope[]>',
    '  getEnvelope?(credentials: Credentials, id: string): Promise<Envelope>',
    '  listSigners?(credentials: Credentials, envelopeId: string, params: QueryParams): Promise<Signer[]>',
    '  listDocuments?(',
    '    credentials: Credentials,',
    '    envelopeId: string,',
    '    params: QueryParams,',
    '  ): Promise<Document[]>',
    '  // listNothing(credentials, params) is a comment, not a member',
    '}',
  ].join('\n')
  assert.deepEqual(listSignatures(source), [
    { method: 'listEnvelopes', leading: [] },
    { method: 'listSigners', leading: ['envelopeId'] },
    { method: 'listDocuments', leading: ['envelopeId'] },
  ])
})

// ── identities, flags, ratchet ───────────────────────────────────────────

test('identity carries the verdict; the unmeasured identity does not', () => {
  const r = { vertical: 'docsign', slug: 'docusign', method: 'listEnvelopes' }
  assert.equal(identity(r, 'page-ignored'), 'docsign/docusign:listEnvelopes page-ignored')
  assert.equal(unmeasuredIdentity(r), 'docsign/docusign:listEnvelopes')
})

test('FAILING, UNMEASURED and the measured passes partition the verdicts', () => {
  assert.deepEqual([...FAILING].sort(), [
    'first-page-only',
    'fixed-size',
    'over-asks',
    'page-ignored',
    'page-ignored-unsized',
    'page-stride',
    'page1-skips',
  ])
  assert.deepEqual([...UNMEASURED].sort(), [
    'unmeasured-error',
    'unmeasured-no-request',
    'unmeasured-no-size',
  ])
  assert.equal(isMeasured('ok'), true)
  assert.equal(isMeasured('single-page'), true)
  assert.equal(isMeasured('local-page'), false)
  assert.equal(isMeasured('page-ignored'), true)
  assert.equal(isMeasured('page-ignored-unsized'), false)
  assert.equal(isMeasured('unmeasured-error'), false)
  const passing = VERDICTS.filter((v) => !FAILING.has(v) && !UNMEASURED.has(v))
  assert.deepEqual(passing, ['ok', 'refused', 'single-page', 'local-page'])
  assert.equal(VERDICTS.length, new Set(VERDICTS).size)
})

// ── page size at the router's ceiling ────────────────────────────────────

/** A row whose method sends `sizeAt(limit)` as `per_page`. */
function sized(sizeAt: (limit: number) => number, opts: { declaredMax?: number } = {}): ProbeRow {
  const at = (page: number, limit: number) =>
    get(`https://api.fake.test/orders?page=${page}&per_page=${sizeAt(limit)}`)
  return {
    ...row([at(1, L)], [at(2, L)], { page1Resized: [at(1, RESIZED_LIMIT)] }),
    page1Ceiling: call([at(1, CEILING_LIMIT)]),
    ...(opts.declaredMax !== undefined ? { declaredMax: opts.declaredMax } : {}),
  }
}

test('sizeAtCeiling reads the size a method sends at the router ceiling', () => {
  assert.equal(CEILING_LIMIT, 500)
  assert.equal(sizeAtCeiling(sized((l) => l)), 500)
  assert.equal(sizeAtCeiling(sized((l) => Math.min(l, 25))), 25)
  // No ceiling call recorded, or no size that followed the limit: unknown.
  const { page1Ceiling: _drop, ...noCeiling } = sized((l) => l)
  assert.equal(sizeAtCeiling(noCeiling as ProbeRow), undefined)
  assert.equal(sizeAtCeiling(sized(() => 20)), undefined)
})

test('clampIdentity names a method that sends less than the router asks for', () => {
  // Plaid: clamps to 25 and declared nothing, so the router asked for 100 by
  // default and read the 25 it got back as the last page.
  assert.equal(
    clampIdentity(sized((l) => Math.min(l, 25))),
    'accounting/fixture:listInvoices serves 25 of 500',
  )
  // Declaring the clamp is the fix: the router asks for 25.
  assert.equal(clampIdentity(sized((l) => Math.min(l, 25), { declaredMax: 25 })), undefined)
  // A declaration above the method's own ceiling is not (JD.com promotions).
  assert.equal(
    clampIdentity(sized((l) => Math.min(l, 10), { declaredMax: 50 })),
    'accounting/fixture:listInvoices serves 10 of 50',
  )
  // Following the limit to the ceiling, or to the declared maximum, passes.
  assert.equal(clampIdentity(sized((l) => l)), undefined)
  assert.equal(clampIdentity(sized((l) => Math.min(l, 250), { declaredMax: 250 })), undefined)
})

test('clampIdentity accepts a page size the method reported, at or below what it sent', () => {
  const reported = (n: number): ProbeRow => {
    const r = sized((l) => Math.min(l, 10), { declaredMax: 50 })
    return { ...r, page1Ceiling: { ...r.page1Ceiling!, reportedPageSize: n } }
  }
  assert.equal(clampIdentity(reported(10)), undefined)
  // A report larger than what was sent does not excuse the short page.
  assert.equal(clampIdentity(reported(50)), 'accounting/fixture:listInvoices serves 10 of 50')
})

test('parseFlags reads every flag and refuses --update with --only', () => {
  const f = parseFlags(['--soft', '--report', '--json=/tmp/x.json', '--only=crm/hubspot'])
  assert.equal(f.soft, true)
  assert.equal(f.report, true)
  assert.equal(f.update, false)
  assert.equal(f.json, '/tmp/x.json')
  assert.deepEqual(f.only, { vertical: 'crm', slug: 'hubspot' })
  assert.equal(f.error, undefined)
  assert.deepEqual(parseFlags(['--only=crm']).only, { vertical: 'crm' })
  assert.match(parseFlags(['--update', '--only=crm']).error ?? '', /--only/)
  assert.match(parseFlags(['--bogus']).error ?? '', /--bogus/)
})

test('parseFlags refuses an --only that is not <vertical> or <vertical>/<slug>', () => {
  // Each of these used to probe adapters, compare against nothing and print OK.
  for (const bad of ['crm/', 'crm/apollo/', 'crm/apollo/x', '/apollo', '', 'CRM']) {
    const f = parseFlags([`--only=${bad}`])
    assert.match(f.error ?? '', /--only/, `--only=${bad} is refused`)
    assert.equal(f.only, undefined)
  }
})

test('parseOnly splits a scope and refuses anything else', () => {
  assert.deepEqual(parseOnly('crm'), { vertical: 'crm' })
  assert.deepEqual(parseOnly('crm/cin7-core'), { vertical: 'crm', slug: 'cin7-core' })
  assert.equal(parseOnly('crm/'), undefined)
  assert.equal(parseOnly('crm/a/b'), undefined)
})

test('ratchet fails a new identity and a stale one, and a verdict change is both', () => {
  const baseline = ['crm/a:listDeals page-ignored', 'crm/b:listDeals fixed-size']
  const produced = ['crm/a:listDeals over-asks', 'crm/b:listDeals fixed-size']
  const { regressions, stale } = ratchet(produced, baseline)
  assert.deepEqual(regressions, ['crm/a:listDeals over-asks'])
  assert.deepEqual(stale, ['crm/a:listDeals page-ignored'])
})

test('scopeFilter limits the ratchet to the --only subset', () => {
  const baseline = ['crm/a:listDeals page-ignored', 'ecommerce/a:listOrders page-ignored']
  const inCrm = scopeFilter({ vertical: 'crm' })
  assert.deepEqual(ratchet([], baseline, inCrm).stale, ['crm/a:listDeals page-ignored'])
  assert.equal(inCrm('crmx/a:listDeals page-ignored'), false)
  const inSlug = scopeFilter({ vertical: 'crm', slug: 'a' })
  assert.equal(inSlug('crm/a:listDeals page-ignored'), true)
  assert.equal(inSlug('crm/ab:listDeals page-ignored'), false)
  assert.equal(inSlug('crm/a:ctor'), true)
  assert.equal(scopeFilter(undefined)('anything'), true)
})

// ── harness verdict: the gate never passes on an empty measurement ───────

test('harnessProblems fails a sweep that measured nothing, even a one-adapter one', () => {
  const none = { escapes: [], measured: 0, total: 40, declared: 5 }
  assert.equal(harnessProblems(none).length, 1)
  assert.equal(harnessProblems({ ...none, only: { vertical: 'crm', slug: 'a' } }).length, 1)
  assert.match(harnessProblems({ ...none, total: 0 })[0] ?? '', /no list method/)
})

test('harnessProblems passes a scoped sweep whose methods all page locally, but not a full one', () => {
  // `--only=ecommerce/eposnow`: 9 local-page rows, none counted as coverage,
  // yet each proves the probe ran the method and read its report.
  const local = { escapes: [], measured: 0, local: 9, total: 9, declared: 9 }
  assert.deepEqual(
    harnessProblems({ ...local, only: { vertical: 'ecommerce', slug: 'eposnow' } }),
    [],
  )
  assert.match(
    harnessProblems({ ...local, local: 0, only: { vertical: 'ecommerce' } })[0] ?? '',
    /no list method/,
  )
  // A full sweep still needs its floor of measured rows.
  assert.match(harnessProblems(local)[0] ?? '', /floor/)
})

test('harnessProblems fails a full sweep below the coverage floor, and only a full sweep', () => {
  const total = 8000
  const below = Math.floor(total * MIN_MEASURED_SHARE) - 1
  const declared = 185
  assert.match(harnessProblems({ escapes: [], measured: below, total, declared })[0] ?? '', /floor/)
  assert.deepEqual(
    harnessProblems({
      escapes: [],
      measured: Math.ceil(total * MIN_MEASURED_SHARE),
      total,
      declared,
    }),
    [],
  )
  // One vertical's share varies too much for a fixed floor (docsign's
  // unpaginated sub-resources), so a scoped run checks only "measured anything".
  assert.deepEqual(
    harnessProblems({ escapes: [], measured: 1, total, declared, only: { vertical: 'docsign' } }),
    [],
  )
  // The floor sits near the real level, so one --update cannot bank a collapse.
  assert.ok(MIN_MEASURED_SHARE >= 0.7, `floor ${MIN_MEASURED_SHARE} is near the measured level`)
})

test('harnessProblems fails any sweep a request escaped, whatever it measured', () => {
  const p = harnessProblems({
    escapes: ['a socket to api.example.test:443'],
    measured: 10,
    total: 10,
    declared: 1,
  })
  assert.equal(p.length, 1)
  assert.match(p[0]!, /api\.example\.test:443/)
})

test('blockNetwork refuses and counts a socket and both DNS lookups, then restores them', async () => {
  const connect = net.Socket.prototype.connect
  const lookup = dns.lookup
  const lookupAsync = dns.promises.lookup
  const escapes: string[] = []
  const restore = blockNetwork(escapes)
  try {
    const socketError = await new Promise<Error>((resolve) => {
      const s = net.connect({ host: '192.0.2.1', port: 443 })
      s.on('error', resolve)
    })
    assert.match(socketError.message, /refused a socket to 192\.0\.2\.1:443/)
    const lookupError = await new Promise<Error | null>((resolve) =>
      dns.lookup('example.test', (err) => resolve(err)),
    )
    assert.match(lookupError?.message ?? '', /refused a DNS lookup of example\.test/)
    await assert.rejects(dns.promises.lookup('example.test'), /refused a DNS lookup/)
    assert.equal(escapes.length, 3)
  } finally {
    restore()
  }
  assert.equal(net.Socket.prototype.connect, connect)
  assert.equal(dns.lookup, lookup)
  assert.equal(dns.promises.lookup, lookupAsync)
})

test('isMainModule recognises the script run through a symlinked path', () => {
  const script = fileURLToPath(new URL('./check-paging-contract.ts', import.meta.url))
  const dir = mkdtempSync(join(tmpdir(), 'paging-contract-'))
  try {
    // The reviewer's case: the whole checkout reached through a symlink, so
    // argv[1] and import.meta.url name the same file by different paths.
    symlinkSync(join(REPO_ROOT, 'scripts'), join(dir, 'scripts'))
    const url = pathToFileURL(script).href
    assert.equal(isMainModule(join(dir, 'scripts', 'check-paging-contract.ts'), url), true)
    assert.equal(isMainModule(script, url), true)
    assert.equal(
      isMainModule(join(REPO_ROOT, 'scripts', 'check-paging-contract.test.ts'), url),
      false,
    )
    assert.equal(isMainModule(undefined, url), false)
    assert.equal(isMainModule(join(dir, 'missing.ts'), url), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('every baseline is sorted and deduplicated', () => {
  for (const name of [
    'paging-contract-baseline.json',
    'paging-contract-unmeasured-baseline.json',
    'paging-contract-clamp-baseline.json',
  ]) {
    const path = join(REPO_ROOT, 'scripts', name)
    assert.ok(existsSync(path), `${name} exists`)
    const ids: string[] = JSON.parse(readFileSync(path, 'utf8'))
    assert.deepEqual(ids, [...new Set(ids)].sort(), `${name} is sorted and deduplicated`)
  }
})

// ── end to end: probeMethod over the adapters' own axios ─────────────────

// The same module instance adapters get, resolved from the app that owns them.
const appRequire = createRequire(join(REPO_ROOT, 'apps/integration-server/package.json'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const axios = appRequire('axios') as any

type ListParams = { page?: number; limit?: number }

/** What the sweep reads from shared's built dist, taken from its source instead. */
const SHARED = {
  parseListQuery,
  readUpstreamPage: readUpstreamPage as (params: never) => ReturnType<typeof readUpstreamPage>,
  _resetCursorPager,
  _cursorPagerSize,
}

async function probeFake(adapter: object, drainMs = 0): Promise<ProbeRow> {
  const method = 'listOrders'
  const recorder = createRecorder({ getUri: (config) => axios.getUri(config) })
  const savedAdapter = axios.defaults.adapter
  const savedFetch = globalThis.fetch
  axios.defaults.adapter = recorder.axiosAdapter
  globalThis.fetch = recorder.fetch
  try {
    // Wired exactly as the sweep wires a loaded shared, here from its source.
    const calls = await probeMethod(adapter, method, {
      recorder,
      ...sharedProbeDeps(SHARED),
      credentials: { accessToken: 'stub' },
      timeoutMs: 1000,
    })
    // Let a straggler from a timed-out call land on the recorder, not the network.
    if (drainMs > 0) await new Promise((resolve) => setTimeout(resolve, drainMs))
    return { vertical: 'fake', slug: 'fake', method, ...calls }
  } finally {
    axios.defaults.adapter = savedAdapter
    globalThis.fetch = savedFetch
  }
}

test('probeMethod: an adapter that pages by {page, per_page: limit} is ok', async () => {
  const good = {
    async listOrders(_c: unknown, params: ListParams) {
      await axios.get('https://api.fake.test/orders', {
        params: { page: params.page ?? 1, per_page: params.limit },
      })
      return []
    },
  }
  const r = await probeFake(good)
  assert.equal(r.page1.requests.length, 1)
  assert.equal(r.page1.requests[0]!.url, 'https://api.fake.test/orders?page=1&per_page=10')
  assert.equal(r.page2.requests[0]!.url, 'https://api.fake.test/orders?page=2&per_page=10')
  // Page 1 again at the resized limit: a size has to follow the limit.
  assert.equal(r.page1Resized.requests[0]!.url, 'https://api.fake.test/orders?page=1&per_page=7')
  assert.equal(classify(r, L), 'ok')
})

test('probeMethod: a size clamped below the router ceiling is measured at the ceiling', async () => {
  const clamped = {
    async listOrders(_c: unknown, params: ListParams) {
      await axios.get('https://api.fake.test/orders', {
        params: { page: params.page ?? 1, per_page: Math.min(params.limit ?? 25, 25) },
      })
      return []
    },
  }
  const r = await probeFake(clamped)
  assert.equal(r.page1Ceiling?.requests[0]!.url, 'https://api.fake.test/orders?page=1&per_page=25')
  assert.equal(classify(r, L), 'ok')
  assert.equal(sizeAtCeiling(r), 25)
  assert.equal(clampIdentity(r), 'fake/fake:listOrders serves 25 of 500')
})

test('probeMethod: a clamped method that reports its page size is not a finding', async () => {
  const reporting = {
    async listOrders(_c: unknown, params: ListParams) {
      const size = Math.min(params.limit ?? 25, 25)
      reportUpstreamPage(params as never, { pageSize: size })
      await axios.get('https://api.fake.test/orders', {
        params: { page: params.page ?? 1, per_page: size },
      })
      return []
    },
  }
  const r = await probeFake(reporting)
  assert.equal(r.page1Ceiling?.reportedPageSize, 25)
  assert.equal(clampIdentity(r), undefined)
})

test('probeMethod: a page numbered from 0 and sent + 1 is page1-skips', async () => {
  const offByOne = {
    async listOrders(_c: unknown, params: ListParams) {
      await axios.get('https://api.fake.test/orders', {
        params: { page_no: (params.page ?? 0) + 1, page_size: params.limit },
      })
      return []
    },
  }
  assert.equal(classify(await probeFake(offByOne), L), 'page1-skips')
})

test('probeMethod: an unpaginated list answered empty past page 1 is single-page', async () => {
  const whole = {
    async listOrders(_c: unknown, params: ListParams) {
      if ((params.page ?? 1) > 1) return []
      await axios.get('https://api.fake.test/locations')
      return []
    },
  }
  assert.equal(classify(await probeFake(whole), L), 'single-page')
})

test('probeMethod: a size whitelist that drops the resized limit is fixed-size', async () => {
  const allowed = [10, 20, 50]
  const whitelist = {
    async listOrders(_c: unknown, params: ListParams) {
      const limit = allowed.includes(params.limit ?? 0) ? params.limit : 20
      await axios.get('https://api.fake.test/templates', { params: { page: params.page, limit } })
      return []
    },
  }
  assert.equal(classify(await probeFake(whitelist), L), 'fixed-size')
})

test('probeMethod: a lookup the stub cannot satisfy is unmeasured-error, not page-ignored', async () => {
  const needsLookup = {
    async listOrders(_c: unknown, params: ListParams) {
      const res = await axios.get('https://api.fake.test/contact-types')
      const type = (res.data as { types?: Array<{ id: string }> }).types?.[0]
      if (!type) throw new Error('could not resolve a contact type')
      await axios.get('https://api.fake.test/contacts', {
        params: { page: params.page, limit: params.limit, type: type.id },
      })
      return []
    },
  }
  assert.equal(classify(await probeFake(needsLookup), L), 'unmeasured-error')
})

test('probeMethod: the same adapter ignoring `page` is page-ignored — the check can fail', async () => {
  const ignoresPage = {
    async listOrders(_c: unknown, params: ListParams) {
      await axios.get('https://api.fake.test/orders', { params: { per_page: params.limit } })
      return []
    },
  }
  assert.equal(classify(await probeFake(ignoresPage), L), 'page-ignored')
})

test('probeMethod: offset = page × limit is page1-skips', async () => {
  const skips = {
    async listOrders(_c: unknown, params: ListParams) {
      const limit = params.limit ?? 100
      await axios.get('https://api.fake.test/orders', {
        params: { offset: (params.page ?? 0) * limit, limit },
      })
      return []
    },
  }
  assert.equal(classify(await probeFake(skips), L), 'page1-skips')
})

test('probeMethod: fetch-based adapters are recorded too, JSON body included', async () => {
  const viaFetch = {
    async listOrders(_c: unknown, params: ListParams) {
      await fetch('https://api.fake.test/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ size: params.limit, from: ((params.page ?? 1) - 1) * 10 }),
      })
      return []
    },
  }
  const r = await probeFake(viaFetch)
  assert.equal(r.page2.requests[0]!.body, '{"size":10,"from":10}')
  assert.equal(classify(r, L), 'ok')
})

test('probeMethod: a clock that ticks once, before the third call, does not pass for a page move', async () => {
  // Page 2 is probed BETWEEN the two page-1 calls. Probed last, the tick would
  // land on page 2 alone and read as a position change on an adapter that
  // ignores `page`; in the middle, the tick lands on the second page-1 call
  // and marks the value volatile.
  let calls = 0
  const ticking = {
    async listOrders(_c: unknown, params: ListParams) {
      calls++
      const ts = calls >= 3 ? '1790113537' : '1790113536'
      await axios.get('https://api.fake.test/orders', { params: { per_page: params.limit, ts } })
      return []
    },
  }
  const r = await probeFake(ticking)
  assert.equal(classify(r, L), 'page-ignored')
})

test('probeMethod: a walk through the shared cursor pager is marked usedPager', async () => {
  const cursorAdapter = {
    async listOrders(_c: unknown, params: ListParams) {
      const res = await pageByCursor<unknown, string>(
        'fake::orders',
        params.page,
        async (cursor) => {
          const r = await axios.get('https://api.fake.test/orders', {
            params: { first: params.limit, after: cursor },
          })
          return { items: [], next: r.data?.next ?? null }
        },
      )
      return res.items
    },
  }
  const r = await probeFake(cursorAdapter)
  assert.equal(r.page1.usedPager, true)
  assert.equal(classify(r, L), 'ok')
})

test('probeMethod: pageLocally over an unpaginated endpoint is local-page', async () => {
  // Every page fetches the whole list and slices it, so page 2 repeats page
  // 1's request. The report is what tells that apart from ignoring `page`.
  const whole = {
    async listOrders(_c: unknown, params: ListParams) {
      const res = await axios.get('https://api.fake.test/warehouses')
      const all = ((res.data as { warehouses?: unknown[] }).warehouses ?? []) as unknown[]
      return pageLocally(all, params as QueryParams)
    },
  }
  const r = await probeFake(whole)
  assert.equal(r.page1.pagedLocally, true)
  assert.equal(r.page2.pagedLocally, true)
  assert.deepEqual(
    r.page2.requests.map((q) => q.url),
    r.page1.requests.map((q) => q.url),
  )
  assert.equal(classify(r, L), 'local-page')
})

test('probeMethod: pageByRows over fixed 250-row upstream pages is local-page', async () => {
  const batches = {
    async listOrders(_c: unknown, params: ListParams) {
      const res = await pageByRows<unknown, string>(
        'fake::orders#rows::limit=250',
        params as QueryParams,
        async (cursor) => {
          const r = await axios.get('https://api.fake.test/orders', {
            params: { limit: 250, after: cursor },
          })
          const body = r.data as { orders?: unknown[]; next?: string }
          return { items: body.orders ?? [], next: body.next ?? null }
        },
      )
      return res.items
    },
  }
  const r = await probeFake(batches)
  assert.equal(r.page1.pagedLocally, true)
  // The stub's page is empty with no cursor: the pager knows the end, so page 2 asks nothing.
  assert.equal(r.page2.requests.length, 0)
  assert.equal(classify(r, L), 'local-page')
})

test('probeMethod: pageLocally over one page sized by the limit is page-ignored', async () => {
  const truncating = {
    async listOrders(_c: unknown, params: ListParams) {
      const res = await axios.get('https://api.fake.test/orders', {
        params: { limit: params.limit },
      })
      const one = ((res.data as { orders?: unknown[] }).orders ?? []) as unknown[]
      return pageLocally(one, params as QueryParams)
    },
  }
  const r = await probeFake(truncating)
  assert.equal(r.page1.pagedLocally, true)
  assert.equal(classify(r, L), 'page-ignored')
})

test('probeMethod: a hand-rolled window that reports pagedLocally is local-page (lumin-sign 10/25/50)', async () => {
  // The upstream size snaps to a whitelist, so by value it does not follow the
  // limit; the page served does, and the window says so.
  const allowed = [10, 25, 50]
  const snapped = {
    async listOrders(_c: unknown, params: ListParams) {
      const limit = params.limit ?? 50
      const size = allowed.find((a) => a >= limit) ?? 50
      const start = ((params.page ?? 1) - 1) * limit
      await axios.get('https://api.fake.test/templates', {
        params: { page: Math.floor(start / size) + 1, limit: size },
      })
      reportUpstreamPage(params as never, { pagedLocally: true })
      return []
    },
  }
  const r = await probeFake(snapped)
  assert.equal(r.page1Resized.requests[0]!.url, 'https://api.fake.test/templates?page=1&limit=10')
  const { pagedLocally: _unreported, ...unreported } = r.page1
  assert.equal(classify({ ...r, page1: unreported }, L), 'fixed-size')
  assert.equal(classify(r, L), 'local-page')
})

test('probeMethod: an adapter that reports nothing is not paged locally', async () => {
  const plain = {
    async listOrders(_c: unknown, params: ListParams) {
      await axios.get('https://api.fake.test/orders', {
        params: { page: params.page, limit: params.limit },
      })
      return []
    },
  }
  const r = await probeFake(plain)
  assert.equal(r.page1.pagedLocally, undefined)
  assert.equal(r.page2.pagedLocally, undefined)
})

test('probeMethod: only an explicit pagedLocally: true is paged locally, not any other report', async () => {
  // Every page fetches the same unpaginated list, so on its requests alone the
  // method is page-ignored-unsized. A reader that took any report (hasMore,
  // pageSize, totalCount) or `pagedLocally: false` for the flag would pass it
  // as local-page, and pass hubspot- or otto-style reporters with it.
  const reporting = (meta: Parameters<typeof reportUpstreamPage>[1]) => ({
    async listOrders(_c: unknown, params: ListParams) {
      await axios.get('https://api.fake.test/stages')
      reportUpstreamPage(params as never, meta)
      return []
    },
  })
  for (const meta of [
    { hasMore: true, pageSize: 5 },
    { totalCount: 3, hasMore: false },
    { pagedLocally: false },
  ]) {
    const r = await probeFake(reporting(meta))
    const what = JSON.stringify(meta)
    assert.equal(r.page1.pagedLocally, undefined, what)
    assert.equal(r.page2.pagedLocally, undefined, what)
    assert.equal(classify(r, L), 'page-ignored-unsized', what)
  }
  const flagged = await probeFake(reporting({ pagedLocally: true }))
  assert.equal(classify(flagged, L), 'local-page')
})

test('probeMethod: a request made after the timeout is not credited to the next probe', async () => {
  const slow = {
    async listOrders() {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await axios.get('https://api.fake.test/late')
      return []
    },
  }
  const r = await probeFake(slow, 700)
  assert.match(r.page1.error ?? '', /timed out/)
  // Each call's late request fires while the NEXT call is running.
  assert.equal(r.page1.requests.length, 0)
  assert.equal(r.page2.requests.length, 0)
  assert.equal(r.page1Again.requests.length, 0)
  assert.equal(r.page1Resized.requests.length, 0)
  assert.equal(r.page1Ceiling?.requests.length, 0)
  assert.equal(classify(r, L), 'unmeasured-no-request')
})

// ── the sweep's wiring to @opensteward/shared ─────────────────────────────

test("the sweep hands each probe shared's own parseListQuery, pager hooks and readUpstreamPage", () => {
  // Every probeMethod test above goes through this wiring, so a reader that
  // lost `pagedLocally` or `pageSize` fails them; this pins the mapping.
  const deps = sharedProbeDeps(SHARED)
  assert.equal(deps.parseListQuery, parseListQuery)
  assert.equal(deps.readUpstreamPage, SHARED.readUpstreamPage)
  assert.equal(deps.resetCursorPager, _resetCursorPager)
  assert.equal(deps.cursorPagerSize, _cursorPagerSize)
})

test('a stale shared dist without readUpstreamPage, declaredPageMax or pageByRows is refused', () => {
  const complete = Object.fromEntries(REQUIRED_SHARED_EXPORTS.map((n) => [n, () => undefined]))
  assert.deepEqual(missingSharedExports(complete), [])
  const { readUpstreamPage: _r, declaredPageMax: _d, pageByRows: _p, ...stale } = complete
  assert.deepEqual(missingSharedExports(stale), [
    'declaredPageMax',
    'readUpstreamPage',
    'pageByRows',
  ])
  assert.deepEqual(missingSharedExports(undefined), [...REQUIRED_SHARED_EXPORTS])
})

test('a shared dist whose pagers report the flag under another name is refused as stale', async () => {
  const current = { withPageSink, readUpstreamPage, pageLocally, pageByRows }
  assert.deepEqual(await stalePagedLocallyReporters(current as never), [])
  // Built before the flag took its name: every export is there, so only
  // calling the pagers shows they report `servedLocally` instead.
  const renamed = {
    ...current,
    pageLocally: (rows: readonly unknown[], params: QueryParams) => {
      reportUpstreamPage(params, { hasMore: true, servedLocally: true } as never)
      return rows.slice(0, 1)
    },
    pageByRows: async (_key: string, params: QueryParams) => {
      reportUpstreamPage(params, { hasMore: true, servedLocally: true } as never)
      return { items: [1], hasMore: true }
    },
  }
  assert.deepEqual(
    missingSharedExports({ ...SHARED, ...renamed, declaredPageMax, setDnsResolver: () => {} }),
    [],
  )
  assert.deepEqual(await stalePagedLocallyReporters(renamed as never), [
    'pageLocally',
    'pageByRows',
  ])
  assert.deepEqual(
    await stalePagedLocallyReporters({ ...current, pageByRows: renamed.pageByRows } as never),
    ['pageByRows'],
  )
})

// ── refused: a list the platform cannot serve, refused before any request ─

/** What adapters throw for a list the platform cannot serve. */
function notSupported(code: unknown = 'NOT_SUPPORTED', statusCode: unknown = 501): Error {
  return Object.assign(new Error('listFoo is not supported by this platform'), { statusCode, code })
}

/** A call that threw a refusal after sending `requests` (none, by default). */
function refusal(requests: RecordedRequest[] = []): ProbeCall {
  return {
    requests,
    error: 'listFoo is not supported by this platform',
    usedPager: false,
    refused: true,
  }
}

/** A row whose every probe call, the ceiling one included, is `each`. */
function refusedRow(each: ProbeCall, overrides: Partial<ProbeRow> = {}): ProbeRow {
  return {
    vertical: 'crm',
    slug: 'fixture',
    method: 'listNotes',
    page1: each,
    page2: each,
    page1Again: each,
    page1Resized: each,
    page1Ceiling: each,
    ...overrides,
  }
}

// The gate leaves a refusal out of coverage because the sync worker skips it.
// If the worker's predicate moves, the gate must move with it: the same verdict
// on every well-formed error. (The gate's copy also survives throwing getters
// and thrown functions, which the worker never sees from an adapter.)
test('isRefusal agrees with the sync worker predicate it mirrors', () => {
  const cases: unknown[] = [
    notSupported(),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
    notSupported('NOT_IMPLEMENTED'),
    notSupported(null),
    notSupported('NOT_SUPPORTED', 500),
    notSupported('NOT_SUPPORTED', '501'),
    { code: 'NOT_SUPPORTED' },
    { statusCode: 501 },
    new Error('NOT_SUPPORTED'),
    null,
    undefined,
    'NOT_SUPPORTED',
    501,
  ]
  for (const err of cases)
    assert.equal(isRefusal(err), workerIsRefusal(err), `disagree on ${String(err)}`)
})

test('isRefusal: statusCode 501 with code NOT_SUPPORTED, read defensively', () => {
  assert.equal(isRefusal(notSupported()), true)
  // A plain object thrown is read the same as an Error.
  assert.equal(isRefusal({ statusCode: 501, code: 'NOT_SUPPORTED' }), true)
  assert.equal(isRefusal(notSupported('NOT_IMPLEMENTED')), false)
  assert.equal(isRefusal(notSupported(null)), false)
  assert.equal(isRefusal(notSupported('NOT_SUPPORTED', 500)), false)
  assert.equal(isRefusal(notSupported('NOT_SUPPORTED', '501')), false)
  assert.equal(isRefusal(new Error('NOT_SUPPORTED')), false)
  for (const thrown of [null, undefined, 'NOT_SUPPORTED', 501])
    assert.equal(isRefusal(thrown), false, `${String(thrown)} is not a refusal`)
  const hostile = Object.defineProperty(new Error('x'), 'statusCode', {
    get() {
      throw new Error('getter throws')
    },
  })
  assert.equal(isRefusal(hostile), false)
})

test('a list refused before any request, on every probe call, is refused', () => {
  const r = refusedRow(refusal())
  assert.equal(classify(r, L), 'refused')
  // Without a ceiling call (it did not run), the rest decide.
  const { page1Ceiling: _c, ...noCeiling } = r
  assert.equal(classify(noCeiling, L), 'refused')
})

test('a 501 whose code is anything else is not refused', () => {
  // `refused` is set only by isRefusal, so a 501 NOT_IMPLEMENTED is a plain
  // error call: page 1 sent nothing, as before.
  const other: ProbeCall = { requests: [], error: 'not implemented', usedPager: false }
  assert.equal(classify(refusedRow(other), L), 'unmeasured-no-request')
})

test('a refusal after a request is not refused: it is judged on its requests', () => {
  const token = { method: 'POST', url: 'https://api.fake.test/oauth/token', body: 'grant=x' }
  const v = classify(refusedRow(refusal([token])), L)
  assert.notEqual(v, 'refused')
  assert.equal(v, 'unmeasured-error')
  // Only page 2 sent something first: the calls disagree.
  assert.notEqual(classify(refusedRow(refusal(), { page2: refusal([token]) }), L), 'refused')
})

test('page 1 refusing while page 2 does not is not refused', () => {
  const answered: ProbeCall = { requests: [], error: null, usedPager: false }
  assert.equal(classify(refusedRow(refusal(), { page2: answered }), L), 'unmeasured-no-request')
  // Any other probe call that disagrees rules it out too, the ceiling one included.
  for (const which of ['page1Again', 'page1Resized', 'page1Ceiling'] as const)
    assert.notEqual(classify(refusedRow(refusal(), { [which]: answered }), L), 'refused', which)
  // And the other way round: only page 2 refuses.
  assert.notEqual(classify(refusedRow(answered, { page2: refusal() }), L), 'refused')
})

test('probeMethod records a zero-request refusal, and classify reads it as refused', async () => {
  const refusing = {
    async listOrders() {
      throw notSupported()
    },
  }
  const r = await probeFake(refusing)
  assert.equal(r.page1.refused, true)
  assert.equal(r.page2.refused, true)
  assert.equal(classify(r, L), 'refused')
  // A 501 with another code is recorded as an error, not a refusal.
  const other = await probeFake({
    async listOrders() {
      throw notSupported('NOT_IMPLEMENTED')
    },
  })
  assert.equal(other.page1.refused, undefined)
  assert.equal(classify(other, L), 'unmeasured-no-request')
  // A refusal that sent a request first keeps the flag, but is not refused.
  const late = await probeFake({
    async listOrders() {
      await axios.get('https://api.fake.test/me')
      throw notSupported()
    },
  })
  assert.equal(late.page1.refused, true)
  assert.equal(late.page1.requests.length, 1)
  assert.notEqual(classify(late, L), 'refused')
})

test('refused passes, is neither failing nor unmeasured, and is not coverage', () => {
  assert.equal(VERDICTS.includes('refused'), true)
  assert.equal(FAILING.has('refused'), false)
  assert.equal(UNMEASURED.has('refused'), false)
  assert.equal(isMeasured('refused'), false)
})

test('coverage leaves refused methods out of the denominator as well as the numerator', () => {
  assert.equal(coverageShare(75, 100), 0.75)
  assert.equal(coverageShare(75, 100, 20), 75 / 80)
  assert.equal(coverageShare(0, 10, 10), 0)
  assert.equal(coverageShare(0, 0), 0)
})

test('the coverage floor uses the share without refused methods', () => {
  const total = 8000
  const declared = 185
  // Under the floor over every method, over it once refusals are left out.
  const measured = Math.floor(total * MIN_MEASURED_SHARE) - 50
  assert.match(harnessProblems({ escapes: [], measured, total, declared })[0] ?? '', /floor/)
  assert.deepEqual(harnessProblems({ escapes: [], measured, total, declared, refused: 200 }), [])
  // Refusals do not stand in for measurement: a sweep of nothing else fails.
  assert.match(
    harnessProblems({ escapes: [], measured: 0, total: 5, declared: 1, refused: 5 })[0] ?? '',
    /no list method/,
  )
})

test('refused is not a declared-max violation, nor unpaged, nor unmeasured', () => {
  assert.equal(DECLARED_MAX_VIOLATIONS.has('refused'), false)
  assert.equal(DECLARED_MAX_UNPAGED.has('refused'), false)
  const r = refusedRow(refusal(), { declaredMax: 100 })
  const d = checkDeclaredMax([r], (x) => classify(x, L), {})
  assert.equal(classify(r, L), 'refused')
  assert.deepEqual(d.violations, [])
  assert.deepEqual(d.unpaged, [])
  assert.deepEqual(d.unmeasured, [])
  assert.equal(declaredMaxFailed(d), false)
  // Nor is it a clamp: it sent nothing at the ceiling.
  assert.equal(clampIdentity(r), undefined)
})

// ── per-identity stub envelopes ──────────────────────────────────────────

const ORDERS_ENVELOPE: StubEnvelope = {
  method: 'GET',
  path: /^\/v2\/orders\/$/,
  body: { orders: [] },
}

/** A recorder installed on the adapters' axios and on fetch for the length of `fn`. */
async function withRecorder<T>(
  fn: (r: ReturnType<typeof createRecorder>) => Promise<T>,
): Promise<T> {
  const recorder = createRecorder({ getUri: (config) => axios.getUri(config) })
  const savedAdapter = axios.defaults.adapter
  const savedFetch = globalThis.fetch
  axios.defaults.adapter = recorder.axiosAdapter
  globalThis.fetch = recorder.fetch
  try {
    return await fn(recorder)
  } finally {
    axios.defaults.adapter = savedAdapter
    globalThis.fetch = savedFetch
  }
}

test('envelope: answers only a request whose method and path both match', async () => {
  const seen = await withRecorder(async (recorder) => {
    const got: unknown[] = []
    const { error } = await recorder.run(
      async () => {
        got.push((await axios.get('https://api.fake.test/v2/orders/?page=1')).data)
        got.push((await axios.post('https://api.fake.test/v2/orders/')).data)
        got.push((await axios.get('https://api.fake.test/v2/orders/7/')).data)
        got.push(await (await fetch('https://api.fake.test/v2/orders/')).json())
        got.push(await (await fetch('https://api.fake.test/v2/stores/')).json())
      },
      1000,
      [ORDERS_ENVELOPE],
    )
    assert.equal(error, null)
    return got
  })
  assert.deepEqual(seen, [
    { orders: [] },
    STUB_RESPONSE,
    STUB_RESPONSE,
    { orders: [] },
    STUB_RESPONSE,
  ])
})

test('envelope: a token exchange in the same probe still gets STUB_RESPONSE', async () => {
  const seen = await withRecorder(async (recorder) => {
    const got: unknown[] = []
    await recorder.run(
      async () => {
        got.push((await axios.post('https://api.fake.test/v2/auth/token/', { a: 1 })).data)
        got.push((await axios.get('https://api.fake.test/v2/orders/')).data)
        got.push(
          await (await fetch('https://api.fake.test/oauth/token', { method: 'POST' })).json(),
        )
      },
      1000,
      [ORDERS_ENVELOPE],
    )
    return got
  })
  assert.deepEqual(seen, [STUB_RESPONSE, { orders: [] }, STUB_RESPONSE])
})

test('envelope: each answer is a fresh copy, so an adapter mutating one cannot change the next', async () => {
  const seen = await withRecorder(async (recorder) => {
    const got: unknown[] = []
    await recorder.run(
      async () => {
        const first = (await axios.get('https://api.fake.test/v2/orders/')).data
        first.orders.push('row')
        got.push((await axios.get('https://api.fake.test/v2/orders/')).data)
      },
      1000,
      [ORDERS_ENVELOPE],
    )
    return got
  })
  assert.deepEqual(seen, [{ orders: [] }])
  assert.deepEqual(ORDERS_ENVELOPE.body, { orders: [] })
})

test('envelope: a text body (an XML document) is served as text', async () => {
  const xml = '<?xml version="1.0"?><productConfiguration></productConfiguration>'
  const seen = await withRecorder(async (recorder) => {
    const got: unknown[] = []
    await recorder.run(
      async () => {
        got.push((await axios.get('https://api.fake.test/x/config', { responseType: 'text' })).data)
        got.push(await (await fetch('https://api.fake.test/x/config')).text())
      },
      1000,
      [{ method: 'GET', path: /^\/x\/config$/, body: xml }],
    )
    return got
  })
  assert.deepEqual(seen, [xml, xml])
})

test('envelope: a concurrent probe without it, on the same URL, gets STUB_RESPONSE', async () => {
  const [withEnv, without] = await withRecorder(async (recorder) => {
    const probe = (envelopes: StubEnvelope[] | undefined): Promise<unknown[]> => {
      const got: unknown[] = []
      return recorder
        .run(
          async () => {
            for (let i = 0; i < 3; i++) {
              // Interleave the two probes' requests on the event loop.
              await new Promise((resolve) => setTimeout(resolve, envelopes ? 3 : 2))
              got.push((await axios.get('https://api.fake.test/v2/orders/')).data)
              got.push(await (await fetch('https://api.fake.test/v2/orders/')).json())
            }
          },
          1000,
          envelopes,
        )
        .then(() => got)
    }
    return Promise.all([probe([ORDERS_ENVELOPE]), probe(undefined)])
  })
  assert.deepEqual(withEnv, Array(6).fill({ orders: [] }))
  assert.deepEqual(without, Array(6).fill(STUB_RESPONSE))
})

test("envelope: a straggler from a finished probe keeps that probe's envelope", async () => {
  const late: unknown[] = []
  await withRecorder(async (recorder) => {
    let landed: Promise<void> = Promise.resolve()
    await recorder.run(
      async () => {
        landed = new Promise((resolve) => {
          setTimeout(() => {
            void axios.get('https://api.fake.test/v2/orders/').then((res: { data: unknown }) => {
              late.push(res.data)
              resolve()
            })
          }, 20)
        })
      },
      1000,
      [ORDERS_ENVELOPE],
    )
    // The next probe carries no envelope and is running when the straggler fires.
    await recorder.run(async () => {
      await landed
      late.push((await axios.get('https://api.fake.test/v2/orders/')).data)
    }, 1000)
  })
  assert.deepEqual(late, [{ orders: [] }, STUB_RESPONSE])
})

test('envelope: probeMethod hands its envelopes to every call of the probe', async () => {
  const bodies: unknown[] = []
  const fake = {
    async listOrders() {
      bodies.push((await axios.get('https://api.fake.test/v2/orders/')).data)
      return []
    },
  }
  await withRecorder(async (recorder) => {
    await probeMethod(fake, 'listOrders', {
      recorder,
      ...sharedProbeDeps(SHARED),
      credentials: { accessToken: 'stub' },
      timeoutMs: 1000,
      envelopes: [ORDERS_ENVELOPE],
    })
  })
  assert.deepEqual(bodies, Array(5).fill({ orders: [] }))
})

test('envelopeFor matches the URL path, not its host or query, and the method exactly', () => {
  const env = [ORDERS_ENVELOPE]
  assert.equal(envelopeFor(env, 'GET', 'https://a.test/v2/orders/?page=2'), ORDERS_ENVELOPE)
  assert.equal(envelopeFor(env, 'get', 'https://b.test/v2/orders/'), ORDERS_ENVELOPE)
  assert.equal(envelopeFor(env, 'POST', 'https://a.test/v2/orders/'), undefined)
  assert.equal(envelopeFor(env, 'GET', 'https://a.test/v2/orders/1/'), undefined)
  assert.equal(envelopeFor(env, 'GET', 'https://a.test/x/v2/orders/'), undefined)
  assert.equal(envelopeFor(undefined, 'GET', 'https://a.test/v2/orders/'), undefined)
  assert.equal(envelopeFor(env, 'GET', 'not a url'), undefined)
})

/** `<vertical>/<slug>:<method>`: does that adapter define that declared list method? */
function adapterDefines(id: string): boolean {
  const m = /^([a-z0-9-]+)\/([a-z0-9-]+):(list\w+)$/.exec(id)
  if (!m) return false
  const [, vertical, slug, method] = m
  const verticalDir = join(REPO_ROOT, 'apps/integration-server/src/verticals', vertical!)
  const iface = join(verticalDir, 'adapter/interface.ts')
  const index = join(verticalDir, 'adapters', slug!, 'index.ts')
  if (!existsSync(iface) || !existsSync(index)) return false
  const declared = listSignatures(readFileSync(iface, 'utf8')).some((s) => s.method === method)
  return declared && new RegExp(`\\basync ${method}\\s*\\(`).test(readFileSync(index, 'utf8'))
}

test('every STUB_ENVELOPES key names a list method its adapter defines', () => {
  assert.ok(Object.keys(STUB_ENVELOPES).length > 0)
  // The check itself rejects what a renamed method or adapter would leave behind.
  assert.equal(adapterDefines('logistics/kitchenhub:listOrders'), true)
  assert.equal(adapterDefines('logistics/kitchenhub:listOrderz'), false)
  assert.equal(adapterDefines('logistics/no-such-adapter:listOrders'), false)
  assert.equal(adapterDefines('nowhere/kitchenhub:listOrders'), false)
  for (const id of Object.keys(STUB_ENVELOPES))
    assert.ok(adapterDefines(id), `${id} names no list method an adapter defines`)
})

test('every STUB_ENVELOPES entry is a non-empty list of anchored, stateless path patterns', () => {
  for (const [id, envelopes] of Object.entries(STUB_ENVELOPES)) {
    assert.ok(envelopes.length > 0, `${id} has no envelope`)
    for (const e of envelopes) {
      assert.match(e.method, /^(GET|POST)$/, `${id}: method ${e.method}`)
      assert.ok(e.path.source.startsWith('^') && e.path.source.endsWith('$'), `${id}: ${e.path}`)
      assert.equal(e.path.global || e.path.sticky, false, `${id}: a /g or /y pattern is stateful`)
      // A leading ^ and trailing $ do not anchor a top-level alternation:
      // /^\/a$|.*$/ passes the check above and answers every path.
      for (const unrelated of ['/zz-unrelated', '/a/b/c/d/e/f', ''])
        assert.equal(
          e.path.test(unrelated),
          false,
          `${id}: ${e.path} matches unrelated path ${JSON.stringify(unrelated)}`,
        )
    }
  }
})

function envelopeRow(id: string, urls: string[]): ProbeRow {
  const [head, method] = id.split(':')
  const [vertical, slug] = head!.split('/')
  const call: ProbeCall = {
    requests: urls.map((url) => ({ method: 'GET', url })),
    error: null,
    usedPager: false,
  }
  return {
    vertical: vertical!,
    slug: slug!,
    method: method!,
    page1: call,
    page2: call,
    page1Again: call,
    page1Resized: call,
    page1Ceiling: call,
  }
}

test('deadEnvelopes: an entry no probed method, or no request of it, answers is reported', () => {
  const table = {
    'logistics/a:listOrders': [ORDERS_ENVELOPE],
    'logistics/b:listOrders': [ORDERS_ENVELOPE],
    'logistics/renamed:listOrders': [ORDERS_ENVELOPE],
  }
  const rows = [
    envelopeRow('logistics/a:listOrders', [
      'https://a.test/v2/auth/token/',
      'https://a.test/v2/orders/',
    ]),
    envelopeRow('logistics/b:listOrders', ['https://b.test/v2/stores/']),
  ]
  assert.deepEqual(
    deadEnvelopes(table, rows, () => true),
    [
      'logistics/b:listOrders: no request it made matches GET ^\\/v2\\/orders\\/$',
      'logistics/renamed:listOrders: no list method by that identity was probed',
    ],
  )
  // Out of an --only scope, an entry is neither probed nor dead.
  assert.deepEqual(
    deadEnvelopes(table, rows, (id) => id.startsWith('logistics/a:')),
    [],
  )
})

test('deadEnvelopes: a match on any one of the five probe calls keeps an entry live', () => {
  const calls = ['page1', 'page2', 'page1Again', 'page1Resized', 'page1Ceiling'] as const
  const miss = (): ProbeCall => ({
    requests: [{ method: 'GET', url: 'https://a.test/v2/stores/' }],
    error: null,
    usedPager: false,
  })
  for (const only of calls) {
    const row = envelopeRow('logistics/a:listOrders', [])
    for (const c of calls) row[c] = miss()
    row[only] = {
      requests: [{ method: 'GET', url: 'https://a.test/v2/orders/' }],
      error: null,
      usedPager: false,
    }
    assert.deepEqual(
      deadEnvelopes({ 'logistics/a:listOrders': [ORDERS_ENVELOPE] }, [row], () => true),
      [],
      `a match only on ${only} was reported dead`,
    )
  }
})

// The real sweep, one adapter: pins that sweep hands each identity its
// STUB_ENVELOPES entry. Without it kitchenhub's four list methods throw on
// STUB_RESPONSE and come back unmeasured-error. Needs shared's dist, as the
// gate itself does (CI runs this after `pnpm build`).
test('the sweep answers kitchenhub with its envelopes: all four list methods page locally', () => {
  const script = fileURLToPath(new URL('./check-paging-contract.ts', import.meta.url))
  const tsx = join(REPO_ROOT, 'node_modules', '.bin', 'tsx')
  const res = spawnSync(tsx, [script, '--only=logistics/kitchenhub', '--soft'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  })
  const out = `${res.stdout}\n${res.stderr}`
  assert.equal(res.status, 0, out)
  assert.match(out, /local-page 4,/, out)
  assert.match(out, /unmeasured-error 0,/, out)
  assert.doesNotMatch(out, /STUB_ENVELOPES entries that answered nothing/, out)
})

function sweepOnly(scope: string): string {
  const script = fileURLToPath(new URL('./check-paging-contract.ts', import.meta.url))
  const tsx = join(REPO_ROOT, 'node_modules', '.bin', 'tsx')
  const res = spawnSync(tsx, [script, `--only=${scope}`, '--soft'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  })
  const out = `${res.stdout}\n${res.stderr}`
  assert.equal(res.status, 0, out)
  assert.doesNotMatch(out, /STUB_ENVELOPES entries that answered nothing/, out)
  return out
}

// Xledger's relay parser throws on a response with no connection
// (adapters/xledger/relay.ts:82); its four relay lists are measured only on
// the documented empty connection.
test('the sweep answers xledger relay lists with an empty connection: none unmeasured-error', () => {
  const out = sweepOnly('accounting/xledger')
  assert.match(out, /unmeasured-error 0,/, out)
})

// Nitro Sign throws before any request unless credentials.extra.signApiBaseUrl
// is one of its documented regional hosts (adapters/nitro-sign/client.ts:82-95).
test('the sweep hands nitro-sign an allowlisted Sign API host: every list method sends a request', () => {
  const out = sweepOnly('docsign/nitro-sign')
  assert.match(out, /unmeasured-no-request 0,/, out)
  assert.match(out, /unmeasured-error 0,/, out)
})
