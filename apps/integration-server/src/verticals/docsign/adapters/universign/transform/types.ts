/**
 * Universign API v1 objects, as documented at
 * https://apps.universign.com/docs/api/ ("The Transaction object", "List all
 * transactions → Returns", "The Template object"). Only the fields this
 * adapter reads are typed; everything else rides along in `raw`.
 */

/** `participants[ ]` of a transaction or template. */
export interface RawUniversignParticipant {
  /** "The email address of the participant or the temporary ID of the unknown participant." */
  email: string
  /** "The designation of the unknown participant." */
  designation?: string
  /** "The participant full name as it will display in the signature." */
  full_name?: string
  /**
   * "The participant state. One of open or completed." Documented only on
   * list rows (List all transactions → `content[ ].participants[ ]. state`);
   * the Transaction object's attribute table omits it, but the "Start a
   * transaction" and "Cancel a transaction" response examples carry it.
   */
  state?: string
  /** "The minimum required level of signature for a participant" (level0 … level4). */
  min_signature_level?: string
  [key: string]: unknown
}

/** `documents[ ].fields[ ]`. */
export interface RawUniversignField {
  id: string
  /** signature, visa, text, label, … */
  type?: string
  [key: string]: unknown
}

/** `documents[ ]`. */
export interface RawUniversignDocument {
  /** "The document ID." */
  id: string
  /** "The name of the document, if you set any. If not, the file name is used." */
  name: string
  fields?: RawUniversignField[]
  [key: string]: unknown
}

/** `instructions`. */
export interface RawUniversignInstructions {
  signatures?: Array<{ signer: string; field: string }>
  reviews?: Array<{ reviewer: string; recipient?: string }>
  sequencing?: Array<{ before: string; after: string }>
  editions?: Array<{ editor: string; recipient?: string[] }>
  [key: string]: unknown
}

/** `actions[ ]`. */
export interface RawUniversignAction {
  id: string
  /** "The email address of the participant having to perform the action." */
  actor: string
  /** open, waiting or closed ("The Template object" → actions[ ].state; the transaction examples use the same values). */
  state?: string
  /** "The date the action has been opened for its actor." */
  started_at?: string
  /** "The date the action has been closed …" */
  closed_at?: string
  [key: string]: unknown
}

/** "The Transaction object" (GET /v1/transactions/{transaction_id}). */
export interface RawUniversignTransaction {
  object?: 'transaction'
  id: string
  folder_id?: string
  created_at?: string
  started_at?: string
  expires_at?: string
  closed_at?: string
  /** "The transaction name. Default value is the transaction ID." */
  name?: string
  language?: string
  /** draft, started, paused, cancelled, expired, closed, completed */
  state?: string
  cancel_code?: string
  cancel_reason?: string
  creator?: {
    name?: string
    email?: string
    workspace_name?: string
    api_key_name?: string
  }
  participants?: RawUniversignParticipant[]
  documents?: RawUniversignDocument[]
  instructions?: RawUniversignInstructions
  actions?: RawUniversignAction[]
  metadata?: Record<string, string>
  [key: string]: unknown
}

/** One row of `content` in "List all transactions → Returns". */
export interface RawUniversignTransactionRow {
  id: string
  [key: string]: unknown
}

/** A page of GET /v1/transactions or GET /v1/templates: `{ has_more, content }`. */
export interface RawUniversignPage<T> {
  has_more: boolean
  content: T[]
}

/** "The Template object" (GET /v1/templates/{template_id}, and each row of GET /v1/templates). */
export interface RawUniversignTemplate {
  object?: 'template'
  id: string
  /** "The name of the template." */
  template_name?: string
  folder_id?: string
  folder_name?: string
  created_at?: string
  /** draft or published */
  state?: string
  language?: string
  last_publication_date?: string
  participants?: RawUniversignParticipant[]
  documents?: RawUniversignDocument[]
  instructions?: RawUniversignInstructions
  metadata?: Record<string, string>
  [key: string]: unknown
}
