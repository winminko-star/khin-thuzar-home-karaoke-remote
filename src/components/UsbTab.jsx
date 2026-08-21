import {
  memo,
  useEffect,
  useRef,
  useState
} from "react";

const PAGE_SIZE = 50;

function UsbTab({
  usbLoading,
  requestUsbSongs,
  usbQuery,
  setUsbQuery,
  setUsbSearchQuery,
  usbSearchQuery,
  filteredUsbSongs,
  currentSong,
  queue,
  getSourceType,
  addToQueue
}) {
  const [visibleCount, setVisibleCount] =
    useState(PAGE_SIZE);

  const loadMoreRef = useRef(null);

  // Search/result ပြောင်းတိုင်း
  // ပထမ 50 ပုဒ်ကနေ ပြန်စ
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [
    usbSearchQuery,
    filteredUsbSongs
  ]);

  // အောက်နားရောက်ရင်
  // နောက်ထပ် 50 ပုဒ်တိုး
  useEffect(() => {
    const target =
      loadMoreRef.current;

    if (!target) return;

    const observer =
      new IntersectionObserver(
        (entries) => {
          if (
            entries[0]?.isIntersecting
          ) {
            setVisibleCount(
              (current) =>
                Math.min(
                  current +
                    PAGE_SIZE,
                  filteredUsbSongs.length
                )
            );
          }
        },
        {
          root: null,
          rootMargin: "300px",
          threshold: 0
        }
      );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [filteredUsbSongs.length]);

  const visibleSongs =
    filteredUsbSongs.slice(
      0,
      visibleCount
    );

  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            USB STORAGE
          </p>

          <h2>
            USB Songs
          </h2>
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
            setUsbQuery(
              event.target.value
            )
          }
          placeholder="USB သီချင်းရှာရန်"
        />

        <button
          type="button"
          className="fake-go-button"
          onClick={() =>
            setUsbSearchQuery(
              usbQuery
            )
          }
        >
          🔍
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
        {visibleSongs.map(
          (song) => {
            const isNowPlaying =
              currentSong?.id ===
                song.id &&
              getSourceType(
                currentSong
              ) === "usb";

            const isInQueue =
              queue.some(
                (item) =>
                  item.id ===
                    song.id &&
                  getSourceType(
                    item
                  ) === "usb"
              );

            return (
              <article
                className="video-card usb-video-card"
                key={song.id}
              >
                <img
                  src={
                    song.thumbnail ||
                    "/usb-default.png"
                  }
                  alt={
                    song.title ||
                    "USB Karaoke"
                  }
                  loading="lazy"
                  decoding="async"
                />

                <div className="video-card-body">
                  <h3>
                    {song.title}
                  </h3>

                  <p>
                    {song.channel ||
                      "USB Storage"}
                  </p>

                  <div className="card-actions">
                    {!currentSong && (
                      <button
                        className="button primary"
                        onClick={() =>
                          addToQueue(
                            song,
                            true
                          )
                        }
                        disabled={
                          isInQueue
                        }
                      >
                        {isInQueue
                          ? "✓ IN QUEUE"
                          : "▶ Play"}
                      </button>
                    )}

                    <button
                      className="button ghost"
                      onClick={() =>
                        addToQueue(
                          song
                        )
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
          }
        )}
      </div>

      {visibleCount <
        filteredUsbSongs.length && (
        <div
          ref={loadMoreRef}
          style={{
            height: "1px"
          }}
          aria-hidden="true"
        />
      )}

      {!usbLoading &&
        filteredUsbSongs.length ===
          0 && (
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
  );
}

export default memo(UsbTab);
