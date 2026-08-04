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


function queueRowToSong(row) {
  return {
    id: row.video_id,
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
    title: row.current_title || "",
    channel: row.current_channel || "",
    thumbnail: row.current_thumbnail || ""
  };
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");
  const [baseArtists, setBaseArtists] = useState([]);
  const [customArtists, setCustomArtists] = useState(() => loadLocal(LOCAL_ARTISTS_KEY, []));
  const [artistQuery, setArtistQuery] = useState("");
  const [selectedLetter, setSelectedLetter] = useState("ALL");
  const [artistModal, setArtistModal] = useState({ open: false, artist: null });
  const [queue, setQueue] = useState(() => loadLocal(LOCAL_QUEUE_KEY, []));
  const [currentSong, setCurrentSong] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [repeatMode, setRepeatMode] = useState("off");
  const [connected, setConnected] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const channelRef = useRef(null);
  const queueChannelRef = useRef(null);
  const stateChannelRef = useRef(null);
  const queueRef = useRef(queue);
  const currentSongRef = useRef(currentSong);
  const currentIndexRef = useRef(currentIndex);
  const repeatModeRef = useRef(repeatMode);
  const queueReloadTimerRef = useRef(null);
  const stateReloadTimerRef = useRef(null);

  const nextSong = queue[0] || null;

  const sendCommand = useCallback(async (type, payload = {}) => {
    const packet = { type, payload, sentAt: new Date().toISOString() };
    if (!channelRef.current) {
      setMessage("TV connection မရသေးပါ။ Supabase settings စစ်ပါ။");
      return;
    }
    await channelRef.current.send({ type: "broadcast", event: "karaoke-command", payload: packet });
  }, []);
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
    `YouTube API ${choice} ကို ရွေးထားပါပြီ။`
  );
  }
  const showPopup = useCallback(() => {
  sendCommand("SHOW_POPUP");
}, [sendCommand]);

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
      .on("broadcast", { event: "tv-status" }, ({ payload }) => {
        if (payload?.type === "READY") setConnected(true);
        if (payload?.type === "VIDEO_ENDED") {
          loadSharedQueue();
          loadPlaybackState();
        }
      })
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    channelRef.current = channel;

    return () => {
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

    // Search နှိပ်တာနဲ့ input ကို ချက်ချင်းရှင်းမယ်။
    setQuery("");
    setSearching(true);
    setMessage("");
    setTab("search");
    try {
  if (!selectedYouTubeApiKey) {
    throw new Error(
      `YouTube API ${youtubeApiChoice} key မရှိပါ။`
    );
  }

  setResults(
    await searchYouTube(
      text,
      selectedYouTubeApiKey
    )
  );
} catch (error) {
  setMessage(error.message);
} finally {
  setSearching(false);
}
  }

  async function addToQueue(video, playNow = false) {
    const alreadyCurrent = currentSongRef.current?.id === video.id;
    const alreadyQueued = queueRef.current.some((item) => item.id === video.id);

    if (alreadyCurrent || alreadyQueued) {
      setMessage("ဒီသီချင်းက Now Playing သို့မဟုတ် Queue ထဲမှာ ရှိပြီးသားပါ။");
      return;
    }

    if (playNow) {
      const saved = await savePlaybackState(video);
      if (!saved) return;

      sendCommand("LOAD_AND_PLAY", {
        video,
        queue: queueRef.current,
        index: -1
      });

      setMessage("TV ပေါ်မှာ ဖွင့်လိုက်ပါပြီ။");
      return;
    }

    if (!isSupabaseConfigured) {
      const next = [
        ...queueRef.current,
        { ...video, queueId: `${video.id}-${Date.now()}` }
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
      .insert(queueSongToRow(video, position));

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

  function handlePrevious() {
    setMessage("Now Playing ကို Queue ပြင်ပမှာထားတဲ့အတွက် Previous history မရှိသေးပါ။");
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
        <div>
          <p className="eyebrow">Khin Thuzar Hlaing's</p>
          <h1>HOME KARAOKE <span>🎤</span></h1>
        </div>
        <div className={`connection ${connected ? "online" : "offline"}`}>
          <span />{connected ? "TV Connected" : "TV Offline"}
        </div>
      </header>

      <main>
        <section className="hero-card">
          <div>
            <p className="eyebrow">NOW SINGING</p>
            <h2>{currentSong?.title || "သီချင်းရွေးပါ"}</h2>
            <p>{currentSong?.channel || "Remote မှာရှာပြီး TV ပေါ်ဖွင့်ပါ"}</p>
          </div>
          <div className="hero-next"><span>NEXT</span><strong>{nextSong?.title || "Queue empty"}</strong></div>
        </section>

        <section className="control-deck">
          <button onClick={showPopup}>
  🙋
</button>
          <button onClick={handlePrevious}>⏮<span>Previous</span></button>
          <button onClick={() => sendCommand("PAUSE")}>⏸<span>Pause</span></button>
          <button className="play-main" onClick={() => currentSong ? sendCommand("PLAY") : queue.length && playQueueIndex(0)}>▶<span>Play</span></button>
          <button onClick={handleNext}>⏭<span>Next</span></button>
          <button onClick={() => sendCommand("STOP")}>⏹<span>Stop</span></button>
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

        <nav className="tabs">
          <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>🔎 Search</button>
          <button className={tab === "artists" ? "active" : ""} onClick={() => setTab("artists")}>🎙 Artists</button>
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

        {message && <div className="notice" onClick={() => setMessage("")}>{message}</div>}
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

        {tab === "search" && (
          <section className="panel">
            <div className="search-row">
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder="သီချင်း သို့မဟုတ် အဆိုတော်နာမည် ရိုက်ပါ" />
              <button className="button primary" onClick={() => runSearch()} disabled={searching}>{searching ? "Searching…" : "Search"}</button>
            </div>
            <div className="video-grid">
              {results.map((video) => {
                const isNowPlaying = currentSong?.id === video.id;
                const isInQueue = queue.some((item) => item.id === video.id);

                return (
                  <article className="video-card" key={video.id}>
                    <img src={video.thumbnail} alt="" />

                    <div className="video-card-body">
                      <h3>{video.title}</h3>
                      <p>{video.channel}</p>

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
                              : "＋ Queue"}
                        </button>
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
            <input className="artist-search" value={artistQuery} onChange={(e) => setArtistQuery(e.target.value)} placeholder="အဆိုတော်နာမည်ရှာရန်" />
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
                  <img src={song.thumbnail} alt="" />
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
