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

/** Seek to the previous or next marker time in a sorted list (keyframes or events). */
export function seekSortedMarkerTime(
  times: number[],
  current: number,
  direction: -1 | 1,
): number | null {
  if (!times.length) return null;
  if (direction < 0) {
    const idx = times.findIndex((t) => t >= current) - 1;
    return idx >= 0 ? times[idx] : null;
  }
  const idx = times.findIndex((t) => t > current);
  return idx >= 0 ? times[idx] : null;
}

export function formatDurationShort(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  return rounded % 1 === 0 ? `${rounded}s` : `${rounded.toFixed(1)}s`;
}

/** Event count + duration suffix for animation list rows. */
export function formatAnimationMetaSuffix(eventCount: number, duration: number): string {
  const dur = formatDurationShort(duration);
  return eventCount > 0 ? `${eventCount} / ${dur}` : dur;
}
