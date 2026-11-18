/**
 * "Retrieve a Job" (GET /jobs/id/{jobID}) 200 body, assembled from the property
 * examples of https://app.cigotracker.com/reference/cigo-swagger.json. The spec
 * gives no whole-response example, so every value here is a documented
 * `example`, unchanged.
 */
import type { CigoJobResponse } from '../../../../../../../src/verticals/logistics/adapters/cigo-tracker/types'

export const RETRIEVE_JOB_EXAMPLE: CigoJobResponse = {
  statusCode: 200,
  status: 'OK',
  job: {
    job_id: 'f4e922d54b98a878488d2754fd4cfc0e',
    stop_type: 'job',
    job_type: 'delivery',
    status: 'completed',
    status_metadata: "{'data': 'Example of Free Text (it doesn't have to be JSON!)'}",
    post_staging: {
      tracking: {
        url: 'https://cigo.io/EXAMPLE',
        phone_number: '5148880000',
        access_code: '885854',
        tracking_number: 'P35UWX-GPIP6C-7ZZSJ2',
        tracking_number_suffix: '7ZZSJ2',
      },
      progress: {
        duration: 1063,
        start_datetime: '2024-08-01 09:23:21',
        end_datetime: '2024-08-01 09:41:04',
        started: true,
        finished: true,
      },
      scheduling: {
        operators: [
          {
            operator_id: '56a5eb4a1b7b64d2d22232f74ca98523',
            name: 'John Doe',
            reference_id: '95874-CA',
            username: 'example@domain.com',
            last_active: '2024-08-01 08:54:48',
          },
        ],
        itinerary_id: '6452b37d5242d835ba9a246feab2127c',
        itinerary_api_id: '6452b37d5242d835ba9a246feab2127c',
        vehicle: 'HINO 00765',
        vehicle_id: '00765',
        vehicle_api_id: 'bdca6e528b4324a2279d7ab25265431f',
        position: 1,
        route_metrics: {
          est_arrival_time: '2024-08-01 10:03:00',
          est_road_time: 26340,
          est_distance: 407222.73,
        },
      },
      coordinates: [46.7727384, -71.3180309],
      geocoding: {
        validity: 'valid',
        subdivision_code: 'QC',
        country_code: 'CA',
        timezone: 'America/Toronto',
      },
      digital_signature: {
        agreement: 'All items have been properly inspected during the delivery.',
        signed: false,
        name: null,
        datetime: null,
      },
      payment_collection: {
        payment_collection_allowed: false,
        balance_owed: 758.88,
        amount_collected: 758.88,
        payment_method: 'cash',
        paid_in_full: true,
      },
      review: {
        score: 4,
        comment: 'Had a great experience, friendly staff!',
        datetime: '2019-04-25 20:01:56',
        sales_score: 5,
      },
    },
    quick_desc: 'SAMPLE',
    date: '2024-08-01',
    original_date: '2019-03-29',
    confirmation_status: 'confirmed',
    first_name: 'John',
    last_name: 'Doe',
    phone_number: '(000) 000-0001',
    mobile_number: '(000) 000-0002',
    email: 'john.doe@example.com',
    address: '275 Notre-Dame St. East, Montreal, QC, H2Y 1C6',
    apartment: 'Suite 101',
    postal_code: 'H2Y 1C6',
    time_preference: 'AM',
    balance_owed: 265.89,
    comment: 'A sample comment regarding the Job for John Doe!',
    branch_id: 'S10',
    branch_api_id: '73de8cb492d22423a2a5a56f142b76b5',
    distribution_center_id: 'DC12',
    distribution_center_api_id: 'ba7ba295e3525fc61a4222d3674428db',
    time_frame: {
      start: '9:00 AM',
      end: '11:00 AM',
    },
    availability_times: [
      {
        start: '9:00 AM',
        end: '11:00 AM',
      },
    ],
    invoices: ['17823657812563'],
    barcodes: ['17823657812563'],
    label_count: 3,
    wait_time: 90,
    metrics: {
      handle_time: 25,
      weight: 191.5,
      volume: 4.5,
      value: 330.57,
      piece_count: 2,
      quantity: 2,
    },
    pickup_metrics: {
      handle_time: 10,
      weight: 20.6,
      volume: 2.1,
      value: 499.9,
      piece_count: 3,
      quantity: 1,
    },
    return_metrics: {
      handle_time: 15,
      weight: 213.4,
      volume: 1.8,
      value: 678.99,
      piece_count: 3,
      quantity: 2,
    },
    reference_id: 'J-WJG318322',
    customer_reference_id: 'C-WJG178262',
    permanent_link: 'https://cigotracker.com/share/job?hash={job_id}',
    creation_source: 'API',
    create_datetime: '2019-04-28 18:32:41',
  },
  actions: [
    {
      action_id: '97a7f7052349acb9db2fb28b19df3ba5',
      id: 'ASG819723891263',
      status: 'completed',
      status_reason: 'Review images associated with report for more details.',
      status_counters: {
        completed: 2,
        incomplete: 0,
        damaged: 0,
      },
      type: 'delivery',
      description: 'Astin Sofa - Grey',
      value: 330.57,
      unit_weight: 95.75,
      total_weight: 191.5,
      unit_volume: 2.25,
      total_volume: 4.5,
      piece_count: 1,
      piece_count_unit: 'boxes',
      quantity: 2,
      quantity_unit: null,
      handle_time: 25,
      stop_location_id: 'B12',
      stop_location_api_id: 'ffc9bcc45b9031a55e9401d148b9cc22',
      stop_location: {
        name: 'Stop Location A',
        geolocation: {
          coordinates: [46.7727384, -71.3180309],
        },
        time_frame: {
          start: '9:00 AM',
          end: '11:00 AM',
        },
      },
      invoice_number: '9871236WE127836',
      external_reference_id: 'CJA20121105TBA69420',
      shipping_barcode: '1234567890',
      create_datetime: '2019-05-01 16:19:22',
      properties: {
        require_barcode: false,
      },
    },
  ],
  related_on_route_stops: [
    {
      api_id: 'fe9900e2b9d56b41465bb302127f6197',
      status: 'completed',
      type: 'pickup',
      location: 'Stop Location A',
      address: '275 Notre-Dame St. East, Montreal, QC, H2Y 1C6',
      position: 1,
      eta: '09:30 AM',
      time_frame: {
        start: '09:00 AM',
        end: '11:00 AM',
      },
    },
  ],
}

/** "Search Jobs Response" (POST /jobs/search) 200 body, from the same examples. */
export const SEARCH_JOBS_EXAMPLE = {
  statusCode: 200,
  status: 'OK',
  in_staging: { count: 1, ids: ['37703edb3ce4532bc70e8b19b1989c52'] },
  post_staging: { count: 1, ids: ['864c4cb6402655563ed30fb5db298e90'] },
}
