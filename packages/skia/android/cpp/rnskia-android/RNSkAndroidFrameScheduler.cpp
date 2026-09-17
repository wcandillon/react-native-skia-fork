#include "RNSkAndroidFrameScheduler.h"

#include <android/choreographer.h>

#include "RNSkLog.h"

namespace RNSkia {

namespace {

struct FrameCallbackContext {
  std::weak_ptr<RNSkAndroidFrameScheduler> scheduler;
};

#if __ANDROID_API__ >= 29
void frameCallback(int64_t /*frameTimeNanos*/, void *data) {
#else
void frameCallback(long /*frameTimeNanos*/, void *data) { // NOLINT
#endif
  auto *context = static_cast<FrameCallbackContext *>(data);
  if (auto scheduler = context->scheduler.lock()) {
    scheduler->onVsync();
  }
  delete context;
}

} // namespace

RNSkAndroidFrameScheduler::RNSkAndroidFrameScheduler(
    std::function<void()> onFrame,
    std::function<void(std::function<void()>)> runOnMainThread)
    : _onFrame(std::move(onFrame)),
      _runOnMainThread(std::move(runOnMainThread)) {}

void RNSkAndroidFrameScheduler::requestFrame() {
  {
    std::lock_guard<std::mutex> lock(_mutex);
    if (_armed) {
      return;
    }
    _armed = true;
  }
  // AChoreographer_getInstance() returns the choreographer of the calling
  // thread's Looper, so the callback must be posted from the main thread.
  std::weak_ptr<RNSkAndroidFrameScheduler> weakThis = weak_from_this();
  _runOnMainThread([weakThis]() {
    if (auto strongThis = weakThis.lock()) {
      strongThis->postOnMainThread();
    }
  });
}

void RNSkAndroidFrameScheduler::postOnMainThread() {
  AChoreographer *choreographer = AChoreographer_getInstance();
  if (choreographer == nullptr) {
    // No Looper on this thread: run the frame right away rather than never.
    RNSkLogger::logToConsole(
        "RNSkAndroidFrameScheduler: no Choreographer on this thread");
    onVsync();
    return;
  }
  auto *context = new FrameCallbackContext{weak_from_this()};
#if __ANDROID_API__ >= 29
  AChoreographer_postFrameCallback64(choreographer, frameCallback, context);
#else
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  AChoreographer_postFrameCallback(choreographer, frameCallback, context);
#pragma clang diagnostic pop
#endif
}

void RNSkAndroidFrameScheduler::onVsync() {
  {
    std::lock_guard<std::mutex> lock(_mutex);
    _armed = false;
  }
  // Disarmed before running the frame: a request made during the callback
  // (another recording arrived) posts a callback for the following vsync.
  _onFrame();
}

} // namespace RNSkia
