import { NextRequest, NextResponse } from 'next/server';

/**
 * Search osu! beatmaps via catboy.best mirror API.
 * Normalizes the PascalCase catboy.best response to camelCase for the frontend.
 */
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
    const url = `https://catboy.best/api/search?q=${encodeURIComponent(q)}&mode=${m}&limit=${limit}&offset=${offset}`;
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

    // catboy.best returns an array directly — normalize to the format the frontend expects
    const rawSets = Array.isArray(data) ? data : (data.beatmapsets || data.data || []);

    // Detect mania maps by checking diff names ([4K], [7K], etc.) since
    // catboy.best Mode field is unreliable (always 0)
    const MANIA_PATTERN = /\[\d+K\]/i;
    const normalizedSets = rawSets
      .filter((s: any) => {
        const children = s.ChildrenBeatmaps || [];
        return children.some((b: any) =>
          b.Mode === 3 || MANIA_PATTERN.test(b.DiffName || '')
        );
      })
      .map((s: any) => {
        const children = s.ChildrenBeatmaps || [];
        const maniaBeatmaps = children.filter((b: any) =>
          b.Mode === 3 || MANIA_PATTERN.test(b.DiffName || '')
        );
        return {
          id: s.SetID,
          title: s.Title || 'Unknown',
          artist: s.Artist || 'Unknown',
          creator: s.Creator || '',
          has_video: s.HasVideo || false,
          // Construct cover URL from the standard osu! assets CDN
          covers: {
            'list@2x': `https://assets.ppy.sh/beatmaps/${s.SetID}/covers/list@2x.jpg`,
            list: `https://assets.ppy.sh/beatmaps/${s.SetID}/covers/list.jpg`,
          },
          beatmaps: maniaBeatmaps.map((b: any) => ({
            id: b.BeatmapID,
            mode: 3, // force mania since we already filtered
            difficulty_rating: b.DifficultyRating || 0,
            version: b.DiffName || '',
            bpm: b.BPM || 0,
            cs: b.CS || 4,
            ar: b.AR || 5,
            od: b.OD || 8,
            hp: b.HP || 8,
            total_length: b.TotalLength || 0,
          })),
        };
      });

    return NextResponse.json(normalizedSets);
  } catch (err: any) {
    console.error('[osu-search] Error:', err.message);
    return NextResponse.json({ error: 'Failed to search osu! API' }, { status: 500 });
  }
}
