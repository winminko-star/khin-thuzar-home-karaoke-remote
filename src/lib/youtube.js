const API_URL =
  "https://www.googleapis.com/youtube/v3/search";

/* =========================================
   NORMALIZE YOUTUBE RESULT
========================================= */

function normalizeItem(item, searchType) {
  return {
    id: item.id.videoId,

    title: item.snippet.title,

    channel: item.snippet.channelTitle,

    thumbnail:
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.medium?.url ||
      item.snippet.thumbnails?.default?.url ||
      "",

    publishedAt: item.snippet.publishedAt,

    source: "youtube",

    /*
      "english" = query + karaoke
      "myanmar" = query + ကာရာအိုကေ
    */
    searchType,
  };
}

/* =========================================
   SEARCH ONE QUERY
========================================= */

async function searchOne(
  query,
  apiKey,
  maxResults,
  searchType
) {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "moderate",
    maxResults: String(maxResults),
    key: apiKey,
  });

  const response = await fetch(
    `${API_URL}?${params.toString()}`
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        "YouTube search မအောင်မြင်ပါ။"
    );
  }

  return (data.items || [])
    .filter((item) => item?.id?.videoId)
    .map((item) =>
      normalizeItem(item, searchType)
    );
}

/* =========================================
   MAIN SEARCH
========================================= */

export async function searchYouTube(
  query,
  apiKey,
  maxResults = 12
) {
  if (!apiKey) {
    throw new Error(
      "YouTube API key မထည့်ရသေးပါ။"
    );
  }

  const cleanQuery = String(query || "").trim();

  if (!cleanQuery) {
    return [];
  }

  /*
    User က ဥပမာ

    လေးဖြူ

    လို့ပဲ ရိုက်မယ်။

    နောက်ကွယ်မှာ

    လေးဖြူ karaoke

    လေးဖြူ ကာရာအိုကေ

    ဆိုပြီး သီးခြား ၂ ကြိမ် ရှာမယ်။
  */

  const englishQuery =
    `${cleanQuery} karaoke`;

  const myanmarQuery =
    `${cleanQuery} ကာရာအိုကေ`;

  /*
    နှစ်ဘက်စလုံးက maxResults အပြည့်ယူမယ်။

    ဥပမာ maxResults = 12 ဆိုရင်

    karaoke      → 12 ခုအထိ
    ကာရာအိုကေ   → 12 ခုအထိ

    ရလာနိုင်တယ်။
  */

  const [
    englishResults,
    myanmarResults,
  ] = await Promise.all([
    searchOne(
      englishQuery,
      apiKey,
      maxResults,
      "english"
    ),

    searchOne(
      myanmarQuery,
      apiKey,
      maxResults,
      "myanmar"
    ),
  ]);

  /* =========================================
     MIX BOTH SEARCH RESULTS
  ========================================= */

  const mixedResults = [];

  const longest = Math.max(
    englishResults.length,
    myanmarResults.length
  );

  /*
    အလှည့်ကျထည့်မယ်။

    karaoke result #1
    ကာရာအိုကေ result #1

    karaoke result #2
    ကာရာအိုကေ result #2

    ...
  */

  for (let i = 0; i < longest; i++) {
    if (englishResults[i]) {
      mixedResults.push(
        englishResults[i]
      );
    }

    if (myanmarResults[i]) {
      mixedResults.push(
        myanmarResults[i]
      );
    }
  }

  /* =========================================
     REMOVE DUPLICATES
  ========================================= */

  const seenVideoIds = new Set();

  const finalResults = [];

  for (const video of mixedResults) {
    if (!video?.id) {
      continue;
    }

    /*
      တူညီတဲ့ YouTube Video ကို
      နှစ်ခါမပြဘူး။
    */

    if (seenVideoIds.has(video.id)) {
      continue;
    }

    seenVideoIds.add(video.id);

    finalResults.push(video);
  }

  return finalResults;
}
