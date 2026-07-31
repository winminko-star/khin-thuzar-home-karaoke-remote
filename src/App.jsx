import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import ArtistModal from "./components/ArtistModal";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { searchYouTube } from "./lib/youtube";

const ROOM_ID = import.meta.env.VITE_KARAOKE_ROOM_ID || "wmk-home-karaoke";
const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || "";
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

export default function App() {
  const [tab, setTab] = useState("search");
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
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [repeatMode, setRepeatMode] = useState("off");
  const [connected, setConnected] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const channelRef = useRef(null);

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;
  const nextSong = queue.length ? queue[(currentIndex + 1) % queue.length] : null;

  const sendCommand = useCallback(async (type, payload = {}) => {
    const packet = { type, payload, sentAt: new Date().toISOString() };
    if (!channelRef.current) {
      setMessage("TV connection မရသေးပါ။ Supabase settings စစ်ပါ။");
      return;
    }
    await channelRef.current.send({ type: "broadcast", event: "karaoke-command", payload: packet });
  }, []);

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
  }, [queue]);

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
        if (payload?.type === "VIDEO_ENDED") handleNext(true);
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

  // Search နှိပ်တာနဲ့ input ကို ချက်ချင်းရှင်းမယ်
  setQuery("");

  setSearching(true);
  setMessage("");
  setTab("search");

  try {
    const searchResults = await searchYouTube(
      text,
      YOUTUBE_API_KEY
    );

    setResults(searchResults);
  } catch (error) {
    setMessage(error.message);
  } finally {
    setSearching(false);
  }
  }

  function addToQueue(video, playNow = false) {
    setQueue((previous) => {
      const next = [...previous, { ...video, queueId: `${video.id}-${Date.now()}` }];
      if (playNow) {
        const index = next.length - 1;
        setCurrentIndex(index);
        sendCommand("LOAD_AND_PLAY", { video: next[index], queue: next, index });
      } else {
        sendCommand("SYNC_QUEUE", { queue: next, currentIndex });
      }
      return next;
    });
    setMessage(playNow ? "TV ပေါ်မှာ ဖွင့်လိုက်ပါပြီ။" : "Queue ထဲထည့်ပြီးပါပြီ။");
  }

  function playQueueIndex(index) {
    if (!queue[index]) return;
    setCurrentIndex(index);
    sendCommand("LOAD_AND_PLAY", { video: queue[index], queue, index });
  }

  function handleNext(fromTv = false) {
    if (!queue.length) return;
    if (repeatMode === "one" && currentIndex >= 0) {
      playQueueIndex(currentIndex);
      return;
    }
    const candidate = currentIndex + 1;
    if (candidate < queue.length) playQueueIndex(candidate);
    else if (repeatMode === "all") playQueueIndex(0);
    else if (!fromTv) setMessage("Queue အဆုံးရောက်ပါပြီ။");
  }

  function handlePrevious() {
    if (!queue.length) return;
    playQueueIndex(Math.max(0, currentIndex - 1));
  }

  function removeQueueItem(index) {
    setQueue((previous) => {
      const next = previous.filter((_, itemIndex) => itemIndex !== index);
      let nextIndex = currentIndex;
      if (index < currentIndex) nextIndex -= 1;
      if (index === currentIndex) nextIndex = -1;
      setCurrentIndex(nextIndex);
      sendCommand("SYNC_QUEUE", { queue: next, currentIndex: nextIndex });
      return next;
    });
  }

  function clearQueue() {
    setQueue([]);
    setCurrentIndex(-1);
    sendCommand("CLEAR_QUEUE");
  }

  function shuffleQueue() {
    setQueue((previous) => {
      const next = [...previous];
      for (let i = next.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      setCurrentIndex(-1);
      sendCommand("SYNC_QUEUE", { queue: next, currentIndex: -1 });
      return next;
    });
  }

  function reorderQueue(from, to) {
    if (from === null || from === to) return;
    setQueue((previous) => {
      const next = [...previous];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      let nextIndex = currentIndex;
      if (currentIndex === from) nextIndex = to;
      setCurrentIndex(nextIndex);
      sendCommand("SYNC_QUEUE", { queue: next, currentIndex: nextIndex });
      return next;
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
          <button onClick={handlePrevious}>⏮<span>Previous</span></button>
          <button onClick={() => sendCommand("PAUSE")}>⏸<span>Pause</span></button>
          <button className="play-main" onClick={() => currentSong ? sendCommand("PLAY") : queue.length && playQueueIndex(0)}>▶<span>Play</span></button>
          <button onClick={handleNext}>⏭<span>Next</span></button>
          <button onClick={() => sendCommand("STOP")}>⏹<span>Stop</span></button>
        </section>

        <nav className="tabs">
          <button className={tab === "search" ? "active" : ""} onClick={() => setTab("search")}>🔎 Search</button>
          <button className={tab === "artists" ? "active" : ""} onClick={() => setTab("artists")}>🎙 Artists</button>
          <button className={tab === "queue" ? "active" : ""} onClick={() => setTab("queue")}>🎶 Queue <b>{queue.length}</b></button>
        </nav>

        {message && <div className="notice" onClick={() => setMessage("")}>{message}</div>}

        {tab === "search" && (
          <section className="panel">
            <div className="search-row">
              <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSearch()} placeholder="သီချင်း သို့မဟုတ် အဆိုတော်နာမည် ရိုက်ပါ" />
              <button className="button primary" onClick={() => runSearch()} disabled={searching}>{searching ? "Searching…" : "Search"}</button>
            </div>
            <div className="video-grid">
              {results.map((video) => (
                <article className="video-card" key={video.id}>
                  <img src={video.thumbnail} alt="" />
                  <div className="video-card-body">
                    <h3>{video.title}</h3><p>{video.channel}</p>
                    <div className="card-actions">
                      <button className="button primary" onClick={() => addToQueue(video, true)}>▶ Play</button>
                      <button className="button ghost" onClick={() => addToQueue(video)}>＋ Queue</button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {!results.length && <div className="empty-state"><span>🎤</span><h3>သီချင်းရှာရန်အသင့်</h3><p>မြန်မာနှင့် English karaoke keyword နှစ်မျိုးလုံး အလိုအလျောက်ရှာမယ်။</p></div>}
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
                <button className="button ghost" onClick={() => setRepeatMode((mode) => mode === "off" ? "one" : mode === "one" ? "all" : "off")}>🔁 {repeatMode}</button>
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
                  className={`queue-item ${index === currentIndex ? "playing" : ""}`}
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
    </div>
  );
}
