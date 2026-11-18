/**
 * Tests for the dev-license tool (scripts/license-dev-token.ts) and its committed dev1 keypair.
 *
 * Run: `pnpm exec tsx --test scripts/license-dev-token.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { verifyLicense } from '../packages/license-token/src/index.ts'
import {
  DEV_KID,
  devPayload,
  generateDevKeyFile,
  loadDevKey,
  mintDevToken,
  parseMintArgs,
} from './license-dev-token.ts'

const NOW = new Date('2026-10-09T12:00:00Z')

test('the committed dev1 fixture is self-consistent and in JWK form', () => {
  const key = loadDevKey()
  assert.equal(key.kid, DEV_KID)
  assert.match(key.publicKey, /^[A-Za-z0-9_-]{43}$/)
})

test('loadDevKey refuses a file whose public key does not match its private key', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-key-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'dev1.json')
  writeFileSync(
    path,
    JSON.stringify({ ...generateDevKeyFile(), publicKey: generateDevKeyFile().publicKey }),
  )
  assert.throws(() => loadDevKey(path), /does not match/)
})

test('mint defaults: Free-plan entitlements, env dev, 365 days', () => {
  const p = devPayload(parseMintArgs(['--org', 'Acme Dev AB'], NOW))
  assert.deepEqual(p.features, [
    'mcp',
    'vertical:accounting',
    'vertical:crm',
    'vertical:ecommerce',
    'vertical:logistics',
    'vertical:payments',
    'vertical:docsign',
    'vertical:projects',
    'vertical:customer-support',
    'vertical:inventory',
  ])
  assert.deepEqual(p.limits, { connections: 5, tenants: 1 })
  assert.equal(p.tier, 'free')
  assert.equal(p.env, 'dev')
  assert.equal(p.iat, '2026-10-09T12:00:00Z')
  assert.equal(p.exp, '2027-10-09T12:00:00Z')
  assert.match(p.sub, /^lic_dev[0-9a-f]{12}$/)
  assert.equal('label' in p, false)
})

test('a minted token verifies against dev1 with the requested claims', () => {
  const key = loadDevKey()
  const args = ['--org', 'Acme Dev AB', '--limit', 'connections=2', '--limit', 'seats=10']
  const token = mintDevToken(
    parseMintArgs([...args, '--label', 'laptop', '--tier', 'team'], NOW),
    key,
  )
  const r = verifyLicense(token, { dev1: key.publicKey }, NOW)
  assert.ok(r.ok)
  assert.equal(r.kid, 'dev1')
  assert.deepEqual(r.payload.limits, { connections: 2, tenants: 1, seats: 10 })
  assert.equal(r.payload.label, 'laptop')
  assert.equal(r.payload.tier, 'team')
  assert.equal(r.payload.env, 'dev')
})

test('--features replaces the default list', () =>
  assert.deepEqual(
    devPayload(parseMintArgs(['--org', 'X', '--features', 'mcp, vertical:crm'], NOW)).features,
    ['mcp', 'vertical:crm'],
  ))

test('--issued/--days mint already-expired tokens for GRACE/DEGRADED testing', () =>
  assert.equal(
    devPayload(
      parseMintArgs(['--org', 'X', '--issued', '2025-01-01T00:00:00Z', '--days', '30'], NOW),
    ).exp,
    '2025-01-31T00:00:00Z',
  ))

test('typos, missing values and malformed values are refused', () => {
  const bad: [string[], RegExp][] = [
    [['--org', 'X', '--connections', '9'], /unknown argument --connections/],
    [[], /--org is required/],
    [['--org'], /--org needs a value/],
    [['--org', 'X', '--org', 'Y'], /given twice/],
    [['--org', 'X', '--tier', 'Gold'], /--tier/],
    [['--org', 'X', '--limit', 'connections'], /--limit takes key=/],
    [['--org', 'X', '--limit', 'Seats=1'], /--limit takes key=/],
    [['--org', 'X', '--limit', 'seats=-1'], /--limit takes key=/],
    [['--org', 'X', '--days', '0'], /--days/],
    [['--org', 'X', '--days', '1.5'], /--days/],
    [['--org', 'X', '--issued', 'yesterday'], /--issued/],
  ]
  for (const [argv, message] of bad) assert.throws(() => parseMintArgs(argv, NOW), message)
})

test('the schema still guards what the flags let through (an org with edge spaces)', () =>
  assert.throws(() => mintDevToken(parseMintArgs(['--org', ' Acme '], NOW), loadDevKey()), {
    name: 'ZodError',
  }))

test('the script reads no environment variables (generate-env-example scans scripts/)', () =>
  assert.doesNotMatch(
    readFileSync(new URL('./license-dev-token.ts', import.meta.url), 'utf8'),
    /process\.env/,
  ))
