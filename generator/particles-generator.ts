/**
 * Pure particle generation engine (no Node.js dependencies).
 * Exports functions for building particle instances and generating Spine JSON.
 */

import {
  resolveAreaConfig,
  type GeneratorConfig,
  type GenerateArea,
  type Direction,
} from './config';

export const ATTACHMENT_PATH = 'particle';

export interface ParticleInstance {
  spawnTime: number;
  duration: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  scale: number;
  rotationStart: number;
  rotationEnd: number;
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Get direction vector (unit length). "random" = random angle. */
function getDirectionVector(direction: Direction): { x: number; y: number } {
  if (typeof direction === 'object') {
    const { x, y } = direction;
    const len = Math.hypot(x, y) || 1;
    return { x: x / len, y: y / len };
  }
  switch (direction) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'up':
      return { x: 0, y: 1 };
    case 'down':
      return { x: 0, y: -1 };
    case 'random':
    default: {
      const angle = rand(0, Math.PI * 2);
      return { x: Math.cos(angle), y: Math.sin(angle) };
    }
  }
}

/** Snap time to nearest grid step if evenTimeKeyframes is enabled */
function snapTime(time: number, evenTimeKeyframes: number | undefined): number {
  if (!evenTimeKeyframes || evenTimeKeyframes <= 0) return time;
  return Math.round(time / evenTimeKeyframes) * evenTimeKeyframes;
}

/** Build particle instances from config. When loop is true, adds pre-spawn particles (spawnTime < 0)
 * so the start isn't empty, and uses timelineDuration as the loop period for seamless wrap.
 * For seamless loops, particles that end before totalDuration wrap around to continue from start. */
export function buildParticleInstances(
  areas: GenerateArea[],
  config: GeneratorConfig,
  _evenTimeKeyframes?: number
): ParticleInstance[] {
  const instances: ParticleInstance[] = [];

  for (const area of areas) {
    const resolved = resolveAreaConfig(area, config);
    const count = Math.max(1, Math.round(resolved.particleCount * rand(0.8, 1.2)));
    const [lifeMin, lifeMax] = resolved.maxParticleLife;
    const dist =
      typeof resolved.travelDistance === 'number'
        ? [resolved.travelDistance, resolved.travelDistance]
        : resolved.travelDistance;
    const [distMin, distMax] = dist;
    const [scaleMin, scaleMax] = resolved.particleSize;
    const [sxMin, sxMax] = resolved.spawnArea.x;
    const [syMin, syMax] = resolved.spawnArea.y;
    const loop = resolved.loop ?? false;
    const period = resolved.timelineDuration;

    // Rotation: either rotationStart/End (linear interpolate) or rotationSpeed (degrees/sec)
    const rotSpeed = resolved.rotationSpeed;
    const getRotation = (duration: number) => {
      if (rotSpeed) {
        const speed = rand(rotSpeed[0], rotSpeed[1]);
        return { start: 0, end: speed * duration };
      }
      return {
        start: resolved.rotationStart ?? 0,
        end: resolved.rotationEnd ?? 0,
      };
    };

    for (let i = 0; i < count; i++) {
      const duration = rand(lifeMin, lifeMax);
      const rot = getRotation(duration);

      let spawnTime: number;
      if (loop) {
        // For seamless loop: distribute spawn times to ensure particles are visible at both start and end
        // Strategy: ensure some particles extend past period so they wrap to t=0
        // This creates particles visible at totalDuration that match the state at t=0
        spawnTime = rand(-period, period);
        
        // Ensure some particles wrap: if spawnTime is close to period, particle will extend past it
        // This ensures we have particles wrapping from end to start
      } else {
        spawnTime = rand(0, period);
      }

      const distance = rand(distMin, distMax);
      const dir = getDirectionVector(resolved.direction);
      const startX = rand(sxMin, sxMax);
      const startY = rand(syMin, syMax);
      const endX = startX + dir.x * distance;
      const endY = startY + dir.y * distance;
      const scale = rand(scaleMin, scaleMax);

      instances.push({
        spawnTime,
        duration,
        startX,
        startY,
        endX,
        endY,
        scale,
        rotationStart: rot.start,
        rotationEnd: rot.end,
      });
    }
  }

  return instances;
}

/** Generate Spine JSON from particle instances.
 * Uses attachment timeline so particles are hidden when not animated (no white image at start).
 * Attachment: null = hide, name = show. Keyframes: hide before spawn, show at spawn, hide at end.
 * When loop is true and totalDuration is the loop period, particles that end after totalDuration
 * wrap around to continue seamlessly from the start. */
