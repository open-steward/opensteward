/**
 * transformPackage maps one entry of `v1PackageDetailsResponse.packages`
 * (GET /v1/companies/{company_id}/packages/{tracking_code},
 * https://docs.api.loggi.com/reference/packagedetailstrackingcode).
 *
 * The fixture uses the `example` value the OpenAPI schema gives for each
 * property; the schema has no whole-body example. `status.updatedTime` has no
 * documented example ("Data que o pacote entrou no status atual.", date-time),
 * so its timestamps are illustrative values of that format, not quotes.
 */
import { describe, it, expect } from 'vitest'
import {
  transformPackage,
  mapShipmentStatus,
  type LoggiPackageDetails,
} from '../../../../../../../src/verticals/logistics/adapters/loggi/transform/package'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function documentedPackage(overrides: Partial<LoggiPackageDetails> = {}): LoggiPackageDetails {
  return {
    loggiKey: 'KIF511LG3LGGA3U8G28B4200NA',
    trackingCode: 'AM1007503594LG',
    barcode: 'LG3LGGA3U8G28B4200NA',
    status: {
      code: 6,
      highLevelStatus: 'Com problema',
      description:
        'Algo deu errado e o pacote está parado. O remetente precisa resolver o problema.',
      updatedTime: '2024-03-02T12:00:00Z',
    },
    destination: {
      recipient: { name: 'Ana Carvalho da Silva', phone: '51999897161', nif: '02628794098' },
      postalAddress: {
        revision: 0,
        regionCode: 'BR',
        postalCode: '01234000',
        addressLines: [
          'Rua Monte Sinai, 105 - Jardim do Vale, Vila Velha - ES, 29113-240, Brasil - H 402',
        ],
      },
    } as LoggiPackageDetails['destination'],
    promisedDate: '2024-03-05',
    dimension: { weightG: 100, lengthCm: 10, widthCm: 10, heightCm: 10 },
    origin: { postalCode: '01234000' },
    pricing: { amount: { currencyCode: 'BRL', units: '7', nanos: 520000000 } },
    ...overrides,
  }
}

