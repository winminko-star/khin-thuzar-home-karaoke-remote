import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import ArtistModal from "./components/ArtistModal";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { searchYouTube } from "./lib/youtube";

const ROOM_ID = import.meta.env.VITE_KARAOKE_ROOM_ID || "wmk-home-karaoke";
const YOUTUBE_API_KEYS = {
  "1": import.meta.env.VITE_YOUTUBE_API_KEY || "",
  "2": import.meta.env.VITE_YOUTUBE_API_KEY_2 || "",
  "3": import.meta.env.VITE_YOUTUBE_API_KEY_3 || ""
};

const LOCAL_YOUTUBE_API_CHOICE_KEY =
  "kth_youtube_api_choice";
const LOCAL_ARTISTS_KEY = "kth_home_karaoke_custom_artists";
const LOCAL_QUEUE_KEY = "kth_home_karaoke_queue";
const LOCAL_FAVORITES_KEY = "kth_home_karaoke_favorites";
const MAX_FAVORITES = 20;
// ========================================
// USB SONG CACHE - INDEXEDDB
// ========================================

const USB_DB_NAME = "kth_karaoke_usb_db";
const USB_DB_VERSION = 1;
const USB_STORE_NAME = "usb_cache";
const USB_CACHE_KEY = "current";
const USB_BACKUP_CACHE_KEY = "backup";
const USB_CACHE_DATA_VERSION = 1;

function openUsbDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(
      USB_DB_NAME,
      USB_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(USB_STORE_NAME)) {
        db.createObjectStore(USB_STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

async function readUsbCache() {
  async function readCacheKey(key) {
    const db = await openUsbDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(
        USB_STORE_NAME,
        "readonly"
      );

      const store =
        transaction.objectStore(USB_STORE_NAME);

      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(request.error);
      };

      transaction.oncomplete = () => {
        db.close();
      };

      transaction.onerror = () => {
        db.close();
      };
    });
  }

  try {
    const currentCache = await readCacheKey(
      USB_CACHE_KEY
    );

    if (Array.isArray(currentCache?.songs)) {
      return currentCache.songs;
    }
  } catch (error) {
    console.error(
      "USB current cache read error:",
      error
    );
  }

  try {
    const backupCache = await readCacheKey(
      USB_BACKUP_CACHE_KEY
    );

    return Array.isArray(backupCache?.songs)
      ? backupCache.songs
      : [];
  } catch (error) {
    console.error(
      "USB backup cache read error:",
      error
    );
    return [];
  }
}

async function saveUsbCache(songs) {
  if (!Array.isArray(songs)) {
    throw new Error("Invalid USB song cache");
  }

  const validSongs = songs.filter(
    (song) => song && typeof song === "object"
  );

  if (songs.length > 0 && validSongs.length === 0) {
    throw new Error("USB cache validation failed");
  }

  const db = await openUsbDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      USB_STORE_NAME,
      "readwrite"
    );

    const store =
      transaction.objectStore(USB_STORE_NAME);

    const currentRequest =
      store.get(USB_CACHE_KEY);

    currentRequest.onsuccess = () => {
      const oldCache = currentRequest.result;

      if (Array.isArray(oldCache?.songs)) {
        store.put(
          oldCache,
          USB_BACKUP_CACHE_KEY
        );
      }

      store.put(
        {
          version: USB_CACHE_DATA_VERSION,
          songs: validSongs,
          savedAt: Date.now()
        },
        USB_CACHE_KEY
      );
    };

    currentRequest.onerror = () => {
      transaction.abort();
    };

    transaction.oncomplete = () => {
      db.close();
      resolve();
    };

    transaction.onerror = () => {
      db.close();
      reject(
        transaction.error ||
          new Error("USB cache save failed")
      );
    };

    transaction.onabort = () => {
      db.close();
      reject(
        transaction.error ||
          new Error("USB cache save aborted")
      );
    };
  });
}

function mapCsvArtist(row, index) {
  return {
    id: `base-${index + 1}`,
    letter: row["အက္ခရာ"] || "#",
    display_name: row["Display Name"] || row["မြန်မာအမည်"] || "Unknown",
    myanmar_name: row["မြန်မာအမည်"] || "",
    english_name: row["English / Stage Name"] || "",
    artist_type: row["အမျိုးအစား"] || "Solo",
    gender: row["ကျား/မ"] || "မသတ်မှတ်",
    search_keys: row["Search Keys"] || "",
    youtube_keyword: row["YouTube Keyword"] || "",
    is_base: true
  };
}

function loadLocal(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}
function getSourceType(songOrId) {
  const id =
    typeof songOrId === "string"
      ? songOrId
      : songOrId?.id || "";

  return String(id).startsWith("usb:")
    ? "usb"
    : "youtube";
}

function normalizeSongSource(song) {
  if (!song) return null;

  return {
    ...song,
    sourceType:
      song.sourceType || getSourceType(song.id)
  };
}

function queueRowToSong(row) {
  return {
    id: row.video_id,
    sourceType: getSourceType(row.video_id),
    queueId: `db-${row.id}`,
    dbId: row.id,
    title: row.title || "",
    channel: row.channel || "",
    thumbnail: row.thumbnail || ""
  };
}

function queueSongToRow(song, position) {
  return {
    room_id: ROOM_ID,
    video_id: song.id,
    title: song.title || "",
    channel: song.channel || "",
    thumbnail: song.thumbnail || "",
    position,
    is_playing: false
  };
}

function stateRowToSong(row) {
  if (!row?.current_video_id) return null;

  return {
    id: row.current_video_id,
    sourceType: getSourceType(
      row.current_video_id
    ),
    title: row.current_title || "",
    channel: row.current_channel || "",
    thumbnail: row.current_thumbnail || ""
  };
}
function normalizeMyanmarSearch(text = "") {
  return String(text)
    .normalize("NFC")
    .toLocaleLowerCase("my")

    // space / punctuation ဖယ်
    .replace(/\s+/g, "")
    .replace(
      /[၊။\-_.()[\]{}'"`~!@#$%^&*+=:;?/\\|<>]/g,
      ""
    )

    // မြန်မာရေးပုံကွဲများ
    .replace(/တစ်ကယ်/g, "တကယ်");
}

function levenshteinWithinLimit(
  a,
  b,
  maxDistance
) {
  const source = Array.from(a);
  const target = Array.from(b);

  if (
    Math.abs(
      source.length - target.length
    ) > maxDistance
  ) {
    return false;
  }

  const previous =
    Array.from(
      { length: target.length + 1 },
      (_, i) => i
    );

  const current =
    new Array(target.length + 1);

  for (
    let i = 1;
    i <= source.length;
    i += 1
  ) {
    current[0] = i;

    let rowMinimum = current[0];

    for (
      let j = 1;
      j <= target.length;
      j += 1
    ) {
      const cost =
        source[i - 1] ===
        target[j - 1]
          ? 0
          : 1;

      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );

      rowMinimum = Math.min(
        rowMinimum,
        current[j]
      );
    }

    // ဒီ row ကတည်းက
    // distance များနေပြီဆို စောစောရပ်
    if (rowMinimum > maxDistance) {
      return false;
    }

    for (
      let j = 0;
      j <= target.length;
      j += 1
    ) {
      previous[j] = current[j];
    }
  }

  return (
    previous[target.length] <=
    maxDistance
  );
}

