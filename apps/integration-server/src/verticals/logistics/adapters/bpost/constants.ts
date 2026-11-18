import type { TrackingEventStatus } from '../../schema/trackingevent'

// Source for everything below: "bpack integration manual v 3.3.35" (26/05/2026),
// https://bpost.freshdesk.com/helpdesk/attachments/4176380323, linked from
// https://bpost.freshdesk.com/support/solutions/articles/4000037653, and the
// "SHM API v3-v5 examples" bundle, https://bpost.freshdesk.com/helpdesk/attachments/4122899940.

/** §C.3.2.3: "ServiceEndPoint is: https://shm-rest.bpost.cloud/services/shm" */
export const BPOST_SHM_API_BASE = 'https://shm-rest.bpost.cloud/services/shm'

/** §E.3.4.1: "URI: https://api.parcel.bpost.cloud/services/trackedmail/item/{item_nb}/trackingInfo" */
export const BPOST_TRACKING_API_BASE = 'https://api.parcel.bpost.cloud/services/trackedmail'

/** §C.3.6.1: "HTTP Header Accept: application/vnd.bpost.shm-productConfiguration-v3.1+XML" */
export const PRODUCT_CONFIGURATION_MEDIA_TYPE =
  'application/vnd.bpost.shm-productConfiguration-v3.1+XML'

/**
 * SHM API v5 examples, "Retrieve Order Information/General Web Service request
 * information.txt": "Accept: application/vnd.bpost.shm-order-v3.5+XML". The
 * manual's §C.3.5.3 still shows v3.3, whose example bundle is marked "end of
 * support 11-2022".
 */
export const ORDER_MEDIA_TYPE = 'application/vnd.bpost.shm-order-v3.5+XML'

export const BPOST_CARRIER_ID = 'bpost'

/**
 * §E.3.2 Item Barcode: "http://track.bpost.cloud/etr/light/performSearch.do?"
 * with "searchByItemCode=true &oss_language= &itemCodes=" (languages "EN, NL, FR, DE").
 */
export const BPOST_TRACKING_URL_TEMPLATE =
  'http://track.bpost.cloud/etr/light/performSearch.do?searchByItemCode=true&oss_language=en&itemCodes={trackingNumber}'

export const BPOST_ACCESS_HELP =
  'Your Shipping Manager account ID, and the passphrase: "the password of the shipping manager ' +
  'webservice", found in the admin panel of the Shipping Manager backend.'

export const BPOST_TRACKING_HELP =
  'Optional. The trackingInfo web service password: "The username is the Account ID. The password ' +
  'can be requested by sending an e-mail to esolutions@bpost.be".'

/**
 * §E.6.2 Status list, by status code. A code is mapped when every §E.6.2
 * description of it points the same way, or (L00 only, see below) when the
 * §E.6.3 scan sequences give the code one meaning. The rest (T03, whose listed
 * meanings run from "DistributedToShopNormally" to "RefusedByReceiverInShop",
 * the N-codes, I-codes, R-codes and so on) read as UNKNOWN with the
 * documented description kept on the event.
 */
const STATE_CODE_STATUS: Record<string, TrackingEventStatus> = {
  // "Z01 Announcement received"
  Z01: 'PRE_TRANSIT',
  // "A01 HandedIn - back_office" … "A08 HandedIn - foreign_office"
  A01: 'IN_TRANSIT',
  A02: 'IN_TRANSIT',
  A03: 'IN_TRANSIT',
  A04: 'IN_TRANSIT',
  A05: 'IN_TRANSIT',
  A06: 'IN_TRANSIT',
  A08: 'IN_TRANSIT',
  // "T00 Sorted - sorted_out", "T22 Sorted – scanned abroad"
  T00: 'IN_TRANSIT',
  T22: 'IN_TRANSIT',
  // Not unanimous in §E.6.2: beside "L00 BoundToRound - out_for_distribution" it lists
  // "BoundToRound - stopped_cod_amount_missing" and "- stopped_pension_delivery_date_not_reached".
  // Mapped from §E.6.3, whose every scan sequence reads "L00 Parcel is out for delivery"
  // (some add "(on his way back to sender)"); the §E.6.2 description is kept on the event.
  L00: 'OUT_FOR_DELIVERY',
  // "N74 AwaitingPickupByClient - deposit_special_package"
  N74: 'AVAILABLE_FOR_PICKUP',
  // "U01 DistributedNormally - regular" … "U08 DistributedNormally – forced by postman at safeplace"
  U01: 'DELIVERED',
  U02: 'DELIVERED',
  U03: 'DELIVERED',
  U04: 'DELIVERED',
  U05: 'DELIVERED',
  U06: 'DELIVERED',
  U07: 'DELIVERED',
  U08: 'DELIVERED',
  // "S00 DistributedAfterBTS - regular"; scan sequences: "S00 Parcel is delivered to sender"
  S00: 'RETURN_TO_SENDER',
  S02: 'RETURN_TO_SENDER',
  S03: 'RETURN_TO_SENDER',
  S04: 'RETURN_TO_SENDER',
  S05: 'RETURN_TO_SENDER',
  // "B00 AddressNotFound - addressee_unknown" … "B28 Undelivered-return to sender- pickup point closed after the second attempt"
  B00: 'FAILURE',
  B01: 'FAILURE',
  B02: 'FAILURE',
  B03: 'FAILURE',
  B04: 'FAILURE',
  B05: 'FAILURE',
  B06: 'FAILURE',
  B07: 'FAILURE',
  B08: 'FAILURE',
  B09: 'FAILURE',
  B10: 'FAILURE',
  B11: 'FAILURE',
  B12: 'FAILURE',
  B13: 'FAILURE',
  B18: 'FAILURE',
  B23: 'FAILURE',
  B24: 'FAILURE',
  B28: 'FAILURE',
}

export function trackingStatusFor(stateCode: string | undefined): TrackingEventStatus {
  if (!stateCode) return 'UNKNOWN'
  return STATE_CODE_STATUS[stateCode.toUpperCase()] ?? 'UNKNOWN'
}
