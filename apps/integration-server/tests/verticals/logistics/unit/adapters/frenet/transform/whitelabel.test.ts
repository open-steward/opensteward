/**
 * Fixtures are the documented example responses of Frenet's WhiteLabel
 * Shipments / Orders Integration APIs:
 *   https://docs.frenet.com.br/reference/getshipmentsasync.md  (ShipmentsResponse.example)
 *   https://docs.frenet.com.br/reference/getshipmentasync.md   (ShipmentResponse.example)
 * and the ShipmentResult properties of getshipmentlabelasync.md (which has no
 * example of its own).
 */
import { describe, it, expect } from 'vitest'
import {
  transformWhitelabelShipment,
  transformWhitelabelOrder,
  transformWhitelabelLabel,
  statusCode,
  type FrenetWhitelabelShipment,
} from '../../../../../../../src/verticals/logistics/adapters/frenet/transform/whitelabel'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

/** ShipmentsResponse.example.shipments[4], verbatim. */
function paidShipment(): FrenetWhitelabelShipment {
  return {
    shipmentId: 12670,
    orderId: 'ORD-1002',
    shipmentStatus: 'SucessoPagamento',
    trackingUrl: 'http://rastreio-h03.frenet.dev/COR/PY943133202BR',
    labelUrl:
      'http://painel-h03.frenet.dev/PrintPreviewCart/Label?shippingOrderId=12670&integration=7085&layout=9',
    declarationUrl:
      'http://painel-h03.frenet.dev/PrintPreviewCart/Label?shippingOrderId=12670&integration=7085&layout=6',
    receiptNotificationUrl: '',
    quotation: {
      carrier: 'Correios',
      carrierCode: 'COR',
      shippingServiceCode: 3298,
      shippingServiceName: 'PAC',
      shippingPrice: 17.06,
      shippingCompetitorPrice: 24.3,
      deliveryTime: 0,
      services: { declaredValue: true, receiptNotification: false, ownHand: false },
    } as FrenetWhitelabelShipment['quotation'],
    volumes: [
      {
        volumeId: '65329',
        labelId: 'PY943133202BR',
        weight: 0.1,
        length: 15,
        height: 15,
        width: 15,
        weightCarrier: null,
        lengthCarrier: null,
        heightCarrier: null,
        widthCarrier: null,
        price: 200,
        priceCarrier: null,
        declaredValue: 200,
        declaredValueCarrier: null,
        validBy: 7,
        labelExpired: false,
        modifiedOn: '2021-03-24T17:56:22.583',
      } as NonNullable<FrenetWhitelabelShipment['volumes']>[number],
    ],
  }
}

/** ShipmentResponse.example (getshipmentasync); the volume keeps its documented non-null fields. */
function scheduledCancellation(): FrenetWhitelabelShipment {
  return {
    shipmentId: 12679,
    orderId: 'ORD-1003',
    shipmentStatus: 'CancelamentoAgendado',
    trackingUrl: '',
    labelUrl: '',
    declarationUrl: '',
    receiptNotificationUrl: '',
    quotation: {
      carrier: 'Correios',
      carrierCode: 'COR',
      shippingServiceCode: 3298,
      shippingServiceName: 'PAC',
      shippingPrice: 17.06,
      shippingCompetitorPrice: 24.3,
      deliveryTime: 7,
      services: { declaredValue: true, receiptNotification: true, ownHand: true },
    } as FrenetWhitelabelShipment['quotation'],
    volumes: [
      {
        volumeId: '65338',
        labelId: 'PY943133162BR',
        weight: 0.2,
        length: 15,
        height: 15,
        width: 15,
        modifiedOn: '2021-03-29T15:22:36.003',
      } as NonNullable<FrenetWhitelabelShipment['volumes']>[number],
    ],
  }
}

describe('frenet transformWhitelabelShipment', () => {
  it('maps the documented paid example and parses as a Shipment', () => {
    const s = ShipmentSchema.parse(transformWhitelabelShipment(paidShipment()))
    expect(s.id).toBe('12670')
    expect(s.reference).toBe('ORD-1002')
    expect(s.status).toBe('LABEL_CREATED')
    expect(s.carrierId).toBe('COR')
    expect(s.serviceCode).toBe('3298')
    expect(s.labelUrl).toBe(
      'http://painel-h03.frenet.dev/PrintPreviewCart/Label?shippingOrderId=12670&integration=7085&layout=9',
    )
    expect(s.packages).toEqual([
      {
        id: '65329',
        weight: { value: 0.1, unit: 'kg' },
        dimensions: { length: 15, width: 15, height: 15, unit: 'cm' },
      },
    ])
  })

  it('leaves out cost, tracking number and timestamps the definition does not give', () => {
    const s = transformWhitelabelShipment(paidShipment())
    expect(s.cost).toBeUndefined()
    expect(s.trackingNumber).toBeUndefined()
    expect(s.createdAt).toBeUndefined()
    expect(s.updatedAt).toBeUndefined()
    expect(s.destinationAddress).toBeUndefined()
  })

  it('drops the empty labelUrl of a shipment with no label yet', () => {
    const s = ShipmentSchema.parse(transformWhitelabelShipment(scheduledCancellation()))
    expect(s.labelUrl).toBeUndefined()
    expect(s.status).toBe('CANCELLED')
  })

  it('reads the integer status the schema declares as well as the example name', () => {
    expect(transformWhitelabelShipment({ ...paidShipment(), shipmentStatus: 5 }).status).toBe(
      'IN_TRANSIT',
    )
    expect(
      transformWhitelabelShipment({ ...paidShipment(), shipmentStatus: 'Postado' }).status,
    ).toBe('IN_TRANSIT')
    expect(
      transformWhitelabelShipment({ ...paidShipment(), shipmentStatus: 'Criado' }).status,
    ).toBe('PENDING')
    expect(transformWhitelabelShipment({ ...paidShipment(), shipmentStatus: 18 }).status).toBe(
      'LABEL_CREATED',
    )
    expect(
      transformWhitelabelShipment({ ...paidShipment(), shipmentStatus: 'Cancelado' }).status,
    ).toBe('CANCELLED')
    expect(transformWhitelabelShipment({ ...paidShipment(), shipmentStatus: 42 }).status).toBe(
      'UNKNOWN',
    )
  })

  it('throws on a record without shipmentId instead of inventing one', () => {
    expect(() => transformWhitelabelShipment({ ...paidShipment(), shipmentId: null })).toThrow(
      /shipmentId/,
    )
  })

  it('keeps the raw record in metadata', () => {
    expect(transformWhitelabelShipment(paidShipment()).metadata?.['orderId']).toBe('ORD-1002')
  })
})

