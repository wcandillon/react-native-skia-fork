#pragma once

#include <functional>
#include <memory>
#include <mutex>

#include "RNSkFrameScheduler.h"
#include "RNSkPlatformContext.h"

namespace RNSkia {

/**
 * Vsync driver backed by AChoreographer. A frame callback is posted on the
 * main thread (the only thread whose Choreographer we want) when a frame is
 * requested and nothing is pending; Choreographer callbacks are one-shot, so
 * nothing runs while no frame is pending.
 */
class RNSkAndroidFrameScheduler
    : public RNSkFrameScheduler,
      public std::enable_shared_from_this<RNSkAndroidFrameScheduler> {
public:
  RNSkAndroidFrameScheduler(
      std::function<void()> onFrame,
      std::function<void(std::function<void()>)> runOnMainThread);
  ~RNSkAndroidFrameScheduler() override = default;

  void requestFrame() override;

  // Called by the Choreographer on the main thread.
  void onVsync();

private:
  void postOnMainThread();

  std::function<void()> _onFrame;
  std::function<void(std::function<void()>)> _runOnMainThread;
  std::mutex _mutex;
  bool _armed = false;
};

} // namespace RNSkia
