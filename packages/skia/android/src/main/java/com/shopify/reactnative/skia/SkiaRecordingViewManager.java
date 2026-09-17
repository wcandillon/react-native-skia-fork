package com.shopify.reactnative.skia;

import com.facebook.react.common.MapBuilder;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.viewmanagers.SkiaRecordingViewManagerDelegate;
import com.facebook.react.viewmanagers.SkiaRecordingViewManagerInterface;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.util.Map;

public class SkiaRecordingViewManager extends SkiaBaseViewManager<SkiaRecordingView> implements SkiaRecordingViewManagerInterface<SkiaRecordingView> {

    protected SkiaRecordingViewManagerDelegate mDelegate;

    SkiaRecordingViewManager() {
        mDelegate = new SkiaRecordingViewManagerDelegate(this);
    }

    protected SkiaRecordingViewManagerDelegate getDelegate() {
        return mDelegate;
    }

    @NonNull
    @Override
    public String getName() {
        return "SkiaRecordingView";
    }

    @NonNull
    @Override
    public SkiaRecordingView createViewInstance(@NonNull ThemedReactContext reactContext) {
        return new SkiaRecordingView(reactContext);
    }

    @Nullable
    @Override
    public Map<String, Object> getExportedCustomDirectEventTypeConstants() {
        return MapBuilder.<String, Object>builder()
                .put(SkiaRecordingView.TARGET_EVENT, MapBuilder.of("registrationName", "onTarget"))
                .build();
    }
}
