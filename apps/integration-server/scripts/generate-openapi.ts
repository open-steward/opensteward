/**
 * Builds the unified OpenAPI 3.1 spec for the integration-server app.
 *
 * Imports each vertical's `buildSpec()` from src/verticals/<name>/openapi.ts,
 * prefixes its paths with `/v1/<name>/...` and its component schemas with
 * `<Vertical>...`, and merges the result into a single document written to
 * docs/openapi/openapi.{json,yaml}.
 */

import fs from 'node:fs'
import path from 'node:path'
// js-yaml 5 removed its default export. A namespace import is the form that
// works under BOTH native ESM (docs-server compiles to nodenext) and the
// CommonJS interop the other apps emit — a default import crashes the
// former at boot with "does not provide an export named 'default'".
import * as yaml from 'js-yaml'

import {
  buildServersBlock,
  isVersionedPath,
  validateServerVariables,
  ISO_3166_1_ALPHA2_CODES,
  type OpenApiServersConfig,
} from '@opensteward/shared'
import { buildSpec as buildAccounting } from '../src/verticals/accounting/openapi'
import { PLATFORMS as ACCOUNTING_PLATFORMS } from '../src/verticals/accounting/platforms/metadata'
import { PLATFORMS as CRM_PLATFORMS } from '../src/verticals/crm/platforms/metadata'
import { PLATFORMS as ECOMMERCE_PLATFORMS } from '../src/verticals/ecommerce/platforms/metadata'
import { PLATFORMS as LOGISTICS_PLATFORMS } from '../src/verticals/logistics/platforms/metadata'
import { PLATFORMS as PAYMENTS_PLATFORMS } from '../src/verticals/payments/platforms/metadata'
import { PLATFORMS as DOCSIGN_PLATFORMS } from '../src/verticals/docsign/platforms/metadata'
import { PLATFORMS as PROJECTS_PLATFORMS } from '../src/verticals/projects/platforms/metadata'
import { PLATFORMS as SUPPORT_PLATFORMS } from '../src/verticals/customer-support/platforms/metadata'
import { PLATFORMS as INVENTORY_PLATFORMS } from '../src/verticals/inventory/platforms/metadata'
import { buildSpec as buildCrm } from '../src/verticals/crm/openapi'
import { buildSpec as buildEcommerce } from '../src/verticals/ecommerce/openapi'
import { buildSpec as buildLogistics } from '../src/verticals/logistics/openapi'
import { buildSpec as buildPayments } from '../src/verticals/payments/openapi'
import { buildSpec as buildDocsign } from '../src/verticals/docsign/openapi'
import { buildSpec as buildProjects } from '../src/verticals/projects/openapi'
import { buildSpec as buildSupport } from '../src/verticals/customer-support/openapi'
import { buildSpec as buildInventory } from '../src/verticals/inventory/openapi'

// ── Platform slug enum (sourced from each vertical's platforms/metadata.ts) ──
// Collects every vertical's platform metadata once at build time so the
// `{platform}` path-param in the unified spec gets a typed dropdown and
// stays in sync as adapters are added or removed.
/**
 * Build-time read of `openapi.servers` from config.yml (if present). Direct
 * file read rather than `loadConfig()` because the generator runs in CI
 * environments without STORE_SECRET set — we don't need the rest of the
 * config to bake server variables into the on-disk spec.
 *
 * Returns undefined → compiled defaults flow through buildServersBlock.
 */
function loadOpenapiServersFromYaml(): OpenApiServersConfig | undefined {
  const yamlPath = process.env['CONFIG_PATH'] ?? path.resolve(__dirname, '../config/config.yml')
  if (!fs.existsSync(yamlPath)) return undefined
  const parsed = (yaml.load(fs.readFileSync(yamlPath, 'utf8')) ?? {}) as {
    openapi?: { servers?: OpenApiServersConfig }
  }
  const cfg = parsed.openapi?.servers
  if (cfg) validateServerVariables(cfg)
  return cfg
}

/**
 * Every documented adapter slug, from each vertical's `platforms/metadata.ts`.
 *
 * Metadata is the list the rest of the product treats as canonical
 * (`/v1/platforms`, `docs/platforms.md`), and `check:adapter-parity` already
 * guards it against the factory map, so a real adapter cannot silently drop
 * out of this list.
 */
const ALL_PLATFORM_SLUGS: string[] = Array.from(
  new Set(
    [
      ACCOUNTING_PLATFORMS,
      CRM_PLATFORMS,
      ECOMMERCE_PLATFORMS,
      LOGISTICS_PLATFORMS,
      PAYMENTS_PLATFORMS,
      DOCSIGN_PLATFORMS,
      PROJECTS_PLATFORMS,
      SUPPORT_PLATFORMS,
      INVENTORY_PLATFORMS,
    ].flatMap((platforms) =>
      (platforms as ReadonlyArray<{ slug: string }>).map((entry) => entry.slug),
    ),
  ),
).sort()

// Mutates the spec in place: any path-param that represents a platform
// slug (`platform`, or `slug` on a /v1/platforms path) gets the enum
// applied. Pass-through for everything else.
function injectPlatformEnum(spec: OpenApiDoc): void {
  function isPlatformSlugParam(pathKey: string, paramName: string): boolean {
    if (paramName === 'platform') return true
    if (paramName === 'slug' && pathKey.startsWith('/v1/platforms/')) return true
    return false
  }
  function visitParameters(pathKey: string, params: unknown): void {
    if (!Array.isArray(params)) return
    for (const p of params as Array<Record<string, unknown>>) {
      if (
        p &&
        typeof p === 'object' &&
        typeof p.name === 'string' &&
        p.in === 'path' &&
        isPlatformSlugParam(pathKey, p.name)
      ) {
        const schema = p.schema as Record<string, unknown> | undefined
        if (schema && schema.type === 'string' && !('enum' in schema)) {
          // A `$ref`, not the list itself: inlining would write ~43 KB per
          // site across 9 sites — 22.7% of the document, and the same nine
          // copies again in the generated SDK types.
          p.schema = { $ref: '#/components/schemas/PlatformSlug' }
        }
      }
    }
  }
  for (const [pathKey, pathItem] of Object.entries(spec.paths) as Array<
    [string, Record<string, unknown>]
  >) {
    visitParameters(pathKey, pathItem?.parameters as unknown)
    for (const op of Object.values(pathItem) as Array<Record<string, unknown>>) {
      if (op && typeof op === 'object') visitParameters(pathKey, op.parameters as unknown)
    }
  }
}
import {
  controlPlanePaths,
  controlPlaneSchemas,
  controlPlaneSecuritySchemes,
  controlPlaneTags,
} from './control-plane-spec'
import {
  sharedSchemas,
  SHARED_SCHEMA_NAMES,
  sharedResponses,
  sharedHeaders,
  sharedRequestHeaders,
} from './shared-schemas'
import { sharedParameters, SHARED_PARAM_INDEX } from './shared-parameters'

type Components = Record<string, Record<string, unknown>>

interface OpenApiDoc {
  openapi: string
  info: Record<string, unknown>
  servers?: Array<{ url: string; description?: string; variables?: Record<string, unknown> }>
  paths: Record<string, unknown>
  components?: Components
  tags?: Array<{ name: string; description?: string }>
  [key: string]: unknown
}

