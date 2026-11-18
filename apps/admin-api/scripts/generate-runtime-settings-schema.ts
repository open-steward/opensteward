#!/usr/bin/env tsx
/**
 * Generates `apps/admin-api/src/core/routes/_runtime-settings-schema.generated.ts`
 * from `RUNTIME_SETTINGS_SEEDS` — the canonical inventory of admin-tunable
 * runtime settings.
 *
 * Output shape: a Zod discriminated union keyed on `key`, with ONE BRANCH
 * PER VALUE SHAPE rather than one per setting. Every number-valued setting
 * shares a branch whose `key` is the enum of those settings and whose
 * `value` is `z.number()`; likewise boolean, free string, JSON, and each
 * closed vocabulary. The PATCH /api/runtime-settings/{key} route imports
 * this directly, so Swagger UI's "Try it out" still offers a number input
 * for `rate_limit.api_key.per_minute` and a checkbox for
 * `auth.local_login_enabled` — a branch per setting bought nothing over
 * that except 29 near-identical components in the spec.
 *
 * Codegen, not hand-authored, so adding a new seed in
 * `runtime-settings-store.ts` is the ONLY place a new tunable needs to
 * be declared. CI re-runs this via `pnpm docs:all` and fails on drift
 * via `scripts/check-docs-fresh.ts`.
 *
 * Usage: `pnpm --filter admin-api generate:runtime-settings-schema`
 *        (also wired as `pnpm runtime-settings:generate` at the repo
 *         root and chained into `pnpm docs:all`).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  RUNTIME_SETTINGS_SEEDS,
  type RuntimeSettingSeed,
} from '../src/core/db/runtime-settings-store'

/**
 * Stable component-id slug for a setting key. The OpenAPI spec doesn't
 * tolerate dots in `$ref` names, so `openapi.servers.port` becomes
 * `OpenapiServersPort`. The slug is also used in JSDoc to make grepping
 * the generated file painless.
 */
