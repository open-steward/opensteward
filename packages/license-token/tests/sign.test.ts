import { sign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  LICENSE_ASSERTION,
  MAX_TOKEN_LENGTH,
  PASETO_HEADER,
  REVOCATIONS_ASSERTION,
} from '../src/constants'
import { pae } from '../src/pae'
import { canonicalPayloadBytes } from '../src/serialize'
import { assembleToken, buildSigningInput } from '../src/sign'
import { makeKey, sized, validPayload } from './helpers'

const utf8 = (s: string) => new TextEncoder().encode(s)
const FOOTER = { kid: 'test1' }
const KEY = makeKey('test1')
const LIST = { ver: 1 as const, iat: '2026-10-09T00:00:00Z', revoked: ['lic_aaaaaa'] }

describe('buildSigningInput: the exact bytes the service sends to KMS', () => {
  it('is PAE(header, canonical payload, canonical footer, license assertion)', () => {
    const p = validPayload()
    expect(buildSigningInput(p, FOOTER)).toEqual(
      pae([
        utf8(PASETO_HEADER),
        canonicalPayloadBytes(p),
        utf8('{"kid":"test1"}'),
        utf8(LICENSE_ASSERTION),
      ]),
    )
  })
  it('binds revocation lists to their own assertion', () =>
    expect(buildSigningInput(LIST, FOOTER, 'revocations')).toEqual(
      pae([
        utf8(PASETO_HEADER),
        canonicalPayloadBytes(LIST, 'revocations'),
        utf8('{"kid":"test1"}'),
        utf8(REVOCATIONS_ASSERTION),
      ]),
    ))
  it('refuses a payload whose shape does not match the purpose', () => {
    expect(() => buildSigningInput(LIST as never, FOOTER)).toThrow(ZodError)
    expect(() => buildSigningInput(validPayload() as never, FOOTER, 'revocations')).toThrow(
      ZodError,
    )
  })
  it('refuses to sign an invalid payload or footer', () => {
    expect(() =>
      buildSigningInput(validPayload({ limits: { connections: 5 } as never }), FOOTER),
    ).toThrow(ZodError)
    expect(() => buildSigningInput(validPayload(), { kid: 'K1' })).toThrow(ZodError)
  })
  it('accepts exactly 4096 bytes and refuses 4097 (AWS KMS Sign, MessageType RAW)', () => {
    expect(buildSigningInput(sized(4096), FOOTER)).toHaveLength(4096)
    expect(() => buildSigningInput(sized(4097), FOOTER)).toThrow(RangeError)
    expect(() => buildSigningInput(sized(4097), FOOTER)).toThrow(/4096/)
  })
})

describe('assembleToken', () => {
  it('produces v4.public.<b64url(m || sig)>.<b64url(footer)>', () => {
    const p = validPayload()
    const sig = sign(null, buildSigningInput(p, FOOTER), KEY.privateKey)
    const body = Buffer.concat([Buffer.from(canonicalPayloadBytes(p)), sig]).toString('base64url')
    expect(assembleToken(p, FOOTER, sig)).toBe(
      `${PASETO_HEADER}${body}.${Buffer.from('{"kid":"test1"}').toString('base64url')}`,
    )
  })
  it.each([0, 63, 65])('refuses a %d-byte signature', (n) =>
    expect(() => assembleToken(validPayload(), FOOTER, new Uint8Array(n))).toThrow(/64 bytes/),
  )
  it('refuses to assemble what could not have been signed (over 4096)', () =>
    expect(() => assembleToken(sized(4097), FOOTER, new Uint8Array(64))).toThrow(/4096/))
  it('a maximal token fits MAX_TOKEN_LENGTH', () => {
    const p = sized(4096)
    const token = assembleToken(p, FOOTER, sign(null, buildSigningInput(p, FOOTER), KEY.privateKey))
    expect(token.length).toBeLessThanOrEqual(MAX_TOKEN_LENGTH)
  })
})
