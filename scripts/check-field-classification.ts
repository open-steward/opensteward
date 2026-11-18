#!/usr/bin/env node
/**
 * CI guard: every stored resource type has a field classification, and no
 * personal-looking field is classified as harmless.
 *
 * The data viewer, exports and destinations read stored records through
 * `applyMasking` (packages/shared/src/data-classification). What they mask is
 * decided by the per-vertical sidecars in
 * `apps/integration-server/src/verticals/<v>/schema/classification.ts`,
 * aggregated in `apps/integration-server/src/data-access/classification-registry.ts`.
 * A resource type with no sidecar entry is served fully masked (fail closed),
 * and a PII field left `internal` is served in clear — neither is something a
 * reviewer would spot in a diff that only adds a listable resource or a field.
 *
 * Violations:
 *   missing-classification  a listable (vertical, resourceType) has no entry
 *   missing-schema          …or no canonical schema in RESOURCE_SCHEMAS
 *   orphan-classification   an entry for a type the sync worker never stores
 *   unknown-field           a classified path whose top-level field is not in
 *                           the schema (a typo classifies nothing)
 *   sensitive-unclassified  a top-level field named like personal data
 *                           (SENSITIVE_NAME) whose effective class is
 *                           public/internal, and is not allow-listed
 *   stale-allowlist         an allow-list entry that no longer matches a
 *                           public/internal field
 *
 * Run: `pnpm check:field-classification` (`:soft` reports without failing).
 */
import { fileURLToPath } from 'node:url'
import {
  effectiveFieldClass,
  type ResourceClassification,
} from '../packages/shared/src/data-classification/index.ts'

/** Field names that almost always hold personal data. */
export const SENSITIVE_NAME = /email|phone|first_?name|last_?name|address|iban|tax_?id|birth|ssn/i

/**
 * `vertical/resourceType/field` → why the field may stay public/internal.
 * Every entry must still match a field the guard would otherwise flag.
 */
export const ALLOWLIST: ReadonlyMap<string, string> = new Map([
  ['ecommerce/locations/address', "the merchant's own store or warehouse"],
  ['ecommerce/locations/phone', "the merchant's own store or warehouse"],
  ['logistics/warehouses/address', "the merchant's own warehouse"],
  ['inventory/locations/address', "the merchant's own warehouse"],
])

export interface VerticalInput {
  classification: Record<string, ResourceClassification>
  schemas: Record<string, { shape: Record<string, unknown> }>
  listable: ReadonlyArray<{ resourceType: string }>
}

export type ViolationKind =
  | 'missing-classification'
  | 'missing-schema'
  | 'orphan-classification'
  | 'unknown-field'
  | 'sensitive-unclassified'
  | 'stale-allowlist'

export interface Violation {
  kind: ViolationKind
  id: string
  detail: string
}

export function checkFieldClassification(
  verticals: Readonly<Record<string, VerticalInput>>,
  allowlist: ReadonlyMap<string, string> = ALLOWLIST,
): { violations: Violation[]; checked: number } {
  const violations: Violation[] = []
  const usedAllow = new Set<string>()
  let checked = 0
  for (const [vertical, v] of Object.entries(verticals)) {
    const listable = new Set(v.listable.map((r) => r.resourceType))
    for (const type of Object.keys(v.classification)) {
      if (!listable.has(type)) {
        violations.push({
          kind: 'orphan-classification',
          id: `${vertical}/${type}`,
          detail: 'classified, but not in sync/listable-resources.ts',
        })
      }
    }
    for (const type of listable) {
      checked++
      const id = `${vertical}/${type}`
      const cls = Object.hasOwn(v.classification, type) ? v.classification[type] : undefined
      const schema = Object.hasOwn(v.schemas, type) ? v.schemas[type] : undefined
      if (!cls) {
        violations.push({
          kind: 'missing-classification',
          id,
          detail: 'no entry in schema/classification.ts CLASSIFICATION',
        })
      }
      if (!schema) {
        violations.push({
          kind: 'missing-schema',
          id,
          detail: 'no entry in schema/classification.ts RESOURCE_SCHEMAS',
        })
      }
      if (!cls || !schema) continue
      const fields = Object.keys(schema.shape)
      for (const path of Object.keys(cls)) {
        if (path === '*') continue
        const head = path.split('.')[0]!.replace(/\[\]$/, '')
        if (head !== '*' && !fields.includes(head)) {
          violations.push({
            kind: 'unknown-field',
            id: `${id}/${path}`,
            detail: `'${head}' is not a field of the schema`,
          })
        }
      }
      for (const field of fields) {
        if (!SENSITIVE_NAME.test(field)) continue
        const effective = effectiveFieldClass(field, cls)
        if (effective !== 'public' && effective !== 'internal') continue
        const key = `${id}/${field}`
        if (allowlist.has(key)) {
          usedAllow.add(key)
          continue
        }
        violations.push({
          kind: 'sensitive-unclassified',
          id: key,
          detail: `named like personal data but classified '${effective}'`,
        })
      }
    }
  }
  for (const key of allowlist.keys()) {
    if (!usedAllow.has(key)) {
      violations.push({
        kind: 'stale-allowlist',
        id: key,
        detail: 'allow-listed, but no longer a public/internal field — remove the entry',
      })
    }
  }
  return { violations, checked }
}

async function main(): Promise<void> {
  const soft = process.argv.includes('--soft')
  const { VERTICAL_CLASSIFICATIONS } =
    await import('../apps/integration-server/src/data-access/classification-registry.ts')
  const { violations, checked } = checkFieldClassification(VERTICAL_CLASSIFICATIONS)
  if (violations.length === 0) {
    console.log(
      `OK — ${checked} listable resource types across ${Object.keys(VERTICAL_CLASSIFICATIONS).length} verticals are classified.`,
    )
    return
  }
  console.error(`\n${violations.length} field-classification violation(s):\n`)
  for (const v of violations) console.error(`  [${v.kind}] ${v.id} — ${v.detail}`)
  console.error(
    `\nClassify the field in apps/integration-server/src/verticals/<v>/schema/classification.ts\n` +
      `(see docs/security/data-classification.md). A field that genuinely is not personal data\n` +
      `goes in ALLOWLIST in scripts/check-field-classification.ts, with the reason.\n`,
  )
  if (!soft) process.exitCode = 1
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  main().catch((err: unknown) => {
    console.error(err)
    process.exitCode = 1
  })
}
