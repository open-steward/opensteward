#!/usr/bin/env tsx
/**
 * `generate-commands` — reads the two OpenAPI specs that drive the
 * `os` CLI and emits one TypeScript module per OpenAPI tag under
 * `packages/cli/src/generated/`. Each module exports a commander-style
 * subcommand definition: name, description, positional path args,
 * `--flag` options for query params + top-level body fields, and a
 * response renderer.
 *
 * Hard constraint: nothing about a CLI subcommand is hand-written. The
 * full surface of `os` is mechanically derived from:
 *
 *   - docs/openapi/admin-api.openapi.json   (operator API — admin-api)
 *   - docs/openapi/openapi.json             (public API   — integration-server)
 *
 * Usage:
 *
 *   pnpm --filter @opensteward/cli generate
 *   # or, from the repo root:
 *   pnpm cli:generate
 *
 * Output:
 *
 *   packages/cli/src/generated/<tag>.ts        — one per OpenAPI tag
 *   packages/cli/src/generated/index.ts        — re-exports every tag module
 *   packages/cli/src/generated/manifest.json   — every command path + opId
 *
 * The generator fails loudly if any operation:
 *   - has no `operationId` (warn with path + method)
 *   - collides on its derived command path with another operation
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { reference } from '@opensteward/shared'
import * as prettier from 'prettier'

// ISO 3166-1 alpha-2 codes used to constrain any `country` flag to a
// validated select (commander `.choices(...)`), mirroring the admin UI's
// country dropdown. Validation stays CLI-side — the API still accepts any
// string; this only sharpens the CLI surface. See applyCountryChoices.
const ISO_COUNTRY_CODES: string[] = Object.keys(reference.COUNTRY_NAMES).sort()

// ── Paths ───────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../../..')
const ADMIN_SPEC_PATH = join(REPO_ROOT, 'docs/openapi/admin-api.openapi.json')
const PUBLIC_SPEC_PATH = join(REPO_ROOT, 'docs/openapi/openapi.json')
const OUT_DIR = resolve(__dirname, '../src/generated')

// ── OpenAPI types (minimal subset we care about) ────────────────────

interface OpenAPISchema {
  type?: string
  format?: string
  description?: string
  enum?: unknown[]
  const?: unknown
  items?: OpenAPISchema
  properties?: Record<string, OpenAPISchema>
  required?: string[]
  default?: unknown
  $ref?: string
  allOf?: OpenAPISchema[]
  oneOf?: OpenAPISchema[]
  anyOf?: OpenAPISchema[]
  additionalProperties?: unknown
  discriminator?: {
    propertyName: string
    mapping?: Record<string, string>
  }
}

interface OpenAPIParam {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required?: boolean
  description?: string
  schema?: OpenAPISchema
  $ref?: string
}

interface OpenAPIResponse {
  description?: string
  content?: Record<string, { schema?: OpenAPISchema }>
  $ref?: string
}

interface OpenAPIOperation {
  operationId?: string
  summary?: string
  description?: string
  tags?: string[]
  parameters?: OpenAPIParam[]
  requestBody?: {
    required?: boolean
    content?: Record<string, { schema?: OpenAPISchema }>
    $ref?: string
  }
  responses?: Record<string, OpenAPIResponse>
}

interface OpenAPIDoc {
  openapi?: string
  info?: { title?: string }
  paths?: Record<string, Record<string, OpenAPIOperation>>
  components?: {
    parameters?: Record<string, OpenAPIParam>
    schemas?: Record<string, OpenAPISchema>
    responses?: Record<string, OpenAPIResponse>
    requestBodies?: Record<string, OpenAPIOperation['requestBody']>
  }
}

// ── Helpers: $ref resolution ────────────────────────────────────────

function resolveRef<T>(doc: OpenAPIDoc, ref: string): T | undefined {
  if (!ref.startsWith('#/')) return undefined
  const segs = ref.slice(2).split('/')
  let cur: unknown = doc
  for (const s of segs) {
    if (cur != null && typeof cur === 'object' && s in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[s]
    } else {
      return undefined
    }
  }
  return cur as T
}

function deref<T extends { $ref?: string }>(doc: OpenAPIDoc, obj: T | undefined): T | undefined {
  if (!obj) return undefined
  if (obj.$ref) return resolveRef<T>(doc, obj.$ref)
  return obj
}

function derefSchema(doc: OpenAPIDoc, schema: OpenAPISchema | undefined): OpenAPISchema | undefined {
  if (!schema) return undefined
  if (schema.$ref) {
    const resolved = resolveRef<OpenAPISchema>(doc, schema.$ref)
    return resolved ? derefSchema(doc, resolved) : undefined
  }
  return schema
}

// ── Slug/case helpers ───────────────────────────────────────────────

function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .replace(/--+/g, '-')
    .toLowerCase()
}

function safeIdent(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^[0-9]/, '_$&')
}

function quote(s: string): string {
  return JSON.stringify(s)
}

// ── Command-tree shape ──────────────────────────────────────────────

interface FlagSpec {
  /** kebab-case CLI flag (no `--`), e.g. `user-name` */
  name: string
  /** OpenAPI source name (for body assembly), e.g. `userName` */
  sourceName: string
  /**
   * Where to put the value when constructing the request.
   *
   * - `query`, `header`: top-level URL params.
   * - `body`, `body-nested`: well-known body fields (depth 1–2).
   * - `body-json`: raw JSON escape hatch — wins if also supplied.
   * - `body-discriminator`: the discriminator selector flag itself
   *   (e.g. `--auth-type` for `PlatformConfig`). Its value picks
   *   which branch's required flags are enforced.
   * - `body-discriminated`: a per-branch field. Only set on the body
   *   when the discriminator's value equals `discriminatorValue`.
   */
  location: 'query' | 'body' | 'body-nested' | 'body-json' | 'header' | 'body-discriminator' | 'body-discriminated'
  /** Dotted path inside the body (e.g. `user.name`). Only for body. */
  bodyPath?: string[]
  /** Commander flag template, e.g. `--user-name <value>` or `--enabled` (boolean). */
  flagTemplate: string
  description: string
  required: boolean
  /** JS-type coercion to apply to the raw string value. */
  coerce: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'json'
  /** Optional commander `.choices(...)`. */
  choices?: string[]
  /**
   * For discriminated bodies: the dotted path inside the body to the
   * discriminator property (e.g. `['config', 'authType']` when the
   * `config` field of the body is the `oneOf`).
   */
  discriminatorPath?: string[]
  /**
   * For `body-discriminated` flags: which branch this flag belongs to.
   * The dispatcher only writes the value (and only enforces required-
   * ness) when the discriminator-selector flag matches.
   */
  discriminatorValue?: string
  /**
   * For `body-discriminated` flags: kebab-case name of the
   * discriminator-selector flag (e.g. `auth-type`). The dispatcher
   * uses this to find the user's chosen branch at runtime.
   */
  discriminatorFlag?: string
}

