import { describe, it, expect } from 'vitest'
import {
  transformEnvio,
  type RawLojaIntegradaEnvio,
} from '../../../../../../../src/verticals/ecommerce/adapters/loja-integrada/transform/envio'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'
import { PEDIDO_DETAIL } from '../fixtures'

const envio = PEDIDO_DETAIL.envios[0] as RawLojaIntegradaEnvio

describe('transformEnvio (loja-integrada)', () => {
  it('maps a documented envios[] row to a valid Fulfillment', () => {
    const f = FulfillmentSchema.parse(transformEnvio('165', envio))
    expect(f).toMatchObject({
      id: '165:69291055',
      orderId: '165',
      carrier: 'Enviali',
      service: 'PAC',
    })
    // objeto is null until the parcel is posted.
    expect(f.trackingNumber).toBeUndefined()
  })

  it('reads the tracking code from objeto', () => {
    const f = FulfillmentSchema.parse(transformEnvio('165', { ...envio, objeto: 'QE432690081BR' }))
    expect(f.trackingNumber).toBe('QE432690081BR')
  })
})
