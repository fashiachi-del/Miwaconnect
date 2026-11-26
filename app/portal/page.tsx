import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getAppData } from '../actions';
import FarmerPortal from '../FarmerPortal';

export const metadata: Metadata = {
  title: 'Farmer Portal — MiwaConnect Kenya',
  description:
    'Compare cane gate prices, book factory trucks and track weighbridge deductions.',
};

async function Portal({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const { phone } = await searchParams;
  const data = await getAppData(phone);
  return <FarmerPortal initialData={data} />;
}

export default function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-stone-50 flex items-center justify-center">
          <p className="text-sm text-stone-500">Loading MiwaConnect…</p>
        </div>
      }
    >
      <Portal searchParams={searchParams} />
    </Suspense>
  );
}
