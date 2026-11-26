import { Suspense } from 'react';
import Link from 'next/link';
import { getAdminData, updateFactoryPrice, logWeighbridgeAndPayout } from '../actions';

export default function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ pin?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-stone-100 flex items-center justify-center">
          <p className="text-sm text-stone-500">Loading clerk dashboard…</p>
        </div>
      }
    >
      <AdminDashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ pin?: string }>;
}) {
  const resolved = await searchParams;
  if (resolved.pin !== (process.env.ADMIN_PIN || '2026')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-100 p-4">
        <form className="bg-white p-6 rounded-xl shadow max-w-sm w-full space-y-3">
          <h1 className="font-bold text-lg">Clerk / Admin Access</h1>
          <input name="pin" type="password" placeholder="Enter Admin PIN" className="w-full border p-2.5 rounded-lg" />
          <button type="submit" className="w-full bg-emerald-800 text-white py-2.5 rounded-lg font-semibold">
            Unlock Dashboard
          </button>
        </form>
      </div>
    );
  }

  const { factories, bookings } = await getAdminData();

  return (
    <div className="min-h-screen bg-stone-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-emerald-900">
            MiwaConnect — Clerk &amp; Price Control Panel
          </h1>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="text-emerald-700 underline">
              ← Home
            </Link>
            <Link href="/portal" className="text-emerald-700 underline">
              Farmer View
            </Link>
          </div>
        </header>

        {/* SECTION 1: UPDATE FACTORY PRICES & QUEUES */}
        <section className="bg-white p-5 rounded-xl shadow-sm space-y-4">
          <h2 className="font-bold text-lg">1. Update Factory Gate Prices &amp; Payment Speed</h2>
          <div className="grid gap-3">
            {factories.map((f) => (
              <form
                key={f.factory_id}
                action={updateFactoryPrice}
                className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center border-b pb-3"
              >
                <input type="hidden" name="factory_id" value={f.factory_id} />
                <div className="font-semibold">{f.factory_name}</div>
                <input
                  name="price_per_tonne_kes"
                  type="number"
                  defaultValue={f.price_per_tonne_kes}
                  className="border p-2 rounded"
                />
                <input
                  name="avg_payment_days"
                  type="number"
                  defaultValue={f.avg_payment_days}
                  className="border p-2 rounded"
                />
                <select name="queue_status" defaultValue={f.queue_status} className="border p-2 rounded">
                  <option value="Low">Low Queue</option>
                  <option value="Medium">Medium Queue</option>
                  <option value="High">High Queue</option>
                </select>
                <button type="submit" className="bg-emerald-700 text-white py-2 px-3 rounded font-semibold text-sm">
                  Save
                </button>
              </form>
            ))}
          </div>
        </section>

        {/* SECTION 2: ENTER WEIGHBRIDGE TICKET & DEDUCTIONS */}
        <section className="bg-white p-5 rounded-xl shadow-sm space-y-4">
          <h2 className="font-bold text-lg">2. Log Weighbridge Ticket &amp; Factory Deductions</h2>
          <form action={logWeighbridgeAndPayout} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select name="booking_id" required className="border p-2.5 rounded-lg sm:col-span-3">
              <option value="">Select Farmer Booking...</option>
              {bookings.map((b) => (
                <option key={b.booking_id} value={b.booking_id}>
                  {b.booking_id} — {b.full_name} ({b.farmer_id}) → {b.factory_name} ({b.est_tonnage}T)
                </option>
              ))}
            </select>
            <input name="farmer_id" required placeholder="Farmer ID (e.g. F-0001)" className="border p-2.5 rounded-lg" />
            <input name="factory_id" required placeholder="Factory ID (e.g. FAC01)" className="border p-2.5 rounded-lg" />
            <input name="ticket_no" required placeholder="Weighbridge Ticket No." className="border p-2.5 rounded-lg" />
            <input name="factory_truck_plate" placeholder="Factory Lorry Plate (e.g. KDG 123A)" className="border p-2.5 rounded-lg" />
            <input name="gross_tonnes" type="number" step="0.001" required placeholder="Gross Weight (Tonnes)" className="border p-2.5 rounded-lg" />
            <input name="tare_tonnes" type="number" step="0.001" required placeholder="Tare Weight (Tonnes)" className="border p-2.5 rounded-lg" />
            <input name="trash_percent" type="number" step="0.1" defaultValue="5" placeholder="Trash % (e.g. 5)" className="border p-2.5 rounded-lg" />
            <input name="price_per_tonne_kes" type="number" required placeholder="Factory Price/Tonne (KES)" className="border p-2.5 rounded-lg" />
            <input name="transport_kes" type="number" required placeholder="Transport Deducted (KES)" className="border p-2.5 rounded-lg" />
            <input name="harvesting_kes" type="number" defaultValue="0" placeholder="Harvesting Deducted (KES)" className="border p-2.5 rounded-lg" />
            <input name="input_loan_kes" type="number" defaultValue="0" placeholder="Input Loan Deducted (KES)" className="border p-2.5 rounded-lg" />
            <input name="cess_levy_kes" type="number" defaultValue="0" placeholder="Cess / Levy (KES)" className="border p-2.5 rounded-lg" />
            <button type="submit" className="sm:col-span-3 bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-lg">
              Record Weighbridge Ticket &amp; Publish Farmer Statement
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
