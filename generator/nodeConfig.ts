/**
 * Node.js-specific config for particle generation.
 * Copy DEFAULT_CONFIG here to test Node.js version without changing default config.
 */

import type { GeneratorConfig } from './config';
import { DEFAULT_CONFIG } from './config';

export const NODE_CONFIG: GeneratorConfig = {
  ...DEFAULT_CONFIG,
  // Override defaults here for Node.js testing
  generateAreas: [
    {
      spawnArea: { x: [0, 1000], y: [0, 1000] },
      particleCount: 190,
      maxParticleLife: [0.3, 0.7],
      travelDistance: [400, 1000],
      timelineDuration: 3,
      particleSize: [1, 2],
      loop: true,
    },
  ],
};