export function generateSpineJson(
  instances: ParticleInstance[],
  imageWidth: number,
  imageHeight: number,
  totalDuration: number,
  _imageName: string,
  loop: boolean = false,
  evenTimeKeyframes?: number
): any {
  const bones: any[] = [{ name: 'root' }];
  const slots: any[] = [];
  const skinAttachments: Record<string, Record<string, any>> = {};
  const animBones: Record<string, any> = {};
  const animSlots: Record<string, any> = {};

  instances.forEach((inst, index) => {
    const boneName = `bone_${index}`;
    const slotName = `slot_${index}`;
    const attName = `attachment_${index}`;

    bones.push({
      name: boneName,
      parent: 'root',
      x: 0,
      y: 0,
    });

    slots.push({
      name: slotName,
      bone: boneName,
      color: 'ffffffff',
      attachment: null,
    });

    if (!skinAttachments[slotName]) skinAttachments[slotName] = {};
    skinAttachments[slotName][attName] = {
      x: 0,
      y: 0,
      scaleX: inst.scale,
      scaleY: inst.scale,
      rotation: 0,
      width: imageWidth,
      height: imageHeight,
      path: ATTACHMENT_PATH,
    };

    const t0 = inst.spawnTime;
    const t1 = inst.spawnTime + inst.duration;
    
    // For seamless loop: particles need to wrap around
    // If particle ends before totalDuration, it should wrap and continue from t=0
    // If particle ends after totalDuration, it wraps at totalDuration and continues from t=0
    const needsWrap = loop && totalDuration > 0 && t1 > 0;

    const fadeStart = t0 + inst.duration * 0.7;
    const visibleStart = Math.max(0, t0);

    // Helper to snap time if evenTimeKeyframes is enabled
    const snap = (t: number) => snapTime(t, evenTimeKeyframes);

    const translateFrames: { time: number; x: number; y: number }[] = [];
    
    // Start position
    if (t0 < 0) {
      // Pre-spawn particle: interpolate position at t=0
      const progress = -t0 / inst.duration;
      const x0 = inst.startX + (inst.endX - inst.startX) * progress;
      const y0 = inst.startY + (inst.endY - inst.startY) * progress;
      translateFrames.push({ time: snap(0), x: x0, y: y0 });
    } else {
      translateFrames.push({ time: snap(t0), x: inst.startX, y: inst.startY });
    }
    
    // End position (or wrap position for loop)
    if (needsWrap) {
      if (t1 > totalDuration) {
        // Particle extends past totalDuration: add wrap keyframe at totalDuration
        const wrapProgress = (totalDuration - t0) / inst.duration;
        const wrapX = inst.startX + (inst.endX - inst.startX) * wrapProgress;
        const wrapY = inst.startY + (inst.endY - inst.startY) * wrapProgress;
        translateFrames.push({ time: snap(totalDuration), x: wrapX, y: wrapY });
        // Continue from t=0 (wrapped)
        translateFrames.push({ time: snap(0), x: inst.startX, y: inst.startY });
        // End position (wrapped)
        const remainingProgress = (t1 - totalDuration) / inst.duration;
        const endX = inst.startX + (inst.endX - inst.startX) * remainingProgress;
        const endY = inst.startY + (inst.endY - inst.startY) * remainingProgress;
        translateFrames.push({ time: snap(t1 - totalDuration), x: endX, y: endY });
      } else {
        // Particle ends before totalDuration: add end keyframe
        translateFrames.push({ time: snap(t1), x: inst.endX, y: inst.endY });
        // For seamless loop: at totalDuration, particle should be in same state as at t=0
        // Since this particle ends before totalDuration, we don't add wrap keyframes here
        // Instead, we rely on particles that wrap from end to start to fill the gap
      }
    } else {
      // Non-loop: just add end position
      if (t1 > 0 && t1 <= totalDuration) {
        translateFrames.push({ time: snap(t1), x: inst.endX, y: inst.endY });
      }
    }

    const progress0 = t0 < 0 ? -t0 / inst.duration : 0;
    const rot0 = inst.rotationStart + (inst.rotationEnd - inst.rotationStart) * progress0;
    const rotateFrames: { time: number; angle: number }[] = [];
    
    // Start rotation
    if (visibleStart > 0) {
      rotateFrames.push({ time: snap(visibleStart), angle: inst.rotationStart });
    } else {
      rotateFrames.push({ time: snap(0), angle: rot0 });
    }
    
    // End rotation (or wrap rotation for loop)
    if (needsWrap) {
      if (t1 > totalDuration) {
        // Particle extends past totalDuration: add wrap rotation at totalDuration
        const wrapProgress = (totalDuration - t0) / inst.duration;
        const wrapRot = inst.rotationStart + (inst.rotationEnd - inst.rotationStart) * wrapProgress;
        rotateFrames.push({ time: snap(totalDuration), angle: wrapRot });
        // Continue from t=0 (wrapped)
        rotateFrames.push({ time: snap(0), angle: inst.rotationStart });
        // End rotation (wrapped)
        const remainingProgress = (t1 - totalDuration) / inst.duration;
        const endRot = inst.rotationStart + (inst.rotationEnd - inst.rotationStart) * remainingProgress;
        rotateFrames.push({ time: snap(t1 - totalDuration), angle: endRot });
      } else {
        // Particle ends before totalDuration: add end rotation
        rotateFrames.push({ time: snap(t1), angle: inst.rotationEnd });
        // For seamless loop: rotation ends here, wrap handled by particles extending past totalDuration
      }
    } else {
      // Non-loop: just add end rotation
      if (t1 > 0 && t1 <= totalDuration) {
        rotateFrames.push({ time: snap(t1), angle: inst.rotationEnd });
      }
    }

    animBones[boneName] = {
      translate: translateFrames,
      rotate: rotateFrames,
    };

    const rgbaFrames: { time: number; color: string; curve?: string }[] = [];
    rgbaFrames.push({ time: snap(visibleStart), color: 'ffa500ff', curve: 'stepped' });
    rgbaFrames.push({ time: snap(Math.max(visibleStart, fadeStart)), color: 'ffa500ff' });
    
    // End fade (or wrap fade for loop)
    if (needsWrap) {
      if (t1 > totalDuration) {
        // Particle extends past totalDuration: fade at totalDuration, then fade in at t=0 (wrap)
        rgbaFrames.push({ time: snap(totalDuration), color: 'ffa50000' });
        rgbaFrames.push({ time: snap(0), color: 'ffa500ff', curve: 'stepped' });
        // Fade out at wrapped end time
        const fadeStartWrap = (t1 - totalDuration) + inst.duration * 0.7;
        rgbaFrames.push({ time: snap(Math.max(0, fadeStartWrap)), color: 'ffa500ff' });
        rgbaFrames.push({ time: snap(t1 - totalDuration), color: 'ffa50000' });
      } else {
        // Particle ends before totalDuration: fade at end
        rgbaFrames.push({ time: snap(t1), color: 'ffa50000' });
        // For seamless loop: particle fades out, wrap handled by particles extending past totalDuration
      }
    } else {
      // Non-loop: just fade out at end
      if (t1 > 0 && t1 <= totalDuration) {
        rgbaFrames.push({ time: snap(t1), color: 'ffa50000' });
      }
    }

    const attachmentFrames: { time: number; name?: string }[] = [];
    if (visibleStart > 0) {
      attachmentFrames.push({ time: snap(Math.max(0, visibleStart - 0.05)) });
    }
    attachmentFrames.push({ time: snap(visibleStart), name: attName });
    
    // End attachment (or wrap attachment for loop)
    if (needsWrap) {
      if (t1 > totalDuration) {
        // Particle extends past totalDuration: hide at totalDuration, show at t=0 (wrap)
        attachmentFrames.push({ time: snap(totalDuration) });
        attachmentFrames.push({ time: snap(0), name: attName });
        // Hide at wrapped end time
        attachmentFrames.push({ time: snap(t1 - totalDuration) });
      } else {
        // Particle ends before totalDuration: hide at end
        attachmentFrames.push({ time: snap(t1) });
        // For seamless loop: particle hides, wrap handled by particles extending past totalDuration
      }
    } else {
      // Non-loop: just hide at end
      if (t1 > 0 && t1 <= totalDuration) {
        attachmentFrames.push({ time: snap(t1) });
      }
    }

    animSlots[slotName] = {
      rgba: rgbaFrames,
      attachment: attachmentFrames,
    };
  });

  return {
    skeleton: {
      hash: 'particles',
      spine: '4.2',
      x: 0,
      y: 0,
      width: 12000,
      height: 12000,
      images: './',
    },
    bones,
    slots,
    skins: [{ name: 'default', attachments: skinAttachments }],
    animations: {
      particles: {
        bones: animBones,
        slots: animSlots,
      },
    },
  };
}

/** Generate atlas file content from image dimensions - single region covering full image */
export function generateAtlas(imageName: string, width: number, height: number): string {
  return [
    '',
    imageName,
    `size:${width},${height}`,
    'filter:Linear,Linear',
    ATTACHMENT_PATH,
    `bounds:0,0,${width},${height}`,
    `offsets:0,0,${width},${height}`,
  ].join('\n');
}
