<script lang="ts" module>
	import * as PIXI from 'pixi.js';

	import type { OverwriteCursor } from '../types';

	export type Props = OverwriteCursor<PIXI.AnimatedSpriteOptions> & {
		animationSpeed?: PIXI.AnimatedSprite['animationSpeed'];
		loop?: PIXI.AnimatedSprite['loop'];
		play?: boolean;
	};
</script>

<script lang="ts">
	import { propsSyncEffect } from '../utils.svelte';
	import { getContextParent } from '../context.svelte';
	import { calculateSpriteDimensions } from './BaseSprite.svelte';

	const props: Props = $props();

	const parentContext = getContextParent();
	const animatedSprite = new PIXI.AnimatedSprite(props.textures ?? []);

	// width/height/scale applied below — Pixi `width` only mutates scale.x, so assigning
	// both `width` and `scale` via propsSync squashes non-square frames (buy-bonus cards).
	propsSyncEffect({
		props,
		target: animatedSprite,
		ignore: ['play', 'width', 'height', 'scale'],
	});

	$effect(() => {
		// `AnimatedSprite` accepts `Texture[]` *or* `FrameObject[]`, so the first entry may be
		// a `{ texture, time }` wrapper rather than the texture itself.
		const first = props.textures?.[0];
		const tex: PIXI.Texture | undefined =
			first && 'texture' in first ? first.texture : (first ?? animatedSprite.texture);
		const tw = tex?.orig?.width || tex?.width || 0;
		const th = tex?.orig?.height || tex?.height || 0;
		const scale =
			typeof props.scale === 'number'
				? props.scale
				: props.scale && typeof props.scale === 'object' && 'x' in props.scale
					? (props.scale.x ?? 1)
					: 1;
		const { width, height } = calculateSpriteDimensions(
			tw,
			th,
			props.width,
			props.height,
			scale,
		);
		if (width !== undefined) animatedSprite.width = width;
		if (height !== undefined) animatedSprite.height = height;
		else if (typeof props.scale === 'number') animatedSprite.scale.set(props.scale);
		else if (props.scale && typeof props.scale === 'object' && 'x' in props.scale) {
			animatedSprite.scale.set(props.scale.x ?? 1, props.scale.y ?? props.scale.x ?? 1);
		}
	});

	$effect(() => {
		if (props.play) {
			animatedSprite.gotoAndPlay(0);
		} else {
			animatedSprite.gotoAndStop(0);
		}
	});

	parentContext.addToParent(animatedSprite);
</script>
