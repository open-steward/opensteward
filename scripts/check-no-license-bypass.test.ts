import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  blankStrings,
  findBypassViolations,
  insideTry,
  LICENSE_ENV_READER,
  LICENSING,
  needsScan,
  reachProblems,
  scanRepo,
  scanTree,
  stripLineComments,
  TOKEN_PKG,
} from './check-no-license-bypass.ts'

const REPO = join(import.meta.dirname, '..')
/**
 * Every finding must also survive scanRepo's pre-filter: a file outside
 * licensing that the TRIGGER test skips is never parsed, so a rule input the
 * pre-filter misses would be a rule that never runs on the real tree.
 */
const rules = (file: string, src: string) => {
  const found = findBypassViolations(file, src)
  if (found.length > 0) assert.ok(needsScan(file, src), `the pre-filter would skip ${file}: ${src}`)
  return found.map((v) => v.rule).sort()
}
const CONFIG = 'apps/integration-server/src/config.ts'
const KEYRING = 'packages/shared/src/licensing/keyring.ts'
const MANAGER = 'packages/shared/src/licensing/manager.ts'
const VERIFY = 'packages/license-token/src/verify.ts'
const SERVER = 'apps/integration-server/src/server.ts'
const CTX = "import { LicenseManager } from '@opensteward/shared/licensing'\n"

test('[L7:B04] an environment read named like a license switch fails', () => {
  assert.deepEqual(rules('apps/admin-api/src/server.ts', 'if (process.env.SKIP_LICENSE) return'), [
    'bypass-token',
    'license-env',
  ])
  assert.deepEqual(
    rules('packages/shared/src/a.ts', "const d = process.env['OPENSTEWARD_LICENSE_DEBUG']"),
    ['license-env'],
  )
  assert.deepEqual(
    rules('packages/shared/src/a.ts', 'const { ENTITLEMENTS_OVERRIDE } = process.env'),
    ['bypass-token', 'license-env'],
  )
  assert.deepEqual(rules('packages/shared/src/a.ts', "numericEnv('LICENSE_GRACE_DAYS')"), [
    'license-env',
  ])
  assert.deepEqual(
    rules('packages/shared/src/a.ts', 'const d = process?.env?.OPENSTEWARD_LICENSE_DEBUG'),
    ['license-env'],
  )
})

test('the two sanctioned variables are read only by integration-server config.ts (D-A)', () => {
  const src =
    "const t = process.env['OPENSTEWARD_LICENSE']\nconst f = process.env['OPENSTEWARD_LICENSE_FILE']"
  assert.deepEqual(rules(CONFIG, src), [])
  assert.deepEqual(rules('apps/admin-api/src/config.ts', src), ['license-env', 'license-env'])
})

