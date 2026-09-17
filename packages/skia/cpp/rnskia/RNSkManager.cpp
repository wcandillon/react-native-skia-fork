#include "RNSkManager.h"

#include <memory>
#include <utility>

#include <jsi/jsi.h>

#include "RNSkJsiViewApi.h"
#include "RNSkView.h"
#include "api/JsiSkApi.h"
#include "api/JsiSkDispatcher.h"

namespace RNSkia {
namespace jsi = facebook::jsi;

RNSkManager::RNSkManager(
    jsi::Runtime *jsRuntime,
    std::shared_ptr<facebook::react::CallInvoker> jsCallInvoker,
    std::shared_ptr<RNSkPlatformContext> platformContext)
    : _jsRuntime(jsRuntime), _platformContext(platformContext),
      _jsCallInvoker(jsCallInvoker),
      _viewApi(std::make_shared<RNSkJsiViewApi>(platformContext)) {
  // Install bindings
  installBindings();
  installDispatcherWakes();
}

void RNSkManager::installDispatcherWakes() {
  // GPU-backed wrappers (images, surfaces, pictures) hand their release to
  // the Dispatcher of the thread that created them, because the Hermes GC
  // finalizes them on its own thread. Without a wake callback the queue is
  // only drained when the next wrapper is created on that thread, so freed
  // resources could sit in the queue indefinitely. Register a poster for the
  // two threads that create Skia objects: the JS thread and the main thread
  // (which also runs the worklet UI runtime and the renderer). Registration
  // is posted to each thread since it must run on the thread it posts to.
  std::weak_ptr<RNSkPlatformContext> weakContext = _platformContext;
  _platformContext->runOnJavascriptThread([weakContext]() {
    Dispatcher::registerWake([weakContext](std::function<void()> task) {
      auto context = weakContext.lock();
      if (!context) {
        return false;
      }
      context->runOnJavascriptThread(std::move(task));
      return true;
    });
  });
  _platformContext->runOnMainThread([weakContext]() {
    Dispatcher::registerWake([weakContext](std::function<void()> task) {
      auto context = weakContext.lock();
      if (!context) {
        return false;
      }
      context->runOnMainThread(std::move(task));
      return true;
    });
  });
}

RNSkManager::~RNSkManager() {
  // Free up any references
  _viewApi = nullptr;
  _jsRuntime = nullptr;
  _platformContext = nullptr;
  _jsCallInvoker = nullptr;
}

void RNSkManager::registerSkiaView(size_t nativeId,
                                   std::shared_ptr<RNSkView> view) {
  _viewApi->registerSkiaView(nativeId, std::move(view));
}

void RNSkManager::unregisterSkiaView(size_t nativeId) {
  _viewApi->unregisterSkiaView(nativeId);
}

void RNSkManager::setSkiaView(size_t nativeId, std::shared_ptr<RNSkView> view) {
  _viewApi->setSkiaView(nativeId, std::move(view));
}

void RNSkManager::installBindings() {
  // Create the API objects and install it on the global object in the
  // provided runtime.
  auto skiaApi = std::make_shared<JsiSkApi>(_platformContext);
  _jsRuntime->global().setProperty(
      *_jsRuntime, "SkiaApi", makeJsiObject(*_jsRuntime, std::move(skiaApi)));

  _jsRuntime->global().setProperty(*_jsRuntime, "SkiaViewApi",
                                   makeJsiObject(*_jsRuntime, _viewApi));

  // The WebGPU JS API (RNWebGPU, navigator.gpu, constants, createImageBitmap)
  // is no longer installed here: react-native-webgpu is the single WebGPU API
  // surface for React Native. Graphite keeps Dawn as an internal
  // implementation detail only.
}
} // namespace RNSkia
