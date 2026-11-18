/**
 * Wiring for @opensteward/license-token that the package's own vitest suite cannot pin.
 *
 * turbo caches a package's `test` task on that package's src/, tests/ and vitest config
 * (turbo.json `test.inputs`). A package test that reads anything else (package.json, LICENSE,
 * fixtures/, README.md, the integration-server vertical folders, the publish workflow) would
 * replay a stale green result after that file changes. test:guard-scripts is never cached, so
 * those checks live here.
 *
 * Run: `pnpm exec tsx --test scripts/license-token-wiring.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { VERTICALS } from '../packages/license-token/src/index.ts'

const REPO_ROOT = join(import.meta.dirname, '..')
const read = (...segments: string[]) => readFileSync(join(REPO_ROOT, ...segments), 'utf8')
const pkg = JSON.parse(read('packages', 'license-token', 'package.json'))

test('VERTICALS is exactly the integration-server vertical catalogue', () => {
  const onDisk = readdirSync(join(REPO_ROOT, 'apps', 'integration-server', 'src', 'verticals'), {
    withFileTypes: true,
  })
    .filter((e) => e.isDirectory() && e.name !== 'shared')
    .map((e) => e.name)
    .sort()
  assert.deepEqual([...VERTICALS].sort(), onDisk)
})

test('package.json: CommonJS, Elastic-2.0, zod is the only dependency, no workspace deps (D-C)', () => {
  assert.equal(pkg.name, '@opensteward/license-token')
  assert.equal(pkg.type, undefined)
  assert.equal(pkg.license, 'Elastic-2.0')
  // The exact zod floor moves with every Dependabot bump; the contract is zod 4, alone.
  assert.deepEqual(Object.keys(pkg.dependencies), ['zod'])
  assert.match(pkg.dependencies.zod, /^\^4\.\d+\.\d+$/)
  const all = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
  for (const [name, spec] of Object.entries(all)) {
    assert.ok(!String(spec).startsWith('workspace:'), `${name} is a workspace dependency`)
    assert.ok(!name.startsWith('@opensteward/'), `${name} is an OpenSteward package`)
  }
  assert.equal(pkg.devDependencies['@typescript/native'], 'npm:typescript@^7.0.2')
  assert.equal(pkg.devDependencies.typescript, 'npm:@typescript/typescript6@^6.0.2')
})

test('package.json: a public rc that ships dist, README and LICENSE only (D-G)', () => {
  assert.match(pkg.version, /^1\.0\.0(?:-rc\.\d+)?$/)
  assert.equal(pkg.private, false)
  assert.deepEqual(pkg.publishConfig, { access: 'public' })
  assert.deepEqual(pkg.files, ['dist/', 'README.md', 'LICENSE'])
  assert.deepEqual(pkg.exports, {
    '.': { types: './dist/index.d.ts', import: './dist/index.js', require: './dist/index.js' },
  })
})

test('package.json: stamped build like every workspace library; rebuilt before publish', () => {
  assert.equal(pkg.scripts.build, 'tsc && node ../../scripts/build-stamp.mts')
  assert.equal(pkg.scripts.prepublishOnly, 'pnpm run build')
})

test('LICENSE is a byte copy of the repository LICENSE', () =>
  assert.equal(read('packages', 'license-token', 'LICENSE'), read('LICENSE')))

test('THIRD-PARTY-NOTICES lists the PASETO test vectors (ISC)', () => {
  const notices = read('THIRD-PARTY-NOTICES.md')
  assert.match(notices, /packages\/license-token\/tests\/fixtures\/paseto-v4\.json/)
  assert.match(notices, /ISC, Copyright \(c\) 2021 Paragon Initiative Enterprises/)
})

// ── The dev1 fixture ────────────────────────────────────────────────────

function srcFiles(dir = join(REPO_ROOT, 'packages', 'license-token', 'src')): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? srcFiles(join(dir, e.name))
      : e.name.endsWith('.ts')
        ? [join(dir, e.name)]
        : [],
  )
}

test('dev1: JWK form, never in src, never published, never in a Docker build context', () => {
  const dev1 = JSON.parse(read('packages', 'license-token', 'fixtures', 'dev1.json'))
  assert.equal(dev1.kid, 'dev1')
  assert.deepEqual(Object.keys(dev1.privateKeyJwk).sort(), ['crv', 'd', 'kty', 'x'])
  assert.equal(dev1.privateKeyJwk.x, dev1.publicKey)
  for (const file of srcFiles()) {
    const text = readFileSync(file, 'utf8')
    assert.ok(!text.includes(dev1.publicKey), `${file} holds the dev1 public key`)
    assert.ok(!text.includes(dev1.privateKeyJwk.d), `${file} holds the dev1 private key`)
  }
  assert.ok(!pkg.files.some((f: string) => f.startsWith('fixtures')))
  assert.match(read('.dockerignore'), /^packages\/license-token\/fixtures$/m)
})

test('test:guard-scripts runs the license-token wiring and dev-token tests', () => {
  const scripts = JSON.parse(read('package.json')).scripts
  for (const file of [
    'scripts/license-token-wiring.test.ts',
    'scripts/license-dev-token.test.ts',
  ]) {
    assert.ok(scripts['test:guard-scripts'].split(' ').includes(file), file)
  }
  assert.equal(scripts['license:dev-token'], 'tsx scripts/license-dev-token.ts')
})

// ── README contract and publish workflow ────────────────────────────────

test('README documents every export of src/index.ts', () => {
  const index = read('packages', 'license-token', 'src', 'index.ts')
  const names = [...index.matchAll(/export (?:type )?\{([^}]+)\}/g)].flatMap((m) =>
    m[1]!
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  assert.ok(names.length > 40, `expected the full export list, parsed ${names.length}`)
  const readme = read('packages', 'license-token', 'README.md')
  for (const name of names) assert.match(readme, new RegExp(`\\b${name}\\b`), name)
})

test('README states the contract notes the license service depends on', () => {
  const readme = read('packages', 'license-token', 'README.md')
  for (const needle of [
    'ECC_NIST_EDWARDS25519',
    "MessageType: 'RAW'",
    "SigningAlgorithm: 'ED25519_SHA_512'",
    'ED25519_PH_SHA_512',
    'limits.tenants',
    'No "unlimited" sentinel',
    'trailing whitespace',
    'n × (len(sub) + 3) − 1',
    'floor(3954 / (len(sub) + 3))',
    '**Trims**',
    '**Passes a rollback-protected `now`**',
    '**Classifies `exp` itself.**',
    '**Maps `NOT_YET_VALID` to an invalid license.**',
    '**Checks revocation:**',
  ]) {
    assert.ok(readme.includes(needle), `README is missing: ${needle}`)
  }
})

test('the npm publish workflow builds and publishes license-token (dir loop, skip, next tag)', () => {
  const wf = read('.github', 'workflows', 'publish-npm.yml')
  assert.match(
    wf,
    /run: pnpm --filter @opensteward\/mcp-server --filter @opensteward\/sdk --filter @opensteward\/license-token run build\n/,
  )
  assert.match(wf, /for dir in apps\/mcp-server packages\/sdk packages\/license-token; do\n/)
  assert.match(wf, /if npm view "\$pkg@\$ver" version >\/dev\/null 2>&1; then/)
  assert.match(wf, /case "\$ver" in \*-\*\) tag=next ;; esac/)
  assert.doesNotMatch(wf, /for pkg in/)
})
