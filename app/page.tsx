import { Suspense } from 'react';
import { getAppData } from './actions';
import FarmerPortal from './FarmerPortal';

async function Portal({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const { phone } = await searchParams;
  const data = await getAppData(phone);
  return <FarmerPortal initialData={data} />;
}

export default function Home({
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
