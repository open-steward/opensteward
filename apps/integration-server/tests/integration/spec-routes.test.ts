/**
 * Every operation the published spec documents must be a route that exists.
 *
 * This guards the "documented but untrue" class of bug: a spec can document
 * an operation no route serves — a path spelled differently than the router
 * mounts (`trackingevents` vs `/tracking-events`), or a documented PUT where
 * the router declares PATCH — and both 404 for anyone who believes the
 * reference.
 *
 * Nothing else checks this. `check:openapi-examples` asserts every field has
 * an example, `check:schema-examples` asserts each example parses — neither
 * looks at whether the path is real.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { buildTestServer, type TestServer } from './helpers'

const SPEC = resolve(__dirname, '..', '..', '..', '..', 'docs', 'openapi', 'openapi.json')
const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'] as const

/**
 * Documented operations with no route behind them.
 *
 * An allowlist rather than a filter, and asserted to be EXACTLY this set, so
 * closing one fails here and prompts its removal instead of quietly shrinking.
 */
const KNOWN_GAPS = new Map<string, string>([])

/**
 * Dual-server operations whose SANDBOX rendering has no route.
 *
 * Every path key WITHOUT the `x-opensteward-servers` marker inherits BOTH the
 * live and the sandbox server, so Swagger's Servers dropdown, the SDK's
 * `mode: 'test'` and the Postman sandbox environment all render it under
 * `/test/v1` too — an operation listed here is one the spec promises in test
 * mode but the server 404s. That is exactly how `/test/v1/platforms` shipped
 * broken: nothing probed the second server. Closing one (mounting it in the
 * sandbox block, or moving the path to LIVE_ONLY_PATHS in generate-openapi so
 * the promise is withdrawn) fails here and prompts its removal.
 */
const SANDBOX_KNOWN_GAPS = new Map<string, string>([])

describe('published spec vs registered routes', () => {
  let server: TestServer
  let documented: string[]
  let missing: string[]
  let sandboxDocumented: string[]
  let sandboxMissing: string[]

  /**
   * Is this documented operation reachable?
   *
   * Two spellings of a vertical have to be reconciled. `/{vertical}/sync` is
   * ONE templated path in the spec, but `createSyncRouter` is registered
   * inside each vertical's own plugin, so the routes are nine concrete ones
   * (`/v1/accounting/sync`, …). Meanwhile `/auth/{vertical}/{platform}/…` is
   * genuinely parameterised at runtime and matches as `:vertical` directly.
   * Try the literal form, then a concrete substitution.
   */
  const routed = (method: string, url: string): boolean => {
    const m = method.toUpperCase() as 'GET'
    if (server.fastify.hasRoute({ method: m, url })) return true
    if (!url.includes(':vertical')) return false
    return server.fastify.hasRoute({ method: m, url: url.replace(':vertical', 'accounting') })
  }

  beforeAll(async () => {
    // `database`, not the default passthrough: the sync and admin-sync routers
    // are only registered when a data store is open, and under passthrough
    // nine real routes look missing for a reason that is pure harness config.
    server = await buildTestServer({ dataStoreMode: 'database' })
    const spec = JSON.parse(readFileSync(SPEC, 'utf8')) as {
      paths: Record<string, Record<string, unknown>>
    }
    documented = []
    missing = []
    sandboxDocumented = []
    sandboxMissing = []
    for (const [key, item] of Object.entries(spec.paths)) {
      // The generator strips `/v1/` from versioned keys and re-supplies it via
      // the root server template; absolute keys carry an unversioned override
      // and are already whole. The marker says which.
      const absolute = item['x-opensteward-servers'] === 'unversioned'
      const url = (absolute ? key : `/v1${key}`).replace(/\{([^}]+)\}/g, ':$1')
      // A stripped key is served from BOTH the live and the sandbox server —
      // the second rendering is a promise too.
      const sandboxUrl = absolute ? null : `/test/v1${key}`.replace(/\{([^}]+)\}/g, ':$1')
      for (const method of Object.keys(item)) {
        if (!(METHODS as readonly string[]).includes(method)) continue
        const op = `${method.toUpperCase()} ${url}`
        documented.push(op)
        if (!routed(method, url)) missing.push(op)
        if (sandboxUrl) {
          const sandboxOp = `${method.toUpperCase()} ${sandboxUrl}`
          sandboxDocumented.push(sandboxOp)
          if (!routed(method, sandboxUrl)) sandboxMissing.push(sandboxOp)
        }
      }
    }
  }, 120_000)

  afterAll(async () => {
    await server?.cleanup()
  })

  it('documents a substantial surface', () => {
    // Guards against the whole check passing because the spec failed to load.
    expect(documented.length).toBeGreaterThan(250)
  })

  it('documents no operation that lacks a route', () => {
    expect(missing.filter((m) => !KNOWN_GAPS.has(m))).toEqual([])
  })

  it('still has exactly the known gaps — no more, and no fewer', () => {
    expect(missing.filter((m) => KNOWN_GAPS.has(m)).sort()).toEqual([...KNOWN_GAPS.keys()].sort())
  })

  it('serves the sandbox rendering of every dual-server operation', () => {
    expect(sandboxDocumented.length).toBeGreaterThan(200)
    expect(sandboxMissing.filter((m) => !SANDBOX_KNOWN_GAPS.has(m))).toEqual([])
  })

  it('still has exactly the known sandbox gaps — no more, and no fewer', () => {
    expect(sandboxMissing.filter((m) => SANDBOX_KNOWN_GAPS.has(m)).sort()).toEqual(
      [...SANDBOX_KNOWN_GAPS.keys()].sort(),
    )
  })
})
