/** Active pose for vertex transforms (Spine 4.3: appliedPose). */
export function slotGetPose(slot: unknown): unknown {
  const s = slot as {
    appliedPose?: unknown
    getAppliedPose?: () => unknown
  }
  return s.appliedPose ?? s.getAppliedPose?.() ?? slot
}

/** Read attachment from a slot (Spine 4.3 appliedPose). */
export function slotGetAttachment(slot: unknown): unknown {
  const s = slot as {
    appliedPose?: { attachment?: unknown; getAttachment?: () => unknown }
  }
  const applied = s.appliedPose?.getAttachment?.() ?? s.appliedPose?.attachment
  return applied ?? null
}

export function slotGetColor(
  slot: unknown,
): { a: number; r: number; g: number; b: number } | null {
  const s = slot as {
    appliedPose?: { color?: { a: number; r: number; g: number; b: number } }
  }
  return s.appliedPose?.color ?? null
}

export function slotSetAlpha(slot: unknown, alpha: number): void {
  const color = slotGetColor(slot)
  if (color) color.a = alpha
}

export function slotSetAttachment(slot: unknown, attachment: unknown): void {
  const s = slot as {
    pose?: { setAttachment: (attachment: unknown) => void }
  }
  s.pose?.setAttachment(attachment)
}

/** Draw order slot list (Spine 4.3: drawOrder.appliedPose). */
export function getSkeletonDrawOrderSlots(skeleton: unknown): unknown[] {
  const s = skeleton as {
    drawOrder?: { appliedPose?: readonly unknown[] }
    slots?: unknown[]
  }
  const applied = s.drawOrder?.appliedPose
  if (Array.isArray(applied)) return [...applied]
  return s.slots ? [...s.slots] : []
}
