/**
 * Tests for the build stamps that stop integration-server's suite from running
 * against a stale workspace `dist/` (see scripts/build-stamp.mts).
 *
 * The first half drives the helpers on a throwaway app and library. The second
 * half pins the wiring in this repo. Without it, the guard can be switched off
 * silently: a library build that stops writing its stamp, a globalSetup that is
 * no longer registered, or a Docker build that runs the stamp writer before the
 * file is copied in.
 *
 * Run: `pnpm exec tsx --test scripts/build-stamp.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashSources, staleWorkspaceBuilds, STAMP_FILE, writeBuildStamp } from './build-stamp.mts'

const REPO_ROOT = join(import.meta.dirname, '..')
const STAMP_CMD = 'node ../../scripts/build-stamp.mts'

/** An app at `<root>/app` with one workspace library at `<root>/lib`, built. */
function fixture(): { root: string; app: string; lib: string } {
  const root = mkdtempSync(join(tmpdir(), 'build-stamp-'))
  const lib = join(root, 'lib')
  const app = join(root, 'app')
  mkdirSync(join(lib, 'src', 'net'), { recursive: true })
  mkdirSync(join(lib, 'dist'), { recursive: true })
  writeFileSync(
    join(lib, 'package.json'),
    JSON.stringify({ name: '@t/lib', main: './dist/index.js' }),
  )
  writeFileSync(join(lib, 'src', 'index.ts'), "export * from './net/fetch.js'\n")
  writeFileSync(join(lib, 'src', 'net', 'fetch.ts'), 'export const timeoutMs = 1000\n')
  writeFileSync(join(lib, 'dist', 'index.js'), '')
  mkdirSync(join(app, 'node_modules', '@t'), { recursive: true })
  symlinkSync(lib, join(app, 'node_modules', '@t', 'lib'))
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({ dependencies: { '@t/lib': 'workspace:*', zod: '^4.0.0' } }),
  )
  return { root, app, lib }
}

test('a library that was never stamped is reported', (t) => {
  const { root, app } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const problems = staleWorkspaceBuilds(app)
  assert.equal(problems.length, 1)
  assert.match(problems[0]!, /^@t\/lib: dist\/\.build-stamp\.json is missing/)
})

test('a freshly stamped library passes, and non-workspace deps are not checked', (t) => {
  const { root, app, lib } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeBuildStamp(lib)
  assert.deepEqual(staleWorkspaceBuilds(app), [])
})

test('editing a source after the build is reported, and rebuilding clears it', (t) => {
  const { root, app, lib } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeBuildStamp(lib)
  appendFileSync(join(lib, 'src', 'net', 'fetch.ts'), 'export const retries = 3\n')
  assert.deepEqual(staleWorkspaceBuilds(app), [
    '@t/lib: dist/ was built from other sources than its src/ holds now.',
  ])
  writeBuildStamp(lib)
  assert.deepEqual(staleWorkspaceBuilds(app), [])
})

test('a new source file is a source change', (t) => {
  const { root, lib } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const before = hashSources(lib)
  writeFileSync(join(lib, 'src', 'net', 'odoo.ts'), 'export {}\n')
  assert.notEqual(hashSources(lib), before)
})

test('renaming a source file is a source change', (t) => {
  const { root, lib } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const before = hashSources(lib)
  const body = readFileSync(join(lib, 'src', 'net', 'fetch.ts'))
  rmSync(join(lib, 'src', 'net', 'fetch.ts'))
  writeFileSync(join(lib, 'src', 'net', 'http.ts'), body)
  assert.notEqual(hashSources(lib), before)
})

test('touching a file without changing it is not a source change', (t) => {
  // A git checkout does this. tsc and turbo then correctly skip the rebuild,
  // so a guard keyed on mtimes would never clear.
  const { root, lib } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const before = hashSources(lib)
  const file = join(lib, 'src', 'net', 'fetch.ts')
  writeFileSync(file, readFileSync(file))
  utimesSync(file, new Date(), new Date(Date.now() + 60_000))
  assert.equal(hashSources(lib), before)
})

test('files tsc does not compile are not source changes', (t) => {
  // Turbo does not hash these either, so it would replay the old stamp.
  const { root, lib } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const before = hashSources(lib)
  writeFileSync(join(lib, 'src', '.DS_Store'), 'x')
  writeFileSync(join(lib, 'src', 'net', 'fetch.ts~'), 'x')
  assert.equal(hashSources(lib), before)
})

test('refuses to stamp a build that emitted nothing', (t) => {
  // tsc with a surviving tsconfig.tsbuildinfo does exactly this after a
  // hand-deleted dist/, and exits 0.
  const { root, lib } = fixture()
  t.after(() => rmSync(root, { recursive: true, force: true }))
  rmSync(join(lib, 'dist', 'index.js'))
  assert.throws(() => writeBuildStamp(lib), /did not produce \.\/dist\/index\.js/)
})

