/**
 * Skydropx PRO fixtures built from the documented examples in the first-party
 * OpenAPI, https://pro.skydropx.com/es-MX/api-docs.json (GET /api/v1/shipments,
 * GET /api/v1/shipments/{id}, GET /api/v1/shipments/carrier_services and
 * GET /api/v1/shipments/tracking). The spec gives no example for the
 * `created_at`/`updated_at` strings or for the package resource's `type`; the
 * values used for those are marked below.
 */
import type {
  SkydropxPackage,
  SkydropxShipment,
  SkydropxShipmentsListResponse,
} from '../../../../../../src/verticals/logistics/adapters/skydropx/transform/shipment'
import type { SkydropxAddress } from '../../../../../../src/verticals/logistics/adapters/skydropx/transform/address'
import type { SkydropxCarrierService } from '../../../../../../src/verticals/logistics/adapters/skydropx/transform/carrier'
import type { SkydropxTrackingEvent } from '../../../../../../src/verticals/logistics/adapters/skydropx/transform/tracking'

/** Not in the docs: the package resource's `type` string (any value works; refs match on it). */
export const PACKAGE_TYPE = 'package'
/** "address" is the documented example `type` of address resources. */
export const ADDRESS_TYPE = 'address'

export function docAddress(id: string, addressType: 'from' | 'to'): SkydropxAddress {
  return {
    id,
    type: ADDRESS_TYPE,
    attributes: {
      id,
      area_level1: 'Ciudad de México',
      area_level2: 'Venustiano Carranza',
      name: 'Juan',
      postal_code: '15400',
      country_code: 'MX',
      address_type: addressType,
      street1: 'Persia 143',
      company: 'Company name',
      phone: '3453453453453',
      email: 'juan@mail.com',
      reference: 'porton',
      area_level3: 'Romero rubio',
      apartment_number: null,
      further_information: null,
      tax_id_number: 'XAXX010101000',
      tax_id_type: 'rfc',
    },
  }
}

export function docPackage(
  id: string,
  shipmentId: string,
  over: Partial<NonNullable<SkydropxPackage['attributes']>> = {},
): SkydropxPackage {
  return {
    id,
    type: PACKAGE_TYPE,
    attributes: {
      id,
      package_type: '4G',
      weight: '1',
      length: '1',
      width: '1',
      height: '1',
      consignment_note: '53102400',
      package_content: null,
      tracking_url_provider: 'https://www.fedex.com/fedextrack/?trknbr=234234234233',
      tracking_status: 'created',
      tracking_number: '234234234233',
      label_url: 'https://label.com',
      // Not in the docs (no example given): zoned ISO strings.
      created_at: '2024-09-05T23:13:00Z',
      updated_at: '2024-09-06T10:00:00Z',
      ...over,
    },
    relationships: { shipment: { data: { id: shipmentId, type: 'shipment' } } },
  }
}

export function docShipment(
  id: string,
  packageIds: string[],
  over: Partial<NonNullable<SkydropxShipment['attributes']>> = {},
): SkydropxShipment {
  return {
    id,
    type: 'shipment',
    attributes: {
      id,
      carrier_name: 'fedex',
      workflow_status: 'pending',
      payment_status: 'paid',
      total: '38.20',
      source: 'api',
      carrier_id: '0ac5adcc-a13d-427d-81dd-9ddd70b2f660',
      service_id: 'standart_overnight',
      master_tracking_number: '234234234233',
      original_shipment_id: null,
      created_at: '2024-09-05T23:13:00Z',
      updated_at: '2024-09-06T10:00:00Z',
      ...over,
    },
    relationships: {
      packages: { data: packageIds.map((p) => ({ id: p, type: PACKAGE_TYPE })) },
      address_from: { data: { id: `${id}-from`, type: ADDRESS_TYPE } },
      address_to: { data: { id: `${id}-to`, type: ADDRESS_TYPE } },
    },
  }
}

/** The documented list example: shipment 0ac5adcc-… with one package and two addresses. */
export function docShipmentsResponse(): SkydropxShipmentsListResponse {
  const id = '0ac5adcc-a13d-427d-81dd-9ddd70b2f660'
  return {
    data: [docShipment(id, ['pkg-1'])],
    included: [
      docPackage('pkg-1', id),
      docAddress(`${id}-from`, 'from'),
      docAddress(`${id}-to`, 'to'),
    ],
    meta: { current_page: 2, next_page: 3, prev_page: 1, total_pages: 3, total_count: 8 },
  }
}

export function docCarrierService(
  over: Partial<SkydropxCarrierService> = {},
): SkydropxCarrierService {
  return {
    carrier_name: 'fedex',
    service_name: 'standard_overnight',
    service_code: 'standard_overnight',
    min_delivery_packages: 1,
    is_national: true,
    volumetric_weight_formula: '(height * width * length) / 5000.00',
    has_pickup: false,
    multi_packages_enabled: false,
    is_ltl: false,
    package_type: 'package',
    has_reschedule_pick: true,
    ...over,
  }
}

export function docTrackingEvent(
  over: Partial<NonNullable<SkydropxTrackingEvent['attributes']>> = {},
): SkydropxTrackingEvent {
  return {
    id: '0ac5adcc-a13d-427d-81dd-9ddd70b2f660',
    attributes: {
      description: 'EN RUTA DE ENTREGA',
      location: 'CORDOBA',
      date: '2024-09-05T23:13:00',
      status: 'last_mile',
      event_description: 'En ruta de entrega - Cordoba',
      ...over,
    },
  }
}
