#!/usr/bin/env tsx
/**
 * Generates a Postman Collection v2.1 + environment file from
 * `docs/openapi/admin-api.openapi.json`. Mirrors the existing
 * `apps/integration-server/scripts/generate-postman.ts` shape so
 * operators see one familiar bundle across both APIs.
 *
 * The environment carries a pre-wired `adminApiJwt` variable that the
 * collection sends as `Authorization: Bearer {{adminApiJwt}}` — the
 * single thing an operator has to fill in after importing.
 *
 * Pure pipeline. Input: the on-disk OpenAPI snapshot. Output: two
 * deterministic JSON files under `docs/postman/`. The script never
 * authors any spec content of its own.
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
  operationId?: string
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

interface Spec {
  info: { title: string; version: string; description?: string }
  tags?: Array<{ name: string; description?: string }>
  paths: Record<string, Record<string, Operation>>
  components?: {
    schemas?: Record<string, Record<string, unknown>>
  }
}

const openapiPath = path.resolve(__dirname, '../../../docs/openapi/admin-api.openapi.json')
if (!fs.existsSync(openapiPath)) {
  console.error(`✗ ${openapiPath} not found — run generate:openapi first.`)
  process.exit(1)
}
const spec: Spec = JSON.parse(fs.readFileSync(openapiPath, 'utf8'))

// Stable UUIDs so the generated artifacts are deterministic — Postman
// uses these as collection / environment identifiers; reusing them
// across runs keeps `pnpm run check:docs` from showing diffs on every
// regeneration.
function uid(seed: string): string {
  const h = crypto.createHash('sha256').update(seed).digest('hex')
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `4${h.slice(13, 16)}`,
    `${(parseInt(h[16]!, 16) & 0x3 | 0x8).toString(16)}${h.slice(17, 20)}`,
    h.slice(20, 32),
  ].join('-')
}

function toPostmanPath(oaPath: string): string {
  return oaPath.replace(/\{(\w+)\}/g, ':$1')
}

function exampleFor(p: Param): string {
  const enumVals = p.schema?.enum
  if (Array.isArray(enumVals) && enumVals.length > 0) return String(enumVals[0])
  if (p.schema?.format === 'uuid') return '00000000-0000-0000-0000-000000000000'
  if (p.name === 'tenantId') return '{{tenantId}}'
  if (p.name === 'vertical') return '{{vertical}}'
  if (p.name === 'platform' || p.name === 'slug') return '{{platform}}'
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
  const inline = op.requestBody?.content?.['application/json']?.schema as
    | Record<string, unknown>
    | undefined
  if (inline) return JSON.stringify(buildExample(inline, new Set()), null, 2)
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

for (const [pathKey, methods] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(methods)) {
    const httpVerbs = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])
    if (!httpVerbs.has(method)) continue
    const tag = op.tags?.[0] ?? 'Other'
    const params = op.parameters ?? []
    const pathParams = params.filter((p) => p.in === 'path')
    const queryParams = params.filter((p) => p.in === 'query')
    const headerParams = params.filter((p) => p.in === 'header')

    const url = {
      raw: `{{baseUrl}}${toPostmanPath(pathKey)}`,
      host: ['{{baseUrl}}'],
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

    const isPublic = Array.isArray(op.security) && op.security.length === 0
    const headers = [
      ...(isPublic
        ? []
        : [
            {
              key: 'Authorization',
              value: 'Bearer {{adminApiJwt}}',
              description: 'Admin-API JWT minted by POST /api/auth/login.',
            },
          ]),
      ...headerParams.map((p) => ({
        key: p.name,
        value: exampleFor(p),
        description: p.description,
        disabled: !p.required,
      })),
    ]

    const body = bodyExample(op)

    const req: PostmanRequest = {
      name: op.summary ?? op.operationId ?? `${method.toUpperCase()} ${pathKey}`,
      request: {
        method: method.toUpperCase(),
        header: headers,
        url,
        body: body
          ? { mode: 'raw', raw: body, options: { raw: { language: 'json' } } }
          : undefined,
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
  ...Object.keys(folders).filter((t) => !tagOrder.includes(t)).sort(),
]

const collection = {
  info: {
    name: spec.info.title,
    description: spec.info.description ?? '',
    schema:
      'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    _postman_id: uid('opensteward:admin-api:collection'),
  },
  variable: [
    { key: 'baseUrl', value: '{{baseUrl}}', type: 'default' },
    { key: 'adminApiJwt', value: '', type: 'secret' },
    { key: 'tenantId', value: '', type: 'default' },
    { key: 'vertical', value: 'accounting', type: 'default' },
    { key: 'platform', value: '', type: 'default' },
    { key: 'resourceId', value: '', type: 'default' },
  ],
  item: allTags.map((tag) => ({
    name: tag,
    description: (spec.tags ?? []).find((t) => t.name === tag)?.description ?? '',
    item: folders[tag]!,
  })),
  event: [],
}

interface EnvVar {
  key: string
  value: string
  type: 'default' | 'secret'
  enabled: boolean
}

function envFile(name: string, baseUrl: string): {
  id: string
  name: string
  values: EnvVar[]
  _postman_variable_scope: 'environment'
  _postman_exported_at: string
  _postman_exported_using: string
} {
  return {
    id: uid(`opensteward:admin-api:env:${name}`),
    name,
    values: [
      { key: 'baseUrl', value: baseUrl, type: 'default', enabled: true },
      // Filled in by the operator after `POST /api/auth/login` returns
      // a JWT — Postman re-uses it on every other request via the
      // collection-level Authorization header.
      { key: 'adminApiJwt', value: '', type: 'secret', enabled: true },
      { key: 'tenantId', value: '', type: 'default', enabled: true },
      { key: 'vertical', value: 'accounting', type: 'default', enabled: true },
      { key: 'platform', value: 'fortnox', type: 'default', enabled: true },
      { key: 'resourceId', value: '', type: 'default', enabled: true },
    ],
    _postman_variable_scope: 'environment',
    _postman_exported_at: '2026-04-22T00:00:00.000Z',
    _postman_exported_using: 'opensteward admin-api generate-postman',
  }
}

const outDir = path.resolve(__dirname, '../../../docs/postman')
fs.mkdirSync(outDir, { recursive: true })

const collectionPath = path.join(outDir, 'admin-api.postman_collection.json')
const localEnvPath = path.join(outDir, 'admin-api-local.postman_environment.json')

fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2) + '\n')
fs.writeFileSync(
  localEnvPath,
  JSON.stringify(envFile('OpenSteward Admin API — Local', 'http://localhost:3001'), null, 2) + '\n',
)

const opCount = Object.values(folders).reduce((n, items) => n + items.length, 0)
console.log(
  `✓ wrote ${path.relative(process.cwd(), collectionPath)} (${opCount} requests across ${allTags.length} folders)`,
)
console.log(`✓ wrote ${path.relative(process.cwd(), localEnvPath)}`)
