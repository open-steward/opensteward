import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import {
  verifyCloverWebhook,
  parseCloverWebhookEvents,
} from '../../../../../../../src/verticals/ecommerce/adapters/clover/webhook'

describe('verifyCloverWebhook', () => {
  const secret = 'test-secret-key'

  it('returns true for valid signature', () => {
    const body = Buffer.from('{"test": true}')
    const sig = createHmac('sha256', secret).update(body).digest('base64')
    const result = verifyCloverWebhook(body, { 'x-clover-hmac': sig }, secret)
    expect(result).toBe(true)
  })

  it('returns false for invalid signature', () => {
    const body = Buffer.from('{"test": true}')
    const result = verifyCloverWebhook(body, { 'x-clover-hmac': 'invalid' }, secret)
    expect(result).toBe(false)
  })

  it('returns false when header is missing', () => {
    const body = Buffer.from('{"test": true}')
    const result = verifyCloverWebhook(body, {}, secret)
    expect(result).toBe(false)
  })
})

describe('parseCloverWebhookEvents', () => {
  it('parses merchant events', () => {
    const payload = {
      appId: 'APP_001',
      merchants: {
        MERCH_001: [
          { type: 'CREATE', objectId: 'items/ITEM_001', ts: 1714557600000 },
          { type: 'UPDATE', objectId: 'customers/CUST_001', ts: 1714557601000 },
        ],
      },
    }
    const events = parseCloverWebhookEvents(payload)
    expect(events).toHaveLength(2)
    expect(events[0]!.platform).toBe('clover')
    expect(events[0]!.resourceType).toBe('products')
    expect(events[0]!.action).toBe('created')
    expect(events[0]!.resourceId).toBe('ITEM_001')
    expect(events[0]!.tenantId).toBe('MERCH_001')
    expect(events[1]!.resourceType).toBe('customers')
    expect(events[1]!.action).toBe('updated')
  })

  it('returns empty array for missing merchants', () => {
    const events = parseCloverWebhookEvents({})
    expect(events).toEqual([])
  })

  it('maps DELETE action', () => {
    const payload = {
      merchants: {
        MERCH_001: [
          { type: 'DELETE', objectId: 'orders/ORD_001', ts: 1714557600000 },
        ],
      },
    }
    const events = parseCloverWebhookEvents(payload)
    expect(events[0]!.action).toBe('deleted')
    expect(events[0]!.resourceType).toBe('orders')
  })

  it('maps unknown resource types to unknown', () => {
    const payload = {
      merchants: {
        MERCH_001: [
          { type: 'CREATE', objectId: 'widgets/W_001', ts: 1714557600000 },
        ],
      },
    }
    const events = parseCloverWebhookEvents(payload)
    expect(events[0]!.resourceType).toBe('unknown')
  })
})
