/**
 * Centralized configuration for particle generation.
 * Edit this file to customize particle behavior.
 */

export type DirectionPreset = 'random' | 'left' | 'right' | 'up' | 'down';
export type Direction = DirectionPreset | { x: number; y: number };

/** Config option metadata for UI generation */
export type ConfigOptionType = 'number' | 'minMax' | 'checkbox' | 'string' | 'select' | 'title';

export interface PreviewValueResult {
  done: boolean;
  width?: number;
  height?: number;
}

export interface ConfigOptionMeta {
  key: string;
  type: ConfigOptionType;
  label?: string;
  description?: string;
  min?: number;
  max?: number;
  step?: number;
  default?: any;
  /** For select type: list of options with value and label */
  options?: Array<{ value: string; label: string }>;
  /** Whether this field is disabled in the UI */
  disabled?: boolean;
  /** Preview function: called on every canvas draw. Returns whether preview is done (time should reset). */
  previewValue?: (config: GenerateArea, time: number, ctx: CanvasRenderingContext2D) => PreviewValueResult;
}

export interface GenerateArea {
  /** Spawn area: [min, max] for x and y. Particles spawn randomly within this rect. */
  spawnArea: { x: [number, number]; y: [number, number] };
  /** Approximate number of particles. May vary slightly with random factor. */
  particleCount: number;
  /** Direction of movement. Default: 'random' */
  direction?: Direction;
  /** [min, max] seconds - how long each particle lives. Default: [0.3, 0.7] */
  maxParticleLife?: [number, number];
  /** [min, max] px - how far particles travel. Or single number for fixed. Enables "1sec over 40px" etc. */
  travelDistance?: [number, number] | number;
  /** How long the spawning window is (seconds). Particles spawn randomly over this period. Default: 5 */
  timelineDuration?: number;
  /** When true: seamless loop. Animation duration = timelineDuration. Start has pre-spawn particles (already in progress). */
  loop?: boolean;
  /** [min, max] scale factor for particle size. Random per particle if not specified. */
  particleSize?: [number, number];
  /** Initial rotation in degrees. */
  rotationStart?: number;
  /** Final rotation in degrees (at end of particle life). */
  rotationEnd?: number;
  /** [min, max] degrees per second - random rotation speed per particle. Overrides rotationStart/End if both set. */
  rotationSpeed?: [number, number];
  /** When 'allAtOnce', all particles fade in at the same time (spawnTimeOffset seconds from start). */
  spawnMode?: 'random' | 'allAtOnce';
  /** Seconds from start when all particles appear (used when spawnMode is 'allAtOnce'). Default 0.5 */
  spawnTimeOffset?: number;
}

export interface GeneratorConfig {
  /** Areas where particles are generated. */
  generateAreas: GenerateArea[];
  /** Global defaults (used when area omits them) */
  defaultMaxParticleLife?: [number, number];
  defaultTimelineDuration?: number;
  defaultTravelDistance?: [number, number] | number;
  defaultRotationStart?: number;
  defaultRotationEnd?: number;
  defaultRotationSpeed?: [number, number];
  /** Snap all keyframe times to nearest grid step (seconds). 0 or undefined = no snapping. */
  evenTimeKeyframes?: number;
  /** Number of duplicate images in atlas (same image, N regions). Particles randomly use 1..N. Default 1. */
  atlasImageCount?: number;
  defaultSpawnMode?: 'random' | 'allAtOnce';
  defaultSpawnTimeOffset?: number;
  /** Atlas and image paths */
  imageName?: string;
  /** Output paths */
  outputDir?: string;
  outputJsonName?: string;
  outputAtlasName?: string;
}

/** Example preview function: Visualize particle lifetime */
function previewParticleLife(config: GenerateArea, time: number, ctx: CanvasRenderingContext2D): PreviewValueResult {
  const width = 200;
  const height = 100;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, width, height);

  const lifeRange = config.maxParticleLife || [0.3, 0.7];
  const maxLife = lifeRange[1];
  const normalizedTime = (time % maxLife) / maxLife;

  // Draw particle life bar
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(10, 40, width - 20, 20);

  // Draw current time indicator
  ctx.fillStyle = '#ffffff';
  const x = 10 + (normalizedTime * (width - 20));
  ctx.fillRect(x - 2, 35, 4, 30);

  // Draw text
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px monospace';
  ctx.fillText(`Life: ${lifeRange[0]}-${lifeRange[1]}s`, 10, 20);
  ctx.fillText(`Time: ${time.toFixed(2)}s`, 10, height - 10);

  return { done: false, width, height };
}

/** Example preview function: Visualize travel distance */
function previewTravelDistance(config: GenerateArea, time: number, ctx: CanvasRenderingContext2D): PreviewValueResult {
  const width = 200;
  const height = 100;
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, width, height);

  const travelRange = Array.isArray(config.travelDistance)
    ? config.travelDistance
    : [config.travelDistance || 400, config.travelDistance || 1000];
  const normalizedTime = Math.min(time / 2, 1); // 2 second preview

  // Draw distance visualization
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, height / 2);
  const endX = 10 + (normalizedTime * (width - 20));
  ctx.lineTo(endX, height / 2);
  ctx.stroke();

  // Draw particle at current position
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(endX, height / 2, 4, 0, Math.PI * 2);
  ctx.fill();

  // Draw text
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px monospace';
  ctx.fillText(`Distance: ${travelRange[0]}-${travelRange[1]}px`, 10, 20);

  return { done: normalizedTime >= 1, width, height };
}

