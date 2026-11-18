import { describe, it, expect } from 'vitest'
import { transformLabel } from '../../../../../../../src/verticals/logistics/adapters/sameday/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

describe('sameday transformLabel', () => {
  it('maps id, shipmentId, trackingNumber from awbNumber', () => {
    const r = transformLabel('AWB-12345')
    expect(r.id).toBe('AWB-12345')
    expect(r.shipmentId).toBe('AWB-12345')
    expect(r.trackingNumber).toBe('AWB-12345')
  })

  it('sets carrierId to sameday', () => {
    expect(transformLabel('AWB-12345').carrierId).toBe('sameday')
  })

  it('sets format to PDF', () => {
    expect(transformLabel('AWB-12345').format).toBe('PDF')
  })

  it('sets status to CREATED', () => {
    expect(transformLabel('AWB-12345').status).toBe('CREATED')
  })

  it('sets url to undefined (no hosted URL at transform time)', () => {
    expect(transformLabel('AWB-12345').url).toBeUndefined()
  })

  it('stores awbNumber in metadata', () => {
    const r = transformLabel('AWB-12345')
    expect((r.metadata as Record<string, unknown>)?.awbNumber).toBe('AWB-12345')
  })

  it('passes LabelSchema validation', () => {
    const result = transformLabel('AWB-99999')
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
