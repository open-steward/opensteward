/**
 * The in-image licence probe (scripts/image-license-probe.cjs), run against
 * fixture trees shaped like /app in a built image.
 */
import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const PROBE = join(import.meta.dirname, 'image-license-probe.cjs')
const KIDS = ['k2026a', 'k2026b', 'k2026c', 'r2026a', 'r2026b']
const pub = () => generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' }).x as string
/** Mirrors the canonical keyring (C2): verbatim production keys, dev* kids only from the guarded module. */
const KEYRING_JS = `'use strict'
const { PRODUCTION_KEYS } = require('./keys.production.js')
function loadDevKeys() {
  try {
    const m = require('./keys.dev.js')
    return Object.fromEntries(Object.entries(m.DEV_KEYS || {}).filter(([k]) => k.startsWith('dev')))
  } catch {
    return {}
  }
}
exports.devKeysPresent = () => Object.keys(loadDevKeys()).length > 0
exports.getKeyring = (opts = {}) =>
  Object.freeze({ ...PRODUCTION_KEYS, ...(opts.includeDevKeys === false ? {} : loadDevKeys()) })
`
interface Tree {
  keys?: Record<string, string>
  devModule?: boolean
  noLicensing?: boolean
  files?: Record<string, string>
}
const roots: string[] = []
after(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})
function tree(o: Tree = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'license-probe-'))
  roots.push(root)
  if (!o.noLicensing) {
    const dir = join(root, 'packages/shared/dist/licensing')
    mkdirSync(dir, { recursive: true })
    const keys = o.keys ?? Object.fromEntries(KIDS.map((k) => [k, `PLACEHOLDER:${k}`]))
    writeFileSync(
      join(dir, 'keys.production.js'),
      `exports.PRODUCTION_KEYS = ${JSON.stringify(keys)}\n`,
    )
    writeFileSync(join(dir, 'keyring.js'), KEYRING_JS)
    if (o.devModule)
      writeFileSync(
        join(dir, 'keys.dev.js'),
        `exports.DEV_KEYS = ${JSON.stringify({ dev1: pub() })}\n`,
      )
  }
  for (const [rel, body] of Object.entries(o.files ?? {})) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  return root
}
const run = (root: string, ...flags: string[]) =>
  spawnSync(process.execPath, [PROBE, `--root=${root}`, ...flags], { encoding: 'utf8' })
const real = () => Object.fromEntries(KIDS.map((k) => [k, pub()]))
const pem = () =>
  generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' }) as string

