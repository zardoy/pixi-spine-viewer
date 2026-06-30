/**
 * Spine Toolbox: Convert SkeletonData (from .skel binary) to Spine JSON format.
 *
 * The Spine runtime has SkeletonBinary.readSkeletonData() but no built-in
 * writeSkeletonData. This module implements the reverse: SkeletonData → JSON.
 *
 * Ported for Spine 4.3 runtime types; runtime field access uses setup-pose APIs.
 *
 * @see https://en.esotericsoftware.com/spine-json-format
 */
// @ts-nocheck — toolbox utility; 4.3 setup-pose API differs from legacy field accessors

import type {
  SkeletonData,
  BoneData,
  SlotData,
  Skin,
  Attachment,
  Animation,
} from '@esotericsoftware/spine-core';
import {
  RegionAttachment,
  MeshAttachment,
  BoundingBoxAttachment,
  PathAttachment,
  PointAttachment,
  ClippingAttachment,
  IkConstraintData,
  TransformConstraintData,
  PathConstraintData,
} from '@esotericsoftware/spine-core';
import {
  AlphaTimeline,
  AttachmentTimeline,
  RGBATimeline,
  RGBTimeline,
  RotateTimeline,
  TranslateTimeline,
  TranslateXTimeline,
  TranslateYTimeline,
  ScaleTimeline,
  ScaleXTimeline,
  ScaleYTimeline,
  ShearTimeline,
  DrawOrderTimeline,
  EventTimeline,
  DeformTimeline,
  InheritTimeline,
} from '@esotericsoftware/spine-core';
import { BlendMode, Inherit } from '@esotericsoftware/spine-core';

function colorToHex(c: { r: number; g: number; b: number; a: number }): string {
  const hex = (x: number) => ('0' + Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16)).slice(-2);
  return hex(c.r) + hex(c.g) + hex(c.b) + hex(c.a);
}

function writeAttachment(att: Attachment, scale: number): Record<string, unknown> {
  const base: Record<string, unknown> = { name: att.name };

  if (att instanceof RegionAttachment) {
    base.type = 'region';
    base.path = att.path;
    base.x = att.x / scale;
    base.y = att.y / scale;
    base.scaleX = att.scaleX;
    base.scaleY = att.scaleY;
    base.rotation = att.rotation;
    base.width = att.width / scale;
    base.height = att.height / scale;
    if (att.color.r !== 1 || att.color.g !== 1 || att.color.b !== 1 || att.color.a !== 1) {
      base.color = colorToHex(att.color);
    }
    return base;
  }

  if (att instanceof MeshAttachment) {
    const parentMesh = att.getParentMesh?.() ?? null;
    base.type = parentMesh ? 'linkedmesh' : 'mesh';
    base.path = att.path;
    base.width = att.width / scale;
    base.height = att.height / scale;
    if (att.color.r !== 1 || att.color.g !== 1 || att.color.b !== 1 || att.color.a !== 1) {
      base.color = colorToHex(att.color);
    }
    if (parentMesh) {
      base.parent = parentMesh.name;
      base.skin = null; // would need skin name from context
      base.timelines = true;
    } else {
      base.vertices = Array.from(att.vertices);
      base.uvs = Array.from(att.regionUVs || att.uvs);
      base.triangles = Array.from(att.triangles);
      if (att.edges && att.edges.length > 0) base.edges = Array.from(att.edges);
      if (att.hullLength > 0) base.hull = att.hullLength / 2;
    }
    return base;
  }

  if (att instanceof BoundingBoxAttachment) {
    base.type = 'boundingbox';
    base.vertexCount = att.worldVerticesLength / 2;
    base.vertices = Array.from(att.vertices);
    if (att.color.r !== 1 || att.color.g !== 1 || att.color.b !== 1 || att.color.a !== 1) {
      base.color = colorToHex(att.color);
    }
    return base;
  }

  if (att instanceof PathAttachment) {
    base.type = 'path';
    base.closed = att.closed;
    base.constantSpeed = att.constantSpeed;
    base.vertexCount = att.worldVerticesLength / 2;
    base.vertices = Array.from(att.vertices);
    base.lengths = att.lengths.map((l) => l / scale);
    if (att.color.r !== 1 || att.color.g !== 1 || att.color.b !== 1 || att.color.a !== 1) {
      base.color = colorToHex(att.color);
    }
    return base;
  }

  if (att instanceof PointAttachment) {
    base.type = 'point';
    base.x = att.x / scale;
    base.y = att.y / scale;
    base.rotation = att.rotation;
    if (att.color.r !== 1 || att.color.g !== 1 || att.color.b !== 1 || att.color.a !== 1) {
      base.color = colorToHex(att.color);
    }
    return base;
  }

  if (att instanceof ClippingAttachment) {
    base.type = 'clipping';
    base.end = att.endSlot?.name ?? null;
    base.vertexCount = att.worldVerticesLength / 2;
    base.vertices = Array.from(att.vertices);
    if (att.color.r !== 1 || att.color.g !== 1 || att.color.b !== 1 || att.color.a !== 1) {
      base.color = colorToHex(att.color);
    }
    return base;
  }

  return base;
}

