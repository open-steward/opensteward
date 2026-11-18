/**
 * Rows from the documented GetShipmentConfirmation example response in the
 * GEODIS Americas WMS API collection
 * (https://docs.api.geodis.com/api/collections/23261785/2s8YzUyhAw?segregateAuth=true&versionTag=latest),
 * copied field for field. Only the ids vary in `docOrder` so pages can hold
 * distinct rows.
 */
import type {
  GeodisShipmentConfirmationOrder,
  GeodisShipmentConfirmationResponse,
} from '../../../../../../src/verticals/logistics/adapters/geodis/transform/shipment-confirmation'

export const DOC_ORDER: GeodisShipmentConfirmationOrder = {
  orderNum: '1047902808',
  poNum: '2212',
  orderId: '104054947',
  warehouseId: 'ABC',
  shipTo: {
    shipName: null,
    addr1: '1234 Sample Road',
    addr2: null,
    city: 'Cincinnati',
    region: 'OH',
    country: 'USA',
    postalcode: 'USA',
  },
  shipment: {
    carton: [
      {
        lpid: '00000876185502S',
        trackingNumber: null,
        cartonSSCC18: null,
        line: [
          {
            orderLineNumber: '1292798096',
            item: '011113570',
            lotInfo: [
              {
                lotNumber: '00119080032',
                unitOfMeasure: 'EA',
                shippedQuantity: '4',
                serialNumber: null,
                expDate: '',
              },
            ],
          },
        ],
      },
    ],
  },
  carrier: 'AACT',
  carrierName: null,
  service: null,
  shipType: 'L',
  shipmentDate: '10/22/2019 2:06:24 PM',
}

export function docOrder(orderId: string): GeodisShipmentConfirmationOrder {
  return { ...structuredClone(DOC_ORDER), orderId, orderNum: `num-${orderId}` }
}

/** One documented page: `nextPage` is null on the last page, a URL otherwise. */
export function docPage(
  orders: GeodisShipmentConfirmationOrder[],
  pageNumber: number,
  last: boolean,
): GeodisShipmentConfirmationResponse {
  return {
    code: '200',
    message: 'Fetching shipment confirmation completed successfully',
    key: '12345',
    pagedResponse: {
      pageNumber,
      pageSize: 1000,
      totalPages: last ? pageNumber : pageNumber + 1,
      totalRecords: orders.length,
      firstPage: 'https://localhost:5401/api/ShipmentConfirmation?pageNumber=1',
      nextPage: last
        ? null
        : `https://localhost:5401/api/ShipmentConfirmation?pageNumber=${pageNumber + 1}`,
      previousPage: null,
      lastPage: null,
    },
    response: {
      transactionType: 'Shipment Confirmation',
      customerId: '12345',
      order: orders,
    },
  }
}
