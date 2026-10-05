import { CONTACT_EMAIL, LEGAL_UPDATED, MIN_AGE } from '../utils/site.js';
import './landing.css';

export function LegalPage({ title, lead, children }) {
  return (
    <div className="lp">
      <main className="lp-page">
        <nav className="lp-legal-nav">
          <a className="lp-inline-link" href="/">Home</a>
          <a className="lp-inline-link" href="/privacy">Privacy policy</a>
          <a className="lp-inline-link" href="/terms">Terms of use</a>
        </nav>
        <h1 className="lp-h2 lp-legal-title">{title}</h1>
        <p className="lp-lead">{lead}</p>
        {children}
        <p className="lp-text lp-muted">Last updated {LEGAL_UPDATED}.</p>
      </main>
    </div>
  );
}

function Mail() {
  return <a className="lp-inline-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy policy"
      lead="Tiến Lên is a small, non-commercial site for playing and scoring the card game with friends. This page lists what we store, who can see it and how to get it deleted."
    >
      <h2 className="lp-h3">Who runs this site</h2>
      <p className="lp-text">
        Tiến Lên is run by one person as a hobby project. For any privacy question or request, email <Mail />.
      </p>

      <h2 className="lp-h3">What we collect</h2>
      <ul className="lp-list">
        <li>
          <strong>From Google when you sign in:</strong> your name, email address, profile photo and Google account ID.
          We never see or store your Google password. Google also gives us sign-in tokens, which we store encrypted and
          use only to confirm your sign-in.
        </li>
        <li>
          <strong>What you create on the site:</strong> your display name and privacy settings, the score sessions you
          start or join, the player you claim in each session, every game recorded in those sessions, and your chip
          history.
        </li>
        <li>
          <strong>Sign-in records:</strong> for each sign-in we store when it started, when it expires, your IP address
          and your browser's user agent. These keep your account secure and are deleted when they expire or when you
          delete your account.
        </li>
        <li>
          <strong>Server logs:</strong> our host keeps short-lived technical logs of requests, such as IP addresses and
          error messages, to keep the site running.
        </li>
      </ul>
      <p className="lp-text">
        We don't collect payment details, your location, your contacts, or anything from other Google services.
      </p>

      <h2 className="lp-h3">How we use it</h2>
      <ul className="lp-list">
        <li>To sign you in and keep you signed in.</li>
        <li>To show your name, photo and scores in the sessions you're part of.</li>
        <li>To calculate chips and show the public leaderboard and profiles.</li>
        <li>To keep the site secure and fix problems.</li>
      </ul>
      <p className="lp-text">
        We use your data only to run the features described here. We do not sell it, rent it, use it for ads or share
        it with data brokers. There are no ads, analytics or tracking tools on the site.
      </p>

      <h2 className="lp-h3">What other people can see</h2>
      <ul className="lp-list">
        <li>
          <strong>Your public profile</strong> at /u/your-id shows your display name, photo, join date and chip balance.
          Turn on "Make my profile private" in settings to hide it.
        </li>
        <li>
          <strong>The chip leaderboard</strong> on the home page shows your display name, photo and chip balance. You can
          leave it in settings.
        </li>
        <li>
          <strong>Score tracker sessions are private.</strong> Only the leader and people who joined with the invite
          link can see the players, games and chips in a session. Session games never show on public profiles, and
          session chips never count toward your chip balance or the leaderboard.
        </li>
        <li>Your email address is never shown to anyone.</li>
      </ul>

      <h2 className="lp-h3">Who stores it</h2>
      <p className="lp-text">We use three service providers, and each handles your data only to provide its service:</p>
      <ul className="lp-list">
        <li><strong>Neon</strong> hosts the database in the United States (Ohio).</li>
        <li><strong>Render</strong> runs the website and server in the United States.</li>
        <li><strong>Google</strong> handles sign-in.</li>
      </ul>
      <p className="lp-text">
        If you live outside the United States, your data is transferred there. All traffic uses HTTPS, and database
        connections are encrypted.
      </p>

      <h2 className="lp-h3">Cookies</h2>
      <p className="lp-text">
        We use one cookie to keep you signed in, plus a short-lived cookie during the Google sign-in step. Both are
        needed for the site to work. There are no advertising or analytics cookies, so there's no cookie banner.
      </p>

      <h2 className="lp-h3">How long we keep it</h2>
      <p className="lp-text">
        We keep your account data until you delete your account. Sign-in records expire after 60 days. When you delete
        your account, we erase your account, settings, sign-ins and chip history right away. Games you played stay in
        other people's sessions under the player name used there, with no link to your account, so their score history
        stays correct. Our database provider may keep backups for a short time after that before they are overwritten.
      </p>

      <h2 className="lp-h3">Your choices and rights</h2>
      <ul className="lp-list">
        <li><strong>See and download your data:</strong> Profile, then Settings, then "Download my data".</li>
        <li><strong>Correct it:</strong> change your display name and photo setting in Settings.</li>
        <li><strong>Limit who sees it:</strong> make your profile private or leave the leaderboard.</li>
        <li><strong>Delete it:</strong> Profile, then Settings, then "Delete account".</li>
      </ul>
      <p className="lp-text">
        Depending on where you live, laws such as Canada's PIPEDA, the EU and UK GDPR, or California's CCPA give you
        these rights and others. For anything the settings don't cover, email <Mail /> and we'll reply within 30 days. We
        process your data to provide the service you signed up for and based on the consent you give when you create
        your account. You can also complain to your local privacy regulator, such as the Office of the Privacy
        Commissioner of Canada.
      </p>

      <h2 className="lp-h3">Children</h2>
      <p className="lp-text">
        You must be {MIN_AGE} or older to create an account. We don't knowingly collect data from children under {MIN_AGE}.
        If you believe a child under {MIN_AGE} has an account, email <Mail /> and we'll delete it.
      </p>

      <h2 className="lp-h3">Changes</h2>
      <p className="lp-text">
        If we change this policy, we'll update the date below. If a change affects how your data is used or shared,
        we'll ask you to accept the new version the next time you sign in.
      </p>
    </LegalPage>
  );
}