function writeAnimation(anim: Animation, data: SkeletonData, scale: number): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const slotMap: Record<string, Record<string, unknown[]>> = {};
  const boneMap: Record<string, Record<string, unknown[]>> = {};
  const ikMap: Record<string, unknown[]> = {};
  const transformMap: Record<string, unknown[]> = {};
  const pathMap: Record<string, Record<string, unknown[]>> = {};
  let drawOrder: unknown[] | null = null;
  const eventMap: unknown[] = [];
  const deformMap: Record<string, Record<string, unknown[]>> = {};

  for (const tl of anim.timelines) {
    if (tl instanceof AttachmentTimeline) {
      const slot = data.slots[tl.slotIndex];
      if (!slot) continue;
      const slotName = slot.name;
      if (!slotMap[slotName]) slotMap[slotName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        frames.push({
          time: tl.frames[i],
          name: tl.attachmentNames[i],
        });
      }
      slotMap[slotName].attachment = frames;
      continue;
    }

    // CurveTimeline1: frames[frame*2]=time, frames[frame*2+1]=value
    if (tl instanceof AlphaTimeline) {
      const slot = data.slots[tl.slotIndex];
      if (!slot) continue;
      const slotName = slot.name;
      if (!slotMap[slotName]) slotMap[slotName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        frames.push({
          time: tl.frames[i * 2],
          value: tl.frames[i * 2 + 1],
        });
      }
      slotMap[slotName].alpha = frames;
      continue;
    }

    // RGBATimeline: 5 entries per frame (time,r,g,b,a)
    if (tl instanceof RGBATimeline) {
      const slot = data.slots[tl.slotIndex];
      if (!slot) continue;
      const slotName = slot.name;
      if (!slotMap[slotName]) slotMap[slotName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        const o = i * 5;
        frames.push({
          time: tl.frames[o],
          color: colorToHex({
            r: tl.frames[o + 1],
            g: tl.frames[o + 2],
            b: tl.frames[o + 3],
            a: tl.frames[o + 4],
          }),
        });
      }
      slotMap[slotName].rgba = frames;
      continue;
    }

    // RGBTimeline: 4 entries per frame (time,r,g,b)
    if (tl instanceof RGBTimeline) {
      const slot = data.slots[tl.slotIndex];
      if (!slot) continue;
      const slotName = slot.name;
      if (!slotMap[slotName]) slotMap[slotName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        const o = i * 4;
        frames.push({
          time: tl.frames[o],
          color: colorToHex({
            r: tl.frames[o + 1],
            g: tl.frames[o + 2],
            b: tl.frames[o + 3],
            a: 1,
          }),
        });
      }
      slotMap[slotName].rgb = frames;
      continue;
    }

    if (tl instanceof RotateTimeline) {
      const bone = data.bones[tl.boneIndex];
      if (!bone) continue;
      const boneName = bone.name;
      if (!boneMap[boneName]) boneMap[boneName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        frames.push({
          time: tl.frames[i * 2],
          value: tl.frames[i * 2 + 1],
        });
      }
      boneMap[boneName].rotate = frames;
      continue;
    }

    // CurveTimeline2: 3 entries per frame (time, value1, value2)
    if (tl instanceof TranslateTimeline) {
      const bone = data.bones[tl.boneIndex];
      if (!bone) continue;
      const boneName = bone.name;
      if (!boneMap[boneName]) boneMap[boneName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        const o = i * 3;
        frames.push({
          time: tl.frames[o],
          x: tl.frames[o + 1] / scale,
          y: tl.frames[o + 2] / scale,
        });
      }
      boneMap[boneName].translate = frames;
      continue;
    }

    if (tl instanceof TranslateXTimeline) {
      const bone = data.bones[tl.boneIndex];
      if (!bone) continue;
      const boneName = bone.name;
      if (!boneMap[boneName]) boneMap[boneName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        frames.push({
          time: tl.frames[i * 2],
          x: tl.frames[i * 2 + 1] / scale,
        });
      }
      boneMap[boneName].translatex = frames;
      continue;
    }

    if (tl instanceof TranslateYTimeline) {
      const bone = data.bones[tl.boneIndex];
      if (!bone) continue;
      const boneName = bone.name;
      if (!boneMap[boneName]) boneMap[boneName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        frames.push({
          time: tl.frames[i * 2],
          y: tl.frames[i * 2 + 1] / scale,
        });
      }
      boneMap[boneName].translatey = frames;
      continue;
    }

    if (tl instanceof ScaleTimeline) {
      const bone = data.bones[tl.boneIndex];
      if (!bone) continue;
      const boneName = bone.name;
      if (!boneMap[boneName]) boneMap[boneName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        const o = i * 3;
        frames.push({
          time: tl.frames[o],
          x: tl.frames[o + 1],
          y: tl.frames[o + 2],
        });
      }
      boneMap[boneName].scale = frames;
      continue;
    }

    if (tl instanceof ScaleXTimeline) {
      const bone = data.bones[tl.boneIndex];
      if (!bone) continue;
      const boneName = bone.name;
      if (!boneMap[boneName]) boneMap[boneName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        frames.push({
          time: tl.frames[i * 2],
          x: tl.frames[i * 2 + 1],
        });
      }
      boneMap[boneName].scalex = frames;
      continue;
    }

    if (tl instanceof ScaleYTimeline) {
      const bone = data.bones[tl.boneIndex];
      if (!bone) continue;
      const boneName = bone.name;
      if (!boneMap[boneName]) boneMap[boneName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        frames.push({
          time: tl.frames[i * 2],
          y: tl.frames[i * 2 + 1],
        });
      }
      boneMap[boneName].scaley = frames;
      continue;
    }

    if (tl instanceof ShearTimeline) {
      const bone = data.bones[tl.boneIndex];
      if (!bone) continue;
      const boneName = bone.name;
      if (!boneMap[boneName]) boneMap[boneName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        const o = i * 3;
        frames.push({
          time: tl.frames[o],
          x: tl.frames[o + 1],
          y: tl.frames[o + 2],
        });
      }
      boneMap[boneName].shear = frames;
      continue;
    }

    // InheritTimeline: 2 entries per frame (time, inherit)
    if (tl instanceof InheritTimeline) {
      const bone = data.bones[tl.boneIndex];
      if (!bone) continue;
      const boneName = bone.name;
      if (!boneMap[boneName]) boneMap[boneName] = {};
      const frames: Record<string, unknown>[] = [];
      const inheritNames = ['Normal', 'OnlyTranslation', 'NoRotationOrReflection', 'NoScale', 'NoScaleOrReflection'];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        frames.push({
          time: tl.frames[i * 2],
          inherit: inheritNames[Math.round(tl.frames[i * 2 + 1])] ?? 'Normal',
        });
      }
      boneMap[boneName].inherit = frames;
      continue;
    }

    if (tl instanceof DrawOrderTimeline) {
      const frames: Record<string, unknown>[] = [];
      for (let i = 0; i < tl.getFrameCount(); i++) {
        const order = tl.drawOrders[i];
        // order[newPosition] = originalSlotIndex. Offsets: slot moves by (newPos - originalPos)
        const offsets: { slot: string; offset: number }[] = [];
        if (order) {
          for (let origIdx = 0; origIdx < order.length; origIdx++) {
            const newIdx = order.indexOf(origIdx);
            if (newIdx >= 0 && newIdx !== origIdx) {
              const slotName = data.slots[origIdx]?.name;
              if (slotName) offsets.push({ slot: slotName, offset: newIdx - origIdx });
            }
          }
        }
        frames.push({
          time: tl.frames[i],
          offsets,
        });
      }
      drawOrder = frames;
      continue;
    }

    if (tl instanceof EventTimeline) {
      for (let i = 0; i < tl.getFrameCount(); i++) {
        const ev = tl.events[i];
        if (!ev) continue;
        eventMap.push({
          time: tl.frames[i],
          name: ev.data.name,
          int: ev.intValue,
          float: ev.floatValue,
          string: ev.stringValue ?? undefined,
          audio: ev.data.audioPath ?? undefined,
          volume: ev.volume,
          balance: ev.balance,
        });
      }
      continue;
    }

    if (tl instanceof DeformTimeline) {
      const slot = data.slots[tl.slotIndex];
      if (!slot) continue;
      const slotName = slot.name;
      const attName = tl.attachment.name;
      if (!deformMap[slotName]) deformMap[slotName] = {};
      const frames: Record<string, unknown>[] = [];
      for (let fi = 0; fi < tl.getFrameCount(); fi++) {
        const verts = tl.vertices[fi];
        frames.push({
          time: tl.frames[fi],
          vertices: verts ? Array.from(verts) : [],
        });
      }
      deformMap[slotName][attName] = frames;
      continue;
    }

    // IK, Transform, Path constraint timelines - add if needed
    // For now skip unsupported timeline types
  }

  if (Object.keys(slotMap).length > 0) out.slots = slotMap;
  if (Object.keys(boneMap).length > 0) out.bones = boneMap;
  if (Object.keys(ikMap).length > 0) out.ik = ikMap;
  if (Object.keys(transformMap).length > 0) out.transform = transformMap;
  if (Object.keys(pathMap).length > 0) out.path = pathMap;
  if (drawOrder) out.draworder = drawOrder;
  if (eventMap.length > 0) out.events = eventMap;
  if (Object.keys(deformMap).length > 0) out.deform = deformMap;

  return out;
}

