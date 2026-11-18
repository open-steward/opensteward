import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

// Verifies the unified OpenAPI artifact and walks its schemas for the
// canonical-field constraints.
//
// Generate first: pnpm --filter integration-server run generate-openapi

const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const DOCS_ROOT = resolve(REPO_ROOT, 'docs')
const SPEC_PATH = resolve(DOCS_ROOT, 'openapi', 'openapi.json')
const VERTICALS = ['accounting', 'crm', 'ecommerce', 'logistics', 'payments', 'docsign', 'projects', 'customer-support', 'inventory']

interface OpenApiDoc {
  paths: Record<string, unknown>
  components?: { schemas?: Record<string, Record<string, unknown>>; [k: string]: unknown }
}

function readSpec(): OpenApiDoc {
  if (!existsSync(SPEC_PATH)) {
    throw new Error(`Missing: ${SPEC_PATH} — run \`pnpm --filter integration-server run generate-openapi\` first`)
  }
  return JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as OpenApiDoc
}

describe('Unified OpenAPI spec', () => {
  it('docs/openapi/openapi.json exists', () => {
    expect(existsSync(SPEC_PATH), `Missing: ${SPEC_PATH}`).toBe(true)
  })

  it('docs/openapi/openapi.yaml exists', () => {
    const yamlPath = resolve(DOCS_ROOT, 'openapi', 'openapi.yaml')
    expect(existsSync(yamlPath), `Missing: ${yamlPath}`).toBe(true)
  })

  it('every vertical contributes /{vertical}/* paths', () => {
    // The /v1 segment lives in the server URL (server-variable `version`,
    // default 'v1'). Vertical path keys are `/{vertical}/{resource}`;
    // the full URL `…:port/v1/<vertical>/<resource>` reassembles via the
    // root server template at request time.
    const spec = readSpec()
    const segments = new Set(
      Object.keys(spec.paths)
        .map((p) => p.split('/'))
        .filter((parts) => parts[1] && parts[2])
        .map((parts) => parts[1]),
    )
    for (const v of VERTICALS) {
      expect(segments.has(v), `unified spec missing /${v}/* paths`).toBe(true)
    }
  })

  it('every $ref resolves', () => {
    const spec = readSpec()
    const components = spec.components ?? {}
    const text = readFileSync(SPEC_PATH, 'utf8')
    const refs = [...text.matchAll(/"\$ref":\s*"#\/components\/([^/"]+)\/([^"]+)"/g)]
    for (const [, section, key] of refs) {
      expect(
        (components as Record<string, Record<string, unknown>>)[section]?.[key],
        `Dangling $ref: #/components/${section}/${key}`,
      ).toBeTruthy()
    }
  })

  it('every component schema has a populated definition', () => {
    const schemas = readSpec().components?.schemas ?? {}
    const empty = Object.entries(schemas)
      .filter(([, def]) => Object.keys(def ?? {}).length === 0)
      .map(([name]) => name)
    expect(empty, `schemas with empty definitions — ${empty.join(', ')}`).toEqual([])
  })

  describe('canonical schema constraints', () => {
    function walkProps(
      node: unknown,
      visit: (path: string[], key: string, prop: Record<string, unknown>) => void,
      breadcrumb: string[] = [],
    ): void {
      if (!node || typeof node !== 'object') return
      const obj = node as Record<string, unknown>
      const props = obj.properties as Record<string, Record<string, unknown>> | undefined
      if (props) {
        for (const [k, v] of Object.entries(props)) {
          visit([...breadcrumb, k], k, v)
          walkProps(v, visit, [...breadcrumb, k])
        }
      }
      if (obj.items) walkProps(obj.items, visit, breadcrumb)
      if (Array.isArray(obj.allOf)) obj.allOf.forEach((s) => walkProps(s, visit, breadcrumb))
      if (Array.isArray(obj.oneOf)) obj.oneOf.forEach((s) => walkProps(s, visit, breadcrumb))
      if (Array.isArray(obj.anyOf)) obj.anyOf.forEach((s) => walkProps(s, visit, breadcrumb))
    }

    it('every `currency` field carries the ISO 4217 constraint', () => {
      const schemas = readSpec().components?.schemas ?? {}
      const violators: string[] = []
      for (const [schemaName, schema] of Object.entries(schemas)) {
        walkProps(schema, (path, key, prop) => {
          if (key === 'currency' && prop.type === 'string') {
            if (prop.pattern !== '^[A-Z]{3}$' || prop.minLength !== 3) {
              violators.push(`${schemaName}.${path.join('.')}`)
            }
          }
        })
      }
      expect(violators, `currency fields missing ISO 4217 — ${violators.join(', ')}`).toEqual([])
    })

    it('every `country` field carries the ISO 3166-1 alpha-2 constraint', () => {
      const schemas = readSpec().components?.schemas ?? {}
      const violators: string[] = []
      for (const [schemaName, schema] of Object.entries(schemas)) {
        walkProps(schema, (path, key, prop) => {
          if (key === 'country' && prop.type === 'string') {
            if (prop.pattern !== '^[A-Z]{2}$' || prop.minLength !== 2) {
              violators.push(`${schemaName}.${path.join('.')}`)
            }
          }
        })
      }
      expect(violators, `country fields missing ISO 3166-1 alpha-2 — ${violators.join(', ')}`).toEqual([])
    })
  })

  it('docs/README.md exists', () => {
    expect(existsSync(resolve(DOCS_ROOT, 'README.md')), 'Missing: docs/README.md').toBe(true)
  })
})
