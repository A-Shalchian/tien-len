import Card from './Card.jsx';
import { useLang } from '../i18n/index.jsx';

export default function Table({ cards, animatePlay }) {
  const { t } = useLang();
  if (!cards || cards.length === 0) {
    return (
      <div className="table-cards">
        <span className="table-info">{t('New round')}</span>
      </div>
    );
  }

  return (
    <div className="table-cards">
      {cards.map((card, index) => (
        <Card
          key={card.id}
          card={card}
          animClass={animatePlay ? 'playing' : ''}
          animDelay={animatePlay ? index * 0.04 : 0}
        />
      ))}
    </div>
  );
}