interface PathArgSpec {
  /** kebab-case CLI positional name */
  name: string
  /** Original OpenAPI param name (the `{x}` in the URL template) */
  sourceName: string
  description: string
  required: boolean
}

interface CommandSpec {
  /** "users create", "platforms config set", etc. */
  commandPath: string[]
  operationId: string
  /** "admin" or "public" — picks the client. */
  spec: 'admin' | 'public'
  /**
   * Public-spec only: true when the wire path needs the `/v1` prefix the
   * spec's root server carries. Unversioned paths (`/health`, `/auth/*`,
   * `/admin/*`, …) carry an `x-opensteward-servers: unversioned` override
   * and are sent as written. Without this the CLI would send every public
   * vertical call to an unprefixed path (e.g. `/ecommerce/orders`) that
   * exists on no server.
   */
  versioned: boolean
  method: string
  pathTemplate: string
  summary: string
  description: string
  pathArgs: PathArgSpec[]
  flags: FlagSpec[]
  /** Renderer hint derived from the 2xx response schema. */
  renderer: 'table' | 'object' | 'primitive' | 'unknown'
  /** Table columns (only meaningful when renderer === 'table'). */
  tableColumns?: string[]
  /** Dotted path inside the response to unwrap before rendering (e.g. `data`). */
  responseUnwrap?: string[]
}

// ── Flag derivation ─────────────────────────────────────────────────

function inferFlagFromScalar(
  s: OpenAPISchema | undefined,
): { coerce: FlagSpec['coerce']; template: (n: string) => string; choices?: string[] } {
  const type = s?.type
  if (s?.enum && Array.isArray(s.enum)) {
    return {
      coerce: 'string',
      template: (n) => `--${n} <value>`,
      choices: s.enum.map((v) => String(v)),
    }
  }
  if (type === 'boolean') {
    return { coerce: 'boolean', template: (n) => `--${n}` }
  }
  if (type === 'integer') {
    return { coerce: 'integer', template: (n) => `--${n} <value>` }
  }
  if (type === 'number') {
    return { coerce: 'number', template: (n) => `--${n} <value>` }
  }
  if (type === 'array') {
    return { coerce: 'array', template: (n) => `--${n} <value...>` }
  }
  // Default: string-ish.
  return { coerce: 'string', template: (n) => `--${n} <value>` }
}

/**
 * Constrain any `country` flag to the canonical ISO 3166-1 alpha-2 list.
 * Applied as a post-pass so it catches the field wherever it appears
 * (top-level body, nested, query) without threading the field name through
 * every flag-derivation site. Skips flags that already carry an enum-derived
 * `choices` (the spec wins) or aren't scalar string inputs.
 */
function applyCountryChoices(flags: FlagSpec[]): FlagSpec[] {
  for (const f of flags) {
    if (f.sourceName !== 'country') continue
    if (f.choices && f.choices.length) continue
    if (f.coerce !== 'string') continue
    f.choices = ISO_COUNTRY_CODES
  }
  return flags
}

