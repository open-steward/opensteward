/** OAuth2 endpoints */
export const OAUTH_AUTH_URL = 'https://podio.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://podio.com/oauth/token'

/** Expected field external_ids in the Podio apps */
export const CONTACT_FIELDS = {
  FIRST_NAME: 'first-name',
  LAST_NAME: 'last-name',
  EMAIL: 'email',
  PHONE: 'phone',
  TITLE: 'title',
  COMPANY: 'company',
} as const

export const COMPANY_FIELDS = {
  NAME: 'name',
  WEBSITE: 'website',
  PHONE: 'phone',
} as const

export const DEAL_FIELDS = {
  TITLE: 'title',
  VALUE: 'value',
  STAGE: 'stage',
  CONTACT: 'contact',
  COMPANY: 'company',
} as const
