package com.shopify.reactnative.skia;

import android.content.Context;

import androidx.annotation.Nullable;

import com.facebook.jni.HybridData;
import com.facebook.jni.annotations.DoNotStrip;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.uimanager.UIManagerHelper;
import com.facebook.react.uimanager.events.Event;
import com.facebook.react.uimanager.events.EventDispatcher;

/**
 * A view that presents Graphite Recordings (see Skia.Context on the JS side).
 * It never draws: recordings arrive through SkiaViewApi.setJsiProperty(id,
 * "recording", recording) and are presented at the next vsync.
 */
public class SkiaRecordingView extends SkiaBaseView {
    public static final String TARGET_EVENT = "topTarget";

    @DoNotStrip
    private HybridData mHybridData;

    public SkiaRecordingView(Context context) {
        super(context);
        RNSkiaModule skiaModule = ((ReactContext) context).getNativeModule(RNSkiaModule.class);
        mHybridData = initHybrid(skiaModule.getSkiaManager());
    }

    @Override
    protected void finalize() throws Throwable {
        super.finalize();
        mHybridData.resetNative();
    }

    /**
     * Called from native (main thread) whenever the swapchain target changes,
     * including once when the surface is first available. Sizes are pixels.
     */
    @DoNotStrip
    void onTargetChanged(int width, int height, boolean highBitDepth) {
        ReactContext reactContext = (ReactContext) getContext();
        int surfaceId = UIManagerHelper.getSurfaceId(reactContext);
        EventDispatcher dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, getId());
        if (dispatcher == null) {
            return;
        }
        dispatcher.dispatchEvent(new TargetEvent(surfaceId, getId(), width, height, highBitDepth));
    }

    private static class TargetEvent extends Event<TargetEvent> {
        private final int mWidth;
        private final int mHeight;
        private final boolean mHighBitDepth;

        TargetEvent(int surfaceId, int viewId, int width, int height, boolean highBitDepth) {
            super(surfaceId, viewId);
            mWidth = width;
            mHeight = height;
            mHighBitDepth = highBitDepth;
        }

        @Override
        public String getEventName() {
            return TARGET_EVENT;
        }

        @Nullable
        @Override
        protected WritableMap getEventData() {
            WritableMap data = Arguments.createMap();
            data.putInt("width", mWidth);
            data.putInt("height", mHeight);
            data.putBoolean("highBitDepth", mHighBitDepth);
            return data;
        }
    }

    private native HybridData initHybrid(SkiaManager skiaManager);

    protected native void surfaceAvailable(Object surface, int width, int height, boolean opaque, boolean highBitDepth);

    protected native void surfaceSizeChanged(Object surface, int width, int height, boolean opaque, boolean highBitDepth);

    protected native void surfaceDestroyed();

    protected native void setDebugMode(boolean show);

    protected native void registerView(int nativeId);

    protected native void unregisterView();

    @Override
    protected int[] getBitmap(int width, int height) {
        // No warm-up bitmap: there is no picture to rasterize on the CPU.
        return new int[0];
    }
}
