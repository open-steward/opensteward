'use strict'
// In-image licence probe. Runs INSIDE a built image, without network:
//   docker run --rm -i --network none --entrypoint node <image> - [--release] < scripts/image-license-probe.cjs
// from .github/workflows/images.yml (build job, by digest, before any tag) and
// scripts/compose-smoke.sh (§4), and against fixture trees in
// scripts/image-license-probe.test.ts (--root=<dir>). Plain CommonJS with no
// dependencies and no environment reads: the runtime image has node and the
// app, nothing else.
//
// Fails when the image
//   - ships no licensing module (fail closed);
//   - ships the dev key module (keys.dev.*), names a dev kid in compiled
//     licensing code, has a keyring that trusts anything but the five
//     production kids (with or without dev keys requested), or reports
//     devKeysPresent();
//   - ships the dev keypair fixtures, or any private key, under
//     /app/packages or /app/apps.
// With --release it also fails on a placeholder key, or a key that is not
// canonical base64url of 32 bytes (or is all zero, or is shared by two kids).
const { existsSync, lstatSync, readdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const EXPECTED = ['k2026a', 'k2026b', 'k2026c', 'r2026a', 'r2026b']
// Only --release and --root=<dir>. Anything else is refused, never ignored: a
// mistyped --relase would otherwise run the non-release probe and pass on
// placeholder keys, and `--root /x` would silently probe /app.
let ROOT = '/app'
let RELEASE = false
for (const a of process.argv.slice(2)) {
  if (a === '--release') RELEASE = true
  else if (a.startsWith('--root=') && a.length > '--root='.length) ROOT = a.slice('--root='.length)
  else {
    console.error(`license probe: unknown argument ${a} (supported: --release, --root=<dir>)`)
    process.exit(1)
  }
}
const LICENSING = join(ROOT, 'packages/shared/dist/licensing')
const SCAN_ROOTS = [join(ROOT, 'packages'), join(ROOT, 'apps')]
const MAX_SCAN_BYTES = 8 * 1024 * 1024
// A PEM private key WITH a body. The bare header ships legitimately in
// compiled code (destinations' key validation, admin-api's OpenAPI examples).
const PEM_PRIVATE_KEY =
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----(?:[A-Za-z0-9+/=\s]|\\[rn]){40,}-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----/
const JWK_ED25519 = /["']?crv["']?\s*:\s*["']Ed25519["']/
const JWK_PRIVATE_D = /["']?\bd["']?\s*:\s*["'][A-Za-z0-9_-]{43}["']/
const DEV_KID_LITERAL = /['"`]devk?1['"`]/
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())

function keyShapeProblem(kid, value) {
  if (typeof value !== 'string') return `${kid} is not a string`
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return `${kid} is not 43 base64url characters`
  const raw = Buffer.from(value, 'base64url')
  if (raw.length !== 32 || raw.toString('base64url') !== value)
    return `${kid} does not decode canonically to 32 bytes`
  if (raw.every((b) => b === 0)) return `${kid} is the all-zero key`
  return null
}

function* filesUnder(dir) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.isSymbolicLink()) continue
    const full = join(dir, e.name)
    if (e.isDirectory()) yield* filesUnder(full)
    else if (e.isFile()) yield full
  }
}

function keyringProblems() {
  if (!existsSync(LICENSING))
    return [`${LICENSING} does not exist — this image ships no licensing module`]
  const problems = []
  const names = readdirSync(LICENSING)
  const dev = names.filter((f) => f.startsWith('keys.dev.'))
  if (dev.length) problems.push(`the non-production key module shipped: ${dev.join(', ')}`)
  for (const f of names.filter((n) => /\.c?js$/.test(n) && !n.startsWith('keys.dev.'))) {
    if (DEV_KID_LITERAL.test(readFileSync(join(LICENSING, f), 'utf8')))
      problems.push(`${f} names a dev kid`)
  }
  let prod
  let ring
  try {
    prod = require(join(LICENSING, 'keys.production.js')).PRODUCTION_KEYS
    ring = require(join(LICENSING, 'keyring.js'))
  } catch (err) {
    return [...problems, `cannot load the licensing module: ${err && err.message}`]
  }
  if (!prod || typeof prod !== 'object')
    return [...problems, 'keys.production.js exports no PRODUCTION_KEYS']
  if (!same(Object.keys(prod), EXPECTED))
    problems.push(
      `PRODUCTION_KEYS has [${Object.keys(prod).join(', ')}], expected exactly [${EXPECTED.join(', ')}]`,
    )
  if (typeof ring.getKeyring !== 'function' || typeof ring.devKeysPresent !== 'function')
    return [...problems, 'keyring.js must export getKeyring and devKeysPresent']
  for (const [label, opts] of [
    ['getKeyring()', undefined],
    ['getKeyring({ includeDevKeys: false })', { includeDevKeys: false }],
  ]) {
    const kids = Object.keys(ring.getKeyring(opts))
    if (!same(kids, EXPECTED))
      problems.push(
        `${label} trusts [${kids.join(', ')}], expected exactly [${EXPECTED.join(', ')}]`,
      )
  }
  if (ring.devKeysPresent())
    problems.push('devKeysPresent() is true — this image trusts development license keys')
  if (RELEASE) {
    const placeholders = Object.entries(prod)
      .filter(([, v]) => String(v).startsWith('PLACEHOLDER:'))
      .map(([k]) => k)
    if (placeholders.length)
      problems.push(`placeholder public keys in a release image: ${placeholders.join(', ')}`)
    const seen = new Map()
    for (const [kid, v] of Object.entries(prod)) {
      if (String(v).startsWith('PLACEHOLDER:')) continue
      const shape = keyShapeProblem(kid, v)
      if (shape) problems.push(shape)
      else if (seen.has(v)) problems.push(`${seen.get(v)} and ${kid} share one public key`)
      else seen.set(v, kid)
    }
  }
  return problems
}

function secretMaterialProblems() {
  const problems = []
  const fixtures = join(ROOT, 'packages/license-token/fixtures')
  if (existsSync(fixtures)) problems.push(`the dev keypair fixtures shipped: ${fixtures}`)
  for (const root of SCAN_ROOTS) {
    for (const file of filesUnder(root)) {
      let size
      try {
        size = lstatSync(file).size
      } catch {
        continue
      }
      if (size > MAX_SCAN_BYTES) continue
      const text = readFileSync(file).toString('latin1')
      if (PEM_PRIVATE_KEY.test(text)) problems.push(`a PEM private key is baked into ${file}`)
      else if (JWK_ED25519.test(text) && JWK_PRIVATE_D.test(text))
        problems.push(`an Ed25519 private key (JWK "d") is baked into ${file}`)
    }
  }
  return problems
}

const problems = [...keyringProblems(), ...secretMaterialProblems()]
if (problems.length) {
  for (const p of problems) console.error(`license probe: ${p}`)
  process.exit(1)
}
console.log(
  `license probe: trusts exactly ${EXPECTED.join(', ')}; no dev keys, no private keys${RELEASE ? '; release: real keys, no placeholders' : ''}`,
)