interface Vertical {
  name: string
  prefix: string
  spec: OpenApiDoc
}

function capitalize(s: string): string {
  if (s.length <= 3) return s.toUpperCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const VERTICALS: Vertical[] = [
  { name: 'accounting', prefix: capitalize('accounting'), spec: buildAccounting() as OpenApiDoc },
  { name: 'crm', prefix: capitalize('crm'), spec: buildCrm() as OpenApiDoc },
  { name: 'ecommerce', prefix: capitalize('ecommerce'), spec: buildEcommerce() as OpenApiDoc },
  { name: 'logistics', prefix: capitalize('logistics'), spec: buildLogistics() as OpenApiDoc },
  { name: 'payments', prefix: capitalize('payments'), spec: buildPayments() as OpenApiDoc },
  { name: 'docsign', prefix: capitalize('docsign'), spec: buildDocsign() as OpenApiDoc },
  { name: 'projects', prefix: capitalize('projects'), spec: buildProjects() as OpenApiDoc },
  { name: 'customer-support', prefix: 'CustomerSupport', spec: buildSupport() as OpenApiDoc },
  { name: 'inventory', prefix: capitalize('inventory'), spec: buildInventory() as OpenApiDoc },
]

/**
 * Walk any JSON value and rewrite every $ref pointing at
 * `#/components/schemas/<Name>` so <Name> is prefixed. Leaves other component
 * sections (responses, parameters, etc.) alone — they use cross-vertical
 * names and don't collide.
 */
function prefixRefs(obj: unknown, prefix: string): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/^#\/components\/schemas\/(.+)$/, (match: string, name: string) =>
      SHARED_SCHEMA_NAMES.has(name) ? match : `#/components/schemas/${prefix}${name}`,
    )
  }
  if (Array.isArray(obj)) return obj.map((v) => prefixRefs(v, prefix))
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, prefixRefs(v, prefix)]),
    )
  }
  return obj
}

function prefixSchemas(schemas: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [name, schema] of Object.entries(schemas)) {
    // Shared schemas (Error, Money, etc.) are owned by shared-schemas.ts and
    // overlaid below. Any per-vertical entry under the same name would shadow
    // the canonical one after prefixing is bypassed, so drop them here.
    if (SHARED_SCHEMA_NAMES.has(name)) continue
    result[`${prefix}${name}`] = prefixRefs(schema, prefix)
  }
  return result
}

// Metadata-only keys that are safe to keep alongside a `$ref` when collapsing
// an inline date-time schema. `pattern` is dropped because `format: date-time`
// already implies ISO 8601 — the regex Zod emits is redundant.
const ISO8601_PASSTHROUGH_KEYS = new Set(['description', 'title', 'example', 'examples', 'default'])
const ISO8601_DROPPABLE_KEYS = new Set(['pattern', 'minLength', 'maxLength'])

// When the inline `description` semantically duplicates the canonical shared
// schema's description, drop it on collapse — the caller reads the description
// via the `$ref` to the canonical definition once. Match by prefix because
// Zod's `.describe()` text starts with the ISO/E.164/RFC name.
const REDUNDANT_DESCRIPTION_PREFIXES = [
  /^ISO 8601/i,
  /^ISO 4217/i,
  /^ISO 3166/i,
  /^ISO-4217/i,
  /^ISO-3166/i,
  /^Hex RGB|CSS3 .* hex|^Brand hex/i,
  /^ITU-T E\.164|^E\.164/i,
  /^RFC 6838|^MIME type/i,
  /^Calendar date/i,
]

function isRedundantDescription(desc: unknown): boolean {
  if (typeof desc !== 'string') return false
  return REDUNDANT_DESCRIPTION_PREFIXES.some((re) => re.test(desc))
}

function copyMetadata(obj: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const metadata: Record<string, unknown> = {}
  for (const k of keys) {
    if (!ISO8601_PASSTHROUGH_KEYS.has(k)) continue
    if (k === 'description' && isRedundantDescription(obj[k])) continue
    metadata[k] = obj[k]
  }
  return metadata
}

function collapseInlineIso8601(node: unknown): unknown {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = collapseInlineIso8601(node[i])
    return node
  }
  if (!node || typeof node !== 'object') return node
  const obj = node as Record<string, unknown>
  const keys = Object.keys(obj)

  // Handle three shapes the Zod export produces:
  //   1. Bare:                { type: 'string',           format: 'date-time' }
  //   2. Nullable (OAS 3.0):  { type: 'string',           format: 'date-time', nullable: true }
  //   3. Nullable (OAS 3.1):  { type: ['string', 'null'], format: 'date-time' }
  // …optionally combined with description / pattern / etc.
  const isStringType = obj.type === 'string'
  const isNullableUnion =
    Array.isArray(obj.type) &&
    (obj.type as unknown[]).length === 2 &&
    (obj.type as unknown[]).includes('string') &&
    (obj.type as unknown[]).includes('null')
  const isDateTimeShape =
    (isStringType || isNullableUnion) &&
    obj.format === 'date-time' &&
    keys.every(
      (k) =>
        k === 'type' ||
        k === 'format' ||
        k === 'nullable' ||
        ISO8601_PASSTHROUGH_KEYS.has(k) ||
        ISO8601_DROPPABLE_KEYS.has(k),
    )

  if (isDateTimeShape) {
    const isNullable = isNullableUnion || obj.nullable === true
    const metadata = copyMetadata(obj, keys)
    if (isNullable) {
      return {
        anyOf: [{ $ref: '#/components/schemas/ISO8601' }, { type: 'null' }],
        ...metadata,
      }
    }
    return { $ref: '#/components/schemas/ISO8601', ...metadata }
  }

  for (const k of keys) obj[k] = collapseInlineIso8601(obj[k])
  return obj
}

// Collapse the inline calendar-date shape into a `$ref` to `CalendarDate`.
//
// `z.iso.date()` emits `format: 'date'` plus a ~200-character leap-year regex,
// and the date-or-date-time union puts that on every `postedAt`/`dueAt` in the
// document. `format: date` already implies the same grammar, so the pattern is
// dropped exactly as it is for date-time.
function collapseInlineCalendarDate(node: unknown): unknown {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = collapseInlineCalendarDate(node[i])
    return node
  }
  if (!node || typeof node !== 'object') return node
  const obj = node as Record<string, unknown>
  const keys = Object.keys(obj)

  const isStringType = obj.type === 'string'
  const isNullableUnion =
    Array.isArray(obj.type) &&
    (obj.type as unknown[]).length === 2 &&
    (obj.type as unknown[]).includes('string') &&
    (obj.type as unknown[]).includes('null')
  const isDateShape =
    (isStringType || isNullableUnion) &&
    obj.format === 'date' &&
    keys.every(
      (k) =>
        k === 'type' ||
        k === 'format' ||
        k === 'nullable' ||
        ISO8601_PASSTHROUGH_KEYS.has(k) ||
        ISO8601_DROPPABLE_KEYS.has(k),
    )

  if (isDateShape) {
    const isNullable = isNullableUnion || obj.nullable === true
    const metadata = copyMetadata(obj, keys)
    if (isNullable) {
      return {
        anyOf: [{ $ref: '#/components/schemas/CalendarDate' }, { type: 'null' }],
        ...metadata,
      }
    }
    return { $ref: '#/components/schemas/CalendarDate', ...metadata }
  }

  for (const k of keys) obj[k] = collapseInlineCalendarDate(obj[k])
  return obj
}