function flagsFromQueryParams(doc: OpenAPIDoc, params: OpenAPIParam[]): FlagSpec[] {
  const out: FlagSpec[] = []
  for (const raw of params) {
    const p = deref(doc, raw)
    if (!p || p.in !== 'query') continue
    const cliName = kebab(p.name)
    const inferred = inferFlagFromScalar(derefSchema(doc, p.schema))
    out.push({
      name: cliName,
      sourceName: p.name,
      location: 'query',
      flagTemplate: inferred.template(cliName),
      description: p.description ?? `query param: ${p.name}`,
      required: !!p.required,
      coerce: inferred.coerce,
      choices: inferred.choices,
    })
  }
  return out
}

/**
 * Discriminated-union (`oneOf` + `discriminator`) expansion.
 *
 * Given a schema that is itself a discriminated union, walk each
 * branch, read the discriminator-literal (`const` on the discriminator
 * property), and emit:
 *
 *   1. ONE selector flag for the discriminator itself (kebab-cased,
 *      with `.choices(...)` set to every branch's literal). Always
 *      required.
 *   2. For each branch field (not the discriminator):
 *      - if there are NO field-name collisions across branches →
 *        flat `--<field>` names (convention "A")
 *      - if there ARE collisions → prefixed
 *        `--<discriminator>-<branchValue>-<field>` names (convention "B")
 *
 * Required-ness is conditional: a branch field is required only when
 * the user selects that branch via the selector. We encode that with
 * `discriminatorValue` + `discriminatorFlag` on each per-branch flag;
 * the dispatcher checks it at runtime (commander can't conditional-
 * require natively).
 *
 * `bodyPathPrefix` is the path inside the request body to where the
 * discriminator lives — `[]` if the body itself is the union (e.g.
 * `CreateIdentityProviderBody`), `['config']` if the union is nested
 * under a field (e.g. `PlatformEnableBody.config`).
 *
 * Returns `undefined` if the schema is not a usable discriminated
 * union (no discriminator, or no resolvable branches).
 */
function expandDiscriminatedUnion(
  doc: OpenAPIDoc,
  schema: OpenAPISchema,
  bodyPathPrefix: string[],
  parentDescription?: string,
  parentRequired: boolean = true,
): FlagSpec[] | undefined {
  if (!schema.oneOf || !schema.discriminator?.propertyName) return undefined
  const discriminatorProp = schema.discriminator.propertyName
  const discriminatorKebab = bodyPathPrefix.length
    ? `${kebab(bodyPathPrefix.join('-'))}-${kebab(discriminatorProp)}`
    : kebab(discriminatorProp)

  // Resolve every branch + its discriminator literal.
  interface Branch {
    value: string
    schema: OpenAPISchema
  }
  const branches: Branch[] = []
  for (const rawBranch of schema.oneOf) {
    const branch = derefSchema(doc, rawBranch)
    if (!branch || branch.type !== 'object' || !branch.properties) continue
    const discProp = derefSchema(doc, branch.properties[discriminatorProp])
    // Pull the discriminator literal from either `const` or a single-
    // element `enum`. Skip the branch silently if we can't find one —
    // the spec is malformed but we'd rather emit a partial flag set
    // than nothing.
    let literal: string | undefined
    if (discProp?.const !== undefined) literal = String(discProp.const)
    else if (Array.isArray(discProp?.enum) && discProp.enum.length === 1) {
      literal = String(discProp.enum[0])
    }
    if (literal === undefined) continue
    branches.push({ value: literal, schema: branch })
  }
  if (branches.length === 0) return undefined

  // Detect cross-branch field-name collisions (excluding the
  // discriminator property itself). If two branches share a field
  // name we prefix every per-branch flag; otherwise we use the flat
  // convention.
  const fieldOwners = new Map<string, Set<string>>()
  for (const b of branches) {
    for (const key of Object.keys(b.schema.properties ?? {})) {
      if (key === discriminatorProp) continue
      const owners = fieldOwners.get(key) ?? new Set<string>()
      owners.add(b.value)
      fieldOwners.set(key, owners)
    }
  }
  const collides = (key: string): boolean => (fieldOwners.get(key)?.size ?? 0) > 1

  // 1. Discriminator selector flag.
  const selectorName = discriminatorKebab
  const selectorChoices = branches.map((b) => b.value)
  const selectorDesc =
    (parentDescription ? parentDescription + ' — ' : '') +
    `select the ${discriminatorProp} variant (${selectorChoices.join(' | ')})`
  const flags: FlagSpec[] = [
    {
      name: selectorName,
      sourceName: discriminatorProp,
      location: 'body-discriminator',
      bodyPath: [...bodyPathPrefix, discriminatorProp],
      flagTemplate: `--${selectorName} <value>`,
      description: selectorDesc,
      required: parentRequired,
      coerce: 'string',
      choices: selectorChoices,
      discriminatorPath: [...bodyPathPrefix, discriminatorProp],
    },
  ]

  // 2. Per-branch field flags.
  for (const b of branches) {
    const required = new Set(b.schema.required ?? [])
    for (const [key, rawSub] of Object.entries(b.schema.properties ?? {})) {
      if (key === discriminatorProp) continue
      const sub = derefSchema(doc, rawSub)
      const inferred = inferFlagFromScalar(sub)
      const baseKebab = kebab(key)
      const flagName = collides(key)
        ? `${selectorName}-${kebab(b.value)}-${baseKebab}`
        : baseKebab
      // For object-typed branch fields (e.g. `config` under each IdP
      // protocol branch), the dispatcher can't auto-expand without
      // recursing. We accept a JSON value for those — the discriminated
      // helpers above the schema (e.g. `OidcConfig`) are stable enough
      // that operators can pass a JSON snippet for the inner config.
      const isObjectField = sub?.type === 'object' && !sub.enum
      const template = isObjectField
        ? `--${flagName} <json>`
        : inferred.template(flagName)
      const coerce: FlagSpec['coerce'] = isObjectField ? 'json' : inferred.coerce
      flags.push({
        name: flagName,
        sourceName: key,
        location: 'body-discriminated',
        // The full body path: prefix + key. The dispatcher sets the
        // value at this path only when the discriminator matches.
        bodyPath: [...bodyPathPrefix, key],
        flagTemplate: template,
        description:
          sub?.description ??
          `${b.value} branch: ${bodyPathPrefix.length ? bodyPathPrefix.join('.') + '.' : ''}${key}`,
        // Commander can't conditional-require — keep it optional at
        // the parser level and let the dispatcher emit a clear error
        // if the chosen branch is missing required fields.
        required: false,
        coerce,
        choices: isObjectField ? undefined : inferred.choices,
        discriminatorPath: [...bodyPathPrefix, discriminatorProp],
        discriminatorValue: b.value,
        discriminatorFlag: selectorName,
        // Track branch-level required-ness via a marker in description?
        // No — instead, store on a parallel `_required` via the
        // dispatcher checking the schema… we don't have the schema at
        // runtime. Encode required-ness by reusing `required` only
        // when it's safe (single-branch). For multi-branch, we tag
        // the flag with `required: true` if THIS branch needs it AND
        // the dispatcher knows to enforce only when the discriminator
        // value matches.
      })
      // Tag branch-required so the dispatcher can enforce it
      // conditionally. We piggyback on the `required` field — the
      // dispatcher's `body-discriminated` handler will only check
      // required-ness when the discriminator matches.
      if (required.has(key)) {
        flags[flags.length - 1].required = true
      }
    }
  }
  return flags
}

