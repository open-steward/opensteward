#!/usr/bin/env tsx
/**
 * Dev licenses for local testing, signed by the NON-PRODUCTION key dev1.
 *
 *   pnpm license:dev-token mint --org "Acme Dev AB" [--days 365] [--issued <ISO date-time>]
 *        [--features mcp,vertical:crm] [--limit connections=5] [--limit tenants=1]
 *        [--tier free] [--label laptop] [--sub lic_dev…]
 *   pnpm license:dev-token inspect <token>
 *   pnpm license:dev-token keygen [--force]   # once: writes packages/license-token/fixtures/dev1.json
 *
 * `mint` prints only the token on stdout, so `TOKEN=$(pnpm -s license:dev-token mint …)` works.
 * Defaults are the Free plan: mcp plus every vertical, 5 connections, 1 tenant, 365 days.
 * `--limit` repeats and also takes keys the product does not know yet. Every token carries
 * env "dev" and kid "dev1". Production images never trust dev1 (Phase A2 strips the dev key
 * module from production builds), so a dev token there is INVALID. The keypair is committed on
 * purpose and signs nothing else. Reads no environment variables: scripts/generate-env-example.ts
 * scans scripts/.
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LICENSE_AUDIENCE,
  LICENSE_ISSUER,
  LIMIT_KEY_PATTERN,
  TIER_PATTERN,
  VERTICALS,
  assembleToken,
  buildSigningInput,
  toClaimTime,
  verifyLicense,
  verticalFeature,
  type LicensePayload,
} from '../packages/license-token/src/index.ts'

const REPO_ROOT = join(import.meta.dirname, '..')
export const DEV_KID = 'dev1'
export const DEV_KEY_PATH = join(REPO_ROOT, 'packages', 'license-token', 'fixtures', 'dev1.json')
const DAY_MS = 86_400_000

/** The committed fixture. JWK, not PEM, so secret scanners have nothing to flag. */
export interface DevKeyFile {
  kid: string
  comment: string
  publicKey: string
  privateKeyJwk: { kty: 'OKP'; crv: 'Ed25519'; x: string; d: string }
}
export interface DevKey {
  kid: string
  publicKey: string
  privateKey: KeyObject
}

export function generateDevKeyFile(): DevKeyFile {
  const jwk = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' })
  if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.x || !jwk.d) {
    throw new Error('unexpected Ed25519 JWK export')
  }
  return {
    kid: DEV_KID,
    comment:
      'NON-PRODUCTION license signing key, public on purpose so anyone can mint local dev licenses. Production builds never trust kid dev1. Never use it for anything else.',
    publicKey: jwk.x,
    privateKeyJwk: { kty: 'OKP', crv: 'Ed25519', x: jwk.x, d: jwk.d },
  }
}

export function loadDevKey(path: string = DEV_KEY_PATH): DevKey {
  const file = JSON.parse(readFileSync(path, 'utf8')) as DevKeyFile
  const privateKey = createPrivateKey({ key: file.privateKeyJwk, format: 'jwk' })
  const derived = createPublicKey(privateKey).export({ format: 'jwk' }).x
  if (file.kid !== DEV_KID || derived !== file.publicKey) {
    throw new Error(`${path}: publicKey does not match privateKeyJwk (or kid is not ${DEV_KID})`)
  }
  return { kid: file.kid, publicKey: file.publicKey, privateKey }
}

export interface MintOptions {
  org: string
  tier: string
  features: string[]
  limits: LicensePayload['limits']
  label?: string
  sub: string
  issuedAt: Date
  days: number
}
const FLAGS = new Set(['org', 'tier', 'features', 'limit', 'label', 'sub', 'issued', 'days'])

