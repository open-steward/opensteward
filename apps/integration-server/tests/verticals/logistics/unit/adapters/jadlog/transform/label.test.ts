import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type JadlogLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/jadlog/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<JadlogLabelResponse> = {}): JadlogLabelResponse {
  return {
    idpedido: '12345',
    codigo: 'COD001',
    cte: 'CTE001',
    urlDacte: 'https://example.com/dacte.pdf',
    urlEtiqueta: 'https://example.com/etiqueta.pdf',
    dtEmissao: '2024-03-01T00:00:00Z',
    modalidade: 3,
    ...overrides,
  }
}

describe('jadlog transformLabel', () => {
  it('uses cte as id when present', () => {
    expect(transformLabel(makeRaw()).id).toBe('CTE001')
  })

  it('falls back to idpedido as id when cte is null', () => {
    const r = transformLabel(makeRaw({ cte: null }))
    expect(r.id).toBe('12345')
  })

  it('prefers urlEtiqueta over urlDacte for url', () => {
    expect(transformLabel(makeRaw()).url).toBe('https://example.com/etiqueta.pdf')
  })

  it('falls back to urlDacte when urlEtiqueta is null', () => {
    const r = transformLabel(makeRaw({ urlEtiqueta: null }))
    expect(r.url).toBe('https://example.com/dacte.pdf')
  })

  it('maps idpedido to shipmentId', () => {
    expect(transformLabel(makeRaw()).shipmentId).toBe('12345')
  })

  it('maps carrierId to jadlog', () => {
    expect(transformLabel(makeRaw()).carrierId).toBe('jadlog')
  })

  it('maps modalidade to serviceCode', () => {
    expect(transformLabel(makeRaw()).serviceCode).toBe('3')
  })

  it('sets format to PDF and status to CREATED', () => {
    const r = transformLabel(makeRaw())
    expect(r.format).toBe('PDF')
    expect(r.status).toBe('CREATED')
  })

  it('createdAt is a Date', () => {
    expect(transformLabel(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('passes schema validation', () => {
    expect(() => LabelSchema.parse(transformLabel(makeRaw()))).not.toThrow()
  })
})
