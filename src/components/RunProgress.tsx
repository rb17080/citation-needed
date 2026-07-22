/**
 * Run progress - the honest Win-era copy-dialog bar. Percent comes from real
 * pipeline milestones (topics extracted, pools gathered, links streamed,
 * scoring), never a fake animation. Reuses the DR meter's per-OS skins
 * (95/98 segmented navy, XP Luna green, Win7 glossy Aero green).
 */
export function RunProgress({ percent, phase }: { percent: number; phase: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div
      className="run-progress"
      role="progressbar"
      aria-valuenow={p}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={phase}
    >
      <span className="run-progress-phase">{phase}</span>
      <div className="dr-meter run-progress-bar">
        <i style={{ width: `${p}%` }} />
      </div>
      <span className="run-progress-num">{p}%</span>
    </div>
  )
}
