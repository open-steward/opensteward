/**
 * Synthetic records built by walking a canonical Zod schema.
 *
 * Every canonical field carries `.meta({ example })` — CI enforces it via
 * `scripts/check-openapi-examples.ts` — so the schemas already describe what a
 * realistic record looks like. This module materialises that description into
 * an object, giving the sandbox complete, coherent, docs-consistent data for
 * every resource with no hand-written fixture files, and keeping it in step as
 * the schemas evolve.
 *
 * ## Why the Zod schema and not the generated OpenAPI spec
 *
 * The spec looks like the easier source — it is JSON, and `check-openapi-examples`
 * guarantees the examples are there. It is also wrong for this purpose, in two
 * ways that were measured against the real `InvoiceSchema`:
 *
 *     InvoiceSchema.safeParse({ postedAt: '2026-02-01T00:00:00Z' })
 *       → FAIL: expected date, received string
 *     InvoiceSchema.safeParse({ cancelledAt: null })
 *       → FAIL: expected date, received null
 *
 * The first is structural: the spec generator rewrites `z.date()` to
 * `{ type: 'string', format: 'date-time' }`, so a fixture built from the spec
 * cannot satisfy the schema it claims to describe. The second is a field whose
 * own documented example is `null` while the field is `.optional()` but not
 * `.nullable()` — copying documented examples verbatim produces invalid data.
 *
 * Walking Zod sees `z.date()` as a date and the optional/nullable wrappers as
 * themselves, so both cases are decidable. It also sidesteps the four `$ref`
 * collapse passes in `generate-openapi.ts`, whose `ISO4217` component is a
 * 179-member enum where the Zod source is a regex.
 *
 * ## Determinism
 *
 * Index 0 reproduces the documented examples verbatim, so a sandbox record has
 * the same id the docs show. Higher indices vary only what can be varied
 * without breaking a constraint — see `VARIATION` below.
 */
import { z } from 'zod'

/** Returned in place of a value when the field should be left out entirely. */
const OMIT = Symbol('omit')

/**
 * Zod 4 exposes a node's definition at `_zod.def`, with `_def` retained for
 * compatibility. `generate-openapi.ts`'s `toSchema` override reads both for the
 * same reason.
 */
interface ZodDef {
  type?: string
  format?: string
  checks?: unknown[]
  innerType?: unknown
  element?: unknown
  shape?: Record<string, unknown>
  entries?: Record<string, string>
}

function defOf(node: unknown): ZodDef | undefined {
  const n = node as { _zod?: { def?: ZodDef }; _def?: ZodDef } | undefined
  return n?._zod?.def ?? n?._def
}

/**
 * A string's format constraint, if it has one.
 *
 * Zod records it in two places depending on how the schema was written:
 * `z.uuid()` puts `format` on the node itself, while `z.string()` narrowed by a
 * format check (which is what `ConnectionSchema.id` is) puts it on the check.
 * Miss the second and the generator emits `''` for a field the schema requires
 * to be a UUID.
 */
function stringFormat(def: ZodDef | undefined): string | undefined {
  if (def?.format) return def.format
  for (const check of def?.checks ?? []) {
    const cd = defOf(check)
    if (cd?.format) return cd.format
  }
  return undefined
}

/**
 * A valid placeholder per known string format, for a field that carries a
 * format constraint but no example. Values are fixed rather than random so a
 * sandbox record is reproducible.
 */
const FORMAT_PLACEHOLDERS: Record<string, string> = {
  uuid: '00000000-0000-4000-8000-000000000000',
  guid: '00000000-0000-4000-8000-000000000000',
  email: 'sandbox@example.com',
  url: 'https://example.com',
  datetime: '2026-01-15T09:30:00.000Z',
  date: '2026-01-15',
  time: '09:30:00',
}

function exampleOf(node: unknown): { present: boolean; value: unknown } {
  const meta = z.globalRegistry.get(node as never) as { example?: unknown } | undefined
  if (meta && 'example' in meta) return { present: true, value: meta.example }
  return { present: false, value: undefined }
}

