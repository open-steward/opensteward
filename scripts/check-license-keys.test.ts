import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import {
  EXPECTED_PRODUCTION_KIDS,
  KEY_FILES,
  checkArtifactKeyring,
  checkDevFixture,
  checkKeyFileShape,
  checkKeySets,
  checkRevocationList,
  loadCompiledKeyring,
  parseArgs,
  readArtifact,
  scanArtifact,
  scanDevModuleImports,
  scanSourceLiterals,
  type KeyProblem,
} from './check-license-keys.ts'
import {
  assembleToken,
  buildSigningInput,
  toClaimTime,
  verifyRevocationList,
} from '../packages/license-token/src/index.ts'
import { PRODUCTION_KEYS } from '../packages/shared/src/licensing/keys.production.ts'
import { DEV_KEYS } from '../packages/shared/src/licensing/keys.dev.ts'

const REPO_ROOT = join(import.meta.dirname, '..')
const LICENSING = join(REPO_ROOT, 'packages/shared/src/licensing')
const rules = (ps: KeyProblem[]) => ps.map((p) => p.rule).sort()
function kp(): { pub: string; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return { pub: publicKey.export({ format: 'jwk' }).x as string, privateKey }
}
const FIVE = [...EXPECTED_PRODUCTION_KIDS]
const PH = Object.fromEntries(FIVE.map((k) => [k, `PLACEHOLDER:${k}`]))
const PAIRS = Object.fromEntries(FIVE.map((k) => [k, kp()]))
const REAL = Object.fromEntries(Object.entries(PAIRS).map(([k, v]) => [k, v.pub]))
const DEVPAIR = kp()
const DEV = { dev1: DEVPAIR.pub, devk1: 'PLACEHOLDER:devk1' } // tests may name dev kids
function tmp(t: { after(fn: () => void): void }, prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix))
  t.after(() => rmSync(d, { recursive: true, force: true }))
  return d
}
function revList(kid: string, key: KeyObject): string {
  const p = { ver: 1 as const, iat: toClaimTime(new Date()), revoked: [] as string[] }
  const footer = { kid }
  const sig = sign(null, buildSigningInput(p, footer, 'revocations'), key)
  return assembleToken(p, footer, new Uint8Array(sig), 'revocations')
}
/** The REAL keyring.ts (+ keys.production.ts, optionally keys.dev.ts) compiled to CJS, as tsc emits it. */
function compileLicensing(t: { after(fn: () => void): void }, withDevModule: boolean): string {
  const root = tmp(t, 'lic-artifact-')
  const dir = join(root, 'licensing')
  mkdirSync(dir)
  for (const f of ['keys.production.ts', 'keyring.ts', ...(withDevModule ? ['keys.dev.ts'] : [])]) {
    const out = ts.transpileModule(readFileSync(join(LICENSING, f), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText
    writeFileSync(join(dir, f.replace(/\.ts$/, '.js')), out)
  }
  return root
}

// ── Source mode: the key maps ────────────────────────────────────────────────
test('placeholders pass outside a release; a release refuses each one', () => {
  assert.deepEqual(checkKeySets(PH, DEV), [])
  assert.deepEqual(rules(checkKeySets(PH, DEV, { release: true })), Array(5).fill('placeholder'))
})
test('[L7:B01] the production kid set is exactly the five', () => {
  const { r2026b: _drop, ...four } = REAL
  assert.deepEqual(rules(checkKeySets(four, DEV)), ['kid-set'])
  assert.deepEqual(rules(checkKeySets({ ...REAL, k2027a: kp().pub }, DEV)), ['kid-set'])
})
test('a key is canonical base64url of 32 non-zero bytes', () => {
  assert.deepEqual(
    rules(checkKeySets({ ...REAL, k2026a: Buffer.alloc(31, 7).toString('base64url') }, DEV)),
    ['key-shape'],
  )
  assert.deepEqual(rules(checkKeySets({ ...REAL, k2026a: `${REAL.k2026a}=` }, DEV)), ['key-shape'])
  assert.deepEqual(
    rules(checkKeySets({ ...REAL, k2026a: Buffer.alloc(32).toString('base64url') }, DEV)),
    ['zero-key'],
  )
})
test('two kids may not share a key, and a dev key may never equal a production key', () => {
  assert.deepEqual(rules(checkKeySets({ ...REAL, k2026b: REAL.k2026a! }, DEV)), ['duplicate'])
  assert.deepEqual(rules(checkKeySets(REAL, { dev1: REAL.k2026c! })), ['prod-equals-dev'])
})
test('a placeholder names its own kid', () => {
  assert.deepEqual(rules(checkKeySets({ ...PH, k2026a: 'PLACEHOLDER:k2026b' }, DEV)), [
    'placeholder-mismatch',
  ])
})
test('only dev1 and devk1 exist as non-production kids, each well formed', () => {
  assert.deepEqual(rules(checkKeySets(REAL, { ...DEV, dev2: kp().pub })), ['dev-kid-set'])
  assert.deepEqual(rules(checkKeySets(REAL, { ...DEV, dev1: 'short' })), ['dev-key-shape'])
})
test('DEV_KEYS.dev1 must be the committed fixture', () => {
  assert.deepEqual(checkDevFixture(DEV, { kid: 'dev1', publicKey: DEVPAIR.pub }), [])
  assert.deepEqual(rules(checkDevFixture(DEV, { kid: 'dev1', publicKey: kp().pub })), [
    'dev-fixture',
  ])
})
test('the committed key files and fixture pass', () => {
  const fixture = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/license-token/fixtures/dev1.json'), 'utf8'),
  ) as { kid: string; publicKey: string }
  assert.deepEqual(checkKeySets(PRODUCTION_KEYS, DEV_KEYS), [])
  assert.deepEqual(checkDevFixture(DEV_KEYS, fixture), [])
})

// ── Source mode: the key files keep the text shape the license service reads ──

test('both committed key files keep the shape the license service parses as text', () => {
  for (const [file, name] of KEY_FILES) {
    const text = readFileSync(join(LICENSING, file), 'utf8')
    assert.deepEqual(checkKeyFileShape(text, name, file), [], file)
  }
})

test('a key file refactored away from Object.freeze({ kid: literal }) is refused', () => {
  const text = readFileSync(join(LICENSING, 'keys.production.ts'), 'utf8')
  const edits: Array<[string, string]> = [
    // each is still valid TypeScript that checkKeySets (an import) would accept
    // (the header comment names `Object.freeze({` too, so edits anchor on the `= `;
    // the k2026a edits anchor on its line, whatever key it holds)
    ['as const', text.replace(/= Object\.freeze\(\{([\s\S]*?)\}\)/, '= {$1} as const')],
    [
      'generic call',
      text.replace('= Object.freeze({', '= Object.freeze<Record<string, string>>({'),
    ],
    ['template literal', text.replace(/k2026a: '([^']*)'/, 'k2026a: `$1`')],
    ['computed key', text.replace(/k2026a: ('[^']*')/, "['k2026a']: $1")],
    ['spread', text.replace(/ {2}k2026a: '[^']*',\n/, '  ...BASE,\n')],
    [
      'escape',
      // the value's last character as its \x.. escape: the same string to a parser
      text.replace(
        /k2026a: '([^']*)([^'])'/,
        (_, head: string, last: string) =>
          `k2026a: '${head}\\x${last.charCodeAt(0).toString(16).padStart(2, '0')}'`,
      ),
    ],
    ['second declaration', `${text}\nexport let PRODUCTION_KEYS2 = 1\nconst PRODUCTION_KEYS = 2\n`],
    ['reassignment', `${text}\n// later\nPRODUCTION_KEYS = Object.freeze({})\n`],
    ['rebinding', `${text}\nexport { OTHER as PRODUCTION_KEYS }\n`],
  ]
  for (const [what, edited] of edits) {
    assert.notEqual(edited, text, `${what}: the edit no longer applies; update it`)
    assert.deepEqual(
      checkKeyFileShape(edited, 'PRODUCTION_KEYS', 'keys.production.ts').map((p) => p.rule),
      ['key-file-shape'],
      what,
    )
  }
  // Comments are ignored, as the service's lexer ignores them.
  const commented = `/* const PRODUCTION_KEYS = 1 */\n// PRODUCTION_KEYS = 2\n${text}`
  assert.deepEqual(checkKeyFileShape(commented, 'PRODUCTION_KEYS', 'keys.production.ts'), [])
})

// ── Source mode: nothing may import keys.dev (review #9) ─────────────────────
test('only keyring.ts may reach keys.dev, and only through require', () => {
  const ok = [{ path: 'licensing/keyring.ts', content: "const m = require('./keys.dev')" }]
  assert.deepEqual(scanDevModuleImports(ok), [])
  for (const [path, content] of [
    ['licensing/index.ts', "export * from './keys.dev'"],
    ['licensing/index.ts', "export { DEV_KEYS } from './keys.dev'"],
    ['licensing/keyring.ts', "import { DEV_KEYS } from './keys.dev'"],
    ['licensing/keyring.ts', "const m = await import('./keys.dev')"],
    ['licensing/evaluate.ts', "const m = require('./keys.dev.js')"],
    ['control-plane/x.ts', "import '../licensing/keys.dev'"],
  ]) {
    assert.deepEqual(
      rules(scanDevModuleImports([{ path: path!, content: content! }])),
      ['dev-module-import'],
      content,
    )
  }
})
test("keyring.ts may hold one require('./keys.dev') and no other keys.dev specifier", () => {
  const keyring = (content: string) => [{ path: 'licensing/keyring.ts', content }]
  assert.deepEqual(scanDevModuleImports(keyring('const m = require("./keys.dev")')), [])
  for (const content of [
    // Resolves under vitest (Node 24 loads .ts) but never in dist: dev keys silently vanish.
    "const m = require('./keys.dev.ts')",
    "const m = require('./keys.dev.js')",
    "const m = require('./keys.dev.cjs')",
    'const m = require(`./keys.dev`)',
    "const m = require('../licensing/keys.dev')",
    "const m = require( './keys.dev' )",
  ]) {
    assert.deepEqual(rules(scanDevModuleImports(keyring(content))), ['dev-module-import'], content)
  }
  // A second require, even of the allowed form, is one too many.
  assert.deepEqual(
    rules(
      scanDevModuleImports(
        keyring("try { a = require('./keys.dev') } catch {}\nb = require('./keys.dev')"),
      ),
    ),
    ['dev-module-import'],
  )
})
test('no quoted dev kid in source outside keys.dev.ts', () => {
  assert.deepEqual(
    scanSourceLiterals([{ path: 'licensing/keys.dev.ts', content: "dev1: 'x'; type K = 'dev1'" }]),
    [],
  )
  assert.deepEqual(
    rules(scanSourceLiterals([{ path: 'licensing/evaluate.ts', content: "if (kid === 'dev1')" }])),
    ['dev-kid-literal'],
  )
})
test('the real packages/shared/src passes both scans', () => {
  const files = readArtifact(join(REPO_ROOT, 'packages/shared/src'))
  assert.ok(
    files.some((f) => f.path === 'licensing/keyring.ts'),
    'walker guard',
  )
  assert.deepEqual(scanDevModuleImports(files), [])
  assert.deepEqual(scanSourceLiterals(files), [])
})

// ── Source mode: a committed revocation list must verify ─────────────────────
test('a committed revocation list verifies under the production keys, or is reported', () => {
  assert.deepEqual(checkRevocationList(null, REAL, verifyRevocationList), [])
  assert.deepEqual(
    checkRevocationList(revList('r2026a', PAIRS.r2026a!.privateKey), REAL, verifyRevocationList),
    [],
  )
  assert.deepEqual(rules(checkRevocationList('garbage', REAL, verifyRevocationList)), [
    'revocations-invalid',
  ])
  // A dev kid is never a production key, so a dev-signed list cannot verify.
  assert.deepEqual(
    rules(checkRevocationList(revList('dev1', DEVPAIR.privateKey), REAL, verifyRevocationList)),
    ['revocations-invalid'],
  )
})

// ── Artifact mode ─────────────────────────────────────────────────────────────
test('[L7:B03] [L7:V05] compiled output may not carry the dev module, a dev kid literal or the dev key bytes', () => {
  const clean = [
    { path: 'licensing/keyring.js', content: "try { m = require('./keys.dev') } catch {}" },
  ]
  assert.deepEqual(scanArtifact(clean, DEV), [])
  assert.ok(
    rules(scanArtifact([{ path: 'licensing/keys.dev.js', content: '' }], DEV)).includes(
      'dev-module-present',
    ),
  )
  assert.deepEqual(
    rules(scanArtifact([{ path: 'licensing/keyring.d.ts', content: "type K = 'devk1'" }], DEV)),
    ['dev-kid-literal'],
  )
  assert.deepEqual(rules(scanArtifact([{ path: 'a.js', content: `x="${DEVPAIR.pub}"` }], DEV)), [
    'dev-public-key',
  ])
  const hex = Buffer.from(DEVPAIR.pub, 'base64url').toString('hex')
  assert.deepEqual(
    rules(scanArtifact([{ path: 'a.json', content: `"302a300506032b6570032100${hex}"` }], DEV)),
    ['dev-public-key'],
  )
  const b64 = Buffer.from(DEVPAIR.pub, 'base64url').toString('base64')
  assert.deepEqual(rules(scanArtifact([{ path: 'a.js.map', content: b64 }], DEV)), [
    'dev-public-key',
  ])
})

test('[L7:B01] the real compiled keyring, stripped, trusts exactly the five kids in both views', (t) => {
  const root = compileLicensing(t, false)
  const ring = loadCompiledKeyring(join(root, 'licensing', 'keyring.js'))
  assert.deepEqual([...ring.production].sort(), FIVE)
  assert.deepEqual([...ring.all].sort(), FIVE)
  assert.deepEqual(checkArtifactKeyring(ring), [])
  // And the compiled code itself carries no dev kid literal or dev key.
  assert.deepEqual(scanArtifact(readArtifact(root), DEV_KEYS), [])
})

test('the real compiled keyring, NOT stripped, is refused', (t) => {
  const root = compileLicensing(t, true)
  const ring = loadCompiledKeyring(join(root, 'licensing', 'keyring.js'))
  assert.deepEqual(rules(checkArtifactKeyring(ring)), ['artifact-keyring'])
  const found = rules(scanArtifact(readArtifact(root), DEV_KEYS))
  assert.ok(
    found.includes('dev-module-present') && found.includes('dev-public-key'),
    found.join(','),
  )
})

test('arguments: --artifact repeats and needs a value; --release is a flag; anything else is refused', () => {
  assert.deepEqual(parseArgs(['--artifact', 'a', '--soft', '--artifact', 'b']), {
    soft: true,
    artifacts: ['a', 'b'],
    release: false,
  })
  assert.deepEqual(parseArgs(['--release']), { soft: false, artifacts: [], release: true })
  assert.throws(() => parseArgs(['--artifact']), /--artifact needs a directory/)
  assert.throws(() => parseArgs(['--artifact', '--soft']), /--artifact needs a directory/)
  assert.throws(() => parseArgs(['--relase']), /unknown argument --relase/)
})

// ── The Dockerfile wiring ────────────────────────────────────────────────────
test('the Dockerfile strips dev keys by build profile, in the builder, then checks three artifacts', () => {
  const lines = readFileSync(join(REPO_ROOT, 'Dockerfile'), 'utf8').split('\n')
  const scripts = lines.indexOf('COPY scripts/ scripts/')
  // Dockerfile:4 is `FROM node:24-alpine AS builder`: the runtime FROM is the other one (review #4).
  const runtime = lines.findIndex((l) => /^FROM node:/.test(l) && !/\bAS builder\b/.test(l))
  const arg = lines.indexOf('ARG OPENSTEWARD_BUILD_PROFILE=production')
  const run = lines.findIndex(
    (l, i) => i > arg && /^RUN case "\$\{OPENSTEWARD_BUILD_PROFILE\}" in/.test(l),
  )
  const end = lines.findIndex((l, i) => i > run && /^\s*esac\s*$/.test(l))
  assert.ok(scripts !== -1 && runtime !== -1 && arg !== -1 && run !== -1 && end !== -1, 'markers')
  assert.ok(
    scripts < arg && arg < run && end < runtime,
    'the profile ARG and RUN sit in the builder, after COPY scripts/',
  )
  const block = lines.slice(run, end + 1).join('\n')
  const prod = block.slice(block.indexOf('production)'), block.indexOf('development)'))
  assert.match(prod, /rm -f packages\/shared\/dist\/licensing\/keys\.dev\.\*/)
  assert.match(
    prod,
    /check-license-keys\.ts[\s\S]*--artifact packages\/shared\/dist[\s\S]*--artifact packages\/license-token\/dist[\s\S]*--artifact apps\/\$\{APP\}\/dist/,
  )
  const dev = block.slice(block.indexOf('development)'), block.indexOf('*)'))
  assert.match(dev, /WARNING/)
  assert.doesNotMatch(dev, /rm -f/, 'the development profile keeps the dev keys')
  assert.match(block.slice(block.indexOf('*)')), /exit 1/, 'an unknown profile fails the build')
  assert.doesNotMatch(
    block,
    /if \[ "\$\{APP\}"/,
    'every image ships shared/dist: the strip may not depend on APP',
  )
  const rtArg = lines.findIndex(
    (l, i) => i > runtime && l === 'ARG OPENSTEWARD_BUILD_PROFILE=production',
  )
  const label = lines.findIndex(
    (l, i) =>
      i > rtArg && l === 'LABEL org.opensteward.build-profile="${OPENSTEWARD_BUILD_PROFILE}"',
  )
  assert.ok(rtArg !== -1 && label !== -1, 'the runtime stage records the profile as a label')
})

// ── The CLI: main() ──────────────────────────────────────────────────────────
// CI runs `pnpm check:license-keys` (source mode) and the Dockerfile runs
// `check-license-keys.ts --artifact …` (the gate that keeps dev keys out of a
// production image). The tests above call the checks directly, so they stay
// green when main() stops calling one. These run the script itself. The --release
// CLI test lives in check-license-keys-release.test.ts.
const TSX = join(REPO_ROOT, 'node_modules', '.bin', 'tsx')
const SCRIPT = join(import.meta.dirname, 'check-license-keys.ts')
function cli(args: string[], script = SCRIPT) {
  const res = spawnSync(TSX, [script, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 60_000,
  })
  const out = `${res.stdout}\n${res.stderr}`
  assert.equal(res.error, undefined, out)
  /** The rules main() printed, as `[rule]` tags in its problem list. */
  const printed = [...res.stderr.matchAll(/^ {2}- \[([a-z-]+)\]/gm)].map((m) => m[1]!)
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, out, printed }
}
/**
 * A checkout of just what source mode reads, with this script copied in: its
 * paths hang off its own directory, so a copy checks the copy's tree. A real
 * path, because on macOS tmpdir() is a symlink and the script only runs as main
 * when its own URL matches argv[1].
 */
function checkout(t: { after(fn: () => void): void }): { root: string; script: string } {
  const root = realpathSync(tmp(t, 'lic-keys-cli-'))
  const script = join(root, 'scripts', 'check-license-keys.ts')
  mkdirSync(join(root, 'scripts'))
  copyFileSync(SCRIPT, script)
  mkdirSync(join(root, 'packages/shared/src/licensing'), { recursive: true })
  for (const f of ['keys.production.ts', 'keys.dev.ts', 'keyring.ts', 'revocations.ts'])
    copyFileSync(join(LICENSING, f), join(root, 'packages/shared/src/licensing', f))
  mkdirSync(join(root, 'packages/license-token/fixtures'), { recursive: true })
  copyFileSync(
    join(REPO_ROOT, 'packages/license-token/fixtures/dev1.json'),
    join(root, 'packages/license-token/fixtures/dev1.json'),
  )
  symlinkSync(
    join(REPO_ROOT, 'packages/license-token/src'),
    join(root, 'packages/license-token/src'),
  )
  return { root, script }
}

test('CLI, source mode: the committed tree passes', () => {
  const r = cli([])
  assert.equal(r.status, 0, r.out)
  assert.match(r.stdout, /Checking the license key ring \(source\)\./, r.out)
  assert.match(r.stdout, /✓ Trusts exactly k2026a, k2026b, k2026c, r2026a, r2026b\./, r.out)
})

test('CLI, source mode: a checkout that breaks every source check fails and names each one; --soft only reports', (t) => {
  const { root, script } = checkout(t)
  // The copy passes as it is: a red below is the check, not a broken copy.
  const clean = cli([], script)
  assert.equal(clean.status, 0, clean.out)
  assert.match(clean.stdout, /✓ Trusts exactly/, clean.out)

  const lic = join(root, 'packages/shared/src/licensing')
  const prod = join(lic, 'keys.production.ts')
  const text = readFileSync(prod, 'utf8')
  const sixth = text.replace(/(r2026b: '[^']*',)/, "$1\n  x2026z: 'PLACEHOLDER:x2026z',")
  assert.notEqual(sixth, text, 'keys.production.ts changed shape: update this edit')
  writeFileSync(prod, sixth)
  writeFileSync(
    join(lic, 'leak.ts'),
    "import { DEV_KEYS } from './keys.dev'\nexport const kid = 'dev1'\nexport const k = DEV_KEYS\n",
  )
  writeFileSync(
    join(lic, 'revocations.ts'),
    "export const REVOCATION_LIST_TOKEN: string | null = 'v4.public.not-a-list'\n",
  )
  const devFile = join(lic, 'keys.dev.ts')
  const devText = readFileSync(devFile, 'utf8')
  const templated = devText.replace(/dev1: '([^']+)'/, 'dev1: `$1`')
  assert.notEqual(templated, devText, 'keys.dev.ts changed shape: update this edit')
  writeFileSync(devFile, templated)
  const fixturePath = join(root, 'packages/license-token/fixtures/dev1.json')
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Record<string, unknown>
  writeFileSync(fixturePath, JSON.stringify({ ...fixture, publicKey: kp().pub }))

  const expected = [
    'dev-fixture',
    'dev-kid-literal',
    'dev-module-import',
    'key-file-shape',
    'kid-set',
    'revocations-invalid',
  ]
  const hard = cli([], script)
  assert.equal(hard.status, 1, hard.out)
  assert.deepEqual([...new Set(hard.printed)].sort(), expected, hard.out)
  assert.doesNotMatch(hard.stdout, /✓/, hard.out)

  const soft = cli(['--soft'], script)
  assert.equal(soft.status, 0, soft.out)
  assert.deepEqual([...new Set(soft.printed)].sort(), expected, soft.out)
})

test('[L7:B03] CLI, --artifact: compiled output with keys.dev stripped passes', (t) => {
  const r = cli(['--artifact', compileLicensing(t, false)])
  assert.equal(r.status, 0, r.out)
  assert.match(r.stdout, /Checking the license key ring \(1 artifact dir\(s\)\)\./, r.out)
  assert.match(r.stdout, /with no development key in the output\./, r.out)
})

test('[L7:B03] CLI, --artifact: compiled output that still carries keys.dev fails, by file and by keyring', (t) => {
  const r = cli(['--artifact', compileLicensing(t, true)])
  assert.equal(r.status, 1, r.out)
  for (const rule of ['dev-module-present', 'dev-public-key', 'artifact-keyring'])
    assert.ok(r.printed.includes(rule), `${rule} not reported:\n${r.out}`)
  assert.doesNotMatch(r.stdout, /✓/, r.out)
})

test('CLI, --artifact: a directory without licensing/keyring.js, or no directory at all, fails', (t) => {
  const empty = tmp(t, 'lic-artifact-empty-')
  writeFileSync(join(empty, 'index.js'), 'module.exports = {}\n')
  const r = cli(['--artifact', empty, '--artifact', join(empty, 'no-such-dir')])
  assert.equal(r.status, 1, r.out)
  assert.deepEqual([...r.printed].sort(), ['artifact-missing', 'artifact-no-keyring'], r.out)
})
