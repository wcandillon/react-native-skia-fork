#pragma once

#include <memory>
#include <stdexcept>
#include <string>

#include <fbjni/fbjni.h>
#include <jni.h>
#include <jsi/jsi.h>

#include "JniSkiaBaseView.h"
#include "JniSkiaManager.h"
#include "RNSkAndroidView.h"
#include "RNSkRecordingView.h"

#include <fbjni/detail/Hybrid.h>

namespace RNSkia {
namespace jsi = facebook::jsi;
namespace jni = facebook::jni;

class JniSkiaRecordingView : public jni::HybridClass<JniSkiaRecordingView>,
                             public JniSkiaBaseView {
public:
  static auto constexpr kJavaDescriptor =
      "Lcom/shopify/reactnative/skia/SkiaRecordingView;";

  static jni::local_ref<jhybriddata>
  initHybrid(jni::alias_ref<jhybridobject> jThis,
             jni::alias_ref<JniSkiaManager::javaobject> skiaManager) {
#if defined(SK_GRAPHITE)
    return makeCxxInstance(jThis, skiaManager);
#else
    // Surfaces as a Java RuntimeException when the view is created.
    throw std::runtime_error(RNSkRecordingView::kUnavailableMessage);
#endif
  }

  static void registerNatives() {
    registerHybrid(
        {makeNativeMethod("initHybrid", JniSkiaRecordingView::initHybrid),
         makeNativeMethod("surfaceAvailable",
                          JniSkiaRecordingView::surfaceAvailable),
         makeNativeMethod("surfaceDestroyed",
                          JniSkiaRecordingView::surfaceDestroyed),
         makeNativeMethod("surfaceSizeChanged",
                          JniSkiaRecordingView::surfaceSizeChanged),
         makeNativeMethod("setDebugMode", JniSkiaRecordingView::setDebugMode),
         makeNativeMethod("registerView", JniSkiaRecordingView::registerView),
         makeNativeMethod("unregisterView",
                          JniSkiaRecordingView::unregisterView)});
  }

protected:
  void surfaceAvailable(jobject surface, int width, int height, bool opaque,
                        bool highBitDepth) override {
    JniSkiaBaseView::surfaceAvailable(surface, width, height, opaque,
                                      highBitDepth);
  }

  void surfaceSizeChanged(jobject surface, int width, int height, bool opaque,
                          bool highBitDepth) override {
    JniSkiaBaseView::surfaceSizeChanged(surface, width, height, opaque,
                                        highBitDepth);
  }

  void surfaceDestroyed() override { JniSkiaBaseView::surfaceDestroyed(); }

  void setDebugMode(bool show) override { JniSkiaBaseView::setDebugMode(show); }

  void registerView(int nativeId) override {
    JniSkiaBaseView::registerView(nativeId);
  }

  void unregisterView() override { JniSkiaBaseView::unregisterView(); }

private:
  friend HybridBase;

#if defined(SK_GRAPHITE)
  explicit JniSkiaRecordingView(
      jni::alias_ref<jhybridobject> jThis,
      jni::alias_ref<JniSkiaManager::javaobject> skiaManager)
      : JniSkiaBaseView(
            skiaManager,
            std::make_shared<RNSkAndroidView<RNSkia::RNSkRecordingView>>(
                skiaManager->cthis()->getPlatformContext())),
        javaPart_(jni::make_global(jThis)) {
    auto view =
        std::static_pointer_cast<RNSkAndroidView<RNSkia::RNSkRecordingView>>(
            _skiaAndroidView);
    // The Java view outlives the hybrid data (it resets it in finalize), so
    // a weak reference is enough and avoids a Java <-> C++ cycle.
    jni::weak_ref<javaobject> weakJava = jni::make_weak(javaPart_);
    view->setOnTargetChanged([weakJava](const RNSkDeferredTarget &target) {
      // Fires on the main thread (surface callbacks, present path).
      jni::ThreadScope scope;
      auto java = weakJava.lockLocal();
      if (!java) {
        return;
      }
      static const auto onTarget =
          javaClassStatic()->getMethod<void(jint, jint, jboolean)>(
              "onTargetChanged");
      onTarget(java, target.width(), target.height(), target.highBitDepth);
    });
  }
#endif

  jni::global_ref<javaobject> javaPart_;
};

} // namespace RNSkia
