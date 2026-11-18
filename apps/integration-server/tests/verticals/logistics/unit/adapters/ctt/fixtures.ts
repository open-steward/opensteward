/**
 * Fixtures for the CTT (Pakketmail) API, built field by field from the
 * documented replies. Neither CTT's OpenAPI document
 * (https://enviosecommerceapi.ctt.pt/v3/openapi/) nor the Pakketmail pages
 * print an example body, so every field here is one the "JSON reply data"
 * tables name, with a value of the documented type.
 */
import type {
  CttShipment,
  CttShipmentListResponse,
} from '../../../../../../src/verticals/logistics/adapters/ctt/transform/shipment'
import type { CttCarrier } from '../../../../../../src/verticals/logistics/adapters/ctt/transform/carrier'
import type { CttTrackingResponse } from '../../../../../../src/verticals/logistics/adapters/ctt/transform/tracking'

/**
 * GET /shipments/newsince/:startNumber/:iso3339Date — one element of
 * `Shipments` (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/shipments/newsince/GET).
 */
export function shipment(id: number): CttShipment {
  return {
    ShipmentId: id,
    ClientReference: `ORDER-${id}`,
    CarrierId: 3,
    ServiceId: 12,
    OptionId: 4,
    Colli: 1,
    ImportDate: '2026-09-23T09:15:00Z',
    Note1: 'Fragile',
    Note2: 'Ring twice',
    Recipient: {
      Name: 'Ana Silva',
      CompanyName: 'Loja Exemplo',
      Streetname1: 'Rua Augusta',
      HouseNumber: 100,
      NumberExtension: '2E',
      Streetname2: 'Baixa',
      PostalCode: '1100-053',
      City: 'Lisboa',
      Country: 'PRT',
      Email: 'ana@example.test',
      Phone: '+351210000000',
    },
    ExtraServices: [{ ServiceId: 7, Value: '1' }],
    ShipmentItems: [
      {
        ArticleNumber: 'SKU-1',
        Description: 'Azulejo',
        Quantity: 2,
        Weight: 850,
        Price: 12.5,
        HSCode: '690890',
        Dimensions: '20x20x1',
      },
    ],
  }
}

export function newsincePage(ids: number[]): CttShipmentListResponse {
  return { ShipmentCount: ids.length, Shipments: ids.map(shipment) }
}

/** GET /carriers/ — one element of `Carrier` (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/carriers/GET). */
export function carrier(id: number): CttCarrier {
  return {
    Id: id,
    Name: `Carrier ${id}`,
    HasPickup: false,
    MapFields: [{ Id: 1, Name: 'Servicepoint' }],
    OptionList: [{ Id: 12, Name: 'Standard', ClassId: 'A', OptionType: 1, IsPickup: false }],
  }
}

/** POST /tracking/ reply (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/tracking/POST). */
export const TRACKING_REPLY: CttTrackingResponse = {
  Error: { Id: 0 },
  Shipments: {
    'ORDER-1': {
      ClientReferenceCode: 'ORDER-1',
      TrackingId: 'EA123456789PT',
      Statuslist: {
        '1': { Code: 10, DateTime: '2026-09-22T08:00:00Z', Text: 'Imported' },
        '2': { Code: 25, DateTime: '2026-09-22T15:30:00Z', Text: 'Picked up' },
        '3': { Code: 99, DateTime: '2026-09-23T11:45:00Z', Text: 'Delivered' },
      },
    },
  },
}