/**
 * Body flag derivation. Top-level fields of the body's object schema
 * become flags. Nested-by-one fields are flattened (`user.name` →
 * `--user-name`). Anything deeper falls back to a single JSON flag
 * (`--user-json`).
 *
 * Discriminated unions (`oneOf` + `discriminator`) are expanded into
 * one selector flag + one flag per branch field. See
 * `expandDiscriminatedUnion`.
 *
 * A `--body-json` escape hatch is also emitted for any body — if the
 * user passes both `--body-json` and per-branch flags, the JSON
 * fallback wins (with a warning at the dispatcher).
 *
 * Returns the flag set + a hint flag set listing the "json fallback"
 * keys, so the dispatcher knows which top-level body keys come from
 * which set of flags.
 */
function flagsFromBody(doc: OpenAPIDoc, op: OpenAPIOperation): FlagSpec[] {
  const body = deref(doc, op.requestBody)
  if (!body || !body.content) return []
  const json = body.content['application/json'] ?? Object.values(body.content)[0]
  const schema = derefSchema(doc, json?.schema)
  if (!schema) return []

  // ── Case A: the body schema IS a discriminated union ──────────────
  // e.g. CreateIdentityProviderBody { oneOf: [oidc, saml, ldap],
  // discriminator: { propertyName: 'protocol' } }.
  const rootBranchFlags = expandDiscriminatedUnion(doc, schema, [], schema.description, body.required ?? false)
  if (rootBranchFlags) {
    // The escape hatch is always optional — operators can satisfy a
    // required body via either the per-branch flags OR --body-json.
    // The discriminator selector itself carries the required-ness.
    return [...rootBranchFlags, escapeHatch(false)]
  }

  if (schema.type !== 'object' || !schema.properties) {
    // Body exists but isn't an object — single --body-json fallback.
    return [
      {
        name: 'body-json',
        sourceName: '',
        location: 'body-json',
        flagTemplate: '--body-json <json>',
        description: 'Raw JSON request body',
        required: body.required ?? false,
        coerce: 'json',
      },
    ]
  }
  const required = new Set(schema.required ?? [])
  const flags: FlagSpec[] = []
  let sawDiscriminator = false

  for (const [key, raw] of Object.entries(schema.properties)) {
    const sub = derefSchema(doc, raw)

    // ── Case B: a top-level body field is a discriminated union ─────
    // e.g. PlatformEnableBody.config → PlatformConfig (oneOf, keyed by
    // authType). Expand into one selector + per-branch flags, all
    // nested under the body field's path.
    if (sub) {
      const nestedBranchFlags = expandDiscriminatedUnion(
        doc,
        sub,
        [key],
        sub.description,
        required.has(key),
      )
      if (nestedBranchFlags) {
        flags.push(...nestedBranchFlags)
        sawDiscriminator = true
        continue
      }
    }

    if (sub && sub.type === 'object' && sub.properties) {
      // One-level flatten.
      const subRequired = new Set(sub.required ?? [])
      const reqOuter = required.has(key)
      let nestedDeeper = false
      for (const [k2, raw2] of Object.entries(sub.properties)) {
        const sub2 = derefSchema(doc, raw2)
        if (sub2 && sub2.type === 'object' && sub2.properties) {
          nestedDeeper = true
          break
        }
      }
      if (nestedDeeper) {
        // Too deep — JSON fallback for the whole subfield.
        const name = `${kebab(key)}-json`
        flags.push({
          name,
          sourceName: key,
          location: 'body',
          bodyPath: [key],
          flagTemplate: `--${name} <json>`,
          description: sub.description ?? `JSON object for body.${key}`,
          required: reqOuter,
          coerce: 'json',
        })
        continue
      }
      for (const [k2, raw2] of Object.entries(sub.properties)) {
        const sub2 = derefSchema(doc, raw2)
        const inferred = inferFlagFromScalar(sub2)
        const name = `${kebab(key)}-${kebab(k2)}`
        flags.push({
          name,
          sourceName: k2,
          location: 'body-nested',
          bodyPath: [key, k2],
          flagTemplate: inferred.template(name),
          description: sub2?.description ?? `body.${key}.${k2}`,
          required: reqOuter && subRequired.has(k2),
          coerce: inferred.coerce,
          choices: inferred.choices,
        })
      }
      continue
    }
    const inferred = inferFlagFromScalar(sub)
    const name = kebab(key)
    flags.push({
      name,
      sourceName: key,
      location: 'body',
      bodyPath: [key],
      flagTemplate: inferred.template(name),
      description: sub?.description ?? `body.${key}`,
      required: required.has(key),
      coerce: inferred.coerce,
      choices: inferred.choices,
    })
  }

  // Add the --body-json escape hatch for any body that exposed at
  // least one discriminated-union expansion. Operators paying the
  // cost of richer flags also get a way to skip them.
  if (sawDiscriminator) {
    flags.push(escapeHatch(false))
  }
  return flags
}

