#!/usr/bin/env tsx
/**
 * Generates the SDK's `paths` type modules from the two committed OpenAPI
 * specs. This is a pure pipeline — every byte of TypeScript under
 * `packages/sdk/src/generated/` is emitted by `openapi-typescript` against
 * the spec files. We never edit the generated modules by hand.
 *
 *   docs/openapi/openapi.json            → src/generated/public-types.ts
 *   docs/openapi/admin-api.openapi.json  → src/generated/operator-types.ts
 *
 * Usage:
 *   pnpm --filter @opensteward/sdk run generate
 *   pnpm sdk:generate           (root alias, chained into pnpm docs:all)
 *
 * Drift gate: `pnpm check:docs` regenerates these and fails the build if
 * the working tree under `packages/sdk/src/generated/` changes.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { createConfig } from '@redocly/openapi-core'
import openapiTS, { astToString } from 'openapi-typescript'
import * as prettier from 'prettier'

interface SpecJob {
  /** Human label printed to stdout. */
  label: string
  /** Absolute path to the OpenAPI source spec. */
  specPath: string
  /** Absolute path of the TS module to emit. */
  outPath: string
  /**
   * If true, allow duplicate `operationId`s when bundling the spec.
   *
   * The public integration-server spec (`docs/openapi/openapi.json`)
   * contains duplicate `operationId`s across verticals (e.g. `listUsers`
   * in customer-support vs `listUsers` elsewhere). Type emission
   * tolerates them — only client-code generators (which key off
   * operationId) care, and `openapi-fetch` keys off the path string.
   */
  allowDuplicateOperationIds?: boolean
  /**
   * Also emit the set of path keys that are ABSOLUTE — the ones the spec
   * generator left un-stripped and marked `x-opensteward-servers:
   * 'unversioned'`.
   *
   * The public spec carries paths in two namespaces. Versioned resources have
   * their `/v1/` stripped from the key and re-supplied by the root server
   * template, so `/accounting/invoices` in the types is `/v1/accounting/
   * invoices` on the wire. `/admin/*`, `/auth/*`, `/health` and the sandbox
   * control routes keep their absolute key. A client that prefixes the
   * version has to know which is which, and the marker is the only thing that
   * distinguishes them once the spec is serialized.
   */
  emitUnversionedPaths?: string
}

const REPO_ROOT = path.resolve(__dirname, '../../..')

const JOBS: SpecJob[] = [
  {
    label: 'public (integration-server)',
    specPath: path.join(REPO_ROOT, 'docs/openapi/openapi.json'),
    outPath: path.join(REPO_ROOT, 'packages/sdk/src/generated/public-types.ts'),
    allowDuplicateOperationIds: true,
    emitUnversionedPaths: path.join(REPO_ROOT, 'packages/sdk/src/generated/public-unversioned.ts'),
  },
  {
    label: 'operator (admin-api)',
    specPath: path.join(REPO_ROOT, 'docs/openapi/admin-api.openapi.json'),
    outPath: path.join(REPO_ROOT, 'packages/sdk/src/generated/operator-types.ts'),
  },
]

// Header prepended to every emitted module so reviewers spot the
// generator + spec in `git blame` without opening the script.
function header(specRelPath: string): string {
  return [
    '/**',
    ' * @opensteward/sdk — generated module. DO NOT EDIT.',
    ' *',
    ` * Source: ${specRelPath}`,
    ' * Generator: packages/sdk/scripts/sdk-codegen.ts (openapi-typescript)',
    ' *',
    ' * Regenerate via `pnpm sdk:generate` (also runs as part of',
    ' * `pnpm docs:all`). CI fails if this file drifts from the source spec.',
    ' */',
    '',
    '',
  ].join('\n')
}

/**
 * Runs generated TypeScript through the repo's own prettier config before
 * it hits disk. `check:warning-gates prettier` and `check:docs` both treat
 * this file as source of truth — formatting it after the fact (either by
 * hand or via a separate `prettier --write` pass) would just be undone by
 * the next `pnpm sdk:generate`, so the emitter has to produce clean output
 * itself. `resolveConfig` walks up from `outPath` and picks up the repo
 * root `.prettierrc` the same way the CLI does.
 */
async function formatTypeScript(source: string, outPath: string): Promise<string> {
  const config = await prettier.resolveConfig(outPath)
  return prettier.format(source, { ...config, filepath: outPath, parser: 'typescript' })
}

