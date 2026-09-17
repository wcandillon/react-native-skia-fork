import { setupSkia } from "./setup";

describe("Skia.Context (web fallback)", () => {
  it("records a frame into a deferred canvas and snaps it", () => {
    const { Skia } = setupSkia();
    const canvas = Skia.Context.makeDeferredCanvas({
      width: 64,
      height: 32,
    });
    expect(canvas).toBeDefined();
    const paint = Skia.Paint();
    paint.setColor(Skia.Color("red"));
    canvas.clear(Skia.Color("transparent"));
    canvas.drawRect(Skia.XYWHRect(0, 0, 64, 32), paint);
    const recording = Skia.Context.snap();
    expect(recording.__typename__).toBe("Recording");
    expect(recording.width).toBe(64);
    expect(recording.height).toBe(32);
    expect(recording.highBitDepth).toBe(false);
    // The web token exposes the frame so the view can draw it.
    const image = (
      recording as unknown as {
        makeImageSnapshot(): { width(): number; height(): number } | null;
      }
    ).makeImageSnapshot();
    expect(image).not.toBeNull();
    expect(image!.width()).toBe(64);
    expect(image!.height()).toBe(32);
    recording.dispose();
  });

  it("carries the requested bit depth", () => {
    const { Skia } = setupSkia();
    Skia.Context.makeDeferredCanvas({
      width: 8,
      height: 8,
      highBitDepth: true,
    });
    const recording = Skia.Context.snap();
    expect(recording.highBitDepth).toBe(true);
    recording.dispose();
  });

  it("refuses a second deferred canvas before snap()", () => {
    const { Skia } = setupSkia();
    Skia.Context.makeDeferredCanvas({ width: 8, height: 8 });
    expect(() =>
      Skia.Context.makeDeferredCanvas({ width: 8, height: 8 })
    ).toThrow(/snap/);
    Skia.Context.snap().dispose();
    // A new canvas is allowed after the snap.
    expect(() =>
      Skia.Context.makeDeferredCanvas({ width: 8, height: 8 })
    ).not.toThrow();
    Skia.Context.snap().dispose();
  });

  it("rejects an empty target", () => {
    const { Skia } = setupSkia();
    expect(() =>
      Skia.Context.makeDeferredCanvas({ width: 0, height: 8 })
    ).toThrow(/> 0/);
  });

  it("snaps without a deferred canvas into a recording with no target", () => {
    const { Skia } = setupSkia();
    const recording = Skia.Context.snap();
    expect(recording.width).toBe(0);
    expect(recording.height).toBe(0);
    expect(
      (recording as unknown as { hasTarget: boolean }).hasTarget
    ).toBe(false);
    recording.dispose();
  });

  it("makes dispose() safe to call more than once", () => {
    const { Skia } = setupSkia();
    Skia.Context.makeDeferredCanvas({ width: 8, height: 8 });
    const recording = Skia.Context.snap();
    recording.dispose();
    expect(() => recording.dispose()).not.toThrow();
    expect(
      (
        recording as unknown as { makeImageSnapshot(): unknown }
      ).makeImageSnapshot()
    ).toBeNull();
  });
});
