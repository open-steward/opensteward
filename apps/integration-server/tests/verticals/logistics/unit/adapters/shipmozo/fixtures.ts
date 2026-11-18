/**
 * Rows copied from the response examples in Shipmozo's API documentation PDF
 * (linked from the panel's "API Documentation" dialog:
 * https://drive.google.com/file/d/1XjJXlfyrkkkcVkQHnQtPXaHqFkxejaQG/view).
 */

/** Get-Warehouses API, "Response Example", first row. */
export function docWarehouseRow() {
  return {
    id: 23481,
    default: 'YES',
    address_title: 'Sunshine Warehouse',
    name: 'Rahul Sharma',
    email: 'rahul.sharma@example.com',
    phone: '9001234567',
    alt_phone: '9007654321',
    address_line_one: 'Sunshine Plaza, Sector 12',
    address_line_two: 'Near Main Road',
    pincode: '122018',
    city: 'Gurgaon',
    state: 'Haryana',
    country: 'India',
    status: 'ACTIVE',
  }
}

/** Get-Warehouses API, "Response Example", second row. */
export function docWarehouseRowInactive() {
  return {
    id: 23482,
    default: 'NO',
    address_title: 'Green Valley',
    name: 'Aditi Mehta',
    email: 'aditi.mehta@example.com',
    phone: '9876543210',
    alt_phone: '',
    address_line_one: 'Green Valley Road, Sector 45',
    address_line_two: 'Opposite Park',
    pincode: '122003',
    city: 'Noida',
    state: 'Uttar Pradesh',
    country: 'India',
    status: 'INACTIVE',
  }
}

/** Get-Order-Label API, "Example", `data[0]`. */
export function docLabelRow() {
  return {
    label: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
    created_at: '2024-09-27 12:59:56',
  }
}

/** Track-Order API, "Example", `data`. */
export function docTrackData() {
  return {
    order_id: '12634WP61391513073',
    reference_id: '12634WP61391513073',
    awb_number: 'GGN9000181640',
    courier: 'Professional 0.5KG',
    expected_delivery_date: null,
    current_status: 'Pickup Pending',
    status_time: null,
    scan_detail: [],
  }
}
