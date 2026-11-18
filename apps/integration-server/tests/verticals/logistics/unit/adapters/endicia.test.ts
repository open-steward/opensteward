import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type EndiciaRate,
} from '../../../../../src/verticals/logistics/adapters/endicia/transform/rate'
import {
  transformLabel,
  type EndiciaLabel,
} from '../../../../../src/verticals/logistics/adapters/endicia/transform/label'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRate(overrides: Partial<EndiciaRate> = {}): EndiciaRate {
  return {
    rate_id: 'rate-en-001',
    service_code: 'USPS_PRIORITY',
    service_name: 'USPS Priority Mail',
    total_amount: 7.35,
    currency: 'USD',
    transit_days: 2,
    estimated_delivery_at: '2024-03-17T00:00:00Z',
    guaranteed: false,
    created_at: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

function makeLabel(overrides: Partial<EndiciaLabel> = {}): EndiciaLabel {
  return {
    label_id: 'lbl-en-001',
    tracking_number: 'EN123456789',
    service_code: 'USPS_PRIORITY',
    format: 'PDF',
    status: 'created',
    url: 'https://api.endicia.com/labels/lbl-en-001.pdf',
    base64: 'JVBERi0xLjQ=',
    created_at: '2024-03-15T09:00:00Z',
    ...overrides,
  }
}

// ─── transformRate ──────────────────────────────────────────────────────────

describe('Endicia transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.id).toBe('rate-en-001')
    expect(result.carrierId).toBe('endicia')
    expect(result.serviceCode).toBe('USPS_PRIORITY')
    expect(result.serviceName).toBe('USPS Priority Mail')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(7.35)
    expect(result.transitDays).toBe(2)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      rate_id: null,
      service_code: null,
      service_name: null,
      total_amount: null,
      transit_days: null,
      estimated_delivery_at: null,
      guaranteed: null,
      created_at: null,
    })
    const result = transformRate(raw)

    expect(result.id).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
  })
})

// ─── transformLabel ─────────────────────────────────────────────────────────

describe('Endicia transformLabel', () => {
  it('maps canonical fields', () => {
    const raw = makeLabel()
    const result = transformLabel(raw)

    expect(result.id).toBe('lbl-en-001')
    expect(result.trackingNumber).toBe('EN123456789')
    expect(result.carrierId).toBe('endicia')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.url).toContain('lbl-en-001.pdf')
    expect(result.base64).toBe('JVBERi0xLjQ=')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeLabel({
      tracking_number: null,
      service_code: null,
      format: null,
      url: null,
      base64: null,
      created_at: null,
    })
    const result = transformLabel(raw)

    expect(result.trackingNumber).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.format).toBe('PDF') // falls back to PDF
    expect(result.url).toBeUndefined()
    expect(result.base64).toBeUndefined()
  })
})
