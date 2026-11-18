/**
 * Generates a Postman Collection v2.1 + three environment files from
 * docs/openapi/openapi.json. One collection covers the whole unified API.
 *
 * Outputs:
 *   docs/postman/openapi.postman_collection.json
 *   docs/postman/openapi-local.postman_environment.json
 *   docs/postman/openapi-production.postman_environment.json
 *   docs/postman/openapi-test.postman_environment.json
 *
 * Request URLs are built as `{{baseUrl}}{{basePath}}<path>` for the versioned
 * resource paths and `{{baseUrl}}<path>` for the unversioned ones. The split
 * exists because generate-openapi strips the `/v1/` prefix from versioned path
 * keys and re-supplies it through the root server template's `{version}`
 * variable — a Postman URL has no such template, so the segment has to come
 * back from somewhere. `basePath` is that somewhere, and keeping it a variable
 * (rather than hardcoding `/v1`) is what lets one collection address both the
 * live surface and the `/test/v1` sandbox by swapping environments — the test
 * environment sets `basePath` to `/test/v1`.
 *
 * A path item that carries its own `servers` override already has an absolute
 * key (`/admin/*`, `/auth/*`, `/health`, `/webhooks/*`, and `/v1/connections`),
 * so it must NOT get `basePath` — see `isAbsolutePathItem`.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

interface Param {
  name: string
  in: 'path' | 'query' | 'header'
  required?: boolean
  description?: string
  schema?: { type?: string | string[]; format?: string; enum?: unknown[] }
}

interface Operation {
  tags?: string[]
  summary?: string
  description?: string
  parameters?: Param[]
  requestBody?: {
    required?: boolean
    description?: string
    content?: Record<string, { schema?: { $ref?: string; [k: string]: unknown } }>
  }
  responses?: Record<string, unknown>
  security?: Array<Record<string, unknown[]>>
}

/**
 * A path item is a map of HTTP method → Operation, but it may ALSO carry a
 * sibling `servers` key (OpenAPI allows a server override per path item, and
 * generate-openapi emits one on every unversioned path). Typing the value as
 * `Operation` alone would let `servers` be iterated as though it were a
 * method — see `HTTP_METHODS`.
 */
type PathItem = Record<string, Operation | unknown>

interface Spec {
  info: { title: string; version: string; description?: string }
  tags?: Array<{ name: string; description?: string }>
  paths: Record<string, PathItem>
  components?: {
    schemas?: Record<string, Record<string, unknown>>
  }
}

const openapiPath = path.resolve(__dirname, '../../../docs/openapi/openapi.json')
if (!fs.existsSync(openapiPath)) {
  console.error(`✗ ${openapiPath} not found — run generate-openapi first.`)
  process.exit(1)
}
const spec: Spec = JSON.parse(fs.readFileSync(openapiPath, 'utf8'))

