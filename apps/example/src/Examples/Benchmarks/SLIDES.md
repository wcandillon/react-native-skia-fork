# Recording Views

One number per slide. Sources: `apps/example` Benchmarks screens, 2026-09-17.
Pixel 8 (120 Hz) and iPhone 17 Pro simulator (60 Hz), Graphite on Dawn.

---

## The main thread was doing everything.

Draw. Tessellate. Upload. Present.

Six views, every frame.

---

## Now it does one thing.

**Present.**

Frames are recorded on the thread that makes them.
The main thread binds a texture and submits.

---

# 38 → 113 fps

UI thread, six views, 10,000 circles each.

Pixel 8. Same scene, same producer thread.

---

# 83 ms → 25 ms

Worst frame on the UI thread.

Fifteen long frames per second, down to zero.

---

## The work did not disappear.

It moved.

75 ms per batch of six views on the producer thread.
The UI thread never noticed.

---

# 5,000

Circles per view, six views, UI and content both at 60 fps.

The picture path never reached 55 fps on the views.
Not even at 2,000.

---

# 0 long frames

While scrolling a list of 48 live charts.

Picture views: eight long frames per second, 38 ms worst.

---

# 1.9 %

CPU per presented frame per second, down from 2.3 %.

Less work per frame that reaches the screen.
Same process, all threads counted.

---

# 197 of 239

Presents landing inside one display period.

Picture views spread across 12 to 33 ms.
Recording views cluster at the vsync.

---

## One rule.

Record on your thread.

Snap.

Hand it over.

```ts
const canvas = Skia.Context.makeDeferredCanvas(target);
draw(canvas);
setViewRecording(nativeId, Skia.Context.snap());
```

---

## Any thread.

A worklet runtime. The JS thread. The UI thread.

Each has its own Recorder. None of them wait for the others.

---

## Resize, rotate, background.

A frame made for the wrong size is dropped.
The view tells you the new size.
The last good frame is replayed when the system asks.

Nothing is drawn on the main thread. Ever.

---

## What it is not.

A `<Canvas>` still draws on the UI runtime, which is the main thread.
There, the recording renderer is not faster yet.

The win is for producers on their own thread.

---

# Same pixels. Different thread.

Recording views. Graphite only.
