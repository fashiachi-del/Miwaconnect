// Numeric columns come back from Postgres as strings; dates come back as
// Date objects over the Neon HTTP driver. Both are rendered through
// Number()/new Date(), so the shared row types allow either.

export type Factory = {
  factory_id: string;
  factory_name: string;
  location: string;
  price_per_tonne_kes: string | number;
  avg_payment_days: number;
  payment_speed_rating: string;
  queue_status: string;
  transport_rate_0_15km: string | number;
  transport_rate_16_30km: string | number;
  transport_rate_31_plus_km: string | number;
  last_updated: string;
};

export type Farmer = {
  farmer_id: string;
  full_name: string;
  phone_number: string;
  county_ward: string;
  plot_size_acres: string | number;
  contract_status: string;
  created_at: string;
};

export type HarvestBooking = {
  booking_id: string;
  farmer_id: string;
  factory_id: string;
  est_tonnage: string | number;
  harvest_date: string;
  distance_band: string;
  need_cutters: boolean;
  use_factory_transport: boolean;
  status: string;
  factory_truck_plate: string | null;
  created_at: string;
  factory_name: string;
};

export type AdminBooking = HarvestBooking & {
  full_name: string;
  phone_number: string;
  price_per_tonne_kes: string | number;
};

export type PayoutRow = {
  payout_id: number;
  ticket_no: string;
  farmer_id: string;
  payable_tonnage: string | number;
  price_per_tonne_kes: string | number;
  transport_kes: string | number;
  harvesting_kes: string | number;
  input_loan_kes: string | number;
  cess_levy_kes: string | number;
  gross_kes: string | number;
  net_payout_kes: string | number;
  gross_tonnes: string | number;
  tare_tonnes: string | number;
  trash_percent: string | number;
  delivery_date: string;
  factory_name: string;
};

export type AppData = {
  factories: Factory[];
  farmer: Farmer | null;
  bookings: HarvestBooking[];
  payouts: PayoutRow[];
};

export type AdminData = {
  factories: Factory[];
  bookings: AdminBooking[];
};