function fuzzyMyanmarMatch(
  normalizedText,
  normalizedQuery
) {
  if (!normalizedQuery) {
    return true;
  }

  // Exact / partial match အရင်
  if (
    normalizedText.includes(
      normalizedQuery
    )
  ) {
    return true;
  }

  const queryChars =
    Array.from(normalizedQuery);

  // 1–3 လုံးဆို fuzzy မလုပ်
  // result မှားများမလာအောင်
  if (queryChars.length < 4) {
    return false;
  }

  // Typo ခွင့်ပြုချက်
  const maxDistance =
    queryChars.length <= 6
      ? 1
      : queryChars.length <= 12
        ? 2
        : 3;

  const textChars =
    Array.from(normalizedText);

  const minLength =
    Math.max(
      1,
      queryChars.length -
        maxDistance
    );

  const maxLength =
    queryChars.length +
    maxDistance;

  for (
    let start = 0;
    start < textChars.length;
    start += 1
  ) {
    // ပထမစာလုံးနဲ့တောင်
    // အရမ်းမဆိုင်ရင် skip
    if (
      textChars[start] !==
        queryChars[0] &&
      queryChars.length >= 5
    ) {
      continue;
    }

    for (
      let length = minLength;
      length <= maxLength;
      length += 1
    ) {
      if (
        start + length >
        textChars.length
      ) {
        break;
      }

      const candidate =
        textChars
          .slice(
            start,
            start + length
          )
          .join("");

      if (
        levenshteinWithinLimit(
          candidate,
          normalizedQuery,
          maxDistance
        )
      ) {
        return true;
      }
    }
  }

  return false;
}

export default function App() {
  const [tab, setTab] = useState("search");
  const [youtubeApiChoice, setYoutubeApiChoice] =
  useState(() => {
    return (
      localStorage.getItem(
        LOCAL_YOUTUBE_API_CHOICE_KEY
      ) || "1"
    );
  });
  const selectedYouTubeApiKey =
  YOUTUBE_API_KEYS[youtubeApiChoice] || "";
  const [returnTab, setReturnTab] = useState("search");

const [popupText, setPopupText] = useState("");
const [popupDuration, setPopupDuration] = useState(4);
  const [goFlash, setGoFlash] = useState("");

function flashGo(target) {
  setGoFlash(target);

  setTimeout(() => {
    setGoFlash("");
  }, 1000);
}
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [usbSongs, setUsbSongs] = useState([]);
const [usbLoading, setUsbLoading] = useState(false);
  const [usbQuery, setUsbQuery] = useState("");
  const [usbSearchQuery, setUsbSearchQuery] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
  let cancelled = false;

  async function loadUsbSongsFromCache() {
    try {
      const cachedSongs = await readUsbCache();

      if (cancelled) return;

      if (cachedSongs.length > 0) {
        setUsbSongs(cachedSongs);

        setMessage(
          `USB Cache မှ သီချင်း ${cachedSongs.length} ပုဒ် ဖတ်ပြီးပါပြီ။`
        );
      }
    } catch (error) {
      console.error("USB cache read error:", error);
    }
  }

  loadUsbSongsFromCache();

  return () => {
    cancelled = true;
  };
}, []);
  useEffect(() => {
  if (!message) return;

  const timer = setTimeout(() => {
    setMessage("");
  }, 5000);

  return () => clearTimeout(timer);
}, [message]);
  const [baseArtists, setBaseArtists] = useState([]);
  const [customArtists, setCustomArtists] = useState(() => loadLocal(LOCAL_ARTISTS_KEY, []));
  const [artistQuery, setArtistQuery] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("ALL");
  const [sceneryActive, setSceneryActive] = useState(false);
  const [artistModal, setArtistModal] = useState({ open: false, artist: null });
  const [queue, setQueue] = useState(() => loadLocal(LOCAL_QUEUE_KEY, []));

const [favorites, setFavorites] = useState(() =>
  loadLocal(LOCAL_FAVORITES_KEY, [])
);

const [currentSong, setCurrentSong] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [repeatMode, setRepeatMode] = useState("off");
  const [connected, setConnected] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const channelRef = useRef(null);
  const queueChannelRef = useRef(null);
  const stateChannelRef = useRef(null);
  const usbChunksRef = useRef([]);
const usbTransferIdRef = useRef(null);
const usbExpectedChunksRef = useRef(0);
const usbReceivedChunksRef = useRef(new Set());
const usbTransferTimeoutRef = useRef(null);
  const queueRef = useRef(queue);
  const autoAdjustDoneRef = useRef(false);
  const currentSongRef = useRef(currentSong);
  const currentIndexRef = useRef(currentIndex);
  const repeatModeRef = useRef(repeatMode);
  const queueReloadTimerRef = useRef(null);
  const stateReloadTimerRef = useRef(null);

  const nextSong = queue[0] || null;
  const indexedUsbSongs =
  useMemo(() => {
    return usbSongs.map((song) => {
      const searchableText = [
        song.title,
        song.name,
        song.fileName,
        song.channel,
        song.folder,
        song.searchText
      ]
        .filter(Boolean)
        .join(" ");

      return {
        song,
        normalizedSearchText:
          normalizeMyanmarSearch(
            searchableText
          )
      };
    });
  }, [usbSongs]);
  const filteredUsbSongs =
  useMemo(() => {
    const keyword =
      normalizeMyanmarSearch(
        usbSearchQuery
      );

    if (!keyword) {
      return usbSongs;
    }

    return indexedUsbSongs
      .filter((item) =>
        fuzzyMyanmarMatch(
          item.normalizedSearchText,
          keyword
        )
      )
      .map((item) => item.song);
  }, [
    indexedUsbSongs,
    usbSongs,
    usbSearchQuery
  ]);
  const sendCommand = useCallback(async (type, payload = {}) => {
    const packet = { type, payload, sentAt: new Date().toISOString() };
    if (!channelRef.current) {
      setMessage("TV connection မရသေးပါ။ Supabase settings စစ်ပါ။");
      return;
    }
    await channelRef.current.send({ type: "broadcast", event: "karaoke-command", payload: packet });
  }, []);
  useEffect(() => {
  if (!connected) return;
  if (autoAdjustDoneRef.current) return;

  autoAdjustDoneRef.current = true;

  sendCommand("REQUEST_TV_STATE");
}, [connected]);
  function selectYouTubeApi(choice) {
  const selectedKey =
    YOUTUBE_API_KEYS[choice];

  if (!selectedKey) {
    setMessage(
      `API ${choice} key ကို Netlify မှာ မထည့်ရသေးပါ။`
    );

    return;
  }

  localStorage.setItem(
    LOCAL_YOUTUBE_API_CHOICE_KEY,
    choice
  );

  setYoutubeApiChoice(choice);

  setMessage(
    ` API ${choice} ကို ရွေးထားပါပြီ။`
  );
  }
  const showPopup = useCallback(() => {
  sendCommand("SHOW_POPUP");
}, [sendCommand]);
  const startSceneryShow = useCallback(() => {
  sendCommand("START_SCENERY_SHOW");
  setSceneryActive(true);
  setMessage("TV Scenery Show စတင်လိုက်ပါပြီ။");
}, [sendCommand]);

const stopSceneryShow = useCallback(() => {
  sendCommand("STOP_SCENERY_SHOW");
  setSceneryActive(false);
  setMessage("TV Scenery Show ရပ်လိုက်ပါပြီ။");
}, [sendCommand]);
  const openTextPopupPage = useCallback(() => {
  setReturnTab(tab);
  setTab("popup");
}, [tab]);