// Generic walker for the inline shape Zod emits when a field is a
// fixed-length uppercase string code (ISO 3166-1 alpha-2, ISO 4217, etc.):
//   { type: 'string', pattern, minLength: N, maxLength: N }
// Plus optional metadata (description/etc.) and nullable variants.
function makeFixedCodeCollapser(pattern: string, length: number, sharedRef: string) {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) node[i] = walk(node[i])
      return node
    }
    if (!node || typeof node !== 'object') return node
    const obj = node as Record<string, unknown>
    const keys = Object.keys(obj)

    const isStringType = obj.type === 'string'
    const isNullableUnion =
      Array.isArray(obj.type) &&
      (obj.type as unknown[]).length === 2 &&
      (obj.type as unknown[]).includes('string') &&
      (obj.type as unknown[]).includes('null')
    const matchesShape =
      (isStringType || isNullableUnion) &&
      obj.pattern === pattern &&
      obj.minLength === length &&
      obj.maxLength === length &&
      keys.every(
        (k) =>
          k === 'type' ||
          k === 'pattern' ||
          k === 'minLength' ||
          k === 'maxLength' ||
          k === 'nullable' ||
          ISO8601_PASSTHROUGH_KEYS.has(k),
      )

    if (matchesShape) {
      const isNullable = isNullableUnion || obj.nullable === true
      const metadata = copyMetadata(obj, keys)
      if (isNullable) {
        return {
          anyOf: [{ $ref: sharedRef }, { type: 'null' }],
          ...metadata,
        }
      }
      return { $ref: sharedRef, ...metadata }
    }

    for (const k of keys) obj[k] = walk(obj[k])
    return obj
  }
  return walk
}

const collapseInlineIso4217 = makeFixedCodeCollapser(
  '^[A-Z]{3}$',
  3,
  '#/components/schemas/ISO4217',
)

// Walker for the inline shape Zod emits when a field has a regex constraint
// but no fixed length — used for HexColor. Matches `{ type: 'string', pattern }`
// optionally with metadata; rewrites to `$ref sharedRef`.
function makePatternCollapser(pattern: string, sharedRef: string) {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) node[i] = walk(node[i])
      return node
    }
    if (!node || typeof node !== 'object') return node
    const obj = node as Record<string, unknown>
    const keys = Object.keys(obj)

    const isStringType = obj.type === 'string'
    const isNullableUnion =
      Array.isArray(obj.type) &&
      (obj.type as unknown[]).length === 2 &&
      (obj.type as unknown[]).includes('string') &&
      (obj.type as unknown[]).includes('null')
    const matchesShape =
      (isStringType || isNullableUnion) &&
      obj.pattern === pattern &&
      keys.every(
        (k) =>
          k === 'type' || k === 'pattern' || k === 'nullable' || ISO8601_PASSTHROUGH_KEYS.has(k),
      )

    if (matchesShape) {
      const isNullable = isNullableUnion || obj.nullable === true
      const metadata = copyMetadata(obj, keys)
      if (isNullable) {
        return { anyOf: [{ $ref: sharedRef }, { type: 'null' }], ...metadata }
      }
      return { $ref: sharedRef, ...metadata }
    }

    for (const k of keys) obj[k] = walk(obj[k])
    return obj
  }
  return walk
}

const collapseInlineHexColor = makePatternCollapser(
  '^#[0-9A-Fa-f]{6}$',
  '#/components/schemas/HexColor',
)

// Walk every operation's `parameters` array and replace inline param objects
// whose (name + in) match a canonical shared param with a `$ref`. Keys other
// than name/in/required/description/schema (e.g. `examples`) leave the inline
// in place, since they may carry per-op semantics.
function isParamRefCandidate(value: unknown): false | string {
  if (!value || typeof value !== 'object') return false
  const obj = value as Record<string, unknown>
  if (typeof obj.$ref === 'string') return false
  if (typeof obj.name !== 'string' || typeof obj.in !== 'string') return false
  const key = SHARED_PARAM_INDEX.get(`${obj.name}|${obj.in}`)
  if (!key) return false
  const allowed = new Set(['name', 'in', 'required', 'description', 'schema'])
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k)) return false
  }
  return key
}

// Map of `<statusCode>|<description-regex>` to canonical shared response.
// Collapses the ~15 straggler inline 4xx/501 responses (e.g. `'400': {
// description: 'Validation error' }`) into `{ $ref: shared response }` so
// they get the structured Error body for free. Only triggers when the
// inline response object has ONLY a `description` key (no content/headers).
const RESPONSE_DESC_FINGERPRINTS: Array<[string, RegExp, string]> = [
  [
    '400',
    /^(validation error|bad request|connection_id required|invalid json body|body must include)/i,
    'BadRequest',
  ],
  [
    '401',
    /^(missing or invalid api key|invalid api key|invalid webhook signature|unauthorized)/i,
    'Unauthorized',
  ],
  ['403', /^forbidden/i, 'Forbidden'],
  ['404', /^not found|adapter not found/i, 'NotFound'],
  ['501', /^not implemented/i, 'NotImplemented'],
]

// Auto-attach the canonical response-header set (X-Request-Id, X-RateLimit-*)
// to every response on every operation, and the Idempotency-Key request param
// to every mutating operation. Universal middleware behaviour deserves
// universal documentation.
const UNIVERSAL_RESPONSE_HEADERS: Record<string, { $ref: string }> = {
  'x-request-id': { $ref: '#/components/headers/XRequestId' },
  'x-ratelimit-limit': { $ref: '#/components/headers/XRateLimitLimit' },
  'x-ratelimit-remaining': { $ref: '#/components/headers/XRateLimitRemaining' },
  'x-ratelimit-reset': { $ref: '#/components/headers/XRateLimitReset' },
}
const MUTATING_VERBS = new Set(['post', 'patch', 'put', 'delete'])

function annotateUniversalHeadersAndParams(paths: Record<string, Record<string, unknown>>): void {
  for (const item of Object.values(paths)) {
    if (!item || typeof item !== 'object') continue
    for (const [verb, op] of Object.entries(item as Record<string, unknown>)) {
      if (!op || typeof op !== 'object') continue
      const operation = op as Record<string, unknown>

      // Attach Idempotency-Key param to mutating verbs.
      if (MUTATING_VERBS.has(verb)) {
        const params = (operation.parameters as unknown[]) ?? []
        const alreadyPresent = params.some((p) => {
          if (!p || typeof p !== 'object') return false
          const ref = (p as Record<string, unknown>).$ref
          return ref === '#/components/parameters/IdempotencyKeyParam'
        })
        if (!alreadyPresent) {
          operation.parameters = [
            ...params,
            { $ref: '#/components/parameters/IdempotencyKeyParam' },
          ]
        }
      }

      // Attach universal response headers to every response.
      const responses = operation.responses as Record<string, unknown> | undefined
      if (!responses) continue
      for (const [code, value] of Object.entries(responses)) {
        if (!value || typeof value !== 'object') continue
        // $ref response objects (e.g. shared BadRequest) can't carry headers
        // inline; skip them — the universal headers still appear on inline
        // 2xx/2XX responses which is what the user-facing docs show.
        if (typeof (value as Record<string, unknown>).$ref === 'string') continue
        const respObj = value as Record<string, unknown>
        const existingHeaders = (respObj.headers as Record<string, unknown>) ?? {}
        respObj.headers = { ...UNIVERSAL_RESPONSE_HEADERS, ...existingHeaders }

        // Targeted headers per status code.
        if (code === '409') {
          ;(respObj.headers as Record<string, unknown>)['retry-after'] = {
            $ref: '#/components/headers/RetryAfter',
          }
        }
        if (code === '422') {
          ;(respObj.headers as Record<string, unknown>)['idempotency-key-conflict'] = {
            $ref: '#/components/headers/IdempotencyKeyConflict',
          }
        }
        if (code.startsWith('2')) {
          ;(respObj.headers as Record<string, unknown>)['idempotency-replayed'] = {
            $ref: '#/components/headers/IdempotencyReplayed',
          }
        }
      }
    }
  }
}

