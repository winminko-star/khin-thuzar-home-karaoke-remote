const API_URL = "https://www.googleapis.com/youtube/v3/search";

function decodeHtml(text) {
  if (typeof document === "undefined") return text || "";

  const element = document.createElement("textarea");
  element.innerHTML = text || "";
  return element.value;
}

function normalizeItem(item) {
  return {
    id: item.id.videoId,
    title: decodeHtml(item.snippet.title),
    channel: decodeHtml(item.snippet.channelTitle),
    thumbnail:
      item.snippet.thumbnails?.high?.url ||
      item.snippet.thumbnails?.medium?.url ||
      item.snippet.thumbnails?.default?.url ||
      "",
    publishedAt: item.snippet.publishedAt,
    source: "youtube"
  };
}

export async function searchYouTube(query, apiKey, maxResults = 20) {
  if (!apiKey) {
    throw new Error("YouTube API key မထည့်ရသေးပါ။");
  }

  const cleanQuery = String(query || "").trim();

  if (!cleanQuery) {
    return [];
  }

  // Search ခလုတ်တစ်ကြိမ်လျှင် YouTube API request တစ်ကြိမ်ပဲသုံးမယ်။
  const searchQuery = /\bkaraoke\b/i.test(cleanQuery)
    ? cleanQuery
    : `${cleanQuery} karaoke`;

  const params = new URLSearchParams({
    part: "snippet",
    q: searchQuery,
    type: "video",
    videoEmbeddable: "true",
    safeSearch: "moderate",
    maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
    key: apiKey
  });

  let response;

  try {
    response = await fetch(`${API_URL}?${params.toString()}`);
  } catch {
    throw new Error("Internet connection စစ်ပြီး ထပ်ရှာပါ။");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const reason = data?.error?.errors?.[0]?.reason;

    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      throw new Error("YouTube Search limit ဒီနေ့အတွက် ပြည့်သွားပါပြီ။ နောက်နေ့ပြန်စမ်းပါ။");
    }

    if (reason === "keyInvalid") {
      throw new Error("YouTube API key မမှန်ပါ။ Netlify Environment Variable ကိုစစ်ပါ။");
    }

    throw new Error(
      data?.error?.message || "YouTube search မအောင်မြင်ပါ။"
    );
  }

  const seen = new Set();

  return (data.items || [])
    .filter((item) => item?.id?.videoId)
    .map(normalizeItem)
    .filter((video) => {
      if (seen.has(video.id)) return false;
      seen.add(video.id);
      return true;
    });
}
