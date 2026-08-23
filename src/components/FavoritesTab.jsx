import { memo } from "react";

function FavoritesTab({
  favorites,
  maxFavorites,
  playFavoriteNow,
  removeFavorite
}) {
  return (
    <section className="panel favorites-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {favorites.length} /{" "}
            {maxFavorites} SONGS
          </p>

          <h2>
            ❤️ အကြိုက်ဆုံးသီချင်းများ
          </h2>
        </div>
      </div>

      <p className="favorites-description">
        သီချင်းကိုနှိပ်လျှင် Queue ထဲမထည့်ဘဲ
        Now Playing အဖြစ် ချက်ချင်းဖွင့်ပါမည်။
      </p>

      <div className="favorites-list">
        {favorites.map(
          (favorite, index) => (
            <article
              className="favorite-item"
              key={favorite.id}
            >
              <span className="favorite-number">
                {index + 1}
              </span>

              <img
                src={
  favorite.thumbnail ||
  "/usb-default.png"
                }
                alt=""
                loading="lazy"
                decoding="async"
              />

              <button
                type="button"
                className="favorite-song"
                onClick={() =>
                  playFavoriteNow(
                    favorite
                  )
                }
              >
                <strong>
                  {favorite.title}
                </strong>

                <small>
                  {favorite.channel}
                </small>
              </button>

              <button
                type="button"
                className="favorite-play-button"
                onClick={() =>
                  playFavoriteNow(
                    favorite
                  )
                }
                aria-label="Play favorite now"
              >
                ▶
              </button>

              <button
                type="button"
                className="icon-button favorite-remove-button"
                onClick={() =>
                  removeFavorite(
                    favorite.id
                  )
                }
                aria-label="Remove favorite"
              >
                ✕
              </button>
            </article>
          )
        )}

        {!favorites.length && (
          <div className="empty-state">
            <span>❤️</span>

            <h3>
              Favorite သီချင်းမရှိသေးပါ
            </h3>

            <p>
              Search မှာ သီချင်းဘေးက Favorite
              ခလုတ်ကိုနှိပ်ပြီး သိမ်းပါ။
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export default memo(FavoritesTab);