// Auto-attach OAS hypermedia `links` to every `POST /<resource>` returning 201
// when a sibling path `/<resource>/{id}` exists. Documents the runtime contract:
// "the id in the 201 body feeds into this GET/PATCH/DELETE."
function attachCrudLinks(paths: Record<string, Record<string, unknown>>): void {
  const refForOp = (path: string, verb: string): string => {
    const escaped = path.replace(/~/g, '~0').replace(/\//g, '~1')
    return `#/paths/${escaped}/${verb}`
  }

  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue
    const post = (item as Record<string, unknown>).post as Record<string, unknown> | undefined
    if (!post) continue
    const responses = post.responses as Record<string, unknown> | undefined
    if (!responses) continue
    const created = responses['201'] as Record<string, unknown> | undefined
    if (!created || typeof created.$ref === 'string') continue

    const siblingKey = `${path}/{id}`
    const sibling = paths[siblingKey] as Record<string, unknown> | undefined
    if (!sibling) continue

    const links: Record<string, unknown> = {}
    const verbToLink: Array<[string, string, string]> = [
      ['get', 'GetById', 'Fetch this resource by its `id`.'],
      ['patch', 'UpdateById', 'Update this resource by its `id`.'],
      ['put', 'ReplaceById', 'Replace this resource by its `id`.'],
      ['delete', 'DeleteById', 'Delete this resource by its `id`.'],
    ]
    for (const [verb, key, description] of verbToLink) {
      if (sibling[verb]) {
        links[key] = {
          operationRef: refForOp(siblingKey, verb),
          parameters: { id: '$response.body#/data/id' },
          description,
        }
      }
    }
    if (Object.keys(links).length === 0) continue

    // Preserve existing keys (description, content, headers); merge links.
    created.links = { ...(created.links as Record<string, unknown> | undefined), ...links }
  }
}

function collapseInlineResponses(pathsRoot: unknown): unknown {
  const visit = (responsesObj: Record<string, unknown>) => {
    for (const [code, value] of Object.entries(responsesObj)) {
      if (!value || typeof value !== 'object') continue
      const obj = value as Record<string, unknown>
      if (typeof obj.$ref === 'string') continue
      const keys = Object.keys(obj)
      if (keys.length !== 1 || keys[0] !== 'description') continue
      const desc = obj.description
      if (typeof desc !== 'string') continue
      for (const [c, pattern, refName] of RESPONSE_DESC_FINGERPRINTS) {
        if (c === code && pattern.test(desc)) {
          responsesObj[code] = { $ref: `#/components/responses/${refName}` }
          break
        }
      }
    }
  }
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const v of node) walk(v)
      return
    }
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    if (obj.responses && typeof obj.responses === 'object' && !Array.isArray(obj.responses)) {
      visit(obj.responses as Record<string, unknown>)
    }
    for (const v of Object.values(obj)) walk(v)
  }
  walk(pathsRoot)
  return pathsRoot
}

function collapseInlineParameters(node: unknown): unknown {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const refName = isParamRefCandidate(node[i])
      if (refName) {
        node[i] = { $ref: `#/components/parameters/${refName}` }
      } else {
        node[i] = collapseInlineParameters(node[i])
      }
    }
    return node
  }
  if (!node || typeof node !== 'object') return node
  const obj = node as Record<string, unknown>
  for (const k of Object.keys(obj)) obj[k] = collapseInlineParameters(obj[k])
  return obj
}

// Collapse every inline ISO 3166-1 alpha-2 country-code shape into a `$ref`
// to the shared `ISO3166` schema. Recognises three shapes a country-code
// schema can plausibly serialize to:
//   1. Regex:  { type: 'string', pattern: '^[A-Z]{2}$', minLength: 2, maxLength: 2 }
//   2. Enum:   { type: 'string', enum: [...249 codes] }
//   3. Refine: { type: 'string', description: 'ISO 3166-1 alpha-2 …', example: 'US' }
// `@opensteward/shared`'s `Iso3166Alpha2` is `z.string().refine(...)` (shape
// 3) rather than a `z.enum` of the full officially-assigned list: the enum
// would reject well-formed non-codes (`'UK'`, `'XX'`, `'ZZ'`), but its
// *inferred type* is the 249-member literal union, which no call site typed
// as plain `string` (~1,000 sites) would accept — the refine gives the same
// runtime rejection while `z.infer` stays `string`. `z.toJSONSchema` cannot
// represent an arbitrary `.refine()` predicate, so shape 3 carries no
// country-specific constraint at all; the description text (elided by
// `isRedundantDescription` on collapse, same as shapes 1/2) is the only
// signal left that a bare string field is this one.
// All three shapes are recognised so a change to `Iso3166Alpha2` doesn't
// silently stop the collapsing — this walker degrades gracefully instead of
// failing closed. Plus optional metadata (description/etc.) and nullable
// variants — mirrors the ISO 8601 walker above.
const ISO_3166_ENUM_VALUES = new Set<string>(ISO_3166_1_ALPHA2_CODES)
const ISO_3166_DESCRIPTION_RE = /^ISO 3166-1 alpha-2/i

function isIso3166EnumArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === ISO_3166_ENUM_VALUES.size &&
    value.every((v) => typeof v === 'string' && ISO_3166_ENUM_VALUES.has(v))
  )
}

function collapseInlineIso3166(node: unknown): unknown {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = collapseInlineIso3166(node[i])
    return node
  }
  if (!node || typeof node !== 'object') return node
  const obj = node as Record<string, unknown>
  const keys = Object.keys(obj)

  const isStringType = obj.type === 'string'
  const isNullableUnion =
    Array.isArray(obj.type) &&
    (obj.type as unknown[]).length === 2 &&
    (obj.type as unknown[]).includes('string') &&
    (obj.type as unknown[]).includes('null')

  const isRegexShape =
    obj.pattern === '^[A-Z]{2}$' &&
    obj.minLength === 2 &&
    obj.maxLength === 2 &&
    keys.every(
      (k) =>
        k === 'type' ||
        k === 'pattern' ||
        k === 'minLength' ||
        k === 'maxLength' ||
        k === 'nullable' ||
        ISO8601_PASSTHROUGH_KEYS.has(k),
    )

  const isEnumShape =
    isIso3166EnumArray(obj.enum) &&
    keys.every(
      (k) => k === 'type' || k === 'enum' || k === 'nullable' || ISO8601_PASSTHROUGH_KEYS.has(k),
    )

  const isRefineShape =
    typeof obj.description === 'string' &&
    ISO_3166_DESCRIPTION_RE.test(obj.description) &&
    !('pattern' in obj) &&
    !('enum' in obj) &&
    keys.every((k) => k === 'type' || k === 'nullable' || ISO8601_PASSTHROUGH_KEYS.has(k))

  const isCountryCodeShape =
    (isStringType || isNullableUnion) && (isRegexShape || isEnumShape || isRefineShape)

  if (isCountryCodeShape) {
    const isNullable = isNullableUnion || obj.nullable === true
    const metadata = copyMetadata(obj, keys)
    if (isNullable) {
      return {
        anyOf: [{ $ref: '#/components/schemas/ISO3166' }, { type: 'null' }],
        ...metadata,
      }
    }
    return { $ref: '#/components/schemas/ISO3166', ...metadata }
  }

  for (const k of keys) obj[k] = collapseInlineIso3166(obj[k])
  return obj
}

