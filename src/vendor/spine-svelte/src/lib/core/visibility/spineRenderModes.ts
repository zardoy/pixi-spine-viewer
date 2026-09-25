import { ColorMatrixFilter, Filter, GlProgram } from 'pixi.js'

/**
 * `silhouette` = flat colour preserving texture alpha (shows exact shapes),
 * `ghosted` = fully desaturated grey preserving alpha/shape.
 */
export type SpineRenderMode = 'normal' | 'silhouette' | 'ghosted'

const silhouetteVertex = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`

const silhouetteFragment = `in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec3 uSilhouetteColor;
void main(void) {
  float a = texture(uTexture, vTextureCoord).a;
  gl_FragColor = vec4(uSilhouetteColor * a, a);
}`

// Filters are stateless here, so one instance per mode is shared across every spine.
let silhouetteFilter: Filter | null = null
let ghostedFilter: ColorMatrixFilter | null = null

export function getSilhouetteFilter(): Filter {
	if (!silhouetteFilter) {
		silhouetteFilter = new Filter({
			glProgram: new GlProgram({ vertex: silhouetteVertex, fragment: silhouetteFragment }),
			resources: {
				uniforms: {
					uSilhouetteColor: { value: new Float32Array([0.55, 0.55, 0.55]), type: 'vec3<f32>' },
				},
			},
		})
	}
	return silhouetteFilter
}

export function getGhostedFilter(): ColorMatrixFilter {
	if (!ghostedFilter) {
		ghostedFilter = new ColorMatrixFilter()
		ghostedFilter.desaturate()
	}
	return ghostedFilter
}

export function getRenderModeFilter(mode: SpineRenderMode | undefined): Filter | null {
	if (mode === 'silhouette') return getSilhouetteFilter()
	if (mode === 'ghosted') return getGhostedFilter()
	return null
}
