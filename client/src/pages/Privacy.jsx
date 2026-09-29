import './landing.css';

export default function Privacy() {
  return (
    <div className="lp">
      <main className="lp-page">
        <a className="lp-inline-link" href="/">Back to Tiến Lên</a>
        <h1 className="lp-h2" style={{ marginTop: 24 }}>Privacy policy</h1>
        <p className="lp-lead">Tiến Lên is a small site for playing and scoring the card game with friends.</p>

        <h2 className="lp-h3">What we collect</h2>
        <p className="lp-text">
          When you sign in with Google, we receive your name, email address and profile picture. We store these to
          show who you are on score sessions and the chip leaderboard.
        </p>
        <p className="lp-text">
          We also store the score sessions you create or join, the games recorded in them, and your chip history.
          Chips are points for fun. They have no money value and can't be bought or cashed out.
        </p>

        <h2 className="lp-h3">What we don't do</h2>
        <p className="lp-text">
          We don't sell or share your information, show ads, or use tracking cookies. The only cookie keeps you signed in.
        </p>

        <h2 className="lp-h3">Who can see your data</h2>
        <p className="lp-text">
          Your name and chip balance appear on the public leaderboard. A score session is visible only to its leader and
          the people who joined it with the invite link. Your email address is never shown to other players.
        </p>

        <h2 className="lp-h3">Where it's stored</h2>
        <p className="lp-text">
          Data is stored in a Postgres database hosted by Neon, and the site runs on Render.
        </p>

        <h2 className="lp-h3">Deleting your data</h2>
        <p className="lp-text">
          To delete your account and everything linked to it, open an issue on the
          {' '}<a className="lp-inline-link" href="https://github.com/A-Shalchian/tien-len/issues">project's GitHub page</a>{' '}
          or ask the site owner directly. We remove it within 30 days.
        </p>

        <p className="lp-text lp-muted">Last updated September 28, 2026.</p>
      </main>
    </div>
  );
}
