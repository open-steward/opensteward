/**
 * SendParcel carrier data — derived from the official SP API documentation
 * (SP-API-EN.pdf, section 9 "Courier services ID").
 *
 * SendParcel is a multi-carrier aggregator (Lithuania). The REST API provides
 * no live /carriers endpoint; instead, section 9 of the official PDF documents
 * all carrier/service IDs as a static reference table. We expose that table as
 * canonical Carrier records so callers can enumerate the available carriers
 * without making an API call.
 *
 * Carriers integrated by SendParcel (as of the last PDF update, Oct 2021):
 *   DHL, TNT, FedEx, DPD, Omniva, Venipak, Itella/GLS, LP Express, SST, SP
 */

import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'

/**
 * Static carrier definitions sourced from SP API documentation section 9.
 * Each entry maps a carrier slug to its human name, tracking URL template,
 * and the service codes documented in the PDF.
 */
interface StaticCarrierDef {
  id: string
  name: string
  code: string
  trackingUrlTemplate?: string
  services: CarrierService[]
}

const SENDPARCEL_CARRIERS: StaticCarrierDef[] = [
  {
    id: 'dhl',
    name: 'DHL',
    code: 'dhl',
    trackingUrlTemplate: 'https://www.dhl.com/en/express/tracking.html?AWB={trackingNumber}',
    services: [
      { code: '38',  name: 'DHL Express' },
      { code: '45',  name: 'DHL Import Express' },
      { code: '158', name: 'DHL Import Express' },
      { code: '41',  name: 'DHL Economy' },
      { code: '139', name: 'DHL Economy' },
      { code: '46',  name: 'DHL Import Economy' },
    ],
  },
  {
    id: 'tnt',
    name: 'TNT',
    code: 'tnt',
    trackingUrlTemplate: 'https://www.tnt.com/express/en_gb/site/tracking.html?searchType=CON&cons={trackingNumber}',
    services: [
      { code: '36',  name: 'TNT Express' },
      { code: '159', name: 'TNT Express' },
      { code: '68',  name: 'TNT Import Express' },
      { code: '35',  name: 'TNT Economy' },
      { code: '111', name: 'TNT Economy' },
      { code: '140', name: 'TNT Economy' },
      { code: '69',  name: 'TNT Import Economy' },
      { code: '112', name: 'TNT Import Economy' },
    ],
  },
  {
    id: 'fedex',
    name: 'FedEx',
    code: 'fedex',
    trackingUrlTemplate: 'https://www.fedex.com/en-us/tracking.html?tracknumbers={trackingNumber}',
    services: [
      { code: '128', name: 'FedEx Express' },
    ],
  },
  {
    id: 'dpd',
    name: 'DPD',
    code: 'dpd',
    trackingUrlTemplate: 'https://www.dpd.com/tracking/{trackingNumber}',
    services: [
      { code: '72',  name: 'DPD Parcel locker-parcel locker (Lithuania)' },
      { code: '52',  name: 'DPD Parcel locker-courier (Lithuania)' },
      { code: '127', name: 'DPD Parcel locker-parcel locker (Latvia, Estonia)' },
      { code: '126', name: 'DPD Parcel locker-courier (Latvia, Estonia)' },
      { code: '51',  name: 'DPD Parcel locker-courier (EU)' },
    ],
  },
  {
    id: 'omniva',
    name: 'Omniva',
    code: 'omniva',
    trackingUrlTemplate: 'https://www.omniva.ee/era/jalgimine?barcode={trackingNumber}',
    services: [
      { code: '88',  name: 'Omniva Express' },
      { code: '92',  name: 'Omniva Parcel locker-parcel locker' },
      { code: '98',  name: 'Omniva Parcel locker-courier' },
      { code: '99',  name: 'Omniva Courier-parcel locker' },
      { code: '73',  name: 'Omniva Express LV' },
      { code: '74',  name: 'Omniva Parcel locker-parcel locker LV/EE' },
      { code: '76',  name: 'Omniva Parcel locker-courier LV/EE' },
      { code: '101', name: 'Omniva Courier-parcel locker LV/EE' },
      { code: '77',  name: 'Omniva Import Express' },
      { code: '78',  name: 'Omniva Import Parcel locker-parcel locker' },
      { code: '79',  name: 'Omniva Import Parcel locker-courier' },
      { code: '100', name: 'Omniva Import Courier-parcel locker' },
    ],
  },
  {
    id: 'venipak',
    name: 'Venipak',
    code: 'venipak',
    trackingUrlTemplate: 'https://venipak.com/tracking/?code={trackingNumber}',
    services: [
      { code: '42',  name: 'Venipak Express (Lithuania)' },
      { code: '102', name: 'Venipak Express (Lithuania)' },
      { code: '160', name: 'Venipak Courier-Parcel locker (Lithuania)' },
      { code: '43',  name: 'Venipak Express PL' },
      { code: '103', name: 'Venipak Express PL' },
      { code: '50',  name: 'Venipak Import Express PL' },
      { code: '83',  name: 'Venipak Express FI' },
      { code: '84',  name: 'Venipak Import Express FI' },
      { code: '86',  name: 'Venipak Express LV/EE' },
      { code: '104', name: 'Venipak Express LV/EE' },
      { code: '87',  name: 'Venipak Import Express LV/EE' },
      { code: '105', name: 'Venipak Import Express LV/EE' },
    ],
  },
  {
    id: 'itella',
    name: 'Itella / GLS',
    code: 'itella',
    trackingUrlTemplate: 'https://itella.fi/henkiloasiakkaat/lahetyksen-seuranta/?trackingCode={trackingNumber}',
    services: [
      { code: '55',  name: 'ITELLA Express (Lithuania)' },
      { code: '56',  name: 'ITELLA Economy (Latvia, Estonia, Finland)' },
      { code: '108', name: 'ITELLA Import Economy (Latvia, Estonia, Finland)' },
      { code: '57',  name: 'ITELLA-GLS Economy (Europe)' },
      { code: '132', name: 'ITELLA Courier-parcel locker (Lithuania)' },
      { code: '133', name: 'ITELLA Courier-parcel locker (Latvia, Estonia, Finland)' },
    ],
  },
  {
    id: 'lpexpress',
    name: 'LP EXPRESS',
    code: 'lpexpress',
    trackingUrlTemplate: 'https://www.post.lt/en/tracking?barcode={trackingNumber}',
    services: [
      { code: '123', name: 'LP EXPRESS Express (Lithuania)' },
      { code: '122', name: 'LP EXPRESS Economy (Lithuania)' },
      { code: '130', name: 'LP EXPRESS Shipping label by courier' },
      { code: '131', name: 'LP EXPRESS Shipping label by courier' },
      { code: '134', name: 'LP EXPRESS Parcel locker-parcel locker (S)' },
      { code: '135', name: 'LP EXPRESS Parcel locker-parcel locker (M)' },
      { code: '136', name: 'LP EXPRESS Courier-Parcel locker (S)' },
      { code: '137', name: 'LP EXPRESS Courier-Parcel locker (M)' },
    ],
  },
  {
    id: 'sst',
    name: 'SST',
    code: 'sst',
    services: [
      { code: '151', name: 'SST Economy (Lithuania)' },
      { code: '152', name: 'SST Economy (Lithuania)' },
      { code: '153', name: 'SST Economy (Lithuania)' },
      { code: '154', name: 'SST Economy (Lithuania)' },
    ],
  },
]

export function listCarriers(): Carrier[] {
  return SENDPARCEL_CARRIERS.map((def) => ({
    id: def.id,
    name: def.name,
    code: def.code,
    trackingUrlTemplate: def.trackingUrlTemplate,
    services: def.services,
    isActive: true,
    metadata: { source: 'static', docRef: 'SP-API-EN.pdf §9' } as Record<string, unknown>,
  }))
}

export function getCarrier(id: string): Carrier | undefined {
  const def = SENDPARCEL_CARRIERS.find((c) => c.id === id)
  if (!def) return undefined
  return {
    id: def.id,
    name: def.name,
    code: def.code,
    trackingUrlTemplate: def.trackingUrlTemplate,
    services: def.services,
    isActive: true,
    metadata: { source: 'static', docRef: 'SP-API-EN.pdf §9' } as Record<string, unknown>,
  }
}
