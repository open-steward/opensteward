/**
 * Package tests that read licensing files from outside their package must re-run when those
 * files change.
 *
 * CI runs `turbo run test` with a restored `.turbo` cache, and a package's `test` hash covers
 * only its turbo inputs (root turbo.json: src/, tests/, the vitest config). admin's System page
 * test checks that the license guide names every INVALID reason and error code; shared's doctor
 * test checks that the guide names every doctor row and follows the repository's
 * docker-compose.yml; shared's licensing tests load the dev1 keypair fixture. Without those files
 * in the package's inputs, a docs-only change replays a cached green result and the check never
 * runs. Each package's own turbo.json adds them, after `$TURBO_EXTENDS$`, which keeps the root
 * inputs: without it the package's inputs would be these files alone, and a source change would
 * replay a cached result instead.
 *
 * Run: `pnpm exec tsx --test scripts/license-turbo-inputs.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

const REPO_ROOT = join(import.meta.dirname, '..')

/** package dir -> repository file it reads -> the test files that read it. */
const READS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  'apps/admin': {
    'docs/deployment/license.md': ['tests/journeys/system-page.test.ts'],
  },
  'packages/shared': {
    'docs/deployment/license.md': ['tests/scripts/doctor.test.ts'],
    'docker-compose.yml': ['tests/scripts/doctor.test.ts'],
    'packages/license-token/fixtures/dev1.json': ['tests/licensing/helpers.ts'],
  },
}

interface TurboJson {
  extends?: string[]
  tasks?: { test?: { inputs?: string[] } }
}

const testInputs = (pkg: string): string[] => {
  const file = join(REPO_ROOT, pkg, 'turbo.json')
  assert.ok(existsSync(file), `${pkg}/turbo.json is missing`)
  const turbo = JSON.parse(readFileSync(file, 'utf8')) as TurboJson
  assert.deepEqual(turbo.extends, ['//'], `${pkg}/turbo.json must extend the root turbo.json`)
  return turbo.tasks?.test?.inputs ?? []
}

for (const [pkg, reads] of Object.entries(READS)) {
  test(`${pkg}: test inputs keep the root ones ($TURBO_EXTENDS$ first)`, () => {
    assert.equal(testInputs(pkg)[0], '$TURBO_EXTENDS$')
  })

  test(`${pkg}: test inputs list every licensing file its tests read`, () => {
    const inputs = testInputs(pkg)
    for (const file of Object.keys(reads)) {
      assert.ok(existsSync(join(REPO_ROOT, file)), `${file} does not exist`)
      assert.ok(
        inputs.includes(`$TURBO_ROOT$/${file}`),
        `${pkg}/turbo.json test.inputs lacks "$TURBO_ROOT$/${file}"`,
      )
    }
  })

  test(`${pkg}: the tests named here still read those files`, () => {
    for (const [file, readers] of Object.entries(reads)) {
      for (const reader of readers) {
        const src = readFileSync(join(REPO_ROOT, pkg, reader), 'utf8')
        assert.ok(src.includes(basename(file)), `${pkg}/${reader} no longer mentions ${file}`)
      }
    }
  })
}
