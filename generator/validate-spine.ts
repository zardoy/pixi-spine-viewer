#!/usr/bin/env tsx
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { TextureAtlas, AtlasAttachmentLoader, SkeletonJson, SkeletonData } from '@esotericsoftware/spine-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validate Spine JSON file by loading it with the Spine runtime
 */
async function validateSpineJson(jsonPath: string, atlasPath: string, imagePath: string): Promise<boolean> {
  try {
    console.log(`\n🔍 Validating Spine files...`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  Atlas: ${atlasPath}`);
    console.log(`  Image: ${imagePath}`);
    
    // Check files exist
    if (!fs.existsSync(jsonPath)) {
      console.error(`❌ JSON file not found: ${jsonPath}`);
      return false;
    }
    
    if (!fs.existsSync(atlasPath)) {
      console.error(`❌ Atlas file not found: ${atlasPath}`);
      return false;
    }
    
    if (!fs.existsSync(imagePath)) {
      console.error(`❌ Image file not found: ${imagePath}`);
      return false;
    }
    
    // Read JSON
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    let jsonData: any;
    try {
      jsonData = JSON.parse(jsonContent);
    } catch (e) {
      console.error(`❌ Invalid JSON format:`, e);
      return false;
    }
    
    // Validate JSON structure
    if (!jsonData.skeleton) {
      console.error(`❌ Missing 'skeleton' property`);
      return false;
    }
    
    if (!jsonData.bones || !Array.isArray(jsonData.bones)) {
      console.error(`❌ Missing or invalid 'bones' array`);
      return false;
    }
    
    if (!jsonData.slots || !Array.isArray(jsonData.slots)) {
      console.error(`❌ Missing or invalid 'slots' array`);
      return false;
    }
    
    if (!jsonData.skins || !Array.isArray(jsonData.skins)) {
      console.error(`❌ Missing or invalid 'skins' array`);
      return false;
    }
    
    if (!jsonData.animations || typeof jsonData.animations !== 'object') {
      console.error(`❌ Missing or invalid 'animations' object`);
      return false;
    }
    
    console.log(`✅ JSON structure valid`);
    console.log(`  Bones: ${jsonData.bones.length}`);
    console.log(`  Slots: ${jsonData.slots.length}`);
    console.log(`  Skins: ${jsonData.skins.length}`);
    console.log(`  Animations: ${Object.keys(jsonData.animations).length}`);
    
    // Read atlas
    const atlasContent = fs.readFileSync(atlasPath, 'utf-8');
    
    // Create texture atlas
    let textureAtlas: TextureAtlas;
    try {
      textureAtlas = new TextureAtlas(atlasContent, (line: string) => {
        // Texture loader callback - for validation we can use a dummy texture
        // In real usage, this would load the actual image file
        // For validation, we just need the atlas structure to be correct
        return null as any; // Return null texture for validation
      });
      console.log(`✅ Atlas parsed successfully`);
      console.log(`  Pages: ${textureAtlas.pages.length}`);
      console.log(`  Regions: ${textureAtlas.regions.length}`);
      
      // Check if regions were parsed
      if (textureAtlas.regions.length === 0) {
        console.warn(`⚠️  No regions found in atlas - this might be because textures aren't loaded`);
        console.warn(`   Regions will be created when textures are loaded`);
      } else {
        console.log(`  Region names:`, textureAtlas.regions.slice(0, 5).map((r: any) => r.name).join(', '), '...');
      }
    } catch (e) {
      console.error(`❌ Failed to parse atlas:`, e);
      return false;
    }
    
    // Create attachment loader
    const atlasLoader = new AtlasAttachmentLoader(textureAtlas);
    
    // Try to load skeleton data
    let skeletonData: SkeletonData;
    try {
      const skeletonJson = new SkeletonJson(atlasLoader);
      skeletonData = skeletonJson.readSkeletonData(jsonData);
      console.log(`✅ Skeleton data loaded successfully`);
    } catch (e) {
      console.error(`❌ Failed to load skeleton data:`, e);
      if (e instanceof Error) {
        console.error(`   Message: ${e.message}`);
        console.error(`   Stack: ${e.stack}`);
      }
      return false;
    }
    
    // Validate animations
    const animations = skeletonData.animations;
    if (animations.length === 0) {
      console.warn(`⚠️  No animations found`);
    } else {
      console.log(`✅ Animations loaded: ${animations.length}`);
      animations.forEach(anim => {
        console.log(`  - ${anim.name} (${anim.duration.toFixed(2)}s)`);
        
        // Check animation has timelines
        if (!anim.timelines || anim.timelines.length === 0) {
          console.warn(`    ⚠️  Animation '${anim.name}' has no timelines`);
        } else {
          console.log(`    Total timelines: ${anim.timelines.length}`);
          
          // Inspect first few timelines to understand structure
          if (anim.timelines.length > 0) {
            const firstTimeline = anim.timelines[0] as any;
            console.log(`    Timeline structure sample:`);
            console.log(`      Type: ${firstTimeline.constructor.name}`);
            console.log(`      Slot: ${firstTimeline.slot?.data?.name || 'N/A'}`);
            console.log(`      Frames: ${firstTimeline.frames?.length || 0}`);
            if (firstTimeline.frames && firstTimeline.frames.length > 0) {
              const firstFrame = firstTimeline.frames[0];
              console.log(`      First frame keys:`, Object.keys(firstFrame));
              console.log(`      First frame sample:`, JSON.stringify(firstFrame, null, 2).substring(0, 200));
            }
          }
          
          // Group timelines by type using actual timeline class names
          const translateTimelines = anim.timelines.filter((t: any) => {
            const name = t.constructor.name;
            return name.includes('Translate') || name.includes('translate');
          });
          
          const colorTimelines = anim.timelines.filter((t: any) => {
            const name = t.constructor.name;
            // RGBATimeline, RGBTimeline, ColorTimeline all handle colors
            return name.includes('RGBA') || name.includes('RGB') || name.includes('Color') || name.includes('color');
          });
          
          const alphaTimelines = anim.timelines.filter((t: any) => {
            const name = t.constructor.name;
            return name.includes('Alpha') || name.includes('alpha');
          });
          
          console.log(`    Translate timelines: ${translateTimelines.length}`);
          console.log(`    Color timelines: ${colorTimelines.length}`);
          console.log(`    Alpha timelines: ${alphaTimelines.length}`);
          
          if (colorTimelines.length > 0) {
            console.log(`    ✅ Color animation detected (${colorTimelines.length} RGBATimeline timelines)`);
            const firstColorTimeline = colorTimelines[0];
            if (firstColorTimeline.frames && firstColorTimeline.frames.length > 0) {
              const firstFrame = firstColorTimeline.frames[0];
              const lastFrame = firstColorTimeline.frames[firstColorTimeline.frames.length - 1];
              console.log(`      Sample color timeline:`);
              console.log(`        Slot: ${firstColorTimeline.slot?.data?.name || 'unknown'}`);
              console.log(`        Frames: ${firstColorTimeline.frames.length}`);
              // RGBATimeline frames have r, g, b, a properties
              if (firstFrame.r !== undefined) {
                console.log(`        First frame RGBA: r=${firstFrame.r}, g=${firstFrame.g}, b=${firstFrame.b}, a=${firstFrame.a}`);
                console.log(`        Last frame RGBA: r=${lastFrame.r}, g=${lastFrame.g}, b=${lastFrame.b}, a=${lastFrame.a}`);
                // Convert to hex for readability
                const firstHex = `#${Math.round(firstFrame.r * 255).toString(16).padStart(2, '0')}${Math.round(firstFrame.g * 255).toString(16).padStart(2, '0')}${Math.round(firstFrame.b * 255).toString(16).padStart(2, '0')}${Math.round(firstFrame.a * 255).toString(16).padStart(2, '0')}`;
                const lastHex = `#${Math.round(lastFrame.r * 255).toString(16).padStart(2, '0')}${Math.round(lastFrame.g * 255).toString(16).padStart(2, '0')}${Math.round(lastFrame.b * 255).toString(16).padStart(2, '0')}${Math.round(lastFrame.a * 255).toString(16).padStart(2, '0')}`;
                console.log(`        First frame hex: ${firstHex}`);
                console.log(`        Last frame hex: ${lastHex}`);
              } else {
                console.log(`        First frame:`, firstFrame);
                console.log(`        Last frame:`, lastFrame);
              }
            }
          } else {
            console.warn(`    ⚠️  No color timelines found - checking if they're in JSON format...`);
            // Check JSON structure directly
            const animJson = jsonData.animations[anim.name];
            if (animJson && animJson.slots) {
              const slotNames = Object.keys(animJson.slots);
              const slotsWithRgba = slotNames.filter(slotName => animJson.slots[slotName].rgba);
              console.log(`    Slots with rgba in JSON: ${slotsWithRgba.length}`);
              if (slotsWithRgba.length > 0) {
                const firstSlot = animJson.slots[slotsWithRgba[0]];
                console.log(`    Sample rgba data:`, JSON.stringify(firstSlot.rgba, null, 2).substring(0, 300));
              }
            }
          }
        }
      });
    }
    
    // Validate bones
    const bones = skeletonData.bones;
    console.log(`✅ Bones validated: ${bones.length}`);
    
    // Validate slots
    const slots = skeletonData.slots;
    console.log(`✅ Slots validated: ${slots.length}`);
    
    // Validate skins
    const skins = skeletonData.skins;
    console.log(`✅ Skins validated: ${skins.length}`);
    skins.forEach(skin => {
      const attachments = (skin as any).attachments;
      if (attachments) {
        const attachmentCount = Object.values(attachments).reduce((sum: number, slotAtts: any) => {
          return sum + Object.keys(slotAtts).length;
        }, 0);
        console.log(`  - ${skin.name}: ${attachmentCount} attachments`);
      }
    });
    
    console.log(`\n✅ All validations passed!`);
    return true;
    
  } catch (error) {
    console.error(`❌ Validation failed:`, error);
    if (error instanceof Error) {
      console.error(`   Message: ${error.message}`);
      console.error(`   Stack: ${error.stack}`);
    }
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  const outputDir = path.join(__dirname, 'output');
  const jsonPath = path.join(outputDir, 'particles.json');
  const atlasPath = path.join(outputDir, 'particles.atlas');
  const imagePath = path.join(outputDir, 'particle.png');
  
  const isValid = await validateSpineJson(jsonPath, atlasPath, imagePath);
  
  if (isValid) {
    console.log(`\n🎉 Validation successful!`);
    process.exit(0);
  } else {
    console.error(`\n💥 Validation failed!`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