test('[L7:B04] off-switch identifiers fail in any spelling', () => {
  for (const id of [
    'LICENSE_DISABLED',
    'DISABLE_LICENSE',
    'LICENSE_BYPASS',
    'IGNORE_LICENSE',
    'OPENSTEWARD_SKIP_LICENSE',
    'LICENSE_CHECK_OFF',
    'NO_LICENSE_CHECK',
    'skipLicenseCheck',
    'licenseDisabled',
    'isLicenseDisabled',
    'bypassLicense',
    'SkipLicense',
    'noLicenseCheck',
    // The toggle wordings: a name that ends in enabled/enforce/check after the license.
    'licenseEnabled',
    'LICENSE_ENFORCEMENT',
    'licenseCheck',
    'enforceLicense',
    'ENABLE_LICENSE',
    'entitlementsDisabled',
    'unlicensedMode',
    'ALLOW_UNLICENSED',
    // Required/optional, an override and a fake are off switches too.
    'requireLicense',
    'LICENSE_REQUIRED',
    'isLicenseRequired',
    'LICENSE_OPTIONAL',
    'optionalLicense',
    'LICENSE_OVERRIDE',
    'overrideLicense',
    'fakeLicense',
    'OPENSTEWARD_FAKE_LICENSE',
    'useFakeEntitlements',
    'RUN_UNLICENSED',
    // "unlicensed" beside a convenience reads as a switch too (review r14).
    'UNLICENSED_DEV',
    'UNLICENSED_ACCESS',
    'useUnlicensed',
    'unlicensedFallback',
    'dev_unlicensed',
    // Any override of the license is a side door, so a plural map of them is too.
    'licenseOverrides',
    // A verb that runs the check doubles as its switch (`runLicenseCheck: false`):
    // name such a function checkLicense… instead. Only a check can be an event,
    // so enforcement after an event-looking word stays a switch.
    'runLicenseCheck',
    'performLicenseCheck',
    'startLicenseCheck',
    'scheduleLicenseCheck',
    'RUN_LICENSE_ENFORCEMENT',
    'startLicenseEnforcement',
    'lastLicenseEnabled',
  ])
    assert.deepEqual(
      rules('packages/shared/src/x.ts', `const o = { ${id}: true }`),
      ['bypass-token'],
      id,
    )
  // Settings keys, CLI flags and member paths: lower snake_case, kebab-case, dotted.
  for (const src of [
    "settings.get('skip_license')",
    "const k = 'license_check_disabled'",
    "if (argv.includes('--skip-license')) return",
    "const f = '--disable-license'",
    "program.option('--no-license-check')",
    'if (!config.licenseEnabled) return',
    'if (!opts.enforceLicense) return',
    'const LICENSE_ENFORCEMENT = false',
    'buildServer({ licenseCheck: false })',
    'if (opts.unlicensedMode) return',
    "settings.get('license.enabled')",
    "settings.get('license.required')",
    'buildServer({ requireLicense: false })',
    'const LICENSE_REQUIRED = false',
    "program.option('--license-optional')",
    'const license = fakeLicense()',
    'buildServer({ runLicenseCheck: false })',
    "program.option('--unlicensed-dev')",
    "settings.get('unlicensed.access')",
  ])
    assert.deepEqual(rules('apps/integration-server/src/x.ts', src), ['bypass-token'], src)
})

test('ordinary license vocabulary is not a switch', () => {
  const src = [
    "const noLicense = source.kind === 'none'",
    'const LICENSE_CHECK_INTERVAL_MS = 3_600_000',
    'const code = LICENSE_ERROR_CODES.STATUS_UNAVAILABLE',
    'if (isLicenseError(e)) reply.code(403)',
    'const licenseOffset = 0',
    'const rows = checkLicense(opts)',
    'enforceLicenseLimit(connections)',
    'const LICENSE_HANDOFF = 1',
    'result.skippedUnentitled += 1',
    "log.warn('this deployment is unlicensed: license check skipped for the sandbox')",
    "const code = 'LICENSE_FEATURE_NOT_ENTITLED'",
    'const t = license.entitlements()',
  ].join('\n')
  assert.deepEqual(rules('apps/integration-server/src/licensing/admin-license-router.ts', src), [])
  // Names future code is likely to use: the license as the agent ("by"), the
  // unlicensed state rather than a mode, and a check as an event, not a toggle.
  for (const name of [
    'disabledByLicense',
    'skippedByLicense',
    'verticalsDisabledByLicense',
    'unlicensedVerticals',
    'isUnlicensed',
    'UNLICENSED_MESSAGE',
    'lastLicenseCheck',
    'nextLicenseCheck',
    'scheduledLicenseCheck',
    'previousLicenseCheck',
    'checkLicenseNow',
    // A predicate on what needs a license is not a switch.
    'requiresLicense',
    'featureRequiresLicense',
  ])
    assert.deepEqual(
      rules('apps/integration-server/src/x.ts', `const ${name} = 1`),
      [],
      `${name} is ordinary vocabulary`,
    )
})

