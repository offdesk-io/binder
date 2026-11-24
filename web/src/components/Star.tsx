/** The mark of a key person (starred as a key connector, or a referrer's own person), wherever they appear. The
 * label is what a screen reader says. */
export function Star() {
  return (
    <span className="tn-custom-star" role="img" aria-label="Key person" title="Key person">
      ★
    </span>
  )
}
