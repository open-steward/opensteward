// Center uses API key authentication via the x-center-api-key header — there is no OAuth2 flow.
// API key is provisioned via the Center developer portal / sandbox onboarding.
export const CENTER_API_BASE = 'https://api.getcenter.com'
export const CENTER_SETTINGS_URL = 'https://developer.getcenter.com/docs/getting-started'

// Rate limit: not officially published — retry on 429 with Retry-After
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
