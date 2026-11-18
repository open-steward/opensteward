import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type RlCarriersLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/rl-carriers/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<RlCarriersLabelResponse> = {}): RlCarriersLabelResponse {
  return {
    ShippingLabelsFile: 'JVBERi0xLjQKJ...',
    Code: 200,
    Errors: [],
    ...overrides,
  }
}

const PRO_NUMBER = 'PRO123456'

// ─── transformLabel ───────────────────────────────────────────────────────────

describe('RL-Carriers transformLabel', () => {
  it('sets id, shipmentId, trackingNumber from proNumber', () => {
    const result = transformLabel(makeRaw(), PRO_NUMBER)
    expect(result.id).toBe(PRO_NUMBER)
    expect(result.shipmentId).toBe(PRO_NUMBER)
    expect(result.trackingNumber).toBe(PRO_NUMBER)
  })

  it('sets carrierId to rl-carriers', () => {
    expect(transformLabel(makeRaw(), PRO_NUMBER).carrierId).toBe('rl-carriers')
  })

  it('sets serviceCode to LTL', () => {
    expect(transformLabel(makeRaw(), PRO_NUMBER).serviceCode).toBe('LTL')
  })

  it('sets format to PDF', () => {
    expect(transformLabel(makeRaw(), PRO_NUMBER).format).toBe('PDF')
  })

  it('maps ShippingLabelsFile to base64', () => {
    const result = transformLabel(makeRaw(), PRO_NUMBER)
    expect(result.base64).toBe('JVBERi0xLjQKJ...')
  })

  it('sets status to CREATED when ShippingLabelsFile is present', () => {
    const result = transformLabel(makeRaw(), PRO_NUMBER)
    expect(result.status).toBe('CREATED')
  })

  it('sets status to undefined when ShippingLabelsFile is absent', () => {
    const result = transformLabel(makeRaw({ ShippingLabelsFile: undefined }), PRO_NUMBER)
    expect(result.status).toBeUndefined()
  })

  it('createdAt is a Date instance', () => {
    const result = transformLabel(makeRaw(), PRO_NUMBER)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema.parse without throwing', () => {
    const result = transformLabel(makeRaw(), PRO_NUMBER)
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
