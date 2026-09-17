#include "RNDawnWindowContext.h"

#include "RNDawnContext.h"

namespace RNSkia {

void DawnWindowContext::present() {
  auto recording = _recorder->snap();
  if (!recording) {
    throw std::runtime_error("Failed to create graphite recording");
  }
  DawnContext::getInstance().submitRecording(recording.get());
#ifdef __APPLE__
  dawn::native::metal::WaitForCommandsToBeScheduled(_device.Get());
#endif
  _surface.Present();
}

void DawnWindowContext::noteSwapchainCapabilities(wgpu::TextureUsage usage,
                                                  bool highBitDepthSupported) {
  DawnContext::getInstance().noteSwapchainCapabilities(usage,
                                                       highBitDepthSupported);
}

std::optional<RNSkDeferredTarget> DawnWindowContext::getDeferredTarget() {
  int width, height;
  {
    std::lock_guard<std::mutex> lock(_sizeMutex);
    width = _width;
    height = _height;
  }
  if (width <= 0 || height <= 0) {
    return std::nullopt;
  }
  return DawnContext::getInstance().makeDeferredTarget(
      width, height, _format == DawnUtils::HighBitDepthTextureFormat);
}

bool DawnWindowContext::presentRecording(
    skgpu::graphite::Recording *recording) {
  wgpu::SurfaceTexture surfaceTexture;
  _surface.GetCurrentTexture(&surfaceTexture);
  auto texture = surfaceTexture.texture;
  if (!texture) {
    return false;
  }
  // Wrap the swapchain texture exactly like getSurface() does so that the
  // texture info matches what makeDeferredTarget() described.
  auto backendTex = skgpu::graphite::BackendTextures::MakeDawn(texture.Get());
  SkSurfaceProps surfaceProps;
  auto surface =
      SkSurfaces::WrapBackendTexture(_recorder, backendTex, _colorType,
                                     SkColorSpace::MakeSRGB(), &surfaceProps);
  if (!surface) {
    return false;
  }
  skgpu::graphite::InsertRecordingInfo info;
  info.fRecording = recording;
  info.fTargetSurface = surface.get();
  bool inserted = DawnContext::getInstance().insertAndSubmit(info);
  if (!inserted) {
    return false;
  }
#ifdef __APPLE__
  dawn::native::metal::WaitForCommandsToBeScheduled(_device.Get());
#endif
  _surface.Present();
  return true;
}

} // namespace RNSkia