// Tags that are shared across verticals (the operation belongs to a horizontal
// concept like "Connections" or "Auth") — preserved verbatim with the vertical
// name appended as a secondary tag so the operation appears in both groupings.
// Note: Sync is documented exactly once in control-plane-spec.ts via
// `/v1/{vertical}/sync` with `{vertical}` as a path-param, so it is not in
// this set.
const SHARED_TAGS = new Set(['Auth', 'Connections', 'Admin'])

/** Tags documented once at the top level, so a vertical must not repeat them
 *  in its own resource list. Verticals author them lowercase. */
const SHARED_TAG_NAMES_LOWER = new Set(
  ['Auth', 'Connections', 'Admin', 'Sync', 'Webhooks', 'Customers', 'Events'].map((t) =>
    t.toLowerCase(),
  ),
)

function setOperationTags(pathItem: unknown, verticalTag: string): unknown {
  if (Array.isArray(pathItem)) return pathItem.map((v) => setOperationTags(v, verticalTag))
  if (pathItem && typeof pathItem === 'object') {
    return Object.fromEntries(
      Object.entries(pathItem as Record<string, unknown>).map(([k, v]) => {
        if (k === 'tags' && Array.isArray(v)) {
          // If the per-vertical helper tagged this op with a shared horizontal
          // tag (Sync, Auth, Connections, Admin), keep it and append the
          // vertical name. Otherwise (resource ops like contacts/invoices)
          // replace with the vertical tag.
          const stringTags = (v as unknown[]).filter((t): t is string => typeof t === 'string')
          const hasShared = stringTags.some((t) => SHARED_TAGS.has(t))
          if (hasShared) {
            const merged = [...stringTags]
            if (!merged.includes(verticalTag)) merged.push(verticalTag)
            return [k, merged]
          }
          return [k, [verticalTag]]
        }
        return [k, setOperationTags(v, verticalTag)]
      }),
    )
  }
  return pathItem
}

function prefixPaths(
  paths: Record<string, unknown>,
  segment: string,
  schemaPrefix: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    // Per-vertical specs use /v1/<resource> and /auth/<platform>/...; the
    // unified service exposes them as /v1/<vertical>/<resource> and
    // /auth/<vertical>/<platform>/.... Per-vertical /webhooks/* fragments are
    // dropped: the unified webhook surface is documented once by
    // control-plane-spec's /webhooks/{vertical}/{platform}.
    let newKey: string | null
    if (pathKey.startsWith('/v1/')) {
      newKey = `/v1/${segment}${pathKey.slice(3)}`
    } else if (pathKey.startsWith('/auth/')) {
      newKey = `/auth/${segment}${pathKey.slice(5)}`
    } else if (pathKey.startsWith('/webhooks/')) {
      // Documented once by control-plane-spec instead; drop the fragment.
      newKey = null
    } else if (pathKey === '/connections' || pathKey === '/connections/{id}') {
      // Some vertical hand-specs carry a `/connections*` admin stub, and
      // prefixRefs would rewrite its `$ref` to that vertical's namespaced
      // `Connection` (e.g. `CRMConnection`), which isn't emitted. The
      // canonical connections surface is entirely control-plane-owned —
      // `/admin/connections*` (operator) + `/v1/connections*` (tenant) — so
      // drop the vertical stubs: keeping one would both introduce a bare
      // `/connections` that collides with the stripped `/v1/connections` and
      // leave a dangling schema ref.
      newKey = null
    } else {
      // Other shared control-plane paths (e.g. /health) overlap across
      // verticals — last-write-wins is fine since the shapes are identical.
      newKey = pathKey
    }
    if (!newKey) continue
    const refsPrefixed = prefixRefs(pathItem, schemaPrefix)
    result[newKey] = setOperationTags(refsPrefixed, schemaPrefix)
  }
  return result
}

const combinedComponents: Components = {
  schemas: {},
  responses: {},
  securitySchemes: {},
  parameters: {},
  requestBodies: {},
  headers: {},
  examples: {},
  links: {},
  callbacks: {},
}

const pkgVersion = (
  JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')) as {
    version: string
  }
).version

// Hoist so both the root `servers` block and the per-path-item override
// below pull from the same source.
const serversConfig = loadOpenapiServersFromYaml()

