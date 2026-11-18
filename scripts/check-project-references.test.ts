/**
 * Tests for the project-reference guard.
 *
 * Pins the two regressions it exists to stop — a vertical with no project,
 * and a `build`/`typecheck` script reverted to a bare `tsc` — plus the
 * comment-stripping bug that once made the guard report every vertical as
 * unconfigured.
 *
 * Run: `pnpm exec tsx --test scripts/check-project-references.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findProblems, parseTsConfig } from './check-project-references.ts'

const solution = {
  files: [],
  references: [
    { path: './tsconfig.kernel.json' },
    { path: './tsconfig.crm.json' },
    { path: './tsconfig.app.json' },
  ],
}
const app = {
  references: [{ path: './tsconfig.kernel.json' }, { path: './tsconfig.crm.json' }],
}
const crm = {
  include: ['src/verticals/crm/**/*', 'src/types/**/*'],
  references: [{ path: './tsconfig.kernel.json' }],
}
const wired = () =>
  new Map([
    ['tsconfig.json', solution],
    ['tsconfig.app.json', app],
    ['tsconfig.crm.json', crm],
  ])
const scripts = { build: 'tsc -b', typecheck: 'tsc -b' }

test('keeps an include glob that looks like a block comment', () => {
  // `src/verticals/crm/**/*` contains `/*` and `*/`. A naive stripper eats it
  // and the guard then reports every vertical as unconfigured.
  const cfg = parseTsConfig('{ "include": ["src/verticals/crm/**/*"] }')
  assert.deepEqual(cfg.include, ['src/verticals/crm/**/*'])
})

test('still strips real comments', () => {
  assert.deepEqual(parseTsConfig('{\n // note\n /* block */ "files": []\n}').files, [])
})

test('passes a correctly wired app', () => {
  assert.deepEqual(findProblems(['crm'], wired(), scripts), [])
})

test('flags a vertical with no project file', () => {
  const configs = wired()
  configs.delete('tsconfig.crm.json')
  assert.ok(
    findProblems(['crm'], configs, scripts).some(
      (p) => p.where === 'tsconfig.crm.json' && p.detail.includes('no project file'),
    ),
  )
})

test('flags a vertical the solution never references', () => {
  const configs = wired()
  configs.set('tsconfig.json', {
    files: [],
    references: [{ path: './tsconfig.kernel.json' }, { path: './tsconfig.app.json' }],
  })
  assert.ok(
    findProblems(['crm'], configs, scripts).some(
      (p) => p.where === 'tsconfig.json' && p.detail === 'does not reference tsconfig.crm.json',
    ),
  )
})

test('flags a project that does not cover its own directory', () => {
  const configs = wired()
  configs.set('tsconfig.crm.json', { include: ['src/types/**/*'], references: crm.references })
  assert.ok(
    findProblems(['crm'], configs, scripts).some(
      (p) => p.detail === 'does not include src/verticals/crm/**/*',
    ),
  )
})

for (const cmd of ['tsc', 'tsc --noEmit']) {
  test(`flags \`${cmd}\` as a vacuous script`, () => {
    const problems = findProblems(['crm'], wired(), { build: cmd, typecheck: 'tsc -b' })
    assert.ok(problems.some((p) => p.where === 'package.json#build'))
  })
}

test('flags a test config that extends the solution file', () => {
  // The solution file carries no compilerOptions, so extending it silently
  // drops strict and skipLibCheck — the typecheck still runs and no longer
  // means what it says.
  const configs = wired()
  configs.set('tsconfig.test.json', { extends: './tsconfig.json' })
  assert.ok(
    findProblems(['crm'], configs, scripts).some(
      (p) => p.where === 'tsconfig.test.json' && p.detail.includes('inherits no compilerOptions'),
    ),
  )
})

test('accepts a test config that extends the base', () => {
  const configs = wired()
  configs.set('tsconfig.test.json', { extends: '../../tsconfig.base.json' })
  assert.deepEqual(findProblems(['crm'], configs, scripts), [])
})

test('accepts the --build long form', () => {
  assert.deepEqual(
    findProblems(['crm'], wired(), { build: 'tsc --build', typecheck: 'tsc -b' }),
    [],
  )
})