test('passes on the five production kids with placeholders outside a release', () => {
  const r = run(tree())
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /trusts exactly k2026a, k2026b, k2026c, r2026a, r2026b/)
})
test('[L7:B02] --release fails while a placeholder remains', () => {
  const r = run(tree(), '--release')
  assert.equal(r.status, 1)
  assert.match(
    r.stderr,
    /placeholder public keys in a release image: k2026a, k2026b, k2026c, r2026a, r2026b/,
  )
})
test('--release passes once every key is a real, distinct 32-byte key', () => {
  const r = run(tree({ keys: real() }), '--release')
  assert.equal(r.status, 0, r.stderr)
})
test('--release refuses a malformed, non-canonical, all-zero or shared key (review A3 #18)', () => {
  const k = real()
  const cases: Array<[Record<string, string>, RegExp]> = [
    [{ ...k, k2026a: 'garbage' }, /k2026a is not 43 base64url characters/],
    [{ ...k, k2026a: `${'A'.repeat(42)}B` }, /k2026a does not decode canonically to 32 bytes/],
    [{ ...k, k2026a: 'A'.repeat(43) }, /k2026a is the all-zero key/],
    [{ ...k, k2026b: k['k2026a']! }, /k2026a and k2026b share one public key/],
  ]
  for (const [keys, want] of cases) {
    const r = run(tree({ keys }), '--release')
    assert.equal(r.status, 1, String(want))
    assert.match(r.stderr, want)
  }
})
test('[L7:B03] [L7:V05] fails when the dev key module shipped', () => {
  const r = run(tree({ devModule: true }))
  assert.equal(r.status, 1)
  assert.match(r.stderr, /non-production key module shipped: keys\.dev\.js/)
  assert.match(r.stderr, /devKeysPresent\(\) is true/)
  assert.match(r.stderr, /getKeyring\(\) trusts \[/)
})
test('[L7:B01] fails on a sixth production kid', () => {
  const r = run(
    tree({
      keys: {
        ...Object.fromEntries(KIDS.map((k) => [k, `PLACEHOLDER:${k}`])),
        k2027a: 'PLACEHOLDER:k2027a',
      },
    }),
  )
  assert.equal(r.status, 1)
  assert.match(r.stderr, /expected exactly/)
})
test('[L7:B03] fails on a quoted dev kid in compiled licensing code', () => {
  const r = run(
    tree({ files: { 'packages/shared/dist/licensing/evaluate.js': "if (kid === 'dev1') x()\n" } }),
  )
  assert.equal(r.status, 1)
  assert.match(r.stderr, /evaluate\.js names a dev kid/)
})
test('fails closed when the image ships no licensing module', () => {
  assert.equal(run(tree({ noLicensing: true })).status, 1)
})
test('fails when the dev keypair fixture shipped (review A3 #4)', () => {
  const fixture = JSON.stringify({
    kid: 'dev1',
    publicKey: pub(),
    privateKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: pub(), d: pub() },
  })
  const r = run(tree({ files: { 'packages/license-token/fixtures/dev1.json': fixture } }))
  assert.equal(r.status, 1)
  assert.match(r.stderr, /dev keypair fixtures shipped/)
})
test('fails on any private key baked into packages/ or apps/', () => {
  const cases: Record<string, string> = {
    'apps/integration-server/dist/key.pem': pem(),
    'apps/admin-api/dist/x.js': `const k = ${JSON.stringify(pem())}\n`,
    'packages/destinations/dist/y.js': `module.exports = { kty: 'OKP', crv: 'Ed25519', x: '${pub()}', d: '${pub()}' }\n`,
  }
  for (const [rel, body] of Object.entries(cases)) {
    const r = run(tree({ files: { [rel]: body } }))
    assert.equal(r.status, 1, rel)
    assert.match(r.stderr, /private key/, rel)
  }
})
test('a bare PEM header in validation code or an example is not a key', () => {
  const r = run(
    tree({
      files: {
        // packages/destinations/src/loaders/schemas.ts:230 and admin-api _openapi.ts:2689 ship these today
        'packages/destinations/dist/loaders/schemas.js':
          "refine((k) => k.includes('PRIVATE KEY-----'), 'A PEM-encoded private key')\n",
        'apps/admin-api/dist/core/routes/_openapi.js':
          "example: '-----BEGIN PRIVATE KEY-----\\n...',\n",
      },
    }),
  )
  assert.equal(r.status, 0, r.stderr)
})
test('node_modules is not scanned', () => {
  const r = run(tree({ files: { 'packages/shared/node_modules/some-lib/test/key.pem': pem() } }))
  assert.equal(r.status, 0, r.stderr)
})
test('refuses an argument it does not know, rather than run the wrong probe', () => {
  const root = tree({ keys: real() })
  for (const flags of [['--relase'], ['--root', root], ['--root='], ['--release', '-x']]) {
    const r = spawnSync(process.execPath, [PROBE, ...flags], { encoding: 'utf8' })
    assert.equal(r.status, 1, flags.join(' '))
    assert.match(r.stderr, /license probe: unknown argument /, flags.join(' '))
    assert.doesNotMatch(r.stdout, /trusts exactly/, flags.join(' '))
  }
})
test('reads its flags the same way when piped to `node -`, as docker run does', () => {
  const r = spawnSync(process.execPath, ['-', `--root=${tree()}`, '--release'], {
    input: readFileSync(PROBE),
    encoding: 'utf8',
  })
  assert.equal(r.status, 1)
  assert.match(r.stderr, /placeholder/)
})