// ── Wiring in this repo ────────────────────────────────────────────────────

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8')) as T
}

test('every workspace library integration-server imports stamps its build', () => {
  const app = readJson<{
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }>('apps/integration-server/package.json')
  const libs = Object.entries({ ...app.dependencies, ...app.devDependencies })
    .filter(([, spec]) => spec.startsWith('workspace:'))
    .map(([name]) => name.replace('@opensteward/', ''))
  assert.ok(libs.includes('shared'), 'expected @opensteward/shared among the workspace deps')
  for (const lib of libs) {
    const build = readJson<{ scripts: Record<string, string> }>(`packages/${lib}/package.json`)
      .scripts.build
    assert.ok(
      build?.endsWith(`&& ${STAMP_CMD}`),
      `packages/${lib} build must end with \`&& ${STAMP_CMD}\` (after tsc), got: ${build}`,
    )
  }
})

test('integration-server and shared register the stale-build globalSetup', () => {
  // shared: its licensing tests verify tokens through license-token's dist/.
  for (const pkg of ['apps/integration-server', 'packages/shared']) {
    const config = readFileSync(join(REPO_ROOT, pkg, 'vitest.config.ts'), 'utf8')
    assert.match(config, /globalSetup:\s*\[\s*'\.\/vitest\.global-setup\.ts'\s*\]/, pkg)
    const setup = readFileSync(join(REPO_ROOT, pkg, 'vitest.global-setup.ts'), 'utf8')
    assert.match(setup, /staleWorkspaceBuilds\(/, pkg)
    assert.match(setup, /throw new Error/, pkg)
  }
})

test('turbo rebuilds when the stamp script changes', () => {
  const turbo = readJson<{ tasks: { build: { inputs: string[]; outputs: string[] } } }>(
    'turbo.json',
  )
  assert.ok(turbo.tasks.build.inputs.includes('../../scripts/build-stamp.mts'))
  // The stamp lives in dist/, so a cache hit restores it with the build.
  assert.ok(turbo.tasks.build.outputs.includes('dist/**'))
  assert.equal(STAMP_FILE, '.build-stamp.json')
})

test('the Dockerfile copies the stamp script in before the library builds run', () => {
  const lines = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8').split('\n')
  const copy = lines.findIndex((l) => /^COPY scripts\/build-stamp\.mts /.test(l))
  const build = lines.findIndex((l) => /^RUN pnpm --filter @opensteward\/shared run build/.test(l))
  assert.ok(copy !== -1, 'Dockerfile has no COPY of scripts/build-stamp.mts')
  assert.ok(build !== -1, 'Dockerfile has no shared build step')
  assert.ok(copy < build, 'scripts/build-stamp.mts is copied after the build that runs it')
})

test('the Dockerfile builds license-token after the stamp script arrives and before shared', () => {
  const lines = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8').split('\n')
  const copy = lines.findIndex((l) => /^COPY scripts\/build-stamp\.mts /.test(l))
  const token = lines.findIndex((l) =>
    /^RUN pnpm --filter @opensteward\/license-token run build$/.test(l),
  )
  const shared = lines.findIndex((l) => /^RUN pnpm --filter @opensteward\/shared run build/.test(l))
  assert.ok(
    token !== -1,
    'Dockerfile has no `RUN pnpm --filter @opensteward/license-token run build`',
  )
  assert.ok(
    copy < token,
    'license-token runs build-stamp.mts, so the script must be copied in first',
  )
  assert.ok(
    token < shared,
    "license-token must build before shared: shared's licensing compiles against its dist/",
  )
})

test('every runtime image ships license-token, before the prod install links shared', () => {
  const lines = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8').split('\n')
  const runtime = lines.findIndex((l) => /^FROM node:/.test(l) && !/\bAS builder\b/.test(l))
  const pkg = lines.indexOf(
    'COPY --from=builder /app/packages/license-token/package.json packages/license-token/package.json',
  )
  const dist = lines.indexOf(
    'COPY --from=builder /app/packages/license-token/dist/ packages/license-token/dist/',
  )
  const install = lines.findIndex((l) => /pnpm install --frozen-lockfile --prod/.test(l))
  assert.ok(runtime !== -1, 'no runtime FROM')
  assert.ok(pkg > runtime && dist > runtime, 'the runtime stage does not copy license-token')
  assert.ok(
    pkg < install && dist < install,
    'license-token must be in place before the prod install',
  )
})

test('shared and integration-server depend on license-token directly', () => {
  // integration-server directly too: staleWorkspaceBuilds reads direct deps only,
  // so this is what makes its test run refuse a stale license-token dist.
  for (const rel of ['packages/shared/package.json', 'apps/integration-server/package.json']) {
    const deps = readJson<{ dependencies?: Record<string, string> }>(rel).dependencies ?? {}
    assert.equal(deps['@opensteward/license-token'], 'workspace:*', rel)
  }
})