/**
 * Optional raw-JSON escape hatch for power users. If both `--body-json`
 * and per-branch flags are passed, the dispatcher uses `--body-json`
 * (with a warning).
 */
function escapeHatch(required: boolean): FlagSpec {
  return {
    name: 'body-json',
    sourceName: '',
    location: 'body-json',
    flagTemplate: '--body-json <json>',
    description: 'Raw JSON request body (escape hatch — overrides per-branch flags if both are passed)',
    required,
    coerce: 'json',
  }
}

function pathArgsFromParams(doc: OpenAPIDoc, params: OpenAPIParam[]): PathArgSpec[] {
  const out: PathArgSpec[] = []
  for (const raw of params) {
    const p = deref(doc, raw)
    if (!p || p.in !== 'path') continue
    out.push({
      name: kebab(p.name),
      sourceName: p.name,
      description: p.description ?? `path: ${p.name}`,
      required: p.required !== false,
    })
  }
  return out
}

// ── Response renderer derivation ────────────────────────────────────

interface RendererHint {
  renderer: CommandSpec['renderer']
  columns?: string[]
  unwrap?: string[]
}

function deriveRenderer(doc: OpenAPIDoc, op: OpenAPIOperation): RendererHint {
  if (!op.responses) return { renderer: 'unknown' }
  // Find first 2xx response.
  let chosen: OpenAPIResponse | undefined
  for (const [code, raw] of Object.entries(op.responses)) {
    if (!/^2\d\d$/.test(code)) continue
    chosen = deref(doc, raw)
    if (chosen) break
  }
  if (!chosen?.content) return { renderer: 'unknown' }
  const json = chosen.content['application/json'] ?? Object.values(chosen.content)[0]
  let schema = derefSchema(doc, json?.schema)
  if (!schema) return { renderer: 'unknown' }
  // Unwrap a `{ data: ... }` envelope (universal in both our specs).
  const unwrap: string[] = []
  while (
    schema &&
    schema.type === 'object' &&
    schema.properties &&
    'data' in schema.properties &&
    Object.keys(schema.properties).length <= 2 // `data` + optional `meta`
  ) {
    unwrap.push('data')
    schema = derefSchema(doc, schema.properties.data)
    if (!schema) break
  }
  if (!schema) return { renderer: 'unknown', unwrap }
  if (schema.type === 'array') {
    const item = derefSchema(doc, schema.items)
    if (item?.type === 'object' && item.properties) {
      // Heuristic: pick up to 5 primitive top-level fields, prioritising
      // `id`, `name`, `slug`, `email`, common candidates.
      const priority = ['id', 'slug', 'name', 'username', 'title', 'email', 'role', 'status', 'enabled', 'createdAt', 'updatedAt']
      const primitives: string[] = []
      for (const k of Object.keys(item.properties)) {
        const sub = derefSchema(doc, item.properties[k])
        if (!sub) continue
        const t = sub.type
        if (t === 'string' || t === 'integer' || t === 'number' || t === 'boolean') {
          primitives.push(k)
        }
      }
      const ordered = [
        ...priority.filter((k) => primitives.includes(k)),
        ...primitives.filter((k) => !priority.includes(k)),
      ]
      return { renderer: 'table', columns: ordered.slice(0, 6), unwrap }
    }
    return { renderer: 'table', unwrap }
  }
  if (schema.type === 'object') {
    return { renderer: 'object', unwrap }
  }
  return { renderer: 'primitive', unwrap }
}

