import React from "react";

import { checkImage, docPath, itRunsE2eOnly } from "../../../__tests__/setup";
import type { SkImage, Skia as SkiaApi } from "../../../skia/types";
import { Circle, Image } from "../../components";
import { surface, importSkia } from "../setup";
import type { EvalContext } from "../setup";

import { SkiaObject } from "./setup/SkiaObject";

// The recording renderer draws every <Canvas> on a dedicated producer thread
// on Graphite (see sksg/WorkerProducer.ts). These tests run the declarative
// renderer through that path on the device: the test app renders the scene
// in a <Canvas> and snapshots the view.

/**
 * An image made on the device from an offscreen surface: on Graphite that is
 * a texture-backed image created on the JS thread's Recorder, while the
 * canvas is drawn by the producer thread's Recorder.
 */
class OffscreenImage extends SkiaObject<EvalContext, SkImage> {
  constructor(Skia: SkiaApi, size: number, flush: boolean) {
    super(
      Skia,
      (sk, ctx) => {
        const offscreen = sk.Surface.MakeOffscreen(ctx.size, ctx.size)!;
        const canvas = offscreen.getCanvas();
        const paint = sk.Paint();
        paint.setColor(sk.Color("lightblue"));
        canvas.drawCircle(ctx.size / 2, ctx.size / 2, ctx.size / 2, paint);
        if (ctx.flush) {
          // Submits the JS thread's recording, so the texture holds the
          // circle before any other Recorder samples it.
          offscreen.flush(true);
        }
        return offscreen.makeImageSnapshot();
      },
      { size, flush }
    );
  }
  width() {
    return this.instance.width();
  }
  height() {
    return this.instance.height();
  }
}

describe("Recording renderer (<Canvas> on Graphite)", () => {
  itRunsE2eOnly("draws a scene through the producer thread", async () => {
    const { width } = surface;
    const r = width / 2;
    const image = await surface.draw(
      <Circle cx={r} cy={r} r={r} color="lightblue" />
    );
    checkImage(image, docPath("offscreen/circle.png"));
  });

  itRunsE2eOnly(
    "draws a texture made on the JS thread after its recording was flushed",
    async () => {
      const { Skia } = importSkia();
      const { width } = surface;
      const image = await surface.draw(
        <Image
          image={new OffscreenImage(Skia, width, true) as unknown as SkImage}
          x={0}
          y={0}
          width={width}
          height={width}
        />
      );
      checkImage(image, docPath("offscreen/circle.png"));
    }
  );

  // Open design question: a texture-backed image created on one Recorder
  // and drawn by another before the recording that filled it was inserted.
  // Graphite inserts recordings in the order the main thread receives them,
  // so without a flush the producer's recording can be inserted first and
  // sample an empty texture. Expected to fail until the recording view (or
  // the image) orders the two; the failure mode is a transparent image.
  itRunsE2eOnly(
    "draws a texture made on the JS thread without an explicit flush",
    async () => {
      const { Skia } = importSkia();
      const { width } = surface;
      const image = await surface.draw(
        <Image
          image={new OffscreenImage(Skia, width, false) as unknown as SkImage}
          x={0}
          y={0}
          width={width}
          height={width}
        />
      );
      checkImage(image, docPath("offscreen/circle.png"));
    }
  );
});