describe('loggi transformPackage', () => {
  it('parses the documented package with the canonical ShipmentSchema', () => {
    const out = ShipmentSchema.parse(transformPackage(documentedPackage()))
    expect(out.id).toBe('AM1007503594LG')
    expect(out.trackingNumber).toBe('AM1007503594LG')
    expect(out.carrierId).toBe('loggi')
    expect(out.status).toBe('EXCEPTION')
  })

  it('uses the tracking code as id, the key getShipment reads by', () => {
    expect(transformPackage(documentedPackage()).id).toBe('AM1007503594LG')
  })

  it('converts units/nanos to BRL minor units (7,52 → 752)', () => {
    expect(transformPackage(documentedPackage()).cost).toEqual({ amount: 752, currency: 'BRL' })
  })

  it('omits cost when the currency is missing, never defaulting one', () => {
    const out = transformPackage(
      documentedPackage({ pricing: { amount: { units: '7', nanos: 520000000 } } }),
    )
    expect(out.cost).toBeUndefined()
  })

  it('omits cost when units is missing, never defaulting to 0', () => {
    const out = transformPackage(
      documentedPackage({ pricing: { amount: { currencyCode: 'BRL', nanos: 5 } } }),
    )
    expect(out.cost).toBeUndefined()
  })

  it('omits cost when units is an empty string, never reading it as 0', () => {
    const out = transformPackage(
      documentedPackage({
        pricing: { amount: { currencyCode: 'BRL', units: '', nanos: 520000000 } },
      }),
    )
    expect(out.cost).toBeUndefined()
  })

  it('omits cost when units is not an integer ("Componente inteiro do preço")', () => {
    const out = transformPackage(
      documentedPackage({ pricing: { amount: { currencyCode: 'BRL', units: '7.5', nanos: 0 } } }),
    )
    expect(out.cost).toBeUndefined()
  })

  it('reads an absent nanos as a zero fraction (proto3 JSON omits zero values)', () => {
    const out = transformPackage(
      documentedPackage({ pricing: { amount: { currencyCode: 'BRL', units: '7' } } }),
    )
    expect(out.cost).toEqual({ amount: 700, currency: 'BRL' })
  })

  it('reads weight in grams and dimensions in centimetres', () => {
    const out = transformPackage(documentedPackage())
    expect(out.totalWeight).toEqual({ value: 100, unit: 'g' })
    expect(out.dimensions).toEqual({ length: 10, width: 10, height: 10, unit: 'cm' })
  })

  it('maps recipient and postal address into destinationAddress, without a country', () => {
    const out = transformPackage(documentedPackage())
    expect(out.destinationAddress).toEqual({
      name: 'Ana Carvalho da Silva',
      phone: '51999897161',
      street1: 'Rua Monte Sinai, 105 - Jardim do Vale, Vila Velha - ES, 29113-240, Brasil - H 402',
      postalCode: '01234000',
    })
    expect(out.originAddress).toEqual({ postalCode: '01234000' })
  })

  it('reads promisedDate as the estimated delivery', () => {
    expect(transformPackage(documentedPackage()).estimatedDeliveryAt?.toISOString()).toBe(
      '2024-03-05T00:00:00.000Z',
    )
  })

  it('sets actualDeliveryAt from updatedTime only when the status is Entregue (5)', () => {
    const delivered = transformPackage(
      documentedPackage({ status: { code: 5, updatedTime: '2024-03-04T15:00:00Z' } }),
    )
    expect(delivered.status).toBe('DELIVERED')
    expect(delivered.actualDeliveryAt?.toISOString()).toBe('2024-03-04T15:00:00.000Z')
    expect(transformPackage(documentedPackage()).actualDeliveryAt).toBeUndefined()
  })

  // Every row of the V2 table at https://docs.api.loggi.com/reference/trackingapi.
  it.each([
    [1, 'Adicionado no sistema', 'LABEL_CREATED'],
    [2, 'Cancelado', 'CANCELLED'],
    [3, 'Preparando para transferência', 'IN_TRANSIT'],
    [4, 'Preparando para entrega', 'IN_TRANSIT'],
    [5, 'Entregue', 'DELIVERED'],
    [6, 'Recusado pelo destinatário', 'EXCEPTION'],
    [7, 'Devolução iniciada', 'EXCEPTION'],
    [8, 'Devolvido', 'RETURNED'],
    [9, 'Extraviado', 'EXCEPTION'],
    [10, 'Retirar nos correios', 'IN_TRANSIT'],
    [11, 'Em rota', 'OUT_FOR_DELIVERY'],
    [12, 'Imprevisto na entrega', 'EXCEPTION'],
    [13, 'Conferido', 'IN_TRANSIT'],
    [14, 'Coletado', 'IN_TRANSIT'],
    [15, 'Medido e pesado', 'IN_TRANSIT'],
    [16, 'Saiu de uma base', 'IN_TRANSIT'],
    [17, 'Chegou em uma base', 'IN_TRANSIT'],
    [18, 'Destinatário ausente', 'EXCEPTION'],
    [19, 'Avariado', 'EXCEPTION'],
    [20, 'Pendência interna', 'EXCEPTION'],
    [21, 'Endereço errado', 'EXCEPTION'],
    [22, 'Aguardando ação do remetente', 'EXCEPTION'],
    [23, 'Roubado ou furtado', 'EXCEPTION'],
    [24, 'Aguardando liberação fiscal', 'EXCEPTION'],
    [25, 'Liberado pela fiscalização', 'IN_TRANSIT'],
    [26, 'Dados incorretos ou inválidos', 'EXCEPTION'],
    [27, 'Pacote não integrado', 'EXCEPTION'],
    [28, 'Coleta pendente', 'PENDING'],
    [29, 'Retido pela fiscalização', 'EXCEPTION'],
    [30, 'Entregue a transportadora', 'IN_TRANSIT'],
    [31, 'Falha na devolução', 'EXCEPTION'],
  ] as const)('maps V2 status %i (%s) to %s', (code, _label, expected) => {
    expect(mapShipmentStatus(code)).toBe(expected)
  })

  it('maps unlisted and missing status codes to UNKNOWN', () => {
    expect(mapShipmentStatus(99)).toBe('UNKNOWN')
    expect(mapShipmentStatus(undefined)).toBe('UNKNOWN')
  })

  it('keeps the raw package as metadata', () => {
    const raw = documentedPackage()
    expect(transformPackage(raw).metadata).toBe(raw)
  })
})
