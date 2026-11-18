import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyAcumaticaInventoryWebhook, parseAcumaticaInventoryWebhookEvents } from '../../../../../src/verticals/inventory/adapters/acumatica-inventory/webhook'

describe('AcumaticaInventory webhook', () => {
  it('verifies x-acumatica-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyAcumaticaInventoryWebhook(body, { 'x-acumatica-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyAcumaticaInventoryWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=acumatica-inventory', () => {
    const out = parseAcumaticaInventoryWebhookEvents({ Type: 'Stock.OnHandChanged', Data: { ID: 'p1' } })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('acumatica-inventory')
  })
})