test('licensing and the token package use no environment at all, not even NODE_ENV (P1)', () => {
  assert.deepEqual(rules(MANAGER, "const production = process.env.NODE_ENV === 'production'"), [
    'licensing-env',
  ])
  assert.deepEqual(rules(KEYRING, "const widen = process.env['OPENSTEWARD_MODE'] !== 'x'"), [
    'licensing-env',
  ]) // review A3 #7
  assert.deepEqual(rules(KEYRING, 'const { HOME } = process.env'), ['licensing-env'])
  assert.deepEqual(rules(KEYRING, "const e = process['env']"), ['licensing-env'])
  assert.deepEqual(rules(KEYRING, 'const { env } = process'), ['licensing-env'])
  assert.deepEqual(rules(KEYRING, 'const { env: e, argv } = process'), ['licensing-env'])
  assert.deepEqual(rules(KEYRING, 'const h = process?.env?.HOME'), ['licensing-env'])
  assert.deepEqual(rules(VERIFY, 'const e = process.env'), ['licensing-env'])
  assert.deepEqual(rules('apps/x/src/a.ts', "if (process.env.NODE_ENV !== 'production') log()"), [])
  assert.deepEqual(
    rules(KEYRING, '// Licensing never reads process.env.NODE_ENV\nexport const x = 1'),
    [],
    'a comment is not a read',
  )
})

test('getKeyring, verifyLicense and the dev key module stay inside licensing', () => {
  assert.deepEqual(rules(SERVER, 'const k = getKeyring()'), ['keyring-outside-licensing'])
  assert.deepEqual(rules(MANAGER, 'const k = getKeyring({ includeDevKeys: false })'), [])
  assert.deepEqual(rules(SERVER, 'verifyLicense(t, keys, new Date())'), [
    'keyring-outside-licensing',
  ])
  assert.deepEqual(
    rules('packages/shared/src/licensing/evaluate.ts', 'verifyLicense(t, keys, now)'),
    [],
  )
  assert.deepEqual(rules(VERIFY, 'export function verifyLicense(token: string) {}'), [])
  assert.deepEqual(rules('apps/admin-api/src/x.ts', "const p = 'keys.dev.js'"), [
    'keyring-outside-licensing',
  ])
})

test('dev kid literals live only in keys.dev.ts', () => {
  assert.deepEqual(rules(KEYRING, "if (kid === 'dev1') return"), ['dev-kid-literal'])
  assert.deepEqual(rules('packages/shared/src/licensing/evaluate.ts', 'const k = `devk1`'), [
    'dev-kid-literal',
  ])
  assert.deepEqual(
    rules('packages/shared/src/licensing/keys.dev.ts', "export const DEV_KEYS = { 'dev1': 'abc' }"),
    [],
  )
  assert.deepEqual(
    rules(KEYRING, "export const isDevKid = (kid: string) => kid.startsWith('dev')"),
    [],
  )
})

test('keys.dev is reachable only through a guarded require in keyring.ts', () => {
  const guarded =
    "let dev = {}\ntry {\n  dev = require('./keys.dev').DEV_KEYS\n} catch {\n  dev = {}\n}"
  assert.deepEqual(rules(KEYRING, guarded), [])
  assert.deepEqual(rules(KEYRING, "import { DEV_KEYS } from './keys.dev'"), ['dev-module-import'])
  assert.deepEqual(rules(KEYRING, "import { DEV_KEYS } from './keys.dev.js'"), [
    'dev-module-import',
  ])
  assert.deepEqual(rules(KEYRING, "export { DEV_KEYS } from './keys.dev'"), ['dev-module-import'])
  assert.deepEqual(rules(KEYRING, "const dev = require('./keys.dev').DEV_KEYS"), [
    'dev-module-import',
  ])
  assert.deepEqual(rules(KEYRING, "const m = await import('./keys.dev')"), ['dev-module-import'])
  assert.deepEqual(rules(MANAGER, guarded), ['dev-module-import'])
  // A backtick literal is the same specifier (A2c-2's DEV_MODULE_REF accepts it too).
  assert.deepEqual(rules(MANAGER, 'const dev = require(`./keys.dev`)'), ['dev-module-import'])
  assert.deepEqual(rules(MANAGER, 'const m = await import(`./keys.dev.js`)'), ['dev-module-import'])
  assert.deepEqual(rules(KEYRING, 'const dev = require(`./keys.dev`).DEV_KEYS'), [
    'dev-module-import',
  ])
  // In keyring.ts the one allowed form is the guarded require('./keys.dev'),
  // single or double quotes: no extension and no backtick, even inside the try.
  assert.deepEqual(rules(KEYRING, guarded.replace("'./keys.dev'", '"./keys.dev"')), [])
  for (const spec of ['`./keys.dev`', "'./keys.dev.js'", "'./keys.dev.ts'"])
    assert.deepEqual(
      rules(KEYRING, guarded.replace("'./keys.dev'", spec)),
      ['dev-module-import'],
      spec,
    )
})

