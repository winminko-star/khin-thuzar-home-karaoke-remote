import { memo } from "react";

function QueueTab({
  queue,
  shuffleQueue,
  repeatMode,
  cycleRepeatMode,
  clearQueue,
  dragIndex,
  setDragIndex,
  reorderQueue,
  playQueueIndex,
  removeQueueItem
}) {
  return (
    <section className="panel">

      <div className="section-heading">

        <div>
          <p className="eyebrow">
            PLAYLIST CONTROL
          </p>

          <h2>Queue</h2>
        </div>

        <div className="queue-tools">

          <button
            className="button ghost"
            onClick={
              shuffleQueue
            }
          >
            🔀 Shuffle
          </button>

          <button
            className="button ghost"
            onClick={
              cycleRepeatMode
            }
          >
            🔁 {repeatMode}
          </button>

          <button
            className="button danger"
            onClick={
              clearQueue
            }
          >
            Clear
          </button>

        </div>
      </div>

      <div className="queue-list">

        {queue.map(
          (
            song,
            index
          ) => (

            <article
              key={
                song.queueId
              }
              draggable
              onDragStart={() =>
                setDragIndex(
                  index
                )
              }
              onDragOver={(e) =>
                e.preventDefault()
              }
              onDrop={() => {

                reorderQueue(
                  dragIndex,
                  index
                );

                setDragIndex(
                  null
                );
              }}
              className="queue-item"
            >

              <span className="drag">
                ⋮⋮
              </span>

              <span className="queue-number">
                {index + 1}
              </span>

              {song.thumbnail ? (

                <img
                  src={
                    song.thumbnail
                  }
                  alt=""
                  loading="lazy"
                  decoding="async"
                />

              ) : (

                <div className="queue-placeholder">
                  💾
                </div>
              )}

              <button
                className="queue-song"
                onClick={() =>
                  playQueueIndex(
                    index
                  )
                }
              >

                <strong>
                  {song.title}
                </strong>

                <small>
                  {song.channel}
                </small>

              </button>

              <button
                className="icon-button"
                onClick={() =>
                  removeQueueItem(
                    index
                  )
                }
              >
                ✕
              </button>

            </article>
          )
        )}

        {!queue.length && (

          <div className="empty-state">

            <span>🎶</span>

            <h3>
              Queue မရှိသေးပါ
            </h3>

            <p>
              Search သို့မဟုတ် Artist
              စာရင်းကနေ သီချင်းထည့်ပါ။
            </p>

          </div>
        )}

      </div>
    </section>
  );
}

export default memo(QueueTab);
