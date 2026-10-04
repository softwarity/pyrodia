/** Computes where the board sits inside the canvas, keeping tiles square. */
export interface BoardLayout {
  originX: number;
  originY: number;
  tileSize: number;
  boardW: number;
  boardH: number;
  canvasW: number;
  canvasH: number;
  hudHeight: number;
  waterTop: number;
  gridW: number;
  gridH: number;
}

/**
 * @param bottomReserve CSS pixels at the bottom of the canvas occupied by DOM
 * chrome (hint, boost buttons); the board never extends into it.
 */
export function computeLayout(canvasW: number, canvasH: number, gridW: number, gridH: number, bottomReserve = 0): BoardLayout {
  const hudHeight = Math.max(58, Math.min(86, canvasH * 0.11));
  const waterBand = Math.max(Math.max(28, Math.min(70, canvasH * 0.08)), bottomReserve);
  const margin = Math.max(8, Math.min(24, canvasW * 0.03));
  const availW = canvasW - margin * 2;
  const availH = canvasH - hudHeight - waterBand - margin * 2;
  const tileSize = Math.floor(Math.min(availW / gridW, availH / gridH));
  const boardW = tileSize * gridW;
  const boardH = tileSize * gridH;
  const originX = Math.floor((canvasW - boardW) / 2);
  const originY = Math.floor(hudHeight + margin + (availH - boardH) / 2);
  return { originX, originY, tileSize, boardW, boardH, canvasW, canvasH, hudHeight, waterTop: originY + boardH, gridW, gridH };
}
