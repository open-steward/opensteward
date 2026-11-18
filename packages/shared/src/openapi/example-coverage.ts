/**
 * Example-coverage checker for generated OpenAPI specs.
 *
 * Policy: every leaf property of every named component in `components.schemas`
 * must carry an `example` (or `examples`). We do NOT require object-level
 * examples — Swagger UI composes the object example from per-field examples, so
 * each scalar/enum leaf is what needs a value. Container nodes (objects, arrays,
 * nullable `anyOf` unions) are "covered" transitively when their leaves are.
 *
 * A `$ref` leaf is covered when the referenced component is itself covered (its
 * own gaps are reported under that component), or when the ref site carries a
 * sibling `example`. This mirrors how Swagger UI resolves and renders refs.
 */

type JsonSchema = Record<string, unknown>

interface OpenApiSpec {
  components?: { schemas?: Record<string, JsonSchema> }
}

export interface ExampleGap {
  /** Component name in `components.schemas`. */
  component: string
  /** Dotted path to the leaf property missing an example (`$` = the component root). */
  path: string
}

function hasExample(node: JsonSchema): boolean {
  if ('example' in node && node.example !== undefined) return true
  if (Array.isArray(node.examples) && node.examples.length > 0) return true
  return false
}

function isNullBranch(node: unknown): boolean {
  if (!node || typeof node !== 'object') return node === null
  const n = node as JsonSchema
  return n.type === 'null'
}

function refName(node: JsonSchema): string | null {
  const r = node.$ref
  if (typeof r !== 'string') return null
  const m = /#\/components\/schemas\/(.+)$/.exec(r)
  return m ? m[1]! : null
}

/**
 * Whole-node coverage (used to decide whether a `$ref` target or an `anyOf`
 * branch counts as covered). Memoised across components, cycle-safe.
 */
function makeIsCovered(schemas: Record<string, JsonSchema>) {
  const memo = new Map<string, boolean>()

  const covered = (node: JsonSchema, seen: Set<string>): boolean => {
    if (hasExample(node)) return true

    const ref = refName(node)
    if (ref) {
      if (seen.has(ref)) return true // cycle — assume covered, broken elsewhere
      if (memo.has(ref)) return memo.get(ref)!
      const target = schemas[ref]
      if (!target) return true // dangling ref — not our problem to flag here
      const next = new Set(seen).add(ref)
      const result = covered(target, next)
      memo.set(ref, result)
      return result
    }

    for (const key of ['anyOf', 'oneOf'] as const) {
      const branches = node[key]
      if (Array.isArray(branches)) {
        return branches.some((b) => isNullBranch(b) || covered(b as JsonSchema, seen))
      }
    }
    if (Array.isArray(node.allOf)) {
      return (node.allOf as JsonSchema[]).every((b) => covered(b, seen))
    }

    const props = node.properties as Record<string, JsonSchema> | undefined
    if (props && Object.keys(props).length > 0) {
      return Object.values(props).every((p) => covered(p, seen))
    }
    if (node.type === 'object' || node.additionalProperties) return true // opaque/record map

    if (node.type === 'array' && node.items && typeof node.items === 'object') {
      return covered(node.items as JsonSchema, seen)
    }

    // Opaque `any`/`unknown` passthrough (e.g. `raw`, freeform blobs) — no type,
    // enum, or const to pin down, so a single example is meaningless. Covered.
    if (!node.type && !node.enum && !('const' in node)) return true

    // Scalar / enum / const leaf with no example.
    return false
  }

  return (node: JsonSchema) => covered(node, new Set())
}

/**
 * Returns every leaf property (across all components) that lacks an example.
 * Empty array → full coverage.
 */
export function findUncoveredExamples(spec: OpenApiSpec): ExampleGap[] {
  const schemas = spec.components?.schemas ?? {}
  const isCovered = makeIsCovered(schemas)
  const gaps: ExampleGap[] = []

  const collect = (node: JsonSchema, path: string, out: string[]): void => {
    if (hasExample(node)) return

    // A $ref leaf is fine when its target is covered; the target's own gaps are
    // reported when we iterate that component, so don't double-report here.
    if (refName(node)) {
      if (!isCovered(node)) out.push(path)
      return
    }

    for (const key of ['anyOf', 'oneOf'] as const) {
      const branches = node[key]
      if (Array.isArray(branches)) {
        if (branches.some((b) => isNullBranch(b) || isCovered(b as JsonSchema))) return
        branches.filter((b) => !isNullBranch(b)).forEach((b) => collect(b as JsonSchema, path, out))
        return
      }
    }
    if (Array.isArray(node.allOf)) {
      ;(node.allOf as JsonSchema[]).forEach((b) => collect(b, path, out))
      return
    }

    const props = node.properties as Record<string, JsonSchema> | undefined
    if (props && Object.keys(props).length > 0) {
      for (const [name, p] of Object.entries(props)) {
        collect(p, path === '$' ? name : `${path}.${name}`, out)
      }
      return
    }
    if (node.type === 'object' || node.additionalProperties) return // opaque/record

    if (node.type === 'array' && node.items && typeof node.items === 'object') {
      collect(node.items as JsonSchema, `${path}[]`, out)
      return
    }

    // Opaque `any`/`unknown` passthrough — nothing to exemplify.
    if (!node.type && !node.enum && !('const' in node)) return

    // Scalar / enum / const leaf without an example.
    out.push(path)
  }

  for (const [component, schema] of Object.entries(schemas)) {
    const out: string[] = []
    collect(schema, '$', out)
    // A component whose root IS a bare scalar/enum (no object fields of its own)
    // is self-documenting via its `type`/`enum`; it's covered at every field
    // that references it. Don't demand a top-level example on the component
    // itself — the policy targets the FIELDS of object components.
    const props = schema.properties as Record<string, unknown> | undefined
    const isScalarRoot = !props && schema.type !== 'object' && typeof schema.$ref !== 'string'
    if (isScalarRoot && out.length === 1 && out[0] === '$') continue
    for (const path of out) gaps.push({ component, path })
  }
  return gaps
}
