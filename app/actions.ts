'use server';

import { neon } from '@neondatabase/serverless';
import { revalidatePath } from 'next/cache';
import type {
  AdminBooking,
  AdminData,
  AppData,
  Factory,
  Farmer,
  HarvestBooking,
  PayoutRow,
} from './types';

type NeonSql = ReturnType<typeof neon>;

let client: NeonSql | null = null;

// Created lazily so importing this module never requires DATABASE_URL
// (for example during `next build`).
function db(): NeonSql {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        'DATABASE_URL is not set. Add your Neon connection string to .env.local and run `npm run db:setup`.',
      );
    }
    client = neon(url);
  }
  return client;
}

const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  db()(strings, ...values)) as NeonSql;

export async function getAppData(farmerPhone?: string): Promise<AppData> {
  const factories = (await sql`
    SELECT * FROM factories ORDER BY price_per_tonne_kes DESC
  `) as Factory[];

  let farmer: Farmer | null = null;
  let bookings: HarvestBooking[] = [];
  let payouts: PayoutRow[] = [];

  if (farmerPhone) {
    const fRes = (await sql`
      SELECT * FROM farmers WHERE phone_number = ${farmerPhone} LIMIT 1
    `) as Farmer[];

    if (fRes.length > 0) {
      farmer = fRes[0];
      bookings = (await sql`
        SELECT b.*, f.factory_name
        FROM harvest_bookings b
        JOIN factories f ON b.factory_id = f.factory_id
        WHERE b.farmer_id = ${farmer.farmer_id}
        ORDER BY b.created_at DESC
      `) as HarvestBooking[];

      payouts = (await sql`
        SELECT p.*, d.gross_tonnes, d.tare_tonnes, d.trash_percent, d.delivery_date, f.factory_name
        FROM payouts_deductions p
        JOIN deliveries_weighbridge d ON p.ticket_no = d.ticket_no
        JOIN factories f ON d.factory_id = f.factory_id
        WHERE p.farmer_id = ${farmer.farmer_id}
        ORDER BY d.delivery_date DESC
      `) as PayoutRow[];
    }
  }

  return { factories, farmer, bookings, payouts };
}

export async function registerOrLoginFarmer(
  formData: FormData,
): Promise<{ farmer: Farmer } | { error: string }> {
  const phone = String(formData.get('phone_number') || '').trim();
  const fullName = String(formData.get('full_name') || '').trim();
  const countyWard = String(formData.get('county_ward') || '').trim();
  const plotAcres = Number(formData.get('plot_size_acres') || 0);
  const contractStatus = String(
    formData.get('contract_status') || 'Private / Independent',
  );

  if (!phone) {
    return { error: 'Enter your M-Pesa phone number.' };
  }

  const existing = (await sql`
    SELECT * FROM farmers WHERE phone_number = ${phone} LIMIT 1
  `) as Farmer[];

  if (existing.length > 0) {
    return { farmer: existing[0] };
  }

  if (!fullName) {
    return { error: 'Full name is required to create a new farmer account.' };
  }

  const inserted = (await sql`
    INSERT INTO farmers (full_name, phone_number, county_ward, plot_size_acres, contract_status)
    VALUES (${fullName}, ${phone}, ${countyWard}, ${plotAcres}, ${contractStatus})
    RETURNING *
  `) as Farmer[];

  revalidatePath('/portal');
  return { farmer: inserted[0] };
}

export async function createBooking(formData: FormData): Promise<void> {
  const farmerId = String(formData.get('farmer_id'));
  const factoryId = String(formData.get('factory_id'));
  const estTonnage = Number(formData.get('est_tonnage'));
  const harvestDate = String(formData.get('harvest_date'));
  const distanceBand = String(formData.get('distance_band'));
  const needCutters = formData.get('need_cutters') === 'on';

  await sql`
    INSERT INTO harvest_bookings (farmer_id, factory_id, est_tonnage, harvest_date, distance_band, need_cutters, use_factory_transport)
    VALUES (${farmerId}, ${factoryId}, ${estTonnage}, ${harvestDate}, ${distanceBand}, ${needCutters}, TRUE)
  `;
  revalidatePath('/portal');
}