const sendTextPopup = useCallback(() => {
  const text = popupText.trim();

  if (!text) {
    setMessage("TV ပေါ်ပို့မယ့်စာကို အရင်ရိုက်ပါ။");
    return;
  }

  sendCommand("SHOW_TEXT_POPUP", {
    text,
    duration: popupDuration
  });

  setPopupText("");
  setMessage("TV ပေါ်သို့ စာပို့လိုက်ပါပြီ။");
}, [popupText, popupDuration, sendCommand]);

  useEffect(() => {
      fetch("/artists.csv")
      .then((response) => {
        if (!response.ok) throw new Error("Artist CSV မတွေ့ပါ။");
        return response.text();
      })
      .then((text) => {
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        setBaseArtists(parsed.data.map(mapCsvArtist));
      })
      .catch((error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    localStorage.setItem(LOCAL_ARTISTS_KEY, JSON.stringify(customArtists));
  }, [customArtists]);

  useEffect(() => {
    localStorage.setItem(LOCAL_QUEUE_KEY, JSON.stringify(queue));
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
  localStorage.setItem(
    LOCAL_FAVORITES_KEY,
    JSON.stringify(favorites)
  );
}, [favorites]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    currentSongRef.current = currentSong;
  }, [currentSong]);

  useEffect(() => {
    repeatModeRef.current = repeatMode;
  }, [repeatMode]);


  const loadSharedQueue = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    const { data, error } = await supabase
      .from("karaoke_queue")
      .select("*")
      .eq("room_id", ROOM_ID)
      .order("position", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      setMessage(`Queue sync ဖတ်မရပါ: ${error.message}`);
      return;
    }

    const songs = (data || []).map(queueRowToSong);

    queueRef.current = songs;
    setQueue(songs);
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
  }, []);

  const normalizeQueuePositions = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    const { data, error } = await supabase
      .from("karaoke_queue")
      .select("*")
      .eq("room_id", ROOM_ID)
      .order("position", { ascending: true })
      .order("id", { ascending: true });

    if (error || !data) return;

    await Promise.all(
      data.map((row, index) =>
        supabase
          .from("karaoke_queue")
          .update({ position: index })
          .eq("id", row.id)
      )
    );
  }, []);

  const loadPlaybackState = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    const { data, error } = await supabase
      .from("karaoke_state")
      .select("*")
      .eq("room_id", ROOM_ID)
      .maybeSingle();

    if (error) {
      setMessage(`Now Playing sync ဖတ်မရပါ: ${error.message}`);
      return;
    }

    const song = stateRowToSong(data);
    currentSongRef.current = song;
    setCurrentSong(song);
  }, []);

  const savePlaybackState = useCallback(async (song) => {
    if (!isSupabaseConfigured) {
      currentSongRef.current = song;
      setCurrentSong(song);
      return true;
    }

    const payload = {
      room_id: ROOM_ID,
      current_video_id: song?.id || null,
      current_title: song?.title || null,
      current_channel: song?.channel || null,
      current_thumbnail: song?.thumbnail || null,
      is_playing: Boolean(song),
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("karaoke_state")
      .upsert(payload, { onConflict: "room_id" });

    if (error) {
      setMessage(`Now Playing sync မရပါ: ${error.message}`);
      return false;
    }

    currentSongRef.current = song;
    setCurrentSong(song);
    return true;
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    loadSharedQueue();

    const reloadQueue = () => {
  window.clearTimeout(queueReloadTimerRef.current);

  queueReloadTimerRef.current = window.setTimeout(() => {
    loadSharedQueue();
  }, 180);
};

const queueChannel = supabase
  .channel(`karaoke-queue:${ROOM_ID}`)

  /* INSERT ကို room filter နဲ့နားထောင်မယ် */
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "karaoke_queue",
      filter: `room_id=eq.${ROOM_ID}`
    },
    reloadQueue
  )

  /* UPDATE ကို room filter နဲ့နားထောင်မယ် */
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "karaoke_queue",
      filter: `room_id=eq.${ROOM_ID}`
    },
    reloadQueue
  )

  /* DELETE ကို filter မထည့်ရ */
  .on(
    "postgres_changes",
    {
      event: "DELETE",
      schema: "public",
      table: "karaoke_queue"
    },
    reloadQueue
  )

  .subscribe();

    queueChannelRef.current = queueChannel;

    return () => {
      window.clearTimeout(queueReloadTimerRef.current);
      supabase.removeChannel(queueChannel);
      queueChannelRef.current = null;
    };
  }, [loadSharedQueue]);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    loadPlaybackState();

    const stateChannel = supabase
      .channel(`karaoke-state:${ROOM_ID}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "karaoke_state",
          filter: `room_id=eq.${ROOM_ID}`
        },
        () => {
          window.clearTimeout(stateReloadTimerRef.current);
          stateReloadTimerRef.current = window.setTimeout(() => {
            loadPlaybackState();
          }, 120);
        }
      )
      .subscribe();

    stateChannelRef.current = stateChannel;

    return () => {
      window.clearTimeout(stateReloadTimerRef.current);
      supabase.removeChannel(stateChannel);
      stateChannelRef.current = null;
    };
  }, [loadPlaybackState]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setMessage("Supabase env variables မထည့်ရသေးပါ။ Local features သုံးလို့ရပါတယ်။");
      return undefined;
    }

    const channel = supabase.channel(`karaoke-room:${ROOM_ID}`, {
      config: { broadcast: { self: true } }
    });
    channel
      .on(
  "broadcast",
  { event: "tv-status" },
  ({ payload }) => {
    if (payload?.type === "READY") {
      setConnected(true);
    }

    if (payload?.type === "VIDEO_ENDED") {
      loadSharedQueue();
      loadPlaybackState();
    }
    if (payload?.type === "TV_STATE") {
  const tvCurrentSong =
    payload?.currentSong || null;

  const tvQueue =
    Array.isArray(payload?.queue)
      ? payload.queue
      : [];

  currentSongRef.current = tvCurrentSong;
  setCurrentSong(tvCurrentSong);

  queueRef.current = tvQueue;
  setQueue(tvQueue);

  setCurrentIndex(-1);
  currentIndexRef.current = -1;

  setMessage("TV နဲ့ Remote Adjust ပြီးပါပြီ။");
    }

    if (payload?.type === "USB_SONGS_CHUNK") {
  window.clearTimeout(
    usbTransferTimeoutRef.current
  );

  usbTransferTimeoutRef.current =
    window.setTimeout(() => {
      setUsbLoading(false);
      usbChunksRef.current = [];
      usbReceivedChunksRef.current = new Set();
      usbTransferIdRef.current = null;
      usbExpectedChunksRef.current = 0;
      usbTransferTimeoutRef.current = null;

      setMessage(
        "USB စာရင်းပို့တာ မပြီးဆုံးပါ။ အရင် Cache ကို ဆက်သုံးနေပါသည်။"
      );
    }, 15000);

  const transferId =
    payload?.transferId || "default";

  const chunkIndex =
    Number(payload?.chunkIndex ?? 0);

  const totalChunks =
    Number(payload?.totalChunks ?? 1);

  const incomingSongs =
    Array.isArray(payload?.songs)
      ? payload.songs
      : [];

  // Transfer အသစ်စရင် buffer reset
  if (
    usbTransferIdRef.current !==
    transferId
  ) {
    usbTransferIdRef.current =
      transferId;

    usbChunksRef.current = [];

    usbReceivedChunksRef.current =
      new Set();

    usbExpectedChunksRef.current =
      totalChunks;
  }

  // Duplicate chunk မထည့်
  if (
    !usbReceivedChunksRef.current.has(
      chunkIndex
    )
  ) {
    const normalizedSongs =
      incomingSongs.map((song) => {
        const rawId =
          song.id ||
          song.fileId ||
          song.uri ||
          song.path ||
          song.title;

        const usbId =
          String(rawId).startsWith("usb:")
            ? String(rawId)
            : `usb:${rawId}`;

        return {
          ...song,

          id: usbId,

          sourceType: "usb",

          channel:
            song.channel ||
            song.folder ||
            "USB Storage",

          thumbnail:
            song.thumbnail ||
            "/usb-default.png"
        };
      });

    usbChunksRef.current[chunkIndex] =
      normalizedSongs;

    usbReceivedChunksRef.current.add(
      chunkIndex
    );
  }

  const receivedCount =
    usbReceivedChunksRef.current.size;
      setMessage(
  `USB Chunk ${receivedCount}/${totalChunks} ရောက်ပါပြီ`
);

  // Chunk အကုန်ရပြီ
  if (receivedCount === totalChunks) {
    window.clearTimeout(
      usbTransferTimeoutRef.current
    );
    usbTransferTimeoutRef.current = null;

    const fullList =
      usbChunksRef.current.flat();

    setUsbSongs(fullList);
    setUsbLoading(false);

    saveUsbCache(fullList)
      .then(() => {
        console.log(
          `USB cache saved: ${fullList.length}`
        );
      })
      .catch((error) => {
        console.error(
          "USB cache save error:",
          error
        );
      });

    setMessage(
      fullList.length > 0
        ? `USB သီချင်း ${fullList.length} ပုဒ် ရပါပြီ။`
        : "USB ထဲမှာ MP4 သီချင်းမတွေ့ပါ။"
    );

    // Buffer cleanup
    usbChunksRef.current = [];

    usbReceivedChunksRef.current =
      new Set();

    usbTransferIdRef.current = null;

    usbExpectedChunksRef.current = 0;
  }
    }

    if (payload?.type === "USB_ERROR") {
  window.clearTimeout(
    usbTransferTimeoutRef.current
  );
  usbTransferTimeoutRef.current = null;

  setUsbLoading(false);

  usbChunksRef.current = [];

  usbReceivedChunksRef.current =
    new Set();

  usbTransferIdRef.current = null;

  usbExpectedChunksRef.current = 0;

  setMessage(
    payload?.message ||
      "USB သီချင်းစာရင်းအသစ် ဖတ်မရပါ။ အရင် Cache ကို ဆက်သုံးနေပါသည်။"
  );
    }
  }
)
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    channelRef.current = channel;

    return () => {
      window.clearTimeout(
        usbTransferTimeoutRef.current
      );
      usbTransferTimeoutRef.current = null;

      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase
      .from("karaoke_artists")
      .select("*")
      .order("display_name")
      .then(({ data, error }) => {
        if (!error && data) setCustomArtists(data);
      });
  }, []);

  const artists = useMemo(() => {
    const combined = [...baseArtists, ...customArtists];
    const needle = artistQuery.trim().toLowerCase();
    return combined
      .filter((artist) => selectedLetter === "ALL" || artist.letter === selectedLetter)
      .filter((artist) => {
        if (!needle) return true;
        return [artist.display_name, artist.myanmar_name, artist.english_name, artist.search_keys]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => a.display_name.localeCompare(b.display_name, "my"));
  }, [baseArtists, customArtists, artistQuery, selectedLetter]);

  const letters = useMemo(() => {
    return ["ALL", ...new Set([...baseArtists, ...customArtists].map((a) => a.letter).filter(Boolean))];
  }, [baseArtists, customArtists]);

        async function runSearch(overrideQuery) {
  const text = (overrideQuery ?? query).trim();
  if (!text || searching) return;

  setQuery("");
  setSearching(true);
  setMessage("");
  setTab("search");

  const keyword =
  normalizeMyanmarSearch(text);

  // USB ထဲမှာ တူတဲ့သီချင်းတွေကို အရင်ရှာမယ်
  const usbMatches =
  indexedUsbSongs
    .filter((item) =>
      fuzzyMyanmarMatch(
        item.normalizedSearchText,
        keyword
      )
    )
    .map((item) => ({
      ...item.song,
      sourceType: "usb"
    }));
    

  try {
    if (!selectedYouTubeApiKey) {
      throw new Error(
        ` API ${youtubeApiChoice} key မရှိပါ။`
      );
    }

    const youtubeResults = await searchYouTube(
      text,
      selectedYouTubeApiKey
    );

    const normalizedYouTubeResults = youtubeResults.map(
      (video) => ({
        ...video,
        sourceType: "youtube"
      })
    );

    // USB ကို အမြဲထိပ်ဆုံးထားမယ်
    setResults([
      ...usbMatches,
      ...normalizedYouTubeResults
    ]);
  } catch (error) {
    // YouTube API error ဖြစ်လည်း USB result ရှိရင် ပြမယ်
    setResults(usbMatches);

    if (usbMatches.length > 0) {
      setMessage(
        `USB မှာ ${usbMatches.length} ပုဒ်တွေ့ပါတယ်။ YouTube Search: ${error.message}`
      );
    } else {
      setMessage(error.message);
    }
  } finally {
    setSearching(false);
  }
  }
  function startVoiceSearch() {
  // Android APK မှာဆို Native Voice Search ကိုသုံးမယ်
  if (
    window.AndroidVoice &&
    typeof window.AndroidVoice.startVoiceSearch === "function"
  ) {
    setMessage("🎤 မြန်မာလို ပြောပါ…");
    window.AndroidVoice.startVoiceSearch();
    return;
  }

  // Website / normal browser fallback
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    setMessage("ဒီ Browser မှာ Voice Search မရနိုင်ပါ။");
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "my-MM";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  setMessage("🎤 မြန်မာလို ပြောပါ…");

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;

    setQuery(text);
    runSearch(text);
  };

  recognition.onerror = () => {
    setMessage("Voice Search မအောင်မြင်ပါ။");
  };

  recognition.onend = () => {
    setMessage("");
  };

  recognition.start();
  }
  useEffect(() => {
  window.handleAndroidVoiceResult = (text) => {
    if (!text) return;

    setQuery(text);
    setMessage(`🎤 ${text}`);

    runSearch(text);
  };

  window.handleAndroidVoiceError = (message) => {
    setMessage(
      message || "Voice Search မအောင်မြင်ပါ။"
    );
  };

  return () => {
    delete window.handleAndroidVoiceResult;
    delete window.handleAndroidVoiceError;
  };
});
  function isFavorite(videoId) {
  return favorites.some((song) => song.id === videoId);
}

function toggleFavorite(video) {
  const alreadyFavorite = favorites.some(
    (song) => song.id === video.id
  );

  if (alreadyFavorite) {
    setFavorites((currentFavorites) =>
      currentFavorites.filter(
        (song) => song.id !== video.id
      )
    );

    setMessage("Favorites ထဲက ဖယ်လိုက်ပါပြီ။");
    return;
  }

  if (favorites.length >= MAX_FAVORITES) {
    setMessage(
      "Favorites 20 ပုဒ်ပြည့်နေပါပြီ။ အသစ်ထည့်ရန် အရင်တစ်ပုဒ်ကို ဖျက်ပါ။"
    );
    return;
  }

  const favoriteSong = {
    id: video.id,
    title: video.title || "",
    channel: video.channel || "",
    thumbnail: video.thumbnail || ""
  };

  setFavorites((currentFavorites) => [
    ...currentFavorites,
    favoriteSong
  ]);

  setMessage("Favorites ထဲသိမ်းလိုက်ပါပြီ။");
}

function removeFavorite(videoId) {
  setFavorites((currentFavorites) =>
    currentFavorites.filter(
      (song) => song.id !== videoId
    )
  );

  setMessage("Favorites ထဲက ဖယ်လိုက်ပါပြီ။");
}

async function playFavoriteNow(video) {
  const saved = await savePlaybackState(video);

  if (!saved) {
    return;
  }

  sendCommand("LOAD_AND_PLAY", {
    video,
    queue: queueRef.current,
    index: -1
  });

  setMessage(
    "Favorite သီချင်းကို Now Playing အဖြစ် ဖွင့်လိုက်ပါပြီ။ Queue ကို မပြောင်းပါ။"
  );
}
function requestUsbSongs() {
  setUsbLoading(true);
  setMessage(
    "TV ထဲက USB သီချင်းစာရင်း ဖတ်နေပါသည်…"
  );

  window.clearTimeout(
    usbTransferTimeoutRef.current
  );

  usbTransferTimeoutRef.current =
    window.setTimeout(() => {
      setUsbLoading(false);
      usbChunksRef.current = [];
      usbReceivedChunksRef.current = new Set();
      usbTransferIdRef.current = null;
      usbExpectedChunksRef.current = 0;
      usbTransferTimeoutRef.current = null;

      setMessage(
        "TV မှ USB စာရင်း မရောက်လာပါ။ အရင် Cache ကို ဆက်သုံးနေပါသည်။"
      );
    }, 15000);

  sendCommand("REQUEST_USB_SONGS");
}
  async function addToQueue(
  video,
  playNow = false
) {
  const normalizedVideo =
    normalizeSongSource(video);

  if (!normalizedVideo?.id) {
    setMessage(
      "သီချင်းအချက်အလက် မပြည့်စုံပါ။"
    );
    return;
  }

  const alreadyCurrent =
    currentSongRef.current?.id ===
      normalizedVideo.id &&
    getSourceType(currentSongRef.current) ===
      normalizedVideo.sourceType;

  const alreadyQueued =
    queueRef.current.some(
      (item) =>
        item.id === normalizedVideo.id &&
        getSourceType(item) ===
          normalizedVideo.sourceType
    );

    if (alreadyCurrent || alreadyQueued) {
      setMessage("ဒီသီချင်းက Now Playing သို့မဟုတ် Queue ထဲမှာ ရှိပြီးသားပါ။");
      return;
    }

    if (playNow) {
      const saved = await savePlaybackState(
  normalizedVideo
);
      if (!saved) return;

      sendCommand("LOAD_AND_PLAY", {
  video: normalizedVideo,
  queue: queueRef.current,
  index: -1
});

      setMessage("TV ပေါ်မှာ ဖွင့်နေပါပြီ။");
      return;
    }

    if (!isSupabaseConfigured) {
      const next = [
  ...queueRef.current,
  {
    ...normalizedVideo,
    queueId:
      `${normalizedVideo.sourceType}-` +
      `${normalizedVideo.id}-` +
      `${Date.now()}`
  }
];

      queueRef.current = next;
      setQueue(next);
      sendCommand("SYNC_QUEUE", { queue: next, currentIndex: -1 });
      setMessage("Queue ထဲထည့်ပြီးပါပြီ။");
      return;
    }

    const { data: lastRows, error: lastError } = await supabase
      .from("karaoke_queue")
      .select("position")
          .eq("room_id", ROOM_ID)
      .order("position", { ascending: false })
      .limit(1);

    if (lastError) {
      setMessage(`Queue position ဖတ်မရပါ: ${lastError.message}`);
      return;
    }

    const position = lastRows?.length ? Number(lastRows[0].position) + 1 : 0;
    const { error } = await supabase
      .from("karaoke_queue")
      .insert(
  queueSongToRow(
    normalizedVideo,
    position
  )
);

    if (error) {
      setMessage(`Queue ထဲထည့်မရပါ: ${error.message}`);
      return;
    }

    await loadSharedQueue();
    sendCommand("SYNC_QUEUE", { queue: queueRef.current, currentIndex: -1 });
    setMessage("Queue ထဲထည့်ပြီးပါပြီ။");
  }

  async function handleVideoEnded() {
    if (repeatModeRef.current === "one" && currentSongRef.current) {
      sendCommand("LOAD_AND_PLAY", {
        video: currentSongRef.current,
        queue: queueRef.current,
        index: -1
      });
      return;
    }

    if (queueRef.current.length) {
      await playQueueIndex(0);
      return;
    }

    await savePlaybackState(null);
    sendCommand("STOP");
    setMessage("Queue ထဲက သီချင်းအားလုံး ပြီးပါပြီ။");
  }

  async function playQueueIndex(index) {
    const selected = queueRef.current[index];
    if (!selected) return;

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from("karaoke_queue")
        .delete()
        .eq("id", selected.dbId);

      if (error) {
        setMessage(`Queue item ဖယ်မရပါ: ${error.message}`);
        return;
      }

      await normalizeQueuePositions();
    }

    const saved = await savePlaybackState(selected);
    if (!saved) return;

    if (isSupabaseConfigured) {
      await loadSharedQueue();
    } else {
      const next = queueRef.current.filter((_, itemIndex) => itemIndex !== index);
      queueRef.current = next;
      setQueue(next);
    }

    sendCommand("LOAD_AND_PLAY", {
      video: selected,
      queue: queueRef.current,
      index: -1
    });
  }

  async function handleNext(fromTv = false) {
    if (queueRef.current.length) {
      await playQueueIndex(0);
      return;
    }

    await savePlaybackState(null);
    sendCommand("STOP");

    if (!fromTv) {
      setMessage("Queue ထဲက သီချင်းအားလုံး ပြီးပါပြီ။");
    }
  }
  async function handleStop() {
  await savePlaybackState(null);

  currentSongRef.current = null;
  setCurrentSong(null);

  sendCommand("STOP");

  setMessage("သီချင်းကို ရပ်လိုက်ပါပြီ။");
  }

  

  async function removeQueueItem(index) {
    const target = queueRef.current[index];
    if (!target) return;

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from("karaoke_queue")
        .delete()
        .eq("id", target.dbId);

      if (error) {
        setMessage(`Queue item ဖျက်မရပါ: ${error.message}`);
        return;
      }

      await normalizeQueuePositions();
      await loadSharedQueue();
    } else {
      const next = queueRef.current.filter((_, itemIndex) => itemIndex !== index);
      queueRef.current = next;
      setQueue(next);
    }

    sendCommand("SYNC_QUEUE", { queue: queueRef.current, currentIndex: -1 });
  }

  async function clearQueue() {
    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from("karaoke_queue")
        .delete()
        .eq("room_id", ROOM_ID);

      if (error) {
        setMessage(`Queue ရှင်းမရပါ: ${error.message}`);
        return;
      }
    }

    await savePlaybackState(null);

    queueRef.current = [];
    setQueue([]);
    setCurrentIndex(-1);
    currentIndexRef.current = -1;
    sendCommand("CLEAR_QUEUE");
    sendCommand("STOP");
    setMessage("Queue နဲ့ Now Playing ကိုရှင်းပြီး TV ကိုရပ်လိုက်ပါပြီ။");
  }

  async function shuffleQueue() {
    const songs = [...queueRef.current];
    if (songs.length < 2) return;

    const currentDbId = songs[currentIndexRef.current]?.dbId;

    for (let i = songs.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [songs[i], songs[j]] = [songs[j], songs[i]];
    }

    if (isSupabaseConfigured) {
      const updates = await Promise.all(
        songs.map((song, index) =>
          supabase
            .from("karaoke_queue")
            .update({ position: index })
            .eq("id", song.dbId)
        )
      );

      const failed = updates.find((result) => result.error);
      if (failed?.error) {
        setMessage(`Shuffle sync မရပါ: ${failed.error.message}`);
        return;
      }

      await loadSharedQueue();
    } else {
      const nextIndex = currentDbId
        ? songs.findIndex((song) => song.dbId === currentDbId)
        : -1;

      queueRef.current = songs;
      currentIndexRef.current = nextIndex;
      setQueue(songs);
      setCurrentIndex(nextIndex);
    }

    sendCommand("SYNC_QUEUE", {
      queue: queueRef.current,
      currentIndex: -1
    });
  }

  async function reorderQueue(from, to) {
    if (
      from === null ||
      from === to ||
      from < 0 ||
      to < 0 ||
      !queueRef.current[from] ||
      !queueRef.current[to]
    ) {
      return;
    }

    const songs = [...queueRef.current];
    const [moved] = songs.splice(from, 1);
    songs.splice(to, 0, moved);

    if (isSupabaseConfigured) {
      const updates = await Promise.all(
        songs.map((song, index) =>
          supabase
            .from("karaoke_queue")
            .update({ position: index })
            .eq("id", song.dbId)
        )
      );

      const failed = updates.find((result) => result.error);
      if (failed?.error) {
        setMessage(`Queue အစဉ်ပြောင်းမရပါ: ${failed.error.message}`);
        return;
      }

      await loadSharedQueue();
    } else {
      const currentQueueId = queueRef.current[currentIndexRef.current]?.queueId;
      const nextIndex = currentQueueId
        ? songs.findIndex((song) => song.queueId === currentQueueId)
        : -1;

      queueRef.current = songs;
      currentIndexRef.current = nextIndex;
      setQueue(songs);
      setCurrentIndex(nextIndex);
    }

    sendCommand("SYNC_QUEUE", {
      queue: queueRef.current,
      currentIndex: -1
    });
  }

  async function saveArtist(form) {
    const existing = artistModal.artist;
    const localRecord = {
      ...form,
      id: existing?.id || `local-${crypto.randomUUID?.() || Date.now()}`,
      is_base: false
    };

    if (isSupabaseConfigured) {
      const dbPayload = {
        letter: form.letter,
        display_name: form.display_name,
        myanmar_name: form.myanmar_name,
        english_name: form.english_name,
        artist_type: form.artist_type,
        gender: form.gender,
        search_keys: form.search_keys,
        youtube_keyword: form.youtube_keyword
      };
      const queryBuilder = existing?.id && !String(existing.id).startsWith("local-")
        ? supabase.from("karaoke_artists").update(dbPayload).eq("id", existing.id).select().single()
        : supabase.from("karaoke_artists").insert(dbPayload).select().single();
      const { data, error } = await queryBuilder;
      if (error) {
        setMessage(`Supabase save မရပါ: ${error.message}. Local မှာ သိမ်းထားပါတယ်။`);
      } else {
        localRecord.id = data.id;
      }
    }

    setCustomArtists((previous) => {
      const without = previous.filter((artist) => artist.id !== existing?.id);
      return [...without, localRecord];
    });
    setArtistModal({ open: false, artist: null });
  }

  async function deleteArtist(artist) {
    if (artist.is_base) {
      setMessage("မူလ CSV အဆိုတော်ကို မဖျက်နိုင်ပါ။ Copy/Edit လုပ်ပြီး အသစ်ထည့်နိုင်ပါတယ်။");
      return;
    }
    if (!window.confirm(`${artist.display_name} ကို ဖျက်မလား?`)) return;
    if (isSupabaseConfigured && !String(artist.id).startsWith("local-")) {
      await supabase.from("karaoke_artists").delete().eq("id", artist.id);
    }
    setCustomArtists((previous) => previous.filter((item) => item.id !== artist.id));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-line">
  <span className="brand-name">Khin Thuzar Hlaing's</span>
  <span className="brand-title">HOME KARAOKE 🎤</span>
</div>
        <div className={`connection ${connected ? "online" : "offline"}`}>
          <span />{connected ? "TVကို ချိတ်ဆက်နေသည်။" : "TV Offline"}
        </div>
      </header>

      <main>
        <section className="hero-card">
  <div>
    <p className="eyebrow">NOW SINGING</p>

    <div className="now-singing-title">
      {currentSong && (
        <span
          className="now-playing-bars"
          aria-hidden="true"
        >
          <i></i>
          <i></i>
          <i></i>
          <i></i>
          <i></i>
        </span>
      )}

      <h2>
        {currentSong?.title || "သီချင်းရွေးပါ"}
      </h2>
    </div>

    <p>
      {currentSong?.channel ||
        "Remote မှာရှာပြီး TV ပေါ်ဖွင့်ပါ"}
    </p>
    <div className={`status-message ${message ? "has-message" : "standby"}`}>
  {message ? (
    <span>{message}</span>
  ) : (
    <span className="rainbow-text">
      ရွှင်လန်းချမ်းမြေ့ပါစေ။
    </span>
  )}
</div>
  </div>

  <div className="hero-next">
    <span>NEXT</span>

    <strong>
      {nextSong?.title || "Queue empty"}
    </strong>
  </div>
</section>

        <section className="control-deck">
          <button
  type="button"
  onClick={() => {
    sendCommand("REQUEST_TV_STATE");
    setMessage("TV နဲ့ Remote ကို Adjust လုပ်နေပါသည်…");
  }}
>
  🔄<span>Adjust</span>
</button>
          <button onClick={showPopup}>
  🙋
</button>
          
          <button
  type="button"
  onClick={openTextPopupPage}
  aria-label="Open announcement page"
>
  💬
</button>
          
          <button
  type="button"
  onClick={() => {
    if (!currentSong) {
      setMessage("ပြန်ဆိုရန် သီချင်းမရှိသေးပါ။");
      return;
    }

    sendCommand("RE_SING");
    setMessage("သီချင်းကို အစကနေ ပြန်ဆိုလိုက်ပါပြီ။");
  }}
>
  🔄<span>Re-Sing</span>
</button>
          <button
  onClick={() => {
    sendCommand("PAUSE");
    setMessage("သီချင်းကို ခဏရပ်လိုက်ပါပြီ။");
  }}
>
  ⏸<span>Pause</span>
</button>
          <button className="play-main" onClick={() => currentSong ? sendCommand("PLAY") : queue.length && playQueueIndex(0)}>▶<span>Play</span></button>
          <button onClick={handleNext}>⏭<span>Next</span></button>
          <button onClick={handleStop}>
  ⏹<span>Stop</span>
</button>
          <button onClick={() => sendCommand("VOLUME_DOWN")}>
  🔉
  <span>Vol −</span>
</button>

<button onClick={() => sendCommand("TOGGLE_MUTE")}>
  🔇
  <span>Mute</span>
</button>

<button onClick={() => sendCommand("VOLUME_UP")}>
  🔊
  <span>Vol +</span>
</button>
        </section>
        <div className="scenery-controls">
  <button
    type="button"
    className={
      sceneryActive
        ? "scenery-start-button active"
        : "scenery-start-button"
    }
    onClick={startSceneryShow}
  >
    🖼️ SCENERY START
  </button>

  <button
    type="button"
    className={
      !sceneryActive
        ? "scenery-stop-button active"
        : "scenery-stop-button"
    }
    onClick={stopSceneryShow}
  >
    ⏹ STOP
  </button>
</div>

        <nav className="tabs">
          <button
  className={`search-tab ${tab === "search" ? "active" : ""}`}
  onClick={() => setTab("search")}
>
  🔎 Search
</button>
          <button
  className={
    tab === "usb" ? "active" : ""
  }
  onClick={() => setTab("usb")}
>
  💾 USB
</button>
          <button className={tab === "artists" ? "active" : ""} onClick={() => setTab("artists")}>🎙 Artists</button>
          <button
  className={tab === "favorites" ? "active" : ""}
  onClick={() => setTab("favorites")}
>
  ⭐ Favorites <b>{favorites.length}</b>
</button>
          <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>🎶 Queue <b>{queue.length}</b></button>
          <button
  className={
    tab === "settings"
      ? "active"
      : ""
  }
  onClick={() =>
    setTab("settings")
  }
>
  ⚙️ Settings
</button>
        </nav>

         {tab === "settings" && (
  <section className="panel settings-panel">
    <div className="section-heading">
      <div>
        <p className="eyebrow">
          REMOTE SETTINGS
        </p>

        <h2>
           API SETTING 
        </h2>
      </div>
    </div>

    <p className="settings-description">
      Search မှာ သုံးမယ့် API ကို ရွေးပါ။
      ရွေးပြီးတာနဲ့ Search နှိပ်ပြီး သီချင်းရှာမယ်။
    </p>

    <div className="api-choice-grid">
      {["1", "2", "3"].map(
        (choice) => {
          const available =
            Boolean(
              YOUTUBE_API_KEYS[
                choice
              ]
            );

          const selected =
            youtubeApiChoice ===
            choice;

          return (
            <button
              type="button"
              key={choice}
              className={`api-choice-button ${
                selected
                  ? "selected"
                  : ""
              }`}
              onClick={() =>
                selectYouTubeApi(
                  choice
                )
              }
              disabled={!available}
            >
              <strong>
                API {choice}
              </strong>

              <span>
                {selected
                  ? "အသုံးပြုနေသည်"
                  : available
                    ? "ရွေးရန်"
                    : "Key မရှိသေး"}
              </span>
            </button>
          );
        }
      )}
    </div>

    <div className="current-api-status">
      လက်ရှိအသုံးပြုနေသည်:
      <strong>
        API {youtubeApiChoice}
      </strong>
    </div>
  </section>
)}
{tab === "popup" && (
  <section className="panel popup-send-page">
    <div className="popup-page-header">
      <button
        type="button"
        className="button ghost"
        onClick={() => {
          setPopupText("");
          setTab(returnTab);
        }}
      >
        ← Back
      </button>

      <div>
        <p className="eyebrow">
          TV ANNOUNCEMENT
        </p>

        <div className="popup-title-row">
  <h2>စာပို့ရန်</h2>

  <button
    type="button"
    className={`fake-go-button ${goFlash === "popup" ? "active" : ""}`}
    onClick={() => flashGo("popup")}
  >
    {goFlash === "popup" ? "Go" : "➜"}
  </button>
</div>
      </div>
    </div>

    <textarea
      className="popup-text-input"
      value={popupText}
      onChange={(event) =>
        setPopupText(event.target.value)
      }
      placeholder="TV မှာပြချင်တဲ့စာကို ရိုက်ပါ"
      rows={7}
      maxLength={250}
      autoFocus
    />

    <div className="popup-character-count">
      {popupText.length} / 250
    </div>

    <label className="popup-duration-field">
      <span>ပြမယ့်ကြာချိန်</span>

      <select
        value={popupDuration}
        onChange={(event) =>
          setPopupDuration(
            Number(event.target.value)
          )
        }
      >
        <option value={4}>
          4 Seconds
        </option>

        <option value={300}>
          5 Minutes
        </option>

        <option value={1800}>
          30 Minutes
        </option>

        <option value={3600}>
          1 Hour
        </option>

        <option value={18000}>
          5 Hours
        </option>
      </select>
    </label>

    <button
      type="button"
      className="button primary popup-send-button"
      onClick={sendTextPopup}
      disabled={!popupText.trim()}
    >
      Send to TV
    </button>
  </section>
)}
        {tab === "usb" && (
  <section className="panel">
    <div className="section-heading">
      <div>
        <p className="eyebrow">
          USB STORAGE
        </p>

        <h2>USB Songs</h2>
      </div>

      <button
        type="button"
        className="button ghost"
        onClick={requestUsbSongs}
        disabled={usbLoading}
      >
        {usbLoading
          ? "Loading…"
          : "🔄 Refresh"}
      </button>
    </div>
    <div className="usb-search-row">
  <input
    type="search"
    value={usbQuery}
    onChange={(event) =>
      setUsbQuery(event.target.value)
    }
    placeholder="USB သီချင်းရှာရန်"
  />
     <button
  type="button"
  className="fake-go-button"
  onClick={() => {
    setUsbSearchQuery(usbQuery);
  }}
>
  🔍 Search
</button>

  {usbQuery && (
    <button
      type="button"
      className="button ghost"
      onClick={() => {
  setUsbQuery("");
  setUsbSearchQuery("");
}}
    >
      ✕
    </button>
  )}
</div>
    
    <div className="video-grid">
      {filteredUsbSongs.map((song) => {
        const isNowPlaying =
          currentSong?.id === song.id &&
          getSourceType(currentSong) ===
            "usb";

        const isInQueue = queue.some(
          (item) =>
            item.id === song.id &&
            getSourceType(item) === "usb"
        );

        return (
          <article
  className="video-card usb-video-card"
  key={song.id}
>
            <img
  src={song.thumbnail || "/usb-default.png"}
  alt={song.title || "USB Karaoke"}
/>
            <div className="video-card-body">
              <h3>{song.title}</h3>

              <p>
                {song.channel ||
                  "USB Storage"}
              </p>

              <div className="card-actions">
                {!currentSong && (
                  <button
                    className="button primary"
                    onClick={() =>
                      addToQueue(song, true)
                    }
                    disabled={isInQueue}
                  >
                    {isInQueue
                      ? "✓ IN QUEUE"
                      : "▶ Play"}
                  </button>
                )}

                <button
                  className="button ghost"
                  onClick={() =>
                    addToQueue(song)
                  }
                  disabled={
                    isNowPlaying ||
                    isInQueue
                  }
                >
                  {isNowPlaying
                    ? "🎵 NOW PLAYING"
                    : isInQueue
                      ? "✓ IN QUEUE"
                      : "+ Queue"}
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>

    {!usbLoading &&
  filteredUsbSongs.length === 0 && (
        <div className="empty-state">
          <span>💾</span>

          <h3>
  {usbSearchQuery
    ? "ရှာတဲ့စာနဲ့ ကိုက်ညီတဲ့ သီချင်းမတွေ့ပါ"
    : "USB သီချင်း မရှိသေးပါ"}
</h3>

<p>
  {usbSearchQuery
    ? "အခြားစာလုံးနဲ့ ပြန်ရှာပါ။"
    : "USB ကို TV မှာတပ်ပြီး Refresh နှိပ်ပါ။"}
</p>
        </div>
      )}
  </section>
)}
       
        {tab === "search" && (
          <section className="panel">
            <div className="search-row">
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder="သီချင်း သို့မဟုတ် အဆိုတော်နာမည် ရိုက်ပါ" />
              
              <button className="button primary" onClick={() => runSearch()} disabled={searching}>{searching ? "Searching…" : "Search"}</button>
              <button
  className="button voice-button"
  onClick={startVoiceSearch}
>
  🎤
</button>
            </div>
            <div className="video-grid">
              {results.map((video) => {
  const sourceType =
    video.sourceType || getSourceType(video);

  const isUsb = sourceType === "usb";

  const isNowPlaying =
    currentSong?.id === video.id &&
    getSourceType(currentSong) === sourceType;

  const isInQueue = queue.some(
    (item) =>
      item.id === video.id &&
      getSourceType(item) === sourceType
  );

  const videoIsFavorite =
    !isUsb && isFavorite(video.id);

                return (
                  <article className="video-card" key={video.id}>
                    <img
  src={isUsb ? "/usb-default.png" : video.thumbnail}
  alt={video.title || ""}
/>

                    <div className="video-card-body">
  <div className="result-source-row">
    <span
      className={
        isUsb
          ? "result-source-badge usb"
          : "result-source-badge tube"
      }
    >
      {isUsb ? "USB" : "TUBE"}
    </span>
  </div>

  <h3>{video.title}</h3>
  <p>
    {video.channel ||
      (isUsb ? "USB Storage" : "YouTube")}
  </p>

                  <div className="card-actions">
                        {!currentSong && (
                          <button
                            className="button primary"
                            onClick={() => addToQueue(video, true)}
                            disabled={isInQueue}
                          >
                            {isInQueue ? "✓ IN QUEUE" : "▶ Play"}
                          </button>
                        )}

                        <button
  className="button ghost"
  onClick={() => addToQueue(video)}
  disabled={isNowPlaying || isInQueue}
>
  {isNowPlaying
    ? "🎵 NOW PLAYING"
    : isInQueue
      ? "✓ IN QUEUE"
      : "+ Queue"}
</button>

{!isUsb && (
  <button
    type="button"
    className={
      videoIsFavorite
        ? "favorite-button is-favorite"
        : "favorite-button"
    }
    onClick={() => toggleFavorite(video)}
  >
    <span className="favorite-star">
      {videoIsFavorite ? "★" : "☆"}
    </span>

    <span>
      {videoIsFavorite ? "Saved" : "Favorite"}
    </span>
  </button>
)}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {!results.length && <div className="empty-state"><span>🎤</span><h3>သီချင်းရှာရန်အသင့်</h3><p>ခင်သူဇာလှိုင်၏ HOME KARAOKE မှ လှိုက်လဲစွာ ကြိုဆိုပါသည်။</p></div>}
          </section>
        )}

        {tab === "artists" && (
          <section className="panel">
            <div className="section-heading">
              <div><p className="eyebrow">{baseArtists.length + customArtists.length} ARTISTS</p><h2>အဆိုတော်စာရင်း</h2></div>
              <button className="button primary" onClick={() => setArtistModal({ open: true, artist: null })}>＋ Add Artist</button>
            </div>
            

  <div className="usb-search-row">
  <input
    type="search"
    value={artistQuery}
    onChange={(e) => setArtistQuery(e.target.value)}
    placeholder="အဆိုတော်နာမည်ရှာရန်"
  />

  <button
    type="button"
    className={`fake-go-button ${goFlash === "artist" ? "active" : ""}`}
    onClick={() => flashGo("artist")}
  >
    {goFlash === "artist" ? "Go" : "➜"}
  </button>

  {artistQuery && (
    <button
      type="button"
      className="button ghost"
      onClick={() => setArtistQuery("")}
    >
      ✕
    </button>
  )}
</div>
            <div className="letter-strip">{letters.map((letter) => <button key={letter} className={selectedLetter === letter ? "active" : ""} onClick={() => setSelectedLetter(letter)}>{letter}</button>)}</div>
            <div className="artist-grid">
              {artists.map((artist) => (
                <article className="artist-card" key={artist.id}>
                  <button className="artist-main" onClick={() => runSearch(artist.youtube_keyword || artist.display_name)}>
                    <span className="artist-avatar">{artist.display_name.charAt(0)}</span>
                    <span><strong>{artist.display_name}</strong><small>{artist.english_name || artist.artist_type}</small></span>
                  </button>
                  <div className="artist-tools">
                    {!artist.is_base && <button onClick={() => setArtistModal({ open: true, artist })}>✎</button>}
                    {!artist.is_base && <button onClick={() => deleteArtist(artist)}>🗑</button>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        {tab === "favorites" && (
  <section className="panel favorites-panel">
    <div className="section-heading">
      <div>
        <p className="eyebrow">
          {favorites.length} / {MAX_FAVORITES} SONGS
        </p>

        <h2>⭐ အကြိုက်ဆုံးသီချင်းများ</h2>
      </div>
    </div>

    <p className="favorites-description">
      သီချင်းကိုနှိပ်လျှင် Queue ထဲမထည့်ဘဲ
      Now Playing အဖြစ် ချက်ချင်းဖွင့်ပါမည်။
    </p>

    <div className="favorites-list">
      {favorites.map((favorite, index) => (
        <article
          className="favorite-item"
          key={favorite.id}
        >
          <span className="favorite-number">
            {index + 1}
          </span>

          <img
            src={favorite.thumbnail}
            alt=""
          />

          <button
            type="button"
            className="favorite-song"
            onClick={() =>
              playFavoriteNow(favorite)
            }
          >
            <strong>{favorite.title}</strong>
            <small>{favorite.channel}</small>
          </button>

          <button
            type="button"
            className="favorite-play-button"
            onClick={() =>
              playFavoriteNow(favorite)
            }
            aria-label="Play favorite now"
          >
            ▶
          </button>

          <button
            type="button"
            className="icon-button favorite-remove-button"
            onClick={() =>
              removeFavorite(favorite.id)
            }
            aria-label="Remove favorite"
          >
            ✕
          </button>
        </article>
      ))}

      {!favorites.length && (
        <div className="empty-state">
          <span>⭐</span>
          <h3>Favorite သီချင်းမရှိသေးပါ</h3>
          <p>
            Search မှာ သီချင်းဘေးက Favorite
            ခလုတ်ကိုနှိပ်ပြီး သိမ်းပါ။
          </p>
        </div>
      )}
    </div>
  </section>
)}

        {tab === "queue" && (
          <section className="panel">
            <div className="section-heading">
              <div><p className="eyebrow">PLAYLIST CONTROL</p><h2>Queue</h2></div>
              <div className="queue-tools">
                <button className="button ghost" onClick={shuffleQueue}>🔀 Shuffle</button>
                <button
                  className="button ghost"
                  onClick={() =>
                    setRepeatMode((mode) => {
                      const nextMode =
                        mode === "off"
                          ? "one"
                          : mode === "one"
                            ? "all"
                            : "off";

                      repeatModeRef.current = nextMode;
                      return nextMode;
                    })
                  }
                >
                  🔁 {repeatMode}
                </button>
                <button className="button danger" onClick={clearQueue}>Clear</button>
              </div>
            </div>
            <div className="queue-list">
              {queue.map((song, index) => (
                <article
                  key={song.queueId}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { reorderQueue(dragIndex, index); setDragIndex(null); }}
                  className="queue-item"
                >
                  <span className="drag">⋮⋮</span><span className="queue-number">{index + 1}</span>
                  {song.thumbnail ? (
  <img src={song.thumbnail} alt="" />
) : (
  <div className="queue-placeholder">💾</div>
)}
                  <button className="queue-song" onClick={() => playQueueIndex(index)}><strong>{song.title}</strong><small>{song.channel}</small></button>
                  <button className="icon-button" onClick={() => removeQueueItem(index)}>✕</button>
                </article>
              ))}
              {!queue.length && <div className="empty-state"><span>🎶</span><h3>Queue မရှိသေးပါ</h3><p>Search သို့မဟုတ် Artist စာရင်းကနေ သီချင်းထည့်ပါ။</p></div>}
            </div>
          </section>
        )}
      </main>

      <ArtistModal open={artistModal.open} artist={artistModal.artist} onClose={() => setArtistModal({ open: false, artist: null })} onSave={saveArtist} />

      <button
        type="button"
        className="scroll-top-button"
        onClick={() =>
          window.scrollTo({
            top: 0,
            behavior: "smooth"
          })
        }
        aria-label="Back to top"
      >
        ↑
      </button>
    </div>
  );
}
