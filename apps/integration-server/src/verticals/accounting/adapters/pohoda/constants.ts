// mPohoda Open API — self-hosted per-installation; CZ default base
export const POHODA_API_BASE = 'https://api.mpohoda.cz'
// mPohoda uses client_credentials flow via ucet.pohoda.cz identity server
export const POHODA_AUTH_URL = 'https://ucet.pohoda.cz/connect/authorize'
export const POHODA_TOKEN_URL = 'https://ucet.pohoda.cz/connect/token'
// Scope required for CZ: Mph.OpenApi.Access.Cz
export const POHODA_TOKEN_SCOPE = 'Mph.OpenApi.Access.Cz'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
