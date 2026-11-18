// Quadient Parcel Pending — intelligent parcel locker management API
// Documentation: https://developer.parcelpending.com/

export const QUADIENT_API_BASE = 'https://api.parcelpending.com/v1/'

// Quadient uses API key authentication — no OAuth2 flow.
// Operators obtain keys from the Parcel Pending developer portal.
export const QUADIENT_DASHBOARD_URL = 'https://developer.parcelpending.com/'

// Rate limiting: Parcel Pending enforces per-minute limits; be conservative.
export const RATE_LIMIT_RPM = 120
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