async function runJob(job: SpecJob): Promise<void> {
  // openapi-typescript's default Redocly preset elevates
  // `operation-operationId-unique` to `error`. We toggle that per-job
  // so the public spec (which contains duplicate operationIds) still
  // emits, while admin-api keeps the strict default.
  const redocly = await createConfig(
    {
      rules: {
        'operation-operationId-unique': {
          severity: job.allowDuplicateOperationIds ? 'off' : 'error',
        },
      },
    },
    { extends: ['minimal'] },
  )

  // Pre-pass: if the spec carries duplicate `operationId`s (the public
  // integration-server spec ships some `listUsers`/`getUser`
  // collisions across verticals), the emitted `operations` interface
  // would hold duplicate keys and refuse to typecheck. Mint unique
  // suffixes on the duplicates before generation; the `paths`
  // interface still reads naturally because openapi-fetch keys off
  // the path string, not the operationId.
  let ast
  if (job.allowDuplicateOperationIds) {
    const raw = readFileSync(job.specPath, 'utf8')
    const deduped = deduplicateOperationIds(JSON.parse(raw) as OpenApiDocument)
    // openapi-typescript accepts an in-memory `OpenAPI3` object;
    // cast through `unknown` since our local typing is narrower than
    // the library's full schema shape.
    ast = await openapiTS(deduped as unknown as Parameters<typeof openapiTS>[0], {
      redocly,
      cwd: new URL(`file://${path.dirname(job.specPath)}/`),
    })
  } else {
    ast = await openapiTS(new URL(`file://${job.specPath}`), { redocly })
  }
  const body = astToString(ast)

  const specRelPath = path.relative(REPO_ROOT, job.specPath)
  const out = header(specRelPath) + body
  const formatted = await formatTypeScript(out, job.outPath)
  mkdirSync(path.dirname(job.outPath), { recursive: true })
  writeFileSync(job.outPath, formatted)
  console.log(`✓ ${job.label.padEnd(28)} → ${path.relative(process.cwd(), job.outPath)}`)

  if (job.emitUnversionedPaths) {
    const spec = JSON.parse(readFileSync(job.specPath, 'utf8')) as OpenApiDocument
    const absolute = Object.entries(spec.paths ?? {})
      .filter(
        ([, item]) =>
          (item as { 'x-opensteward-servers'?: unknown })['x-opensteward-servers'] ===
          'unversioned',
      )
      .map(([key]) => key)
      .sort()
    const module =
      header(specRelPath) +
      [
        '',
        '/**',
        ' * Path keys that are already absolute and must NOT be prefixed with the',
        ' * API version. Everything else in `paths` had its `/v1/` stripped by the',
        ' * spec generator and needs it back.',
        ' */',
        'export const UNVERSIONED_PATHS: ReadonlySet<string> = new Set([',
        ...absolute.map((k) => `  '${k}',`),
        '])',
        '',
      ].join('\n')
    const formattedModule = await formatTypeScript(module, job.emitUnversionedPaths)
    writeFileSync(job.emitUnversionedPaths, formattedModule)
    console.log(
      `✓ ${'unversioned path set'.padEnd(28)} → ${path.relative(process.cwd(), job.emitUnversionedPaths)} (${absolute.length})`,
    )
  }
}

interface OpenApiOperation {
  operationId?: string
  [key: string]: unknown
}
interface OpenApiPathItem {
  [verb: string]: OpenApiOperation | undefined
}
interface OpenApiDocument {
  paths?: Record<string, OpenApiPathItem>
  [key: string]: unknown
}

/**
 * Rewrites duplicate `operationId`s to a unique form by appending a
 * tag-prefix (or numeric suffix as a fallback). Pure transform —
 * the input document is not mutated; a deep-cloned copy is returned.
 */
function deduplicateOperationIds(doc: OpenApiDocument): OpenApiDocument {
  const cloned = JSON.parse(JSON.stringify(doc)) as OpenApiDocument
  const seen = new Map<string, number>()
  const httpVerbs = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

  for (const [_pathKey, pathItem] of Object.entries(cloned.paths ?? {})) {
    if (!pathItem) continue
    for (const [verb, op] of Object.entries(pathItem)) {
      if (!httpVerbs.has(verb) || !op || typeof op !== 'object') continue
      const id = op.operationId
      if (!id) continue
      const count = (seen.get(id) ?? 0) + 1
      seen.set(id, count)
      if (count > 1) {
        // Append the first segment of the path (vertical) to disambiguate,
        // falling back to a numeric counter if even that collides.
        const candidate = `${id}_${count}`
        op.operationId = candidate
      }
    }
  }
  return cloned
}

async function main(): Promise<void> {
  for (const job of JOBS) {
    await runJob(job)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
