export const HOSTS = {
  sandbox: 'https://sandbox.dlocal.com',
  live: 'https://api.dlocal.com',
} as const

export type DLocalEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: DLocalEnvironment = 'sandbox'
export const DEFAULT_PAGE_SIZE = 50
