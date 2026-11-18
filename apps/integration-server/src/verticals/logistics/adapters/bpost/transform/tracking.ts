import type { TrackingEvent } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import { BPOST_CARRIER_ID, trackingStatusFor } from '../constants'
import { childText, childrenNamed, expectRoot, type XmlNode } from '../xml'

// bpost trackingInfo: GET https://api.parcel.bpost.cloud/services/trackedmail/item/{item_nb}/trackingInfo
// bpack integration manual v3.3.35 §E.3.4.2: "The < itemTracking /> element
// will contain the address details, item details and status history of the
// bpack parcel." itemCode is the "Bpack parcel number"; each <stateInfo> holds
// time (e.g. "2012-11-23T09:31:07.427+01:00"), stateCode (e.g. "U01", see
// §E.6.2 Status List) and stateDescription (e.g. "DistributedNormally - regular").

export interface BpostStateInfo {
  time?: string
  stateCode?: string
  stateDescription?: string
}

export interface BpostItemTracking {
  itemCode: string
  customerReference?: string
  stateInfo: BpostStateInfo[]
}

/** Read the documented itemTracking document. */
export function parseItemTracking(xml: XmlNode): BpostItemTracking {
  const root = expectRoot(xml, 'itemTracking')
  const itemCode = childText(root, 'itemCode')
  if (!itemCode) throw new Error('bpost: itemTracking response carries no <itemCode>')
  return {
    itemCode,
    customerReference: childText(root, 'customerReference'),
    stateInfo: childrenNamed(root, 'stateInfo').map((s) => ({
      time: childText(s, 'time'),
      stateCode: childText(s, 'stateCode'),
      stateDescription: childText(s, 'stateDescription'),
    })),
  }
}

/**
 * One event per documented <stateInfo>, in the order bpost lists them. The
 * id is built from the item code and the state's own time and code, so the
 * same state reads back with the same id.
 */
export function transformTrackingEvents(raw: BpostItemTracking): TrackingEvent[] {
  return raw.stateInfo.map((state) => ({
    id: `${raw.itemCode}:${state.time ?? ''}:${state.stateCode ?? ''}`,
    trackingNumber: raw.itemCode,
    carrierId: BPOST_CARRIER_ID,
    status: trackingStatusFor(state.stateCode),
    description: state.stateDescription,
    occurredAt: toISODate(state.time),
    metadata: { stateCode: state.stateCode, customerReference: raw.customerReference },
  }))
}
