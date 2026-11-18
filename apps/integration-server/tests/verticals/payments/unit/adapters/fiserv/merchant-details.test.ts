import { describe, it, expect, vi, afterEach } from 'vitest'
import { FiservAdapter } from '../../../../../../src/verticals/payments/adapters/fiserv'
import { FiservClient } from '../../../../../../src/verticals/payments/adapters/fiserv/client'
import { buildCredentials } from '../../../../../../src/verticals/payments/adapters/fiserv/auth'
import type { Credentials } from '@opensteward/shared'

/**
 * Fiserv's own transaction-inquiry example sends `merchantDetails.merchantId`,
 * but the schema does not mark it required — a field documented as optional
 * and enforced at runtime for multi-merchant accounts is a common vendor
 * pattern. The adapter sent it nowhere and had no field to source it from, so
 * if Fiserv does enforce it, every live `getCharge` / `captureCharge` /
 * `cancelCharge` would fail while all mocked tests passed.
 *
 * Answering that needs a credentialed sandbox call. This does not answer it —
 * it removes the dependency on the answer. `merchantId` is an OPTIONAL
 * credential field, and `merchantDetails` is sent only when a connection
 * carries one, so:
 *
 *   Fiserv does not require it  ->  nothing is sent, behaviour is unchanged
 *   Fiserv does require it      ->  the operator sets it and the calls work
 *
 * Both outcomes are served without knowing which is true, which is the point.
 */

const BASE = { apiKey: 'k', apiSecret: 's', environment: 'sandbox' }

function creds(fields: Record<string, string> = BASE): Credentials {
  return buildCredentials(fields)
}

function stubPost(result: unknown = [{ ipgTransactionId: 't1' }]) {
  return vi.spyOn(FiservClient.prototype, 'post').mockResolvedValue(result as never)
}

function bodyOf(post: ReturnType<typeof stubPost>, n = 0): Record<string, unknown> {
  return post.mock.calls[n]?.[1] as Record<string, unknown>
}

afterEach(() => vi.restoreAllMocks())

describe('fiserv merchantDetails', () => {
  it('offers merchantId as an optional credential field', () => {
    const field = new FiservAdapter().credentialFields().find((f) => f.name === 'merchantId')
    expect(field).toBeDefined()
    expect(field?.required).toBe(false)
  })

  it('connects without a merchantId, exactly as before', () => {
    expect(() => creds()).not.toThrow()
    expect(creds().extra?.merchantId).toBeUndefined()
  })

  it('sends no merchantDetails when the connection has no merchant id', () => {
    // The unchanged path: an empty object would still be a body change, so
    // the key must be absent entirely.
    const post = stubPost()
    return new FiservAdapter().getCharge(creds(), 'tx1').then(() => {
      expect('merchantDetails' in bodyOf(post)).toBe(false)
    })
  })

  it('sends merchantDetails on getCharge when the connection carries one', async () => {
    const post = stubPost()
    await new FiservAdapter().getCharge(creds({ ...BASE, merchantId: 'M123' }), 'tx1')
    expect(bodyOf(post).merchantDetails).toEqual({ merchantId: 'M123' })
  })

  it('sends it on cancelCharge too', async () => {
    const post = stubPost({ ipgTransactionId: 't1' })
    await new FiservAdapter().cancelCharge(creds({ ...BASE, merchantId: 'M123' }), 'tx1')
    expect(bodyOf(post).merchantDetails).toEqual({ merchantId: 'M123' })
  })

  it('sends it on captureCharge too', async () => {
    const post = stubPost({ ipgTransactionId: 't1' })
    await new FiservAdapter().captureCharge(creds({ ...BASE, merchantId: 'M123' }), 'tx1')
    expect(bodyOf(post).merchantDetails).toEqual({ merchantId: 'M123' })
  })

  it('ignores a blank merchant id rather than sending an empty one', async () => {
    const post = stubPost()
    await new FiservAdapter().getCharge(creds({ ...BASE, merchantId: '   ' }), 'tx1')
    expect('merchantDetails' in bodyOf(post)).toBe(false)
  })
})
