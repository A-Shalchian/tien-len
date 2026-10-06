import { useLang } from '../i18n/index.jsx';
import { MiniHand } from './Landing.jsx';
import './landing.css';
import './rules.css';

const PLAYS = [
  { name: 'Single', cards: [['K', '♥']] },
  { name: 'Pair', cards: [['7', '♠'], ['7', '♦']] },
  { name: 'Triple', cards: [['9', '♣'], ['9', '♦'], ['9', '♥']] },
  { name: 'Four of a kind', cards: [['J', '♠'], ['J', '♣'], ['J', '♦'], ['J', '♥']] },
  { name: 'Straight, 3 or more in a row. No 2s.', cards: [['5', '♦'], ['6', '♠'], ['7', '♣']] },
  { name: 'Double straight, 3 or more pairs in a row. No 2s.', cards: [['4', '♠'], ['4', '♥'], ['5', '♣'], ['5', '♦'], ['6', '♠'], ['6', '♥']] },
];

const GLOSSARY = [
  ['Heo', 'A 2. Heo đen is a black 2 (♠ ♣), heo đỏ is a red 2 (♦ ♥).'],
  ['Chặt', 'Beating a 2 with a bomb.'],
  ['Chặt chồng', 'Chopping a chop.'],
  ['Tứ quý', 'Four of a kind.'],
  ['Đôi thông', 'Pairs in a row, like 4 4 5 5 6 6.'],
  ['Sảnh', 'A straight, 3 or more cards in a row.'],
  ['Sảnh rồng', 'A dragon: one card of every rank from 3 to A.'],
  ['Sám', 'Three of a kind.'],
  ['Đôi', 'A pair.'],
  ['Tới trắng', 'An instant win straight from the deal.'],
  ['Thối heo', 'Coming last with 2s still in your hand.'],
  ['Cóng', 'Not playing a single card before someone goes out.'],
  ['Bích, chuồn, rô, cơ', 'Spades, clubs, diamonds and hearts, from low to high.'],
];

function Section({ title, children }) {
  return (
    <section>
      <h2 className="lp-h3">{title}</h2>
      {children}
    </section>
  );
}

function List({ items }) {
  const { t } = useLang();
  return (
    <ul className="lp-list">
      {items.map((item) => <li key={item}>{t(item)}</li>)}
    </ul>
  );
}

export default function Rules() {
  const { t, href } = useLang();
  return (
    <div className="lp">
      <article className="lp-page">
        <h1 className="lp-h2 lp-legal-title">{t('How to play Tiến Lên')}</h1>
        <p className="lp-lead">
          {t('The full rules of tiến lên miền Nam, the southern version this site plays. Also known as Tien Len or Thirteen.')}
        </p>

        <Section title={t('How many players and cards?')}>
          <List items={[
            '2 to 4 players and one 52-card deck, no jokers.',
            'Everyone gets 13 cards. With fewer than 4 players, the leftover cards sit out.',
            'Get rid of all your cards first to win.',
          ]} />
        </Section>

        <Section title={t('Which cards are highest?')}>
          <List items={[
            'Ranks, low to high: 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2.',
            'Suits, low to high: ♠ spades, ♣ clubs, ♦ diamonds, ♥ hearts.',
            'So 3♠ is the lowest card and 2♥ is the highest.',
          ]} />
        </Section>

        <Section title={t('What can you play?')}>
          <ul className="lp-plays">
            {PLAYS.map((play) => (
              <li key={play.name}>
                <MiniHand cards={play.cards} />
                <span>{t(play.name)}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('How do you beat a play?')}>
          <List items={[
            'Play the same kind with the same number of cards, but higher.',
            'Compare the highest card: rank first, then suit. A pair with 7♥ beats a pair with 7♦.',
            'You can always pass. Once you pass, you sit out until the round ends.',
            'When everyone else passes, the last player to play starts a new round with anything.',
          ]} />
        </Section>

        <Section title={t('Who goes first?')}>
          <List items={[
            'First game: whoever holds the 3♠ leads, and that first play must include the 3♠.',
            'After that, the winner of the last game leads.',
          ]} />
        </Section>

        <Section title={t('How do you chop a 2?')}>
          <p className="lp-text">
            {t('Four of a kind and 3 or more pairs in a row are bombs. A bomb can beat 2s, which is called chopping (chặt heo).')}
          </p>
          <List items={[
            'A single 2: 3 pairs in a row, four of a kind, or 4 or more pairs in a row.',
            'A pair of 2s: four of a kind, or 4 or more pairs in a row.',
            'Three 2s: 5 pairs in a row.',
            'Bigger bombs beat smaller ones: four of a kind beats 3 pairs in a row, and 4 pairs in a row beats four of a kind.',
            'If your chop gets chopped, you pay the same amount to the player who chopped you.',
          ]} />
        </Section>

        <Section title={t('How does a game end?')}>
          <List items={[
            'The first player out wins. The rest keep playing for 2nd and 3rd.',
            'The last player still holding cards comes last.',
            'Instant win (tới trắng): if you are dealt four 2s or a dragon (one of every rank from 3 to A), you win before anyone plays.',
          ]} />
        </Section>

        <Section title={t('What costs points?')}>
          <List items={[
            'Thối heo: coming last with 2s still in your hand.',
            'Cóng: not playing a single card before someone goes out.',
            'Getting chopped: you pay the player who chopped your 2s.',
            'Winning with the 3♠ as your last card, or an instant win, earns extra.',
          ]} />
          <p className="lp-text">
            <a className="lp-inline-link" href={`${href('/')}#house-rules`}>{t('See the points we use')}</a>
          </p>
        </Section>

        <Section title={t('Glossary')}>
          <dl className="rl-glossary">
            {GLOSSARY.map(([term, meaning]) => (
              <div key={term}>
                <dt lang="vi">{term}</dt>
                <dd>{t(meaning)}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <p className="lp-text">
          <a className="lp-btn lp-btn-gold" href={href('/play')}>{t('Play online')}</a>
        </p>
      </article>
    </div>
  );
}