// ── Command-path derivation ─────────────────────────────────────────

function deriveCommandPath(operationId: string, tags: string[] | undefined): string[] {
  const idSegs = operationId.split('.').map(kebab).filter(Boolean)
  const tag = tags && tags[0] ? kebab(tags[0]) : undefined
  if (tag && idSegs[0] !== tag) {
    return [tag, ...idSegs]
  }
  return idSegs
}

// ── Per-tag module emission ─────────────────────────────────────────

interface CollectedCommand {
  spec: 'admin' | 'public'
  op: OpenAPIOperation
  method: string
  path: string
}

function collectCommands(doc: OpenAPIDoc, kind: 'admin' | 'public'): CommandSpec[] {
  const out: CommandSpec[] = []
  if (!doc.paths) return out
  for (const [pathTemplate, methods] of Object.entries(doc.paths)) {
    const unversionedPath =
      (methods as Record<string, unknown>)['x-opensteward-servers'] === 'unversioned'
    for (const [method, op] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue
      if (!op.operationId) {
        console.warn(`[generate-commands] WARN: missing operationId — skipping ${method.toUpperCase()} ${pathTemplate} (spec: ${kind})`)
        continue
      }
      try {
        const cmdPath = deriveCommandPath(op.operationId, op.tags)
        if (cmdPath.length === 0) {
          console.warn(`[generate-commands] WARN: unparseable operationId '${op.operationId}' — skipping ${method.toUpperCase()} ${pathTemplate}`)
          continue
        }
        const params = (op.parameters ?? []).map((p) => deref(doc, p)).filter((p): p is OpenAPIParam => !!p)
        const pathArgs = pathArgsFromParams(doc, params)
        const flags = applyCountryChoices([
          ...flagsFromQueryParams(doc, params),
          ...flagsFromBody(doc, op),
        ])
        const r = deriveRenderer(doc, op)
        out.push({
          commandPath: cmdPath,
          operationId: op.operationId,
          spec: kind,
          versioned: kind === 'public' && !unversionedPath,
          method,
          pathTemplate,
          summary: op.summary ?? '',
          description: op.description ?? '',
          pathArgs,
          flags,
          renderer: r.renderer,
          tableColumns: r.columns,
          responseUnwrap: r.unwrap,
        })
      } catch (err) {
        console.warn(`[generate-commands] WARN: failed to process ${op.operationId}: ${(err as Error).message}`)
      }
    }
  }
  return out
}

function checkForCollisions(cmds: CommandSpec[]): void {
  const seen = new Map<string, CommandSpec>()
  const collisions: Array<[CommandSpec, CommandSpec]> = []
  for (const c of cmds) {
    const key = c.commandPath.join(' ')
    const prev = seen.get(key)
    if (prev) collisions.push([prev, c])
    else seen.set(key, c)
  }
  if (collisions.length) {
    for (const [a, b] of collisions) {
      console.error(`[generate-commands] ERROR: command path collision '${a.commandPath.join(' ')}':`)
      console.error(`    ${a.spec}: ${a.method.toUpperCase()} ${a.pathTemplate}  (opId=${a.operationId})`)
      console.error(`    ${b.spec}: ${b.method.toUpperCase()} ${b.pathTemplate}  (opId=${b.operationId})`)
    }
    throw new Error(`${collisions.length} command-path collision(s) detected`)
  }
}

// ── Code emission ───────────────────────────────────────────────────

