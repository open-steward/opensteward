/**
 * Gate test: every component field in both generated OpenAPI specs must carry
 * an example. Runs under `pnpm test` (and therefore CI). If this fails, run
 * `pnpm check:openapi-examples` locally to see the exact `Component.field`
 * paths, then add `.meta({ example: … })` to each and regenerate the specs.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { findUncoveredExamples } from '../src/openapi/example-coverage'

const repoRoot = join(__dirname, '..', '..', '..')
const SPECS = [
  { label: 'dev API', file: 'docs/openapi/openapi.json' },
  { label: 'admin API', file: 'docs/openapi/admin-api.openapi.json' },
]

describe('OpenAPI example coverage', () => {
  for (const { label, file } of SPECS) {
    it(`${label}: every component field has an example`, () => {
      const spec = JSON.parse(readFileSync(join(repoRoot, file), 'utf8'))
      const gaps = findUncoveredExamples(spec)
      // Surface the first handful of offenders in the failure message.
      const preview = gaps.slice(0, 20).map((g) => `${g.component}.${g.path}`).join(', ')
      expect(gaps, `${gaps.length} field(s) missing examples: ${preview}`).toEqual([])
    })
  }
})
