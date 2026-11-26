'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { registerOrLoginFarmer, createBooking } from './actions';
import type { AppData, Factory } from './types';

const DISTANCE_BANDS = ['0-15 km', '16-30 km', '31+ km'] as const;
type DistanceBand = (typeof DISTANCE_BANDS)[number];

export default function FarmerPortal({ initialData }: { initialData: AppData }) {
  const router = useRouter();
  const { factories, farmer, bookings, payouts } = initialData;
  const [distanceBand, setDistanceBand] = useState<DistanceBand>('0-15 km');
  const [selectedFactory, setSelectedFactory] = useState<Factory | null>(null);
  const [activeTab, setActiveTab] = useState<'prices' | 'bookings' | 'payouts'>('prices');
  const [authError, setAuthError] = useState('');

  const getTransportRate = (f: Factory) => {
    if (distanceBand === '0-15 km') return Number(f.transport_rate_0_15km || 750);
    if (distanceBand === '16-30 km') return Number(f.transport_rate_16_30km || 1050);
    return Number(f.transport_rate_31_plus_km || 1350);
  };

  async function handleAuth(formData: FormData) {
    const res = await registerOrLoginFarmer(formData);
    if ('farmer' in res) {
      setAuthError('');
      router.push(`/?phone=${encodeURIComponent(res.farmer.phone_number)}`);
      return;
    }
    setAuthError(res.error);
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 pb-20">
      {/* Header */}
      <header className="bg-emerald-800 text-white p-4 shadow">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">MiwaConnect Kenya</h1>
            <p className="text-xs text-emerald-200">
              Compare Cane Prices, Book Factory Trucks &amp; Track Deductions
            </p>
          </div>
          {farmer ? (
            <div className="text-right text-xs">
              <span className="bg-emerald-950 px-2 py-1 rounded font-mono">{farmer.farmer_id}</span>
              <div className="mt-1 font-medium">{farmer.full_name}</div>
            </div>
          ) : (
            <Link href="/admin" className="text-xs text-emerald-200 underline">
              Clerk / Admin
            </Link>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        {/* Farmer Quick Login / Auto-Register */}
        {!farmer ? (
          <section className="bg-white p-5 rounded-xl shadow-sm border border-stone-200">
            <h2 className="font-bold text-lg mb-1">Farmer Account (Auto-Assigns Your Farmer ID)</h2>
            <p className="text-sm text-stone-600 mb-4">
              Enter your M-Pesa phone number to log in, or fill in your farm details to create a free account.
            </p>
            <form action={handleAuth} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input name="phone_number" required placeholder="M-Pesa Phone (+2547...)" className="border p-2.5 rounded-lg" />
              <input name="full_name" placeholder="Full Name (Required if new)" className="border p-2.5 rounded-lg" />
              <input name="county_ward" placeholder="County / Ward (e.g., Bungoma - Kanduyi)" className="border p-2.5 rounded-lg" />
              <input name="plot_size_acres" type="number" step="0.1" placeholder="Farm Size (Acres)" className="border p-2.5 rounded-lg" />
              <select name="contract_status" className="border p-2.5 rounded-lg sm:col-span-2">
                <option value="Private / Independent">Private / Independent Cane</option>
                <option value="Contracted">Contracted Outgrower</option>
              </select>
              {authError && (
                <p className="sm:col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                  {authError}
                </p>
              )}
              <button type="submit" className="sm:col-span-2 bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-2.5 rounded-lg">
                Continue &amp; Get Farmer ID
              </button>
            </form>
          </section>
        ) : (
          <div className="flex gap-2 bg-white p-1.5 rounded-xl border border-stone-200">
            {(['prices', 'bookings', 'payouts'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold capitalize ${
                  activeTab === tab ? 'bg-emerald-700 text-white' : 'text-stone-600'
                }`}
              >
                {tab === 'prices'
                  ? 'Factory Prices'
                  : tab === 'bookings'
                    ? `Bookings (${bookings.length})`
                    : `Deductions (${payouts.length})`}
              </button>
            ))}
          </div>
        )}

        {/* TAB 1: FACTORY PRICE & TRANSPORT DEDUCTION COMPARISON */}
        {activeTab === 'prices' && (
          <section className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-stone-200 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">Distance from Farm to Factory:</span>
              <div className="flex gap-1.5">
                {DISTANCE_BANDS.map((band) => (
                  <button
                    key={band}
                    onClick={() => setDistanceBand(band)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      distanceBand === band ? 'bg-amber-600 text-white' : 'bg-stone-100 text-stone-700'
                    }`}
                  >
                    {band}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              {factories.map((f) => {
                const gross = Number(f.price_per_tonne_kes);
                const transport = getTransportRate(f);
                const netPerTonne = gross - transport;
                return (
                  <div
                    key={f.factory_id}
                    className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm flex flex-col sm:flex-row justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg">{f.factory_name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">
                          {f.payment_speed_rating}
                        </span>
                      </div>
                      <p className="text-xs text-stone-500">
                        {f.location} • Queue: <strong>{f.queue_status}</strong>
                      </p>
                      <div className="mt-2 text-sm space-y-0.5">
                        <div>
                          Gate Price: <strong>KES {gross.toLocaleString()}/t</strong>
                        </div>
                        <div className="text-red-700">
                          Est. Factory Transport ({distanceBand}): -KES {transport.toLocaleString()}/t
                        </div>
                        <div className="text-emerald-800 font-bold text-base">
                          Est. Net Before Cutters: KES {netPerTonne.toLocaleString()}/tonne
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <button
                        onClick={() => {
                          if (!farmer) {
                            alert('Enter your phone number above first to get your Farmer ID.');
                            return;
                          }
                          setSelectedFactory(f);
                        }}
                        className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2.5 rounded-lg text-sm font-semibold"
                      >
                        Request Factory Truck
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* BOOKING MODAL */}
        {selectedFactory && farmer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4">
              <h3 className="font-bold text-lg">Book Harvest — {selectedFactory.factory_name}</h3>
              <form
                action={async (fd) => {
                  await createBooking(fd);
                  setSelectedFactory(null);
                  setActiveTab('bookings');
                  router.refresh();
                }}
                className="space-y-3"
              >
                <input type="hidden" name="farmer_id" value={farmer.farmer_id} />
                <input type="hidden" name="factory_id" value={selectedFactory.factory_id} />
                <input type="hidden" name="distance_band" value={distanceBand} />
                <div>
                  <label className="text-xs font-semibold">Estimated Tonnage (Tonnes)</label>
                  <input name="est_tonnage" type="number" step="0.5" required placeholder="e.g., 25" className="w-full border p-2.5 rounded-lg mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold">Preferred Harvest Date</label>
                  <input name="harvest_date" type="date" required className="w-full border p-2.5 rounded-lg mt-1" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="need_cutters" /> Need local cane-cutting crew arranged
                </label>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setSelectedFactory(null)} className="flex-1 border py-2 rounded-lg">
                    Cancel
                  </button>
                  <button type="submit" className="flex-1 bg-emerald-700 text-white font-semibold py-2 rounded-lg">
                    Confirm Booking
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB 2: BOOKINGS TRACKER */}
        {activeTab === 'bookings' && farmer && (
          <section className="space-y-3">
            {bookings.length === 0 && <p className="text-sm text-stone-500">No harvest bookings yet.</p>}
            {bookings.map((b) => (
              <div
                key={b.booking_id}
                className="bg-white p-4 rounded-xl border border-stone-200 flex justify-between items-center gap-3"
              >
                <div>
                  <div className="font-mono text-xs text-stone-500">
                    {b.booking_id} • {new Date(b.harvest_date).toLocaleDateString()}
                  </div>
                  <div className="font-semibold">
                    {b.factory_name} ({b.est_tonnage} Tonnes)
                  </div>
                  <div className="text-xs text-stone-500">
                    Distance: {b.distance_band} {b.factory_truck_plate ? `• Truck: ${b.factory_truck_plate}` : ''}
                  </div>
                </div>
                <span className="text-xs font-semibold bg-amber-100 text-amber-900 px-2 py-1 rounded-full whitespace-nowrap">
                  {b.status}
                </span>
              </div>
            ))}
          </section>
        )}

        {/* TAB 3: WEIGHBRIDGE & TRANSPARENT DEDUCTIONS */}
        {activeTab === 'payouts' && farmer && (
          <section className="space-y-3">
            {payouts.length === 0 && <p className="text-sm text-stone-500">No weighbridge tickets recorded yet.</p>}
            {payouts.map((p) => (
              <div key={p.ticket_no} className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-mono text-xs text-stone-500">Ticket #{p.ticket_no}</div>
                    <div className="font-semibold">{p.factory_name}</div>
                  </div>
                  <div className="text-xs text-stone-500">
                    {new Date(p.delivery_date).toLocaleDateString()}
                  </div>
                </div>

                <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex justify-between items-center">
                  <span className="text-xs font-semibold uppercase text-emerald-900">Net Cash Payable</span>
                  <span className="font-bold text-lg text-emerald-900">
                    KES {Number(p.net_payout_kes).toLocaleString()}
                  </span>
                </div>

                <div className="mt-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>
                      Payable Weight
                      {Number(p.trash_percent) > 0 ? ` (${Number(p.trash_percent)}% trash deducted)` : ''}
                    </span>
                    <strong>{Number(p.payable_tonnage).toFixed(3)} T</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Gross Value</span>
                    <strong>KES {Number(p.gross_kes).toLocaleString()}</strong>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span>Factory Transport</span>
                    <span>-KES {Number(p.transport_kes).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span>Harvesting / Cutters</span>
                    <span>-KES {Number(p.harvesting_kes).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span>Input Advance</span>
                    <span>-KES {Number(p.input_loan_kes).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span>Cess / Levy</span>
                    <span>-KES {Number(p.cess_levy_kes).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
