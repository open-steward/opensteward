/**
 * The analytics view catalog — what read-only SQL access exposes.
 *
 * One view per stored (vertical, resourceType): `<vertical>_<resource_type>`,
 * with a fixed set of store columns, one typed column per top-level field of
 * the canonical Zod schema, and the whole record as `data jsonb`. Every column
 * carries the class and mask its field has in the vertical's classification
 * sidecar, so the generated SQL masks exactly what the admin data viewer masks
 * (`packages/shared/src/data-classification/mask.ts`).
 *
 * The catalog is DATA and deterministic: the same sources produce byte-equal
 * JSON, and its `hash` is what the provisioner compares to decide whether the
 * database is current. `catalog.lock.json` next to this file pins it in git so
 * a breaking change (a view or column removed, a type changed) cannot land
 * unnoticed — see `scripts/check-analytics-catalog.ts`.
 */
import { createHash } from 'node:crypto'
import {
  DEFAULT_RULE_KEY,
  IMPLICIT_PII_FIELDS,
  effectiveFieldClass,
  resolveFieldRule,
  type FieldClass,
  type MaskKind,
  type ResourceClassification,
} from '@opensteward/shared'
import {
  getClassification,
  getResourceSchema,
  listableResources,
  UNCLASSIFIED,
  type ShapedSchema,
} from '../data-access/classification-registry'

/** Bumped when the catalog's own JSON layout changes (not its content). */
export const CATALOG_FORMAT = 1

export type SqlType = 'text' | 'numeric' | 'boolean' | 'timestamptz' | 'date' | 'jsonb'

export interface CatalogColumn {
  /** SQL column name (snake_case, unquoted-safe). */
  name: string
  /** `store` = a column of the resources/credentials row; `field` = a record field; `data` = the whole record. */
  source: 'store' | 'field' | 'data'
  /** Top-level record field the column reads (source `field`). */
  field?: string
  /** Type in the unmasked (`os_analytics_pii`) views. */
  type: SqlType
  /** Type in the masked (`os_analytics`) views — `text` when a mask turns a value into a string. */
  maskedType: SqlType
  /** Most restrictive class touching the field (its own rule or a nested one). */
  class: FieldClass
  /** Mask applied to the whole column in masked views, when its own rule is PII. */
  mask?: MaskKind
}

export interface CatalogRule {
  path: string
  class: FieldClass
  mask?: MaskKind
}

export interface CatalogView {
  name: string
  kind: 'resource' | 'system'
  vertical?: string
  resourceType?: string
  columns: CatalogColumn[]
  /**
   * The classification the `data` column and typed columns are masked by, in
   * the sidecar's own order (rule order is significant for equal depths).
   * The `'*'` default rule is listed under its own key.
   */
  rules?: CatalogRule[]
  /** Top-level fields never exposed through SQL (the upstream payload of payments/accounting). */
  stripFields?: string[]
}

export interface AnalyticsCatalog {
  format: number
  views: CatalogView[]
  hash: string
}

/**
 * Upstream payload fields dropped from SQL views altogether. The data viewer
 * strips these per request by the raw-payload setting; SQL cannot read that
 * setting, so it takes the strict side for the two verticals whose payload
 * carries bank and card identifiers (see `strip-raw-payload.ts`).
 */
export const SQL_STRIPPED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  payments: ['raw'],
  accounting: ['metadata'],
}

// ── Store and system columns ─────────────────────────────────────────────

const store = (name: string, type: SqlType, cls: FieldClass = 'internal'): CatalogColumn => ({
  name,
  source: 'store',
  type,
  maskedType: type,
  class: cls,
})

/** The store columns every resource view starts with, in order. */
export const FIXED_RESOURCE_COLUMNS: readonly CatalogColumn[] = [
  store('connection_id', 'text'),
  store('owner_tenant_id', 'text'),
  store('platform', 'text'),
  store('vertical', 'text'),
  store('resource_id', 'text'),
  store('fetched_at', 'timestamptz'),
  store('updated_at', 'timestamptz'),
  store('changed_at', 'timestamptz'),
  store('norm_version', 'text'),
]

const RESERVED_NAMES = new Set([...FIXED_RESOURCE_COLUMNS.map((c) => c.name), 'data'])

