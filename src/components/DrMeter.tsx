/** Domain Rating as a segmented authority bar + value. Themed per-OS in
 *  index.css (navy blocks on 95/98, Luna green on XP, Aero green on Win7). */
export function DrMeter({ value }: { value: number | null | undefined }) {
  const v = value == null || Number.isNaN(value) ? null : Math.round(value)
  return (
    <span className="dr-meter-wrap" title={v == null ? 'Domain rating unknown' : `Domain rating ${v} (Ahrefs)`}>
      <span className="dr-meter">
        <i style={{ width: `${v ?? 0}%` }} />
      </span>
      <span className="dr-meter-num">{v ?? '--'}</span>
    </span>
  )
}
