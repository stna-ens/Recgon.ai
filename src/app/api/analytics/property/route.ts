import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAnalyticsConfig, setAnalyticsConfig } from '@/lib/analyticsStorage';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const config = getAnalyticsConfig(session.user.id);
  return NextResponse.json({
    propertyId: config?.propertyId ?? null,
    hasCredentials: !!config?.serviceAccountJson,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { propertyId, serviceAccountJson } = await req.json();

  if (!propertyId || typeof propertyId !== 'string' || !/^\d+$/.test(propertyId.trim())) {
    return NextResponse.json({ error: 'Invalid property ID — must be numeric (e.g. 123456789)' }, { status: 400 });
  }

  if (!serviceAccountJson || typeof serviceAccountJson !== 'string') {
    return NextResponse.json({ error: 'Service account JSON is required' }, { status: 400 });
  }

  // Validate it's parseable JSON with required fields
  try {
    const parsed = JSON.parse(serviceAccountJson);
    if (!parsed.client_email || !parsed.private_key) {
      return NextResponse.json({ error: 'Invalid service account JSON — missing client_email or private_key' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON — paste the full contents of your service account key file' }, { status: 400 });
  }

  setAnalyticsConfig(session.user.id, propertyId.trim(), serviceAccountJson);
  return NextResponse.json({ ok: true });
}
