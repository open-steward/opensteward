/**
 * CI guard: every documented `example` must satisfy the schema it documents.
 *
 * `check:openapi-examples` already requires that every field HAS an example.
 * It cannot tell whether the example is right, because it reads the generated
 * JSON spec — by which point the example is just a value sitting next to a
 * loosened type. This reads the Zod schemas instead and parses each example
 * with the very node it was attached to.
 *
 * E.g. `endDate: IsoDatetime.optional().meta({ example: '2026-02-15' })` — a
 * bare date on a field that requires a full ISO datetime — publishes an
 * example the API rejects when a caller copies the documented value.
 * Fixture-building only covers verticals with a sandbox manifest, so this
 * check covers the rest.
 *
 * Run: `pnpm tsx scripts/check-schema-examples.ts` (add `--soft` to report
 * without failing). Exit 0 when every example parses, 1 otherwise.
 */
import { fileURLToPath } from 'node:url'
import { z } from 'zod'

const VERTICALS = [
  'accounting',
  'crm',
  'ecommerce',
  'logistics',
  'payments',
  'docsign',
  'projects',
  'customer-support',
  'inventory',
]

export interface ExampleProblem {
  vertical: string
  schema: string
  field: string
  example: unknown
  message: string
}

/**
 * Does `example` satisfy `node`?
 *
 * The Date case is the subtle one; getting it wrong reports phantom failures
 * on every `z.date()` field in the repo. JSON has no Date type,
 * so a `z.date()` field is an ISO STRING on the wire and its example
 * documents the wire format — correctly. A typed client revives before
 * parsing; so does this. Without that step every `createdAt` in the repo
 * looks broken and the two real problems are lost in the noise.
 */
function accepts(node: z.ZodType, example: unknown): { ok: true } | { ok: false; message: string } {
  const direct = node.safeParse(example)
  if (direct.success) return { ok: true }
  if (typeof example === 'string') {
    const revived = new Date(example)
    if (!Number.isNaN(revived.getTime()) && node.safeParse(revived).success) return { ok: true }
  }
  return { ok: false, message: direct.error.issues[0]?.message ?? 'did not parse' }
}

export async function checkSchemaExamples(
  verticals: string[] = VERTICALS,
): Promise<{ problems: ExampleProblem[]; checked: number }> {
  const problems: ExampleProblem[] = []
  let checked = 0

  for (const vertical of verticals) {
    const barrel = new URL(
      `../apps/integration-server/src/verticals/${vertical}/schema/index.ts`,
      import.meta.url,
    ).href
    const mod: Record<string, unknown> = await import(barrel)

    for (const [name, exported] of Object.entries(mod)) {
      const shape = (exported as { shape?: Record<string, z.ZodType> })?.shape
      if (!shape) continue

      for (const [field, node] of Object.entries(shape)) {
        const meta = z.globalRegistry.get(node) as { example?: unknown } | undefined
        if (!meta || !('example' in meta)) continue
        const example = meta.example
        // `null` means "documented as absent" rather than a value to validate.
        // Accounting's `cancelledAt` is `.optional()` but not `.nullable()`
        // and documents `null`; the fixture builder omits the field, which is
        // the honest reading. Flagging it here would be noise, not a finding.
        if (example === null || example === undefined) continue

        checked += 1
        const verdict = accepts(node, example)
        if (!verdict.ok) {
          problems.push({ vertical, schema: name, field, example, message: verdict.message })
        }
      }
    }
  }
  return { problems, checked }
}

async function main(): Promise<void> {
  const soft = process.argv.includes('--soft')
  const { problems, checked } = await checkSchemaExamples()

  if (problems.length === 0) {
    console.log(`✓ schema examples: all ${checked} documented examples satisfy their own schema.`)
    return
  }

  console.error(`✗ schema examples: ${problems.length} of ${checked} rejected by their own schema.`)
  for (const p of problems) {
    console.error(
      `    ${p.vertical}/${p.schema}.${p.field}: ${JSON.stringify(p.example)} — ${p.message}`,
    )
  }
  console.error(
    '\nThese ship in the published Unified API reference, so a caller copying the ' +
      'documented value sends something the API rejects. Fix the example, ' +
      'or the field type if the example is what the platform really returns.',
  )
  if (!soft) process.exitCode = 1
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) void main()