test('[L7:B04] tier is display-only: no branching on it in code that touches licensing (§3)', () => {
  assert.deepEqual(rules(SERVER, `${CTX}if (license.current().tier === 'enterprise') allow()`), [
    'tier-branch',
  ])
  assert.deepEqual(rules(SERVER, `${CTX}if ('pro' !== status.tier) deny()`), ['tier-branch'])
  assert.deepEqual(rules(SERVER, `${CTX}switch (s.tier) { case 'free': break }`), ['tier-branch'])
  assert.deepEqual(rules(SERVER, `${CTX}const { tier } = s\nif (tier == 'pro') x()`), [
    'tier-branch',
  ])
  assert.deepEqual(
    rules('packages/shared/src/licensing/entitlements.ts', "if (p.tier === 'pro') return true"),
    ['tier-branch'],
  )
  // A lookup table, includes() or a string method keyed on tier gates just the same.
  for (const src of [
    "if (['pro', 'enterprise'].includes(s.tier)) allow()",
    'const on = TIER_FEATURES[s.tier]',
    'const on = TIER_FEATURES[license.current().tier]',
    "if (s.tier.startsWith('ent')) allow()",
    "if (s.tier?.endsWith('prise')) allow()",
    // A default inside includes(), a bracket read, and a renamed destructure.
    "if (['pro', 'enterprise'].includes(s.tier ?? '')) allow()",
    "if (s['tier'] === 'pro') allow()",
    "if (s?.['tier'] !== 'free') allow()",
    "const { tier: t } = s\nif (t === 'pro') allow()",
    "const { mode, tier: plan } = s\nswitch (plan) { case 'free': break }",
    // A plain alias (review r15): typed, defaulted, indexed, or from a call.
    "const t = s.tier\nif (t === 'pro') allow()",
    "let plan = status.tier ?? ''\nswitch (plan) { case 'free': break }",
    "const t: string | undefined = this.current().tier;\nif ('ent' === t) allow()",
    "const t = s['tier']\nif (t !== 'free') allow()",
    "var t = s?.tier, n = 1\nif (t == 'pro') allow()",
  ])
    assert.deepEqual(rules(SERVER, `${CTX}${src}`), ['tier-branch'], src)
  // Precision: a plain alias that is never compared, or a value derived from
  // tier rather than tier itself, is not an alias (review r15).
  for (const src of [
    'const t = s.tier\nlog(t)',
    "const label = s.tier ? 'Paid' : 'Free'\nif (label === 'Paid') show()",
    "const n = s.tier.length\nif (n === 'x') y()",
    "const c = s.tierCount\nif (c === 'x') y()",
  ])
    assert.deepEqual(rules(SERVER, `${CTX}${src}`), [], src)
  // Code that reaches licensing by a relative path, or only through the DTO, touches it too.
  // The first two name no license word, so the helper's needsScan assertion
  // also proves the pre-filter lets them through.
  for (const ctx of [
    "import { featureRefusal } from '../licensing/errors'\n",
    "import { communityStatus } from '../licensing'\n",
    "import { isLicenseError } from '../licensing/errors'\n",
    "import { inspectLicense } from '../licensing'\n",
    'export function view(s: LicenseStatusDTO) {}\n',
  ])
    assert.deepEqual(
      rules('packages/shared/src/control-plane/x.ts', `${ctx}if (s.tier === 'pro') allow()`),
      ['tier-branch'],
      ctx,
    )
  // A renamed destructure that is never compared is not a branch.
  assert.deepEqual(rules(SERVER, `${CTX}const { tier: t } = s\nlog(t)`), [])
  // Display code, and code that never touches licensing, are out of scope.
  assert.deepEqual(
    rules(
      'packages/shared/src/licensing/log.ts',
      "const t = s.tier === undefined ? '' : ` tier=${s.tier}`",
    ),
    [],
  )
  assert.deepEqual(
    rules('apps/admin/src/core/license-view.ts', `${CTX}const paid = s.tier !== 'free'`),
    [],
  )
  assert.deepEqual(
    rules(
      'apps/integration-server/src/verticals/crm/adapters/x/transform/contact.ts',
      "if (raw.tier === 'gold') vip = true",
    ),
    [],
  )
  // The token package's vocabulary check reads a bare slug, not a status's tier.
  assert.deepEqual(
    rules(
      'packages/license-token/src/vocab.ts',
      'export function isKnownTier(tier: string): tier is KnownTier {\n  return (KNOWN_TIERS as readonly string[]).includes(tier)\n}',
    ),
    [],
  )
})

