const API_URL =
  "https://www.googleapis.com/youtube/v3/search";

/* =========================================
   NORMALIZE YOUTUBE RESULT
========================================= */

function normalizeItem(item) {
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
  };
}

/* =========================================
   YOUTUBE SEARCH
========================================= */

export async function searchYouTube(
  query,
  apiKey,
  maxResults = 20
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
    ဥပမာ User က

    လေးဖြူ

    လို့ရိုက်ရင် YouTube ကို

    လေးဖြူ karaoke ကာရာအိုကေ

    လို့ တစ်ခါတည်း ရှာမယ်။
  */

  const searchQuery =
    `${cleanQuery} karaoke ကာရာအိုကေ`;

  const params = new URLSearchParams({
    part: "snippet",

    q: searchQuery,

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

  const results = (data.items || [])
    .filter((item) => item?.id?.videoId)
    .map(normalizeItem);

  /*
    Duplicate video ID ရှိရင် ဖယ်မယ်
  */

  const seen = new Set();

  const finalResults = results.filter(
    (video) => {
      if (!video?.id) {
        return false;
      }

      if (seen.has(video.id)) {
        return false;
      }

      seen.add(video.id);

      return true;
    }
  );

  return finalResults;
}
