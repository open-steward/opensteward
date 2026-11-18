export const ZOHO_DEFAULT_BASE_URL = 'https://www.zohoapis.com/crm/v8'
export const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2/auth'
export const ZOHO_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token'

/** Default Zoho CRM scopes — used when the adapter is constructed without
 *  an explicit scopes config. Operators can override per platform via
 *  /platforms/crm/zoho-crm or per Connect Link via the mint form. */
export const DEFAULT_ZOHO_SCOPES: readonly string[] = [
  'ZohoCRM.modules.contacts.ALL',
  'ZohoCRM.modules.Accounts.ALL',
  'ZohoCRM.modules.Deals.ALL',
  'ZohoCRM.modules.Tasks.ALL',
  'ZohoCRM.modules.Notes.ALL',
  'ZohoCRM.settings.pipeline.ALL',
  // listPipelines reads the Deals layouts first: "Scope ZohoCRM.settings.layouts.READ"
  // (https://www.zoho.com/crm/developer/docs/api/v8/layouts-meta.html).
  'ZohoCRM.settings.layouts.READ',
]
