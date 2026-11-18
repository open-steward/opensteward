// Neurored is built on the Salesforce platform (Force.com).
// The OAuth endpoints are standard Salesforce OAuth2 endpoints.
// The API base follows the Salesforce Connected App / REST pattern;
// the actual org-specific domain is supplied at runtime via the
// `instanceUrl` field returned by the Salesforce token response.

export const NEURORED_OAUTH_AUTHORIZE_URL = 'https://login.salesforce.com/services/oauth2/authorize'
export const NEURORED_OAUTH_TOKEN_URL = 'https://login.salesforce.com/services/oauth2/token'

// Salesforce REST API version used for Neurored object queries
export const NEURORED_API_VERSION = 'v59.0'

// Salesforce Connected App scopes sufficient for TMS read/write
export const NEURORED_DEFAULT_SCOPES = ['api', 'refresh_token', 'offline_access']

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

export const RATE_LIMIT_RPS = 20

// Neurored custom Salesforce object API names
export const NEURORED_SHIPMENT_OBJECT = 'NR_Shipment__c'
export const NEURORED_TRACKING_OBJECT = 'NR_TrackingEvent__c'

export const TRACKING_STATUS_MAP: Record<string, string> = {
  Planned: 'PRE_TRANSIT',
  Booked: 'PRE_TRANSIT',
  'In Transit': 'IN_TRANSIT',
  'Out for Delivery': 'OUT_FOR_DELIVERY',
  Delivered: 'DELIVERED',
  Exception: 'FAILURE',
  Cancelled: 'FAILURE',
  'Return to Sender': 'RETURN_TO_SENDER',
}

export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  Planned: 'PENDING',
  Booked: 'LABEL_CREATED',
  'In Transit': 'IN_TRANSIT',
  'Out for Delivery': 'OUT_FOR_DELIVERY',
  Delivered: 'DELIVERED',
  Exception: 'EXCEPTION',
  Returned: 'RETURNED',
  Cancelled: 'CANCELLED',
}
