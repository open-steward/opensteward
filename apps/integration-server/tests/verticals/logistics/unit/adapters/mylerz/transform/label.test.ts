import { describe, it, expect } from 'vitest'
import { transformLabel } from '../../../../../../../src/verticals/logistics/adapters/mylerz/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'
import { envelope } from '../fixtures'

describe('transformLabel (mylerz)', () => {
  it('puts the documented base64 Value into base64 and parses as a Label', () => {
    // Sample from POST-api-packages-GetAWB: "Value": "QEA="
    const out = LabelSchema.parse(transformLabel(envelope('QEA='), '12345678901234'))
    expect(out).toEqual({
      id: '12345678901234',
      shipmentId: '12345678901234',
      trackingNumber: '12345678901234',
      carrierId: 'mylerz',
      format: 'PDF',
      status: 'CREATED',
      base64: 'QEA=',
    })
  })

  it('never sets a url: the AWB is returned as bytes, not hosted', () => {
    expect(transformLabel(envelope('QEA='), 'X').url).toBeUndefined()
  })

  it('omits base64 when the Value is null', () => {
    expect(
      LabelSchema.parse(transformLabel(envelope<string | null>(null), 'X')).base64,
    ).toBeUndefined()
  })
})
