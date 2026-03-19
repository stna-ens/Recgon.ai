import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAnalyticsConfig, setAnalyticsConfig } from '@/lib/analyticsStorage';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = getAnalyticsConfig(session.user.id);
  return NextResponse.json({ propertyId: config?.propertyId ?? null });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { propertyId } = await req.json();
  if (!propertyId || typeof propertyId !== 'string' || !/^\d+$/.test(propertyId.trim())) {
    return NextResponse.json({ error: 'Invalid property ID — must be numeric (e.g. 123456789)' }, { status: 400 });
  }

  setAnalyticsConfig(session.user.id, propertyId.trim());
  return NextResponse.json({ ok: true });
}
