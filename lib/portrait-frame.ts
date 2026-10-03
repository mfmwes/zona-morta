export type PortraitFrame = { zoom: number; x: number; y: number };
export const defaultPortraitFrame: PortraitFrame = { zoom: 1, x: 50, y: 50 };
export function validPortraitFrame(value: unknown): value is PortraitFrame {
  if (!value || typeof value !== "object") return false;
  const frame = value as PortraitFrame;
  return Number.isFinite(frame.zoom) && frame.zoom >= 1 && frame.zoom <= 5
    && Number.isFinite(frame.x) && frame.x >= 0 && frame.x <= 100
    && Number.isFinite(frame.y) && frame.y >= 0 && frame.y <= 100;
}
export function portraitFrame(value?: PortraitFrame): PortraitFrame {
  return validPortraitFrame(value) ? value : defaultPortraitFrame;
}
/** Position percentages map to the available crop travel, keeping the frame filled. */
export function dragPortraitFrame(frame: PortraitFrame, dx: number, dy: number, size: number, aspect: number): PortraitFrame {
  const width = size * Math.max(1, aspect) * frame.zoom;
  const height = size * Math.max(1, 1 / aspect) * frame.zoom;
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  return { zoom: frame.zoom,
    x: width > size ? clamp(frame.x - dx * 100 / (width - size)) : frame.x,
    y: height > size ? clamp(frame.y - dy * 100 / (height - size)) : frame.y };
}