const combined: OpenApiDoc = {
  openapi: '3.1.0',
  info: {
    title: 'OpenSteward',
    version: pkgVersion,
    license: {
      name: 'Elastic-2.0',
      url: 'https://github.com/open-steward/opensteward/blob/main/LICENSE',
    },
    contact: {
      name: 'OpenSteward',
      url: 'https://github.com/open-steward/opensteward',
    },
    description: [
      'Self-hosted integration aggregator. One REST API across nine verticals:',
      'accounting, CRM, e-commerce, logistics, payments, docsign, projects,',
      'customer-support, and inventory platforms.',
      '',
      '## Null semantics',
      '',
      'This API is an **aggregation boundary**: it normalises data from many upstream platforms but doesn\'t own most of the content. To preserve full information, **`null`, key-omitted, and a value (including `""` or `0`) are three distinct facts**:',
      '',
      '- **Key omitted** — upstream did not supply this field. The adapter mapped no equivalent value.',
      '- **`null`** — upstream explicitly returned null / cleared / not reported.',
      '- **Value** (`""`, `0`, or any other) — upstream supplied exactly that value.',
      '',
      'Adapters never coerce missing → `0` or `0` → `null`. If a canonical field is absent from a response, the upstream platform did not provide an equivalent value. The verbatim upstream payload is preserved on every top-level canonical resource — under `raw` for payments, docsign, projects, customer-support and inventory, and under `metadata` for accounting, CRM, ecommerce and logistics — so the original platform representation is recoverable. **Two verticals are opt-in.** On payments and accounting the payload is withheld unless the operator enables `data_store.raw_payload.payments` / `data_store.raw_payload.accounting`, because across those adapters it declares bank account numbers, IBANs and card numbers the canonical schema deliberately does not expose. Card security codes are never returned, on any setting. Monetary amounts are integer minor units (e.g. cents) — never floats — and follow the same three-state rule (`null` = not reported, `0` = reported as zero, key-omitted = no equivalent).',
      '',
      'Status, type, and category enums always include an explicit `"unknown"` member for upstream values the adapter could not map onto the normalized set — they are surfaced rather than silently dropped.',
      '',
      '## Authentication — three schemes',
      '',
      'The spec exposes **three security schemes** (`ApiKeyAuth`, `OAuth2Bearer` and `AdminSecret`). The first two are interchangeable developer credentials for `/v1/*`; the third is the operator path. Pick by what you are.',
      '',
      '### 1. `ApiKeyAuth` — Bearer dev key (`/v1/*`, `/connect/*`)',
      '',
      'Tenant-scoped developer key minted from `Admin → API keys → Mint key` in the admin UI, or the `mint-api-key` CLI. Send as:',
      '',
      '```',
      'Authorization: Bearer osk_<tenant>_<random>',
      '```',
      '',
      'Each key carries a list of scopes. Vertical access uses a **two-axis model**: `vertical:<v>` (or `vertical:read`) for the *touch* axis, and `vertical:write` as a separate gate for any non-GET on `/v1/{vertical}/*`. The default mint preset (the recommended "Safe default" radio) checks every scope **except** `vertical:write`, so a freshly minted key reads everywhere but cannot push writes back to upstream platforms — important for self-hosted operators who carry regulatory liability for what gets written upstream. See [/guides/dev-api.md §3](/guides/dev-api.md#3-scopes) for the full scope table, examples, and a 403 response shape.',
      '',
      'Every `/v1/*` resource request additionally requires `connection_id` (UUID) as a query parameter. The connection row carries its own `vertical`, `platform`, and OAuth credentials.',
      '',
      'Connections are created by completing the OAuth flow at `/auth/{vertical}/{platform}/connect` (admin-tooling) or by sending an end-user a hosted Connect Link from `POST /v1/customers/{id}/connect-links`.',
      '',
      '### 2. `OAuth2Bearer` — OIDC bearer token (`/v1/*`)',
      '',
      'An alternative to the static key on exactly the same routes, for deployments whose service accounts already live in an identity provider. The operator registers an issuer (Keycloak, Auth0, Okta and Entra ID ship as presets; any issuer with an OpenID discovery document works), and a developer presents a token from it:',
      '',
      '```',
      'Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6…',
      '```',
      '',
      "OpenSteward is only a resource server here: it verifies against the issuer's published public keys and never mints a token or holds a client secret. The token resolves to the **same scope vocabulary** as a dev key, so every scope rule above applies unchanged — a route needing `vertical:write` needs it identically.",
      '',
      "Off by default. A JWT sent to a deployment that has not enabled it answers `403 OAUTH_DISABLED`; an `osk_` key sent to a deployment where the operator has turned keys off answers `403 API_KEYS_DISABLED`. Verification failures all answer `401 UNAUTHENTICATED` with one body, so the response cannot be used to enumerate the operator's service accounts.",
      '',
      '### 3. `AdminSecret` — `X-Admin-Secret` header (`/admin/*`, `DELETE /auth/.../{connectionId}`)',
      '',
      'Operator-only secret used for **bootstrap and inter-service auth**. Set via the `ADMIN_SECRET` env var on the integration-server. Routes that take it: platform enable/disable/config (`/admin/platforms/*`), cross-tenant connection inspection (`/admin/connections*`), single-connection revoke under `/auth/{vertical}/{platform}/{connectionId}` (DELETE), and the operator sync-jobs surface (`/admin/sync-jobs*`).',
      '',
      'Send as `X-Admin-Secret: <value>`. **Never give this to an external integrator** — it spans every tenant and bypasses the scope system. Day-2 operator actions on `/v1/connections*` should already be done with a tenant-scoped Bearer dev key (`connections:write` scope).',
      '',
      '> Why a separate scheme rather than a "super scope" on a dev key? Bootstrap. The very first API call to a fresh deployment happens before any user, JWT, or developer key exists; `ADMIN_SECRET` is the single env-var that makes the integration-server reachable from admin-api during boot.',
    ].join('\n'),
  },
  // TWO entries: the live surface and the sandbox. Swagger UI renders them as
  // a dropdown, so a reader can flip one control and try any vertical resource
  // call against synthetic data without an OAuth connection.
  servers: [
    ...buildServersBlock(serversConfig),
    ...buildServersBlock(serversConfig, { variant: 'test' }),
  ],
  paths: {},
  components: combinedComponents,
  tags: [],
}

// Inject shared schemas (Error, Money, ListMeta, ...) before per-vertical
// merge so refs to `#/components/schemas/<Name>` resolve, and so prefixSchemas
// drops any per-vertical entries that would shadow them.
for (const [name, schema] of Object.entries(sharedSchemas)) {
  combinedComponents.schemas[name] = schema
}

// The one definition of the adapter list. Registered here rather than in
// shared-schemas.ts because the slugs come from the vertical metadata modules,
// which only this script imports. Every adapter path param `$ref`s this.
combinedComponents.schemas['PlatformSlug'] = {
  type: 'string',
  enum: ALL_PLATFORM_SLUGS,
  description:
    'Adapter slug identifying an upstream platform. Slugs are unique per platform but a handful appear in two verticals (e.g. `square` in payments and ecommerce), so a slug is only unambiguous alongside its vertical. `GET /v1/platforms` lists them with their vertical.',
  example: 'fortnox',
}

for (const v of VERTICALS) {
  Object.assign(combined.paths, prefixPaths(v.spec.paths, v.name, v.prefix))

  if (v.spec.components) {
    for (const [section, entries] of Object.entries(v.spec.components)) {
      if (!entries || typeof entries !== 'object') continue
      combinedComponents[section] ??= {}
      if (section === 'schemas') {
        Object.assign(
          combinedComponents[section],
          prefixSchemas(entries as Record<string, unknown>, v.prefix),
        )
      } else {
        for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
          combinedComponents[section][key] = prefixRefs(value, v.prefix)
        }
      }
    }
  }

  // Fold the vertical's own per-resource tag descriptions into its single tag.
  //
  // Those arrays carry real documentation — the orders/salesorders
  // double-counting caveat, for one — and were previously discarded outright,
  // so editing one had no effect on anything generated.
  //
  // They are NOT unioned into `combined.tags` as separate entries, for two
  // reasons that are easy to rediscover the hard way:
  //   - `deriveCommandPath` (packages/cli/scripts/generate-commands.ts) builds
  //     every CLI command path from `tags[0]`, so tagging an operation with its
  //     resource name first would rename the whole CLI surface.
  //   - resource names are not unique across verticals: `orders`, `contacts`,
  //     `providers` and `webhooks` are each authored by two or three verticals
  //     with different meanings, so separate entries would collide.
  const authored = (v.spec.tags ?? []) as Array<{ name?: string; description?: string }>
  const resourceDocs = authored
    // Auth/Connections/Sync are documented once under their own shared tags;
    // repeating them per vertical would say the same thing nine times.
    // Case-insensitively: verticals author these lowercase (`auth`,
    // `connections`, `webhooks`) while the shared tags are capitalised, and
    // each is already documented once under its own top-level group.
    .filter(
      (t) =>
        t.name &&
        t.description &&
        !SHARED_TAG_NAMES_LOWER.has(t.name.toLowerCase()),
    )
    .map((t) => `- \`${t.name}\` — ${t.description}`)
  combined.tags!.push({
    name: v.prefix,
    description:
      `${v.prefix} vertical — connection-scoped resources under /v1/${v.name}/*.` +
      (resourceDocs.length ? `\n\n**Resources**\n\n${resourceDocs.join('\n')}` : ''),
  })
}

