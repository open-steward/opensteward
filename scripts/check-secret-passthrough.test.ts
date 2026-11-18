/**
 * Tests for the generated-secret passthrough guard.
 *
 * The two failure modes this guard exists for are pinned directly: a secret
 * missing from its service's environment block, and a secret forwarded to
 * the wrong service (e.g. under `admin` instead of `admin-api`).
 *
 * Run: `pnpm exec tsx --test scripts/check-secret-passthrough.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseGeneratedSecrets,
  parseEnvReaders,
  parseComposeEnv,
  findPassthroughGaps,
  findKnobGaps,
  parseConfigLoaderVars,
  parseComposeEnvNames,
  findRequiredPassthroughGaps,
  findOverlayExclusiveGaps,
  formatReport,
  parseComposeEnvFiles,
  REQUIRED_PASSTHROUGH,
  type PassthroughGap,
} from './check-secret-passthrough.ts'

const GENERATOR = `#!/usr/bin/env bash
gen() { openssl rand -hex 32; }
SESSION_SECRET=$(gen)
BOOTSTRAP_TOKEN=$(gen)
# Not minted by the script — an operator-supplied value, not our problem:
POSTGRES_URL=postgres://localhost/db
`

const ENV_EXAMPLE = `# SESSION_SECRET — required
#   Signs the admin session cookie.
#   read by: apps/admin/src/config.ts
SESSION_SECRET=

# BOOTSTRAP_TOKEN — optional
#   (no description)
#   read by: apps/admin-api/src/config.ts
BOOTSTRAP_TOKEN=

# STORE_SECRET — required
#   read by: packages/shared/src/auth/store.ts
STORE_SECRET=
`

function compose(adminApiVars: string[]): string {
  return `services:
  admin:
    environment:
      - SESSION_SECRET=\${SESSION_SECRET:-}
  admin-api:
    environment:
${adminApiVars.map((v) => `      - ${v}=\${${v}:-}`).join('\n')}
`
}

test('only counts secrets the generator actually mints', () => {
  assert.deepEqual(parseGeneratedSecrets(GENERATOR), ['SESSION_SECRET', 'BOOTSTRAP_TOKEN'])
})

test('reads the generated `read by:` annotations into workspaces', () => {
  const readers = parseEnvReaders(ENV_EXAMPLE)
  assert.deepEqual(readers.get('BOOTSTRAP_TOKEN'), ['apps/admin-api'])
  assert.deepEqual(readers.get('STORE_SECRET'), ['packages/shared'])
})

test('records the host variable a compose entry interpolates', () => {
  const parsed = parseComposeEnv(compose(['BOOTSTRAP_TOKEN']))
  assert.ok(parsed.get('admin-api')?.has('BOOTSTRAP_TOKEN'))
  assert.ok(!parsed.get('admin')?.has('BOOTSTRAP_TOKEN'))
})

test('flags a generated secret its reader service never receives', () => {
  const gaps = findPassthroughGaps(
    parseGeneratedSecrets(GENERATOR),
    parseEnvReaders(ENV_EXAMPLE),
    parseComposeEnv(compose([])),
  )
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0]?.secret, 'BOOTSTRAP_TOKEN')
  assert.equal(gaps[0]?.service, 'admin-api')
})

test('flags a secret forwarded to the wrong service', () => {
  // BOOTSTRAP_TOKEN under `admin` instead of `admin-api`: present in the file,
  // greppable, and still never reaching the process that reads it.
  const misplaced = `services:
  admin:
    environment:
      - SESSION_SECRET=\${SESSION_SECRET:-}
      - BOOTSTRAP_TOKEN=\${BOOTSTRAP_TOKEN:-}
  admin-api:
    environment:
      - JWT_SECRET=\${JWT_SECRET:-}
`
  const gaps = findPassthroughGaps(
    ['BOOTSTRAP_TOKEN'],
    parseEnvReaders(ENV_EXAMPLE),
    parseComposeEnv(misplaced),
  )
  assert.equal(gaps.length, 1)
  assert.match(gaps[0]?.reason ?? '', /apps\/admin-api/)
})

test('passes when every generated secret reaches its reader', () => {
  const gaps = findPassthroughGaps(
    parseGeneratedSecrets(GENERATOR),
    parseEnvReaders(ENV_EXAMPLE),
    parseComposeEnv(compose(['BOOTSTRAP_TOKEN'])),
  )
  assert.deepEqual(gaps, [])
})

test('a shared-only secret satisfies the rule from any service', () => {
  const gaps = findPassthroughGaps(
    ['STORE_SECRET'],
    parseEnvReaders(ENV_EXAMPLE),
    parseComposeEnv(compose(['STORE_SECRET'])),
  )
  assert.deepEqual(gaps, [])
})

test('flags a documented knob a service reads but compose never forwards', () => {
  // RATE_LIMIT_MAX: read by integration-server's config loader, documented in
  // .env.example as the way to tune the limit, and absent from compose — so the
  // mounted config.yml's 100/min wins and raising it in .env does nothing.
  const configSource = `
    rateLimitMax: Number(process.env['RATE_LIMIT_MAX']) || fromYaml.rateLimitMax,
    port: Number(process.env.PORT) || 3010,
  `
  const vars = parseConfigLoaderVars(configSource)
  assert.deepEqual(vars.sort(), ['PORT', 'RATE_LIMIT_MAX'])

  const documented = new Set(['RATE_LIMIT_MAX', 'PORT'])
  const compose = parseComposeEnvNames(`services:
  integration-server:
    environment:
      - STORE_SECRET=\${STORE_SECRET:-}
`)
  const gaps = findKnobGaps('integration-server', vars, documented, compose)
  assert.equal(gaps.length, 1, 'PORT is exempt (fixed by the image); RATE_LIMIT_MAX is not')
  assert.equal(gaps[0]?.secret, 'RATE_LIMIT_MAX')
})

test('passes once the knob is forwarded', () => {
  const compose = parseComposeEnvNames(`services:
  integration-server:
    environment:
      - RATE_LIMIT_MAX=\${RATE_LIMIT_MAX:-}
`)
  const gaps = findKnobGaps(
    'integration-server',
    ['RATE_LIMIT_MAX'],
    new Set(['RATE_LIMIT_MAX']),
    compose,
  )
  assert.deepEqual(gaps, [])
})

test('ignores a variable no service config reads', () => {
  const compose = parseComposeEnvNames(`services:
  integration-server:
    environment: []
`)
  assert.deepEqual(findKnobGaps('integration-server', [], new Set(['ANYTHING']), compose), [])
})

test('a knob set to a literal value in compose still counts as forwarded', () => {
  // `- ADMIN_API_URL=http://admin-api:3001` is service DNS, not an operator
  // value interpolated from .env — the container still receives the variable,
  // so it is not a gap. Tracking only ${...} interpolations would flag both
  // ADMIN_API_URL and INTEGRATION_SERVER_URL as missing even though the
  // containers receive them.
  const compose = parseComposeEnvNames(`services:
  admin:
    environment:
      - ADMIN_API_URL=http://admin-api:3001
`)
  const gaps = findKnobGaps('admin', ['ADMIN_API_URL'], new Set(['ADMIN_API_URL']), compose)
  assert.deepEqual(gaps, [])
})

// ── Third rule: REQUIRED_PASSTHROUGH (the license reaches integration-server only)

const license = (src: string) =>
  findRequiredPassthroughGaps(
    REQUIRED_PASSTHROUGH,
    parseComposeEnv(src),
    parseComposeEnvNames(src),
    parseComposeEnvFiles(src),
  )
const IS_BOTH =
  '      - OPENSTEWARD_LICENSE=${OPENSTEWARD_LICENSE:-}\n' +
  '      - OPENSTEWARD_LICENSE_FILE=${OPENSTEWARD_LICENSE_FILE:-/etc/opensteward/license/license.key}'

test('the license reaches integration-server wherever .env.example says it is read', () => {
  const gaps = license(
    'services:\n  integration-server:\n    environment:\n      - PORT=3010\n  admin-api:\n    environment: []\n',
  )
  assert.deepEqual(gaps.map((g) => `${g.secret}@${g.service}`).sort(), [
    'OPENSTEWARD_LICENSE@integration-server',
    'OPENSTEWARD_LICENSE_FILE@integration-server',
  ])
})

test('forwarding the license to a second service is refused (single license authority, D-A)', () => {
  const gaps = license(
    `services:\n  integration-server:\n    environment:\n${IS_BOTH}\n  admin-api:\n    environment:\n      - OPENSTEWARD_LICENSE=\${OPENSTEWARD_LICENSE:-}\n`,
  )
  assert.equal(gaps.length, 1)
  assert.equal(gaps[0]?.service, 'admin-api')
  assert.match(gaps[0]?.reason ?? '', /only integration-server/)
})

test('forwarding the license value under another name is refused too', () => {
  // `LICENSE_TOKEN=${OPENSTEWARD_LICENSE}` hands admin-api the same token as a
  // differently named variable: still a second copy of the license.
  const gaps = license(
    `services:\n  integration-server:\n    environment:\n${IS_BOTH}\n  admin-api:\n    environment:\n      - LICENSE_TOKEN=\${OPENSTEWARD_LICENSE:-}\n`,
  )
  assert.deepEqual(
    gaps.map((g) => `${g.secret}@${g.service}`),
    ['OPENSTEWARD_LICENSE@admin-api'],
  )
})

test('a literal value is not a forward from .env; a default value still is', () => {
  const gaps = license(
    'services:\n  integration-server:\n    environment:\n      - OPENSTEWARD_LICENSE=\n' +
      '      - OPENSTEWARD_LICENSE_FILE=${OPENSTEWARD_LICENSE_FILE:-/etc/opensteward/license/license.key}\n',
  )
  assert.deepEqual(
    gaps.map((g) => g.secret),
    ['OPENSTEWARD_LICENSE'],
  )
})

test('an env_file on another service is refused: it hands over whatever the file sets', () => {
  // `env_file: .env` loads the operator's whole .env, OPENSTEWARD_LICENSE
  // included, without one line of `environment:` naming it.
  for (const envFile of [
    'env_file: .env',
    'env_file:\n      - ./.env',
    'env_file:\n      - path: ./config/admin.env\n        required: false',
  ]) {
    const gaps = license(
      `services:\n  integration-server:\n    environment:\n${IS_BOTH}\n  admin-api:\n    ${envFile}\n    environment:\n      - PORT=3001\n`,
    )
    assert.deepEqual(
      gaps.map((g) => `${g.secret}@${g.service}:${g.kind}`).sort(),
      ['OPENSTEWARD_LICENSE@admin-api:exclusive', 'OPENSTEWARD_LICENSE_FILE@admin-api:exclusive'],
      envFile,
    )
    assert.match(gaps[0]?.reason ?? '', /env_file/, envFile)
  }
  // integration-server may load one: it is the license authority.
  assert.deepEqual(
    license(`services:\n  integration-server:\n    env_file: .env\n    environment:\n${IS_BOTH}\n`),
    [],
  )
})

test('parseComposeEnvFiles reads every env_file form', () => {
  const files = parseComposeEnvFiles(
    'services:\n  a:\n    env_file: .env\n  b:\n    env_file: [x.env, {path: y.env, required: false}]\n  c:\n    image: z\n',
  )
  assert.deepEqual(files.get('a'), ['.env'])
  assert.deepEqual(files.get('b'), ['x.env', 'y.env'])
  assert.equal(files.has('c'), false)
})

// ── The report (m52): what the gate prints for each outcome

const REPORT_BASE = {
  generated: ['BOOTSTRAP_TOKEN'],
  readers: new Map([['BOOTSTRAP_TOKEN', ['apps/admin-api']]]),
  required: REQUIRED_PASSTHROUGH,
}
const gap = (kind: PassthroughGap['kind'], secret: string, service: string): PassthroughGap => ({
  secret,
  service,
  reason: `${kind} reason`,
  kind,
})

test('a clean run says rule three passed too', () => {
  const { stdout, stderr } = formatReport({ ...REPORT_BASE, gaps: [] })
  assert.deepEqual(stderr, [])
  const text = stdout.join('\n')
  assert.match(text, /✓ OPENSTEWARD_LICENSE → integration-server only/)
  assert.match(text, /✓ OPENSTEWARD_LICENSE_FILE → integration-server only/)
  assert.match(
    text,
    /✓ Every generated secret reaches the service that reads it, every documented knob is forwarded, and OPENSTEWARD_LICENSE, OPENSTEWARD_LICENSE_FILE reach integration-server and no other service\./,
  )
})

test('a variable that reaches a forbidden service is not reported as never reaching one', () => {
  const { stdout, stderr } = formatReport({
    ...REPORT_BASE,
    gaps: [gap('exclusive', 'OPENSTEWARD_LICENSE', 'admin-api')],
  })
  const err = stderr.join('\n')
  assert.match(err, /1 variable\(s\) reach a service that must not receive them:/)
  assert.doesNotMatch(err, /never reach/)
  assert.doesNotMatch(err, /Add the variable/)
  assert.match(err, /remove it from the other one/)
  assert.match(stdout.join('\n'), /✖ OPENSTEWARD_LICENSE → integration-server only/)
})

test('a missing forward keeps its own header and hint, apart from an exclusive one', () => {
  const { stderr } = formatReport({
    ...REPORT_BASE,
    gaps: [
      gap('missing', 'BOOTSTRAP_TOKEN', 'admin-api'),
      gap('exclusive', 'OPENSTEWARD_LICENSE_FILE', 'admin'),
    ],
  })
  const err = stderr.join('\n')
  assert.match(
    err,
    /1 variable\(s\) never reach their service:\n {2}- BOOTSTRAP_TOKEN: missing reason/,
  )
  assert.match(err, /Add the variable to that service's `environment:` block/)
  assert.match(
    err,
    /1 variable\(s\) reach a service that must not receive them:\n {2}- OPENSTEWARD_LICENSE_FILE \(admin\): exclusive reason/,
  )
})

test('passes when only integration-server forwards both', () =>
  assert.deepEqual(license(`services:\n  integration-server:\n    environment:\n${IS_BOTH}\n`), []))

test('docker-compose.yml forwards the license to integration-server only', () => {
  const src = readFileSync(join(import.meta.dirname, '..', 'docker-compose.yml'), 'utf8')
  assert.deepEqual(license(src), [])
})

test('an overlay may not hand the license to another service, by environment or env_file (review r6)', () => {
  const gaps = findOverlayExclusiveGaps(
    'docker-compose.extra.yml',
    'services:\n  admin-api:\n    ports: !reset []\n    env_file: .env\n' +
      '  worker:\n    environment:\n      - LICENSE_TOKEN=${OPENSTEWARD_LICENSE}\n',
  )
  assert.deepEqual(gaps.map((g) => `${g.secret}@${g.service}`).sort(), [
    'OPENSTEWARD_LICENSE@admin-api',
    'OPENSTEWARD_LICENSE@worker',
    'OPENSTEWARD_LICENSE_FILE@admin-api',
  ])
  assert.ok(
    gaps.every((g) => g.kind === 'exclusive' && g.reason.startsWith('docker-compose.extra.yml: ')),
  )
  // An overlay need not repeat the forward, and may restate it for integration-server.
  assert.deepEqual(
    findOverlayExclusiveGaps('o.yml', 'services:\n  admin-api:\n    ports: []\n'),
    [],
  )
  assert.deepEqual(
    findOverlayExclusiveGaps(
      'o.yml',
      `services:\n  integration-server:\n    environment:\n${IS_BOTH}\n`,
    ),
    [],
  )
  assert.deepEqual(findOverlayExclusiveGaps('empty.yml', ''), [])
})

test('every root overlay keeps the license on integration-server alone', () => {
  const root = join(import.meta.dirname, '..')
  const overlays = readdirSync(root).filter((f) => /^docker-compose\..+\.ya?ml$/.test(f))
  assert.ok(overlays.length > 0, 'no overlay found (parser guard)')
  for (const file of overlays) {
    assert.deepEqual(
      findOverlayExclusiveGaps(file, readFileSync(join(root, file), 'utf8')),
      [],
      file,
    )
  }
})
