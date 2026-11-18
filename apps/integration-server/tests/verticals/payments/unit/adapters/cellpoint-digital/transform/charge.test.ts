import { describe, it, expect } from 'vitest'
import { transformCharge } from '../../../../../../../src/verticals/payments/adapters/cellpoint-digital/transform/charge'
import type { XmlNode } from '../../../../../../../src/verticals/payments/adapters/cellpoint-digital/transform/shared'
import { ChargeSchema } from '../../../../../../../src/verticals/payments/schema/charge'

/** Minimal helper: build a <transaction> XmlNode for the transform. */
function makeTxNode(overrides: Partial<XmlNode> = {}): XmlNode {
  const base: XmlNode = {
    id: { $text: 'TX-001' },
    'order-no': { $text: 'ORD-42' },
    'session-id': { $text: 'SES-1' },
    amount: { $text: '4999', $attr: { currency: 'USD' } },
    status: { $attr: { id: '1000' } },
    createdDate: { $text: '2024-03-01' },
    createdTime: { $text: '00:00:00' },
    'client-info': { profileid: { $text: 'CUST-123' }, email: { $text: 'buyer@example.com' } },
  }
  return { ...base, ...overrides }
}

describe('cellpoint-digital transformCharge', () => {
  it('maps status code 1000 (operationSuccess) to "succeeded"', () => {
    const tx = makeTxNode()
    const result = transformCharge(tx)
    expect(result.status).toBe('succeeded')
    expect(result.gateway).toBe('cellpoint-digital')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps the amount (minor units) and currency from the <amount> node', () => {
    const tx = makeTxNode({
      amount: { $text: '9900', $attr: { currency: 'EUR' } },
    })
    const result = transformCharge(tx)
    expect(result.amount).toBe(9900)
    expect(result.currency).toBe('EUR')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps status code 2000 (authorized) to "succeeded"', () => {
    const tx = makeTxNode({ status: { $attr: { id: '2000' } } })
    const result = transformCharge(tx)
    expect(result.status).toBe('succeeded')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('maps an unknown status code to "pending"', () => {
    const tx = makeTxNode({ status: { $attr: { id: '9999' } } })
    const result = transformCharge(tx)
    expect(result.status).toBe('pending')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('surfaces the transaction id as id and externalId', () => {
    const tx = makeTxNode({ id: { $text: 'TX-XYZ' } })
    const result = transformCharge(tx)
    expect(result.id).toBe('TX-XYZ')
    expect(result.externalId).toBe('TX-XYZ')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })

  it('accepts a raw XML string and finds the <transaction> within it', () => {
    const xml = `<?xml version="1.0"?>
      <get-transaction-status>
        <session>
          <transaction id="1000">
            <id>TX-XML-1</id>
            <amount currency="DKK">5000</amount>
            <status id="1000"/>
            <createdDate>2024-03-01</createdDate>
          </transaction>
        </session>
      </get-transaction-status>`
    const result = transformCharge(xml)
    expect(result.status).toBe('succeeded')
    expect(result.currency).toBe('DKK')
    expect(() => ChargeSchema.parse(result)).not.toThrow()
  })
})
