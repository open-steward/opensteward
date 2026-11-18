/** SugarCRM REST API v11.1 base path (appended to instanceUrl). */
export const API_BASE_PATH = '/rest/v11_1'

export const CONTACTS_FIELDS = 'id,first_name,last_name,email1,phone_work,title,account_id,assigned_user_id,date_entered,date_modified'
export const ACCOUNTS_FIELDS = 'id,name,website,phone_office,description,assigned_user_id,date_entered,date_modified'
export const OPPORTUNITIES_FIELDS = 'id,name,amount,currency_id,account_id,sales_stage,probability,close_date,assigned_user_id,date_entered,date_modified'
export const TASKS_FIELDS = 'id,name,description,date_due,status,assigned_user_id,contact_id,date_entered,date_modified'
export const NOTES_FIELDS = 'id,name,description,contact_id,opportunity_id,assigned_user_id,date_entered,date_modified'

export const DEFAULT_MAX_NUM = 25