describe('frenet transformWhitelabelOrder', () => {
  it('maps the documented example and parses as an Order', () => {
    const o = OrderSchema.parse(transformWhitelabelOrder(paidShipment()))
    expect(o.id).toBe('12670')
    expect(o.orderNumber).toBe('ORD-1002')
    expect(o.status).toBe('AWAITING_SHIPMENT')
    expect(o.requestedServiceCode).toBe('3298')
    expect(o.currency).toBeUndefined()
    expect(o.totalAmount).toBeUndefined()
  })

  it('maps statuses onto the order enum', () => {
    expect(OrderSchema.parse(transformWhitelabelOrder(scheduledCancellation())).status).toBe(
      'CANCELLED',
    )
    expect(transformWhitelabelOrder({ ...paidShipment(), shipmentStatus: 'Postado' }).status).toBe(
      'SHIPPED',
    )
    expect(
      transformWhitelabelOrder({ ...paidShipment(), shipmentStatus: 'FalhaPagamento' }).status,
    ).toBe('ON_HOLD')
    expect(
      OrderSchema.parse(transformWhitelabelOrder({ ...paidShipment(), shipmentStatus: 99 })).status,
    ).toBe('unknown')
  })

  it('throws on a record without shipmentId', () => {
    expect(() => transformWhitelabelOrder({ ...paidShipment(), shipmentId: '' })).toThrow(
      /shipmentId/,
    )
  })
})

describe('frenet transformWhitelabelLabel', () => {
  const result = {
    shipmentId: 12670,
    orderId: 'ORD-1002',
    shipmentStatus: 'SucessoPagamento',
    trackingUrl: 'http://rastreio-h03.frenet.dev/COR/PY943133202BR',
    labelUrl:
      'http://painel-h03.frenet.dev/PrintPreviewCart/Label?shippingOrderId=12670&integration=7085&layout=9',
    declarationUrl:
      'http://painel-h03.frenet.dev/PrintPreviewCart/Label?shippingOrderId=12670&integration=7085&layout=6',
    receiptNotificationUrl: '',
    errors: [],
  }

  it('maps a ShipmentResult and parses as a Label', () => {
    const l = LabelSchema.parse(transformWhitelabelLabel(result))
    expect(l.id).toBe('12670')
    expect(l.shipmentId).toBe('12670')
    expect(l.status).toBe('CREATED')
    expect(l.url).toBe(result.labelUrl)
    expect(l.format).toBeUndefined()
    expect(l.cost).toBeUndefined()
  })

  it('omits an empty label URL and maps a cancelled shipment to VOIDED', () => {
    const l = LabelSchema.parse(
      transformWhitelabelLabel({ ...result, labelUrl: '', shipmentStatus: 7 }),
    )
    expect(l.url).toBeUndefined()
    expect(l.status).toBe('VOIDED')
  })

  it('maps a posted shipment (5 - Postado) to USED and a paid one to CREATED', () => {
    expect(
      LabelSchema.parse(transformWhitelabelLabel({ ...result, shipmentStatus: 5 })).status,
    ).toBe('USED')
    expect(
      LabelSchema.parse(transformWhitelabelLabel({ ...result, shipmentStatus: 4 })).status,
    ).toBe('CREATED')
  })

  it('maps an unlisted status to lowercase unknown', () => {
    expect(
      LabelSchema.parse(transformWhitelabelLabel({ ...result, shipmentStatus: 1 })).status,
    ).toBe('unknown')
  })
})

describe('frenet statusCode', () => {
  it('reads the documented names and codes', () => {
    expect(statusCode('SucessoPagamento')).toBe(4)
    expect(statusCode('CancelamentoAgendado')).toBe(6)
    expect(statusCode(9)).toBe(9)
    expect(statusCode('7')).toBe(7)
    expect(statusCode('Nope')).toBeUndefined()
    expect(statusCode(null)).toBeUndefined()
  })
})
