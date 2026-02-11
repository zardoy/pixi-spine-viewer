#!/usr/bin/env tsx
/**
 * Node.js CLI entry point for particle generation.
 * Handles file I/O and calls the pure engine code from particles-generator.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sizeOf from 'image-size';
import {
  resolveAreaConfig,
  type GeneratorConfig,
} from './config';
import { NODE_CONFIG } from './nodeConfig';
import {
  buildParticleInstances,
  generateSpineJson,
  ATTACHMENT_PATH,
} from './particles-generator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Read image dimensions */
function getImageDimensions(imagePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(imagePath);
  const dim = sizeOf(buffer);
  if (!dim.width || !dim.height) throw new Error(`Could not read image dimensions: ${imagePath}`);
  return { width: dim.width, height: dim.height };
}

/** Generate atlas file from image dimensions - single region covering full image */
function generateAtlas(
  imageName: string,
  width: number,
  height: number,
  outputPath: string
): void {
  const out: string[] = [
    '',
    imageName,
    `size:${width},${height}`,
    'filter:Linear,Linear',
    ATTACHMENT_PATH,
    `bounds:0,0,${width},${height}`,
    `offsets:0,0,${width},${height}`,
  ];
  fs.writeFileSync(outputPath, out.join('\n'), 'utf-8');
}

function main() {
  const config: GeneratorConfig = { ...NODE_CONFIG };
  const refsDir = path.join(__dirname, 'refs');
  const imageSource = path.join(refsDir, config.imageName ?? 'particle.png');
  const outputDir = path.join(__dirname, config.outputDir ?? 'output');

  if (!fs.existsSync(imageSource)) {
    throw new Error(`Image not found: ${imageSource}`);
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const { width, height } = getImageDimensions(imageSource);
  console.log(`Image: ${config.imageName} (${width}x${height})`);

  const instances = buildParticleInstances(
    config.generateAreas,
    config,
    config.evenTimeKeyframes
  );
  console.log(`Generated ${instances.length} particle instances`);

  // Determine if any area has loop enabled
  const hasLoop = config.generateAreas.some((a) => {
    const r = resolveAreaConfig(a, config);
    return r.loop ?? false;
  });

  const totalDuration =
    Math.max(
      ...config.generateAreas.map((a) => {
        const r = resolveAreaConfig(a, config);
        if (r.loop) {
          return r.timelineDuration;
        }
        return r.timelineDuration + r.maxParticleLife[1];
      })
    ) || 6;

  const spineJson = generateSpineJson(
    instances,
    width,
    height,
    totalDuration,
    config.imageName ?? 'particle.png',
    hasLoop,
    config.evenTimeKeyframes
  );

  const jsonPath = path.join(outputDir, config.outputJsonName ?? 'particles.json');
  fs.writeFileSync(jsonPath, JSON.stringify(spineJson, null, 2), 'utf-8');
  console.log(`Generated: ${jsonPath}`);

  const atlasOutputPath = path.join(
    outputDir,
    config.outputAtlasName ?? 'particles.atlas'
  );
  generateAtlas(
    config.imageName ?? 'particle.png',
    width,
    height,
    atlasOutputPath
  );
  console.log(`Generated: ${atlasOutputPath}`);

  const imageDest = path.join(outputDir, config.imageName ?? 'particle.png');
  fs.copyFileSync(imageSource, imageDest);
  console.log(`Copied: ${imageDest}`);

  console.log('\nDone!');
}

main();