/**
 * Peel `optional` / `nullable` wrappers, recording which were seen and keeping
 * the OUTERMOST example.
 *
 * The outermost matters: `nullish(Amount)` re-`.meta()`s the field, and the
 * inner `Amount` primitive carries its own example. Reading depth-first picks
 * up the shared primitive's default (125000) rather than the field's real value.
 */
function unwrap(node: unknown): {
  core: unknown
  optional: boolean
  nullable: boolean
  example: { present: boolean; value: unknown }
} {
  let core = node
  let optional = false
  let nullable = false
  let example = exampleOf(node)
  for (let i = 0; i < 8; i++) {
    const def = defOf(core)
    if (def?.type === 'optional') optional = true
    else if (def?.type === 'nullable') nullable = true
    else break
    core = def.innerType
    if (!example.present) example = exampleOf(core)
  }
  return { core, optional, nullable, example }
}

export interface FixtureOptions {
  /** Stable per (tenant, vertical, resourceType) — mixed into every varied value. */
  seed: string
  /** 0 reproduces the documented examples verbatim. */
  index: number
  /** Applied over the result; the adapter uses this to set the record's id. */
  overrides?: Record<string, unknown>
}

/**
 * What varies as `index` grows, and — just as importantly — what does not.
 *
 * Only three things are safe to vary, because canonical fields carry real
 * constraints: `Iso4217Currency` is `.length(3).regex(/^[A-Z]{3}$/)`, so
 * suffixing the string `'USD'` produces data the schema rejects. So:
 *
 *   - enum members rotate (always within the declared set)
 *   - dates shift by whole days (still dates)
 *   - everything else keeps its documented example
 *
 * Record identity is varied by the caller through `overrides`, which is the one
 * place that knows which field is the id.
 */
const VARIATION = { dayMs: 86_400_000, daysPerIndex: 3 } as const

/** FNV-1a — a small stable hash so variation is reproducible across restarts. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

function buildNode(node: unknown, opts: FixtureOptions, path: string): unknown {
  const { core, optional, nullable, example } = unwrap(node)
  const def = defOf(core)
  const type = def?.type

  if (example.present) {
    // A documented `null` on a field that cannot hold null. Two fields in
    // accounting alone (`cancelledAt`, `refundedAt`) are `.optional()` and
    // documented as `null`; the field is absent, not null, when unset.
    if (example.value === null && !nullable) {
      return optional ? OMIT : buildFromType(core, type, opts, path)
    }
    if (example.value === null) return null
    // A date's example is written as an ISO string (that is what the spec and
    // the wire show), but the schema wants a Date.
    if (type === 'date' && typeof example.value === 'string') {
      return shiftDate(new Date(example.value), opts)
    }
    if (type === 'enum') return chooseEnum(def, example.value, opts, path) ?? example.value
    if (type === 'date' && example.value instanceof Date) return shiftDate(example.value, opts)
    return example.value
  }

  const built = buildFromType(core, type, opts, path)
  if (built === OMIT && !optional) return null
  return built
}

function buildFromType(
  core: unknown,
  type: string | undefined,
  opts: FixtureOptions,
  path: string,
): unknown {
  const def = defOf(core)
  switch (type) {
    case 'object': {
      const shape = (def?.shape ?? {}) as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const [key, child] of Object.entries(shape)) {
        const value = buildNode(child, opts, `${path}.${key}`)
        if (value !== OMIT) out[key] = value
      }
      return out
    }
    case 'array':
      // Array containers carry a description but no example (the coverage gate
      // treats them as covered transitively), so synthesize one element.
      return [buildNode(def?.element, opts, `${path}[]`)]
    case 'record':
      // `z.record(z.string(), z.unknown())` — the raw upstream passthrough.
      // An empty object is the honest sandbox value and always parses.
      return {}
    case 'enum':
      return chooseEnum(def, undefined, opts, path) ?? ''
    case 'date':
      return shiftDate(new Date('2026-01-15T09:30:00.000Z'), opts)
    case 'string': {
      const format = stringFormat(def)
      return (format && FORMAT_PLACEHOLDERS[format]) ?? ''
    }
    case 'number':
      return 0
    case 'boolean':
      return false
    case 'unknown':
    case 'any':
      // Nothing to synthesize and nothing the schema needs. Leave it out.
      return OMIT
    default:
      return OMIT
  }
}

/**
 * Choose an enum member, anchored on the documented example.
 *
 * The anchor is the point: index 0 must reproduce the documented example.
 * Rotating from the enum's first DECLARED member instead would serve values
 * contradicting the docs — e.g. `status: 'DRAFT'` for an invoice the docs
 * document as `'PAID'`, a draft carrying a full payment and a `paidAt`.
 *
 * So index 0 IS the example, and higher indices rotate around it. The offset
 * starts at 1 so a varied record never lands back on the index-0 value — two
 * records differing only in id would make a paged list look broken.
 *
 * `withUnknown([...])` appends a synthetic `'unknown'` member to every
 * canonical status enum, meaning "the platform said something we could not
 * map". A sandbox must never claim that, so it is dropped before choosing.
 */
