import { memo } from "react";

function PopupTab({
  popupText,
  setPopupText,
  popupDuration,
  setPopupDuration,
  setTab,
  returnTab,
  goFlash,
  flashGo,
  sendTextPopup
}) {
  return (
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
              className={`fake-go-button ${
                goFlash === "popup"
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                flashGo("popup")
              }
            >
              {goFlash === "popup"
                ? "Go"
                : "➜"}
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
  );
}

export default memo(PopupTab);
