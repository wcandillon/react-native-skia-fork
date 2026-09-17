#pragma once

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <queue>
#include <thread>
#include <unordered_map>
#include <utility>

namespace RNSkia {

/**
 * Thread-local dispatcher for deferring work to the thread that owns a GPU
 * resource.
 *
 * GPU-backed Skia objects (images, surfaces, pictures) must be released on the
 * thread that created them. Hermes runs its garbage collector on a dedicated
 * thread, so a wrapper's destructor may run on the wrong thread. Wrappers hand
 * the release to the dispatcher of their creating thread instead.
 *
 * Draining is driven by the destructor, not by the next allocation: when an
 * operation is queued from a foreign thread, the dispatcher posts a single
 * coalesced "process the queue" task to the owning thread through the wake
 * callback registered for that thread (see registerWake). Threads without a
 * wake callback fall back to processQueue() being called explicitly, which the
 * wrappers still do on construction as a safety net.
 */
class Dispatcher {
public:
  using Operation = std::function<void()>;

  /**
   * Posts a task to the owning thread's event loop. Returns false if the task
   * could not be posted (for instance because the platform context is gone),
   * in which case the dispatcher will try again on the next queued operation.
   */
  using WakeFn = std::function<bool(std::function<void()>)>;

private:
  struct DispatcherData {
    const std::thread::id threadId;

    // Guarded by queueMutex
    std::queue<Operation> operationQueue;
    WakeFn wake;
    std::mutex queueMutex;

    // True while a drain task is in flight on the owning thread.
    std::atomic<bool> drainScheduled{false};

    explicit DispatcherData(std::thread::id id) : threadId(id) {}

    ~DispatcherData() {
      // This runs when the last handle to the data is released. If the owning
      // thread is gone and a wrapper is the last holder, we may be on the GC
      // thread. Never destroy the queued releases here in that case: hand them
      // to the owning thread's event loop when we still can.
      if (operationQueue.empty()) {
        return;
      }
      if (std::this_thread::get_id() == threadId || !wake) {
        Drain(operationQueue);
        return;
      }
      auto pending =
          std::make_shared<std::queue<Operation>>(std::move(operationQueue));
      if (!wake([pending]() { Drain(*pending); })) {
        Drain(*pending);
      }
    }

    static void Drain(std::queue<Operation> &operations) {
      while (!operations.empty()) {
        auto op = std::move(operations.front());
        operations.pop();
        op();
      }
    }
  };

  // Thread-local storage for dispatcher data
  static thread_local std::shared_ptr<DispatcherData> _threadDispatcher;

  // Global registry of all dispatchers by thread ID
  static inline std::mutex _registryMutex;
  static inline std::unordered_map<std::thread::id,
                                   std::weak_ptr<DispatcherData>>
      _dispatcherRegistry;

  std::shared_ptr<DispatcherData> _data;

  static std::shared_ptr<DispatcherData> currentThreadData() {
    if (!_threadDispatcher) {
      _threadDispatcher =
          std::make_shared<DispatcherData>(std::this_thread::get_id());

      // Register in global registry
      std::lock_guard<std::mutex> lock(_registryMutex);
      _dispatcherRegistry[_threadDispatcher->threadId] = _threadDispatcher;
    }
    return _threadDispatcher;
  }

  explicit Dispatcher(std::shared_ptr<DispatcherData> data)
      : _data(std::move(data)) {}

  /**
   * Swaps the pending operations out under the lock and runs them. Must be
   * called on the owning thread.
   */
  static size_t drain(const std::shared_ptr<DispatcherData> &data) {
    std::queue<Operation> operations;
    {
      std::lock_guard<std::mutex> lock(data->queueMutex);
      operations.swap(data->operationQueue);
    }
    size_t count = operations.size();
    DispatcherData::Drain(operations);
    return count;
  }

  /**
   * Posts one drain task to the owning thread unless one is already pending.
   */
  static void scheduleDrain(const std::shared_ptr<DispatcherData> &data,
                            const WakeFn &wake) {
    if (data->drainScheduled.exchange(true)) {
      return;
    }
    std::weak_ptr<DispatcherData> weakData = data;
    bool posted = wake([weakData]() {
      auto data = weakData.lock();
      if (!data) {
        return;
      }
      // Clear the flag before swapping the queue so that anything queued
      // after the swap schedules a fresh drain.
      data->drainScheduled.store(false);
      drain(data);
    });
    if (!posted) {
      data->drainScheduled.store(false);
    }
  }

public:
  Dispatcher() : _data(currentThreadData()) {}

  /**
   * Get the dispatcher for the current thread.
   * Creates one if it doesn't exist.
   */
  static std::shared_ptr<Dispatcher> getDispatcher() {
    return std::make_shared<Dispatcher>();
  }

  /**
   * Get the dispatcher for a specific thread.
   * Returns nullptr if that thread doesn't have a dispatcher.
   */
  static std::shared_ptr<Dispatcher> getDispatcher(std::thread::id threadId) {
    std::lock_guard<std::mutex> lock(_registryMutex);
    auto it = _dispatcherRegistry.find(threadId);
    if (it != _dispatcherRegistry.end()) {
      if (auto data = it->second.lock()) {
        return std::shared_ptr<Dispatcher>(new Dispatcher(std::move(data)));
      }
    }
    return nullptr;
  }

  /**
   * Registers the function used to post a drain task to the current thread's
   * event loop. Must be called on the thread the callback posts to. Any
   * operations already pending are processed immediately.
   */
  static void registerWake(WakeFn wake) {
    auto data = currentThreadData();
    {
      std::lock_guard<std::mutex> lock(data->queueMutex);
      data->wake = std::move(wake);
    }
    data->drainScheduled.store(false);
    drain(data);
  }

  /**
   * Queue an operation to be executed on the dispatcher's thread.
   *
   * On the owning thread the operation runs immediately. From any other
   * thread it is queued and a drain is posted to the owning thread through
   * its wake callback, if one is registered.
   */
  void run(Operation op) {
    if (!_data)
      return;

    if (std::this_thread::get_id() == _data->threadId) {
      op();
      return;
    }

    WakeFn wake;
    {
      std::lock_guard<std::mutex> lock(_data->queueMutex);
      _data->operationQueue.push(std::move(op));
      wake = _data->wake;
    }
    if (wake) {
      scheduleDrain(_data, wake);
    }
  }

  /**
   * Process all pending operations for the current thread.
   * Must be called from the thread that owns this dispatcher.
   * Returns the number of operations processed.
   */
  size_t processQueue() {
    if (!_data)
      return 0;

    // Only process if we're on the correct thread
    if (std::this_thread::get_id() != _data->threadId) {
      return 0;
    }

    return drain(_data);
  }

  /**
   * Get the number of pending operations.
   */
  size_t getPendingCount() const {
    if (!_data)
      return 0;

    std::lock_guard<std::mutex> lock(_data->queueMutex);
    return _data->operationQueue.size();
  }

  /**
   * Returns the id of the thread this dispatcher posts to.
   */
  std::thread::id getThreadId() const {
    return _data ? _data->threadId : std::thread::id();
  }

  /**
   * Clean up dispatcher for a thread that's shutting down.
   */
  static void cleanup() {
    if (_threadDispatcher) {
      // Process any remaining operations
      drain(_threadDispatcher);

      // Remove from registry
      std::lock_guard<std::mutex> lock(_registryMutex);
      _dispatcherRegistry.erase(std::this_thread::get_id());

      _threadDispatcher.reset();
    }
  }
};

} // namespace RNSkia
