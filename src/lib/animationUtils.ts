/** Spine's findAnimation throws on empty/null names — guard before calling. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeFindAnimation(
  data: { findAnimation?: (name: string) => any } | null | undefined,
  animationName: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | null {
  if (!data?.findAnimation || !animationName) return null
  return data.findAnimation(animationName)
}

/** Extract all keyframe times from a Spine animation (from all timelines). */
export function getAnimationKeyframeTimes(anim: { timelines?: { frames?: number[]; getFrameCount?: () => number; getFrameEntries?: () => number }[] }): number[] {
  const times = new Set<number>([0]);
  const timelines = anim?.timelines ?? [];
  for (const tl of timelines) {
    const count = tl.getFrameCount?.() ?? 0;
    const entries = tl.getFrameEntries?.() ?? 1;
    const frames = tl.frames;
    if (!frames) continue;
    for (let i = 0; i < count; i++) {
      const t = frames[i * entries];
      if (typeof t === 'number' && isFinite(t)) times.add(t);
    }
  }
  return Array.from(times).sort((a, b) => a - b);
}

export interface AnimationEventInfo {
  name: string;
  time: number;
}

/** Extract events from a Spine animation (EventTimeline). */
export function getAnimationEvents(anim: {
  timelines?: {
    frames?: number[];
    events?: { data?: { name?: string }; name?: string }[];
    getFrameCount?: () => number;
  }[];
}): AnimationEventInfo[] {
  const events: AnimationEventInfo[] = [];
  const timelines = anim?.timelines ?? [];
  for (const tl of timelines) {
    const tlEvents = (tl as { events?: { data?: { name?: string }; name?: string }[] }).events;
    if (!tlEvents) continue;
    const frames = tl.frames ?? [];
    const count = tl.getFrameCount?.() ?? Math.min(tlEvents.length, frames.length);
    for (let i = 0; i < count; i++) {
      const ev = tlEvents[i];
      const time = frames[i];
      if (ev && typeof time === 'number') {
        const name = ev.data?.name ?? (ev as { name?: string }).name ?? 'event';
        events.push({ name, time });
      }
    }
  }
  return events.sort((a, b) => a.time - b.time);
}
