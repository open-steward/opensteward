/**
 * Keeping upstream payloads out of the cache and off the wire.
 *
 * Two verticals are opt-in; the other seven must be untouched, and cheaply so.
 * Underneath the flag sits a floor that no operator may switch off — card
 * secrets, which PCI DSS 3.3.1 forbids storing after authorisation regardless
 * of how compliant the operator is.
 *
 * The floor is tested with the flag ON, deliberately. That is the case a flag
 * design gets wrong: it is easy to strip everything when the feature is off and
 * quietly let a CVV through the moment someone opts in.
 */
import { describe, it, expect } from 'vitest'
import {
  stripRawPayload,
  stripRawPayloads,
  RAW_PAYLOAD_VERTICALS,
} from '../../src/data-store/strip-raw-payload'

/** A 16-digit Luhn-valid test number — the shape a real PAN has. */
const FULL_PAN = '4111111111111111'
/** Same length, one digit changed, so Luhn fails. Must survive. */
const NOT_A_PAN = '4111111111111112'

describe('payments — the raw payload is behind the flag', () => {
  const charge = () => ({
    id: 'ch_1',
    amount: 1000,
    metadata: { processor: 'stripe' },
    raw: { id: 'ch_1', source: { iban: 'GB33BUKB20201555555555' } },
  })

  it('drops raw when the flag is off', () => {
    const out = stripRawPayload('payments', charge(), false) as Record<string, unknown>
    expect(out.raw).toBeUndefined()
    expect('raw' in out).toBe(false)
    expect(out.id).toBe('ch_1')
  })

  it('keeps raw when the operator has opted in', () => {
    const out = stripRawPayload('payments', charge(), true) as Record<string, unknown>
    expect(out.raw).toEqual({ id: 'ch_1', source: { iban: 'GB33BUKB20201555555555' } })
  })

  it('never touches curated metadata', () => {
    // `metadata.processor` is documented dedup logic for Chargebee and Recurly.
    // Blanking it would break their integrations silently.
    for (const on of [true, false]) {
      const out = stripRawPayload('payments', charge(), on) as Record<string, unknown>
      expect(out.metadata).toEqual({ processor: 'stripe' })
    }
  })
})

describe('the floor holds even with the flag ON', () => {
  it('strips a CVV wherever it appears', () => {
    const record = {
      id: 'pm_1',
      metadata: { cvv: '123' },
      raw: { card: { cvc: '456', nested: { cvv2: '789' } } },
    }
    const out = stripRawPayload('payments', record, true) as Record<string, unknown>
    const json = JSON.stringify(out)
    expect(json).not.toContain('123')
    expect(json).not.toContain('456')
    expect(json).not.toContain('789')
  })

  it('strips track data and PIN blocks', () => {
    const record = { id: 'x', raw: { track2: ';4111=25121010000000000000?', pinBlock: 'AAAA' } }
    const out = stripRawPayload('payments', record, true)
    expect(JSON.stringify(out)).not.toContain('4111=')
    expect(JSON.stringify(out)).not.toContain('AAAA')
  })

  it('matches SAD keys regardless of casing or separators', () => {
    const record = {
      id: 'x',
      raw: { CVV2: 'a', security_code: 'b', 'card-verification-value': 'c' },
    }
    const out = stripRawPayload('payments', record, true)
    const json = JSON.stringify(out)
    expect(json).not.toContain('"a"')
    expect(json).not.toContain('"b"')
    expect(json).not.toContain('"c"')
  })

  it('drops a full PAN by shape, not by field name', () => {
    // The adapters that carry card numbers do so under names the flag does not
    // reach (curated metadata), and document them as truncated. This catches an
    // upstream change without trusting the field name.
    const record = { id: 'x', metadata: { cardNumber: FULL_PAN }, raw: { anything: FULL_PAN } }
    const out = stripRawPayload('payments', record, true)
    expect(JSON.stringify(out)).not.toContain(FULL_PAN)
  })

  it('leaves the truncated forms PCI actually permits', () => {
    // helcim ships F6L4, paymob a 4-digit suffix. Both must survive, or the
    // guard would break the adapters it is meant to protect.
    const record = {
      id: 'x',
      metadata: {
        cardNumber: '411111******1111',
        pan: '1111',
        last4: '4242',
        brand: 'visa',
        expMonth: '12',
        fingerprint: 'fp_abc',
        cvvResponse: 'M',
        avsResponse: 'Y',
      },
    }
    const out = stripRawPayload('payments', record, false) as Record<string, unknown>
    // cvvResponse is a match indicator, not the security code — not SAD.
    expect(out.metadata).toEqual(record.metadata)
  })

  it('leaves a 16-digit value that fails Luhn', () => {
    // An order reference is not a card number. Length alone must not condemn it.
    const record = { id: 'x', metadata: { orderRef: NOT_A_PAN } }
    const out = stripRawPayload('payments', record, false) as Record<string, unknown>
    expect((out.metadata as Record<string, unknown>).orderRef).toBe(NOT_A_PAN)
  })

  it('treats an ambiguous `cid` by its value, not its name', () => {
    // Amex calls its security code CID; everyone else calls a customer id the
    // same thing. Stripping on the name alone would delete identifiers from
    // records that have nothing to do with cards.
    const secret = stripRawPayload('payments', { id: 'x', raw: { cid: '123' } }, true)
    expect(JSON.stringify(secret)).not.toContain('123')

    const customerId = stripRawPayload(
      'payments',
      { id: 'x', raw: { cid: 'cus_9f2a41', otherCid: 'cus_2' } },
      true,
    )
    expect(JSON.stringify(customerId)).toContain('cus_9f2a41')
  })

  it('ignores separators when testing for a PAN', () => {
    const record = { id: 'x', metadata: { v: '4111 1111 1111 1111' } }
    const out = stripRawPayload('payments', record, true)
    expect(JSON.stringify(out)).not.toContain('4111')
  })
})

