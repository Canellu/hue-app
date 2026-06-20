import {
  convertHueColorToCss,
  distinctHexes,
  paletteToCss,
} from "@/features/space-screen/utils/color";

export interface HueGallerySceneColor {
  xy: [number, number] | null;
  mirek: number | null;
  hex: string;
}

export interface HueGalleryScenePreset {
  id: string;
  name: string;
  brightness: number;
  colors: HueGallerySceneColor[];
}

export interface HueGallerySceneSection {
  id: string;
  title: string;
  description: string;
  scenes: HueGalleryScenePreset[];
}

const color = (x: number, y: number): HueGallerySceneColor => ({
  xy: [x, y],
  mirek: null,
  hex: convertHueColorToCss({ xy: [x, y] }) ?? "#ffffff",
});

const white = (mirek: number, xy: [number, number]): HueGallerySceneColor => ({
  xy,
  mirek,
  hex: convertHueColorToCss({ mirek }) ?? "#ffffff",
});

const preset = (
  id: string,
  name: string,
  brightness: number,
  colors: HueGallerySceneColor[],
): HueGalleryScenePreset => ({ id, name, brightness, colors });

export const gallerySceneBubbleCss = (
  preset: HueGalleryScenePreset,
): string | null =>
  paletteToCss(distinctHexes(preset.colors.map((c) => c.hex)));

