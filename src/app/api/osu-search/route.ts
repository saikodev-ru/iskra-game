import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  const m = searchParams.get('m') || '3'; // default mania
  const limit = searchParams.get('limit') || '50';
  const offset = searchParams.get('offset') || '0';

  if (!q.trim()) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  try {
    const url = `https://api.nerinyan.moe/search?q=${encodeURIComponent(q)}&m=${m}&limit=${limit}&offset=${offset}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 60 }, // cache for 60s
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `osu! API returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('[osu-search] Error:', err.message);
    return NextResponse.json({ error: 'Failed to search osu! API' }, { status: 500 });
  }
}
