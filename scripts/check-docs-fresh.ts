#!/usr/bin/env tsx
/**
 * CI check — verifies every generated artifact is up to date with its
 * source. Regenerates the lot via `pnpm docs:all`, then fails if any
 * tracked generated file has changed.
 *
 * Covers:
 *   - `docs/openapi/openapi.json` + `.yaml`             (integration-server)
 *   - `docs/openapi/admin-api.openapi.json`             (admin-api OpenAPI generator)
 *   - `docs/postman/openapi.postman_collection.json`    (integration-server)
 *   - `docs/postman/admin-api.postman_collection.json`  (admin-api Postman generator)
 *   - `packages/sdk/src/generated/*.ts`                 (SDK codegen)
 *   - `docs/operations/cli.md`                          (os CLI codegen)
 *   - `packages/cli/src/generated/<tag>.ts`             (os CLI codegen)
 *   - `packages/cli/src/generated/index.ts`             (os CLI codegen)
 *   - `packages/cli/src/generated/manifest.json`        (os CLI codegen)
 *   - `apps/admin-api/src/core/routes/_runtime-settings-schema.generated.ts`
 *                                                       (typed runtime-settings PATCH body — built from RUNTIME_SETTINGS_SEEDS)
 *   - `.env.example`                                    (scripts/generate-env-example.ts)
 *   - everything else `pnpm docs:all` writes (api-reference, providers, env)
 *
 * Usage: pnpm run check:docs
 * Exit code 0 = artifacts are fresh, 1 = stale.
 */

import { execSync } from 'child_process'

function run(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}

function main() {
  console.log(
    'Regenerating all docs (openapi, api-reference, postman, providers, env, admin-api)...\n',
  )
  try {
    // `pnpm docs:all` chains the integration-server generators AND the
    // admin-api OpenAPI + Postman generators. A single command is the
    // source of truth so operators see one path to keep docs fresh.
    execSync('pnpm run docs:all', { stdio: 'inherit' })
  } catch {
    console.error('\n✗ docs:all failed')
    process.exit(1)
  }

  console.log('\nChecking for uncommitted changes in generated paths...\n')
  // Paths checked together so the failure message can point at the right
  // regen command. `docs/` covers OpenAPI/Postman/markdown artifacts;
  // `packages/sdk/src/generated/` covers the SDK type modules;
  // `packages/cli/src/generated/` covers the CLI command modules;
  // `apps/admin-api/src/core/routes/_runtime-settings-schema.generated.ts`
  // covers the typed PATCH body union built from RUNTIME_SETTINGS_SEEDS.
  const generatedPaths = [
    'docs/',
    'packages/sdk/src/generated/',
    'packages/cli/src/generated/',
    'apps/admin-api/src/core/routes/_runtime-settings-schema.generated.ts',
    // Emitted by scripts/generate-read-scopes.ts from
    // scripts/curated-read-scopes.json. Guarded here so the files' own
    // "do not edit by hand" banner is enforced rather than merely asserted —
    // for a long time it was asserted, and no generator existed at all.
    'apps/integration-server/src/verticals/*/platforms/read-scopes.generated.ts',
    // Emitted by scripts/generate-env-example.ts, which until now was neither
    // in `docs:all` nor checked here. CONTRIBUTING.md documented the manual
    // step and nothing enforced it, so adding an env var and running the
    // documented `pnpm docs:all` left this file stale while every check
    // stayed green. That matters more than a usually-stale artifact: this is
    // the file an operator copies to create `.env`, so a variable missing
    // from it ships as an unset default nobody was told about. Covering it
    // here also catches a hand-edit, which folding the generator into
    // `docs:all` alone would not.
    '.env.example',
    // Only its verification sentence is generated (generate-platforms-doc
    // rewrites it from the platform metadata); the rest is hand-written. A
    // README edit that is not committed yet also shows up here, locally only.
    'README.md',
  ]
  try {
    run(`git diff --exit-code -- ${generatedPaths.join(' ')}`)
    console.log('✓ All generated artifacts are up to date.')
  } catch {
    console.error('✗ Generated artifacts are out of date. The following files changed:\n')
    try {
      const diff = run(`git diff --name-only -- ${generatedPaths.join(' ')}`)
      console.error(diff)
    } catch {
      /* ignore */
    }
    console.error('\nFix: run `pnpm run docs:all` and commit.')
    process.exit(1)
  }

  console.log('\nValidating integration-guide corpus (docs/integrate/**/*.md)...\n')
  try {
    execSync('pnpm run check:guides', { stdio: 'inherit' })
  } catch {
    console.error('\n✗ check:guides failed')
    process.exit(1)
  }
}

main()
