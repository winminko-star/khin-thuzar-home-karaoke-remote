import { memo } from "react";

function ArtistsTab({
  baseArtists,
  customArtists,
  setArtistModal,
  artistQuery,
  setArtistQuery,
  goFlash,
  flashGo,
  letters,
  selectedLetter,
  setSelectedLetter,
  artists,
  runSearch,
  deleteArtist
}) {
  return (
    <section className="panel">

      <div className="section-heading">

        <div>
          <p className="eyebrow">
            {baseArtists.length +
              customArtists.length}{" "}
            ARTISTS
          </p>

          <h2>
            အဆိုတော်စာရင်း
          </h2>
        </div>

        <button
          className="button primary"
          onClick={() =>
            setArtistModal({
              open: true,
              artist: null
            })
          }
        >
          ＋ Add Artist
        </button>
      </div>

      <div className="usb-search-row">

        <input
          type="search"
          value={artistQuery}
          onChange={(e) =>
            setArtistQuery(
              e.target.value
            )
          }
          placeholder="အဆိုတော်နာမည်ရှာရန်"
        />

        <button
          type="button"
          className={`fake-go-button ${
            goFlash === "artist"
              ? "active"
              : ""
          }`}
          onClick={() =>
            flashGo("artist")
          }
        >
          {goFlash === "artist"
            ? "Go"
            : "➜"}
        </button>

        {artistQuery && (
          <button
            type="button"
            className="button ghost"
            onClick={() =>
              setArtistQuery("")
            }
          >
            ✕
          </button>
        )}

      </div>

      <div className="letter-strip">

        {letters.map(
          (letter) => (

            <button
              key={letter}
              className={
                selectedLetter ===
                letter
                  ? "active"
                  : ""
              }
              onClick={() =>
                setSelectedLetter(
                  letter
                )
              }
            >
              {letter}
            </button>
          )
        )}

      </div>

      <div className="artist-grid">

        {artists.map(
          (artist) => (

            <article
              className="artist-card"
              key={artist.id}
            >

              <button
                className="artist-main"
                onClick={() =>
                  runSearch(
                    artist.youtube_keyword ||
                      artist.display_name
                  )
                }
              >

                <span className="artist-avatar">
                  {artist.display_name.charAt(
                    0
                  )}
                </span>

                <span>

                  <strong>
                    {artist.display_name}
                  </strong>

                  <small>
                    {artist.english_name ||
                      artist.artist_type}
                  </small>

                </span>

              </button>

              <div className="artist-tools">

                {!artist.is_base && (

                  <button
                    onClick={() =>
                      setArtistModal({
                        open: true,
                        artist
                      })
                    }
                  >
                    ✎
                  </button>
                )}

                {!artist.is_base && (

                  <button
                    onClick={() =>
                      deleteArtist(
                        artist
                      )
                    }
                  >
                    🗑
                  </button>
                )}

              </div>
            </article>
          )
        )}

      </div>
    </section>
  );
}

export default memo(ArtistsTab);
