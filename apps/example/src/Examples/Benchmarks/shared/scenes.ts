import { Skia } from "@shopify/react-native-skia";
import type { SkCanvas, SkPicture } from "@shopify/react-native-skia";

const palette = [
  "#ff6b6b",
  "#feca57",
  "#48dbfb",
  "#1dd1a1",
  "#5f27cd",
  "#ff9ff3",
  "#54a0ff",
  "#00d2d3",
].map((c) => Skia.Color(c));
const background = Skia.Color("#151a21");
const fill = Skia.Paint();
const line = Skia.Paint();
line.setStyle(1);
line.setStrokeWidth(2);
line.setAntiAlias(true);

/**
 * The particle field: `count` circles in a disc of radius `radius`, recorded
 * once into a picture. Drawing the picture replays every circle, so a frame
 * costs one call to produce and `count` draws for Skia to process.
 */
export const buildField = (count: number, radius: number) => {
  const recorder = Skia.PictureRecorder();
  const canvas = recorder.beginRecording(
    Skia.XYWHRect(-radius, -radius, 2 * radius, 2 * radius)
  );
  const paint = Skia.Paint();
  const stroke = Skia.Paint();
  stroke.setStyle(1);
  stroke.setStrokeWidth(1.5);
  for (let i = 0; i < count; i++) {
    // Golden-angle spiral: evenly spread, no two circles alike.
    const a = i * 2.399963;
    const d = radius * Math.sqrt((i + 0.5) / count);
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    const r = 1.5 + (i % 4);
    const color = palette[i % palette.length];
    if (i % 3 === 0) {
      stroke.setColor(color);
      canvas.drawCircle(x, y, r + 1, stroke);
    } else {
      paint.setColor(color);
      canvas.drawCircle(x, y, r, paint);
    }
  }
  const picture = recorder.finishRecordingAsPicture();
  recorder.dispose();
  return picture;
};

/** The field, rotating and breathing. In points. */
export const drawField = (
  canvas: SkCanvas,
  width: number,
  height: number,
  t: number,
  index: number,
  field: SkPicture
) => {
  "worklet";
  fill.setColor(background);
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), fill);
  canvas.save();
  canvas.translate(width / 2, height / 2);
  canvas.rotate((t * 0.03 + index * 60) % 360, 0, 0);
  const s = 0.85 + 0.15 * Math.sin(t * 0.002 + index);
  canvas.scale(s, s);
  canvas.drawPicture(field);
  canvas.restore();
};

/**
 * A live chart: `count` bars and a `count`-point line, all animated. Every
 * frame is `2 * count` draw calls, produced and processed each time (nothing
 * pre-recorded), the shape of a dashboard tile in a list.
 */
export const drawChart = (
  canvas: SkCanvas,
  width: number,
  height: number,
  t: number,
  index: number,
  count: number
) => {
  "worklet";
  fill.setColor(background);
  canvas.drawRect(Skia.XYWHRect(0, 0, width, height), fill);
  const barWidth = width / count;
  const phase = index * 0.9;
  for (let i = 0; i < count; i++) {
    const v =
      0.5 +
      0.25 * Math.sin(t * 0.002 + i * 0.35 + phase) +
      0.2 * Math.sin(t * 0.0007 + i * 0.11);
    const h = v * (height - 8);
    fill.setColor(palette[(i + index) % palette.length]);
    canvas.drawRect(
      Skia.XYWHRect(i * barWidth, height - h, Math.max(1, barWidth - 1), h),
      fill
    );
  }
  line.setColor(Skia.Color("white"));
  let prevX = 0;
  let prevY =
    height / 2 + Math.sin(t * 0.003 + phase) * (height / 4);
  for (let i = 1; i < count; i++) {
    const x = (i / (count - 1)) * width;
    const y =
      height / 2 +
      Math.sin(t * 0.003 + i * 0.25 + phase) * (height / 4) +
      Math.cos(t * 0.0011 + i * 0.05) * (height / 8);
    canvas.drawLine(prevX, prevY, x, y, line);
    prevX = x;
    prevY = y;
  }
};
