<script lang="ts" module>
	import * as PIXI from 'pixi.js';

	export type Props = {
		slotName: string;
		/**
		 * When true (default), children render above all spine attachments (overlay zIndex).
		 * When false, uses spine-pixi `addSlotObject` — children inject at this slot's draw-order
		 * position so later batched slots (e.g. explosion) can paint on top.
		 */
		renderOnTop?: boolean;
		/** @deprecated Alias for `renderOnTop={false}` — zIndex-based "behind" cannot work with spine batching. */
		renderBehind?: boolean;
		followAttachmentTimeline?: boolean;
		followSlotColor?: boolean;
		/** Default true — follow bone even when slot is alpha 0 / off draw order (overlay path only). */
		alwaysShow?: boolean;
		children: Snippet;
	};
</script>

<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	import { getContextSpine, getContextSpineEventEmitter } from './context';
	import { createContextParent } from 'pixi-svelte';
	import {
		attachSlotOverlay,
		detachSlotOverlay,
		syncContainerToSlotBone,
	} from './spineSlotFollow';

	const props: Props = $props();
	const spine = getContextSpine();
	const slotContainer = new PIXI.Container();
	const spineEventEmitter = getContextSpineEventEmitter();
	const injectInDrawOrder = (props.renderBehind ?? false) || props.renderOnTop === false;
	const renderOnTop = !injectInDrawOrder;
	const followAttachmentTimeline = props.followAttachmentTimeline ?? true;
	const followSlotColor = props.followSlotColor ?? false;
	const alwaysShow = props.alwaysShow ?? true;

	let show = $state(!Boolean(spineEventEmitter));

	onMount(() => {
		const sync = () => {
			if (renderOnTop) {
				const ok = syncContainerToSlotBone(spine, props.slotName, slotContainer, {
					followAttachmentTimeline,
					followSlotColor,
					alwaysShow,
				});
				if (spineEventEmitter) show = ok;
				return;
			}

			if (!spineEventEmitter) return;
			const slot = spine.skeleton.findSlot(props.slotName);
			if (!slot) {
				show = false;
				return;
			}
			show = followAttachmentTimeline ? Boolean(slot.appliedPose.attachment) : true;
			if (alwaysShow && slot.bone.active) show = true;
		};

		if (renderOnTop) {
			attachSlotOverlay(spine, props.slotName, slotContainer);
			sync();
		} else {
			spine.addSlotObject(props.slotName, slotContainer, {
				followAttachmentTimeline,
				followSlotColor,
			});
		}

		if (spineEventEmitter) {
			spineEventEmitter.on('afterUpdateWorldTransforms', sync);
		} else if (renderOnTop) {
			spine.ticker.add(sync);
		}

		return () => {
			spineEventEmitter?.off('afterUpdateWorldTransforms', sync);
			spine.ticker.remove(sync);
			if (renderOnTop) {
				detachSlotOverlay(spine, slotContainer);
			} else {
				spine.removeSlotObject(slotContainer);
			}
		};
	});

	createContextParent(slotContainer);
</script>

{#if show}
	{@render props.children()}
{/if}