/** The non-resource views, hand-written in the generator; listed here for the catalog browser. */
export const SYSTEM_VIEWS: readonly CatalogView[] = [
  {
    name: 'connections',
    kind: 'system',
    columns: [
      store('connection_id', 'text'),
      store('owner_tenant_id', 'text'),
      store('platform', 'text'),
      store('vertical', 'text'),
      store('label', 'text'),
      store('created_at', 'timestamptz'),
      store('updated_at', 'timestamptz'),
      store('expires_at', 'timestamptz'),
      store('last_refresh_at', 'timestamptz'),
      store('last_refresh_status', 'text'),
    ],
  },
  {
    name: 'sync_status',
    kind: 'system',
    columns: [
      store('job_id', 'text'),
      store('connection_id', 'text'),
      store('owner_tenant_id', 'text'),
      store('vertical', 'text'),
      store('platform', 'text'),
      store('status', 'text'),
      store('progress', 'jsonb'),
      store('created_at', 'timestamptz'),
      store('started_at', 'timestamptz'),
      store('completed_at', 'timestamptz'),
    ],
  },
  {
    // Present only when admin-api's `tenants` table shares the database.
    name: 'tenants',
    kind: 'system',
    columns: [
      store('tenant_id', 'text'),
      store('name', 'text'),
      store('created_at', 'timestamptz'),
      store('updated_at', 'timestamptz'),
    ],
  },
]

// ── Names ────────────────────────────────────────────────────────────────

const MAX_IDENT = 63

/** `customer-support` + `purchaseOrders` → `customer_support_purchase_orders`. */
export function sqlName(raw: string): string {
  let s = raw
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
  if (s === '') s = 'field'
  if (/^[0-9]/.test(s)) s = `f_${s}`
  return s.slice(0, MAX_IDENT)
}

export function viewName(vertical: string, resourceType: string): string {
  return sqlName(`${vertical}_${resourceType}`)
}

// ── Zod introspection ────────────────────────────────────────────────────

interface ZodDefLike {
  type?: string
  format?: string
  innerType?: unknown
  in?: unknown
  out?: unknown
  options?: unknown[]
  values?: unknown[]
}

function defOf(schema: unknown): ZodDefLike | undefined {
  if (typeof schema !== 'object' || schema === null) return undefined
  const z = (schema as { _zod?: { def?: ZodDefLike } })._zod
  return z?.def
}

const WRAPPERS = new Set([
  'optional',
  'nullable',
  'default',
  'prefault',
  'readonly',
  'catch',
  'nonoptional',
])

const DATE_NAME = /(_at|At|date|Date|_on)$/

/** SQL type for one Zod field. Unknown shapes fall to `jsonb`, which never fails a cast. */
export function sqlTypeOf(schema: unknown, fieldName = ''): SqlType {
  const def = defOf(schema)
  if (!def?.type) return 'jsonb'
  const t = def.type
  if (WRAPPERS.has(t)) return sqlTypeOf(def.innerType, fieldName)
  if (t === 'pipe') return sqlTypeOf(def.in, fieldName)
  switch (t) {
    case 'string': {
      if (def.format === 'datetime') return 'timestamptz'
      if (def.format === 'date') return 'date'
      return DATE_NAME.test(fieldName) ? 'timestamptz' : 'text'
    }
    case 'enum':
    case 'literal':
    case 'template_literal':
      return 'text'
    case 'number':
    case 'int':
    case 'bigint':
      return 'numeric'
    case 'boolean':
      return 'boolean'
    case 'date':
      return 'timestamptz'
    case 'union': {
      const types = new Set((def.options ?? []).map((o) => sqlTypeOf(o, fieldName)))
      if (types.size === 1) return [...types][0]!
      if ([...types].every((x) => x === 'timestamptz' || x === 'date')) return 'timestamptz'
      return 'jsonb'
    }
    default:
      return 'jsonb'
  }
}

// ── Building ─────────────────────────────────────────────────────────────

export interface CatalogSource {
  vertical: string
  resourceType: string
  schema: ShapedSchema | null
  classification: ResourceClassification
}

function ruleList(cls: ResourceClassification): CatalogRule[] {
  return Object.entries(cls).map(([path, r]) =>
    r.mask !== undefined ? { path, class: r.class, mask: r.mask } : { path, class: r.class },
  )
}

/** Masks turn a value into a string (or a jsonb of strings), so a masked scalar column is text. */
function maskedTypeFor(type: SqlType, ownClass: FieldClass): SqlType {
  if (ownClass !== 'pii') return type
  return type === 'jsonb' ? 'jsonb' : 'text'
}

export function buildResourceView(src: CatalogSource): CatalogView {
  const { vertical, resourceType, schema, classification: cls } = src
  const strip = new Set(SQL_STRIPPED_FIELDS[vertical] ?? [])
  const columns: CatalogColumn[] = FIXED_RESOURCE_COLUMNS.map((c) => ({ ...c }))
  const used = new Set(columns.map((c) => c.name))
  const fields = schema ? Object.keys(schema.shape) : []
  for (const field of fields) {
    if (strip.has(field)) continue
    const own = resolveFieldRule(field, cls)
    if (own.class === 'secret') continue
    const effective = effectiveFieldClass(field, cls)
    let name = sqlName(field)
    if (RESERVED_NAMES.has(name)) name = sqlName(`record_${name}`)
    if (used.has(name)) {
      let i = 2
      while (used.has(`${name}_${i}`)) i++
      name = `${name}_${i}`
    }
    used.add(name)
    const type = sqlTypeOf(schema!.shape[field], field)
    const col: CatalogColumn = {
      name,
      source: 'field',
      field,
      type,
      maskedType: maskedTypeFor(type, own.class),
      class: effective,
    }
    if (own.class === 'pii') col.mask = own.mask ?? 'redact'
    columns.push(col)
  }
  columns.push({ name: 'data', source: 'data', type: 'jsonb', maskedType: 'jsonb', class: 'pii' })
  const view: CatalogView = {
    name: viewName(vertical, resourceType),
    kind: 'resource',
    vertical,
    resourceType,
    columns,
    rules: ruleList(cls),
  }
  if (strip.size > 0) view.stripFields = [...strip].sort()
  return view
}

