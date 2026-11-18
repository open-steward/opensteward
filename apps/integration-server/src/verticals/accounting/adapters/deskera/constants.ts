// Deskera uses JWT sign-in via IAM, not OAuth2 code flow.
// DESKERA_AUTH_URL points to the IAM sign-in page for manual token retrieval.
export const DESKERA_AUTH_URL = 'https://bifrost.deskera.com/v1/iam/auth/sign-in'
export const DESKERA_TOKEN_URL = 'https://bifrost.deskera.com/v1/iam/auth/sign-in'
export const DESKERA_API_BASE = 'https://bifrost.deskera.com/v1/'

export const RATE_LIMIT_RPM = 100
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
