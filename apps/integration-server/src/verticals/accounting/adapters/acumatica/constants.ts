// Auth URLs use {instance} placeholder — replaced at runtime with instanceUrl from credentials.extra
export const ACUMATICA_AUTH_PATH = '/identity/connect/authorize'
export const ACUMATICA_TOKEN_PATH = '/identity/connect/token'
// Default endpoint version 24.200.001 is the latest (Acumatica 2024 R2)
export const ACUMATICA_API_PATH = '/entity/Default/24.200.001/'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000