// Overlay control-plane paths + schemas. These are written last so they
// overwrite any auth/connections/health entries the per-vertical fragments
// also emit (e.g. /auth/{vertical}/{platform}).
for (const [pathKey, pathItem] of Object.entries(controlPlanePaths)) {
  combined.paths[pathKey] = pathItem
}
combinedComponents.schemas ??= {}
for (const [name, schema] of Object.entries(controlPlaneSchemas)) {
  combinedComponents.schemas[name] = schema
}
combinedComponents.securitySchemes ??= {}
for (const [name, scheme] of Object.entries(controlPlaneSecuritySchemes)) {
  combinedComponents.securitySchemes[name] = scheme
}
combined.tags!.push(...controlPlaneTags)

// Overlay canonical response components last so every per-vertical
// `BadRequest`/`Unauthorized`/`NotFound`/`Forbidden`/`NotImplemented`
// resolves to the same `$ref Error` body (so every vertical's 4xx/501
// carries the same shape).
combinedComponents.responses ??= {}
for (const [name, response] of Object.entries(sharedResponses)) {
  combinedComponents.responses[name] = response
}

// Reusable response-header definitions + the Idempotency-Key request header.
combinedComponents.headers ??= {}
for (const [name, header] of Object.entries(sharedHeaders)) {
  combinedComponents.headers[name] = header
}
combinedComponents.parameters ??= {}
for (const [name, param] of Object.entries(sharedRequestHeaders)) {
  combinedComponents.parameters[name] = param
}

// Default security: every operation requires a tenant-scoped developer
// credential unless it explicitly sets `security: []` (e.g. /health,
// /auth/*/connect). A top-level array is OR, so listing both schemes says
// "an osk_ key or an OIDC bearer token" without touching a single route —
// they resolve to the same principal and the same scope checks.
combined.security = [{ ApiKeyAuth: [] }, { OAuth2Bearer: [] }]

for (const section of Object.keys(combinedComponents)) {
  if (Object.keys(combinedComponents[section]).length === 0) {
    delete combinedComponents[section]
  }
}

// Inject the platform-slug enum into every `{platform}` path-param so
// Swagger UI shows a typed dropdown. Done last so it covers control-plane
// paths added above + any per-vertical paths still in the merged spec.
injectPlatformEnum(combined)

// Collapse every inline `{ type: 'string', format: 'date-time' }` (whether
// bare or paired only with metadata keys like description/example/title) into
// a `$ref` to the shared `ISO8601` schema. Zod's JSON-Schema export inlines
// the same shape on every timestamp field; this restores layered inheritance
// without re-architecting the per-vertical schema pipeline. The canonical
// schema is detached first to avoid rewriting itself into a self-ref.
{
  const schemas = combinedComponents.schemas as Record<string, unknown>
  const canonicalCalendarDate = schemas['CalendarDate']
  const canonicalIso8601 = schemas['ISO8601']
  const canonicalIso3166 = schemas['ISO3166']
  const canonicalIso4217 = schemas['ISO4217']
  const canonicalHexColor = schemas['HexColor']
  delete schemas['CalendarDate']
  delete schemas['ISO8601']
  delete schemas['ISO3166']
  delete schemas['ISO4217']
  delete schemas['HexColor']
  collapseInlineIso8601(combined)
  collapseInlineCalendarDate(combined)
  collapseInlineIso3166(combined)
  collapseInlineIso4217(combined)
  collapseInlineHexColor(combined)
  schemas['CalendarDate'] = canonicalCalendarDate
  schemas['ISO8601'] = canonicalIso8601
  schemas['ISO3166'] = canonicalIso3166
  schemas['ISO4217'] = canonicalIso4217
  schemas['HexColor'] = canonicalHexColor
}

// Inject + collapse shared parameters. Done after the ISO walkers so that
// param schemas (e.g. updated_after's date-time) are already pointing at
// `#/components/schemas/ISO8601` when fingerprinting runs.
combinedComponents.parameters ??= {}
for (const [name, param] of Object.entries(sharedParameters)) {
  combinedComponents.parameters[name] = param
}
collapseInlineParameters(combined.paths)
collapseInlineResponses(combined.paths)
attachCrudLinks(combined.paths as Record<string, Record<string, unknown>>)
annotateUniversalHeadersAndParams(combined.paths as Record<string, Record<string, unknown>>)

// ── Version variable handling ───────────────────────────────────────────────
// The root `servers` URL is `{scheme}://{host}:{port}/{version}` (default
// version=v1). To keep that template correct:
//
//  1. For path keys under `/v1/*`: strip the `/v1/` prefix. Swagger UI's
//     full URL becomes `<root>/<key>` = `…:port/v1/<vertical>/<resource>`.
//
//  2. For path keys NOT under `/v1/*` (`/admin/*`, `/auth/*`, `/health`,
//     `/webhooks/*`, `/test/v1/*`): leave the key absolute AND attach a
//     per-path-item `servers` override of `{scheme}://{host}:{port}` so the
//     full URL doesn't get a spurious `/v1` prefix.
//
// integration-server's actual routes are unchanged — they still mount at
// /v1/<vertical>/* and /auth/<vertical>/<platform>/*. This is a spec-only
// transformation that keeps the Swagger UI Servers dropdown working for
// the versioned majority while the operator/ceremony minority
// (admin/auth/health/webhooks paths) get a server-object scoped to their
// absolute path. The tenant developer surface — connections, customers,
// events, webhook-subscriptions — is authored under `/v1/*` precisely so it
// strips and inherits BOTH the live and sandbox servers (the operator
// connection routes are `/admin/connections*`, so no bare `/connections`
// collides with the stripped tenant key).
const unversionedOverride = buildServersBlock(serversConfig, { variant: 'unversioned' })
// Same URL template as the root entry — the point of this override is what it
// OMITS, so it carries its own description. The docs-server rebuilds these per
// request, so the text lives in `buildServersBlock` rather than here; otherwise
// the rendered reference would silently disagree with the committed spec.
const liveOnlyOverride = buildServersBlock(serversConfig, { variant: 'live-only' })
const unversionedKeys = new Set(Object.keys(combined.paths).filter((k) => !isVersionedPath(k)))

/**
 * Versioned paths that exist on the LIVE surface but not in the sandbox.
 *
 * Empty — every versioned path is served by both servers (the sandbox
 * simulates the full sync job lifecycle: pending → running → completed,
 * fixture rows regenerated on completion, `callback_url` stored but never
 * dialed). The override machinery exists for any route served only by the
 * live surface.
 *
 * Keyed AFTER the `/v1/` strip, matching `remappedPaths` below.
 */
const LIVE_ONLY_PATHS = new Set<string>([])

/**
 * Which server block a path item's override was built from.
 *
 * The docs-server re-renders `servers` on every request so an operator's
 * host/port edits in /settings take effect without regenerating the spec.
 * Two kinds of override exist, and once the block is serialized this marker
 * is the only thing that distinguishes them for that per-request rebuild —
 * the URL template alone would work but reads as a coincidence rather than
 * a contract.
 */
