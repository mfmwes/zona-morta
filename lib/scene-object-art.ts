import regions from "./scene-object-art.json";

export type SceneObjectArt = {
  src: string;
  width: number;
  height: number;
  region: readonly number[];
  rotate?: number;
};

const artwork: Record<string, SceneObjectArt> = regions;

export function sceneObjectArtFor(variant?: string): SceneObjectArt | undefined {
  return variant && Object.prototype.hasOwnProperty.call(artwork, variant) ? artwork[variant] : undefined;
}
