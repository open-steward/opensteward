export const CERTINIA_AUTH_URL = 'https://login.salesforce.com/services/oauth2/authorize'
export const CERTINIA_TOKEN_URL = 'https://login.salesforce.com/services/oauth2/token'

// Base API URL uses instance_url stored in credentials.extra.instance_url
export const CERTINIA_API_PATH = '/services/apexrest/certinia'

// Salesforce standard rate limits apply (no hard daily cap)
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
