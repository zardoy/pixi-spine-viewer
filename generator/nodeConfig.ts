/**
 * Node.js-specific config for particle generation.
 * Copy DEFAULT_CONFIG here to test Node.js version without changing default config.
 */

import type { GeneratorConfig } from './config';
import { DEFAULT_CONFIG } from './config';

/**
 * Test config for debugging loop behavior with minimal particles.
 * With only 3-5 particles and shorter lifetimes, you can easily see if they wrap correctly.
 * 
 * Expected behavior with loop=true:
 * - Particles should be evenly distributed across the timeline
 * - At t=0 and t=timelineDuration, particle count should be similar (seamless)
 * - Some particles will extend past timelineDuration and wrap to continue from t=0
 */
export const NODE_CONFIG: GeneratorConfig = {
  ...DEFAULT_CONFIG,
  // Override defaults here for Node.js testing
  generateAreas: [
    {
      spawnArea: { x: [400, 600], y: [400, 600] },
      particleCount: 1, // Low count for easy visual verification
      maxParticleLife: [1.0, 2.5], // Longer life to ensure wrapping
      travelDistance: [200, 500],
      timelineDuration: 3,
      particleSize: [1, 2],
      direction: 'random',
      loop: true,
    },
  ],
};