/**
 * Convert SkeletonData to Spine JSON format.
 * Use when you have loaded .skel binary and need JSON output.
 */
export function skeletonDataToJson(data: SkeletonData, scale = 1): Record<string, unknown> {
  const root: Record<string, unknown> = {};

  // Skeleton
  root.skeleton = {
    hash: data.hash ?? '',
    spine: data.version ?? '4.3',
    x: data.x,
    y: data.y,
    width: data.width,
    height: data.height,
    ...(data.referenceScale !== 100 && { referenceScale: data.referenceScale / scale }),
    ...(data.fps > 0 && { fps: data.fps }),
    ...(data.imagesPath && { images: data.imagesPath }),
    ...(data.audioPath && { audio: data.audioPath }),
  };

  // Bones
  root.bones = data.bones.map((b: BoneData) => {
    const o: Record<string, unknown> = { name: b.name };
    if (b.parent) o.parent = b.parent.name;
    if (b.length !== 0) o.length = b.length / scale;
    if (b.x !== 0) o.x = b.x / scale;
    if (b.y !== 0) o.y = b.y / scale;
    if (b.rotation !== 0) o.rotation = b.rotation;
    if (b.scaleX !== 1) o.scaleX = b.scaleX;
    if (b.scaleY !== 1) o.scaleY = b.scaleY;
    if (b.shearX !== 0) o.shearX = b.shearX;
    if (b.shearY !== 0) o.shearY = b.shearY;
    if (b.inherit !== Inherit.Normal) o.inherit = Inherit[b.inherit];
    if (b.skinRequired) o.skin = true;
    if (b.color.r !== 1 || b.color.g !== 1 || b.color.b !== 1 || b.color.a !== 1) {
      o.color = colorToHex(b.color);
    }
    return o;
  });

  // Slots
  root.slots = data.slots.map((s: SlotData) => {
    const o: Record<string, unknown> = {
      name: s.name,
      bone: s.boneData.name,
    };
    if (s.attachmentName) o.attachment = s.attachmentName;
    if (s.color.r !== 1 || s.color.g !== 1 || s.color.b !== 1 || s.color.a !== 1) {
      o.color = colorToHex(s.color);
    }
    if (s.darkColor) o.dark = colorToHex(s.darkColor);
    if (s.blendMode !== BlendMode.Normal) o.blend = BlendMode[s.blendMode].toLowerCase();
    if (!s.visible) o.visible = false;
    return o;
  });

  // Skins
  root.skins = data.skins.map((skin: Skin) => {
    const skinOut: Record<string, unknown> = { name: skin.name };
    const attachments: Record<string, Record<string, unknown>> = {};
    for (const entry of skin.getAttachments()) {
      const slotName = data.slots[entry.slotIndex]?.name;
      if (!slotName) continue;
      if (!attachments[slotName]) attachments[slotName] = {};
      attachments[slotName][entry.name] = writeAttachment(entry.attachment, scale);
    }
    skinOut.attachments = attachments;
    if (skin.bones.length > 0) skinOut.bones = skin.bones.map((b) => b.name);
    if (skin.constraints.length > 0) {
      const ik = skin.constraints.filter((c) => c instanceof IkConstraintData).map((c) => c.name);
      const transform = skin.constraints.filter((c) => c instanceof TransformConstraintData).map((c) => c.name);
      const path = skin.constraints.filter((c) => c instanceof PathConstraintData).map((c) => c.name);
      const physics = skin.constraints
        .filter((c) => data.physicsConstraints.some((pc) => pc.name === c.name))
        .map((c) => c.name);
      if (ik.length) skinOut.ik = ik;
      if (transform.length) skinOut.transform = transform;
      if (path.length) skinOut.path = path;
      if (physics.length) skinOut.physics = physics;
    }
    return skinOut;
  });

  // Events
  if (data.events.length > 0) {
    root.events = Object.fromEntries(
      data.events.map((e) => [
        e.name,
        {
          int: e.intValue,
          float: e.floatValue,
          string: e.stringValue ?? '',
          audio: e.audioPath ?? undefined,
          volume: e.volume,
          balance: e.balance,
        },
      ])
    );
  }

  // Animations
  const anims: Record<string, unknown> = {};
  for (const anim of data.animations) {
    anims[anim.name] = writeAnimation(anim, data, scale);
  }
  root.animations = anims;

  return root;
}
