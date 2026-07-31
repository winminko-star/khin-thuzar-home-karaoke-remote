import { useEffect, useState } from "react";

const EMPTY = {
  letter: "",
  display_name: "",
  myanmar_name: "",
  english_name: "",
  artist_type: "Solo",
  gender: "မသတ်မှတ်",
  search_keys: "",
  youtube_keyword: ""
};

export default function ArtistModal({ open, artist, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (!open) return;
    setForm(artist ? { ...EMPTY, ...artist } : EMPTY);
  }, [open, artist]);

  if (!open) return null;

  const update = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const submit = (event) => {
    event.preventDefault();
    if (!form.display_name.trim()) return;
    onSave({
      ...form,
      letter: form.letter.trim() || form.display_name.trim().charAt(0),
      display_name: form.display_name.trim(),
      myanmar_name: form.myanmar_name.trim(),
      english_name: form.english_name.trim(),
      search_keys: form.search_keys.trim(),
      youtube_keyword:
        form.youtube_keyword.trim() || `${form.display_name.trim()} karaoke`
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal-card" onMouseDown={(e) => e.stopPropagation()}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">ARTIST DATABASE</p>
            <h2>{artist ? "အဆိုတော်ပြင်ရန်" : "အဆိုတော်အသစ်ထည့်ရန်"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="artist-form" onSubmit={submit}>
          <label>အက္ခရာ<input value={form.letter} onChange={(e) => update("letter", e.target.value)} /></label>
          <label>Display Name *<input required value={form.display_name} onChange={(e) => update("display_name", e.target.value)} /></label>
          <label>မြန်မာအမည်<input value={form.myanmar_name} onChange={(e) => update("myanmar_name", e.target.value)} /></label>
          <label>English / Stage Name<input value={form.english_name} onChange={(e) => update("english_name", e.target.value)} /></label>
          <label>အမျိုးအစား
            <select value={form.artist_type} onChange={(e) => update("artist_type", e.target.value)}>
              <option>Solo</option><option>Group</option><option>Duo</option><option>Band</option>
            </select>
          </label>
          <label>ကျား/မ
            <select value={form.gender} onChange={(e) => update("gender", e.target.value)}>
              <option>မသတ်မှတ်</option><option>အမျိုးသား</option><option>အမျိုးသမီး</option><option>အဖွဲ့</option>
            </select>
          </label>
          <label className="full">Search Keys<input value={form.search_keys} onChange={(e) => update("search_keys", e.target.value)} placeholder="နာမည်များကို comma ခြားပါ" /></label>
          <label className="full">YouTube Keyword<input value={form.youtube_keyword} onChange={(e) => update("youtube_keyword", e.target.value)} /></label>
          <div className="modal-actions full">
            <button type="button" className="button ghost" onClick={onClose}>Cancel</button>
            <button className="button primary" type="submit">Save Artist</button>
          </div>
        </form>
      </section>
    </div>
  );
}
