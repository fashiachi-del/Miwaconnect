import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getAppData } from './actions';
import type { Factory } from './types';

export const metadata: Metadata = {
  title: 'MiwaConnect Kenya — Know what your cane is worth',
  description:
    'Compare cane gate prices from Kenyan sugar factories, estimate transport, book a factory lorry and see every weighbridge deduction before you are paid.',
};

const kes = (value: number) => value.toLocaleString('en-KE');

function Arrow() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M4 10h11M11 5l5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4 shrink-0">
      <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Sprout() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
      <path d="M12 21v-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 14C12 10.5 9.5 8 6 8c0 3.5 2.5 6 6 6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 13c0-3 2.2-5.5 5.5-5.5 0 3-2.2 5.5-5.5 5.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
      <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="7" cy="18" r="1.6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.5" cy="18" r="1.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
      <path d="M12 4v16M6 20h12M4 8h16M7 8l-3 6h6L7 8ZM17 8l-3 6h6l-3-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="h-5 w-5">
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v12H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4 8h16M15 13h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function speedTone(rating: string) {
  if (rating.startsWith('Fast')) return 'bg-emerald-100 text-emerald-800';
  if (rating.startsWith('Moderate')) return 'bg-amber-100 text-amber-900';
  return 'bg-rose-100 text-rose-800';
}

function queueTone(queue: string) {
  if (queue === 'Low') return 'text-emerald-700';
  if (queue === 'Medium') return 'text-amber-700';
  return 'text-rose-700';
}

