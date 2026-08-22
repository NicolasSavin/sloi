import { EA_SOURCE } from "@/lib/ea-source";
import { DEFAULT_EA, patchEaSource, type EaSettings } from "@/lib/ea-settings";

export { EA_FILE } from "@/lib/brand";
export const EA_PATH = "/api/ea.mq4";

export function expertSource(settings?: EaSettings) {
  return patchEaSource(EA_SOURCE, settings ?? DEFAULT_EA);
}

export async function copyExpertSource(settings?: EaSettings): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(expertSource(settings));
    return true;
  } catch {
    return false;
  }
}
