// CargoWise One — WiseTech Global
// OAuth 2.0 authorization code flow via ediEnterprise / CargoWise online developer portal
// Docs: https://developer.cargowise.com/

export const CARGOWISE_API_BASE = 'https://api.cargowise.com/v1'

export const CARGOWISE_OAUTH_AUTHORIZE_URL =
  'https://auth.cargowise.com/oauth/authorize'

export const CARGOWISE_OAUTH_TOKEN_URL =
  'https://auth.cargowise.com/oauth/token'

export const DEFAULT_SCOPES = ['shipments:read', 'tracking:read', 'milestones:read']

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

export const RATE_LIMIT_RPS = 20

export const TRACKING_STATUS_MAP: Record<string, string> = {
  // CargoWise milestone codes → OpenSteward canonical statuses
  BKD: 'PRE_TRANSIT',   // Booked
  RCS: 'PRE_TRANSIT',   // Received from shipper
  DEP: 'IN_TRANSIT',    // Departed
  ARR: 'IN_TRANSIT',    // Arrived
  CCD: 'IN_TRANSIT',    // Customs cleared
  DLV: 'DELIVERED',     // Delivered
  CAN: 'FAILURE',       // Cancelled
  RTN: 'FAILURE',       // Returned
}
