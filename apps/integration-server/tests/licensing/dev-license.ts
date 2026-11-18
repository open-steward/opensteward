/**
 * dev1-signed licenses for integration-server tests. dev1 is the committed,
 * public test keypair (A1.6); integration-server tests run against
 * shared/dist, a source build, which trusts it. A production image does not.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPrivateKey, sign } from 'node:crypto'
import {
  KNOWN_FEATURES,
  LICENSE_AUDIENCE,
  LICENSE_ISSUER,
  assembleToken,
  buildSigningInput,
  toClaimTime,
  type LicensePayload,
} from '@opensteward/license-token'

interface DevKeyFile {
  kid: string
  publicKey: string
  privateKeyJwk: { kty: string; crv: string; x: string; d: string }
}
const FIXTURE = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', '..', '..', 'packages', 'license-token', 'fixtures', 'dev1.json'),
    'utf8',
  ),
) as DevKeyFile
const KEY = createPrivateKey({ key: FIXTURE.privateKeyJwk, format: 'jwk' })
const DAY_MS = 86_400_000

export const DEV_KID = FIXTURE.kid
export const daysFromNow = (days: number): string =>
  toClaimTime(new Date(Date.now() + days * DAY_MS))

/** dev1-signed, env "dev". Defaults: every known feature, limits no test reaches, valid for a year. */
export function signDevLicense(over: Partial<LicensePayload> = {}): string {
  const payload: LicensePayload = {
    iss: LICENSE_ISSUER,
    aud: LICENSE_AUDIENCE,
    sub: 'lic_testsuite01',
    org: 'OpenSteward Test Suite',
    tier: 'enterprise',
    features: [...KNOWN_FEATURES],
    limits: { connections: 10_000, tenants: 100 },
    label: 'tests',
    env: 'dev',
    iat: daysFromNow(-1),
    nbf: daysFromNow(-1),
    exp: daysFromNow(365),
    ver: 1,
    ...over,
  }
  const footer = { kid: FIXTURE.kid }
  return assembleToken(
    payload,
    footer,
    new Uint8Array(sign(null, buildSigningInput(payload, footer), KEY)),
  )
}

/** Still well-formed PASETO; one payload character changed, so the signature fails (INVALID). */
export function tamperPayload(token: string): string {
  const i = 'v4.public.'.length + 20
  return token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1)
}