export const HUE_SCENE_GALLERY_SECTIONS: HueGallerySceneSection[] = [
  {
    id: "defaults",
    title: "Defaults",
    description:
      "Philips Hue's built-in scenes — whites for every task plus the warm Nightlight and Rest.",
    // Exact values mirror the bridge's default scenes (mirek + brightness for
    // the whites; the warm xy/mirek pair for Nightlight and Rest). The xy on the
    // white presets is the blackbody equivalent used as a fallback for bulbs
    // without color-temperature support.
    scenes: [
      preset("relax", "Relax", 56, [white(447, [0.5748, 0.3887])]),
      preset("read", "Read", 100, [white(346, [0.5066, 0.3845])]),
      preset("concentrate", "Concentrate", 100, [white(233, [0.4034, 0.3601])]),
      preset("energize", "Energize", 100, [white(156, [0.3282, 0.334])]),
      preset("cool-bright", "Cool bright", 100, [white(250, [0.4198, 0.3652])]),
      preset("bright", "Bright", 100, [white(370, [0.5244, 0.3875])]),
      preset("dimmed", "Dimmed", 30, [white(370, [0.5244, 0.3875])]),
      preset("nightlight", "Nightlight", 10, [white(500, [0.561, 0.4042])]),
      preset("rest", "Rest", 35, [white(500, [0.561, 0.4042])]),
      preset("blossom", "Blossom", 80, [
        color(0.24, 0.2761),
        color(0.2674, 0.3018),
        color(0.3972, 0.4025),
        color(0.4419, 0.4164),
        color(0.5119, 0.4249),
      ]),
    ],
  },
  {
    id: "cozy",
    title: "Cozy",
    description: "Warm, low-slung palettes for evenings and soft rooms.",
    scenes: [
      preset("copper-horizon", "Copper horizon", 58, [
        color(0.4162, 0.4341),
        color(0.5862, 0.3575),
        color(0.644, 0.3348),
        color(0.5246, 0.3864),
        color(0.4801, 0.4309),
      ]),
      preset("island-afterglow", "Island afterglow", 44, [
        color(0.363, 0.2716),
        color(0.4731, 0.3723),
        color(0.5813, 0.3636),
        color(0.2412, 0.1171),
        color(0.3044, 0.1803),
      ]),
      preset("gilded-water", "Gilded water", 65, [
        color(0.5063, 0.4474),
        color(0.5584, 0.4083),
        color(0.5695, 0.3999),
        color(0.482, 0.4489),
        color(0.496, 0.4424),
      ]),
      preset("ember-rose", "Ember rose", 40, [
        color(0.3826, 0.3117),
        color(0.5321, 0.2758),
        color(0.4557, 0.2951),
        color(0.4189, 0.3031),
        color(0.4903, 0.2839),
      ]),
      preset("hearth-haze", "Hearth haze", 40, [
        color(0.5734, 0.327),
        color(0.5496, 0.3804),
        color(0.5826, 0.3426),
        color(0.5687, 0.3667),
        color(0.5258, 0.3976),
      ]),
      preset("velvet-dusk", "Velvet dusk", 50, [
        color(0.5189, 0.3924),
        color(0.5493, 0.3702),
        color(0.4416, 0.2813),
        color(0.4996, 0.293),
        color(0.5579, 0.3308),
      ]),
      preset("amber-meadow", "Amber meadow", 45, [
        color(0.5787, 0.3787),
        color(0.5242, 0.4027),
        color(0.5529, 0.3942),
        color(0.4796, 0.3959),
        color(0.5015, 0.401),
      ]),
      preset("rose-boulevard", "Rose boulevard", 52, [
        color(0.607, 0.313),
        color(0.503, 0.251),
        color(0.372, 0.192),
        color(0.526, 0.368),
        color(0.667, 0.304),
      ]),
    ],
  },
  {
    id: "refreshing",
    title: "Refreshing",
    description: "Pastels, pale greens, and crisp colors for lighter spaces.",
    scenes: [
      preset("petal-breeze", "Petal breeze", 80, [
        color(0.5119, 0.4249),
        color(0.3972, 0.4025),
        color(0.4419, 0.4164),
        color(0.2674, 0.3018),
        color(0.24, 0.2761),
      ]),
      preset("polar-ribbon", "Polar ribbon", 60, [
        color(0.178, 0.184),
        color(0.192, 0.382),
        color(0.245, 0.356),
        color(0.154, 0.112),
        color(0.297, 0.454),
      ]),
      preset("garden-pop", "Garden pop", 80, [
        color(0.3015, 0.5512),
        color(0.4032, 0.5026),
        color(0.4711, 0.4453),
        color(0.5421, 0.3389),
        color(0.4138, 0.2021),
      ]),
      preset("violet-sprout", "Violet sprout", 80, [
        color(0.4195, 0.4216),
        color(0.3818, 0.485),
        color(0.2877, 0.2519),
        color(0.2194, 0.1332),
        color(0.4212, 0.38),
      ]),
      preset("soft-treasure", "Soft treasure", 80, [
        color(0.3951, 0.3606),
        color(0.3493, 0.209),
        color(0.3904, 0.4336),
        color(0.3426, 0.242),
        color(0.4384, 0.3976),
      ]),
      preset("golden-stem", "Golden stem", 90, [
        color(0.5916, 0.3833),
        color(0.485, 0.4543),
        color(0.5475, 0.4151),
        color(0.4451, 0.4556),
        color(0.4759, 0.4481),
      ]),
      preset("freshwater-bloom", "Freshwater bloom", 76, [
        color(0.312, 0.52),
        color(0.217, 0.363),
        color(0.402, 0.465),
        color(0.267, 0.301),
        color(0.188, 0.25),
      ]),
      preset("high-summer", "High summer", 88, [
        color(0.461, 0.47),
        color(0.535, 0.427),
        color(0.373, 0.409),
        color(0.566, 0.404),
        color(0.499, 0.444),
      ]),
    ],
  },
  {
    id: "party-vibes",
    title: "Party vibes",
    description: "Saturated city and travel palettes with more contrast.",
    scenes: [
      preset("neon-shore", "Neon shore", 80, [
        color(0.3678, 0.1839),
        color(0.154, 0.0799),
        color(0.5573, 0.3226),
        color(0.1561, 0.1606),
        color(0.4548, 0.2433),
      ]),
      preset("reef-party", "Reef party", 80, [
        color(0.5121, 0.4371),
        color(0.6156, 0.2808),
        color(0.6696, 0.3237),
        color(0.5352, 0.2797),
        color(0.6153, 0.3655),
      ]),
      preset("carnival-pulse", "Carnival pulse", 80, [
        color(0.4692, 0.4536),
        color(0.5353, 0.2909),
        color(0.5527, 0.2686),
        color(0.2588, 0.1266),
        color(0.5473, 0.3735),
      ]),
      preset("lantern-row", "Lantern row", 60, [
        color(0.5685, 0.4007),
        color(0.6752, 0.3004),
        color(0.5649, 0.3275),
        color(0.6545, 0.295),
        color(0.6362, 0.2999),
      ]),
      preset("club-sunset", "Club sunset", 49, [
        color(0.5974, 0.36),
        color(0.5286, 0.4068),
        color(0.5714, 0.3806),
        color(0.4376, 0.4577),
        color(0.4787, 0.4495),
      ]),
      preset("market-neon", "Market neon", 36, [
        color(0.6222, 0.3604),
        color(0.5532, 0.2547),
        color(0.513, 0.4237),
        color(0.5935, 0.308),
        color(0.4519, 0.2677),
      ]),
      preset("midnight-metro", "Midnight metro", 47, [
        color(0.5614, 0.406),
        color(0.294, 0.151),
        color(0.178, 0.091),
        color(0.413, 0.201),
        color(0.243, 0.128),
      ]),
      preset("soul-stage", "Soul stage", 62, [
        color(0.64, 0.33),
        color(0.51, 0.25),
        color(0.18, 0.08),
        color(0.34, 0.16),
        color(0.55, 0.4),
      ]),
    ],
  },
  {
    id: "futuristic",
    title: "Futuristic",
    description: "High-chroma blues, violets, magentas, and neon accents.",
    scenes: [
      preset("chrome-alley", "Chrome alley", 68, [
        color(0.155, 0.078),
        color(0.208, 0.102),
        color(0.312, 0.142),
        color(0.445, 0.187),
        color(0.177, 0.178),
      ]),
      preset("violet-current", "Violet current", 70, [
        color(0.241, 0.117),
        color(0.306, 0.14),
        color(0.385, 0.169),
        color(0.504, 0.224),
        color(0.181, 0.09),
      ]),
      preset("glitch-hour", "Glitch hour", 58, [
        color(0.154, 0.078),
        color(0.19, 0.115),
        color(0.251, 0.23),
        color(0.36, 0.19),
        color(0.215, 0.31),
      ]),
      preset("red-core", "Red core", 76, [
        color(0.675, 0.322),
        color(0.525, 0.255),
        color(0.32, 0.162),
        color(0.189, 0.091),
        color(0.146, 0.065),
      ]),
      preset("deep-cloud", "Deep cloud", 64, [
        color(0.173, 0.067),
        color(0.226, 0.095),
        color(0.301, 0.141),
        color(0.379, 0.191),
        color(0.157, 0.157),
      ]),
      preset("night-sparks", "Night sparks", 72, [
        color(0.185, 0.11),
        color(0.245, 0.18),
        color(0.312, 0.32),
        color(0.38, 0.38),
        color(0.22, 0.26),
      ]),
      preset("retro-current", "Retro current", 72, [
        color(0.201, 0.082),
        color(0.281, 0.117),
        color(0.406, 0.184),
        color(0.157, 0.176),
        color(0.196, 0.31),
      ]),
      preset("starfield", "Starfield", 54, [
        color(0.152, 0.064),
        color(0.194, 0.079),
        color(0.252, 0.118),
        color(0.337, 0.161),
        color(0.43, 0.211),
      ]),
    ],
  },
  {
    id: "lush",
    title: "Lush",
    description:
      "Bright natural palettes with greens, blues, oranges, and gold.",
    scenes: [
      preset("honey-bloom", "Honey bloom", 80, [
        color(0.578, 0.399),
        color(0.499, 0.456),
        color(0.622, 0.361),
        color(0.421, 0.493),
        color(0.515, 0.427),
      ]),
      preset("brushed-sky", "Brushed sky", 82, [
        color(0.186, 0.181),
        color(0.241, 0.207),
        color(0.388, 0.252),
        color(0.512, 0.341),
        color(0.6, 0.35),
      ]),
      preset("marigold-fields", "Marigold fields", 84, [
        color(0.615, 0.365),
        color(0.553, 0.421),
        color(0.498, 0.462),
        color(0.641, 0.334),
        color(0.57, 0.399),
      ]),
      preset("azure-orbit", "Azure orbit", 78, [
        color(0.154, 0.08),
        color(0.165, 0.158),
        color(0.19, 0.265),
        color(0.235, 0.335),
        color(0.287, 0.392),
      ]),
      preset("green-harbor", "Green harbor", 74, [
        color(0.248, 0.545),
        color(0.301, 0.602),
        color(0.364, 0.52),
        color(0.22, 0.38),
        color(0.436, 0.496),
      ]),
      preset("stillwater", "Stillwater", 68, [
        color(0.176, 0.22),
        color(0.206, 0.336),
        color(0.253, 0.41),
        color(0.306, 0.481),
        color(0.391, 0.455),
      ]),
      preset("palm-coast", "Palm coast", 76, [
        color(0.185, 0.174),
        color(0.229, 0.286),
        color(0.413, 0.458),
        color(0.557, 0.407),
        color(0.604, 0.35),
      ]),
      preset("blue-cove", "Blue cove", 72, [
        color(0.155, 0.112),
        color(0.163, 0.223),
        color(0.18, 0.313),
        color(0.221, 0.397),
        color(0.283, 0.454),
      ]),
    ],
  },
  {
    id: "nature",
    title: "Nature",
    description: "Outdoor-inspired scenes for seasonal light and landscapes.",
    scenes: [
      preset("water-mist", "Water mist", 64, [
        color(0.228, 0.297),
        color(0.278, 0.374),
        color(0.348, 0.421),
        color(0.42, 0.43),
        color(0.321, 0.338),
      ]),
      preset("summit-air", "Summit air", 72, [
        color(0.201, 0.273),
        color(0.262, 0.369),
        color(0.337, 0.447),
        color(0.411, 0.486),
        color(0.478, 0.441),
      ]),
      preset("harvest-gold", "Harvest gold", 70, [
        color(0.58, 0.403),
        color(0.509, 0.444),
        color(0.646, 0.334),
        color(0.477, 0.493),
        color(0.555, 0.39),
      ]),
      preset("snow-summit", "Snow summit", 78, [
        color(0.235, 0.244),
        color(0.283, 0.316),
        color(0.328, 0.358),
        color(0.375, 0.387),
        color(0.202, 0.191),
      ]),
      preset("ice-dawn", "Ice dawn", 68, [
        color(0.188, 0.2),
        color(0.26, 0.277),
        color(0.365, 0.322),
        color(0.468, 0.357),
        color(0.543, 0.383),
      ]),
      preset("woodland-trail", "Woodland trail", 62, [
        color(0.255, 0.53),
        color(0.314, 0.56),
        color(0.428, 0.48),
        color(0.505, 0.41),
        color(0.226, 0.402),
      ]),
      preset("scarlet-sunset", "Scarlet sunset", 62, [
        color(0.634, 0.337),
        color(0.566, 0.371),
        color(0.482, 0.307),
        color(0.376, 0.205),
        color(0.246, 0.124),
      ]),
      preset("lunar-blue", "Lunar blue", 36, [
        color(0.176, 0.152),
        color(0.211, 0.204),
        color(0.273, 0.286),
        color(0.339, 0.344),
        color(0.221, 0.242),
      ]),
    ],
  },
  {
    id: "dreamy",
    title: "Dreamy",
    description: "Soft cinematic scenes for late nights and special moments.",
    scenes: [
      preset("last-light", "Last light", 48, [
        color(0.584, 0.363),
        color(0.507, 0.299),
        color(0.391, 0.202),
        color(0.286, 0.139),
        color(0.604, 0.408),
      ]),
      preset("canopy-glow", "Canopy glow", 54, [
        color(0.251, 0.521),
        color(0.313, 0.592),
        color(0.441, 0.488),
        color(0.559, 0.407),
        color(0.636, 0.321),
      ]),
      preset("hushed-night", "Hushed night", 28, [
        color(0.189, 0.166),
        color(0.243, 0.239),
        color(0.331, 0.329),
        color(0.475, 0.389),
        color(0.56, 0.406),
      ]),
      preset("crimson-moon", "Crimson moon", 38, [
        color(0.675, 0.322),
        color(0.592, 0.292),
        color(0.481, 0.238),
        color(0.364, 0.171),
        color(0.279, 0.13),
      ]),
      preset("calm-tide", "Calm tide", 60, [
        color(0.202, 0.252),
        color(0.284, 0.337),
        color(0.374, 0.402),
        color(0.462, 0.404),
        color(0.324, 0.281),
      ]),
      preset("orchid-coast", "Orchid coast", 39, [
        color(0.6364, 0.2963),
        color(0.5753, 0.3275),
        color(0.5636, 0.3912),
        color(0.4759, 0.4283),
        color(0.5725, 0.3601),
      ]),
      preset("first-light", "First light", 70, [
        color(0.204, 0.241),
        color(0.317, 0.343),
        color(0.452, 0.392),
        color(0.554, 0.399),
        color(0.623, 0.354),
      ]),
      preset("pumpkin-smile", "Pumpkin smile", 46, [
        color(0.631, 0.354),
        color(0.53, 0.41),
        color(0.363, 0.53),
        color(0.245, 0.36),
        color(0.181, 0.15),
      ]),
    ],
  },
];

export const HUE_SCENE_GALLERY_COUNT = HUE_SCENE_GALLERY_SECTIONS.reduce(
  (count, section) => count + section.scenes.length,
  0,
);

export const HUE_SCENE_GALLERY_PREVIEWS = [
  HUE_SCENE_GALLERY_SECTIONS[1].scenes[0],
  HUE_SCENE_GALLERY_SECTIONS[4].scenes[0],
  HUE_SCENE_GALLERY_SECTIONS[5].scenes[3],
];
