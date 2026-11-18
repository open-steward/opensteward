import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import {
  stripPrefix,
  verifyGithubStyleSignature,
  verifyHmacSha256,
  verifyStripeStyleSignature,
} from '../src/webhook'

describe('verifyHmacSha256', () => {
  const secret = 'webhook-secret'
  const payload = Buffer.from('{"event":"invoice.created"}')

  it('verifies a valid base64 signature', () => {
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    expect(verifyHmacSha256(payload, secret, expected, 'base64')).toBe(true)
  })

  it('verifies a valid hex signature', () => {
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    expect(verifyHmacSha256(payload, secret, expected, 'hex')).toBe(true)
  })

  it('defaults to base64 encoding', () => {
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    expect(verifyHmacSha256(payload, secret, expected)).toBe(true)
  })

  it('rejects an incorrect signature', () => {
    expect(verifyHmacSha256(payload, secret, 'wrong-signature', 'base64')).toBe(false)
  })

  it('rejects a different payload', () => {
    const sig = createHmac('sha256', secret).update(payload).digest('base64')
    expect(verifyHmacSha256(Buffer.from('tampered'), secret, sig, 'base64')).toBe(false)
  })

  it('rejects when secret differs', () => {
    const sig = createHmac('sha256', secret).update(payload).digest('base64')
    expect(verifyHmacSha256(payload, 'other-secret', sig, 'base64')).toBe(false)
  })
})

describe('stripPrefix', () => {
  it('strips a matching prefix', () => {
    expect(stripPrefix('sha256=abcdef', 'sha256=')).toBe('abcdef')
  })

  it('returns unchanged when prefix does not match', () => {
    expect(stripPrefix('abcdef', 'sha256=')).toBe('abcdef')
  })

  it('handles empty prefix', () => {
    expect(stripPrefix('abcdef', '')).toBe('abcdef')
  })

  it('handles empty value', () => {
    expect(stripPrefix('', 'sha256=')).toBe('')
  })
})

describe('verifyStripeStyleSignature', () => {
  const secret = 'whsec_test'
  const rawBody = Buffer.from('{"event":"charge.succeeded"}')
  const NOW_MS = 1_700_000_000_000
  const tsSec = Math.floor(NOW_MS / 1000)

  function sign(ts: number, body: Buffer): string {
    return createHmac('sha256', secret).update(`${ts}.${body.toString()}`).digest('hex')
  }

  it('accepts a valid signature within tolerance', () => {
    const sig = sign(tsSec, rawBody)
    const header = `t=${tsSec},v1=${sig}`
    expect(
      verifyStripeStyleSignature({ rawBody, header, secret, now: () => NOW_MS }),
    ).toBe(true)
  })

  it('accepts unknown extra keys in the header', () => {
    const sig = sign(tsSec, rawBody)
    const header = `t=${tsSec},v0=ignored,v1=${sig},meta=foo`
    expect(
      verifyStripeStyleSignature({ rawBody, header, secret, now: () => NOW_MS }),
    ).toBe(true)
  })

  it('rejects a signature outside the replay window', () => {
    const oldTs = tsSec - 600 // 10 min ago
    const sig = sign(oldTs, rawBody)
    const header = `t=${oldTs},v1=${sig}`
    expect(
      verifyStripeStyleSignature({ rawBody, header, secret, now: () => NOW_MS }),
    ).toBe(false)
  })

  it('rejects when v1 is missing', () => {
    const header = `t=${tsSec}`
    expect(
      verifyStripeStyleSignature({ rawBody, header, secret, now: () => NOW_MS }),
    ).toBe(false)
  })

  it('rejects when timestamp is non-numeric', () => {
    const header = `t=lol,v1=${sign(tsSec, rawBody)}`
    expect(
      verifyStripeStyleSignature({ rawBody, header, secret, now: () => NOW_MS }),
    ).toBe(false)
  })

  it('rejects a tampered body', () => {
    const sig = sign(tsSec, rawBody)
    const header = `t=${tsSec},v1=${sig}`
    expect(
      verifyStripeStyleSignature({
        rawBody: Buffer.from('tampered'),
        header,
        secret,
        now: () => NOW_MS,
      }),
    ).toBe(false)
  })

  it('rejects when header or secret missing', () => {
    expect(
      verifyStripeStyleSignature({ rawBody, header: undefined, secret, now: () => NOW_MS }),
    ).toBe(false)
    expect(
      verifyStripeStyleSignature({ rawBody, header: 't=1,v1=x', secret: '', now: () => NOW_MS }),
    ).toBe(false)
  })
})

describe('verifyGithubStyleSignature', () => {
  const secret = 'gh-secret'
  const rawBody = Buffer.from('{"action":"opened"}')
  const sig = createHmac('sha256', secret).update(rawBody).digest('hex')

  it('accepts a valid sha256= header', () => {
    expect(
      verifyGithubStyleSignature({ rawBody, header: `sha256=${sig}`, secret }),
    ).toBe(true)
  })

  it('rejects a bad signature', () => {
    expect(
      verifyGithubStyleSignature({ rawBody, header: 'sha256=deadbeef', secret }),
    ).toBe(false)
  })

  it('accepts a bare hex digest (prefix is optional)', () => {
    // stripPrefix is a no-op when the prefix is absent, so the raw
    // hex still matches the HMAC. Adapter callers that want strict
    // prefix-only behaviour can check it themselves before calling.
    expect(verifyGithubStyleSignature({ rawBody, header: sig, secret })).toBe(true)
  })

  it('rejects empty header or secret', () => {
    expect(
      verifyGithubStyleSignature({ rawBody, header: undefined, secret }),
    ).toBe(false)
    expect(
      verifyGithubStyleSignature({ rawBody, header: `sha256=${sig}`, secret: '' }),
    ).toBe(false)
  })
})