function emitFlagOption(flag: FlagSpec): string {
  // Commander option/requiredOption call source. Boolean flags are
  // emitted plain; others get a parser + optional choices.
  const desc = quote(flag.description.replace(/\s+/g, ' ').trim() || 'option')
  const tpl = quote(flag.flagTemplate)
  const method = flag.required ? 'requiredOption' : 'option'
  const lines: string[] = []
  lines.push(`  .${method}(${tpl}, ${desc}`)
  // Parser/coercion.
  switch (flag.coerce) {
    case 'integer':
      lines.push(`    , (v) => { const n = Number.parseInt(v, 10); if (Number.isNaN(n)) throw new Error('expected integer'); return n }`)
      break
    case 'number':
      lines.push(`    , (v) => { const n = Number(v); if (Number.isNaN(n)) throw new Error('expected number'); return n }`)
      break
    case 'boolean':
      // commander treats `--flag` as boolean true by default — no parser.
      break
    case 'array':
      // commander already gives us a string[] for `<value...>`.
      break
    case 'json':
      lines.push(`    , (v) => { try { return JSON.parse(v) } catch (e) { throw new Error('expected JSON: ' + (e as Error).message) } }`)
      break
    case 'string':
    default:
      break
  }
  lines.push(`  )`)
  if (flag.choices && flag.choices.length) {
    // Choices must be applied via `.choices(...)` on the most recent option.
    // Commander v14 exposes it on the returned `Option`, but the chained
    // form we use doesn't return the Option directly. We emit choices
    // metadata in the descriptor and let the runtime apply them.
    // -- Falls back to a runtime check.
  }
  return lines.join('\n')
}

function emitCommand(cmd: CommandSpec): string {
  // Each command is exported as a descriptor; the dispatcher converts
  // descriptors into commander subcommands. Going through a descriptor
  // (rather than calling `new Command(...)` here directly) keeps the
  // generated modules pure data, easier to test, and lets the dispatcher
  // attach the global flags and renderer wiring in one place.
  const positional = cmd.pathArgs.map((p) => ({
    name: p.name,
    sourceName: p.sourceName,
    description: p.description,
    required: p.required,
  }))
  const flagDescriptors = cmd.flags.map((f) => ({
    name: f.name,
    sourceName: f.sourceName,
    location: f.location,
    bodyPath: f.bodyPath,
    flagTemplate: f.flagTemplate,
    description: f.description.replace(/\s+/g, ' ').trim(),
    required: f.required,
    coerce: f.coerce,
    choices: f.choices,
    discriminatorPath: f.discriminatorPath,
    discriminatorValue: f.discriminatorValue,
    discriminatorFlag: f.discriminatorFlag,
  }))
  return `${JSON.stringify(
    {
      commandPath: cmd.commandPath,
      operationId: cmd.operationId,
      spec: cmd.spec,
      versioned: cmd.versioned,
      method: cmd.method.toUpperCase(),
      pathTemplate: cmd.pathTemplate,
      summary: cmd.summary,
      description: cmd.description,
      pathArgs: positional,
      flags: flagDescriptors,
      renderer: cmd.renderer,
      tableColumns: cmd.tableColumns ?? [],
      responseUnwrap: cmd.responseUnwrap ?? [],
    },
    null,
    2,
  )}`
}

function emitTagModule(tag: string, cmds: CommandSpec[]): string {
  // Sort for stable diffs.
  const sorted = [...cmds].sort((a, b) => a.commandPath.join(' ').localeCompare(b.commandPath.join(' ')))
  const banner = `// AUTOGENERATED — do not edit by hand.\n// Source: docs/openapi/admin-api.openapi.json + docs/openapi/openapi.json\n// Regenerate via: pnpm cli:generate\n\nimport type { CommandDescriptor } from '../dispatcher.js'\n\nexport const tag = ${quote(tag)}\nexport const commands: CommandDescriptor[] = ${JSON.stringify(
    sorted.map((c) => ({
      commandPath: c.commandPath,
      operationId: c.operationId,
      spec: c.spec,
      versioned: c.versioned,
      method: c.method.toUpperCase(),
      pathTemplate: c.pathTemplate,
      summary: c.summary,
      description: c.description,
      pathArgs: c.pathArgs.map((p) => ({
        name: p.name,
        sourceName: p.sourceName,
        description: p.description,
        required: p.required,
      })),
      flags: c.flags.map((f) => ({
        name: f.name,
        sourceName: f.sourceName,
        location: f.location,
        bodyPath: f.bodyPath ?? [],
        flagTemplate: f.flagTemplate,
        description: f.description.replace(/\s+/g, ' ').trim(),
        required: f.required,
        coerce: f.coerce,
        choices: f.choices ?? [],
        discriminatorPath: f.discriminatorPath ?? [],
        discriminatorValue: f.discriminatorValue ?? '',
        discriminatorFlag: f.discriminatorFlag ?? '',
      })),
      renderer: c.renderer,
      tableColumns: c.tableColumns ?? [],
      responseUnwrap: c.responseUnwrap ?? [],
    })),
    null,
    2,
  )}\n`
  return banner
}