test('licensing imports only crypto/fs/path, zod, the token package, db types and its own files (§5.9)', () => {
  const allowed = [
    "import { createHash } from 'node:crypto'",
    "import { readFileSync } from 'node:fs'",
    "import { watch, type FSWatcher } from 'fs'",
    "import { dirname, basename } from 'node:path'",
    "import { z } from 'zod'",
    "import { verifyLicense, type KeyMap } from '@opensteward/license-token'",
    "import type { DbHandle, DualMigration } from '../db/types'",
    "import type { DbHandle } from '../db/types.js'",
    "import {\n  classifyTime,\n  computeClock,\n} from './time'",
    "import {\n  readFileSync, // sync on purpose: one small file\n  statSync,\n} from 'node:fs'",
    "export { getKeyring } from './keyring'",
    "import { x } from '../licensing/time'",
    "export * from './types'",
    // fs/promises without the node: prefix, as fs and node:fs/promises are.
    "import { readFile } from 'fs/promises'",
    "import { readFile } from 'node:fs/promises'",
    "const c = process.getBuiltinModule('node:crypto')",
  ]
  for (const src of allowed) assert.deepEqual(rules(MANAGER, src), [], src)
  const refused = [
    "import axios from 'axios'",
    "import { request } from 'node:https'",
    "import { lookup } from 'node:dns'",
    "import { env } from 'node:process'",
    "import { RuntimeSettingsCache } from '../runtime-settings'",
    "import { openDb } from '../db'",
    "const h = await import('node:http')",
    "const u = require('undici')",
    "export * from '../control-plane/admin-guard'",
    'const m = await import(name)',
    // A trailing comment inside a multi-line brace list (prettier keeps it).
    "import {\n  request, // phone home\n  get,\n} from 'node:https'",
    // A relative path that starts './' but leaves licensing.
    "import { RuntimeSettingsCache } from './../runtime-settings'",
    "import { openDb } from './../db'",
    // A template literal with an interpolation is a computed import.
    "const h = await import(`node:${'https'}`)",
    'const h = await import(`./${name}`)',
    'const h = require(`node:${p}`)',
    // Node 22.3+ loads a built-in with no import statement at all.
    "const https = process.getBuiltinModule('node:https')",
    "const net = process.getBuiltinModule?.('net')",
    'const m = process.getBuiltinModule(name)',
  ]
  for (const src of refused) assert.deepEqual(rules(MANAGER, src), ['licensing-imports'], src)
  assert.deepEqual(rules(VERIFY, "import { fetch } from 'undici'"), ['licensing-imports'])
  assert.deepEqual(
    rules(VERIFY, "import type { DbHandle } from '../db/types'"),
    ['licensing-imports'],
    'the token package has no ../db',
  )
  assert.deepEqual(
    rules(VERIFY, "import { k } from './../../shared/src/licensing/keys.production'"),
    ['licensing-imports'],
    "the token package's own files are its own src only",
  )
  assert.deepEqual(
    rules(
      VERIFY,
      "import { createPublicKey, verify } from 'node:crypto'\nimport { z } from 'zod'\nimport { pae } from './pae'",
    ),
    [],
  )
  assert.deepEqual(
    rules(SERVER, "import axios from 'axios'"),
    [],
    'outside licensing nothing is restricted',
  )
})