// Stable UUIDs so the generated artifacts are deterministic — Postman uses
// these as collection / environment identifiers; reusing them across runs
// keeps `pnpm run check:docs` from showing diffs on every regeneration.
function uid(seed: string): string {
  const h = crypto.createHash('sha256').update(seed).digest('hex')
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `4${h.slice(13, 16)}`,
    `${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join('-')
}

function toPostmanPath(oaPath: string): string {
  return oaPath.replace(/\{(\w+)\}/g, ':$1')
}

/**
 * The method keys worth emitting a request for. Anything else on a path item —
 * in practice `servers`, but the spec also allows `summary`, `description`,
 * `parameters` and `$ref` — is metadata, not an operation.
 *
 * Without this filter, a path item carrying a `servers` override would emit a
 * junk request whose HTTP method is the literal string `SERVERS`.
 */
const HTTP_METHODS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'])

/**
 * True when the path key is already absolute and must not be prefixed with
 * `{{basePath}}`.
 *
 * The discriminator is `x-opensteward-servers`, the marker generate-openapi
 * attaches beside each override saying WHICH block it built, so the two can
 * never drift apart. It also gets `/v1/connections` right — that key keeps its
 * `/v1` inline to avoid colliding with the operator-facing `/connections`, and
 * carries an override for the same reason.
 *
 * Presence of `servers` alone is not the test: a live-only override on a
 * versioned path also carries a `servers` key yet still needs `{{basePath}}`
 * — keying off `servers` would drop its `/v1` and send every request to a
 * 404. Only the marker distinguishes the two kinds.
 */
function isAbsolutePathItem(item: PathItem): boolean {
  return (item as { 'x-opensteward-servers'?: unknown })['x-opensteward-servers'] === 'unversioned'
}

function exampleFor(p: Param): string {
  const enumVals = p.schema?.enum
  if (Array.isArray(enumVals) && enumVals.length > 0) return String(enumVals[0])
  if (p.schema?.format === 'uuid') return '{{connectionId}}'
  if (p.name === 'connection_id' || p.name === 'connectionId') return '{{connectionId}}'
  if (p.name === 'vertical') return '{{vertical}}'
  if (p.name === 'platform') return '{{platform}}'
  if (p.name === 'slug') return '{{slug}}'
  if (p.name === 'id') return '{{resourceId}}'
  return ''
}

function bodyExample(op: Operation): string | undefined {
  const ref = op.requestBody?.content?.['application/json']?.schema?.$ref
  if (typeof ref === 'string') {
    const name = ref.replace('#/components/schemas/', '')
    const schema = spec.components?.schemas?.[name]
    if (schema) return JSON.stringify(buildExample(schema, new Set()), null, 2)
  }
  return op.requestBody ? '{}' : undefined
}

function buildExample(schema: Record<string, unknown>, seen: Set<string>): unknown {
  if (typeof schema['$ref'] === 'string') {
    const name = (schema['$ref'] as string).replace('#/components/schemas/', '')
    if (seen.has(name)) return null
    seen.add(name)
    const target = spec.components?.schemas?.[name]
    return target ? buildExample(target, seen) : null
  }
  const type = schema['type']
  if (type === 'object' || schema['properties']) {
    const out: Record<string, unknown> = {}
    const props = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>
    for (const [k, sub] of Object.entries(props)) {
      out[k] = buildExample(sub, new Set(seen))
    }
    return out
  }
  if (type === 'array') {
    return [buildExample((schema['items'] ?? {}) as Record<string, unknown>, new Set(seen))]
  }
  if (type === 'integer' || type === 'number') return 0
  if (type === 'boolean') return false
  if (Array.isArray(schema['enum']) && (schema['enum'] as unknown[]).length > 0) {
    return (schema['enum'] as unknown[])[0]
  }
  if (schema['format'] === 'date-time') return '2026-04-22T00:00:00.000Z'
  if (schema['format'] === 'uuid') return '00000000-0000-0000-0000-000000000000'
  return ''
}

function authHeaders(tag: string | undefined): Array<{
  key: string
  value: string
  description?: string
  disabled?: boolean
}> {
  if (tag === 'Admin') {
    return [
      {
        key: 'X-Admin-Secret',
        value: '{{adminSecret}}',
        description: 'Required when ADMIN_SECRET is set on the server.',
      },
    ]
  }
  return []
}

interface PostmanRequest {
  name: string
  request: {
    method: string
    header: Array<{ key: string; value: string; description?: string; disabled?: boolean }>
    url: {
      raw: string
      host: string[]
      path: string[]
      query?: Array<{ key: string; value: string; description?: string; disabled?: boolean }>
      variable?: Array<{ key: string; value: string; description?: string }>
    }
    body?: { mode: 'raw'; raw: string; options: { raw: { language: 'json' } } }
    description?: string
  }
  response: never[]
}

const folders: Record<string, PostmanRequest[]> = {}

for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
  // `{{baseUrl}}` alone for a path that is already absolute; otherwise the
  // `/v1` that generate-openapi stripped has to come back via `{{basePath}}`.
  const prefix = isAbsolutePathItem(pathItem) ? '{{baseUrl}}' : '{{baseUrl}}{{basePath}}'
  for (const [method, rawOp] of Object.entries(pathItem)) {
    if (!HTTP_METHODS.has(method.toLowerCase())) continue
    const op = rawOp as Operation
    const tag = op.tags?.[0] ?? 'Other'
    const params = op.parameters ?? []
    const pathParams = params.filter((p) => p.in === 'path')
    const queryParams = params.filter((p) => p.in === 'query')
    const headerParams = params.filter((p) => p.in === 'header')

    const url = {
      raw: `${prefix}${toPostmanPath(pathKey)}`,
      host: [prefix],
      path: toPostmanPath(pathKey).split('/').filter(Boolean),
      query: queryParams.length
        ? queryParams.map((p) => ({
            key: p.name,
            value: exampleFor(p),
            description: p.description,
            disabled: !p.required,
          }))
        : undefined,
      variable: pathParams.length
        ? pathParams.map((p) => ({
            key: p.name,
            value: exampleFor(p),
            description: p.description,
          }))
        : undefined,
    }

    const headers = [
      ...authHeaders(tag),
      ...headerParams.map((p) => ({
        key: p.name,
        value: exampleFor(p),
        description: p.description,
        disabled: !p.required,
      })),
    ]

    const body = bodyExample(op)

    const req: PostmanRequest = {
      name: op.summary ?? `${method.toUpperCase()} ${pathKey}`,
      request: {
        method: method.toUpperCase(),
        header: headers,
        url,
        body: body ? { mode: 'raw', raw: body, options: { raw: { language: 'json' } } } : undefined,
        description: op.description,
      },
      response: [],
    }

    folders[tag] ??= []
    folders[tag]!.push(req)
  }
}

const tagOrder = (spec.tags ?? []).map((t) => t.name)
const allTags = [
  ...tagOrder.filter((t) => folders[t]),
  ...Object.keys(folders)
    .filter((t) => !tagOrder.includes(t))
    .sort(),
]

const collection = {
  info: {
    name: spec.info.title,
    description: spec.info.description ?? '',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    _postman_id: uid('opensteward:collection'),
  },
  variable: [
    { key: 'baseUrl', value: '{{baseUrl}}', type: 'default' },
    { key: 'connectionId', value: '', type: 'default' },
    { key: 'vertical', value: 'accounting', type: 'default' },
    { key: 'platform', value: '', type: 'default' },
    { key: 'slug', value: '', type: 'default' },
    { key: 'resourceId', value: '', type: 'default' },
    { key: 'adminSecret', value: '', type: 'secret' },
  ],
  item: allTags.map((tag) => {
    const tagDef = (spec.tags ?? []).find((t) => t.name === tag)
    return {
      name: tag,
      description: tagDef?.description ?? '',
      item: folders[tag]!,
    }
  }),
  event: [],
}

interface EnvVar {
  key: string
  value: string
  type: 'default' | 'secret'
  enabled: boolean
}

function envFile(
  name: string,
  baseUrl: string,
  basePath = '/v1',
): {
  id: string
  name: string
  values: EnvVar[]
  _postman_variable_scope: 'environment'
  _postman_exported_at: string
  _postman_exported_using: string
} {
  return {
    id: uid(`opensteward:env:${name}`),
    name,
    values: [
      { key: 'baseUrl', value: baseUrl, type: 'default', enabled: true },
      // Prefixes every versioned request. Swapping this to `/test/v1` is what
      // will point the same collection at the sandbox surface.
      { key: 'basePath', value: basePath, type: 'default', enabled: true },
      { key: 'connectionId', value: '', type: 'default', enabled: true },
      { key: 'vertical', value: 'accounting', type: 'default', enabled: true },
      { key: 'platform', value: 'fortnox', type: 'default', enabled: true },
      { key: 'slug', value: 'fortnox', type: 'default', enabled: true },
      { key: 'resourceId', value: '', type: 'default', enabled: true },
      { key: 'adminSecret', value: '', type: 'secret', enabled: true },
    ],
    _postman_variable_scope: 'environment',
    // Deliberately fixed — a real export timestamp creates noise on every
    // docs regeneration. Postman's importer doesn't care about this value.
    _postman_exported_at: '2026-04-22T00:00:00.000Z',
    _postman_exported_using: 'opensteward generate-postman',
  }
}

const outDir = path.resolve(__dirname, '../../../docs/postman')
fs.mkdirSync(outDir, { recursive: true })

const collectionPath = path.join(outDir, 'openapi.postman_collection.json')
const localEnvPath = path.join(outDir, 'openapi-local.postman_environment.json')
const prodEnvPath = path.join(outDir, 'openapi-production.postman_environment.json')

fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n')
fs.writeFileSync(
  localEnvPath,
  JSON.stringify(envFile('OpenSteward — Local', 'http://localhost:3010'), null, 2) + '\n',
)
fs.writeFileSync(
  prodEnvPath,
  JSON.stringify(envFile('OpenSteward — Production', 'https://integration.example.com'), null, 2) +
    '\n',
)
// The sandbox: the SAME collection, with `basePath` pointing one segment
// earlier. Every versioned request is built as `{{baseUrl}}{{basePath}}<path>`
// precisely so this works without a second collection to keep in sync.
//
// The 42 absolute requests — `/admin/*`, `/auth/*`, `/health`, `/webhooks/*`,
// `/connections*` — do not carry `{{basePath}}` and so still point at the live
// surface under this environment. That is correct: none of them is mounted
// under `/test/v1`, and there is nothing sandbox-shaped to aim them at.
const testEnvPath = path.join(outDir, 'openapi-test.postman_environment.json')
fs.writeFileSync(
  testEnvPath,
  JSON.stringify(
    envFile('OpenSteward — Sandbox (test mode)', 'http://localhost:3010', '/test/v1'),
    null,
    2,
  ) + '\n',
)

const opCount = Object.values(folders).reduce((n, items) => n + items.length, 0)
console.log(
  `✓ wrote ${path.relative(process.cwd(), collectionPath)} (${opCount} requests across ${allTags.length} folders)`,
)
console.log(`✓ wrote ${path.relative(process.cwd(), localEnvPath)}`)
console.log(`✓ wrote ${path.relative(process.cwd(), prodEnvPath)}`)
console.log(`✓ wrote ${path.relative(process.cwd(), testEnvPath)}`)
