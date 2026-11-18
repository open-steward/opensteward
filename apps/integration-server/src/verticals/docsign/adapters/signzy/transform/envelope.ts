import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import { pickStr, strMap, toIso } from './shared'

/**
 * Raw Signzy Contract360 contract, as returned by POST /contract/pulldata.
 * Field names are the lowercase, unspaced keys Signzy uses on the wire
 * (e.g. `contractid`, `contractstatus`, `signerdetail`).
 *
 * Content-bearing fields (`initialcontract`, `finalsignedcontract`,
 * `signersignedcontract`, `*hash`, `estampedfile`, the per-signer `signerdscdata`
 * Aadhaar payload) are intentionally NOT surfaced — they are document content /
 * KYC attachments, refused at the schema firewall.
 */
export interface RawSignzyContract {
  contractid: string
  contractname?: string
  contractexecutername?: string
  contractstatus?: string
  iscompleted?: boolean
  contractcompletiontime?: string | number
  contractttl?: number
  initialsignercount?: number
  signedsignercount?: number
  deletedsignercount?: number
  callbackurl?: string
  signercallbackurl?: string
  successredirecturl?: string
  failureredirecturl?: string
  customermaillist?: string[]
  customermaillistvisibility?: string
  callbackstatus?: string
  estamp?: {
    transactionid?: string
    estampstatus?: string
    [key: string]: unknown
  }
  signerdetail?: RawSignzySigner[]
  [key: string]: unknown
}

/** A single entry of the contract's `signerdetail[]` array. */
export interface RawSignzySigner {
  signerid?: string
  signername?: string
  signergender?: string
  signeryearofbirth?: string
  signaturetype?: string
  status?: string
  errormessage?: string
  aadhaarstatus?: string
  aadhaarerrormessage?: string
  signerip?: string
  noofsuccessfulattempts?: number
  nooffailureattempts?: number
  contractlastsigntime?: string | number
  notificationdetails?: RawSignzyNotification[]
  [key: string]: unknown
}

/** Per-signer notification timeline (used to synthesise audit-trail entries). */
export interface RawSignzyNotification {
  event?: string
  transactiondetails?: Array<{
    channel?: string
    attempts?: Array<{
      timestamp?: string | number
      id?: string
      status?: string
      description?: string
      vendorid?: string
    }>
  }>
}

function mapStatus(raw: RawSignzyContract): EnvelopeStatus {
  const s = (raw.contractstatus ?? '').toLowerCase()
  if (raw.iscompleted === true) return 'completed'
  switch (s) {
    case 'completed':
    case 'signed':
      return 'completed'
    case 'rejected':
    case 'declined':
      return 'declined'
    case 'cancelled':
    case 'deleted':
      return 'voided'
    case 'expired':
      return 'expired'
    case 'pending':
    case 'inprogress':
      return 'sent'
    case 'initiated':
      return 'sent'
    case 'draft':
      return 'draft'
    default:
      return 'sent'
  }
}

export function transformEnvelope(raw: RawSignzyContract): Envelope {
  const signerIds = (raw.signerdetail ?? [])
    .map((s) => pickStr(s.signerid))
    .filter((id): id is string => typeof id === 'string')
  return {
    id: raw.contractid,
    externalId: raw.contractid,
    status: mapStatus(raw),
    subject: raw.contractname ?? '',
    senderName: pickStr(raw.contractexecutername),
    // Signzy contracts have no recipient routing-order concept; signers are a
    // flat parallel set.
    signingOrder: 'parallel',
    signerIds,
    // Documents are exposed only as content URLs/base64 (refused). There is no
    // per-document metadata listing, so documentIds stays empty.
    documentIds: [],
    completedAt: raw.iscompleted ? toIso(raw.contractcompletiontime) : undefined,
    platform: 'signzy',
    metadata: strMap({
      contractstatus: raw.contractstatus,
      contractexecutername: raw.contractexecutername,
      initialsignercount: raw.initialsignercount,
      signedsignercount: raw.signedsignercount,
      deletedsignercount: raw.deletedsignercount,
      callbackstatus: raw.callbackstatus,
      estampstatus: raw.estamp?.estampstatus,
      estamptransactionid: raw.estamp?.transactionid,
    }),
    raw,
  }
}