function LivePriceCard({ factory }: { factory: Factory }) {
  const price = Number(factory.price_per_tonne_kes);
  const transport = Number(factory.transport_rate_0_15km);
  const net = price - transport;

  return (
    <article className="group rounded-2xl border border-emerald-950/8 bg-white p-5 shadow-[0_1px_0_rgba(6,54,40,0.04)] transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-950/5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold leading-tight text-emerald-950">{factory.factory_name}</h3>
          <p className="mt-0.5 text-xs text-emerald-950/50">{factory.location}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${speedTone(factory.payment_speed_rating)}`}>
          {factory.payment_speed_rating}
        </span>
      </div>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-emerald-950">KES {kes(price)}</span>
        <span className="text-xs text-emerald-950/50">/ tonne</span>
      </div>

      <dl className="mt-4 space-y-1.5 border-t border-dashed border-emerald-950/10 pt-3 text-xs">
        <div className="flex justify-between gap-3 text-emerald-950/60">
          <dt>Factory transport (0–15 km)</dt>
          <dd className="tabular-nums">− KES {kes(transport)}</dd>
        </div>
        <div className="flex justify-between gap-3 font-medium text-emerald-800">
          <dt>Est. net per tonne</dt>
          <dd className="tabular-nums">KES {kes(net)}</dd>
        </div>
      </dl>

      <p className="mt-4 flex items-center justify-between text-xs text-emerald-950/45">
        <span>
          Queue: <strong className={`font-medium ${queueTone(factory.queue_status)}`}>{factory.queue_status}</strong>
        </span>
        <span className="opacity-0 transition group-hover:opacity-100">
          <Arrow />
        </span>
      </p>
    </article>
  );
}

async function LivePrices() {
  let factories: Factory[] = [];

  try {
    const data = await getAppData();
    factories = data.factories;
  } catch (error) {
    console.error('Landing page could not load factory prices:', error);
  }

  if (factories.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-950/15 bg-white/60 p-8 text-center">
        <p className="text-sm font-medium text-emerald-950">Gate prices are being updated.</p>
        <p className="mt-1 text-sm text-emerald-950/60">
          Open the farmer portal to see the latest rates, or try again in a moment.
        </p>
        <Link
          href="/portal"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900"
        >
          Open the portal <Arrow />
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {factories.slice(0, 9).map((factory) => (
        <LivePriceCard key={factory.factory_id} factory={factory} />
      ))}
    </div>
  );
}

function PriceSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-52 animate-pulse rounded-2xl border border-emerald-950/5 bg-white/70" />
      ))}
    </div>
  );
}

const STEPS = [
  {
    title: 'Register with your M-Pesa number',
    body: 'No password, no app. You get a farmer ID such as F-0001 the moment you sign up.',
    icon: <Sprout />,
  },
  {
    title: 'Compare the real net price',
    body: 'Pick your distance band and see gate price minus factory transport, side by side.',
    icon: <ScaleIcon />,
  },
  {
    title: 'Book a factory lorry',
    body: 'Send a harvest booking to the mill, with your tonnage, date and cutting crew needs.',
    icon: <TruckIcon />,
  },
  {
    title: 'Track the ticket to the payout',
    body: 'When the weighbridge ticket is entered, every deduction and your net cash appear.',
    icon: <WalletIcon />,
  },
];

const FAQS = [
  {
    q: 'Is MiwaConnect an official Kenya Sugar Board service?',
    a: 'No. MiwaConnect is an independent tool for farmers and factory clerks. Gate prices are entered by clerks and can differ from KSB notices or the price on your contract. Always confirm the final rate with your factory before delivery.',
  },
  {
    q: 'Do I need a smartphone or an app?',
    a: 'You only need a browser. The portal is built to work on a basic phone, and nothing is installed. Your M-Pesa phone number is your login.',
  },
  {
    q: 'How is my net payout calculated?',
    a: 'Payable weight is gross weight minus tare, reduced by the trash percentage. That weight is multiplied by the factory price, then transport, harvesting, input advances and cess are deducted. The database calculates the figures when a clerk saves the ticket, so the same numbers appear on your screen.',
  },
  {
    q: 'Why does each factory show a different price?',
    a: 'Mills set their own gate prices, payment timelines and queue positions. Transport also changes with distance, which is why the portal compares net value for 0–15 km, 16–30 km and 31+ km.',
  },
  {
    q: 'What happens if the price changes after I book?',
    a: 'Your payout uses the price recorded on the weighbridge ticket on the day of delivery, not the price shown when you booked. The booking is your place in the queue; the ticket is the money.',
  },
];

export default function Home() {
  // Illustrative settlement figures, computed rather than typed, so the maths
  // on the hero card always adds up.
  const grossTonnes = 24;
  const tareTonnes = 2.4;
  const trashPercent = 5;
  const pricePerTonne = 6100;
  const payable = Math.round((grossTonnes - tareTonnes) * (1 - trashPercent / 100) * 1000) / 1000;
  const grossValue = Math.round(payable * pricePerTonne);
  const transport = Math.round(payable * 1050);
  const cutters = 18000;
  const inputLoan = 7500;
  const cess = Math.round(grossValue * 0.01);
  const netPayout = grossValue - transport - cutters - inputLoan - cess;

  return (
    <div className="min-h-screen bg-[#f7f4ec] text-emerald-950 selection:bg-amber-200 selection:text-emerald-950">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-emerald-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-emerald-950/5 bg-[#f7f4ec]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-800 text-amber-200">
              <Sprout />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold tracking-tight">MiwaConnect</span>
              <span className="block text-[11px] text-emerald-950/50">Kenya</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-emerald-950/70 md:flex">
            <a href="#prices" className="hover:text-emerald-900">Gate prices</a>
            <a href="#how" className="hover:text-emerald-900">How it works</a>
            <a href="#deductions" className="hover:text-emerald-900">Payouts</a>
            <a href="#faq" className="hover:text-emerald-900">Questions</a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="hidden rounded-full px-3 py-2 text-sm font-medium text-emerald-950/70 hover:text-emerald-900 sm:inline-flex"
            >
              Clerk login
            </Link>
            <Link
              href="/portal"
              className="inline-flex items-center gap-2 rounded-full bg-emerald-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-900"
            >
              Farmer portal <Arrow />
            </Link>
          </div>
        </div>
      </header>

      <main id="main">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-40 right-[-10%] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(251,191,36,0.28),transparent_65%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-40 top-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle_at_center,rgba(6,95,70,0.14),transparent_65%)]"
          />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24 lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-emerald-900/10 bg-white px-3 py-1 text-xs font-medium text-emerald-900">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Built for Kenyan cane growers
              </p>

              <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.6rem]">
                Know what your cane is <span className="text-emerald-700">worth</span> before the lorry leaves.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-emerald-950/65 sm:text-lg">
                Compare gate prices from ten Kenyan sugar factories, see what transport really costs,
                book a factory lorry, and follow every weighbridge deduction down to the shilling.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/portal"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-800 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/15 transition hover:bg-emerald-900"
                >
                  Check gate prices <Arrow />
                </Link>
                <a
                  href="#deductions"
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-900/15 bg-white/70 px-6 py-3 text-sm font-semibold text-emerald-900 transition hover:bg-white"
                >
                  See how payouts work
                </a>
              </div>

              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-emerald-950/55">
                <li className="flex items-center gap-1.5"><Check /> Free to use</li>
                <li className="flex items-center gap-1.5"><Check /> No app to install</li>
                <li className="flex items-center gap-1.5"><Check /> Works on any phone</li>
              </ul>

              <p className="mt-8 max-w-lg border-t border-emerald-950/10 pt-5 text-xs leading-relaxed text-emerald-950/45">
                Covering Mumias, Nzoia, Chemelil, Muhoroni, Sony, Kibos, Butali, Sukari,
                West Kenya and Transmara.
              </p>
            </div>

            {/* SAMPLE SETTLEMENT CARD */}
            <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end">
              <div className="absolute -inset-3 -z-10 rotate-2 rounded-[2rem] bg-emerald-800/10" aria-hidden="true" />
              <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white p-6 shadow-2xl shadow-emerald-950/10">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-950/40">
                      Sample weighbridge statement
                    </p>
                    <p className="mt-1 text-sm font-semibold">Ticket WB-2481 · Nzoia Sugar</p>
                  </div>
                  <span className="rounded-full bg-stone-100 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-stone-500">
                    Illustrative
                  </span>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl bg-stone-50 p-3 text-xs">
                  <div>
                    <p className="text-emerald-950/45">Gross weight</p>
                    <p className="mt-0.5 font-semibold tabular-nums">{grossTonnes.toFixed(1)} t</p>
                  </div>
                  <div>
                    <p className="text-emerald-950/45">Tare</p>
                    <p className="mt-0.5 font-semibold tabular-nums">{tareTonnes.toFixed(1)} t</p>
                  </div>
                  <div>
                    <p className="text-emerald-950/45">Trash deducted</p>
                    <p className="mt-0.5 font-semibold tabular-nums">{trashPercent}%</p>
                  </div>
                  <div>
                    <p className="text-emerald-950/45">Payable weight</p>
                    <p className="mt-0.5 font-semibold tabular-nums text-emerald-800">{payable.toFixed(3)} t</p>
                  </div>
                </div>

                <dl className="mt-5 space-y-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-emerald-950/60">Gross value ({kes(pricePerTonne)}/t)</dt>
                    <dd className="font-medium tabular-nums">KES {kes(grossValue)}</dd>
                  </div>
                  <div className="flex items-center justify-between text-rose-700">
                    <dt>Factory transport</dt>
                    <dd className="tabular-nums">− KES {kes(transport)}</dd>
                  </div>
                  <div className="flex items-center justify-between text-rose-700">
                    <dt>Cutters</dt>
                    <dd className="tabular-nums">− KES {kes(cutters)}</dd>
                  </div>
                  <div className="flex items-center justify-between text-rose-700">
                    <dt>Input advance</dt>
                    <dd className="tabular-nums">− KES {kes(inputLoan)}</dd>
                  </div>
                  <div className="flex items-center justify-between text-rose-700">
                    <dt>Cess levy</dt>
                    <dd className="tabular-nums">− KES {kes(cess)}</dd>
                  </div>
                </dl>

                <div className="mt-5 rounded-xl bg-emerald-900 px-4 py-3.5 text-emerald-50">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-emerald-200/80">
                      Net cash to farmer
                    </span>
                    <span className="text-xl font-semibold tabular-nums">KES {kes(netPayout)}</span>
                  </div>
                </div>

                <p className="mt-4 text-[11px] leading-relaxed text-emerald-950/40">
                  Illustrative figures only. Your statement uses the price and deductions recorded
                  against your own ticket.
                </p>
              </div>

              <div className="absolute -bottom-5 -left-4 hidden items-center gap-2 rounded-full border border-emerald-950/10 bg-white px-4 py-2 text-xs font-medium shadow-lg sm:flex">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                  <Check />
                </span>
                Every deduction itemised
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="border-y border-emerald-950/10 bg-white/50">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-6 px-4 py-8 sm:px-6 lg:grid-cols-4">
            {[
              { value: '10', label: 'sugar factories compared' },
              { value: '3', label: 'transport distance bands' },
              { value: '100%', label: 'of deductions shown' },
              { value: '1', label: 'M-Pesa number to sign in' },
            ].map((stat) => (
              <div key={stat.label} className="px-2 text-center lg:border-l lg:border-emerald-950/10 lg:first:border-l-0">
                <p className="text-2xl font-semibold tracking-tight text-emerald-900 sm:text-3xl">{stat.value}</p>
                <p className="mt-1 text-xs text-emerald-950/55">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* LIVE PRICES */}
        <section id="prices" className="scroll-mt-24">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Today at the gate</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Cane prices, side by side.</h2>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-emerald-950/60">
                  Gate price per tonne and the estimated net after factory transport for a 0–15 km
                  farm. Rates are maintained by factory clerks and update as the season moves.
                </p>
              </div>
              <Link
                href="/portal"
                className="inline-flex items-center gap-2 rounded-full border border-emerald-900/15 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-white/70"
              >
                Compare all bands <Arrow />
              </Link>
            </div>

            <div className="mt-8">
              <Suspense fallback={<PriceSkeleton />}>
                <LivePrices />
              </Suspense>
            </div>

            <p className="mt-6 text-xs text-emerald-950/40">
              Net figures subtract factory transport only. Cutting, input advances and cess are shown
              on your weighbridge statement.
            </p>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="scroll-mt-24 border-y border-emerald-950/10 bg-white/50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">From shamba to payout</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Four steps, no paperwork shuffle.</h2>
              <p className="mt-3 text-sm leading-relaxed text-emerald-950/60">
                The portal replaces the phone calls and the notebook: one place for the price you were
                offered, the lorry you booked, and the money the factory says you earned.
              </p>
            </div>

            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="rounded-2xl border border-emerald-950/8 bg-[#f7f4ec] p-5">
                  <div className="flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-800/10 text-emerald-800">
                      {step.icon}
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-emerald-950/25">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 text-sm font-semibold leading-snug">{step.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-emerald-950/55">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* DEDUCTIONS */}
        <section id="deductions" className="scroll-mt-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">No mystery arithmetic</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Every shilling has a name and a line.
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-emerald-950/65">
                Factory deductions used to arrive as a single number at the end of the season. Here
                they arrive as a statement: weights, transport, cutters, input advances and cess,
                each one visible before you accept the payment.
              </p>

              <ul className="mt-7 space-y-3 text-sm">
                {[
                  'Payable weight calculated from gross, tare and trash — not retyped by hand.',
                  'Transport compared across 0–15 km, 16–30 km and 31+ km before booking.',
                  'The same stored figures power the clerk view and the farmer statement.',
                  'A failed ticket entry cannot quietly invent a different payout.',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-white">
                      <Check />
                    </span>
                    <span className="text-emerald-950/70">{item}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/portal"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-900"
              >
                Open your statement <Arrow />
              </Link>
            </div>

            <div className="rounded-[1.75rem] border border-emerald-950/10 bg-white p-6 shadow-xl shadow-emerald-950/5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-950/40">
                  How the net is built
                </p>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
                  Stored in the database
                </span>
              </div>

              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2.5">
                  <span className="text-emerald-950/60">Payable weight × price</span>
                  <span className="font-medium tabular-nums">Gross value</span>
                </div>
                {['Factory transport', 'Harvesting / cutters', 'Input advance', 'Cess / levy'].map((line) => (
                  <div key={line} className="flex items-center justify-between px-3">
                    <span className="text-emerald-950/55">{line}</span>
                    <span className="font-medium tabular-nums text-rose-700">deducted</span>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-xl bg-emerald-900 px-3 py-3 text-emerald-50">
                  <span className="text-xs font-medium uppercase tracking-wider">Net payout</span>
                  <span className="font-semibold tabular-nums">what reaches you</span>
                </div>
              </div>

              <p className="mt-5 border-t border-emerald-950/10 pt-4 text-xs leading-relaxed text-emerald-950/45">
                Gross value and net payout are generated columns. They are recalculated by Postgres
                whenever a ticket is saved, so the statement cannot drift from the inputs.
              </p>
            </div>
          </div>
        </section>

        {/* FOR CLERKS */}
        <section className="px-4 pb-16 sm:px-6 sm:pb-20">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-emerald-900 text-emerald-50">
            <div className="grid gap-8 p-7 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:p-12">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">For clerks and factory offices</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">One dashboard for prices, queues and tickets.</h2>
                <p className="mt-4 max-w-xl text-sm leading-relaxed text-emerald-100/70">
                  Update a mill gate price, change its queue status, then enter the weighbridge ticket
                  once. The farmer sees the result immediately, with the arithmetic already done.
                </p>

                <div className="mt-7 flex flex-wrap gap-3">
                  <Link
                    href="/admin"
                    className="inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-amber-200"
                  >
                    Clerk dashboard <Arrow />
                  </Link>
                  <a
                    href="#faq"
                    className="inline-flex items-center gap-2 rounded-full border border-emerald-100/25 px-5 py-2.5 text-sm font-semibold text-emerald-50 hover:bg-emerald-800"
                  >
                    Read the questions
                  </a>
                </div>
              </div>

              <ul className="grid gap-3 self-center">
                {[
                  'Prices and payment-speed ratings in one list',
                  'Weighbridge entry with generated deductions',
                  'Bookings and truck plates visible to both sides',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 rounded-xl bg-emerald-950/30 p-3.5 text-sm text-emerald-50/85">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-300 text-emerald-950">
                      <Check />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24 border-t border-emerald-950/10">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Straight answers</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Questions farmers ask first.</h2>

            <div className="mt-8 space-y-3">
              {FAQS.map((faq) => (
                <details key={faq.q} className="group rounded-2xl border border-emerald-950/10 bg-white p-5 open:shadow-sm">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-emerald-950/15 text-emerald-800 transition group-open:rotate-45">
                      <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-3.5 w-3.5">
                        <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </span>
                  </summary>
                  <p className="mt-3 pr-8 text-sm leading-relaxed text-emerald-950/60">{faq.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-[2rem] border border-emerald-950/10 bg-white p-8 text-center shadow-sm sm:p-12">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Sprout />
            </div>
            <h2 className="mx-auto mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Better prices start with better information.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-emerald-950/60">
              Sign in with your M-Pesa number, compare the mills, and keep the paperwork where you
              can see it.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/portal"
                className="inline-flex items-center gap-2 rounded-full bg-emerald-800 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-900"
              >
                Enter the farmer portal <Arrow />
              </Link>
              <Link
                href="/admin"
                className="inline-flex items-center gap-2 rounded-full border border-emerald-900/15 px-6 py-3 text-sm font-semibold text-emerald-900 hover:bg-stone-50"
              >
                I am a clerk
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-emerald-950/10 bg-white/40">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-800 text-amber-200">
                <Sprout />
              </span>
              <span className="text-sm font-semibold">MiwaConnect Kenya</span>
            </div>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-emerald-950/50">
              A clearer view of cane prices, factory bookings and weighbridge payouts for Kenyan
              growers and the clerks who serve them.
            </p>
          </div>

          <div className="text-xs">
            <p className="font-semibold uppercase tracking-wider text-emerald-950/40">Explore</p>
            <ul className="mt-3 space-y-2 text-emerald-950/60">
              <li><a href="#prices" className="hover:text-emerald-900">Gate prices</a></li>
              <li><a href="#how" className="hover:text-emerald-900">How it works</a></li>
              <li><a href="#deductions" className="hover:text-emerald-900">Payout calculations</a></li>
              <li><Link href="/portal" className="hover:text-emerald-900">Farmer portal</Link></li>
              <li><Link href="/admin" className="hover:text-emerald-900">Clerk dashboard</Link></li>
            </ul>
          </div>

          <div className="text-xs leading-relaxed text-emerald-950/50">
            <p className="font-semibold uppercase tracking-wider text-emerald-950/40">A note on prices</p>
            <p className="mt-3">
              Prices shown here are indicative and maintained by factory clerks. They can differ from
              Kenya Sugar Board notices or your contract. Confirm the final rate with your factory
              before delivery.
            </p>
            <p className="mt-4 text-emerald-950/35">© MiwaConnect Kenya</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
