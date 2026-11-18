import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import { PacketaClient } from '../client'

/**
 * A single step in a Packeta tracking history.
 * Extracted from a <packetTracking> XML response.
 */
export interface PacketaTrackingStep {
  /** Packeta status code (numeric string) */
  statusCode?: string
  statusText?: string
  /** When the event occurred (ISO 8601) */
  dateTime?: string
  /** Human-readable description */
  description?: string
  /** Branch/city name where the event occurred */
  branchName?: string
  country?: string
}

/**
 * Map a Packeta tracking status code to a canonical TrackingEventStatus.
 *
 * Status codes observed in the Packeta tracking feed:
 *   1  = Pending
 *   2  = Arrived at depot / arrived at sorting facility
 *   3  = Ready for collection
 *   4  = In transit
 *   5  = Delivered
 *   6  = Returned to sender
 *   7  = Out for delivery
 *   8  = Cancelled / undeliverable
 *   9  = Exception
 */
function mapStatus(code: string | undefined): TrackingEventStatus {
  switch (code) {
    case '1':  return 'PRE_TRANSIT'
    case '2':
    case '3':  return 'AVAILABLE_FOR_PICKUP'
    case '4':  return 'IN_TRANSIT'
    case '7':  return 'OUT_FOR_DELIVERY'
    case '5':  return 'DELIVERED'
    case '6':  return 'RETURN_TO_SENDER'
    case '8':
    case '9':  return 'FAILURE'
    default:   return 'UNKNOWN'
  }
}

/**
 * Parse a <packetTracking> XML response and return an array of TrackingEvent objects.
 *
 * The response wraps steps in a <steps> element with repeated <step> children:
 *
 *   <packetTracking>
 *     <status>ok</status>
 *     <result>
 *       <steps>
 *         <step>
 *           <statusCode>4</statusCode>
 *           <dateTime>2024-03-15T10:30:00</dateTime>
 *           <statusText>In transit</statusText>
 *           <description>Parcel is in transit</description>
 *           <branchName>Prague Depot</branchName>
 *         </step>
 *         …
 *       </steps>
 *     </result>
 *   </packetTracking>
 */
export function parseTrackingXml(
  xml: string,
  barcode: string,
): TrackingEvent[] {
  const stepXmls = PacketaClient.extractAll(xml, 'step')

  if (stepXmls.length === 0) {
    // Return a single summary event if no steps are present
    const statusCode = PacketaClient.extract(xml, 'statusCode')
    const dateTime = PacketaClient.extract(xml, 'dateTime')
    return [
      {
        trackingNumber: barcode,
        carrierId: 'packeta',
        status: mapStatus(statusCode),
        occurredAt: toISODate(dateTime),
        metadata: { raw: xml } as Record<string, unknown>,
      },
    ]
  }

  return stepXmls.map((stepXml): TrackingEvent => {
    const step = parseStep(stepXml)
    const location =
      step.branchName ?? step.country
        ? {
            city: step.branchName ?? undefined,
            country: step.country ?? undefined,
          }
        : undefined

    return {
      trackingNumber: barcode,
      carrierId: 'packeta',
      status: mapStatus(step.statusCode),
      description: step.description ?? step.statusText ?? undefined,
      location,
      occurredAt: toISODate(step.dateTime),
      metadata: step as Record<string, unknown>,
    }
  })
}

function parseStep(xml: string): PacketaTrackingStep {
  return {
    statusCode: PacketaClient.extract(xml, 'statusCode'),
    statusText: PacketaClient.extract(xml, 'statusText'),
    dateTime: PacketaClient.extract(xml, 'dateTime'),
    description: PacketaClient.extract(xml, 'description'),
    branchName: PacketaClient.extract(xml, 'branchName'),
    country: PacketaClient.extract(xml, 'country'),
  }
}
