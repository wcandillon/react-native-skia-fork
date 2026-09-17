#pragma once

#include <memory>
#include <optional>
#include <string>
#include <utility>

#include <jsi/jsi.h>

#include <pthread.h>
#include <sys/resource.h>
#if defined(__ANDROID__)
#include <unistd.h>
#endif

#include "JsiSkCanvas.h"
#include "JsiSkNativeObjects.h"

#if defined(SK_GRAPHITE)
#include "JsiSkRecording.h"
#include "rnskia/RNDawnContext.h"
#include "rnskia/RNSkDeferredTarget.h"
#endif

namespace RNSkia {

namespace jsi = facebook::jsi;

/**
 * Skia.Context: produces Graphite Recordings for SkiaRecordingView.
 *
 * Both methods use the calling thread's Recorder (DawnContext::getRecorder is
 * thread-local), which is what lets a worklet on the UI thread and code on
 * the JS thread each produce frames without sharing state. The deferred
 * target pending on the calling thread is tracked thread-locally for the same
 * reason.
 */
class JsiSkContext : public JsiSkNativeObject<JsiSkContext> {
public:
  static constexpr const char *CLASS_NAME = "Context";

  explicit JsiSkContext(std::shared_ptr<RNSkPlatformContext> context)
      : JsiSkNativeObject<JsiSkContext>(std::move(context)) {}

  JSI_HOST_FUNCTION(makeDeferredCanvas) {
#if defined(SK_GRAPHITE)
    if (count < 1 || !arguments[0].isObject()) {
      throw jsi::JSError(runtime, "makeDeferredCanvas: expected a target "
                                  "{width, height, highBitDepth?}");
    }
    auto info = arguments[0].asObject(runtime);
    auto widthValue = info.getProperty(runtime, "width");
    auto heightValue = info.getProperty(runtime, "height");
    if (!widthValue.isNumber() || !heightValue.isNumber()) {
      throw jsi::JSError(
          runtime, "makeDeferredCanvas: width and height must be numbers");
    }
    int width = static_cast<int>(widthValue.asNumber());
    int height = static_cast<int>(heightValue.asNumber());
    if (width <= 0 || height <= 0) {
      throw jsi::JSError(runtime,
                         "makeDeferredCanvas: width and height must be > 0");
    }
    auto highBitDepthValue = info.getProperty(runtime, "highBitDepth");
    bool highBitDepth =
        highBitDepthValue.isBool() && highBitDepthValue.getBool();

    auto &dawnContext = DawnContext::getInstance();
    auto target = dawnContext.makeDeferredTarget(width, height, highBitDepth);
    auto *canvas = dawnContext.getRecorder()->makeDeferredCanvas(
        target.imageInfo, target.textureInfo);
    if (canvas == nullptr) {
      throw jsi::JSError(
          runtime,
          "makeDeferredCanvas: a deferred canvas is already open on this "
          "thread; call Skia.Context.snap() before making another one");
    }
    pendingTarget() = target;
    return makeJsiObject(runtime,
                         std::make_shared<JsiSkCanvas>(getContext(), canvas));
#else
    throw jsi::JSError(runtime, "Skia.Context.makeDeferredCanvas() requires "
                                "the Graphite backend (SK_GRAPHITE)");
#endif
  }

  JSI_HOST_FUNCTION(snap) {
#if defined(SK_GRAPHITE)
    auto recording = DawnContext::getInstance().getRecorder()->snap();
    auto target = pendingTarget();
    pendingTarget().reset();
    if (!recording) {
      throw jsi::JSError(runtime, "snap: the Recorder failed to produce a "
                                  "Recording (out of memory or invalid draw)");
    }
    auto deferred = std::make_shared<RNSkDeferredRecording>();
    deferred->recording = std::move(recording);
    deferred->target = target;
    return makeJsiObject(runtime, std::make_shared<JsiSkRecording>(
                                      getContext(), std::move(deferred)));
#else
    throw jsi::JSError(runtime, "Skia.Context.snap() requires the Graphite "
                                "backend (SK_GRAPHITE)");
#endif
  }

  /**
   * Sets the scheduling priority of the calling thread: "high" for a thread
   * that produces frames (QoS user-interactive on Apple, display priority on
   * Android), "normal" or "low". Worklet runtimes start at normal priority,
   * which on big.LITTLE devices means the little cores.
   */
  void setThreadPriority(std::string level) {
#if defined(__APPLE__)
    qos_class_t qos = QOS_CLASS_DEFAULT;
    if (level == "high") {
      qos = QOS_CLASS_USER_INTERACTIVE;
    } else if (level == "low") {
      qos = QOS_CLASS_BACKGROUND;
    }
    pthread_set_qos_class_self_np(qos, 0);
#elif defined(__ANDROID__)
    // Same values as android.os.Process.THREAD_PRIORITY_*.
    int nice = 0;
    if (level == "high") {
      nice = -4; // THREAD_PRIORITY_DISPLAY
    } else if (level == "low") {
      nice = 10; // THREAD_PRIORITY_BACKGROUND
    }
    setpriority(PRIO_PROCESS, gettid(), nice);
#else
    (void)level;
#endif
  }

  // True on Graphite builds, where recordings and SkiaRecordingView exist.
  bool getIsSupported() {
#if defined(SK_GRAPHITE)
    return true;
#else
    return false;
#endif
  }

  static void definePrototype(jsi::Runtime &runtime, jsi::Object &prototype) {
    installHostMethod(runtime, prototype, "makeDeferredCanvas",
                      &JsiSkContext::makeDeferredCanvas);
    installHostMethod(runtime, prototype, "snap", &JsiSkContext::snap);
    installGetter(runtime, prototype, "isSupported",
                  &JsiSkContext::getIsSupported);
    installMethod(runtime, prototype, "setThreadPriority",
                  &JsiSkContext::setThreadPriority);
  }

private:
#if defined(SK_GRAPHITE)
  // The target of the deferred canvas open on the calling thread, if any.
  static std::optional<RNSkDeferredTarget> &pendingTarget() {
    static thread_local std::optional<RNSkDeferredTarget> target;
    return target;
  }
#endif
};

} // namespace RNSkia
