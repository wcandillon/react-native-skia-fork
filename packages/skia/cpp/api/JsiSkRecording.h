#pragma once

#if defined(SK_GRAPHITE)

#include <memory>
#include <utility>

#include <jsi/jsi.h>

#include "JsiSkNativeObjects.h"
#include "rnskia/RNSkDeferredTarget.h"

namespace RNSkia {

namespace jsi = facebook::jsi;

/**
 * JS handle for a snapped Graphite Recording. The Recording is shared with
 * the view that presents it: dispose() (or garbage collection) only drops the
 * JS reference, so a recording handed to a view stays valid until the view
 * has presented it, and disposing after the view consumed it is safe.
 */
class JsiSkRecording
    : public JsiSkWrappingSharedPtrNativeObject<JsiSkRecording,
                                                RNSkDeferredRecording> {
public:
  static constexpr const char *CLASS_NAME = "Recording";

  JsiSkRecording(std::shared_ptr<RNSkPlatformContext> context,
                 std::shared_ptr<RNSkDeferredRecording> recording)
      : JsiSkWrappingSharedPtrNativeObject<JsiSkRecording,
                                           RNSkDeferredRecording>(
            std::move(context), std::move(recording)) {}

  double getWidth() {
    auto recording = getObject();
    return recording->target ? recording->target->width() : 0;
  }

  double getHeight() {
    auto recording = getObject();
    return recording->target ? recording->target->height() : 0;
  }

  bool getHighBitDepth() {
    auto recording = getObject();
    return recording->target ? recording->target->highBitDepth : false;
  }

  size_t getMemoryPressure() override {
    if (isDisposed()) {
      return 0;
    }
    auto recording = getObjectUnchecked();
    if (!recording || !recording->target) {
      return kMinMemoryPressure;
    }
    // A recording does not own its target texture; account for the uniforms,
    // vertex data and uploads it does own with a rough per-pixel estimate.
    return static_cast<size_t>(recording->target->width()) *
               static_cast<size_t>(recording->target->height()) / 4 +
           64 * 1024;
  }

  static void definePrototype(jsi::Runtime &runtime, jsi::Object &prototype) {
    installCommon(runtime, prototype);
    installGetter(runtime, prototype, "width", &JsiSkRecording::getWidth);
    installGetter(runtime, prototype, "height", &JsiSkRecording::getHeight);
    installGetter(runtime, prototype, "highBitDepth",
                  &JsiSkRecording::getHighBitDepth);
  }
};

} // namespace RNSkia

#endif // SK_GRAPHITE