function chooseEnum(
  def: ZodDef | undefined,
  example: unknown,
  opts: FixtureOptions,
  path: string,
): string | undefined {
  const values = Object.values(def?.entries ?? {})
  if (values.length === 0) return undefined
  const real =
    values.length > 1 && values[values.length - 1] === 'unknown' ? values.slice(0, -1) : values

  // Falls back to the first member when nothing is documented, or when a schema
  // documents a value outside its own enum — which would not parse anyway.
  const anchor = typeof example === 'string' ? real.indexOf(example) : -1
  const start = anchor >= 0 ? anchor : 0
  if (opts.index === 0) return real[start]
  if (real.length === 1) return real[0]
  const offset = 1 + ((hash(`${opts.seed}:${path}`) + opts.index - 1) % (real.length - 1))
  return real[(start + offset) % real.length]
}

function shiftDate(base: Date, opts: FixtureOptions): Date {
  if (opts.index === 0) return base
  return new Date(base.getTime() + opts.index * VARIATION.daysPerIndex * VARIATION.dayMs)
}

/**
 * Build one record. Index 0 reproduces the schema's documented examples, so
 * `GET /test/v1/accounting/invoices/inv_1042` returns exactly what the docs
 * show for an invoice.
 */
export function buildFixture(schema: z.ZodType, opts: FixtureOptions): Record<string, unknown> {
  const built = buildNode(schema, opts, '$')
  const base = (built === OMIT || built === null ? {} : built) as Record<string, unknown>
  return { ...base, ...(opts.overrides ?? {}) }
}

/** `count` records, indices 0..count-1. */
export function buildFixtures(
  schema: z.ZodType,
  count: number,
  base: Omit<FixtureOptions, 'index'>,
): Array<Record<string, unknown>> {
  return Array.from({ length: count }, (_, index) => buildFixture(schema, { ...base, index }))
}

/**
 * Restore `Date` values after a round-trip through the store's JSON column.
 *
 * `JSON.stringify` turns a Date into an ISO string, and the canonical schemas
 * want a Date back — the same mismatch that rules out building fixtures from
 * the spec. Driven by the schema so only genuine `z.date()` leaves are revived
 * and an ISO-looking string in a free-text field is left alone.
 */
export function reviveDates<T>(schema: z.ZodType, value: T): T {
  return revive(schema, value) as T
}

function revive(node: unknown, value: unknown): unknown {
  if (value === null || value === undefined) return value
  const { core } = unwrap(node)
  const def = defOf(core)
  switch (def?.type) {
    case 'date':
      return typeof value === 'string' ? new Date(value) : value
    case 'object': {
      if (typeof value !== 'object') return value
      const shape = (def?.shape ?? {}) as Record<string, unknown>
      const out: Record<string, unknown> = { ...(value as Record<string, unknown>) }
      for (const [key, child] of Object.entries(shape)) {
        if (key in out) out[key] = revive(child, out[key])
      }
      return out
    }
    case 'array':
      return Array.isArray(value) ? value.map((v) => revive(def?.element, v)) : value
    default:
      return value
  }
}
