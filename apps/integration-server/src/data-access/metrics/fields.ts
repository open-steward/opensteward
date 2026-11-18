/**
 * What a field of a canonical schema IS, for the currency rules (design §2).
 *
 * `isCurrencyCodeField` decides whether a path may serve as a
 * `currencyField`: money is grouped by it, and financial masking exempts it
 * (a code is not an amount). Both are only safe if the field really holds a
 * currency code, so the schema's own Zod type is inspected rather than the
 * path trusted: an amount named in a `currencyField` would otherwise group
 * money by amount and leak it past masking.
 */
import { Iso4217Currency, effectiveFieldClass } from '@opensteward/shared'
import { getClassification, getResourceSchema } from '../classification-registry'

/** The slice of a Zod v4 schema this module reads. */
interface ZodLike {
  _zod?: {
    def?: {
      type?: string
      innerType?: unknown
      in?: unknown
      options?: unknown[]
      shape?: Record<string, unknown>
    }
    /** The schema this one was cloned from (`.meta()`, `.describe()`, …). */
    parent?: unknown
  }
}

const WRAPPERS = new Set([
  'optional',
  'nullable',
  'default',
  'prefault',
  'catch',
  'readonly',
  'nonoptional',
])

/** Strip optional / nullable / default / pipe wrappers and `x | null | undefined` unions. */
function unwrap(schema: unknown): ZodLike | undefined {
  let cur = schema as ZodLike | undefined
  for (let i = 0; i < 32 && cur; i++) {
    const def = cur._zod?.def
    if (!def) return cur
    if (def.type && WRAPPERS.has(def.type)) {
      cur = def.innerType as ZodLike
    } else if (def.type === 'pipe') {
      cur = def.in as ZodLike
    } else if (def.type === 'union' && Array.isArray(def.options)) {
      const real = def.options.filter((o) => {
        const t = (o as ZodLike)._zod?.def?.type
        return t !== 'null' && t !== 'undefined'
      })
      if (real.length !== 1) return cur
      cur = real[0] as ZodLike
    } else {
      return cur
    }
  }
  return cur
}

/** The (unwrapped) Zod schema at a dotted path of a stored resource type, or undefined. */
export function schemaFieldAt(
  vertical: string,
  resourceType: string,
  path: string,
): ZodLike | undefined {
  const root = getResourceSchema(vertical, resourceType)
  if (!root) return undefined
  let shape: Record<string, unknown> | undefined = root.shape
  let field: ZodLike | undefined
  for (const seg of path.split('.')) {
    if (!shape || !Object.hasOwn(shape, seg)) return undefined
    field = unwrap(shape[seg])
    shape = field?._zod?.def?.type === 'object' ? field._zod.def.shape : undefined
  }
  return field
}

function descendsFrom(schema: ZodLike | undefined, ancestor: unknown): boolean {
  let cur: unknown = schema
  for (let i = 0; i < 32 && cur; i++) {
    if (cur === ancestor) return true
    cur = (cur as ZodLike)._zod?.parent
  }
  return false
}

const CURRENCY_NAME = /currency(code)?$/i

/**
 * A field that holds a currency code: its schema is (a clone of)
 * `Iso4217Currency`, or it is a string whose name ends in `currency` /
 * `currencyCode` (`defaultCurrency` on a schema that predates the ISO type).
 */
export function isCurrencyCodeField(vertical: string, resourceType: string, path: string): boolean {
  const field = schemaFieldAt(vertical, resourceType, path)
  if (!field) return false
  if (descendsFrom(field, Iso4217Currency)) return true
  const type = field._zod?.def?.type
  const leaf = path.split('.').pop() ?? ''
  return (type === 'string' || type === 'enum') && CURRENCY_NAME.test(leaf)
}

/** `effectiveFieldClass` is `financial` (the field, an ancestor or a descendant). */
export function isFinancialField(vertical: string, resourceType: string, path: string): boolean {
  const cls = getClassification(vertical, resourceType)
  return !!cls && effectiveFieldClass(path, cls) === 'financial'
}
