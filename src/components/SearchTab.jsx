import {
  memo,
  useMemo
} from "react";

function SearchTab({
  query,
  setQuery,
  runSearch,
  searching,
  startVoiceSearch,
  results,
  currentSong,
  queue,
  getSourceType,
  isFavorite,
  toggleFavorite,
  addToQueue
}) {
  const queueKeys =
    useMemo(() => {

      const keys =
        new Set();

      for (
        const item of queue
      ) {
        keys.add(
          `${getSourceType(
            item
          )}:${item.id}`
        );
      }

      return keys;

    }, [
      queue,
      getSourceType
    ]);

  return (
    <section className="panel">

      <div className="search-row">

        <input
          value={query}
          onChange={(e) =>
            setQuery(
              e.target.value
            )
          }
          onKeyDown={(e) =>
            e.key === "Enter" &&
            runSearch()
          }
          placeholder="သီချင်း သို့မဟုတ် အဆိုတော်နာမည် ရိုက်ပါ"
        />

        <button
          className="button primary"
          onClick={() =>
            runSearch()
          }
          disabled={searching}
        >
          {searching
            ? "Searching…"
            : "Search"}
        </button>

        <button
          className="button voice-button"
          onClick={
            startVoiceSearch
          }
        >
          🎤
        </button>

      </div>

      <div className="video-grid">

        {results.map(
          (video) => {

            const sourceType =
              video.sourceType ||
              getSourceType(video);

            const isUsb =
              sourceType ===
              "usb";

            const isNowPlaying =
              currentSong?.id ===
                video.id &&
              getSourceType(
                currentSong
              ) === sourceType;

            const isInQueue =
              queueKeys.has(
                `${sourceType}:${video.id}`
              );

            const videoIsFavorite =
              !isUsb &&
              isFavorite(
                video.id
              );

            return (
              <article
                className="video-card"
                key={video.id}
              >

                <img
                  src={
                    isUsb
                      ? "/usb-default.png"
                      : video.thumbnail
                  }
                  alt={
                    video.title ||
                    ""
                  }
                  loading="lazy"
                  decoding="async"
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
                      {isUsb
                        ? "USB"
                        : "TUBE"}
                    </span>
                  </div>

                  <h3>
                    {video.title}
                  </h3>

                  <p>
                    {video.channel ||
                      (isUsb
                        ? "USB Storage"
                        : "YouTube")}
                  </p>

                  <div className="card-actions">

                    {!currentSong && (
                      <button
                        className="button primary"
                        onClick={() =>
                          addToQueue(
                            video,
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
                          video
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

                    {!isUsb && (
                      <button
                        type="button"
                        className={
                          videoIsFavorite
                            ? "favorite-button is-favorite"
                            : "favorite-button"
                        }
                        onClick={() =>
                          toggleFavorite(
                            video
                          )
                        }
                      >

                        <span className="favorite-star">
                          {videoIsFavorite
                            ? "★"
                            : "☆"}
                        </span>

                        <span>
                          {videoIsFavorite
                            ? "Saved"
                            : "Favorite"}
                        </span>

                      </button>
                    )}

                  </div>
                </div>
              </article>
            );
          }
        )}
      </div>

      {!results.length && (

        <div className="empty-state">

          <span>🎤</span>

          <h3>
            သီချင်းရှာရန်အသင့်
          </h3>

          <p>
            ခင်သူဇာလှိုင်၏ HOME KARAOKE မှ လှိုက်လဲစွာ ကြိုဆိုပါသည်။
          </p>

        </div>
      )}

    </section>
  );
}

export default memo(SearchTab);
