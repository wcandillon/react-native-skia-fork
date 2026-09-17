#pragma once

#include <functional>
#include <memory>

namespace RNSkia {

/**
 * Vsync driver for a view. requestFrame() may be called from any thread; it
 * arms the platform vsync source (CADisplayLink on Apple, Choreographer on
 * Android) so that the frame callback runs once on the main thread at the
 * next vsync. Requests that arrive before that vsync are coalesced into that
 * single callback. The vsync source is disarmed after each callback: there is
 * never a permanent loop.
 *
 * Implementations must tolerate being destroyed from any thread.
 */
class RNSkFrameScheduler {
public:
  virtual ~RNSkFrameScheduler() = default;

  virtual void requestFrame() = 0;
};

} // namespace RNSkia
