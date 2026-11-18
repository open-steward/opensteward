export const BIGIN_DEFAULT_BASE_URL = 'https://www.zohoapis.com/bigin/v2'
export const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2/auth'
export const ZOHO_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token'

export const DEFAULT_BIGIN_SCOPES: readonly string[] = [
  'ZohoBigin.modules.contacts.ALL',
  'ZohoBigin.modules.accounts.ALL',
  'ZohoBigin.modules.pipelines.ALL',
  'ZohoBigin.modules.activities.ALL',
  'ZohoBigin.modules.notes.ALL',
  // Layouts Metadata API, which lists Team Pipelines (listPipelines/getPipeline).
  'ZohoBigin.settings.layouts.READ',
]
