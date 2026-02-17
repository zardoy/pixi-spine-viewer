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

/** Build particle instances from config. When loop is true, distributes particles evenly within
 * the loop period to ensure seamless looping - particles visible at t=0 match those at t=duration.
 * Strategy: spawn particles across the period, and particles extending past will wrap to start. */
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
        // For seamless loop: distribute spawn times uniformly across [0, period)
        // Particles that would end after period will wrap around to continue from start
        // This ensures the particle density at t=0 matches t=period (seamless loop)
        spawnTime = rand(0, period);
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
    
    // For seamless loop: particles that extend past totalDuration wrap to continue from start
    const needsWrap = loop && t1 > totalDuration;

    const fadeStart = t0 + inst.duration * 0.7;

    // Helper to snap time if evenTimeKeyframes is enabled
    const snap = (t: number) => snapTime(t, evenTimeKeyframes);

    const translateFrames: { time: number; x: number; y: number }[] = [];
    
    // Start position
    translateFrames.push({ time: snap(t0), x: inst.startX, y: inst.startY });
    
    // End position (or wrap position for loop)
    if (needsWrap) {
      // Particle extends past totalDuration: interpolate position at totalDuration, then wrap
      const progressAtEnd = (totalDuration - t0) / inst.duration;
      const xAtEnd = inst.startX + (inst.endX - inst.startX) * progressAtEnd;
      const yAtEnd = inst.startY + (inst.endY - inst.startY) * progressAtEnd;
      translateFrames.push({ time: snap(totalDuration), x: xAtEnd, y: yAtEnd });
      
      // Wrapped portion: calculate final position at (t1 - totalDuration)
      const wrappedDuration = t1 - totalDuration;
      const finalProgress = wrappedDuration / inst.duration;
      const finalX = inst.startX + (inst.endX - inst.startX) * finalProgress;
      const finalY = inst.startY + (inst.endY - inst.startY) * finalProgress;
      translateFrames.push({ time: snap(wrappedDuration), x: finalX, y: finalY });
    } else {
      // Particle ends within totalDuration or non-loop: just add end position
      const endTime = Math.min(t1, totalDuration);
      translateFrames.push({ time: snap(endTime), x: inst.endX, y: inst.endY });
    }

    const rotateFrames: { time: number; angle: number }[] = [];
    
    // Start rotation
    rotateFrames.push({ time: snap(t0), angle: inst.rotationStart });
    
    // End rotation (or wrap rotation for loop)
    if (needsWrap) {
      // Particle extends past totalDuration: interpolate rotation at totalDuration, then wrap
      const progressAtEnd = (totalDuration - t0) / inst.duration;
      const rotAtEnd = inst.rotationStart + (inst.rotationEnd - inst.rotationStart) * progressAtEnd;
      rotateFrames.push({ time: snap(totalDuration), angle: rotAtEnd });
      
      // Wrapped portion: calculate final rotation at (t1 - totalDuration)
      const wrappedDuration = t1 - totalDuration;
      const finalProgress = wrappedDuration / inst.duration;
      const finalRot = inst.rotationStart + (inst.rotationEnd - inst.rotationStart) * finalProgress;
      rotateFrames.push({ time: snap(wrappedDuration), angle: finalRot });
    } else {
      // Particle ends within totalDuration or non-loop: just add end rotation
      const endTime = Math.min(t1, totalDuration);
      rotateFrames.push({ time: snap(endTime), angle: inst.rotationEnd });
    }

    animBones[boneName] = {
      translate: translateFrames,
      rotate: rotateFrames,
    };

    const rgbaFrames: { time: number; color: string; curve?: string }[] = [];
    rgbaFrames.push({ time: snap(t0), color: 'ffa500ff', curve: 'stepped' });
    rgbaFrames.push({ time: snap(Math.max(t0, fadeStart)), color: 'ffa500ff' });
    
    // End fade (or wrap fade for loop)
    if (needsWrap) {
      // Particle extends past totalDuration: fade at totalDuration, then continue fading after wrap
      rgbaFrames.push({ time: snap(totalDuration), color: 'ffa50000' });
      
      // Wrapped portion: fade in at start, then fade out at end
      const wrappedDuration = t1 - totalDuration;
      const wrappedFadeStart = wrappedDuration * 0.7;
      rgbaFrames.push({ time: snap(0), color: 'ffa500ff', curve: 'stepped' });
      rgbaFrames.push({ time: snap(wrappedFadeStart), color: 'ffa500ff' });
      rgbaFrames.push({ time: snap(wrappedDuration), color: 'ffa50000' });
    } else {
      // Particle ends within totalDuration or non-loop: just fade out at end
      const endTime = Math.min(t1, totalDuration);
      rgbaFrames.push({ time: snap(endTime), color: 'ffa50000' });
    }

    const attachmentFrames: { time: number; name?: string }[] = [];
    if (t0 > 0) {
      attachmentFrames.push({ time: snap(Math.max(0, t0 - 0.05)) });
    }
    attachmentFrames.push({ time: snap(t0), name: attName });
    
    // End attachment (or wrap attachment for loop)
    if (needsWrap) {
      // Particle extends past totalDuration: hide at totalDuration, show at t=0 (wrap), hide at wrapped end
      attachmentFrames.push({ time: snap(totalDuration) });
      attachmentFrames.push({ time: snap(0), name: attName });
      attachmentFrames.push({ time: snap(t1 - totalDuration) });
    } else {
      // Particle ends within totalDuration or non-loop: just hide at end
      const endTime = Math.min(t1, totalDuration);
      attachmentFrames.push({ time: snap(endTime) });
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
