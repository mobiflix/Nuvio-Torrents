const _0x389571 = _0x577b;
(function(_0x4964d3, _0x5574b) {
  // ... (PANATILIHIN ang original obfuscation IIFE dito — huwag galawin)
}(_0x50f4, 0x223bc));

// ... (PANATILIHIN lahat ng helper functions: __defProp, __async, __spreadValues, etc.)

// ============================================================
// parseQuality — tunay na nagde-detect ng resolution/quality
// ============================================================
function parseQuality(name) {
  const text = (name || '').toUpperCase();

  // --- Resolution detection ---
  let resolution = 'unknown';
  let qualityRank = 0;
  if (/\b(2160P|4K|UHD)\b/.test(text)) {
    resolution = '2160p'; qualityRank = 4;
  } else if (/\b1080P\b/.test(text)) {
    resolution = '1080p'; qualityRank = 3;
  } else if (/\b720P\b/.test(text)) {
    resolution = '720p'; qualityRank = 2;
  } else if (/\b(480P|SD)\b/.test(text)) {
    resolution = 'SD'; qualityRank = 1;
  }

  // --- Codec detection ---
  let codec = '';
  if (/\b(X265|HEVC|H\.?265)\b/.test(text)) codec = 'HEVC';
  else if (/\b(X264|AVC|H\.?264)\b/.test(text)) codec = 'x264';

  // --- Audio detection ---
  let audio = 'English';
  if (/\b(DUAL[- ]?AUDIO)\b/.test(text)) audio = 'Dual-Audio';
  else if (/\b(MULTI[- ]?AUDIO|MULTI)\b/.test(text)) audio = 'Multi';

  // --- Source quality flags ---
  const isHDR    = /\b(HDR10\+?|HDR)\b/.test(text);
  const isDV     = /\b(DV|DOLBY ?VISION)\b/.test(text);
  const isRemux  = /\bREMUX\b/.test(text);
  const isBluRay = /\b(BLURAY|BDRIP|BRRIP)\b/.test(text);
  const isWeb    = /\b(WEB[- ]?DL|WEBRIP)\b/.test(text);
  const isCam    = /\b(CAM|HDTS|TELESYNC|TELECINE|HDCAM|TS)\b/.test(text);
  const isScr    = /\b(SCREENER|DVDSCR|SCR)\b/.test(text);

  return {
    resolution,
    qualityRank,
    qualityEmoji: resolution === '1080p' ? '🔥' : '📺',
    codec, audio,
    isHDR, isDV, isRemux, isBluRay, isWeb,
    isBadSource: isCam || isScr,
  };
}

// ============================================================
// computeQualityScore — mas mataas = mas magandang video quality
// ============================================================
function computeQualityScore(q) {
  let score = q.qualityRank * 100;      // 1080p = 300
  if (q.isRemux)   score += 60;         // REMUX = best
  if (q.isBluRay)  score += 30;         // BluRay source
  if (q.isWeb)     score += 15;         // WEB-DL
  if (q.isHDR)     score += 25;         // HDR
  if (q.isDV)      score += 35;         // Dolby Vision
  if (q.codec === 'HEVC') score += 20;  // modern codec
  if (q.codec === 'x264') score += 10;  // compatible
  if (q.audio === 'Dual-Audio') score += 5;
  if (q.audio === 'Multi')      score += 5;
  return score;
}

// ============================================================
// computeCombinedScore — 60% quality + 40% seeders
// ============================================================
function computeCombinedScore(seeders, qualityScore) {
  const seederScore = Math.log10(Math.max(seeders, 1) + 1) * 50;
  return qualityScore * 0.6 + seederScore * 0.4;
}

// ============================================================
// MAIN: extractStreams
// ============================================================
function extractStreams(imdbId, type, season, episode, settings) {
  return __async(this, null, function* () {
    try {
      const isTv = type === 'tv' || type === 'series';
      const tmdb = yield getTmdbInfo(imdbId, type);
      if (!tmdb.title) return [];

      // --- Build search query ---
      let query = tmdb.title;
      if (!isTv && tmdb.year) query += ' ' + tmdb.year;
      else if (isTv && season && episode) {
        const s = String(season).padStart(2, '0');
        const e = String(episode).padStart(2, '0');
        query += ' S' + s + 'E' + e;
      }

      const url = API_URL + '/q.php?q=' + encodeSearchQuery(query) + '&cat=0';
      const data = yield fetchJson2(url);

      if (!Array.isArray(data) || data.length === 0) return [];
      if (data[0].name === 'No results returned') return [];

      const candidates = [];

      for (const item of data) {
        if (!item.info_hash || item.info_hash === '0000000000000000000000000000000000000000') continue;

        const name = item.name || '';
        const q = parseQuality(name);

        // ✅ STRICT: 1080p ONLY (walang 720p, walang 2160p)
        if (q.resolution !== '1080p') continue;

        // ✅ Exclude CAM/TS/Screener (basura quality)
        if (q.isBadSource) continue;

        // ✅ Require legit codec (x264 o HEVC) — iwas sa fake releases
        if (q.codec !== 'x264' && q.codec !== 'HEVC') continue;

        const seeders = parseInt(item.seeders || '0', 10);
        const sizeBytes = parseInt(item.size || '0', 10);

        // ✅ Minimum seeders — iwas sa dead torrents
        if (seeders < 5) continue;

        const qualityScore = computeQualityScore(q);
        const combinedScore = computeCombinedScore(seeders, qualityScore);

        const sizeStr = formatSize(item.size);
        const qualityTags = [];
        if (q.isDV) qualityTags.push('DV');
        if (q.isHDR) qualityTags.push('HDR');
        if (q.isRemux) qualityTags.push('REMUX');
        if (q.isBluRay) qualityTags.push('BluRay');
        if (q.isWeb) qualityTags.push('WEB-DL');
        if (q.codec) qualityTags.push(q.codec);
        qualityTags.push(q.audio);
        const tagStr = qualityTags.join(' · ');

        const titleLine = isTv
          ? '🎦 ' + tmdb.title + ' S' + (season || 1) + ' E' + (episode || 1)
          : '🎬 ' + tmdb.title + ' (' + tmdb.year + ')';

        const infoLine =
          '🔥 1080p | ' + tagStr +
          '\n👥 ' + seeders + ' seeders | 💾 ' + sizeStr +
          ' | ☠️ ' + PROVIDER_NAME;

        const displayName =
          '☠️ ' + PROVIDER_NAME + ' | 1080p | 👥 ' + seeders;

        const magnet = buildMagnetLink(item.info_hash, name);

        candidates.push({
          seeders,
          sizeBytes,
          qualityRank: q.qualityRank,
          qualityScore,
          combinedScore,
          data: {
            name: displayName,
            title: titleLine + '\n' + infoLine,
            size: infoLine,
            description: infoLine,
            url: magnet,
          },
        });
      }

      // ✅ SORT by COMBINED SCORE (quality + seeders)
      candidates.sort((a, b) => {
        if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
        return b.seeders - a.seeders; // tie-breaker
      });

      // ✅ TOP 3 LANG
      return candidates.slice(0, 3).map(c => c.data);
    } catch (err) {
      console.error('[' + PROVIDER_NAME + '] Error:', err);
      return [];
    }
  });
}

// ... (PANATILIHIN ang getStreams, onSettings, module.exports)