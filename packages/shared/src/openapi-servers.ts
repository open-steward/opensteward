/**
 * OpenAPI `servers` block construction with operator-overrideable variables.
 *
 * Shape: one templated server entry `{scheme}://{host}:{port}/{version}` with
 * four variables, each carrying `default` + `enum`. Three layered sources
 * resolve to the final merged result (admin-DB > config.yml > compiled
 * defaults), with per-variable + per-field (default vs enum) merging so that
 * partial overrides (e.g. config.yml sets just `host.default`, admin-DB sets
 * just `host.enum`) compose cleanly.
 *
 * Pure data — no I/O, no dependencies beyond TypeScript types.
 */

export type ServerVariableName = 'scheme' | 'host' | 'port' | 'version'

export interface OpenApiServerVariable {
  default: string
  enum?: string[]
  description?: string
}

export interface OpenApiServersConfig {
  scheme?: Partial<OpenApiServerVariable>
  host?: Partial<OpenApiServerVariable>
  port?: Partial<OpenApiServerVariable>
  version?: Partial<OpenApiServerVariable>
}

export interface OpenApiServer {
  url: string
  description?: string
  /**
   * Subset of `ServerVariableName`. The root server carries all four; the
   * unversioned per-path-item override drops `version`.
   */
  variables: Partial<Record<ServerVariableName, OpenApiServerVariable>>
}

/**
 * Two templates because the spec carries paths in two namespaces:
 *
 *  - `/v1/{vertical}/*` resources (88 of them at the time of writing) — get
 *    the `/v1/` segment stripped from path keys and rely on the **root**
 *    server URL `{scheme}://{host}:{port}/{version}` so callers see the
 *    `version` dropdown in Swagger UI.
 *  - `/admin/*`, `/auth/*`, `/connections*`, `/health`, `/webhooks/*` (24
 *    of them) — keep their absolute path keys and carry a **per-path-item**
 *    `servers` override of `{scheme}://{host}:{port}` so they don't get a
 *    spurious `/v1` prefixed in front of `/auth/...`.
 *
 * The per-path-item override (unversioned) has its own copy of the
 * scheme/host/port variables. The docs-server merges admin-DB / config.yml
 * overrides into BOTH server objects so an operator's edit to "host" via
 * /settings shows up consistently across versioned and unversioned paths.
 */
export const SERVER_URL_TEMPLATE = '{scheme}://{host}:{port}/{version}'
export const UNVERSIONED_SERVER_URL_TEMPLATE = '{scheme}://{host}:{port}'
/**
 * The sandbox. Same host, same version, one segment earlier —
 * `/test/v1/accounting/invoices` against `/v1/accounting/invoices`.
 *
 * It carries the same four variables as the root entry rather than hard-coding
 * `/test/v1`, so an operator who points `host` at their deployment gets both
 * entries moved, and a future `/v2` appears under both at once.
 */
export const TEST_SERVER_URL_TEMPLATE = '{scheme}://{host}:{port}/test/{version}'

export type ResolvedServerVariables = Record<ServerVariableName, OpenApiServerVariable>

export const DEFAULT_OPENAPI_SERVERS: ResolvedServerVariables = {
  scheme: {
    default: 'http',
    enum: ['http', 'https'],
    description: 'HTTP scheme — http for local dev, https for deployed.',
  },
  host: {
    default: 'localhost',
    enum: ['localhost'],
    description: 'Hostname of the deployment (no port).',
  },
  port: {
    default: '3010',
    enum: ['3010'],
    description: 'Port as a string. Use "443" for https, "80" for http.',
  },
  version: {
    default: 'v1',
    enum: ['v1'],
    description: 'URL-path API version. New entries land here when /v2/* ships.',
  },
}

const VARIABLE_NAMES: ServerVariableName[] = ['scheme', 'host', 'port', 'version']

/**
 * Merge a chain of partial configs, later sources overriding earlier ones
 * per-field (default and enum merge independently). Undefined / null sources
 * are skipped. Enum values dedupe; default propagates through unless an
 * override explicitly sets one.
 */
export function mergeServerVariables(
  ...sources: Array<OpenApiServersConfig | null | undefined>
): ResolvedServerVariables {
  const result: ResolvedServerVariables = {
    scheme: { ...DEFAULT_OPENAPI_SERVERS.scheme },
    host: { ...DEFAULT_OPENAPI_SERVERS.host },
    port: { ...DEFAULT_OPENAPI_SERVERS.port },
    version: { ...DEFAULT_OPENAPI_SERVERS.version },
  }
  for (const src of sources) {
    if (!src) continue
    for (const name of VARIABLE_NAMES) {
      const incoming = src[name]
      if (!incoming) continue
      if (typeof incoming.default === 'string') result[name].default = incoming.default
      if (Array.isArray(incoming.enum)) result[name].enum = [...incoming.enum]
      if (typeof incoming.description === 'string') {
        result[name].description = incoming.description
      }
    }
  }
  for (const name of VARIABLE_NAMES) {
    if (result[name].enum) {
      result[name].enum = dedupe(result[name].enum!)
    }
  }
  return result
}

/**
 * Throws a descriptive error if any variable's `default` is missing from its
 * `enum`, or if an `enum` contains duplicates. Call this on operator-supplied
 * config so the failure mode is a clear boot/PATCH error, not a confusing
 * Swagger UI dropdown.
 */