/** Metadata for config options (for future UI generation) */
export const CONFIG_OPTIONS_META: ConfigOptionMeta[] = [
  { key: 'particleCount', type: 'number', label: 'Particle Count', min: 1, max: 10000, step: 1 },
  { key: 'title1', type: 'title', label: 'Spawn Area' },
  { key: 'spawnAreaX', type: 'minMax', label: 'Spawn Area X', min: -5000, max: 5000, step: 10, description: 'X coordinate range [min, max]' },
  { key: 'spawnAreaY', type: 'minMax', label: 'Spawn Area Y', min: -5000, max: 5000, step: 10, description: 'Y coordinate range [min, max]' },
  { key: 'title2', type: 'title', label: 'Particle Life' },
  { key: 'maxParticleLife', type: 'minMax', label: 'Particle Life (in seconds)', min: 0.1, max: 10, step: 0.5, previewValue: previewParticleLife },
  { key: 'travelDistance', type: 'minMax', label: 'Travel Distance (px)', min: 0, max: 5000, step: 10, previewValue: previewTravelDistance },
  { key: 'particleSize', type: 'minMax', label: 'Particle Size (scale)', min: 0.1, max: 10, step: 0.5 },
  { key: 'rotationStart', type: 'number', label: 'Rotation Start (degrees)', min: -360, max: 360, step: 1 },
  { key: 'rotationEnd', type: 'number', label: 'Rotation End (degrees)', min: -360, max: 360, step: 1 },
  { key: 'rotationSpeed', type: 'minMax', label: 'Rotation Speed (deg/sec)', min: -720, max: 720, step: 1 },
  {
    key: 'direction',
    type: 'select',
    label: 'Direction',
    options: [
      { value: 'random', label: 'Random' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
      { value: 'up', label: 'Up' },
      { value: 'down', label: 'Down' },
    ],
    default: 'random'
  },
  { key: 'title3', type: 'title', label: 'Timeline' },
  { key: 'timelineDuration', type: 'number', label: 'Timeline Duration (seconds)', min: 0.1, max: 60, step: 1 },
  { key: 'loop', type: 'checkbox', label: 'Seamless Loop', disabled: true },
  {
    key: 'spawnMode',
    type: 'select',
    label: 'Spawn',
    options: [
      { value: 'random', label: 'Random over time' },
      { value: 'allAtOnce', label: 'All at once' },
    ],
    default: 'random',
    description: 'All at once: every particle fades in at the same time'
  },
  { key: 'spawnTimeOffset', type: 'number', label: 'Spawn time (s)', min: 0, max: 10, step: 0.1, description: 'When "All at once", seconds from start when particles appear' },
  { key: 'evenTimeKeyframes', type: 'number', label: 'Even Time Keyframes (seconds)', min: 0, max: 1, step: 0.01, description: 'Snap all keyframe times to grid (0 = disabled)' },
];

/** Default config for test generation: single 2500x2500 area, random direction, sane defaults */
export const DEFAULT_CONFIG: GeneratorConfig = {
  generateAreas: [
    {
      spawnArea: { x: [0, 1000], y: [0, 1000] },
      particleCount: 190,
      // direction: 'down',
      maxParticleLife: [0.3, 0.7],
      travelDistance: [400, 1000],
      timelineDuration: 3,
      particleSize: [1, 2],
      loop: false, // Disabled for UI by default
    },
  ],
  defaultMaxParticleLife: [0.3, 0.7],
  defaultTimelineDuration: 5,
  defaultTravelDistance: [400, 1200],
  imageName: 'particle.png',
  outputDir: 'output',
  outputJsonName: 'particles.json',
  outputAtlasName: 'particles.atlas',
};

/** Merge area config with defaults */
export function resolveAreaConfig(
  area: GenerateArea,
  defaults: GeneratorConfig
): Required<Omit<GenerateArea, 'loop' | 'rotationSpeed'>> & { loop?: boolean; rotationStart?: number; rotationEnd?: number; rotationSpeed?: [number, number] } {
  const defLife = area.maxParticleLife ?? defaults.defaultMaxParticleLife ?? [0.3, 0.7];
  const defTimeline = area.timelineDuration ?? defaults.defaultTimelineDuration ?? 5;
  const defDistance = area.travelDistance ?? defaults.defaultTravelDistance ?? [80, 200];

  const defRotStart = area.rotationStart ?? defaults.defaultRotationStart ?? 0;
  const defRotEnd = area.rotationEnd ?? defaults.defaultRotationEnd ?? 0;
  const defRotSpeed = area.rotationSpeed ?? defaults.defaultRotationSpeed;
  const spawnMode = area.spawnMode ?? defaults.defaultSpawnMode ?? 'random';
  const spawnTimeOffset = area.spawnTimeOffset ?? defaults.defaultSpawnTimeOffset ?? 0.5;

  return {
    spawnArea: area.spawnArea,
    particleCount: area.particleCount,
    direction: area.direction ?? 'random',
    maxParticleLife: defLife,
    travelDistance: defDistance,
    timelineDuration: defTimeline,
    loop: area.loop,
    particleSize: area.particleSize ?? [0.8, 1.2],
    rotationStart: defRotStart,
    rotationEnd: defRotEnd,
    rotationSpeed: defRotSpeed,
    spawnMode,
    spawnTimeOffset,
  };
}