test('licensing makes no network call through a global either: fetch, WebSocket and the like need no import (§5.9)', () => {
  const refused = [
    "const r = await fetch('https://opensteward.dev/check?k=' + kid)",
    'const r = await globalThis.fetch(u)',
    "const r = await globalThis['fetch'](u)",
    'const f = globalThis.fetch',
    "const ws = new WebSocket('wss://x')",
    "const es = new EventSource('https://x')",
    'const x = new XMLHttpRequest()',
    "navigator.sendBeacon('https://x', body)",
    // A global taken out of globalThis first, then called under another name.
    'const { fetch: f } = globalThis\nconst r = await f(u)',
    'const { WebSocket } = globalThis',
    'const g = globalThis\nconst r = await g.fetch(u)',
    // The global object under its other names: Node's global, a worker's self, a browser's window.
    'const r = await global.fetch(u)',
    'const r = await self.fetch(u)',
    'const r = await window.fetch(u)',
    'const ws = new global.WebSocket(u)',
    "const r = await global['fetch'](u)",
    // And cast, annotated or destructured from any of them.
    'const r = await (globalThis as any).fetch(u)',
    "const r = await (global as any)['fetch'](u)",
    'const g: any = globalThis\nconst r = await g.fetch(u)',
    'const g = globalThis as any\nconst r = await g.fetch(u)',
    'const g = (global as typeof globalThis)\nconst r = await g.fetch(u)',
    'const { fetch: f } = global\nconst r = await f(u)',
    'const { fetch: f }: typeof globalThis = globalThis\nconst r = await f(u)',
    // The global object as a parameter default or a plain assignment (review r16).
    'function f(g = globalThis) {\n  return g.fetch(u)\n}',
    'const f = (u: string, g: any = global) => g.fetch(u)',
    'let g\ng = globalThis\nconst r = await g.fetch(u)',
    // The global itself, taken without calling it (review r16).
    'const f = fetch\nconst r = await f(u)',
    'const r = await retry(fetch, u)',
    'const f = fetch.bind(globalThis)',
    'const Socket: typeof WebSocket = WebSocket',
  ]
  for (const src of refused) assert.deepEqual(rules(MANAGER, src), ['licensing-network'], src)
  assert.deepEqual(rules(VERIFY, 'const r = await fetch(url)'), ['licensing-network'])
  assert.deepEqual(
    rules(MANAGER, 'const fetched = this.prefetch\nconst refetchAt = 1'),
    [],
    'only the global call, not a word that contains it',
  )
  // A method that happens to be called fetch, and the text inside a string, are not the global.
  for (const src of [
    'const row = this.store.fetch(id)',
    'const row = await db?.fetch(id)',
    "log.warn('could not fetch() the license file')",
    'const hint = "call fetch(url) elsewhere"',
    'const msg = `no fetch( here`',
    'const { structuredClone } = globalThis',
    // A property that happens to be named like the global object is not it.
    'const row = await this.window.fetch(id)',
    'const row = opts.global.fetch(id)',
    'const g = globalConfig\nconst w = global.process',
    // Neither a comparison with the global object, a type of the global, nor a
    // name that merely starts with one, is a reference to it (review r16).
    "const isNode = typeof window === 'undefined'",
    'if (g === globalThis) done()',
    'const n = fetchCount\nrecord(fetched, fetchLimit)',
    'type Fetcher = typeof fetch',
    'function f(x = globalThis.structuredClone) {}',
  ])
    assert.deepEqual(rules(MANAGER, src), [], src)
  assert.deepEqual(
    rules(SERVER, 'const r = await fetch(url)'),
    [],
    'outside licensing a fetch is not a license call',
  )
})

