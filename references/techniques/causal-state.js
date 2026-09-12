/** Pure finite transfer. All dependent visuals sample the SAME returned state.
 * Time and milestones use the same units. This is authored animation, not fluid
 * or rigid-body simulation; it does not infer that geometric contact occurred.
 */
export function transferAt(time, { contactTime, releaseTime, settleTime, total = 1 }) {
  if (![time, contactTime, releaseTime, settleTime, total].every(Number.isFinite) ||
      contactTime < 0 || releaseTime <= contactTime || settleTime < releaseTime || total < 0) {
    throw new RangeError('Require 0 <= contact < release <= settle and nonnegative total');
  }
  const progress = Math.min(1, Math.max(0, (time - contactTime) / (releaseTime - contactTime)));
  const received = total * progress;
  // Numeric contexts (arithmetic, clamp, lerp) read `progress` via the shared prototype; destructure for the rest.
  return Object.assign(Object.create(transferState), {
    phase: time < contactTime ? 'approach' : time < releaseTime ? 'transfer' : time < settleTime ? 'settle' : 'rest',
    progress, received, remaining: total - received,
    active: time >= contactTime && time < releaseTime,
    settleProgress: settleTime === releaseTime ? Number(time >= releaseTime) :
      Math.min(1, Math.max(0, (time - releaseTime) / (settleTime - releaseTime))),
  });
}
const transferState = { valueOf() { return this.progress; }, toString() { return String(this.progress); } };
