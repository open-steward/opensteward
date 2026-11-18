/**
 * Gate: every leaf property of every component in both generated OpenAPI specs
 * must carry an `example`. Run after `pnpm docs:openapi && pnpm docs:admin-api-openapi`.
 *
 *   pnpm check:openapi-examples
 *
 * Exits non-zero and prints the offending `Component.field` paths when any
 * component property lacks an example, so new fields can't ship example-less.
 */
import fs from 'node:fs'
import path from 'node:path'
import { findUncoveredExamples } from '../packages/shared/src/openapi/example-coverage'

const SPECS = [
  { label: 'dev API', file: 'docs/openapi/openapi.json' },
  { label: 'admin API', file: 'docs/openapi/admin-api.openapi.json' },
]

const repoRoot = path.resolve(__dirname, '..')
let total = 0

for (const { label, file } of SPECS) {
  const abs = path.join(repoRoot, file)
  if (!fs.existsSync(abs)) {
    console.error(`✗ ${label}: spec not found at ${file} — run the generators first.`)
    total += 1
    continue
  }
  const spec = JSON.parse(fs.readFileSync(abs, 'utf8')) as Parameters<
    typeof findUncoveredExamples
  >[0]
  const gaps = findUncoveredExamples(spec)
  if (gaps.length === 0) {
    console.log(`✓ ${label}: every component field has an example (${file}).`)
    continue
  }
  total += gaps.length
  console.error(`✗ ${label}: ${gaps.length} field(s) missing an example (${file}):`)
  const byComponent = new Map<string, string[]>()
  for (const g of gaps) {
    if (!byComponent.has(g.component)) byComponent.set(g.component, [])
    byComponent.get(g.component)!.push(g.path)
  }
  for (const [component, paths] of [...byComponent].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.error(`    ${component}: ${paths.join(', ')}`)
  }
}

if (total > 0) {
  console.error(`\n${total} missing example(s). Add \`.meta({ example: … })\` to each field.`)
  process.exit(1)
}
console.log('\nAll OpenAPI component fields have examples.')
