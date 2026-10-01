<script lang="ts" module>
	import * as SPINE_PIXI from '@esotericsoftware/spine-pixi-v8';

	export type Props = {
		boneName: Parameters<SPINE_PIXI.Spine['skeleton']['findBone']>[0];
		/** Design-space Y; applied to `bone.pose.y` (negated for Spine coords). */
		y?: number;
	};
</script>

<script lang="ts">
	import { propsSyncEffect } from 'pixi-svelte';
	import { getContextSpine } from './context';

	const props: Props = $props();
	const spine = getContextSpine();
	const bone = spine.skeleton.findBone(props.boneName);

	propsSyncEffect({ props, target: bone, ignore: ['boneName', 'y'] });
	$effect(() => {
		if (bone && props.y !== undefined) bone.pose.y = -props.y;
	});
</script>