describe('accounting — metadata IS the payload', () => {
  const invoice = () => ({
    id: 'inv_1',
    total: 500,
    metadata: { supplier: { iban: 'DE89370400440532013000' } },
  })

  it('drops metadata when the flag is off', () => {
    const out = stripRawPayload('accounting', invoice(), false) as Record<string, unknown>
    expect('metadata' in out).toBe(false)
    expect(out.id).toBe('inv_1')
  })

  it('keeps it when the operator has opted in', () => {
    const out = stripRawPayload('accounting', invoice(), true) as Record<string, unknown>
    expect(out.metadata).toEqual({ supplier: { iban: 'DE89370400440532013000' } })
  })
})

describe('the seven unflagged verticals are untouched', () => {
  it.each([
    'crm',
    'ecommerce',
    'logistics',
    'docsign',
    'projects',
    'customer-support',
    'inventory',
  ])('returns %s records by identity, with both flags off', (vertical) => {
    const record = { id: 'r1', metadata: { anything: 'kept' }, raw: { also: 'kept' } }
    const out = stripRawPayload(vertical, record, false)
    // Identity, not just equality — nothing is copied on their hot path.
    expect(out).toBe(record)
  })

  it('does not apply the card floor outside payments', () => {
    // Scoped deliberately: card secrets only occur in payments, and deep-walking
    // every accounting invoice would be wasted work.
    const record = { id: 'r1', metadata: { cvv: '123' } }
    expect(stripRawPayload('crm', record, false)).toBe(record)
  })
})

describe('identity and shape', () => {
  it('returns the same object when there is nothing to remove', () => {
    const record = { id: 'ch_1', metadata: { processor: 'stripe' } }
    expect(stripRawPayload('payments', record, false)).toBe(record)
  })

  it('preserves array identity when no element changed', () => {
    const records = [{ id: 'a' }, { id: 'b' }]
    expect(stripRawPayloads('payments', records, false)).toBe(records)
  })

  it('rebuilds the array when one element changed', () => {
    const records = [{ id: 'a' }, { id: 'b', raw: { x: 1 } }]
    const out = stripRawPayloads('payments', records, false)
    expect(out).not.toBe(records)
    expect(out[0]).toBe(records[0])
    expect('raw' in (out[1] as object)).toBe(false)
  })

  it('survives nulls and primitives', () => {
    expect(stripRawPayload('payments', null, false)).toBeNull()
    expect(stripRawPayload('payments', 'x' as unknown, false)).toBe('x')
  })

  it('names exactly the two flagged verticals', () => {
    expect([...RAW_PAYLOAD_VERTICALS].sort()).toEqual(['accounting', 'payments'])
  })
})