/** Stable JSON: object keys sorted, arrays in order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function catalogHash(views: CatalogView[]): string {
  return createHash('sha256')
    .update(canonicalJson({ format: CATALOG_FORMAT, views }))
    .digest('hex')
}

export function buildCatalogFrom(sources: CatalogSource[]): AnalyticsCatalog {
  const byName = new Map<string, CatalogView>()
  for (const src of sources) {
    const view = buildResourceView(src)
    if (byName.has(view.name)) {
      throw new Error(
        `analytics catalog: view name collision '${view.name}' (${src.vertical}/${src.resourceType})`,
      )
    }
    byName.set(view.name, view)
  }
  for (const sys of SYSTEM_VIEWS) {
    if (byName.has(sys.name)) throw new Error(`analytics catalog: '${sys.name}' is reserved`)
    byName.set(sys.name, sys)
  }
  const views = [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : 1))
  return { format: CATALOG_FORMAT, views, hash: catalogHash(views) }
}

/** The catalog for this build, from the classification registry. */
export function buildCatalog(): AnalyticsCatalog {
  const seen = new Set<string>()
  const sources: CatalogSource[] = []
  for (const { vertical, resourceType } of listableResources()) {
    const key = `${vertical}/${resourceType}`
    if (seen.has(key)) continue
    seen.add(key)
    sources.push({
      vertical,
      resourceType,
      schema: getResourceSchema(vertical, resourceType),
      classification: getClassification(vertical, resourceType) ?? UNCLASSIFIED,
    })
  }
  return buildCatalogFrom(sources)
}

// ── Diffing ──────────────────────────────────────────────────────────────

export interface CatalogDiff {
  breaking: boolean
  /** Human-readable, one line per change, sorted. */
  breakingChanges: string[]
  additiveChanges: string[]
}

type Shape = Pick<AnalyticsCatalog, 'views'>

/**
 * What changed between two catalogs, by view and column NAME: a view or
 * column removed, or a column whose type changed, is breaking (a BI query
 * written against the old shape fails or silently changes meaning); a new view
 * or column is additive. Classification changes are neither — masks always
 * follow the current classification, in every retained version.
 */
export function diffCatalogs(prev: Shape, next: Shape): CatalogDiff {
  const breakingChanges: string[] = []
  const additiveChanges: string[] = []
  const nextViews = new Map(next.views.map((v) => [v.name, v]))
  const prevViews = new Map(prev.views.map((v) => [v.name, v]))
  for (const pv of prev.views) {
    const nv = nextViews.get(pv.name)
    if (!nv) {
      breakingChanges.push(`view ${pv.name} removed`)
      continue
    }
    const nextCols = new Map(nv.columns.map((c) => [c.name, c]))
    for (const pc of pv.columns) {
      const nc = nextCols.get(pc.name)
      if (!nc) breakingChanges.push(`column ${pv.name}.${pc.name} removed`)
      else if (nc.type !== pc.type || nc.maskedType !== pc.maskedType) {
        breakingChanges.push(
          `column ${pv.name}.${pc.name} type ${pc.type}/${pc.maskedType} → ${nc.type}/${nc.maskedType}`,
        )
      }
    }
    const prevCols = new Set(pv.columns.map((c) => c.name))
    for (const nc of nv.columns) {
      if (!prevCols.has(nc.name)) additiveChanges.push(`column ${nv.name}.${nc.name} added`)
    }
  }
  for (const nv of next.views) {
    if (!prevViews.has(nv.name)) additiveChanges.push(`view ${nv.name} added`)
  }
  breakingChanges.sort()
  additiveChanges.sort()
  return { breaking: breakingChanges.length > 0, breakingChanges, additiveChanges }
}

/** Rules for masking, as a classification object again (order preserved). */
export function rulesToClassification(rules: CatalogRule[]): ResourceClassification {
  const out: ResourceClassification = {}
  for (const r of rules)
    out[r.path] = r.mask !== undefined ? { class: r.class, mask: r.mask } : { class: r.class }
  return out
}

export { DEFAULT_RULE_KEY, IMPLICIT_PII_FIELDS }
