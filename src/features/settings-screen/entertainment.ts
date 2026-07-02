import type {
  HueEntertainmentConfiguration,
  HueEntertainmentService,
  HueLight,
  HuePosition,
} from "@/types/hue";

export interface EntertainmentLightCapability {
  light: HueLight;
  serviceId: string;
  channelCount: number;
}

export const entertainmentCapabilities = (
  lights: HueLight[],
  services: HueEntertainmentService[],
): EntertainmentLightCapability[] => {
  const lightById = new Map(lights.map((light) => [light.id, light]));
  const capabilityByLightId = new Map<string, EntertainmentLightCapability>();

  services.forEach((service) => {
    const reference = service.renderer_reference;
    const light =
      service.renderer &&
      reference?.rtype === "light" &&
      lightById.get(reference.rid);
    if (!light || capabilityByLightId.has(light.id)) return;

    capabilityByLightId.set(light.id, {
      light,
      serviceId: service.id,
      channelCount: Math.max(1, service.segments?.segments?.length ?? 1),
    });
  });

  return [...capabilityByLightId.values()];
};

export const entertainmentAreaLightIds = (
  area: HueEntertainmentConfiguration,
  capabilities: EntertainmentLightCapability[],
) => {
  const lightByService = new Map(
    capabilities.map(({ light, serviceId }) => [serviceId, light.id]),
  );
  return [
    ...new Set(
      area.locations.service_locations.flatMap(({ service }) => {
        const lightId = lightByService.get(service.rid);
        return lightId ? [lightId] : [];
      }),
    ),
  ];
};

export const createEntertainmentConfigurationBody = ({
  name,
  configurationType,
  capabilities,
  placements,
}: {
  name: string;
  configurationType: HueEntertainmentConfiguration["configuration_type"];
  capabilities: EntertainmentLightCapability[];
  placements: Record<string, HuePosition>;
}) => ({
  type: "entertainment_configuration",
  metadata: { name: name.trim() },
  configuration_type: configurationType,
  locations: {
    service_locations: capabilities.map(({ light, serviceId }) => ({
      service: { rid: serviceId, rtype: "entertainment" },
      positions: [placements[light.id]],
      equalization_factor: 1,
    })),
  },
});
