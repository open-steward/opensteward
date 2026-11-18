import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  RL_CARRIERS_STATIC_CARRIER,
} from '../../../../../../../src/verticals/logistics/adapters/rl-carriers/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

// ─── transformCarrier ─────────────────────────────────────────────────────────

describe('RL-Carriers transformCarrier', () => {
  it('returns the static carrier constant', () => {
    expect(transformCarrier()).toBe(RL_CARRIERS_STATIC_CARRIER)
  })

  it('has id rl-carriers', () => {
    expect(transformCarrier().id).toBe('rl-carriers')
  })

  it('has name "R+L Carriers"', () => {
    expect(transformCarrier().name).toBe('R+L Carriers')
  })

  it('has code RLCA', () => {
    expect(transformCarrier().code).toBe('RLCA')
  })

  it('is active', () => {
    expect(transformCarrier().isActive).toBe(true)
  })

  it('includes at least one service entry', () => {
    expect(transformCarrier().services?.length).toBeGreaterThan(0)
  })

  it('includes LTL service', () => {
    const services = transformCarrier().services ?? []
    const ltl = services.find((s) => s.code === 'LTL')
    expect(ltl).toBeDefined()
    expect(ltl?.name).toBe('Standard LTL')
  })

  it('includes a tracking URL template', () => {
    expect(transformCarrier().trackingUrlTemplate).toContain('{trackingNumber}')
  })

  it('passes CarrierSchema.parse without throwing', () => {
    expect(() => CarrierSchema.parse(transformCarrier())).not.toThrow()
  })
})
