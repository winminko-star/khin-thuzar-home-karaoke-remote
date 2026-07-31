const API_URL = "https://www.googleapis.com/youtube/v3/search";

function normalizeItem(item) {
  return {
    id: item.id.videoId,
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    thumbnail:
      item.snippet.thumbnails?.medium?.url ||
      item.snippet.thumbnails?.default?.url ||
      "",
    publishedAt: item.snippet.publishedAt,
    source: "youtube"
  };
}

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

  // နှစ်မျိုး သီးခြားရှာမယ်
  const variants = [
    `${cleanQuery} karaoke`,
    `${cleanQuery} ကာရာအိုကေ`
  ];

  const responses = await Promise.all(
    variants.map(async (q) => {
      const params = new URLSearchParams({
        part: "snippet",
        q: q,
        type: "video",
        videoEmbeddable: "true",
        safeSearch: "moderate",
        maxResults: String(maxResults),
        key: apiKey
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
        .map(normalizeItem);
    })
  );

  const englishResults = responses[0];
  const myanmarResults = responses[1];

  // နှစ်ဘက်က result တွေကို အလှည့်ကျ ပေါင်းမယ်
  const mixed = [];

  const maxLength = Math.max(
    englishResults.length,
    myanmarResults.length
  );

  for (let i = 0; i < maxLength; i++) {
    if (englishResults[i]) {
      mixed.push(englishResults[i]);
    }

    if (myanmarResults[i]) {
      mixed.push(myanmarResults[i]);
    }
  }

  // တူတဲ့ video ကို တစ်ခုပဲထားမယ်
  const seen = new Set();

  return mixed.filter((video) => {
    if (!video?.id) return false;

    if (seen.has(video.id)) {
      return false;
    }

    seen.add(video.id);

    return true;
  });
}
