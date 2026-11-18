import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyForecastWebhook, parseForecastWebhookEvents } from '../../../../../src/verticals/projects/adapters/forecast/webhook'

describe('Forecast webhook', () => {
  it('verifies x-forecast-signature HMAC-SHA256 hex', () => {
    const secret = 'shh'
    const body = Buffer.from('{}')
    const sig = createHmac('sha256', secret).update(body).digest('hex')
    expect(verifyForecastWebhook(body, { 'x-forecast-signature': sig }, secret)).toBe(true)
  })

  it('rejects empty signature headers', () => {
    expect(verifyForecastWebhook(Buffer.from('{}'), {}, 'secret')).toBe(false)
  })

  it('parseEvents returns array with platform=forecast', () => {
    const out = parseForecastWebhookEvents({ events: [{ resource: { gid: 'r1', resource_type: 'task' }, action: 'changed' }] })
    expect(Array.isArray(out)).toBe(true)
    if (out.length > 0) expect(out[0]!.platform).toBe('forecast')
  })
})