// --- ADMIN / CLERK ACTIONS ---

export async function getAdminData(): Promise<AdminData> {
  const factories = (await sql`
    SELECT * FROM factories ORDER BY factory_name ASC
  `) as Factory[];

  const bookings = (await sql`
    SELECT b.*, fm.full_name, fm.phone_number, fc.factory_name, fc.price_per_tonne_kes
    FROM harvest_bookings b
    JOIN farmers fm ON b.farmer_id = fm.farmer_id
    JOIN factories fc ON b.factory_id = fc.factory_id
    ORDER BY b.created_at DESC
  `) as AdminBooking[];

  return { factories, bookings };
}

export async function updateFactoryPrice(formData: FormData): Promise<void> {
  const factoryId = String(formData.get('factory_id'));
  const price = Number(formData.get('price_per_tonne_kes'));
  const avgDays = Number(formData.get('avg_payment_days'));
  const queueStatus = String(formData.get('queue_status'));

  await sql`
    UPDATE factories
    SET price_per_tonne_kes = ${price},
        avg_payment_days = ${avgDays},
        payment_speed_rating = ${
          avgDays <= 10
            ? `Fast (${avgDays} Days)`
            : avgDays <= 15
              ? `Moderate (${avgDays} Days)`
              : `Slow (${avgDays}+ Days)`
        },
        queue_status = ${queueStatus},
        last_updated = CURRENT_TIMESTAMP
    WHERE factory_id = ${factoryId}
  `;
  revalidatePath('/admin');
  revalidatePath('/portal');
  revalidatePath('/');
}

export async function logWeighbridgeAndPayout(formData: FormData): Promise<void> {
  const ticketNo = String(formData.get('ticket_no')).trim().toUpperCase();
  const bookingId = String(formData.get('booking_id'));
  const farmerId = String(formData.get('farmer_id')).trim().toUpperCase();
  const factoryId = String(formData.get('factory_id')).trim().toUpperCase();
  const grossTonnes = Number(formData.get('gross_tonnes'));
  const tareTonnes = Number(formData.get('tare_tonnes'));
  const trashPercent = Number(formData.get('trash_percent') || 0);
  const pricePerTonne = Number(formData.get('price_per_tonne_kes'));
  const transportKes = Number(formData.get('transport_kes') || 0);
  const harvestingKes = Number(formData.get('harvesting_kes') || 0);
  const inputLoanKes = Number(formData.get('input_loan_kes') || 0);
  const cessLevyKes = Number(formData.get('cess_levy_kes') || 0);
  const truckPlate = String(formData.get('factory_truck_plate') || '').toUpperCase();

  const delivery = (await sql`
    INSERT INTO deliveries_weighbridge (ticket_no, booking_id, farmer_id, factory_id, gross_tonnes, tare_tonnes, trash_percent)
    VALUES (${ticketNo}, ${bookingId}, ${farmerId}, ${factoryId}, ${grossTonnes}, ${tareTonnes}, ${trashPercent})
    RETURNING payable_tonnage
  `) as { payable_tonnage: string }[];

  const payableTonnage = delivery[0].payable_tonnage;

  await sql`
    INSERT INTO payouts_deductions (ticket_no, farmer_id, payable_tonnage, price_per_tonne_kes, transport_kes, harvesting_kes, input_loan_kes, cess_levy_kes)
    VALUES (${ticketNo}, ${farmerId}, ${payableTonnage}, ${pricePerTonne}, ${transportKes}, ${harvestingKes}, ${inputLoanKes}, ${cessLevyKes})
  `;

  await sql`
    UPDATE harvest_bookings
    SET status = 'Weighed & Delivered', factory_truck_plate = ${truckPlate}
    WHERE booking_id = ${bookingId}
  `;

  revalidatePath('/admin');
  revalidatePath('/portal');
  revalidatePath('/');
}