export function parseMintArgs(argv: readonly string[], now: Date): MintOptions {
  const values = new Map<string, string>()
  const limits: LicensePayload['limits'] = { connections: 5, tenants: 1 } // Free (D-B)
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]!
    const value = argv[i + 1]
    const name = flag.startsWith('--') ? flag.slice(2) : ''
    if (!FLAGS.has(name)) throw new Error(`unknown argument ${flag}`)
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`)
    if (name === 'limit') {
      const eq = value.indexOf('=')
      const key = value.slice(0, eq)
      const n = Number(value.slice(eq + 1))
      if (eq < 1 || !LIMIT_KEY_PATTERN.test(key) || !/^\d+$/.test(value.slice(eq + 1))) {
        throw new Error(`--limit takes key=<non-negative integer>, got ${value}`)
      }
      if (!Number.isSafeInteger(n)) throw new Error(`--limit ${key} must be a safe integer`)
      limits[key] = n
      continue
    }
    if (values.has(name)) throw new Error(`${flag} given twice`)
    values.set(name, value)
  }
  const org = values.get('org')
  if (!org) throw new Error('--org is required')
  const tier = values.get('tier') ?? 'free'
  if (!TIER_PATTERN.test(tier)) throw new Error(`--tier must match ${TIER_PATTERN}`)
  const issuedRaw = values.get('issued')
  const issuedAt = issuedRaw === undefined ? now : new Date(issuedRaw)
  if (Number.isNaN(issuedAt.getTime())) throw new Error('--issued must be an ISO date-time')
  const daysRaw = values.get('days') ?? '365'
  const days = Number(daysRaw)
  if (!/^\d+$/.test(daysRaw) || !Number.isSafeInteger(days) || days < 1) {
    throw new Error('--days must be a whole number >= 1')
  }
  const features = values
    .get('features')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? ['mcp', ...VERTICALS.map(verticalFeature)]
  return {
    org,
    tier,
    features,
    limits,
    label: values.get('label'),
    sub: values.get('sub') ?? `lic_dev${randomBytes(6).toString('hex')}`,
    issuedAt,
    days,
  }
}

export function devPayload(o: MintOptions): LicensePayload {
  const iat = toClaimTime(o.issuedAt)
  const payload: LicensePayload = {
    iss: LICENSE_ISSUER,
    aud: LICENSE_AUDIENCE,
    sub: o.sub,
    org: o.org,
    tier: o.tier,
    features: o.features,
    limits: o.limits,
    env: 'dev',
    iat,
    nbf: iat,
    exp: toClaimTime(new Date(Date.parse(iat) + o.days * DAY_MS)),
    ver: 1,
  }
  if (o.label !== undefined) payload.label = o.label
  return payload
}

/** Throws a ZodError when the options make an invalid payload (e.g. an org with edge spaces). */
export function mintDevToken(o: MintOptions, key: DevKey): string {
  const payload = devPayload(o)
  const footer = { kid: key.kid }
  return assembleToken(
    payload,
    footer,
    sign(null, buildSigningInput(payload, footer), key.privateKey),
  )
}

function main(): void {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'keygen') {
    if (existsSync(DEV_KEY_PATH) && !rest.includes('--force')) {
      console.error(
        `✖ ${DEV_KEY_PATH} exists. --force replaces it and invalidates every dev token and keys.dev.ts.`,
      )
      process.exitCode = 1
      return
    }
    writeFileSync(DEV_KEY_PATH, `${JSON.stringify(generateDevKeyFile(), null, 2)}\n`)
    console.error(`✓ wrote ${DEV_KEY_PATH}`)
    return
  }
  if (command === 'mint') {
    process.stdout.write(`${mintDevToken(parseMintArgs(rest, new Date()), loadDevKey())}\n`)
    console.error(
      'Dev license (env "dev", kid dev1). Use OPENSTEWARD_LICENSE=<token> or save it as license.key.',
    )
    return
  }
  if (command === 'inspect' && rest.length === 1) {
    const key = loadDevKey()
    const result = verifyLicense(rest[0]!.trim(), { [key.kid]: key.publicKey }, new Date())
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return
  }
  console.error(
    'usage: pnpm license:dev-token mint --org <name> [...] | inspect <token> | keygen [--force]',
  )
  process.exitCode = 1
}

/** One line per failure. A ZodError message is multi-line JSON, so list its issues instead. */
function oneLine(error: unknown): string {
  const issues = (error as { issues?: unknown } | null)?.issues
  if (Array.isArray(issues)) {
    return issues
      .map(
        (i: { path?: PropertyKey[]; message?: string }) =>
          `${(i.path ?? []).map(String).join('.') || '(root)'}: ${i.message}`,
      )
      .join('; ')
  }
  return error instanceof Error ? error.message : String(error)
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  try {
    main()
  } catch (error) {
    console.error(`✖ ${oneLine(error)}`)
    process.exitCode = 1
  }
}
