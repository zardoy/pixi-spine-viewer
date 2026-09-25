<script lang="ts" module>
	import * as PIXI from 'pixi.js';

	import type { OverwriteCursor } from '../types';

	export type Props = OverwriteCursor<PIXI.SpriteOptions> & {
		isMask?: boolean;
	};

	/**
	 * slots-engine `calculateSpriteDimensions`.
	 * Width-only / height-only keep texture aspect; `scale` is multiplied into the result
	 * (React sets `sprite.width/height` to the final pixels and does not also set `scale`).
	 */
	export function calculateSpriteDimensions(
		textureWidth: number,
		textureHeight: number,
		widthProp?: number,
		heightProp?: number,
		scale: number = 1,
	): { width?: number; height?: number } {
		if (!textureWidth || !textureHeight) return {};

		if (widthProp !== undefined && heightProp === undefined) {
			return {
				width: widthProp * scale,
				height: ((widthProp * textureHeight) / textureWidth) * scale,
			};
		}
		if (heightProp !== undefined && widthProp === undefined) {
			return {
				width: ((heightProp * textureWidth) / textureHeight) * scale,
				height: heightProp * scale,
			};
		}
		if (widthProp !== undefined && heightProp !== undefined) {
			return { width: widthProp * scale, height: heightProp * scale };
		}
		return {};
	}
</script>

<script lang="ts">
	import { propsSyncEffect } from '../utils.svelte';
	import { getContextParent } from '../context.svelte';

	const props: Props = $props();

	const parentContext = getContextParent();
	const sprite = new PIXI.Sprite(props.texture);

	// width/height/scale applied below so a single axis preserves texture aspect
	// (slots-engine Sprite: final size = size prop × scale).
	propsSyncEffect({ props, target: sprite, ignore: ['isMask', 'width', 'height', 'scale'] });

	$effect(() => {
		const texture = props.texture;
		const tw = texture?.orig?.width || texture?.width || 0;
		const th = texture?.orig?.height || texture?.height || 0;
		const scale = typeof props.scale === 'number' ? props.scale : 1;
		const { width, height } = calculateSpriteDimensions(tw, th, props.width, props.height, scale);
		if (width !== undefined) sprite.width = width;
		if (height !== undefined) sprite.height = height;
		else if (typeof props.scale === 'number') sprite.scale.set(props.scale);
	});

	$effect(() => {
		if (props.isMask !== undefined) {
			parentContext.parent.mask = props.isMask ? sprite : null;
		}
	});

	parentContext.addToParent(sprite);
</script>
