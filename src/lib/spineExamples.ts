/**
 * List of example Spine animations from official sources
 */

export interface SpineExample {
  name: string;
  jsonUrl: string;
  atlasUrl: string;
  description: string;
}

export const SPINE_EXAMPLES: SpineExample[] = [
  {
    name: "Cloud Pot (physics)",
    jsonUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples/cloud-pot/export/cloud-pot.json",
    atlasUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples/cloud-pot/export/cloud-pot.atlas",
    description: "Animated cloud pot"
  },
  {
    name: "Dragon",
    jsonUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples/dragon/export/dragon-ess.json",
    atlasUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples/dragon/export/dragon.atlas",
    description: "Flying dragon"
  },
  {
    name: "Owl (texture transform)",
    jsonUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples/owl/export/owl-pro.json",
    atlasUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples/owl/export/owl.atlas",
    description: "Animated owl"
  },
  {
    name: "Powerup",
    jsonUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples/powerup/export/powerup-ess.json",
    atlasUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples/powerup/export/powerup.atlas",
    description: "Power-up animation effect"
  },
  {
    name: "Vine",
    jsonUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples/vine/export/vine-pro.json",
    atlasUrl: "https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples/vine/export/vine.atlas",
    description: "Growing vine animation"
  },
];
