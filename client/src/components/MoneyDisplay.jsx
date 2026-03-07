export default function MoneyDisplay({ amount }) {
  return (
    <span className="money">
      <span className="money-chip" />
      {amount}
    </span>
  );
}
