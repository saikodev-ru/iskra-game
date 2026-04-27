import { NextRequest, NextResponse } from 'next/server';

/**
 * Download beatmap sets via catboy.best mirror API.
 * Streams the .osz file (with video) directly to the client.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ setId: string }> }
) {
  let setId: string;
  try {
    const resolvedParams = await context.params;
    setId = resolvedParams.setId;
  } catch {
    return NextResponse.json({ error: 'Invalid route parameters' }, { status: 400 });
  }

  if (!setId || !/^\d+$/.test(setId)) {
    return NextResponse.json({ error: 'Invalid beatmap set ID' }, { status: 400 });
  }

  try {
    // Download with video from catboy.best
    const url = `https://catboy.best/d/${setId}`;
    const response = await fetch(url, {
      redirect: 'follow',
      headers: { 'Accept': 'application/octet-stream' },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Download failed with status ${response.status}` },
        { status: response.status }
      );
    }

    const contentLength = response.headers.get('Content-Length');
    const headers: Record<string, string> = {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${setId}.osz"`,
    };
    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    // Stream the response body directly
    return new NextResponse(response.body, {
      status: 200,
      headers,
    });
  } catch (err: any) {
    console.error('[osu-download] Error:', err.message);
    return NextResponse.json({ error: 'Failed to download beatmap' }, { status: 500 });
  }
}