function pascalSlug(key: string): string {
  return key
    .split(/[.\-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

/**
 * Maps a seed `valueType` to the matching Zod expression for the
 * `value` field on its branch. Seeds with the same expression share a
 * branch, so this string is also the grouping key.
 *
 *   number  → `z.number()`
 *   boolean → `z.boolean()`
 *   string  → `z.string()`, or `z.enum([…])` for a closed vocabulary
 *   json    → `z.unknown()`   (json bucket holds arbitrary nested
 *                              shapes — openapi.servers.* etc. — so
 *                              we type it as unknown to keep the
 *                              spec permissive on that field while
 *                              the route handler does the deeper
 *                              `validateServerVariables` check.)
 */
function valueExpr(seed: RuntimeSettingSeed): string {
  switch (seed.valueType) {
    case 'number':
      return 'z.number()'
    case 'boolean':
      return 'z.boolean()'
    case 'string':
      // A seed with a closed vocabulary becomes a real enum, so an
      // out-of-range value is refused at the spec boundary instead of being
      // persisted and then silently ignored by every consumer. It also gives
      // Swagger UI and the generated SDK/CLI a dropdown rather than a text box.
      return seed.enumValues
        ? `z.enum([${seed.enumValues.map((v) => JSON.stringify(v)).join(', ')}])`
        : 'z.string()'
    case 'json':
      return 'z.unknown()'
  }
}

interface Branch {
  /** Component id, `UpdateRuntimeSettingBody<Shape>`. */
  id: string
  /** Human label for the value shape, e.g. `number`, `enum`. */
  shape: string
  expr: string
  seeds: RuntimeSettingSeed[]
}

/**
 * Seeds bucketed by value expression, in first-seen order so the generated
 * file is stable across runs.
 *
 * Ids: a shared shape is named after it (`…Number`, `…Boolean`, `…String`,
 * `…Json`); a closed vocabulary is its own shape and, since it belongs to
 * one setting, keeps that setting's slug (`…LogosSource`) — the same id it
 * had when every setting was a branch.
 */
function groupBranches(seeds: readonly RuntimeSettingSeed[]): Branch[] {
  const byExpr = new Map<string, Branch>()
  for (const seed of seeds) {
    const expr = valueExpr(seed)
    let branch = byExpr.get(expr)
    if (!branch) {
      const isEnum = expr.startsWith('z.enum(')
      const shape = isEnum ? 'enum' : seed.valueType
      const id = isEnum
        ? `UpdateRuntimeSettingBody${pascalSlug(seed.key)}`
        : `UpdateRuntimeSettingBody${pascalSlug(seed.valueType)}`
      branch = { id, shape, expr, seeds: [] }
      byExpr.set(expr, branch)
    }
    branch.seeds.push(seed)
  }
  return [...byExpr.values()]
}

function emit(): string {
  const branches = groupBranches(RUNTIME_SETTINGS_SEEDS)
  const lines: string[] = []
  lines.push('/**')
  lines.push(' * GENERATED FILE — DO NOT EDIT.')
  lines.push(' *')
  lines.push(' * Source: apps/admin-api/src/core/db/runtime-settings-store.ts')
  lines.push(' *         (RUNTIME_SETTINGS_SEEDS)')
  lines.push(' * Generator: apps/admin-api/scripts/generate-runtime-settings-schema.ts')
  lines.push(' *')
  lines.push(' * Regenerate via `pnpm runtime-settings:generate` (also runs as part')
  lines.push(' * of `pnpm docs:all`). CI fails if this file drifts from the source')
  lines.push(' * inventory — see `scripts/check-docs-fresh.ts`.')
  lines.push(' */')
  lines.push("import { z } from 'zod'")
  lines.push("import 'fastify-zod-openapi'")
  lines.push('')
  lines.push('/**')
  lines.push(' * Every known runtime-setting key. Mirrors RUNTIME_SETTINGS_SEEDS so')
  lines.push(' * the path-parameter validator on PATCH/DELETE /api/runtime-settings/{key}')
  lines.push(' * surfaces the choice list in Swagger UI.')
  lines.push(' */')
  lines.push('export const RUNTIME_SETTING_KEYS = [')
  for (const seed of RUNTIME_SETTINGS_SEEDS) {
    lines.push(`  ${JSON.stringify(seed.key)},`)
  }
  lines.push('] as const')
  lines.push('')
  lines.push('export type RuntimeSettingKey = (typeof RUNTIME_SETTING_KEYS)[number]')
  lines.push('')
  lines.push('export const RuntimeSettingKeyParam = z.object({')
  lines.push('  key: z')
  lines.push('    .enum(RUNTIME_SETTING_KEYS)')
  lines.push("    .meta({ description: 'Runtime-setting key — one of the seeded inventory.' }),")
  lines.push("}).meta({ id: 'RuntimeSettingKeyParam' })")
  lines.push('')
  lines.push('// ── Body branches, one per value shape ──────────────────────────────')
  lines.push('//')
  lines.push('// Settings that take the same kind of value share a branch: `key` is')
  lines.push('// the enum of those settings, `value` is typed once. Swagger UI, the')
  lines.push('// SDK and the CLI still get a real type per shape — a number input,')
  lines.push('// a checkbox, a dropdown — without a component per setting.')
  lines.push('')

  for (const branch of branches) {
    const keys = branch.seeds.map((s) => s.key)
    const first = branch.seeds[0]!
    const keyList = branch.seeds
      .map((s) => `- \`${s.key}\` — ${s.description.replace(/`/g, '\\`')}`)
      .join('\n')
    const keyDesc =
      `Setting key being updated; must equal the \`{key}\` path parameter. ` +
      `The ${branch.shape}-valued settings:\n${keyList}`
    const valueDesc = `New value for the setting named in \`key\` (${branch.shape}).`
    const description =
      keys.length === 1
        ? `Update body for runtime setting \`${first.key}\` (${branch.shape}). ${first.description.replace(/`/g, '\\`')}`
        : `Update body for the ${keys.length} ${branch.shape}-valued runtime settings: ${keys.map((k) => `\`${k}\``).join(', ')}.`
    lines.push(`/** ${branch.shape}: ${keys.join(', ')} */`)
    lines.push(`export const ${branch.id} = z`)
    lines.push('  .object({')
    lines.push(
      `    key: z.enum([${keys.map((k) => JSON.stringify(k)).join(', ')}]).meta({ description: ${JSON.stringify(keyDesc)}, example: ${JSON.stringify(first.key)} }),`,
    )
    lines.push(
      `    value: ${branch.expr}.meta({ description: ${JSON.stringify(valueDesc)}, example: ${JSON.stringify(first.defaultValue)} }),`,
    )
    lines.push('  })')
    lines.push(
      `  .meta({ id: ${JSON.stringify(branch.id)}, description: ${JSON.stringify(description)} })`,
    )
    lines.push('')
  }

  lines.push('// ── Discriminated union ─────────────────────────────────────────────')
  lines.push('//')
  lines.push("// `discriminatedUnion('key', […])` gives us spec-level enforcement that")
  lines.push("// the body's `value` matches the seed's `valueType`. The route handler")
  lines.push("// also asserts the body's `key` equals the path `:key` so the two can")
  lines.push('// never disagree.')
  lines.push('export const UpdateRuntimeSettingBody = z')
  lines.push("  .discriminatedUnion('key', [")
  for (const branch of branches) {
    lines.push(`    ${branch.id},`)
  }
  lines.push('  ])')
  lines.push('  .meta({')
  lines.push("    id: 'UpdateRuntimeSettingBody',")
  lines.push('    description:')
  lines.push(
    "      'PATCH body for /api/runtime-settings/{key}. Discriminated on `key`, one branch per value shape, so the `value` field is typed as number / boolean / string / a closed vocabulary / unknown for JSON.',",
  )
  lines.push('    override: ({ jsonSchema }) => {')
  lines.push('      jsonSchema.discriminator = {')
  lines.push("        propertyName: 'key',")
  lines.push('        mapping: {')
  for (const branch of branches) {
    for (const seed of branch.seeds) {
      lines.push(
        `          ${JSON.stringify(seed.key)}: ${JSON.stringify(`#/components/schemas/${branch.id}`)},`,
      )
    }
  }
  lines.push('        },')
  lines.push('      }')
  lines.push('    },')
  lines.push('  })')
  lines.push('')
  lines.push('/**')
  lines.push(' * The branches and the keys each covers — exposed for the unit test that')
  lines.push(' * pins the generator output to RUNTIME_SETTINGS_SEEDS: every key in')
  lines.push(' * exactly one branch, in inventory order.')
  lines.push(' */')
  lines.push('export const UPDATE_RUNTIME_SETTING_BRANCHES = [')
  for (const branch of branches) {
    lines.push(
      `  { id: ${JSON.stringify(branch.id)}, shape: ${JSON.stringify(branch.shape)}, keys: [${branch.seeds.map((s) => JSON.stringify(s.key)).join(', ')}] },`,
    )
  }
  lines.push('] as const')
  lines.push('')
  lines.push(`export const UPDATE_RUNTIME_SETTING_BRANCH_COUNT = ${branches.length}`)
  lines.push('')
  return lines.join('\n')
}

function main(): void {
  const outDir = path.resolve(__dirname, '../src/core/routes')
  mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, '_runtime-settings-schema.generated.ts')
  writeFileSync(outPath, emit())
  const rel = path.relative(process.cwd(), outPath)
  const branches = groupBranches(RUNTIME_SETTINGS_SEEDS)
  console.log(
    `✓ wrote ${rel} (${branches.length} branches covering ${RUNTIME_SETTINGS_SEEDS.length} settings)`,
  )
}

main()