test('stripLineComments blanks whole-line comments and keeps the line count', () => {
  const src =
    "/**\n * process.env.SKIP_LICENSE\n */\nconst a = 1 // trailing\n// 'dev1'\nconst b = 2"
  const out = stripLineComments(src)
  assert.equal(out.split('\n').length, src.split('\n').length)
  assert.doesNotMatch(out, /SKIP_LICENSE|'dev1'/)
  assert.match(out, /const a = 1 \/\/ trailing/)
})

test('blankStrings empties string contents and keeps every offset', () => {
  const src = "a('fetch(x)') + \"it's\" + `t ${fetch(u)}` + `fetch(`\nb()"
  const out = blankStrings(src)
  assert.equal(out.length, src.length)
  assert.equal(out.split('\n').length, 2)
  assert.equal(out.indexOf('b()'), src.indexOf('b()'))
  // Only the interpolated template keeps its text: that fetch is code.
  assert.equal(out.match(/fetch/g)?.length, 1)
  assert.match(out, /\$\{fetch\(u\)\}/)
})

test('insideTry sees the block, not what follows it', () => {
  const s = 'try { a() } catch {}\nb()'
  assert.equal(insideTry(s, s.indexOf('a()')), true)
  assert.equal(insideTry(s, s.indexOf('b()')), false)
})

