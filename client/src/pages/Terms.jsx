import { CONTACT_EMAIL, MIN_AGE } from '../utils/site.js';
import { useLang } from '../i18n/index.jsx';
import { LegalPage } from './Privacy.jsx';

export default function Terms() {
  const { t } = useLang();
  return (
    <LegalPage
      title={t('Terms of use')}
      lead={t('These terms apply when you use Tiến Lên. By creating an account you agree to them and to the privacy policy.')}
    >
      <h2 className="lp-h3">{t('The service')}</h2>
      <p className="lp-text">
        {t('Tiến Lên is a free, non-commercial hobby site for playing the card game online and keeping score of games played in person. It is provided as is, may change or go offline at any time, and has no guaranteed uptime.')}
      </p>

      <h2 className="lp-h3">{t('Who can use it')}</h2>
      <p className="lp-text">
        {t("You must be {age} or older. If you're under the age of majority where you live, you need a parent or guardian's permission. You sign in with your own Google account, you're responsible for what happens under it, and you may have only one account.", { age: MIN_AGE })}
      </p>

      <h2 className="lp-h3">{t('Chips are not money')}</h2>
      <ul className="lp-list">
        <li>{t('Chips are points for fun. They have no money value.')}</li>
        <li>{t("Chips can't be bought, sold, traded, transferred, cashed out or exchanged for anything of value.")}</li>
        <li>{t('We may adjust, reset or remove chips at any time, for example to fix a mistake or stop abuse.')}</li>
        <li>
          {t('The site does not offer, host or process real-money gambling. If you make bets with other people outside the site, that is between you and them. You are responsible for following the laws where you live, and we have no part in or liability for those bets.')}
        </li>
      </ul>

      <h2 className="lp-h3">{t('Score sessions')}</h2>
      <p className="lp-text">
        {t('The person who starts a session is its leader and controls its settings, recorded games and invite link. Anyone with the invite link can join and view the session. Share it only with people you want in. Leaders are responsible for recording games honestly.')}
      </p>

      <h2 className="lp-h3">{t('Acceptable use')}</h2>
      <p className="lp-text">{t("Don't:")}</p>
      <ul className="lp-list">
        <li>{t('use offensive, hateful or impersonating display names or player names;')}</li>
        <li>{t('harass other players;')}</li>
        <li>{t("cheat, exploit bugs to gain chips, or use bots or scripts outside the game's own bots;")}</li>
        <li>{t("try to access other people's accounts or data, or disrupt or overload the site.")}</li>
      </ul>
      <p className="lp-text">
        {t('We may remove content, adjust chips, or suspend or delete accounts that break these rules.')}
      </p>

      <h2 className="lp-h3">{t('Your content')}</h2>
      <p className="lp-text">
        {t('You keep ownership of names and other content you enter. You let us store and display it as needed to run the site, as described in the privacy policy.')}
      </p>

      <h2 className="lp-h3">{t('Ending your account')}</h2>
      <p className="lp-text">
        {t('You can delete your account at any time from Profile, then Settings. We may close accounts that break these terms or when the site shuts down.')}
      </p>

      <h2 className="lp-h3">{t('Disclaimer and liability')}</h2>
      <p className="lp-text">
        {t('The site is provided "as is" without warranties of any kind. We aren\'t liable for lost data, lost chips, disputes between players, or any indirect or consequential damages from using the site. Where the law does not allow these limits, they apply to the fullest extent it does allow.')}
      </p>

      <h2 className="lp-h3">{t('Governing law')}</h2>
      <p className="lp-text">
        {t('These terms are governed by the laws of the Province of Ontario and the federal laws of Canada that apply there.')}
      </p>

      <h2 className="lp-h3">{t('Changes and contact')}</h2>
      <p className="lp-text">
        {t("We may update these terms and will change the date below when we do. If a change is significant, we'll ask you to accept it the next time you sign in. Questions go to")}{' '}
        <a className="lp-inline-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
