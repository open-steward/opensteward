/**
 * InPost ShipX API.
 *
 * "Production environment Address of production environment
 * https://api-shipx-pl.easypack24.net" and "Test environment address:
 * https://sandbox-api-shipx-pl.easypack24.net"
 * (https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153477/).
 * The adapter has no environment key, so it uses the production host.
 */
export const INPOST_API_BASE = 'https://api-shipx-pl.easypack24.net/v1'

/** Where the token and organization id come from (same page as above). */
export const INPOST_ACCESS_HELP =
  'Parcel Manager > My Account > API: generate a Token and read your Organisation ID.'

/**
 * Tracking `status` names from the ShipX Statuses page
 * (https://dokumentacja-inpost.atlassian.net/wiki/spaces/PL/pages/18153478/).
 * Only statuses whose documented meaning matches a canonical status are
 * mapped; every other name is UNKNOWN.
 */
export const TRACKING_STATUS_MAP: Record<string, string> = {
  created: 'PRE_TRANSIT',
  offers_prepared: 'PRE_TRANSIT',
  offer_selected: 'PRE_TRANSIT',
  confirmed: 'PRE_TRANSIT',
  dispatched_by_sender: 'IN_TRANSIT',
  dispatched_by_sender_to_pok: 'IN_TRANSIT',
  collected_from_sender: 'IN_TRANSIT',
  taken_by_courier: 'IN_TRANSIT',
  taken_by_courier_from_pok: 'IN_TRANSIT',
  adopted_at_source_branch: 'IN_TRANSIT',
  sent_from_source_branch: 'IN_TRANSIT',
  adopted_at_sorting_center: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  out_for_delivery_to_address: 'OUT_FOR_DELIVERY',
  ready_to_pickup: 'AVAILABLE_FOR_PICKUP',
  ready_to_pickup_from_branch: 'AVAILABLE_FOR_PICKUP',
  delivered: 'DELIVERED',
  returned_to_sender: 'RETURN_TO_SENDER',
  undelivered: 'FAILURE',
  rejected_by_receiver: 'FAILURE',
  undelivered_wrong_address: 'FAILURE',
}
