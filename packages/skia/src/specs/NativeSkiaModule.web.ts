/* eslint-disable import/no-anonymous-default-export */
import type { SkPicture, SkRect } from "../skia/types";
import type { ISkiaViewApi } from "../views/types";
import type { SkiaPictureViewHandle } from "../views/SkiaPictureView.web";
import type { SkiaRecordingViewHandle } from "../views/SkiaRecordingView.web";
import type { JsiSkRecording } from "../skia/web/JsiSkRecording";

export type ISkiaViewApiWeb = ISkiaViewApi & {
  views: Record<string, SkiaPictureViewHandle>;
  recordingViews: Record<string, SkiaRecordingViewHandle>;
  deferedPictures: Record<string, SkPicture>;
  deferedRecordings: Record<string, JsiSkRecording>;
  unregisteredViews: Set<string>;
  registerView(nativeId: string, view: SkiaPictureViewHandle): void;
  registerRecordingView(nativeId: string, view: SkiaRecordingViewHandle): void;
  unregisterView(nativeId: string): void;
};

global.SkiaViewApi = {
  views: {},
  recordingViews: {},
  deferedPictures: {},
  deferedRecordings: {},
  unregisteredViews: new Set<string>(),
  deferedOnSize: {},
  web: true,
  registerView(nativeId: string, view: SkiaPictureViewHandle) {
    this.unregisteredViews.delete(nativeId);
    // Maybe a picture for this view was already set
    if (this.deferedPictures[nativeId]) {
      view.setPicture(this.deferedPictures[nativeId] as SkPicture);
      delete this.deferedPictures[nativeId];
    }
    this.views[nativeId] = view;
  },
  registerRecordingView(nativeId: string, view: SkiaRecordingViewHandle) {
    this.unregisteredViews.delete(nativeId);
    if (this.deferedRecordings[nativeId]) {
      view.setRecording(this.deferedRecordings[nativeId] as JsiSkRecording);
      delete this.deferedRecordings[nativeId];
    }
    this.recordingViews[nativeId] = view;
  },
  unregisterView(nativeId: string) {
    // Views must be removed on unmount: the handle's closures capture the
    // canvas element, so a stale entry retains the whole detached DOM tree.
    this.unregisteredViews.add(nativeId);
    delete this.views[nativeId];
    delete this.recordingViews[nativeId];
    delete this.deferedPictures[nativeId];
    delete this.deferedRecordings[nativeId];
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setJsiProperty(nativeId: number, name: string, value: any) {
    const id = `${nativeId}`;
    if (name === "picture") {
      if (this.views[id]) {
        this.views[id].setPicture(value);
      } else if (!this.unregisteredViews.has(id)) {
        this.deferedPictures[id] = value;
      }
      // Otherwise the view has unmounted (e.g. a trailing animation frame):
      // drop the picture instead of deferring it for an id that will never
      // register again, which would retain it forever.
    } else if (name === "recording") {
      if (this.recordingViews[id]) {
        this.recordingViews[id].setRecording(value);
      } else if (value && !this.unregisteredViews.has(id)) {
        this.deferedRecordings[id] = value;
      } else {
        delete this.deferedRecordings[id];
      }
    }
  },
  size(nativeId: number) {
    const view = this.views[`${nativeId}`] ?? this.recordingViews[`${nativeId}`];
    if (view) {
      return view.getSize();
    } else {
      return { width: 0, height: 0 };
    }
  },
  requestRedraw(nativeId: number) {
    // The view may already have unmounted (e.g. a trailing animation frame).
    (this.views[`${nativeId}`] ?? this.recordingViews[`${nativeId}`])?.redraw();
  },
  makeImageSnapshot(nativeId: number, rect?: SkRect) {
    const view = this.views[`${nativeId}`] ?? this.recordingViews[`${nativeId}`];
    if (!view) {
      throw new Error(
        `Cannot make image snapshot: view with nativeID ${nativeId} is not registered (it may have unmounted)`
      );
    }
    return view.makeImageSnapshot(rect);
  },
  getPresentStats(_nativeId: number) {
    // The web views draw synchronously; presentation is not observable.
    return { presented: 0, timestamps: [], now: performance.now() };
  },
  now() {
    return performance.now();
  },
  hasPendingRecording(_nativeId: number) {
    return false;
  },
  getProcessStats() {
    return { cpuTimeMs: 0, residentMemoryBytes: 0, now: performance.now() };
  },
  makeImageSnapshotAsync(nativeId: number, rect?: SkRect) {
    return new Promise((resolve, reject) => {
      const view =
        this.views[`${nativeId}`] ?? this.recordingViews[`${nativeId}`];
      if (!view) {
        reject(
          new Error(
            `Cannot make image snapshot: view with nativeID ${nativeId} is not registered (it may have unmounted)`
          )
        );
        return;
      }
      const result = view.makeImageSnapshot(rect);
      if (result) {
        resolve(result);
      } else {
        reject(new Error("Failed to make image snapshot"));
      }
    });
  },
} as ISkiaViewApiWeb;

// eslint-disable-next-line import/no-default-export
export default {};