function emitIndex(modules: Array<{ tag: string; file: string }>): string {
  const lines: string[] = []
  lines.push(`// AUTOGENERATED — do not edit by hand.\n// Regenerate via: pnpm cli:generate\n`)
  lines.push(`import type { CommandDescriptor } from '../dispatcher.js'`)
  for (const m of modules) {
    lines.push(`import * as ${safeIdent(m.tag)} from './${m.file}.js'`)
  }
  lines.push('')
  lines.push(`export const tags: Array<{ tag: string; commands: CommandDescriptor[] }> = [`)
  for (const m of modules) {
    lines.push(`  { tag: ${safeIdent(m.tag)}.tag, commands: ${safeIdent(m.tag)}.commands },`)
  }
  lines.push(`]`)
  lines.push('')
  lines.push(`export function allCommands(): CommandDescriptor[] {`)
  lines.push(`  return tags.flatMap((t) => t.commands)`)
  lines.push(`}`)
  lines.push('')
  return lines.join('\n')
}

/**
 * Runs generated TypeScript through the repo's own prettier config before
 * it hits disk. `check:warning-gates prettier` and `check:docs` both treat
 * these files as source of truth — formatting them after the fact (either
 * by hand or via a separate `prettier --write` pass) would just be undone
 * by the next `pnpm cli:generate`, so the emitter has to produce clean
 * output itself. `resolveConfig` walks up from `outPath` and picks up the
 * repo root `.prettierrc`.
 */
async function formatTypeScript(source: string, outPath: string): Promise<string> {
  const config = await prettier.resolveConfig(outPath)
  return prettier.format(source, { ...config, filepath: outPath, parser: 'typescript' })
}

// ── Public surface (also used by tests) ─────────────────────────────

export interface GeneratorResult {
  cmds: CommandSpec[]
  modulesEmitted: Array<{ tag: string; file: string; count: number }>
  manifest: Array<{ command: string; operationId: string; spec: string; tag: string }>
}

export async function generate({
  adminSpec,
  publicSpec,
  outDir,
}: {
  adminSpec: OpenAPIDoc
  publicSpec: OpenAPIDoc
  outDir: string
}): Promise<GeneratorResult> {
  const adminCmds = collectCommands(adminSpec, 'admin')
  const publicCmds = collectCommands(publicSpec, 'public')
  const all = [...adminCmds, ...publicCmds]
  checkForCollisions(all)

  // Group by first path segment (i.e. the tag bucket). If a command's
  // first segment is the same as the spec's primary tag, that's the
  // tag bucket. Otherwise we fall back to the first segment.
  const byTag = new Map<string, CommandSpec[]>()
  for (const c of all) {
    const tag = c.commandPath[0] ?? 'misc'
    const bucket = byTag.get(tag) ?? []
    bucket.push(c)
    byTag.set(tag, bucket)
  }

  // Wipe + rewrite the output dir.
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })

  const modulesEmitted: GeneratorResult['modulesEmitted'] = []
  for (const [tag, cmds] of [...byTag.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const file = safeIdent(tag)
    const outPath = join(outDir, `${file}.ts`)
    writeFileSync(outPath, await formatTypeScript(emitTagModule(tag, cmds), outPath), 'utf8')
    modulesEmitted.push({ tag, file, count: cmds.length })
  }

  const indexPath = join(outDir, 'index.ts')
  writeFileSync(indexPath, await formatTypeScript(emitIndex(modulesEmitted), indexPath), 'utf8')

  const manifest = all
    .map((c) => ({
      command: c.commandPath.join(' '),
      operationId: c.operationId,
      spec: c.spec,
      tag: c.commandPath[0] ?? 'misc',
    }))
    .sort((a, b) => a.command.localeCompare(b.command))
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  return { cmds: all, modulesEmitted, manifest }
}

// ── CLI entry ───────────────────────────────────────────────────────

function loadSpec(p: string): OpenAPIDoc {
  if (!existsSync(p)) {
    throw new Error(`spec not found: ${p}`)
  }
  return JSON.parse(readFileSync(p, 'utf8')) as OpenAPIDoc
}

async function main(): Promise<void> {
  const adminSpec = loadSpec(ADMIN_SPEC_PATH)
  const publicSpec = loadSpec(PUBLIC_SPEC_PATH)
  const result = await generate({ adminSpec, publicSpec, outDir: OUT_DIR })
  console.log(`[generate-commands] wrote ${result.modulesEmitted.length} tag modules (${result.cmds.length} commands) → ${OUT_DIR}`)
  for (const m of result.modulesEmitted) {
    console.log(`  - ${m.tag}: ${m.count} command${m.count === 1 ? '' : 's'}`)
  }
}

// Run only when invoked as the entry script, not when imported by tests.
const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('generate-commands.ts') || process.argv[1].endsWith('generate-commands.js'))
if (invokedDirectly) {
  main().catch((err: unknown) => {
    console.error('[generate-commands] FAILED:', (err as Error).message)
    process.exit(1)
  })
}
