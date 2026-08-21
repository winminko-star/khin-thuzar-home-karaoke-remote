import { memo } from "react";

function SettingsTab({
  youtubeApiChoice,
  youtubeApiKeys,
  selectYouTubeApi
}) {
  return (
    <section className="panel settings-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">REMOTE SETTINGS</p>
          <h2> API SETTING </h2>
        </div>
      </div>

      <p className="settings-description">
        Search မှာ သုံးမယ့် API ကို ရွေးပါ။
        ရွေးပြီးတာနဲ့ Search နှိပ်ပြီး သီချင်းရှာမယ်။
      </p>

      <div className="api-choice-grid">
        {["1", "2", "3"].map((choice) => {
          const available = Boolean(youtubeApiKeys[choice]);
          const selected = youtubeApiChoice === choice;

          return (
            <button
              type="button"
              key={choice}
              className={`api-choice-button ${selected ? "selected" : ""}`}
              onClick={() => selectYouTubeApi(choice)}
              disabled={!available}
            >
              <strong>API {choice}</strong>

              <span>
                {selected
                  ? "အသုံးပြုနေသည်"
                  : available
                    ? "ရွေးရန်"
                    : "Key မရှိသေး"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="current-api-status">
        လက်ရှိအသုံးပြုနေသည်:
        <strong>API {youtubeApiChoice}</strong>
      </div>
    </section>
  );
}

export default memo(SettingsTab);
