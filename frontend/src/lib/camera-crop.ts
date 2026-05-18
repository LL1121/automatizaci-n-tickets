/** Mapea el marco de guía (object-cover) a píxeles del stream de la cámara. */

export type VideoCropRect = { sx: number; sy: number; sw: number; sh: number };

export function guideCropOnVideo(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
  guideWidthRatio: number,
  guideHeightRatio: number,
): VideoCropRect {
  const cw = containerWidth;
  const ch = containerHeight;
  const vw = videoWidth;
  const vh = videoHeight;
  if (cw <= 0 || ch <= 0 || vw <= 0 || vh <= 0) {
    return { sx: 0, sy: 0, sw: vw, sh: vh };
  }

  const scale = Math.max(cw / vw, ch / vh);
  const offsetX = (cw - vw * scale) / 2;
  const offsetY = (ch - vh * scale) / 2;

  const guideLeft = (cw * (1 - guideWidthRatio)) / 2;
  const guideTop = (ch * (1 - guideHeightRatio)) / 2;
  const guideW = cw * guideWidthRatio;
  const guideH = ch * guideHeightRatio;

  let sx = Math.floor((guideLeft - offsetX) / scale);
  let sy = Math.floor((guideTop - offsetY) / scale);
  let sw = Math.ceil(guideW / scale);
  let sh = Math.ceil(guideH / scale);

  sx = Math.max(0, Math.min(sx, vw - 1));
  sy = Math.max(0, Math.min(sy, vh - 1));
  sw = Math.max(1, Math.min(sw, vw - sx));
  sh = Math.max(1, Math.min(sh, vh - sy));

  return { sx, sy, sw, sh };
}
