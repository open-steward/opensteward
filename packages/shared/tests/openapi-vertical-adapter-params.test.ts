/**
 * How vertical and adapter parameters must be declared in the public spec.
 *
 * Three rules, each with a reason:
 *
 *  1. Every `vertical` parameter is constrained. There are nine of them, they
 *     never change without a release, and a bare `type: string` gives the API
 *     console a free-text box for a closed set.
 *
 *  2. Every adapter *path* parameter references one shared `PlatformSlug`
 *     component rather than inlining the list. Inlining the list at each of
 *     the nine sites costs ~389 KB — 22.7% of the spec — plus the same nine
 *     copies again in the generated SDK types.
 *
 *  3. Adapter *query* and *body* values stay free text. The CLI generator
 *     turns query/body enums into `choices`, and a 1,500-choice flag is worse
 *     than a documented string. Path params are exempt from that treatment,
 *     which is why rule 2 can enumerate them.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '../../..')
const spec = JSON.parse(
  readFileSync(join(REPO_ROOT, 'docs/openapi/openapi.json'), 'utf8'),
) as Record<string, any>

const PLATFORM_SLUG_REF = '#/components/schemas/PlatformSlug'
const VERTICAL_REF = '#/components/schemas/Vertical'

/** Every parameter in the document, with the path + method it belongs to. */
function allParameters(): Array<{ where: string; param: Record<string, any> }> {
  const out: Array<{ where: string; param: Record<string, any> }> = []
  for (const [pathKey, pathItem] of Object.entries(spec.paths as Record<string, any>)) {
    for (const [method, op] of Object.entries(pathItem as Record<string, any>)) {
      if (!op || typeof op !== 'object') continue
      const params = Array.isArray(op.parameters) ? op.parameters : []
      for (const param of params) {
        if (param && typeof param === 'object' && param.name) {
          out.push({ where: `${method.toUpperCase()} ${pathKey}`, param })
        }
      }
    }
  }
  return out
}

/** `slug` means an adapter only on the platform routes; other slugs differ. */
function isAdapterParam(where: string, name: string): boolean {
  // The sandbox mock-OAuth ceremony's {platform} is NOT a catalog slug: the
  // only value the route serves is the synthetic `sandbox`, pinned inline as
  // enum: ['sandbox']. Ref'ing PlatformSlug there would document ~1,500
  // values that all answer 404 ADAPTER_UNAVAILABLE.
  if (/\/test\/v1\/auth\//.test(where)) return false
  if (name === 'platform') return true
  return name === 'slug' && /\/platforms\//.test(where)
}

describe('the shared components exist', () => {
  it('defines Vertical as a nine-value enum', () => {
    const schema = spec.components.schemas.Vertical
    expect(schema).toBeDefined()
    expect(schema.enum).toHaveLength(9)
    expect(schema.enum).toContain('accounting')
    expect(schema.example).toBeDefined()
  })

  it('defines PlatformSlug once, from adapter metadata', () => {
    const schema = spec.components.schemas.PlatformSlug
    expect(schema).toBeDefined()
    expect(schema.enum.length).toBeGreaterThan(1000)
    expect(schema.example).toBeDefined()
  })

  it('excludes `shared`, which is a helper directory and not a platform', () => {
    expect(spec.components.schemas.PlatformSlug.enum).not.toContain('shared')
  })

  it('lists every slug exactly once', () => {
    const slugs = spec.components.schemas.PlatformSlug.enum as string[]
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})

describe('vertical parameters', () => {
  it('are never free text', () => {
    const offenders = allParameters()
      .filter(({ param }) => param.name === 'vertical')
      .filter(({ param }) => {
        const s = param.schema ?? {}
        return !s.$ref && !Array.isArray(s.enum)
      })
      .map(({ where }) => where)
    expect(offenders, `these declare vertical as a bare string: ${offenders.join(', ')}`).toEqual(
      [],
    )
  })
})

describe('adapter parameters', () => {
  it('reference the shared list from path params instead of inlining it', () => {
    const offenders = allParameters()
      .filter(({ where, param }) => param.in === 'path' && isAdapterParam(where, param.name))
      .filter(({ param }) => param.schema?.$ref !== PLATFORM_SLUG_REF)
      .map(({ where }) => where)
    expect(offenders, `these do not $ref PlatformSlug: ${offenders.join(', ')}`).toEqual([])
  })

  it('inline the slug list nowhere in the document', () => {
    // One definition, under components.schemas. Anything else is a copy.
    const copies: string[] = []
    const walk = (node: unknown, trail: string) => {
      if (Array.isArray(node)) {
        node.forEach((v, i) => walk(v, `${trail}[${i}]`))
        return
      }
      if (!node || typeof node !== 'object') return
      const obj = node as Record<string, unknown>
      if (
        Array.isArray(obj.enum) &&
        obj.enum.length > 500 &&
        trail !== '.components.schemas.PlatformSlug'
      ) {
        copies.push(trail)
      }
      for (const [k, v] of Object.entries(obj)) walk(v, `${trail}.${k}`)
    }
    walk(spec, '')
    expect(copies, `inline copies of a large slug list: ${copies.join(', ')}`).toEqual([])
  })

  it('stay free text as query parameters, so the CLI does not grow a 1,500-choice flag', () => {
    const enumerated = allParameters()
      .filter(({ where, param }) => param.in === 'query' && isAdapterParam(where, param.name))
      .filter(
        ({ param }) =>
          Array.isArray(param.schema?.enum) || param.schema?.$ref === PLATFORM_SLUG_REF,
      )
      .map(({ where }) => where)
    expect(enumerated).toEqual([])
  })

  it('still document what a valid value looks like when free text', () => {
    const undocumented = allParameters()
      .filter(({ where, param }) => param.in === 'query' && isAdapterParam(where, param.name))
      .filter(({ param }) => !param.description)
      .map(({ where }) => where)
    expect(
      undocumented,
      `free-text adapter params with no description: ${undocumented.join(', ')}`,
    ).toEqual([])
  })
})
