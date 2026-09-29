import { useState } from 'react';
import { api, signOut } from '../utils/api.js';
import './scores.css';

export default function ConsentGate({ onAccepted }) {
  const [over13, setOver13] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/me/accept', { method: 'POST', body: { over13, agree } });
      onAccepted();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <section className="st-card st-form">
      <h1 className="st-title st-title-inline">One step before you play</h1>
      <p className="st-muted">
        Your account stores your Google name, email and photo, the sessions you join, and your chip history.
        The <a className="st-link" href="/privacy" target="_blank" rel="noreferrer">privacy policy</a> explains
        what is public and how to download or delete your data.
      </p>
      <label className="st-check st-check-left">
        <input type="checkbox" checked={over13} onChange={(e) => setOver13(e.target.checked)} />
        I am 13 or older
      </label>
      <label className="st-check st-check-left">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          I agree to the <a className="st-link" href="/terms" target="_blank" rel="noreferrer">terms</a> and
          the <a className="st-link" href="/privacy" target="_blank" rel="noreferrer">privacy policy</a>
        </span>
      </label>
      {error && <p className="st-error">{error}</p>}
      <div className="st-actions">
        <button className="st-btn" onClick={signOut}>Sign out</button>
        <button className="st-btn st-btn-primary" disabled={!over13 || !agree || busy} onClick={accept}>Continue</button>
      </div>
    </section>
  );
}