const SERVERS_KIND = 'x-opensteward-servers'
const remappedPaths: Record<string, Record<string, unknown>> = {}
for (const [pathKey, pathItem] of Object.entries(
  combined.paths as Record<string, Record<string, unknown>>,
)) {
  if (isVersionedPath(pathKey)) {
    const stripped = pathKey.slice(3) // /v1/foo → /foo
    if (unversionedKeys.has(stripped)) {
      // Collision guard: a `/v1/foo` whose stripped `/foo` ALSO exists as a
      // standalone unversioned path. No path hits this — the operator
      // connection surface lives at `/admin/connections*` precisely so
      // `/v1/connections*` strips cleanly and inherits both the live and
      // sandbox servers. The branch stays as a guard: if such a pair appears,
      // keep BOTH visible — leave the versioned key absolute with an
      // unversioned override so its URL is `…:port/v1/...`, matching
      // integration-server's actual mount.
      remappedPaths[pathKey] = {
        ...pathItem,
        servers: unversionedOverride,
        [SERVERS_KIND]: 'unversioned',
      }
    } else if (LIVE_ONLY_PATHS.has(stripped)) {
      remappedPaths[stripped] = {
        ...pathItem,
        servers: liveOnlyOverride,
        [SERVERS_KIND]: 'live-only',
      }
    } else {
      remappedPaths[stripped] = pathItem
    }
  } else {
    remappedPaths[pathKey] = {
      ...pathItem,
      servers: unversionedOverride,
      [SERVERS_KIND]: 'unversioned',
    }
  }
}
combined.paths = remappedPaths

/**
 * Synthesize operationIds for the verticals whose specs omit them
 * (accounting, crm, logistics — 90 operations with none at all).
 * Everything downstream keys off operationId: the CLI skips an operation
 * without one, so without this step `os accounting …`, `os crm …` and
 * `os logistics …` would have no commands at all.
 *
 * The naming matches the six by construction: `listInvoices`,
 * `createInvoice`, `getInvoiceById`, `updateInvoice`, `deleteInvoice`.
 * Cross-vertical duplicates (accounting and logistics both have orders) are
 * the existing status quo — the spec already ships `listProducts` three
 * times — and the CLI disambiguates by tag. Applied only where the id is
 * missing, so a vertical that later writes its own wins.
 */
const SYNTH_OPID_VERTICALS = new Set(['accounting', 'crm', 'logistics'])
const singular = (word: string): string => {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}
const pascal = (kebabWord: string): string =>
  kebabWord
    .split('-')
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('')
for (const [pathKey, pathItem] of Object.entries(combined.paths as Record<string, unknown>)) {
  const segs = pathKey.split('/').filter(Boolean)
  if (segs.length < 2 || segs.length > 3 || !SYNTH_OPID_VERTICALS.has(segs[0]!)) continue
  const resource = segs[1]!
  const byId = segs.length === 3 && segs[2]!.startsWith('{')
  if (segs.length === 3 && !byId) continue
  const item = pathItem as Record<string, Record<string, unknown>>
  for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
    const op = item[method]
    if (!op || typeof op !== 'object' || op['operationId']) continue
    const plural = pascal(resource)
    const one = pascal(singular(resource))
    let id: string
    if (method === 'get') id = byId ? `get${one}ById` : `list${plural}`
    else if (method === 'post') id = resource === 'rates' ? `quote${plural}` : `create${one}`
    else if (method === 'delete') id = `delete${one}`
    else id = `update${one}`
    op['operationId'] = id
  }
}

const outDir = path.resolve(__dirname, '../../../docs/openapi')
fs.mkdirSync(outDir, { recursive: true })
const jsonPath = path.join(outDir, 'openapi.json')
const yamlPath = path.join(outDir, 'openapi.yaml')
const slugsJsonPath = path.join(outDir, 'platform-slugs.json')

fs.writeFileSync(jsonPath, JSON.stringify(combined, null, 2) + '\n')
fs.writeFileSync(
  yamlPath,
  yaml.dump(combined as unknown as Record<string, unknown>, { lineWidth: 120, noRefs: true }),
)
// Side-car JSON of the slug list — sharable by the admin UI, SDKs,
// validation layers, etc. so they don't have to re-scan adapter dirs.
// Each row carries enough metadata for the integration-guide coverage
// page on docs-server (vertical filter, OAuth-vs-other distinction).
// Note camelCase fallback: logistics adapter rows use `authType` while
// accounting/crm/ecommerce use `auth_type`. Read either.
type PlatformMetaRow = { slug: string; name?: string; auth_type?: string; authType?: string }
interface PlatformEntry {
  slug: string
  name: string
  vertical: string
  auth_type: string
}
function metaRowsFor(vertical: string, metaList: ReadonlyArray<PlatformMetaRow>): PlatformEntry[] {
  return metaList.map((m) => ({
    slug: m.slug,
    name: m.name ?? m.slug,
    vertical,
    auth_type: m.auth_type ?? m.authType ?? 'unknown',
  }))
}
const PLATFORM_ENTRIES: PlatformEntry[] = [
  ...metaRowsFor('accounting', ACCOUNTING_PLATFORMS as ReadonlyArray<PlatformMetaRow>),
  ...metaRowsFor('crm', CRM_PLATFORMS as ReadonlyArray<PlatformMetaRow>),
  ...metaRowsFor('ecommerce', ECOMMERCE_PLATFORMS as ReadonlyArray<PlatformMetaRow>),
  ...metaRowsFor('logistics', LOGISTICS_PLATFORMS as ReadonlyArray<PlatformMetaRow>),
  ...metaRowsFor('payments', PAYMENTS_PLATFORMS as ReadonlyArray<PlatformMetaRow>),
  ...metaRowsFor('docsign', DOCSIGN_PLATFORMS as ReadonlyArray<PlatformMetaRow>),
  ...metaRowsFor('projects', PROJECTS_PLATFORMS as ReadonlyArray<PlatformMetaRow>),
  ...metaRowsFor('customer-support', SUPPORT_PLATFORMS as ReadonlyArray<PlatformMetaRow>),
  ...metaRowsFor('inventory', INVENTORY_PLATFORMS as ReadonlyArray<PlatformMetaRow>),
].sort((a, b) => a.vertical.localeCompare(b.vertical) || a.slug.localeCompare(b.slug))
// Intentionally deterministic: no `generatedAt` or other run-time stamp in
// the body, so an unchanged adapter set regenerates byte-identically and
// `check:docs` never flags the file as out-of-date. The slug list itself is
// the freshness signal — when it changes, the diff shows up.
fs.writeFileSync(
  slugsJsonPath,
  JSON.stringify(
    {
      // Flat slug list — for callers that only need to validate a slug
      // exists (e.g. apps/admin platform-slug param check).
      platforms: ALL_PLATFORM_SLUGS,
      // Richer per-platform metadata — vertical + auth_type lets the
      // docs-server's /guides/integrate coverage page filter to OAuth
      // adapters without re-walking the metadata.ts files at runtime.
      entries: PLATFORM_ENTRIES,
    },
    null,
    2,
  ) + '\n',
)

const pathCount = Object.keys(combined.paths).length
const schemaCount = Object.keys(combined.components?.schemas ?? {}).length
console.log(
  `✓ wrote ${path.relative(process.cwd(), jsonPath)} (${pathCount} paths, ${schemaCount} schemas, ${ALL_PLATFORM_SLUGS.length} platform slugs)`,
)
console.log(`✓ wrote ${path.relative(process.cwd(), yamlPath)}`)
console.log(`✓ wrote ${path.relative(process.cwd(), slugsJsonPath)}`)
