import { NextRequest, NextResponse } from 'next/server';

/**
 * Search osu! beatmaps via catboy.best mirror API.
 *
 * catboy.best returns data with PascalCase field names that differ from
 * the osu! API v2 format. Key mappings:
 *   SetID → id, ChildrenBeatmaps → beatmaps, Title → title, etc.
 *
 * IMPORTANT: catboy.best always returns Mode:0 in ChildrenBeatmaps,
 * even for mania maps. Since the search already uses m=3 to filter,
 * we detect mania by CS (key count ≥ 4) or accept all children.
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
    const url = `https://catboy.best/api/search?q=${encodeURIComponent(q)}&m=${m}&limit=${limit}&offset=${offset}`;
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

    // catboy.best returns an array of beatmapset objects
    const rawSets = Array.isArray(data) ? data : (data.beatmapsets || data.data || []);

    // Normalize catboy.best field names to our frontend format
    const normalizedSets = rawSets
      .map((s: any) => {
        // Map children — catboy.best uses "ChildrenBeatmaps"
        const rawChildren: any[] = s.ChildrenBeatmaps || s.beatmaps || [];

        // Since we search with m=3, all sets have mania diffs.
        // Filter children to mania: CS >= 4 indicates 4K/7K/8K mania.
        // (catboy.best sets Mode:0 for everything, so we can't rely on it)
        const maniaChildren = rawChildren.filter((b: any) => {
          const cs = b.CS ?? b.cs ?? 0;
          const mode = b.Mode ?? b.mode_int ?? b.mode ?? 0;
          // Mania if CS >= 4 (4K, 7K, 8K etc.) OR mode explicitly set to 3
          return cs >= 4 || mode === 3;
        });

        // If no children pass the CS filter, use all of them
        // (some old maps might have unusual CS values)
        const children = maniaChildren.length > 0 ? maniaChildren : rawChildren;

        // Use SetID from catboy.best format, fallback to id
        const setId = s.SetID ?? s.id;
        const title = (s.Title ?? s.title) || 'Unknown';
        const artist = (s.Artist ?? s.artist) || 'Unknown';
        const creator = (s.Creator ?? s.creator) || '';
        const hasVideo = s.HasVideo ?? s.video ?? s.has_video ?? false;

        return {
          id: setId,
          title,
          artist,
          creator,
          has_video: hasVideo,
          // Construct cover URL from the standard osu! assets CDN
          covers: {
            'list@2x': `https://assets.ppy.sh/beatmaps/${setId}/covers/list@2x.jpg`,
            list: `https://assets.ppy.sh/beatmaps/${setId}/covers/list.jpg`,
          },
          beatmaps: children.map((b: any) => ({
            id: b.BeatmapID ?? b.id,
            mode: 3, // force mania since search already filtered with m=3
            difficulty_rating: b.DifficultyRating ?? b.difficulty_rating ?? 0,
            version: b.DiffName ?? b.version ?? '',
            bpm: b.BPM ?? b.bpm ?? 0,
            cs: b.CS ?? b.cs ?? 4,
            ar: b.AR ?? b.ar ?? 5,
            od: b.OD ?? b.accuracy ?? b.od ?? 8,
            hp: b.HP ?? b.drain ?? b.hp ?? 8,
            total_length: b.TotalLength ?? b.total_length ?? 0,
          })),
        };
      })
      // Filter out sets that ended up with zero beatmaps
      .filter((s: any) => s.beatmaps && s.beatmaps.length > 0);

    return NextResponse.json(normalizedSets);
  } catch (err: any) {
    console.error('[osu-search] Error:', err.message);
    return NextResponse.json({ error: 'Failed to search osu! API' }, { status: 500 });
  }
}
