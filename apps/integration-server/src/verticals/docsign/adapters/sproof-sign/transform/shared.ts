/**
 * Raw sproof Sign shapes, from `components.schemas` of
 * https://sign.sproof.com/api/v1/documentation/json. Only documented fields
 * are declared.
 */

/** `_Member`. */
export interface RawSproofMember {
  id?: string
  email?: string
  firstName?: string
  lastName?: string
  lastActivityAt?: string
  createdAt?: string
  signed?: boolean
  isAdmin?: boolean
  isSigner?: boolean
  isApprover?: boolean
  isViewer?: boolean
  approvedAt?: string | null
  viewedAt?: string | null
  signedAt?: string | null
  signingOrder?: number
  declinedAt?: string | null
  signatures?: Array<{ signatureType: string; signedAt: string }>
  /** `SignaturePositionResponse` or an array of them; not read by the transforms. */
  signaturePosition?: unknown
  [key: string]: unknown
}

/** `_Document`: the element of GET /documents and the reply of GET /documents/{memberId}. */
export interface RawSproofDocument {
  name?: string
  id?: string
  updatedAt?: string
  createdAt?: string
  signaturesTypes?: string[]
  callbackUrl?: string
  returnUrl?: string
  returnBtnText?: string
  inPersonSigning?: boolean
  signingRound?: number
  /** "Possible values are: draft, pending, declined, completed, attachment, manuallyPending, manuallyCompleted" */
  state?: string
  /** "Usually the owner of the document, but if you use getSignatureStatus the member will be one who's id is provided in the request" */
  member?: RawSproofMember
  /** "A list of invited contacts" */
  members?: RawSproofMember[]
  boxes?: unknown[]
  refId?: string
  allSignersSigned?: boolean
  allMembersSigned?: boolean
  focusedSigningMode?: boolean
  [key: string]: unknown
}

/** `_PaginationObject`. */
export interface RawSproofPagination {
  total?: number
  lastPage?: number
  perPage?: number
  currentPage?: number
  to?: number
}

/** `_DocumentListResponse`. */
export interface RawSproofDocumentList {
  data?: RawSproofDocument[]
  pagination?: RawSproofPagination
}

export function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  return undefined
}

export function strMap(input: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'object') continue
    out[k] = String(v)
  }
  return out
}

export function toIso(s: unknown): string | undefined {
  const str = pickStr(s)
  if (!str) return undefined
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

/**
 * The id a sproof document is read back by. GET /documents/{memberId} is the
 * only documented read of one document, and `member.id` is its path
 * parameter: "The member ID can be used to open the document".
 */
export function ownerMemberId(raw: RawSproofDocument): string {
  const id = pickStr(raw.member?.id)
  if (!id) throw new Error('sproof-sign: document has no member.id to read it back by')
  return id
}

export function fullName(m: RawSproofMember | undefined): string | undefined {
  const name = [m?.firstName, m?.lastName].filter((p): p is string => !!p).join(' ')
  return name || undefined
}
