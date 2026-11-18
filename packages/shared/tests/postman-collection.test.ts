/**
 * Invariants of the generated Postman bundle.
 *
 * These pin two generator invariants:
 *
 *  1. Every versioned request carries `{{basePath}}`. `generate-openapi`
 *     strips `/v1/` from versioned path keys and re-supplies it through the
 *     root server template's `{version}` variable; a Postman URL has no such
 *     template, so the segment has to come back via `{{basePath}}` — a bare
 *     `{{baseUrl}}/accounting/invoices` with `baseUrl = http://localhost:3010`
 *     404s.
 *  2. A path item may carry a `servers` key alongside its HTTP methods; that
 *     key is not an HTTP method and must never become a request (a generator
 *     that iterates path-item keys as methods emits junk requests whose
 *     method is the literal string `SERVERS`).
 *
 * Both are properties of the committed artifact, so assert them there.
 * Regenerate first: pnpm --filter integration-server run generate:postman
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const SPEC_PATH = resolve(REPO_ROOT, 'docs', 'openapi', 'openapi.json')
const COLLECTION_PATH = resolve(REPO_ROOT, 'docs', 'postman', 'openapi.postman_collection.json')
/** Every environment, and the `basePath` each one must carry. */
const ENVS: Array<[string, string]> = [
  [resolve(REPO_ROOT, 'docs', 'postman', 'openapi-local.postman_environment.json'), '/v1'],
  [resolve(REPO_ROOT, 'docs', 'postman', 'openapi-production.postman_environment.json'), '/v1'],
  [resolve(REPO_ROOT, 'docs', 'postman', 'openapi-test.postman_environment.json'), '/test/v1'],
]

const HTTP_METHODS = ['GET', 'PUT', 'POST', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE']
const BASE_PATH_PREFIX = '{{baseUrl}}{{basePath}}'

interface PostmanItem {
  name: string
  item?: PostmanItem[]
  request?: { method: string; url: { raw: string } }
}

function readJson<T>(p: string): T {
  if (!existsSync(p)) {
    throw new Error(`Missing: ${p} — run \`pnpm --filter integration-server run generate:postman\``)
  }
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

function flatten(items: PostmanItem[]): Array<{ name: string; method: string; raw: string }> {
  const out: Array<{ name: string; method: string; raw: string }> = []
  for (const item of items) {
    if (item.item) out.push(...flatten(item.item))
    else if (item.request) {
      out.push({ name: item.name, method: item.request.method, raw: item.request.url.raw })
    }
  }
  return out
}

/** Postman `:param` back to the OpenAPI `{param}` the path key uses. */
function toSpecPath(raw: string): string {
  return raw
    .replace(BASE_PATH_PREFIX, '')
    .replace('{{baseUrl}}', '')
    .replace(/:(\w+)/g, '{$1}')
}

describe('generated Postman collection', () => {
  const spec = readJson<{ paths: Record<string, Record<string, unknown>> }>(SPEC_PATH)
  const collection = readJson<{ item: PostmanItem[] }>(COLLECTION_PATH)
  const requests = flatten(collection.item)
  // The generator's discriminator: a path item carrying its own `servers`
  // override is already absolute and must not gain `{{basePath}}`.
  // `x-opensteward-servers`, not the presence of `servers`. A path item may
  // carry a `servers` override and still be versioned — such a path still
  // needs `{{basePath}}`. Keying on `servers` alone would call it absolute
  // and quietly drop the `/v1` from every one of its requests.
  const absolutePaths = new Set(
    Object.entries(spec.paths)
      .filter(
        ([, item]) =>
          (item as { 'x-opensteward-servers'?: unknown })['x-opensteward-servers'] ===
          'unversioned',
      )
      .map(([key]) => key),
  )

  it('emits requests', () => {
    expect(requests.length).toBeGreaterThan(200)
  })

  it('never emits a non-HTTP method (the `servers` path-item key is not an operation)', () => {
    const junk = requests.filter((r) => !HTTP_METHODS.includes(r.method))
    expect(junk.map((r) => `${r.method} ${r.raw}`)).toEqual([])
  })

  it('prefixes every versioned request with {{basePath}}', () => {
    // No request may point at a bare `{{baseUrl}}/<vertical>/…`. Checking the
    // whole set rather than one vertical: a new vertical must not regress.
    const bare = requests.filter(
      (r) => r.raw.startsWith('{{baseUrl}}/') && !absolutePaths.has(toSpecPath(r.raw)),
    )
    expect(bare.map((r) => r.raw)).toEqual([])
  })

  it('omits {{basePath}} on exactly the paths that carry a servers override', () => {
    // Both directions. A `/admin/*` request that gained `{{basePath}}` would
    // 404 just as surely as a vertical one that lacked it.
    const wronglyPrefixed = requests.filter(
      (r) => r.raw.startsWith(BASE_PATH_PREFIX) && absolutePaths.has(toSpecPath(r.raw)),
    )
    expect(wronglyPrefixed.map((r) => r.raw)).toEqual([])
  })

  it('versions the tenant /connections request like every other versioned path', () => {
    // The operator surface lives at `/admin/connections` (absolute), so the
    // tenant `/connections` carries `{{basePath}}` like every other versioned
    // request — one collection serves both `/v1` and `/test/v1`. Nothing is
    // double-prefixed, and the operator surface stays absolute.
    const doubled = requests.filter((r) => r.raw.includes('{{basePath}}/v1/'))
    expect(doubled.map((r) => r.raw)).toEqual([])
    expect(requests.some((r) => r.raw === '{{baseUrl}}{{basePath}}/connections')).toBe(true)
    expect(requests.some((r) => r.raw === '{{baseUrl}}/admin/connections')).toBe(true)
  })

  it.each(ENVS)('%s defines basePath', (envPath, expected) => {
    const env = readJson<{ values: Array<{ key: string; value: string }> }>(envPath)
    const basePath = env.values.find((v) => v.key === 'basePath')
    expect(basePath, 'every env file must define basePath or versioned requests 404').toBeDefined()
    expect(basePath!.value).toBe(expected)
  })

  it('ships a sandbox environment that only differs by basePath', () => {
    // The point of `{{basePath}}` is that ONE collection serves both surfaces.
    // If the two environments diverge in any other variable, someone has
    // started maintaining a second copy by hand.
    const [live, test] = [ENVS[0]![0], ENVS[2]![0]].map((p) =>
      readJson<{ values: Array<{ key: string; value: string }> }>(p),
    )
    const differing = live!.values
      .filter((v) => {
        const other = test!.values.find((t) => t.key === v.key)
        return other === undefined || other.value !== v.value
      })
      .map((v) => v.key)
    expect(differing).toEqual(['basePath'])
  })

  it('serves /{vertical}/sync under BOTH servers', () => {
    // The sandbox simulates the sync job lifecycle (never dialing out), so
    // the honest shape is no per-path override at all — the path inherits
    // the root servers array.
    const sync = spec.paths['/{vertical}/sync'] as
      { 'x-opensteward-servers'?: string; servers?: Array<{ url: string }> } | undefined
    expect(sync, 'the sync path moved — update this test with it').toBeDefined()
    expect(sync!['x-opensteward-servers']).toBeUndefined()
    expect(sync!.servers).toBeUndefined()
  })

  it('offers both servers at the root, live first', () => {
    const urls = (spec as unknown as { servers: Array<{ url: string }> }).servers.map((s) => s.url)
    expect(urls).toEqual([
      '{scheme}://{host}:{port}/{version}',
      '{scheme}://{host}:{port}/test/{version}',
    ])
  })
})