test('scanRepo reads every apps/*/src and packages/*/src file, parses licensing always and the rest past the pre-filter, and skips tests', () => {
  const root = mkdtempSync(join(tmpdir(), 'no-license-bypass-'))
  const put = (path: string, src: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), src)
  }
  const BAD = 'if (process.env.SKIP_LICENSE) process.exit(0)\n'
  try {
    // Read and parsed: the pre-filter must let these through.
    put('apps/a/src/x.ts', BAD)
    put('apps/a/src/deep/nested/w.tsx', 'export const o = { licenseDisabled: true }\n')
    put(LICENSE_ENV_READER, "export const t = process.env['OPENSTEWARD_LICENSE']\n")
    // Read, not parsed: no trigger word.
    put('apps/a/src/y.ts', 'export const y = 1\n')
    // No trigger word either: parsed only because they sit in licensing or the token package.
    put(`${LICENSING}k.ts`, 'export const h = process.env.HOME\n')
    put(`${LICENSING}net.ts`, 'export const ping = (u: string) => fetch(u)\n')
    put(`${TOKEN_PKG}v.ts`, "import axios from 'axios'\n")
    // Never read: tests, fixtures, builds, dependencies, non-code, and anything outside <top>/<name>/src.
    for (const path of [
      'apps/a/src/tests/t.ts',
      'apps/a/src/__tests__/t.ts',
      'apps/a/src/fixtures/f.ts',
      'apps/a/src/z.test.ts',
      'apps/a/src/z.spec.ts',
      'apps/a/src/dist/d.js',
      'apps/a/src/node_modules/m/index.js',
      'apps/a/src/notes.md',
      'apps/a/scripts/s.ts',
      'apps/a/dist/index.js',
      'scripts/r.ts',
      `${TOKEN_PKG}tests/t.ts`,
    ])
      put(path, BAD)

    const result = scanTree(root)
    assert.deepEqual(
      result.violations.map((v) => `${v.file} ${v.rule}`).sort(),
      [
        'apps/a/src/deep/nested/w.tsx bypass-token',
        'apps/a/src/x.ts bypass-token',
        'apps/a/src/x.ts license-env',
        `${LICENSING}k.ts licensing-env`,
        `${LICENSING}net.ts licensing-network`,
        `${TOKEN_PKG}v.ts licensing-imports`,
      ].sort(),
    )
    assert.deepEqual(
      [...result.read].sort(),
      [
        'apps/a/src/deep/nested/w.tsx',
        'apps/a/src/x.ts',
        'apps/a/src/y.ts',
        LICENSE_ENV_READER,
        `${LICENSING}k.ts`,
        `${LICENSING}net.ts`,
        `${TOKEN_PKG}v.ts`,
      ].sort(),
    )
    assert.deepEqual(
      [...result.scanned].sort(),
      result.read.filter((f) => f !== 'apps/a/src/y.ts').sort(),
    )
    assert.deepEqual(scanRepo(root), result.violations)
    assert.deepEqual(reachProblems(result), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a scan that reaches neither config.ts nor licensing reports it rather than passing', () => {
  const root = mkdtempSync(join(tmpdir(), 'no-license-bypass-empty-'))
  try {
    const result = scanTree(root)
    assert.deepEqual(result.violations, [])
    const problems = reachProblems(result)
    assert.equal(problems.length, 3, problems.join('\n'))
    for (const [i, path] of [LICENSE_ENV_READER, LICENSING, TOKEN_PKG].entries())
      assert.match(problems[i]!, new RegExp(path.replace(/[.]/g, '\\.')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the real tree has no license bypass, and the scan reached the code it guards', () => {
  for (const path of [LICENSING, TOKEN_PKG, LICENSE_ENV_READER])
    assert.ok(existsSync(join(REPO, path)), `${path} does not exist: update the guard's paths`)
  const result = scanTree()
  assert.deepEqual(result.violations, [])
  assert.deepEqual(reachProblems(result), [])
  for (const file of [
    LICENSE_ENV_READER,
    SERVER,
    MANAGER,
    KEYRING,
    VERIFY,
    'apps/admin-api/src/core/license/status-cache.ts',
  ])
    assert.ok(result.scanned.includes(file), `${file} was not scanned`)
  // integration-server alone holds well over 10,000 source files.
  assert.ok(result.read.length > 10_000, `only ${result.read.length} files read`)
})

// main() is what CI runs. The tests above call scanTree and reachProblems
// directly, so they stay green when main() stops failing on what they report.
// This runs a copy of the script over a fixture repository: the script scans
// the tree its own directory hangs off.
test('the CLI fails on a finding (--soft only reports it) and on a scan that reached nothing (even with --soft)', () => {
  // A real path: on macOS tmpdir() is a symlink, and the script only runs as
  // main when its own path matches argv[1].
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'no-license-bypass-cli-')))
  const put = (path: string, src: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), src)
  }
  const script = join(root, 'scripts', 'check-no-license-bypass.ts')
  const cli = (args: string[] = []) => {
    const res = spawnSync(join(REPO, 'node_modules', '.bin', 'tsx'), [script, ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 60_000,
    })
    const out = `${res.stdout}\n${res.stderr}`
    assert.equal(res.error, undefined, out)
    return { status: res.status, stdout: res.stdout, stderr: res.stderr, out }
  }
  try {
    mkdirSync(join(root, 'scripts'))
    copyFileSync(join(import.meta.dirname, 'check-no-license-bypass.ts'), script)

    const unreached = cli(['--soft'])
    assert.equal(unreached.status, 1, unreached.out)
    assert.match(unreached.stderr, /did not reach the code it guards/, unreached.out)

    put(LICENSE_ENV_READER, "export const t = process.env['OPENSTEWARD_LICENSE']\n")
    put(`${LICENSING}k.ts`, 'export const k = 1\n')
    put(`${TOKEN_PKG}v.ts`, 'export const v = 1\n')
    const clean = cli()
    assert.equal(clean.status, 0, clean.out)
    assert.match(clean.stdout, /✓ No license off switch/, clean.out)

    put('apps/a/src/x.ts', 'if (process.env.SKIP_LICENSE) process.exit(0)\n')
    const hard = cli()
    assert.equal(hard.status, 1, hard.out)
    assert.match(hard.stderr, /apps\/a\/src\/x\.ts:1 \[bypass-token\]/, hard.out)
    assert.doesNotMatch(hard.stdout, /✓/, hard.out)

    const soft = cli(['--soft'])
    assert.equal(soft.status, 0, soft.out)
    assert.match(soft.stderr, /apps\/a\/src\/x\.ts:1 \[bypass-token\]/, soft.out)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
