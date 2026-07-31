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

export async function searchYouTube(query, apiKey, maxResults = 12) {
  if (!apiKey) throw new Error("YouTube API key မထည့်ရသေးပါ။");

  const variants = [
    `${query} karaoke`,
    `${query} ကာရာအိုကေ`
  ];

  const responses = await Promise.all(
    variants.map(async (q) => {
      const params = new URLSearchParams({
        part: "snippet",
        q,
        type: "video",
        videoEmbeddable: "true",
        safeSearch: "moderate",
        maxResults: String(maxResults),
        key: apiKey
      });
      const response = await fetch(`${API_URL}?${params}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error?.message || "YouTube search မအောင်မြင်ပါ။");
      }
      return data.items.map(normalizeItem);
    })
  );

  const deduped = new Map();
  responses.flat().forEach((video) => {
    if (!deduped.has(video.id)) deduped.set(video.id, video);
  });

  return [...deduped.values()].sort((a, b) => {
    const aK = /karaoke|ကာရာအိုကေ/i.test(a.title) ? 1 : 0;
    const bK = /karaoke|ကာရာအိုကေ/i.test(b.title) ? 1 : 0;
    return bK - aK;
  });
}