export function validateServerVariables(config: OpenApiServersConfig): void {
  for (const name of VARIABLE_NAMES) {
    const v = config[name]
    if (!v) continue
    if (Array.isArray(v.enum)) {
      const seen = new Set<string>()
      for (const entry of v.enum) {
        if (typeof entry !== 'string' || entry.length === 0) {
          throw new Error(`openapi.servers.${name}.enum entries must be non-empty strings`)
        }
        if (seen.has(entry)) {
          throw new Error(`openapi.servers.${name}.enum has duplicate value: ${entry}`)
        }
        seen.add(entry)
      }
      if (typeof v.default === 'string' && !seen.has(v.default)) {
        throw new Error(
          `openapi.servers.${name}.default (${v.default}) is not in enum [${v.enum.join(', ')}]`,
        )
      }
    }
    if (v.default !== undefined && typeof v.default !== 'string') {
      throw new Error(`openapi.servers.${name}.default must be a string`)
    }
  }
}

export interface BuildServersOptions {
  /**
   * `'root'` (default) → URL template includes `/{version}`; emits all four
   * variables. Use for the top-level `servers` block.
   *
   * `'test'` → URL template is `{scheme}://{host}:{port}/test/{version}`,
   * the sandbox surface. Emits all four variables, like the root. Goes in the
   * top-level `servers` array ALONGSIDE the root entry, so Swagger UI offers
   * both and a reader can flip one dropdown to try a call against synthetic
   * data. Not every versioned path exists there — `/{vertical}/sync` is not
   * mounted in test mode — so the generator gives that one its own live-only
   * override rather than letting it inherit this.
   *
   * `'live-only'` → same URL template as `'root'`, but a description saying
   * what it OMITS. Used as a per-path-item override on versioned routes that
   * do not exist in the sandbox (`/{vertical}/sync`). Sharing `'root'`'s text
   * would read as a pointless duplicate of the global server, so this variant
   * instead says what it omits.
   *
   * `'unversioned'` → URL template is `{scheme}://{host}:{port}`; emits
   * scheme/host/port only (no `version`). Use for per-path-item overrides
   * on the 24 unversioned paths (`/admin/*`, `/auth/*`, `/connections*`,
   * `/health`, `/webhooks/*`) so they don't get spuriously prefixed with
   * `/v1` from the root template.
   */
  variant?: 'root' | 'test' | 'live-only' | 'unversioned'
}

/**
 * Build an OpenAPI `servers` array. Pass `variant: 'unversioned'` for
 * per-path-item overrides; default produces the root entry.
 */
export function buildServersBlock(
  config?: OpenApiServersConfig,
  opts: BuildServersOptions = {},
): OpenApiServer[] {
  const merged = mergeServerVariables(config)
  // Re-validate the merged shape so callers can't sneak an inconsistent
  // result past the per-source validation above.
  validateServerVariables(merged)
  if (opts.variant === 'test') {
    return [
      {
        url: TEST_SERVER_URL_TEMPLATE,
        description: 'OpenSteward sandbox (test mode) — synthetic data, no upstream calls',
        variables: {
          scheme: stripUndefined(merged.scheme),
          host: stripUndefined(merged.host),
          port: stripUndefined(merged.port),
          version: stripUndefined(merged.version),
        },
      },
    ]
  }
  if (opts.variant === 'live-only') {
    return [
      {
        url: SERVER_URL_TEMPLATE,
        description:
          'OpenSteward deployment (live only — this route is not mounted in the sandbox)',
        variables: {
          scheme: stripUndefined(merged.scheme),
          host: stripUndefined(merged.host),
          port: stripUndefined(merged.port),
          version: stripUndefined(merged.version),
        },
      },
    ]
  }
  if (opts.variant === 'unversioned') {
    return [
      {
        url: UNVERSIONED_SERVER_URL_TEMPLATE,
        description: 'OpenSteward deployment (unversioned paths)',
        variables: {
          scheme: stripUndefined(merged.scheme),
          host: stripUndefined(merged.host),
          port: stripUndefined(merged.port),
        },
      },
    ]
  }
  return [
    {
      url: SERVER_URL_TEMPLATE,
      description: 'OpenSteward deployment',
      variables: {
        scheme: stripUndefined(merged.scheme),
        host: stripUndefined(merged.host),
        port: stripUndefined(merged.port),
        version: stripUndefined(merged.version),
      },
    },
  ]
}

/**
 * Path-item-level test: should this absolute path key inherit the root
 * server (i.e. is under `/v1/*` AFTER `/v1/` strip — meaning it sits at
 * `/{vertical}/*` post-strip)? Used by the generator to decide whether to
 * attach an unversioned `servers` override.
 */
export function isVersionedPath(pathKey: string): boolean {
  return pathKey.startsWith('/v1/')
}

function dedupe(xs: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of xs) {
    if (!seen.has(x)) {
      seen.add(x)
      out.push(x)
    }
  }
  return out
}

function stripUndefined(v: OpenApiServerVariable): OpenApiServerVariable {
  const out: OpenApiServerVariable = { default: v.default }
  if (v.enum) out.enum = v.enum
  if (v.description) out.description = v.description
  return out
}
