import type { Carrier } from '../../../schema/carrier'
import type { CarrierService } from '../../../schema/shared'
import { BPOST_CARRIER_ID, BPOST_TRACKING_URL_TEMPLATE } from '../constants'
import { childrenNamed, expectRoot, type XmlNode } from '../xml'

// bpost Get Product configuration: GET {serviceEndPoint}/{accountId}/productconfig
// bpack integration manual v3.3.35 §C.3.6: "This service will return all
// information about the configuration of this shop." The response elements
// (§C.3.6.2) are productConfiguration > deliveryMethod > product > price /
// option; the attributes are those of the documented example response
// ("SHM API v5 examples/Get Product configuration/Example response.xml"):
//   <deliveryMethod name="home or office">
//     <product name="bpack 24h Pro">
//       <price price20To30="550" price10To20="550" price5To10="550" price2To5="550"
//              priceLessThan2="50" countryIso2Code="BE" />
//       <option price="100" name="Saturday" />

export interface BpostProductConfigPrice {
  countryIso2Code?: string
  priceLessThan2?: number
  price2To5?: number
  price5To10?: number
  price10To20?: number
  price20To30?: number
}

export interface BpostProductConfigOption {
  name?: string
  price?: number
}

export interface BpostProductConfigProduct {
  name?: string
  price?: BpostProductConfigPrice[]
  option?: BpostProductConfigOption[]
}

export interface BpostProductConfigDeliveryMethod {
  name?: string
  product?: BpostProductConfigProduct[]
}

export interface BpostProductConfigResponse {
  deliveryMethod?: BpostProductConfigDeliveryMethod[]
}

function num(value: string | undefined): number | undefined {
  if (value === undefined || value.trim() === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

const PRICE_TIERS = [
  'priceLessThan2',
  'price2To5',
  'price5To10',
  'price10To20',
  'price20To30',
] as const

/** Read the documented productConfiguration document into plain objects. */
export function parseProductConfiguration(xml: XmlNode): BpostProductConfigResponse {
  const root = expectRoot(xml, 'productConfiguration')
  return {
    deliveryMethod: childrenNamed(root, 'deliveryMethod').map((dm) => ({
      name: dm.attrs['name'],
      product: childrenNamed(dm, 'product').map((p) => ({
        name: p.attrs['name'],
        price: childrenNamed(p, 'price').map((pr) => {
          const price: BpostProductConfigPrice = { countryIso2Code: pr.attrs['countryIso2Code'] }
          for (const tier of PRICE_TIERS) price[tier] = num(pr.attrs[tier])
          return price
        }),
        option: childrenNamed(p, 'option').map((o) => ({
          name: o.attrs['name'],
          price: num(o.attrs['price']),
        })),
      })),
    })),
  }
}

/**
 * bpost as one carrier, its services the shop's configured products. The
 * service code is the product name itself: that is the value an order names
 * its product by (`<ns3:product>bpack 24h business</ns3:product>` in the
 * Retrieve Order example). A product offered under two delivery methods is
 * one service.
 */
export function transformCarrier(raw: BpostProductConfigResponse): Carrier {
  const services: CarrierService[] = []
  const seen = new Set<string>()
  for (const dm of raw.deliveryMethod ?? []) {
    for (const product of dm.product ?? []) {
      const name = product.name?.trim()
      if (!name || seen.has(name)) continue
      seen.add(name)
      services.push({ code: name, name })
    }
  }

  return {
    id: BPOST_CARRIER_ID,
    name: 'bpost',
    code: BPOST_CARRIER_ID,
    trackingUrlTemplate: BPOST_TRACKING_URL_TEMPLATE,
    services,
    metadata: raw as Record<string, unknown>,
  }
}
