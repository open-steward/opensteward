/**
 * Melhor Envio carrier transform, pinned to the documented response of
 * GET /api/v2/me/shipment/companies
 * (https://docs.melhorenvio.com.br/reference/listar-transportadoras.md).
 *
 * The documented item is { id, name, picture, services[] }, and each service
 * is { id, name, type, range, restrictions, requirements, optionals, company }.
 * The top-level item has no status and no timestamps, and the reference warns
 * "Não faça verificações pelo nome da transportadora ou serviço, pois podem
 * sofrer alterações", so nothing is derived from a name.
 */
import { describe, it, expect } from 'vitest'
import {
  transformCarrier,
  type MelhorEnvioCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/melhor-envio/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

/** Trimmed from the documented example (restrictions shortened to one format). */
const DOCUMENTED_CARRIERS: MelhorEnvioCarrier[] = [
  {
    id: 1,
    name: 'Correios',
    picture: 'https://sandbox.melhorenvio.com.br/images/shipping-companies/correios.png',
    services: [
      {
        id: 1,
        name: 'PAC',
        type: 'normal',
        range: 'interstate',
        restrictions: { insurance_value: { min: 0, max: 3000 } },
        requirements: ['names', 'addresses'],
        optionals: ['AR', 'MP', 'VD'],
        company: {
          id: 1,
          name: 'Correios',
          status: 'available',
          picture: '/images/shipping-companies/correios.png',
          use_own_contract: false,
        },
      },
      {
        id: 2,
        name: 'SEDEX',
        type: 'express',
        range: 'interstate',
        requirements: ['names', 'addresses'],
        optionals: ['AR', 'MP', 'VD'],
      },
      {
        id: 17,
        name: 'Mini Envios',
        type: 'normal',
        range: 'interstate',
        requirements: ['names', 'addresses'],
        optionals: ['AR', 'VD'],
      },
    ],
  },
  {
    id: 2,
    name: 'Jadlog',
    picture: 'https://sandbox.melhorenvio.com.br/images/shipping-companies/jadlog.png',
    services: [
      { id: 3, name: '.Package', type: 'normal', range: 'interstate' },
      { id: 4, name: '.Com', type: 'express', range: 'interstate' },
    ],
  },
]

const correios = DOCUMENTED_CARRIERS[0]!
const jadlog = DOCUMENTED_CARRIERS[1]!

describe('transformCarrier (melhor-envio)', () => {
  it('parses every documented example item with CarrierSchema', () => {
    for (const raw of DOCUMENTED_CARRIERS) {
      expect(() => CarrierSchema.parse(transformCarrier(raw))).not.toThrow()
    }
  })

  it('maps the documented numeric id to a string id and the documented name', () => {
    const out = CarrierSchema.parse(transformCarrier(jadlog))
    expect(out.id).toBe('2')
    expect(out.name).toBe('Jadlog')
  })

  it('maps each documented service to a CarrierService keyed by its service id', () => {
    const out = CarrierSchema.parse(transformCarrier(correios))
    expect(out.services).toEqual([
      { code: '1', name: 'PAC' },
      { code: '2', name: 'SEDEX' },
      { code: '17', name: 'Mini Envios' },
    ])
  })

  it('drops a service with no id rather than inventing a code', () => {
    const out = CarrierSchema.parse(
      transformCarrier({ ...jadlog, services: [{ name: 'no id' }, { id: 4, name: '.Com' }] }),
    )
    expect(out.services).toEqual([{ code: '4', name: '.Com' }])
  })

  it('derives nothing from the name: no code, and no status or dates the item does not document', () => {
    const out = transformCarrier(correios)
    expect(out.code).toBeUndefined()
    expect(out.isActive).toBeUndefined()
    expect(out.createdAt).toBeUndefined()
    expect(out.updatedAt).toBeUndefined()
  })

  it('omits services when the item carries none', () => {
    const { services: _omit, ...bare } = jadlog
    expect(CarrierSchema.parse(transformCarrier(bare)).services).toBeUndefined()
  })

  it('keeps a documented but empty services array as an empty list, not as absent', () => {
    const out = CarrierSchema.parse(transformCarrier({ ...jadlog, services: [] }))
    expect(out.services).toEqual([])
  })

  it('keeps the raw item (picture included) as metadata', () => {
    const out = transformCarrier(correios)
    expect(out.metadata).toBe(correios)
    expect(out.metadata?.picture).toBe(correios.picture)
  })
})
