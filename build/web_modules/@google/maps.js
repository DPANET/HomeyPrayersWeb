import { c as createCommonjsModule, b as commonjsRequire, a as commonjsGlobal } from '../common/_commonjsHelpers-95e6deb5.js';
import url from 'url';
import https from 'https';
import net from 'net';
import tls from 'tls';
import assert from 'assert';
import util$2 from 'util';
import events from 'events';
import crypto$1 from 'crypto';

var task = createCommonjsModule(function (module, exports) {
/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// This is a utility class that makes it easier to work with asynchronous tasks.
// Here's why I don't just use Promises:
// (a) I don't want to depend on a Promise implementation.
// (b) Promises aren't cancellable (yet?), and I want cancellability.
//
// This is very stripped down, compared to Promises.
// (a) You can only call .thenDo() once. Because there's only one party waiting
//     on the result of a task, cancelling always propagates backwards.
// (b) The argument to .thenDo() must return either undefined or a Task. I don't
//     promote values to Tasks, like what happens with Promises.

var Task = exports;

/**
 * Creates a Task.
 *
 * The `doSomething` function is called immediately, so that it can start
 * whatever work is part of this task.
 *
 * The `doSomething` function is given a resolve function and a reject function,
 * and it should call one of them when the task is finished, to report its
 * result.
 *
 * The `doSomething` function can optionally return a cancel function. This will
 * be called if the task is cancelled.
 *
 * @param  {function(function(T), function(?)): function()} doSomething
 * @return {Task<T>}
 * @template T
 */
Task.start = function(doSomething) {
  var me = {};

  // onFinish should be called as soon as both finished and onFinish are
  // defined. It should be called by the piece of code that just defined either
  // finished or onFinish.
  var finished;
  var onFinish;
  var cleaners = [];

  function finish(err, result) {
    if (!finished) {
      finished = {err: err, result: result};

      if (onFinish) {
        onFinish();
        // To prevent memory leaks, delete our reference to onFinish after
        // calling it.
        onFinish = function() {};
      }

      var cleanup;
      while (cleanup = cleaners.pop()) {
        cleanup();
      }

      if (err === 'cancelled') {
        if (abort) abort();
      }

      abort = null;
    }
  }

  try {
    // doSomething must be called immediately.
    var abort = doSomething(
        function(result) { finish(null, result); },
        function(err)    { finish(err,  null);   });
  } catch (err) {
    finish(err, null);
  }

  /**
   * Cancels the task (unless the task has already finished, in which case
   * this call is ignored).
   *
   * Subsequent tasks created with #thenDo will not be started. However, clean-
   * up code added with #finished will run.
   */
  me.cancel = function() {
    finish('cancelled', null);
  };

  /**
   * Sets the listener that will be called with the result of this task, when
   * finished. This function can be called at most once.
   *
   * @param {function(?, T)} callback
   */
  function setListener(callback) {
    if (onFinish) {
      throw new Error('thenDo/finally called more than once');
    }
    if (finished) {
      onFinish = function() {};
      callback(finished.err, finished.result);
    } else {
      onFinish = function() {
        callback(finished.err, finished.result);
      };
    }
  }

  /**
   * Creates and returns a composite task, consisting of this task and a
   * subsequent task.
   *
   * @param {function(T): ?Task<U>} onResolve A function that will
   *     create a subsequent task. This function will be called
   *     asynchronously, with the result of this task, when it
   *     finishes. The return value must be a Task, or null/undefined.
   * @param {function(?): ?Task<U>} onReject A function that will
   *     create a subsequent task. This function will be called
   *     asynchronously, with the error produced by this task, when it
   *     finishes. The return value must be a Task, or null/undefined.
   * @return {Task<U>} The composite task. Cancelling the composite task cancels
   *     either this task or the subsequent task, depending on whether this
   *     task is finished.
   * @template U
   */
  me.thenDo = function(onResolve, onReject) {
    return compose(me, setListener, onResolve, onReject);
  };

  /**
   * Registers a cleanup function, that will be run when the task finishes,
   * regardless of error or cancellation.
   *
   * @param {function()} cleanup
   * @return {THIS}
   */
  me.finally = function(cleanup) {
    if (!finished) {
      cleaners.push(function() {
        process.nextTick(cleanup);
      });
    } else {
      process.nextTick(cleanup);
    }
    return me;
  };

  return me;
};

/**
 * Creates a Task with the given result.
 */
Task.withValue = function(result) {
  return Task.start(function(resolve) {
    resolve(result);
  });
};

/**
 * Creates a Task with the given error.
 */
Task.withError = function(err) {
  return Task.start(function(resolve, reject) {
    reject(err);
  });
};

/**
 * Returns a new task that races the given tasks. Eventually finishes with the
 * result or error of whichever task finishes first. If any task is cancelled,
 * all of the tasks are cancelled.
 *
 * @param {Array<Task<T>>} tasks
 * @return {Task<T>}
 * @template T
 */
Task.race = function(tasks) {
  return Task.start(function(resolve, reject) {
    function cancelAll() {
      tasks.forEach(function(task) {
        task.cancel();
      });
    }
    tasks.forEach(function(task) {
      task.finally(cancelAll).thenDo(resolve, reject);
    });
    return cancelAll;
  });
};

/**
 * Creates a composite task, which uses the output of the first task to create
 * a subsequent task, and represents the two tasks together.
 *
 * This function is internal-only. It is used by Task.thenDo().
 *
 * @param {Task<T>} firstTask
 * @param {function(function(?, T))} whenFirstTaskFinishes The private
 *     setListener method on the firstTask.
 * @param {function(T): Task<U>} onResolve
 * @param {function(?): Task<U>} onReject
 * @return {Task<U>}
 * @template T, U
 */
function compose(firstTask, whenFirstTaskFinishes, onResolve, onReject) {
  return Task.start(function(resolve, reject) {
    var cancelled;
    var currentTask = firstTask;

    whenFirstTaskFinishes(function(err, result) {
      currentTask = null;
      // createSubsequentTask must be called asynchronously.
      process.nextTick(function() {
        if (cancelled || err === 'cancelled') {
          return reject('cancelled');
        }

        // Start the subsequent task.
        if (err == null) {
          if (!onResolve) {
            return resolve(result);
          }
          try {
            currentTask = onResolve(result);
          } catch (caughtErr) {
            return reject(caughtErr);
          }
        } else {
          if (!onReject) {
            return reject(err);
          }
          try {
            currentTask = onReject(err);
          } catch (caughtErr) {
            return reject(caughtErr);
          }
        }

        // Was a subsequent task returned?
        if (!currentTask) {
          return resolve(undefined);
        }

        currentTask.thenDo(resolve, reject);
      });
    });

    return function cancelCompositeTask() {
      cancelled = true;
      if (currentTask) {
        currentTask.cancel();
      }
    };
  });
}
});

var version = '1.1.0';

/**
 * This currently needs to be applied to all Node.js versions
 * in order to determine if the `req` is an HTTP or HTTPS request.
 *
 * There is currently no PR attempting to move this property upstream.
 */
const patchMarker = "__agent_base_https_request_patched__";
if (!https.request[patchMarker]) {
  https.request = (function(request) {
    return function(_options, cb) {
      let options;
      if (typeof _options === 'string') {
        options = url.parse(_options);
      } else {
        options = Object.assign({}, _options);
      }
      if (null == options.port) {
        options.port = 443;
      }
      options.secureEndpoint = true;
      return request.call(https, options, cb);
    };
  })(https.request);
  https.request[patchMarker] = true;
}

/**
 * This is needed for Node.js >= 9.0.0 to make sure `https.get()` uses the
 * patched `https.request()`.
 *
 * Ref: https://github.com/nodejs/node/commit/5118f31
 */
https.get = function (_url, _options, cb) {
    let options;
    if (typeof _url === 'string' && _options && typeof _options !== 'function') {
      options = Object.assign({}, url.parse(_url), _options);
    } else if (!_options && !cb) {
      options = _url;
    } else if (!cb) {
      options = _url;
      cb = _options;
    }

  const req = https.request(options, cb);
  req.end();
  return req;
};

var es6Promise = createCommonjsModule(function (module, exports) {
/*!
 * @overview es6-promise - a tiny implementation of Promises/A+.
 * @copyright Copyright (c) 2014 Yehuda Katz, Tom Dale, Stefan Penner and contributors (Conversion to ES6 API by Jake Archibald)
 * @license   Licensed under MIT license
 *            See https://raw.githubusercontent.com/stefanpenner/es6-promise/master/LICENSE
 * @version   v4.2.8+1e68dce6
 */

(function (global, factory) {
	 module.exports = factory() ;
}(commonjsGlobal, (function () {
function objectOrFunction(x) {
  var type = typeof x;
  return x !== null && (type === 'object' || type === 'function');
}

function isFunction(x) {
  return typeof x === 'function';
}



var _isArray = void 0;
if (Array.isArray) {
  _isArray = Array.isArray;
} else {
  _isArray = function (x) {
    return Object.prototype.toString.call(x) === '[object Array]';
  };
}

var isArray = _isArray;

var len = 0;
var vertxNext = void 0;
var customSchedulerFn = void 0;

var asap = function asap(callback, arg) {
  queue[len] = callback;
  queue[len + 1] = arg;
  len += 2;
  if (len === 2) {
    // If len is 2, that means that we need to schedule an async flush.
    // If additional callbacks are queued before the queue is flushed, they
    // will be processed by this flush that we are scheduling.
    if (customSchedulerFn) {
      customSchedulerFn(flush);
    } else {
      scheduleFlush();
    }
  }
};

function setScheduler(scheduleFn) {
  customSchedulerFn = scheduleFn;
}

function setAsap(asapFn) {
  asap = asapFn;
}

var browserWindow = typeof window !== 'undefined' ? window : undefined;
var browserGlobal = browserWindow || {};
var BrowserMutationObserver = browserGlobal.MutationObserver || browserGlobal.WebKitMutationObserver;
var isNode = typeof self === 'undefined' && "undefined" !== 'undefined' && {}.toString.call(process) === '[object process]';

// test for web worker but not in IE10
var isWorker = typeof Uint8ClampedArray !== 'undefined' && typeof importScripts !== 'undefined' && typeof MessageChannel !== 'undefined';

// node
function useNextTick() {
  // node version 0.10.x displays a deprecation warning when nextTick is used recursively
  // see https://github.com/cujojs/when/issues/410 for details
  return function () {
    return process.nextTick(flush);
  };
}

// vertx
function useVertxTimer() {
  if (typeof vertxNext !== 'undefined') {
    return function () {
      vertxNext(flush);
    };
  }

  return useSetTimeout();
}

function useMutationObserver() {
  var iterations = 0;
  var observer = new BrowserMutationObserver(flush);
  var node = document.createTextNode('');
  observer.observe(node, { characterData: true });

  return function () {
    node.data = iterations = ++iterations % 2;
  };
}

// web worker
function useMessageChannel() {
  var channel = new MessageChannel();
  channel.port1.onmessage = flush;
  return function () {
    return channel.port2.postMessage(0);
  };
}

function useSetTimeout() {
  // Store setTimeout reference so es6-promise will be unaffected by
  // other code modifying setTimeout (like sinon.useFakeTimers())
  var globalSetTimeout = setTimeout;
  return function () {
    return globalSetTimeout(flush, 1);
  };
}

var queue = new Array(1000);
function flush() {
  for (var i = 0; i < len; i += 2) {
    var callback = queue[i];
    var arg = queue[i + 1];

    callback(arg);

    queue[i] = undefined;
    queue[i + 1] = undefined;
  }

  len = 0;
}

function attemptVertx() {
  try {
    var vertx = Function('return this')().require('vertx');
    vertxNext = vertx.runOnLoop || vertx.runOnContext;
    return useVertxTimer();
  } catch (e) {
    return useSetTimeout();
  }
}

var scheduleFlush = void 0;
// Decide what async method to use to triggering processing of queued callbacks:
if (isNode) {
  scheduleFlush = useNextTick();
} else if (BrowserMutationObserver) {
  scheduleFlush = useMutationObserver();
} else if (isWorker) {
  scheduleFlush = useMessageChannel();
} else if (browserWindow === undefined && typeof commonjsRequire === 'function') {
  scheduleFlush = attemptVertx();
} else {
  scheduleFlush = useSetTimeout();
}

function then(onFulfillment, onRejection) {
  var parent = this;

  var child = new this.constructor(noop);

  if (child[PROMISE_ID] === undefined) {
    makePromise(child);
  }

  var _state = parent._state;


  if (_state) {
    var callback = arguments[_state - 1];
    asap(function () {
      return invokeCallback(_state, child, callback, parent._result);
    });
  } else {
    subscribe(parent, child, onFulfillment, onRejection);
  }

  return child;
}

/**
  `Promise.resolve` returns a promise that will become resolved with the
  passed `value`. It is shorthand for the following:

  ```javascript
  let promise = new Promise(function(resolve, reject){
    resolve(1);
  });

  promise.then(function(value){
    // value === 1
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  let promise = Promise.resolve(1);

  promise.then(function(value){
    // value === 1
  });
  ```

  @method resolve
  @static
  @param {Any} value value that the returned promise will be resolved with
  Useful for tooling.
  @return {Promise} a promise that will become fulfilled with the given
  `value`
*/
function resolve$1(object) {
  /*jshint validthis:true */
  var Constructor = this;

  if (object && typeof object === 'object' && object.constructor === Constructor) {
    return object;
  }

  var promise = new Constructor(noop);
  resolve(promise, object);
  return promise;
}

var PROMISE_ID = Math.random().toString(36).substring(2);

function noop() {}

var PENDING = void 0;
var FULFILLED = 1;
var REJECTED = 2;

function selfFulfillment() {
  return new TypeError("You cannot resolve a promise with itself");
}

function cannotReturnOwn() {
  return new TypeError('A promises callback cannot return that same promise.');
}

function tryThen(then$$1, value, fulfillmentHandler, rejectionHandler) {
  try {
    then$$1.call(value, fulfillmentHandler, rejectionHandler);
  } catch (e) {
    return e;
  }
}

function handleForeignThenable(promise, thenable, then$$1) {
  asap(function (promise) {
    var sealed = false;
    var error = tryThen(then$$1, thenable, function (value) {
      if (sealed) {
        return;
      }
      sealed = true;
      if (thenable !== value) {
        resolve(promise, value);
      } else {
        fulfill(promise, value);
      }
    }, function (reason) {
      if (sealed) {
        return;
      }
      sealed = true;

      reject(promise, reason);
    }, 'Settle: ' + (promise._label || ' unknown promise'));

    if (!sealed && error) {
      sealed = true;
      reject(promise, error);
    }
  }, promise);
}

function handleOwnThenable(promise, thenable) {
  if (thenable._state === FULFILLED) {
    fulfill(promise, thenable._result);
  } else if (thenable._state === REJECTED) {
    reject(promise, thenable._result);
  } else {
    subscribe(thenable, undefined, function (value) {
      return resolve(promise, value);
    }, function (reason) {
      return reject(promise, reason);
    });
  }
}

function handleMaybeThenable(promise, maybeThenable, then$$1) {
  if (maybeThenable.constructor === promise.constructor && then$$1 === then && maybeThenable.constructor.resolve === resolve$1) {
    handleOwnThenable(promise, maybeThenable);
  } else {
    if (then$$1 === undefined) {
      fulfill(promise, maybeThenable);
    } else if (isFunction(then$$1)) {
      handleForeignThenable(promise, maybeThenable, then$$1);
    } else {
      fulfill(promise, maybeThenable);
    }
  }
}

function resolve(promise, value) {
  if (promise === value) {
    reject(promise, selfFulfillment());
  } else if (objectOrFunction(value)) {
    var then$$1 = void 0;
    try {
      then$$1 = value.then;
    } catch (error) {
      reject(promise, error);
      return;
    }
    handleMaybeThenable(promise, value, then$$1);
  } else {
    fulfill(promise, value);
  }
}

function publishRejection(promise) {
  if (promise._onerror) {
    promise._onerror(promise._result);
  }

  publish(promise);
}

function fulfill(promise, value) {
  if (promise._state !== PENDING) {
    return;
  }

  promise._result = value;
  promise._state = FULFILLED;

  if (promise._subscribers.length !== 0) {
    asap(publish, promise);
  }
}

function reject(promise, reason) {
  if (promise._state !== PENDING) {
    return;
  }
  promise._state = REJECTED;
  promise._result = reason;

  asap(publishRejection, promise);
}

function subscribe(parent, child, onFulfillment, onRejection) {
  var _subscribers = parent._subscribers;
  var length = _subscribers.length;


  parent._onerror = null;

  _subscribers[length] = child;
  _subscribers[length + FULFILLED] = onFulfillment;
  _subscribers[length + REJECTED] = onRejection;

  if (length === 0 && parent._state) {
    asap(publish, parent);
  }
}

function publish(promise) {
  var subscribers = promise._subscribers;
  var settled = promise._state;

  if (subscribers.length === 0) {
    return;
  }

  var child = void 0,
      callback = void 0,
      detail = promise._result;

  for (var i = 0; i < subscribers.length; i += 3) {
    child = subscribers[i];
    callback = subscribers[i + settled];

    if (child) {
      invokeCallback(settled, child, callback, detail);
    } else {
      callback(detail);
    }
  }

  promise._subscribers.length = 0;
}

function invokeCallback(settled, promise, callback, detail) {
  var hasCallback = isFunction(callback),
      value = void 0,
      error = void 0,
      succeeded = true;

  if (hasCallback) {
    try {
      value = callback(detail);
    } catch (e) {
      succeeded = false;
      error = e;
    }

    if (promise === value) {
      reject(promise, cannotReturnOwn());
      return;
    }
  } else {
    value = detail;
  }

  if (promise._state !== PENDING) ; else if (hasCallback && succeeded) {
    resolve(promise, value);
  } else if (succeeded === false) {
    reject(promise, error);
  } else if (settled === FULFILLED) {
    fulfill(promise, value);
  } else if (settled === REJECTED) {
    reject(promise, value);
  }
}

function initializePromise(promise, resolver) {
  try {
    resolver(function resolvePromise(value) {
      resolve(promise, value);
    }, function rejectPromise(reason) {
      reject(promise, reason);
    });
  } catch (e) {
    reject(promise, e);
  }
}

var id = 0;
function nextId() {
  return id++;
}

function makePromise(promise) {
  promise[PROMISE_ID] = id++;
  promise._state = undefined;
  promise._result = undefined;
  promise._subscribers = [];
}

function validationError() {
  return new Error('Array Methods must be provided an Array');
}

var Enumerator = function () {
  function Enumerator(Constructor, input) {
    this._instanceConstructor = Constructor;
    this.promise = new Constructor(noop);

    if (!this.promise[PROMISE_ID]) {
      makePromise(this.promise);
    }

    if (isArray(input)) {
      this.length = input.length;
      this._remaining = input.length;

      this._result = new Array(this.length);

      if (this.length === 0) {
        fulfill(this.promise, this._result);
      } else {
        this.length = this.length || 0;
        this._enumerate(input);
        if (this._remaining === 0) {
          fulfill(this.promise, this._result);
        }
      }
    } else {
      reject(this.promise, validationError());
    }
  }

  Enumerator.prototype._enumerate = function _enumerate(input) {
    for (var i = 0; this._state === PENDING && i < input.length; i++) {
      this._eachEntry(input[i], i);
    }
  };

  Enumerator.prototype._eachEntry = function _eachEntry(entry, i) {
    var c = this._instanceConstructor;
    var resolve$$1 = c.resolve;


    if (resolve$$1 === resolve$1) {
      var _then = void 0;
      var error = void 0;
      var didError = false;
      try {
        _then = entry.then;
      } catch (e) {
        didError = true;
        error = e;
      }

      if (_then === then && entry._state !== PENDING) {
        this._settledAt(entry._state, i, entry._result);
      } else if (typeof _then !== 'function') {
        this._remaining--;
        this._result[i] = entry;
      } else if (c === Promise$1) {
        var promise = new c(noop);
        if (didError) {
          reject(promise, error);
        } else {
          handleMaybeThenable(promise, entry, _then);
        }
        this._willSettleAt(promise, i);
      } else {
        this._willSettleAt(new c(function (resolve$$1) {
          return resolve$$1(entry);
        }), i);
      }
    } else {
      this._willSettleAt(resolve$$1(entry), i);
    }
  };

  Enumerator.prototype._settledAt = function _settledAt(state, i, value) {
    var promise = this.promise;


    if (promise._state === PENDING) {
      this._remaining--;

      if (state === REJECTED) {
        reject(promise, value);
      } else {
        this._result[i] = value;
      }
    }

    if (this._remaining === 0) {
      fulfill(promise, this._result);
    }
  };

  Enumerator.prototype._willSettleAt = function _willSettleAt(promise, i) {
    var enumerator = this;

    subscribe(promise, undefined, function (value) {
      return enumerator._settledAt(FULFILLED, i, value);
    }, function (reason) {
      return enumerator._settledAt(REJECTED, i, reason);
    });
  };

  return Enumerator;
}();

/**
  `Promise.all` accepts an array of promises, and returns a new promise which
  is fulfilled with an array of fulfillment values for the passed promises, or
  rejected with the reason of the first passed promise to be rejected. It casts all
  elements of the passed iterable to promises as it runs this algorithm.

  Example:

  ```javascript
  let promise1 = resolve(1);
  let promise2 = resolve(2);
  let promise3 = resolve(3);
  let promises = [ promise1, promise2, promise3 ];

  Promise.all(promises).then(function(array){
    // The array here would be [ 1, 2, 3 ];
  });
  ```

  If any of the `promises` given to `all` are rejected, the first promise
  that is rejected will be given as an argument to the returned promises's
  rejection handler. For example:

  Example:

  ```javascript
  let promise1 = resolve(1);
  let promise2 = reject(new Error("2"));
  let promise3 = reject(new Error("3"));
  let promises = [ promise1, promise2, promise3 ];

  Promise.all(promises).then(function(array){
    // Code here never runs because there are rejected promises!
  }, function(error) {
    // error.message === "2"
  });
  ```

  @method all
  @static
  @param {Array} entries array of promises
  @param {String} label optional string for labeling the promise.
  Useful for tooling.
  @return {Promise} promise that is fulfilled when all `promises` have been
  fulfilled, or rejected if any of them become rejected.
  @static
*/
function all(entries) {
  return new Enumerator(this, entries).promise;
}

/**
  `Promise.race` returns a new promise which is settled in the same way as the
  first passed promise to settle.

  Example:

  ```javascript
  let promise1 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 1');
    }, 200);
  });

  let promise2 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 2');
    }, 100);
  });

  Promise.race([promise1, promise2]).then(function(result){
    // result === 'promise 2' because it was resolved before promise1
    // was resolved.
  });
  ```

  `Promise.race` is deterministic in that only the state of the first
  settled promise matters. For example, even if other promises given to the
  `promises` array argument are resolved, but the first settled promise has
  become rejected before the other promises became fulfilled, the returned
  promise will become rejected:

  ```javascript
  let promise1 = new Promise(function(resolve, reject){
    setTimeout(function(){
      resolve('promise 1');
    }, 200);
  });

  let promise2 = new Promise(function(resolve, reject){
    setTimeout(function(){
      reject(new Error('promise 2'));
    }, 100);
  });

  Promise.race([promise1, promise2]).then(function(result){
    // Code here never runs
  }, function(reason){
    // reason.message === 'promise 2' because promise 2 became rejected before
    // promise 1 became fulfilled
  });
  ```

  An example real-world use case is implementing timeouts:

  ```javascript
  Promise.race([ajax('foo.json'), timeout(5000)])
  ```

  @method race
  @static
  @param {Array} promises array of promises to observe
  Useful for tooling.
  @return {Promise} a promise which settles in the same way as the first passed
  promise to settle.
*/
function race(entries) {
  /*jshint validthis:true */
  var Constructor = this;

  if (!isArray(entries)) {
    return new Constructor(function (_, reject) {
      return reject(new TypeError('You must pass an array to race.'));
    });
  } else {
    return new Constructor(function (resolve, reject) {
      var length = entries.length;
      for (var i = 0; i < length; i++) {
        Constructor.resolve(entries[i]).then(resolve, reject);
      }
    });
  }
}

/**
  `Promise.reject` returns a promise rejected with the passed `reason`.
  It is shorthand for the following:

  ```javascript
  let promise = new Promise(function(resolve, reject){
    reject(new Error('WHOOPS'));
  });

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  Instead of writing the above, your code now simply becomes the following:

  ```javascript
  let promise = Promise.reject(new Error('WHOOPS'));

  promise.then(function(value){
    // Code here doesn't run because the promise is rejected!
  }, function(reason){
    // reason.message === 'WHOOPS'
  });
  ```

  @method reject
  @static
  @param {Any} reason value that the returned promise will be rejected with.
  Useful for tooling.
  @return {Promise} a promise rejected with the given `reason`.
*/
function reject$1(reason) {
  /*jshint validthis:true */
  var Constructor = this;
  var promise = new Constructor(noop);
  reject(promise, reason);
  return promise;
}

function needsResolver() {
  throw new TypeError('You must pass a resolver function as the first argument to the promise constructor');
}

function needsNew() {
  throw new TypeError("Failed to construct 'Promise': Please use the 'new' operator, this object constructor cannot be called as a function.");
}

/**
  Promise objects represent the eventual result of an asynchronous operation. The
  primary way of interacting with a promise is through its `then` method, which
  registers callbacks to receive either a promise's eventual value or the reason
  why the promise cannot be fulfilled.

  Terminology
  -----------

  - `promise` is an object or function with a `then` method whose behavior conforms to this specification.
  - `thenable` is an object or function that defines a `then` method.
  - `value` is any legal JavaScript value (including undefined, a thenable, or a promise).
  - `exception` is a value that is thrown using the throw statement.
  - `reason` is a value that indicates why a promise was rejected.
  - `settled` the final resting state of a promise, fulfilled or rejected.

  A promise can be in one of three states: pending, fulfilled, or rejected.

  Promises that are fulfilled have a fulfillment value and are in the fulfilled
  state.  Promises that are rejected have a rejection reason and are in the
  rejected state.  A fulfillment value is never a thenable.

  Promises can also be said to *resolve* a value.  If this value is also a
  promise, then the original promise's settled state will match the value's
  settled state.  So a promise that *resolves* a promise that rejects will
  itself reject, and a promise that *resolves* a promise that fulfills will
  itself fulfill.


  Basic Usage:
  ------------

  ```js
  let promise = new Promise(function(resolve, reject) {
    // on success
    resolve(value);

    // on failure
    reject(reason);
  });

  promise.then(function(value) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Advanced Usage:
  ---------------

  Promises shine when abstracting away asynchronous interactions such as
  `XMLHttpRequest`s.

  ```js
  function getJSON(url) {
    return new Promise(function(resolve, reject){
      let xhr = new XMLHttpRequest();

      xhr.open('GET', url);
      xhr.onreadystatechange = handler;
      xhr.responseType = 'json';
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send();

      function handler() {
        if (this.readyState === this.DONE) {
          if (this.status === 200) {
            resolve(this.response);
          } else {
            reject(new Error('getJSON: `' + url + '` failed with status: [' + this.status + ']'));
          }
        }
      };
    });
  }

  getJSON('/posts.json').then(function(json) {
    // on fulfillment
  }, function(reason) {
    // on rejection
  });
  ```

  Unlike callbacks, promises are great composable primitives.

  ```js
  Promise.all([
    getJSON('/posts'),
    getJSON('/comments')
  ]).then(function(values){
    values[0] // => postsJSON
    values[1] // => commentsJSON

    return values;
  });
  ```

  @class Promise
  @param {Function} resolver
  Useful for tooling.
  @constructor
*/

var Promise$1 = function () {
  function Promise(resolver) {
    this[PROMISE_ID] = nextId();
    this._result = this._state = undefined;
    this._subscribers = [];

    if (noop !== resolver) {
      typeof resolver !== 'function' && needsResolver();
      this instanceof Promise ? initializePromise(this, resolver) : needsNew();
    }
  }

  /**
  The primary way of interacting with a promise is through its `then` method,
  which registers callbacks to receive either a promise's eventual value or the
  reason why the promise cannot be fulfilled.
   ```js
  findUser().then(function(user){
    // user is available
  }, function(reason){
    // user is unavailable, and you are given the reason why
  });
  ```
   Chaining
  --------
   The return value of `then` is itself a promise.  This second, 'downstream'
  promise is resolved with the return value of the first promise's fulfillment
  or rejection handler, or rejected if the handler throws an exception.
   ```js
  findUser().then(function (user) {
    return user.name;
  }, function (reason) {
    return 'default name';
  }).then(function (userName) {
    // If `findUser` fulfilled, `userName` will be the user's name, otherwise it
    // will be `'default name'`
  });
   findUser().then(function (user) {
    throw new Error('Found user, but still unhappy');
  }, function (reason) {
    throw new Error('`findUser` rejected and we're unhappy');
  }).then(function (value) {
    // never reached
  }, function (reason) {
    // if `findUser` fulfilled, `reason` will be 'Found user, but still unhappy'.
    // If `findUser` rejected, `reason` will be '`findUser` rejected and we're unhappy'.
  });
  ```
  If the downstream promise does not specify a rejection handler, rejection reasons will be propagated further downstream.
   ```js
  findUser().then(function (user) {
    throw new PedagogicalException('Upstream error');
  }).then(function (value) {
    // never reached
  }).then(function (value) {
    // never reached
  }, function (reason) {
    // The `PedgagocialException` is propagated all the way down to here
  });
  ```
   Assimilation
  ------------
   Sometimes the value you want to propagate to a downstream promise can only be
  retrieved asynchronously. This can be achieved by returning a promise in the
  fulfillment or rejection handler. The downstream promise will then be pending
  until the returned promise is settled. This is called *assimilation*.
   ```js
  findUser().then(function (user) {
    return findCommentsByAuthor(user);
  }).then(function (comments) {
    // The user's comments are now available
  });
  ```
   If the assimliated promise rejects, then the downstream promise will also reject.
   ```js
  findUser().then(function (user) {
    return findCommentsByAuthor(user);
  }).then(function (comments) {
    // If `findCommentsByAuthor` fulfills, we'll have the value here
  }, function (reason) {
    // If `findCommentsByAuthor` rejects, we'll have the reason here
  });
  ```
   Simple Example
  --------------
   Synchronous Example
   ```javascript
  let result;
   try {
    result = findResult();
    // success
  } catch(reason) {
    // failure
  }
  ```
   Errback Example
   ```js
  findResult(function(result, err){
    if (err) {
      // failure
    } else {
      // success
    }
  });
  ```
   Promise Example;
   ```javascript
  findResult().then(function(result){
    // success
  }, function(reason){
    // failure
  });
  ```
   Advanced Example
  --------------
   Synchronous Example
   ```javascript
  let author, books;
   try {
    author = findAuthor();
    books  = findBooksByAuthor(author);
    // success
  } catch(reason) {
    // failure
  }
  ```
   Errback Example
   ```js
   function foundBooks(books) {
   }
   function failure(reason) {
   }
   findAuthor(function(author, err){
    if (err) {
      failure(err);
      // failure
    } else {
      try {
        findBoooksByAuthor(author, function(books, err) {
          if (err) {
            failure(err);
          } else {
            try {
              foundBooks(books);
            } catch(reason) {
              failure(reason);
            }
          }
        });
      } catch(error) {
        failure(err);
      }
      // success
    }
  });
  ```
   Promise Example;
   ```javascript
  findAuthor().
    then(findBooksByAuthor).
    then(function(books){
      // found books
  }).catch(function(reason){
    // something went wrong
  });
  ```
   @method then
  @param {Function} onFulfilled
  @param {Function} onRejected
  Useful for tooling.
  @return {Promise}
  */

  /**
  `catch` is simply sugar for `then(undefined, onRejection)` which makes it the same
  as the catch block of a try/catch statement.
  ```js
  function findAuthor(){
  throw new Error('couldn't find that author');
  }
  // synchronous
  try {
  findAuthor();
  } catch(reason) {
  // something went wrong
  }
  // async with promises
  findAuthor().catch(function(reason){
  // something went wrong
  });
  ```
  @method catch
  @param {Function} onRejection
  Useful for tooling.
  @return {Promise}
  */


  Promise.prototype.catch = function _catch(onRejection) {
    return this.then(null, onRejection);
  };

  /**
    `finally` will be invoked regardless of the promise's fate just as native
    try/catch/finally behaves
  
    Synchronous example:
  
    ```js
    findAuthor() {
      if (Math.random() > 0.5) {
        throw new Error();
      }
      return new Author();
    }
  
    try {
      return findAuthor(); // succeed or fail
    } catch(error) {
      return findOtherAuther();
    } finally {
      // always runs
      // doesn't affect the return value
    }
    ```
  
    Asynchronous example:
  
    ```js
    findAuthor().catch(function(reason){
      return findOtherAuther();
    }).finally(function(){
      // author was either found, or not
    });
    ```
  
    @method finally
    @param {Function} callback
    @return {Promise}
  */


  Promise.prototype.finally = function _finally(callback) {
    var promise = this;
    var constructor = promise.constructor;

    if (isFunction(callback)) {
      return promise.then(function (value) {
        return constructor.resolve(callback()).then(function () {
          return value;
        });
      }, function (reason) {
        return constructor.resolve(callback()).then(function () {
          throw reason;
        });
      });
    }

    return promise.then(callback, callback);
  };

  return Promise;
}();

Promise$1.prototype.then = then;
Promise$1.all = all;
Promise$1.race = race;
Promise$1.resolve = resolve$1;
Promise$1.reject = reject$1;
Promise$1._setScheduler = setScheduler;
Promise$1._setAsap = setAsap;
Promise$1._asap = asap;

/*global self*/
function polyfill() {
  var local = void 0;

  if (typeof commonjsGlobal !== 'undefined') {
    local = commonjsGlobal;
  } else if (typeof self !== 'undefined') {
    local = self;
  } else {
    try {
      local = Function('return this')();
    } catch (e) {
      throw new Error('polyfill failed because global object is unavailable in this environment');
    }
  }

  var P = local.Promise;

  if (P) {
    var promiseToString = null;
    try {
      promiseToString = Object.prototype.toString.call(P.resolve());
    } catch (e) {
      // silently ignored
    }

    if (promiseToString === '[object Promise]' && !P.cast) {
      return;
    }
  }

  local.Promise = Promise$1;
}

// Strange compat..
Promise$1.polyfill = polyfill;
Promise$1.Promise = Promise$1;

return Promise$1;

})));




});

/* global self, window, module, global, require */
var promise = function () {

    var globalObject = void 0;

    function isFunction(x) {
        return typeof x === "function";
    }

    // Seek the global object
    if (commonjsGlobal !== undefined) {
        globalObject = commonjsGlobal;
    } else if (window !== undefined && window.document) {
        globalObject = window;
    } else {
        globalObject = self;
    }

    // Test for any native promise implementation, and if that
    // implementation appears to conform to the specificaton.
    // This code mostly nicked from the es6-promise module polyfill
    // and then fooled with.
    var hasPromiseSupport = function () {

        // No promise object at all, and it's a non-starter
        if (!globalObject.hasOwnProperty("Promise")) {
            return false;
        }

        // There is a Promise object. Does it conform to the spec?
        var P = globalObject.Promise;

        // Some of these methods are missing from
        // Firefox/Chrome experimental implementations
        if (!P.hasOwnProperty("resolve") || !P.hasOwnProperty("reject")) {
            return false;
        }

        if (!P.hasOwnProperty("all") || !P.hasOwnProperty("race")) {
            return false;
        }

        // Older version of the spec had a resolver object
        // as the arg rather than a function
        return function () {

            var resolve = void 0;

            var p = new globalObject.Promise(function (r) {
                resolve = r;
            });

            if (p) {
                return isFunction(resolve);
            }

            return false;
        }();
    }();

    // Export the native Promise implementation if it
    // looks like it matches the spec
    if (hasPromiseSupport) {
        return globalObject.Promise;
    }

    //  Otherwise, return the es6-promise polyfill by @jaffathecake.
    return es6Promise.Promise;
}();

/* global module, require */
var promisify = function () {

    // Get a promise object. This may be native, or it may be polyfilled

    var ES6Promise = promise;

    /**
     * thatLooksLikeAPromiseToMe()
     *
     * Duck-types a promise.
     *
     * @param {object} o
     * @return {bool} True if this resembles a promise
     */
    function thatLooksLikeAPromiseToMe(o) {
        return o && typeof o.then === "function" && typeof o.catch === "function";
    }

    /**
     * promisify()
     *
     * Transforms callback-based function -- func(arg1, arg2 .. argN, callback) -- into
     * an ES6-compatible Promise. Promisify provides a default callback of the form (error, result)
     * and rejects when `error` is truthy. You can also supply settings object as the second argument.
     *
     * @param {function} original - The function to promisify
     * @param {object} settings - Settings object
     * @param {object} settings.thisArg - A `this` context to use. If not set, assume `settings` _is_ `thisArg`
     * @param {bool} settings.multiArgs - Should multiple arguments be returned as an array?
     * @return {function} A promisified version of `original`
     */
    return function promisify(original, settings) {

        return function () {
            for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
                args[_key] = arguments[_key];
            }

            var returnMultipleArguments = settings && settings.multiArgs;

            var target = void 0;
            if (settings && settings.thisArg) {
                target = settings.thisArg;
            } else if (settings) {
                target = settings;
            }

            // Return the promisified function
            return new ES6Promise(function (resolve, reject) {

                // Append the callback bound to the context
                args.push(function callback(err) {

                    if (err) {
                        return reject(err);
                    }

                    for (var _len2 = arguments.length, values = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
                        values[_key2 - 1] = arguments[_key2];
                    }

                    if (false === !!returnMultipleArguments) {
                        return resolve(values[0]);
                    }

                    resolve(values);
                });

                // Call the function
                var response = original.apply(target, args);

                // If it looks like original already returns a promise,
                // then just resolve with that promise. Hopefully, the callback function we added will just be ignored.
                if (thatLooksLikeAPromiseToMe(response)) {
                    resolve(response);
                }
            });
        };
    };
}();

const inherits = util$2.inherits;

const EventEmitter = events.EventEmitter;

var agentBase = Agent;

function isAgent(v) {
  return v && typeof v.addRequest === 'function';
}

/**
 * Base `http.Agent` implementation.
 * No pooling/keep-alive is implemented by default.
 *
 * @param {Function} callback
 * @api public
 */
function Agent(callback, _opts) {
  if (!(this instanceof Agent)) {
    return new Agent(callback, _opts);
  }

  EventEmitter.call(this);

  // The callback gets promisified if it has 3 parameters
  // (i.e. it has a callback function) lazily
  this._promisifiedCallback = false;

  let opts = _opts;
  if ('function' === typeof callback) {
    this.callback = callback;
  } else if (callback) {
    opts = callback;
  }

  // timeout for the socket to be returned from the callback
  this.timeout = (opts && opts.timeout) || null;

  this.options = opts;
}
inherits(Agent, EventEmitter);

/**
 * Override this function in your subclass!
 */
Agent.prototype.callback = function callback(req, opts) {
  throw new Error(
    '"agent-base" has no default implementation, you must subclass and override `callback()`'
  );
};

/**
 * Called by node-core's "_http_client.js" module when creating
 * a new HTTP request with this Agent instance.
 *
 * @api public
 */
Agent.prototype.addRequest = function addRequest(req, _opts) {
  const ownOpts = Object.assign({}, _opts);

  // Set default `host` for HTTP to localhost
  if (null == ownOpts.host) {
    ownOpts.host = 'localhost';
  }

  // Set default `port` for HTTP if none was explicitly specified
  if (null == ownOpts.port) {
    ownOpts.port = ownOpts.secureEndpoint ? 443 : 80;
  }

  const opts = Object.assign({}, this.options, ownOpts);

  if (opts.host && opts.path) {
    // If both a `host` and `path` are specified then it's most likely the
    // result of a `url.parse()` call... we need to remove the `path` portion so
    // that `net.connect()` doesn't attempt to open that as a unix socket file.
    delete opts.path;
  }

  delete opts.agent;
  delete opts.hostname;
  delete opts._defaultAgent;
  delete opts.defaultPort;
  delete opts.createConnection;

  // Hint to use "Connection: close"
  // XXX: non-documented `http` module API :(
  req._last = true;
  req.shouldKeepAlive = false;

  // Create the `stream.Duplex` instance
  let timeout;
  let timedOut = false;
  const timeoutMs = this.timeout;
  const freeSocket = this.freeSocket;

  function onerror(err) {
    if (req._hadError) return;
    req.emit('error', err);
    // For Safety. Some additional errors might fire later on
    // and we need to make sure we don't double-fire the error event.
    req._hadError = true;
  }

  function ontimeout() {
    timeout = null;
    timedOut = true;
    const err = new Error(
      'A "socket" was not created for HTTP request before ' + timeoutMs + 'ms'
    );
    err.code = 'ETIMEOUT';
    onerror(err);
  }

  function callbackError(err) {
    if (timedOut) return;
    if (timeout != null) {
      clearTimeout(timeout);
      timeout = null;
    }
    onerror(err);
  }

  function onsocket(socket) {
    if (timedOut) return;
    if (timeout != null) {
      clearTimeout(timeout);
      timeout = null;
    }
    if (isAgent(socket)) {
      // `socket` is actually an http.Agent instance, so relinquish
      // responsibility for this `req` to the Agent from here on
      socket.addRequest(req, opts);
    } else if (socket) {
      function onfree() {
        freeSocket(socket, opts);
      }
      socket.on('free', onfree);
      req.onSocket(socket);
    } else {
      const err = new Error(
        'no Duplex stream was returned to agent-base for `' + req.method + ' ' + req.path + '`'
      );
      onerror(err);
    }
  }

  if (!this._promisifiedCallback && this.callback.length >= 3) {
    // Legacy callback function - convert to a Promise
    this.callback = promisify(this.callback, this);
    this._promisifiedCallback = true;
  }

  if (timeoutMs > 0) {
    timeout = setTimeout(ontimeout, timeoutMs);
  }

  try {
    Promise.resolve(this.callback(req, opts)).then(onsocket, callbackError);
  } catch (err) {
    Promise.reject(err).catch(callbackError);
  }
};

Agent.prototype.freeSocket = function freeSocket(socket, opts) {
  // TODO reuse sockets
  socket.destroy();
};

/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var w = d * 7;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

var ms = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isFinite(val)) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'weeks':
    case 'week':
    case 'w':
      return n * w;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (msAbs >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (msAbs >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (msAbs >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  var msAbs = Math.abs(ms);
  if (msAbs >= d) {
    return plural(ms, msAbs, d, 'day');
  }
  if (msAbs >= h) {
    return plural(ms, msAbs, h, 'hour');
  }
  if (msAbs >= m) {
    return plural(ms, msAbs, m, 'minute');
  }
  if (msAbs >= s) {
    return plural(ms, msAbs, s, 'second');
  }
  return ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, msAbs, n, name) {
  var isPlural = msAbs >= n * 1.5;
  return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
}

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 */
function setup(env) {
  createDebug.debug = createDebug;
  createDebug.default = createDebug;
  createDebug.coerce = coerce;
  createDebug.disable = disable;
  createDebug.enable = enable;
  createDebug.enabled = enabled;
  createDebug.humanize = ms;
  Object.keys(env).forEach(function (key) {
    createDebug[key] = env[key];
  });
  /**
  * Active `debug` instances.
  */

  createDebug.instances = [];
  /**
  * The currently active debug mode names, and names to skip.
  */

  createDebug.names = [];
  createDebug.skips = [];
  /**
  * Map of special "%n" handling functions, for the debug "format" argument.
  *
  * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
  */

  createDebug.formatters = {};
  /**
  * Selects a color for a debug namespace
  * @param {String} namespace The namespace string for the for the debug instance to be colored
  * @return {Number|String} An ANSI color code for the given namespace
  * @api private
  */

  function selectColor(namespace) {
    var hash = 0;

    for (var i = 0; i < namespace.length; i++) {
      hash = (hash << 5) - hash + namespace.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }

    return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
  }

  createDebug.selectColor = selectColor;
  /**
  * Create a debugger with the given `namespace`.
  *
  * @param {String} namespace
  * @return {Function}
  * @api public
  */

  function createDebug(namespace) {
    var prevTime;

    function debug() {
      // Disabled?
      if (!debug.enabled) {
        return;
      }

      for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      var self = debug; // Set `diff` timestamp

      var curr = Number(new Date());
      var ms = curr - (prevTime || curr);
      self.diff = ms;
      self.prev = prevTime;
      self.curr = curr;
      prevTime = curr;
      args[0] = createDebug.coerce(args[0]);

      if (typeof args[0] !== 'string') {
        // Anything else let's inspect with %O
        args.unshift('%O');
      } // Apply any `formatters` transformations


      var index = 0;
      args[0] = args[0].replace(/%([a-zA-Z%])/g, function (match, format) {
        // If we encounter an escaped % then don't increase the array index
        if (match === '%%') {
          return match;
        }

        index++;
        var formatter = createDebug.formatters[format];

        if (typeof formatter === 'function') {
          var val = args[index];
          match = formatter.call(self, val); // Now we need to remove `args[index]` since it's inlined in the `format`

          args.splice(index, 1);
          index--;
        }

        return match;
      }); // Apply env-specific formatting (colors, etc.)

      createDebug.formatArgs.call(self, args);
      var logFn = self.log || createDebug.log;
      logFn.apply(self, args);
    }

    debug.namespace = namespace;
    debug.enabled = createDebug.enabled(namespace);
    debug.useColors = createDebug.useColors();
    debug.color = selectColor(namespace);
    debug.destroy = destroy;
    debug.extend = extend; // Debug.formatArgs = formatArgs;
    // debug.rawLog = rawLog;
    // env-specific initialization logic for debug instances

    if (typeof createDebug.init === 'function') {
      createDebug.init(debug);
    }

    createDebug.instances.push(debug);
    return debug;
  }

  function destroy() {
    var index = createDebug.instances.indexOf(this);

    if (index !== -1) {
      createDebug.instances.splice(index, 1);
      return true;
    }

    return false;
  }

  function extend(namespace, delimiter) {
    return createDebug(this.namespace + (typeof delimiter === 'undefined' ? ':' : delimiter) + namespace);
  }
  /**
  * Enables a debug mode by namespaces. This can include modes
  * separated by a colon and wildcards.
  *
  * @param {String} namespaces
  * @api public
  */


  function enable(namespaces) {
    createDebug.save(namespaces);
    createDebug.names = [];
    createDebug.skips = [];
    var i;
    var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
    var len = split.length;

    for (i = 0; i < len; i++) {
      if (!split[i]) {
        // ignore empty strings
        continue;
      }

      namespaces = split[i].replace(/\*/g, '.*?');

      if (namespaces[0] === '-') {
        createDebug.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
      } else {
        createDebug.names.push(new RegExp('^' + namespaces + '$'));
      }
    }

    for (i = 0; i < createDebug.instances.length; i++) {
      var instance = createDebug.instances[i];
      instance.enabled = createDebug.enabled(instance.namespace);
    }
  }
  /**
  * Disable debug output.
  *
  * @api public
  */


  function disable() {
    createDebug.enable('');
  }
  /**
  * Returns true if the given mode name is enabled, false otherwise.
  *
  * @param {String} name
  * @return {Boolean}
  * @api public
  */


  function enabled(name) {
    if (name[name.length - 1] === '*') {
      return true;
    }

    var i;
    var len;

    for (i = 0, len = createDebug.skips.length; i < len; i++) {
      if (createDebug.skips[i].test(name)) {
        return false;
      }
    }

    for (i = 0, len = createDebug.names.length; i < len; i++) {
      if (createDebug.names[i].test(name)) {
        return true;
      }
    }

    return false;
  }
  /**
  * Coerce `val`.
  *
  * @param {Mixed} val
  * @return {Mixed}
  * @api private
  */


  function coerce(val) {
    if (val instanceof Error) {
      return val.stack || val.message;
    }

    return val;
  }

  createDebug.enable(createDebug.load());
  return createDebug;
}

var common = setup;

var browser = createCommonjsModule(function (module, exports) {

function _typeof(obj) { if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") { _typeof = function _typeof(obj) { return typeof obj; }; } else { _typeof = function _typeof(obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }; } return _typeof(obj); }

/* eslint-env browser */

/**
 * This is the web browser implementation of `debug()`.
 */
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = localstorage();
/**
 * Colors.
 */

exports.colors = ['#0000CC', '#0000FF', '#0033CC', '#0033FF', '#0066CC', '#0066FF', '#0099CC', '#0099FF', '#00CC00', '#00CC33', '#00CC66', '#00CC99', '#00CCCC', '#00CCFF', '#3300CC', '#3300FF', '#3333CC', '#3333FF', '#3366CC', '#3366FF', '#3399CC', '#3399FF', '#33CC00', '#33CC33', '#33CC66', '#33CC99', '#33CCCC', '#33CCFF', '#6600CC', '#6600FF', '#6633CC', '#6633FF', '#66CC00', '#66CC33', '#9900CC', '#9900FF', '#9933CC', '#9933FF', '#99CC00', '#99CC33', '#CC0000', '#CC0033', '#CC0066', '#CC0099', '#CC00CC', '#CC00FF', '#CC3300', '#CC3333', '#CC3366', '#CC3399', '#CC33CC', '#CC33FF', '#CC6600', '#CC6633', '#CC9900', '#CC9933', '#CCCC00', '#CCCC33', '#FF0000', '#FF0033', '#FF0066', '#FF0099', '#FF00CC', '#FF00FF', '#FF3300', '#FF3333', '#FF3366', '#FF3399', '#FF33CC', '#FF33FF', '#FF6600', '#FF6633', '#FF9900', '#FF9933', '#FFCC00', '#FFCC33'];
/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */
// eslint-disable-next-line complexity

function useColors() {
  // NB: In an Electron preload script, document will be defined but not fully
  // initialized. Since we know we're in Chrome, we'll just detect this case
  // explicitly
  if (typeof window !== 'undefined' && window.process && (window.process.type === 'renderer' || window.process.__nwjs)) {
    return true;
  } // Internet Explorer and Edge do not support colors.


  if (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)) {
    return false;
  } // Is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632


  return typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
  typeof window !== 'undefined' && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
  // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
  typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
  typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
}
/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */


function formatArgs(args) {
  args[0] = (this.useColors ? '%c' : '') + this.namespace + (this.useColors ? ' %c' : ' ') + args[0] + (this.useColors ? '%c ' : ' ') + '+' + module.exports.humanize(this.diff);

  if (!this.useColors) {
    return;
  }

  var c = 'color: ' + this.color;
  args.splice(1, 0, c, 'color: inherit'); // The final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into

  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-zA-Z%]/g, function (match) {
    if (match === '%%') {
      return;
    }

    index++;

    if (match === '%c') {
      // We only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });
  args.splice(lastC, 0, c);
}
/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */


function log() {
  var _console;

  // This hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return (typeof console === "undefined" ? "undefined" : _typeof(console)) === 'object' && console.log && (_console = console).log.apply(_console, arguments);
}
/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */


function save(namespaces) {
  try {
    if (namespaces) {
      exports.storage.setItem('debug', namespaces);
    } else {
      exports.storage.removeItem('debug');
    }
  } catch (error) {// Swallow
    // XXX (@Qix-) should we be logging these?
  }
}
/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */


function load() {
  var r;

  try {
    r = exports.storage.getItem('debug');
  } catch (error) {} // Swallow
  // XXX (@Qix-) should we be logging these?
  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG


  if (!r && "undefined" !== 'undefined' && 'env' in process) {
    r = ({}).DEBUG;
  }

  return r;
}
/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */


function localstorage() {
  try {
    // TVMLKit (Apple TV JS Runtime) does not have a window object, just localStorage in the global context
    // The Browser also has localStorage in the global context.
    return localStorage;
  } catch (error) {// Swallow
    // XXX (@Qix-) should we be logging these?
  }
}

module.exports = common(exports);
var formatters = module.exports.formatters;
/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

formatters.j = function (v) {
  try {
    return JSON.stringify(v);
  } catch (error) {
    return '[UnexpectedJSONParseError]: ' + error.message;
  }
};
});

/**
 * Module dependencies.
 */






var inherits$1 = util$2.inherits;
var debug = browser('https-proxy-agent');

/**
 * The `HttpsProxyAgent` implements an HTTP Agent subclass that connects to the
 * specified "HTTP(s) proxy server" in order to proxy HTTPS requests.
 *
 * @api public
 */

function HttpsProxyAgent(opts) {
	if (!(this instanceof HttpsProxyAgent)) return new HttpsProxyAgent(opts);
	if ('string' == typeof opts) opts = url.parse(opts);
	if (!opts)
		throw new Error(
			'an HTTP(S) proxy server `host` and `port` must be specified!'
		);
	debug('creating new HttpsProxyAgent instance: %o', opts);
	agentBase.call(this, opts);

	var proxy = Object.assign({}, opts);

	// if `true`, then connect to the proxy server over TLS. defaults to `false`.
	this.secureProxy = proxy.protocol
		? /^https:?$/i.test(proxy.protocol)
		: false;

	// prefer `hostname` over `host`, and set the `port` if needed
	proxy.host = proxy.hostname || proxy.host;
	proxy.port = +proxy.port || (this.secureProxy ? 443 : 80);

	// ALPN is supported by Node.js >= v5.
	// attempt to negotiate http/1.1 for proxy servers that support http/2
	if (this.secureProxy && !('ALPNProtocols' in proxy)) {
		proxy.ALPNProtocols = ['http 1.1'];
	}

	if (proxy.host && proxy.path) {
		// if both a `host` and `path` are specified then it's most likely the
		// result of a `url.parse()` call... we need to remove the `path` portion so
		// that `net.connect()` doesn't attempt to open that as a unix socket file.
		delete proxy.path;
		delete proxy.pathname;
	}

	this.proxy = proxy;
	this.defaultPort = 443;
}
inherits$1(HttpsProxyAgent, agentBase);

/**
 * Called when the node-core HTTP client library is creating a new HTTP request.
 *
 * @api public
 */

HttpsProxyAgent.prototype.callback = function connect(req, opts, fn) {
	var proxy = this.proxy;

	// create a socket connection to the proxy server
	var socket;
	if (this.secureProxy) {
		socket = tls.connect(proxy);
	} else {
		socket = net.connect(proxy);
	}

	// we need to buffer any HTTP traffic that happens with the proxy before we get
	// the CONNECT response, so that if the response is anything other than an "200"
	// response code, then we can re-play the "data" events on the socket once the
	// HTTP parser is hooked up...
	var buffers = [];
	var buffersLength = 0;

	function read() {
		var b = socket.read();
		if (b) ondata(b);
		else socket.once('readable', read);
	}

	function cleanup() {
		socket.removeListener('end', onend);
		socket.removeListener('error', onerror);
		socket.removeListener('close', onclose);
		socket.removeListener('readable', read);
	}

	function onclose(err) {
		debug('onclose had error %o', err);
	}

	function onend() {
		debug('onend');
	}

	function onerror(err) {
		cleanup();
		fn(err);
	}

	function ondata(b) {
		buffers.push(b);
		buffersLength += b.length;
		var buffered = Buffer.concat(buffers, buffersLength);
		var str = buffered.toString('ascii');

		if (!~str.indexOf('\r\n\r\n')) {
			// keep buffering
			debug('have not received end of HTTP headers yet...');
			read();
			return;
		}

		var firstLine = str.substring(0, str.indexOf('\r\n'));
		var statusCode = +firstLine.split(' ')[1];
		debug('got proxy server response: %o', firstLine);

		if (200 == statusCode) {
			// 200 Connected status code!
			var sock = socket;

			// nullify the buffered data since we won't be needing it
			buffers = buffered = null;

			if (opts.secureEndpoint) {
				// since the proxy is connecting to an SSL server, we have
				// to upgrade this socket connection to an SSL connection
				debug(
					'upgrading proxy-connected socket to TLS connection: %o',
					opts.host
				);
				opts.socket = socket;
				opts.servername = opts.servername || opts.host;
				opts.host = null;
				opts.hostname = null;
				opts.port = null;
				sock = tls.connect(opts);
			}

			cleanup();
			req.once('socket', resume);
			fn(null, sock);
		} else {
			// some other status code that's not 200... need to re-play the HTTP header
			// "data" events onto the socket once the HTTP machinery is attached so
			// that the node core `http` can parse and handle the error status code
			cleanup();

			// the original socket is closed, and a new closed socket is
			// returned instead, so that the proxy doesn't get the HTTP request
			// written to it (which may contain `Authorization` headers or other
			// sensitive data).
			//
			// See: https://hackerone.com/reports/541502
			socket.destroy();
			socket = new net.Socket();
			socket.readable = true;


			// save a reference to the concat'd Buffer for the `onsocket` callback
			buffers = buffered;

			// need to wait for the "socket" event to re-play the "data" events
			req.once('socket', onsocket);

			fn(null, socket);
		}
	}

	function onsocket(socket) {
		debug('replaying proxy buffer for failed request');
		assert(socket.listenerCount('data') > 0);

		// replay the "buffers" Buffer onto the `socket`, since at this point
		// the HTTP module machinery has been hooked up for the user
		socket.push(buffers);

		// nullify the cached Buffer instance
		buffers = null;
	}

	socket.on('error', onerror);
	socket.on('close', onclose);
	socket.on('end', onend);

	read();

	var hostname = opts.host + ':' + opts.port;
	var msg = 'CONNECT ' + hostname + ' HTTP/1.1\r\n';

	var headers = Object.assign({}, proxy.headers);
	if (proxy.auth) {
		headers['Proxy-Authorization'] =
			'Basic ' + Buffer.from(proxy.auth).toString('base64');
	}

	// the Host header should only include the port
	// number when it is a non-standard port
	var host = opts.host;
	if (!isDefaultPort(opts.port, opts.secureEndpoint)) {
		host += ':' + opts.port;
	}
	headers['Host'] = host;

	headers['Connection'] = 'close';
	Object.keys(headers).forEach(function(name) {
		msg += name + ': ' + headers[name] + '\r\n';
	});

	socket.write(msg + '\r\n');
};

/**
 * Resumes a socket.
 *
 * @param {(net.Socket|tls.Socket)} socket The socket to resume
 * @api public
 */

function resume(socket) {
	socket.resume();
}

function isDefaultPort(port, secure) {
	return Boolean((!secure && port === 80) || (secure && port === 443));
}

/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


var parse$1 = url.parse;



// add keep-alive header to speed up request
var agent = new https.Agent({ keepAlive: true });


/**
 * Makes a secure HTTP GET request for the given URL.
 *
 * Calls the callback with two parameters (err, response). If there was an
 * error, response should be null. If there was no error, err should be null,
 * and response should be an object with these properties
 * {
 *   status: number,
 *   headers: Object,
 *   json: Object
 * }
 *
 * Returns a function that cancels the request.
 *
 * @param {string} url
 * @param {function(ClientResponse)} onSuccess
 * @param {function(?)} onError
 * @param {Object} options
 * @return {function()}
 */
var makeUrlRequest = function makeUrlRequest(url, onSuccess, onError, options) {

  var requestOptions = parse$1(url);
  var body;

  // Allow each API to provide some of the request options such as the
  // HTTP method, headers, etc.
  if (options) {
    for (var k in options) {
      if (k === 'body') {
        body = options[k];
      } else {
        requestOptions[k] = options[k];
      }
    }
  }

  requestOptions.headers = requestOptions.headers || {};
  requestOptions.headers['User-Agent'] = 'GoogleGeoApiClientJS/' + version;

  var request = https.request(requestOptions, function (response) {

    response.on('error', function (error) {
      onError(error);
    });

    if (response.statusCode === 302) {
      // Handle redirect.
      var url = response.headers['location'];
      makeUrlRequest(url, onSuccess, onError, options);
    } else if (response.headers['content-type'].toLowerCase() == 'application/json; charset=utf-8') {
      // Handle JSON.
      var data = [];
      response.on('data', function (chunk) {
        data.push(chunk);
      });
      response.on('end', function () {
        var json;
        try {
          json = JSON.parse(Buffer.concat(data).toString());
        } catch (error) {
          onError(error);
          return;
        }
        onSuccess({
          status: response.statusCode,
          headers: response.headers,
          json: json
        });
      });
    } else {
      // Fallback is for binary data, namely places photo download,
      // so just provide the response stream. Also provide the same
      // consistent name for status checking as per JSON responses.
      response.status = response.statusCode;
      onSuccess(response);
    }

  }).on('error', function (error) {
    onError(error);
  });

  if (body) {
    request.write(JSON.stringify(body));
  }

  request.end();

  return function cancel() { request.abort(); };
};

/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */



var inject = function(setTimeout, clearTimeout) {
  /**
   * Returns a task that waits for the given delay.
   * @param  {number} delayMs
   * @return {Task<undefined>}
   */
  return function wait(delayMs) {
    return task.start(function(resolve) {
      var id = setTimeout(resolve, delayMs);
      return function cancel() {
        clearTimeout(id);
      };
    });
  }
};

var wait = {
	inject: inject
};

/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var inject$1 = function(wait) {
  var Task = task;

  return {
    /**
     * Repeatedly calls the 'do' function, until its result passes the 'until'
     * predicate, or timeout. The 'do' function is retried with exponential
     * backoff.
     *
     * @param {function(): Task<T>} options.do Starts the task to try
     *     repeatedly.
     * @param {function(T): boolean} options.until A predicate that checks
     *     whether the result of options.do was successful.
     * @return {Task<T>}
     * @template T
     */
    attempt: function(options) {
      var doSomething = options['do'];
      var isSuccessful = options.until;
      var interval = options.interval || 500;
      var increment = options.increment || 1.5;
      var jitter = options.jitter || 0.5;

      return Task.withValue().thenDo(function loop() {
        return doSomething().thenDo(function(result) {
          if (isSuccessful(result)) {
            return Task.withValue(result);
          }

          var delay = interval * (1 + jitter * (2 * Math.random() - 1));
          interval *= increment;
          return wait(delay).thenDo(loop);
        });
      });
    }
  };
};

var attempt = {
	inject: inject$1
};

/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var create = function(size) {
  var items = [];
  var current = 0;

  return {
    /**
     * Inserts an item into the circular buffer. The new item will have index 0,
     * and all other items will have their index incremented.
     */
    insert: function(item) {
      current = (current + 1) % size;
      items[current] = item;
    },
    /**
     * Returns the i-th item from the buffer. i=0 is the most-recently-inserted
     * item. i=1 is the second-most-recently-inserted item. Returns undefined if
     * i+1 items have not yet been inserted.
     */
    item: function(i) {
      return items[(current - i + size) % size];
    }
  };
};

var circularBuffer = {
	create: create
};

/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */




var inject$2 = function(wait, getTime) {
  return {
    /**
     * Creates a ThrottledQueue. The queue stores tasks, which will be executed
     * asynchronously, at a controlled rate.
     *
     * @param {number} limit The maximum number of tasks that can be executed
     *     over one period.
     * @param {number} period The time period (ms) over which limit is
     *     enforceable.
     * @return {ThrottledQueue}
     */
    create: function(limit, period) {
      var me = {};
      var queue = task.withValue();
      var recentTimes = circularBuffer.create(limit);

      /**
       * Adds a task to the work queue.
       *
       * @param {function(): Task<T>} doSomething Starts the task. This function
       *     will be called when the rate limit allows.
       * @return {Task<T>} The delayed task.
       * @template T
       */
      me.add = function(doSomething) {
        // Return a separate task from the queue, so that cancelling a task
        // doesn't propagate back and cancel the whole queue.
        var waitForMyTurn = task
            .start(function(resolve) {
              queue.finally(resolve);
            })
            .thenDo(function() {
              var lastTime = recentTimes.item(limit - 1);
              if (lastTime == undefined) return;
              return wait(Math.max(lastTime + period - getTime(), 0));
            })
            .thenDo(function() {
              recentTimes.insert(getTime());
            });

        queue = queue.thenDo(function() {
          return task.start(function(resolve) {
            waitForMyTurn.finally(resolve);
          });
        });

        return waitForMyTurn.thenDo(doSomething);
      };

      return me;
    }
  };
};

var throttledQueue = {
	inject: inject$2
};

/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */



const EXPERIENCE_ID_HEADER_NAME = "X-GOOG-MAPS-EXPERIENCE-ID";

var inject$3 = function(options) {

  var key = options.key || ({}).GOOGLE_MAPS_API_KEY;
  var channel = options.channel;
  var clientId = options.clientId || ({}).GOOGLE_MAPS_API_CLIENT_ID;
  var clientSecret = options.clientSecret || ({}).GOOGLE_MAPS_API_CLIENT_SECRET;

  var rate = options.rate || {};
  var rateLimit = rate.limit || 50;  // 50 requests per ratePeriod.
  var ratePeriod = rate.period || 1000;  // 1 second.

  var makeUrlRequest$1 = options.makeUrlRequest || makeUrlRequest;
  var mySetTimeout = options.setTimeout || setTimeout;
  var myClearTimeout = options.clearTimeout || clearTimeout;
  var getTime = options.getTime || function() {return new Date().getTime();};
  var wait$1 = wait.inject(mySetTimeout, myClearTimeout);
  var attempt$1 = attempt.inject(wait$1).attempt;
  var ThrottledQueue = throttledQueue.inject(wait$1, getTime);
  var requestQueue = ThrottledQueue.create(rateLimit, ratePeriod);

  /**
   * Makes an API request using the injected makeUrlRequest.
   *
   * Inserts the API key (or client ID and signature) into the query
   * parameters. Retries requests when the status code requires it.
   * Parses the response body as JSON.
   *
   * The callback is given either an error or a response. The response
   * is an object with the following entries:
   * {
   *   status: number,
   *   body: string,
   *   json: Object
   * }
   *
   * @param {string} path
   * @param {Object} query This function mutates the query object.
   * @param {Function} callback
   * @return {{
   *   cancel: function(),
   *   finally: function(function()),
   *   asPromise: function(): Promise
   * }}
   */
  return function(path, query, callback) {

    callback = callback || function() {};

    var retryOptions = query.retryOptions || options.retryOptions || {};
    delete query.retryOptions;

    var timeout = query.timeout || options.timeout || 60 * 1000;
    delete query.timeout;

    var useClientId = query.supportsClientId && clientId && clientSecret;
    delete query.supportsClientId;

    var queryOptions = query.options || {};
    delete query.options;

    var isPost = queryOptions.method === 'POST';
    var requestUrl = formatRequestUrl(path, isPost ? {} : query, useClientId);

    if (isPost) {
      queryOptions.body = query;
    }

    if (options.experienceId) {
      queryOptions["headers"] = queryOptions["headers"] || {};
      queryOptions["headers"][
        EXPERIENCE_ID_HEADER_NAME
      ] = options.experienceId.join(",");
    }

    // Determines whether a response indicates a retriable error.
    var canRetry = queryOptions.canRetry || function(response, query) {
      return (
        response == null
        || response.status === 500
        || response.status === 503
        || response.status === 504
        || (response.json && (
            response.json.status === 'OVER_QUERY_LIMIT' ||
            response.json.status === 'RESOURCE_EXHAUSTED' ||
            (response.json.status ===  'INVALID_REQUEST'  && query.pagetoken))));
    };
    delete queryOptions.canRetry;

    // Determines whether a response indicates success.
    var isSuccessful = queryOptions.isSuccessful || function(response) {
      return response.status === 200 && (
                response.json == undefined ||
                response.json.status === undefined ||
                response.json.status === 'OK' ||
                response.json.status === 'ZERO_RESULTS');
    };
    delete queryOptions.isSuccessful;

    function rateLimitedGet() {
      return requestQueue.add(function() {
        return task.start(function(resolve, reject) {
          return makeUrlRequest$1(requestUrl, resolve, reject, queryOptions);
        });
      });
    }

    var timeoutTask = wait$1(timeout).thenDo(function() {
      throw 'timeout';
    });
    var requestTask = attempt$1({
      'do': rateLimitedGet,
      until: function(response) { return !canRetry(response, query); },
      interval: retryOptions.interval,
      increment: retryOptions.increment,
      jitter: retryOptions.jitter
    });

    var task$1 =
        task.race([timeoutTask, requestTask])
        .thenDo(function(response) {
          // We add the request url and the original query to the response
          // to be able to use them when debugging errors.
          response.requestUrl = requestUrl;
          response.query = query;

          if (isSuccessful(response)) {
            return task.withValue(response);
          } else {
            return task.withError(response);
          }
        })
        .thenDo(
            function(response) { callback(null, response); },
            function(err) { callback(err); });

    if (options.Promise) {
      var originalCallback = callback;
      var promise = new options.Promise(function(resolve, reject) {
        callback = function(err, result) {
          if (err != null) {
            reject(err);
          } else {
            resolve(result);
          }
          originalCallback(err, result);
        };
      });
      task$1.asPromise = function() { return promise; };
    }

    delete task$1.thenDo;
    return task$1;
  };

  /**
   * Adds auth information to the query, and formats it into a URL.
   * @param {string} path
   * @param {Object} query
   * @param {boolean} useClientId
   * @return {string} The formatted URL.
   */
  function formatRequestUrl(path, query, useClientId) {
    if (channel) {
      query.channel = channel;
    }
    if (useClientId) {
      query.client = clientId;
    } else if (key && key.indexOf('AIza') == 0) {
      query.key = key;
    } else {
      throw 'Missing either a valid API key, or a client ID and secret';
    }

    var requestUrl = url.format({pathname: path, query: query});

    // When using client ID, generate and append the signature param.
    if (useClientId) {
      var secret = new Buffer(clientSecret, 'base64');
      var payload = url.parse(requestUrl).path;
      var signature = computeSignature(secret, payload);
      requestUrl += '&signature=' + encodeURIComponent(signature);
    }

    return requestUrl;
  }

  /**
   * @param {string} secret
   * @param {string} payload
   * @return {string}
   */
  function computeSignature(secret, payload) {
    var signature =
        new Buffer(
            crypto$1
            .createHmac('sha1', secret)
            .update(payload)
            .digest('base64'))
        .toString()
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    while (signature.length % 4) {
      signature += '=';
    }
    return signature;
  }

};

var EXPERIENCE_ID_HEADER_NAME_1 = EXPERIENCE_ID_HEADER_NAME;

var makeApiCall = {
	inject: inject$3,
	EXPERIENCE_ID_HEADER_NAME: EXPERIENCE_ID_HEADER_NAME_1
};

var validate = createCommonjsModule(function (module, exports) {
/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var Validate = exports;

function InvalidValueError(message) {
  this.message = message;
  this.name = 'InvalidValueError';
  Error.captureStackTrace(this, InvalidValueError);
}
InvalidValueError.prototype = Object.create(Error.prototype);
InvalidValueError.prototype.constructor = InvalidValueError;

InvalidValueError.prepend = function (message, error) {
  if (error instanceof InvalidValueError) {
    return new InvalidValueError(message + ': ' + error.message);
  }
  return error;
};

Validate.InvalidValueError = InvalidValueError;

Validate.acceptAll = function (value) {
  return value;
};

Validate.optional = function (validator) {
  return function (value) {
    return (value == undefined) ? value : validator(value);
  };
};

Validate.that = function (predicate, message) {
  return function (value) {
    if (predicate(value)) return value;
    throw new InvalidValueError(message);
  };
};

Validate.number = Validate.that(function (value) {
  return typeof value === 'number';
}, 'not a number');

Validate.string = Validate.that(function (value) {
  return typeof value === 'string';
}, 'not a string');

Validate.object = function (propertyValidators) {
  return function (object) {
    var result = {};

    if (!object || typeof object !== 'object') {
      throw new InvalidValueError('not an Object');
    }

    // Validate all properties.
    for (key in propertyValidators) {
      var validator = propertyValidators[key];
      try {
        var valid = validator(object[key]);
      } catch (error) {
        if (key in object) {
          throw InvalidValueError.prepend('in property "' + key + '"', error);
        } else {
          throw new InvalidValueError('missing property "' + key + '"');
        }
      }
      if (valid !== undefined) {
        result[key] = valid;
      }
    }

    // Check for unexpected properties.
    for (var key in object) {
      if (!propertyValidators[key]) {
        throw new InvalidValueError('unexpected property "' + key + '"');
      }
    }

    return result;
  };
};

Validate.array = function (validator) {
  return function (array) {
    var result = [];

    if (Object.prototype.toString.call(array) !== '[object Array]') {
      throw new InvalidValueError('not an Array');
    }

    for (var i = 0; i < array.length; ++i) {
      try {
        result[i] = validator(array[i]);
      } catch (error) {
        throw InvalidValueError.prepend('at index ' + i, error);
      }
    }

    return result;
  };
};

Validate.oneOf = function (names) {
  var myObject = {};
  var quotedNames = [];
  names.forEach(function (name) {
    myObject[name] = true;
    quotedNames.push('"' + name + '"');
  });

  return function (value) {
    if (myObject[value]) return value;
    throw new InvalidValueError('not one of ' + quotedNames.join(', '));
  };
};

Validate.atLeastOneOfProperties = function (names) {
  return function (value) {
    if (!value) return value;

    var quotedNames = [];
    for (var i = 0; i < names.length; i++) {
      if (names[i] in value) {
        return value;
      }
      quotedNames.push('"' + names[i] + '"');
    }

    throw new InvalidValueError(
      'one of ' + quotedNames.join(', ') + ' is required');
  };
};

Validate.mutuallyExclusiveProperties = function (names, oneRequired) {
  return function (value) {
    if (!value) return value;

    var present = [];
    var quotedNames = [];
    names.forEach(function (name) {
      if (name in value) {
        present.push('"' + name + '"');
      }
      quotedNames.push('"' + name + '"');
    });

    if (present.length > 1) {
      throw new InvalidValueError(
        'cannot specify properties '
        + present.slice(0, -1).join(', ')
        + ' and '
        + present.slice(-1)
        + ' together');
    } else if (present.length == 0 && oneRequired) {
      throw new InvalidValueError(
        'one of ' + quotedNames.join(', ') + ' is required');
    }

    return value;
  };
};

Validate.mutuallyExclusivePropertiesRequired = function (names) {
  return Validate.mutuallyExclusiveProperties(names, true);
};

Validate.compose = function (validators) {
  return function (value) {
    validators.forEach(function (validate) {
      value = validate(value);
    });
    return value;
  };
};

Validate.boolean = Validate.compose([
  Validate.that(function (value) {
    return typeof value === 'boolean';
  }, 'not a boolean'),
  function (value) {
    // In each API, boolean fields default to false, and the presence of
    // a querystring value indicates true, so we omit the value if
    // explicitly set to false.
    return value ? value : undefined;
  }
]);

Validate.deprecate = function (names) {
  var myObject = {};

  names.forEach(function (name) {
    myObject[name] = true;
  });

  return function (value) {
    if (myObject[value]) {
      process.emitWarning("Value, " + value + ", is deprecated. See https://developers.google.com/maps/deprecations.");
    }
    return value
  }
};
});

var convert = createCommonjsModule(function (module, exports) {
/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */



var asArray = function(arg) {
  return Array.isArray(arg) ? arg : [arg];
};

exports.pipedKeyValues = function(arg) {
  if (!arg || typeof arg !== 'object') {
    throw new validate.InvalidValueError('not an Object');
  }
  return Object.keys(arg).sort().map(function(key) {
    if (typeof arg[key] === 'object') {
      return arg[key].map(function(type) {
        return key + ':' + type;
      }).join('|');
    }
    return key + ':' + arg[key];
  }).join('|');
};

exports.locations = function(arg) {
  if (Array.isArray(arg) && arg.length == 2 && typeof arg[0] == 'number' && typeof arg[1] == 'number') {
    arg = [arg];
  }
  return asArray(arg).map(exports.latLng).join('|');
};

exports.arrayOf = function(validateItem, sep) {
  var validateArray = validate.array(validateItem);
  return function(value) {
    value = validateArray(asArray(value));
    return value.join(sep || '|');
  };
};

exports.latLng = function(arg) {
  if (!arg) {
    throw new validate.InvalidValueError();
  } else if (arg.lat != undefined && arg.lng != undefined) {
    arg = [arg.lat, arg.lng];
  } else if (arg.latitude != undefined && arg.longitude != undefined) {
    arg = [arg.latitude, arg.longitude];
  }
  return asArray(arg).join(',');
};

var validateBounds = validate.object({
  south: validate.number,
  west: validate.number,
  north: validate.number,
  east: validate.number
});

exports.bounds = function(arg) {
  arg = validateBounds(arg);
  return arg.south + ',' + arg.west + '|' + arg.north + ',' + arg.east;
};

exports.timeStamp = function(arg) {
  if (arg == undefined) {
    arg = new Date();
  }
  if (arg.getTime) {
    arg = arg.getTime();
    // NOTE: Unix time is seconds past epoch.
    return Math.round(arg / 1000);
  }

  // Otherwise assume arg is Unix time
  return arg;
};

exports.retryOptions = validate.object({
  timeout: validate.optional(validate.number),
  interval: validate.optional(validate.number),
  increment: validate.optional(validate.number),
  jitter: validate.optional(validate.number)
});
});

/**
 * Makes a geocode request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.geocode
 * @function
 * @param {Object} query
 * @param {string} [query.address]
 * @param {Object} [query.components]
 * @param {Object} [query.bounds]
 * @param {number} query.bounds.south
 * @param {number} query.bounds.west
 * @param {number} query.bounds.north
 * @param {number} query.bounds.east
 * @param {string} [query.region]
 * @param {string} [query.language]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var geocode_1 = {
  url: 'https://maps.googleapis.com/maps/api/geocode/json',
  validator: validate.object({
    address: validate.optional(validate.string),
    components: validate.optional(convert.pipedKeyValues),
    bounds: validate.optional(convert.bounds),
    region: validate.optional(validate.string),
    language: validate.optional(validate.string),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};

/**
 * Makes a reverse geocode request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.reverseGeocode
 * @function
 * @param {Object} query
 * @param {LatLng} [query.latlng]
 * @param {string} [query.place_id]
 * @param {string} [query.result_type]
 * @param {string} [query.location_type]
 * @param {string} [query.language]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var reverseGeocode = {
  url: 'https://maps.googleapis.com/maps/api/geocode/json',
  validator: validate.compose([
    validate.mutuallyExclusiveProperties(['place_id', 'latlng']),
    validate.mutuallyExclusiveProperties(['place_id', 'result_type']),
    validate.mutuallyExclusiveProperties(['place_id', 'location_type']),
    validate.object({
      latlng: validate.optional(convert.latLng),
      place_id: validate.optional(validate.string),
      result_type: validate.optional(convert.arrayOf(validate.string)),
      location_type: validate.optional(convert.arrayOf(validate.oneOf([
        'ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER', 'APPROXIMATE'
      ]))),
      language: validate.optional(validate.string),
      retryOptions: validate.optional(convert.retryOptions),
      timeout: validate.optional(validate.number)
    })
  ])
};

var geocode = {
	geocode: geocode_1,
	reverseGeocode: reverseGeocode
};

/**
 * Makes a geolocation request.
 *
 * For a detailed guide, see https://developers.google.com/maps/documentation/geolocation/intro
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.geolocate
 * @function
 * @param {Object} query
 * @param {number} [query.homeMobileCountryCode]
 * @param {number} [query.homeMobileNetworkCode]
 * @param {string} [query.radioType]
 * @param {string} [query.carrier]
 * @param {boolean} [query.considerIp]
 * @param {Object[]} [query.cellTowers]
 * @param {Object[]} [query.wifiAccessPoints]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var geolocate = {
  url: 'https://www.googleapis.com/geolocation/v1/geolocate',
  options: {
    method: 'POST',
    headers: {'content-type': 'application/json;'},
    canRetry: function(response) {
      return response.status === 403;
    },
    isSuccessful: function(response) {
      return response.status === 200 || response.status === 404;
    }
  },
  validator: validate.object({
    homeMobileCountryCode: validate.optional(validate.number),
    homeMobileNetworkCode: validate.optional(validate.number),
    radioType: validate.optional(validate.string),
    carrier: validate.optional(validate.string),
    considerIp: validate.optional(validate.boolean),
    cellTowers: validate.optional(validate.array(validate.object({
      cellId: validate.number,
      locationAreaCode: validate.number,
      mobileCountryCode: validate.number,
      mobileNetworkCode: validate.number,
      age: validate.optional(validate.number),
      signalStrength: validate.optional(validate.number),
      timingAdvance: validate.optional(validate.number)
    }))),
    wifiAccessPoints: validate.optional(validate.array(validate.object({
      macAddress: validate.string,
      signalStrength: validate.optional(validate.number),
      age: validate.optional(validate.number),
      channel: validate.optional(validate.number),
      signalToNoiseRatio: validate.optional(validate.number)
    }))),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};

var geolocation = {
	geolocate: geolocate
};

/**
 * Makes a timezone request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.timezone
 * @function
 * @param {Object} query
 * @param {LatLng} query.location
 * @param {Date|number} [query.timestamp]
 * @param {string} [query.language]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var timezone_1 = {
  url: 'https://maps.googleapis.com/maps/api/timezone/json',
  validator: validate.object({
    location: convert.latLng,
    timestamp: convert.timeStamp,
    language: validate.optional(validate.string),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};

var timezone = {
	timezone: timezone_1
};

/**
 * Makes a directions request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.directions
 * @function
 * @param {Object} query
 * @param {LatLng} query.origin
 * @param {LatLng} query.destination
 * @param {string} [query.mode]
 * @param {LatLng[]} [query.waypoints]
 * @param {boolean} [query.alternatives]
 * @param {string[]} [query.avoid]
 * @param {string} [query.language]
 * @param {string} [query.units]
 * @param {string} [query.region]
 * @param {Date|number} [query.departure_time]
 * @param {Date|number} [query.arrival_time]
 * @param {string} [query.traffic_model]
 * @param {string[]} [query.transit_mode]
 * @param {string} [query.transit_routing_preference]
 * @param {boolean} [query.optimize]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var directions_1 = {
  url: 'https://maps.googleapis.com/maps/api/directions/json',
  validator: validate.compose([
    validate.mutuallyExclusiveProperties(['arrival_time', 'departure_time']),
    validate.object({
      origin: convert.latLng,
      destination: convert.latLng,
      mode: validate.optional(validate.oneOf([
        'driving', 'walking', 'bicycling', 'transit'
      ])),
      waypoints: validate.optional(convert.arrayOf(convert.latLng)),
      alternatives: validate.optional(validate.boolean),
      avoid: validate.optional(convert.arrayOf(validate.oneOf([
        'tolls', 'highways', 'ferries', 'indoor'
      ]))),
      language: validate.optional(validate.string),
      units: validate.optional(validate.oneOf(['metric', 'imperial'])),
      region: validate.optional(validate.string),
      departure_time: validate.optional(convert.timeStamp),
      arrival_time: validate.optional(convert.timeStamp),
      traffic_model: validate.optional(validate.oneOf([
        'best_guess', 'pessimistic', 'optimistic'
      ])),
      transit_mode: validate.optional(convert.arrayOf(validate.oneOf([
        'bus', 'subway', 'train', 'tram', 'rail'
      ]))),
      transit_routing_preference: validate.optional(validate.oneOf([
        'less_walking', 'fewer_transfers'
      ])),
      optimize: validate.optional(validate.boolean),
      retryOptions: validate.optional(convert.retryOptions),
      timeout: validate.optional(validate.number)
    }),
    function(query) {
      if (query.waypoints && query.optimize) {
        query.waypoints = 'optimize:true|' + query.waypoints;
      }
      delete query.optimize;

      if (query.waypoints && query.mode === 'transit') {
        throw new validate.InvalidValueError('cannot specify waypoints with transit');
      }

      if (query.traffic_model && !query.departure_time) {
        throw new validate.InvalidValueError('traffic_model requires departure_time');
      }
      return query;
    }
  ])
};

var directions = {
	directions: directions_1
};

/**
 * Makes a distance matrix request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.distanceMatrix
 * @function
 * @param {Object} query
 * @param {LatLng[]} query.origins
 * @param {LatLng[]} query.destinations
 * @param {string} [query.mode]
 * @param {string} [query.language]
 * @param {string[]} [query.avoid]
 * @param {string} [query.units]
 * @param {Date|number} [query.departure_time]
 * @param {Date|number} [query.arrival_time]
 * @param {string[]} [query.transit_mode]
 * @param {string} [query.transit_routing_preference]
 * @param {string} [query.traffic_model]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var distanceMatrix_1 = {
  url: 'https://maps.googleapis.com/maps/api/distancematrix/json',
  validator: validate.compose([
    validate.mutuallyExclusiveProperties(['arrival_time', 'departure_time']),
    validate.object({
      origins: convert.arrayOf(convert.latLng),
      destinations: convert.arrayOf(convert.latLng),
      mode: validate.optional(validate.oneOf([
        'driving', 'walking', 'bicycling', 'transit'
      ])),
      language: validate.optional(validate.string),
      region: validate.optional(validate.string),
      avoid: validate.optional(convert.arrayOf(validate.oneOf([
        'tolls', 'highways', 'ferries', 'indoor'
      ]))),
      units: validate.optional(validate.oneOf(['metric', 'imperial'])),
      departure_time: validate.optional(convert.timeStamp),
      arrival_time: validate.optional(convert.timeStamp),
      transit_mode: validate.optional(convert.arrayOf(validate.oneOf([
        'bus', 'subway', 'train', 'tram', 'rail'
      ]))),
      transit_routing_preference: validate.optional(validate.oneOf([
        'less_walking', 'fewer_transfers'
      ])),
      traffic_model: validate.optional(validate.oneOf([
        'best_guess', 'pessimistic', 'optimistic'
      ])),
      retryOptions: validate.optional(convert.retryOptions),
      timeout: validate.optional(validate.number)
    })
  ])
};

var distanceMatrix = {
	distanceMatrix: distanceMatrix_1
};

/**
 * Makes an elevation request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.elevation
 * @function
 * @param {Object} query
 * @param {LatLng[]} query.locations
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var elevation_1 = {
  url: 'https://maps.googleapis.com/maps/api/elevation/json',
  validator: validate.object({
    locations: convert.arrayOf(convert.latLng),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};

/**
 * Makes an elevation-along-path request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.elevationAlongPath
 * @function
 * @param {Object} query
 * @param {LatLng[]|string} query.path
 * @param {number} query.samples
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var elevationAlongPath = {
  url: 'https://maps.googleapis.com/maps/api/elevation/json',
  validator: validate.object({
    path: function(path) {
      if (typeof path == 'string') {
        return 'enc:' + path;
      } else {
        return convert.arrayOf(convert.latLng)(path);
      }
    },
    samples: validate.number,
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};

var elevation = {
	elevation: elevation_1,
	elevationAlongPath: elevationAlongPath
};

/**
 * Makes a snap-to-roads request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.snapToRoads
 * @function
 * @param {Object} query
 * @param {LatLng[]} query.path
 * @param {boolean} [query.interpolate]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var snapToRoads = {
  url: 'https://roads.googleapis.com/v1/snapToRoads',
  supportsClientId: false,
  validator: validate.object({
    path: convert.arrayOf(convert.latLng),
    interpolate: validate.optional(validate.boolean),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};

/**
 * Makes a nearest roads request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.nearestRoads
 * @function
 * @param {Object} query
 * @param {LatLng[]} query.points
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var nearestRoads = {
  url: 'https://roads.googleapis.com/v1/nearestRoads',
  supportsClientId: false,
  validator: validate.object({
    points: convert.arrayOf(convert.latLng),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};

/**
 * Makes a speed-limits request for a place ID. For speed-limits
 * requests using a path parameter, use the snappedSpeedLimits method.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.speedLimits
 * @function
 * @param {Object} query
 * @param {string[]} query.placeId
 * @param {string} [query.units] Either 'KPH' or 'MPH'
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var speedLimits = {
  url: 'https://roads.googleapis.com/v1/speedLimits',
  supportsClientId: false,
  validator: validate.object({
    placeId: validate.array(validate.string),
    units: validate.optional(validate.oneOf(['KPH', 'MPH'])),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};

/**
 * Makes a speed-limits request for a path.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.snappedSpeedLimits
 * @function
 * @param {Object} query
 * @param {LatLng[]} query.path
 * @param {string} [query.units] Either 'KPH' or 'MPH'
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var snappedSpeedLimits = {
  url: 'https://roads.googleapis.com/v1/speedLimits',
  supportsClientId: false,
  validator: validate.object({
    path: convert.arrayOf(convert.latLng),
    units: validate.optional(validate.oneOf(['KPH', 'MPH'])),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};

var roads = {
	snapToRoads: snapToRoads,
	nearestRoads: nearestRoads,
	speedLimits: speedLimits,
	snappedSpeedLimits: snappedSpeedLimits
};

/**
 * A Find Place request takes a text input, and returns a place.
 * The text input can be any kind of Places data, for example,
 * a name, address, or phone number.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.findPlace
 * @function
 * @param {Object} query
 * @param {string} query.input
 * @param {string} query.inputtype
 * @param {string} [query.language]
 * @param {Array<string>} [query.fields]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var findPlace = {
  url: 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json',
  validator: validate.compose([
    validate.object({
      input: validate.string,
      inputtype: validate.oneOf(['textquery', 'phonenumber']),
      language: validate.optional(validate.string),
      fields: validate.optional(convert.arrayOf(validate.compose([validate.oneOf([
        'formatted_address', 'geometry', 'geometry/location', 'geometry/location/lat',
        'geometry/location/lng', 'geometry/viewport', 'geometry/viewport/northeast',
        'geometry/viewport/northeast/lat', 'geometry/viewport/northeast/lng',
        'geometry/viewport/southwest', 'geometry/viewport/southwest/lat',
        'geometry/viewport/southwest/lng', 'icon', 'id', 'name',
        'permanently_closed', 'photos', 'place_id', 'scope', 'types',
        'vicinity', 'opening_hours', 'price_level', 'rating', 'plus_code'
      ]), validate.deprecate(["alt_id", "id", "reference", "scope"])]), ',')),
      locationbias: validate.optional(validate.string),
      retryOptions: validate.optional(convert.retryOptions),
      timeout: validate.optional(validate.number)
    }),
    function (query) {
      if (!query.locationbias || query.locationbias == 'ipbias') {
        return query;
      }
      var isLatLng = function (latLng) {
        latLng = latLng.split(',');
        return latLng.length == 2 && !isNaN(latLng[0]) && !isNaN(latLng[1]);
      };
      var parts = query.locationbias.split(':');
      switch (parts[0]) {
        case 'point':
          if (isLatLng(parts[parts.length - 1])) {
            return query;
          }
          break;
        case 'circle':
          parts = parts[parts.length - 1].split('@');
          if (!isNaN(parts[0]) && isLatLng(parts[parts.length - 1])) {
            return query;
          }
          break;
        case 'rectangle':
          parts = parts[parts.length - 1].split('|');
          if (parts.length == 2 && isLatLng(parts[0]) && isLatLng(parts[1])) {
            return query;
          }
          break;
      }
      throw new validate.InvalidValueError('invalid locationbias');
    }
  ])
};

/**
 * Makes a places request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.places
 * @function
 * @param {Object} query
 * @param {string} query.query
 * @param {string} [query.language]
 * @param {LatLng} [query.location]
 * @param {number} [query.radius]
 * @param {number} [query.minprice]
 * @param {number} [query.maxprice]
 * @param {boolean} [query.opennow]
 * @param {string} [query.type]
 * @param {string} [query.pagetoken]
 * @param {string} [query.region]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var places_1 = {
  url: 'https://maps.googleapis.com/maps/api/place/textsearch/json',
  validator: validate.object({
    query: validate.optional(validate.string),
    language: validate.optional(validate.string),
    location: validate.optional(convert.latLng),
    radius: validate.optional(validate.number),
    minprice: validate.optional(validate.number),
    maxprice: validate.optional(validate.number),
    opennow: validate.optional(validate.boolean),
    type: validate.optional(validate.string),
    pagetoken: validate.optional(validate.string),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number),
    region: validate.optional(validate.string)
  })
};

/**
 * Makes a nearby places request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.placesNearby
 * @function
 * @param {Object} query
 * @param {LatLng} query.location
 * @param {string} [query.language]
 * @param {number} [query.radius] Required unless using `rankby=distance`
 * @param {string} [query.keyword]
 * @param {number} [query.minprice]
 * @param {number} [query.maxprice]
 * @param {string} [query.name]
 * @param {boolean} [query.opennow]
 * @param {string} [query.rankby] Either 'prominence' or 'distance'
 * @param {string} [query.type]
 * @param {string} [query.pagetoken]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var placesNearby = {
  url: 'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
  validator: validate.compose([
    validate.mutuallyExclusivePropertiesRequired(['location', 'pagetoken']),
    validate.object({
      location: validate.optional(convert.latLng),
      language: validate.optional(validate.string),
      radius: validate.optional(validate.number),
      keyword: validate.optional(validate.string),
      minprice: validate.optional(validate.number),
      maxprice: validate.optional(validate.number),
      name: validate.optional(validate.string),
      opennow: validate.optional(validate.boolean),
      rankby: validate.optional(validate.oneOf(['prominence', 'distance'])),
      type: validate.optional(validate.string),
      pagetoken: validate.optional(validate.string),
      retryOptions: validate.optional(convert.retryOptions),
      timeout: validate.optional(validate.number)
    })
  ])
};

/**
 * Makes a place detail request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.place
 * @function
 * @param {Object} query
 * @param {string} query.placeid
 * @param {string} query.sessiontoken Unique string identifying a single user's session. For convenience use require('@google/maps').util.placesAutoCompleteSessionToken()
 * @param {string} [query.language]
 * @param {Array<string>} [query.fields]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var place = {
  url: 'https://maps.googleapis.com/maps/api/place/details/json',
  validator: validate.object({
    placeid: validate.string,
    sessiontoken: validate.optional(validate.string),
    language: validate.optional(validate.string),
    fields: validate.optional(convert.arrayOf(validate.compose([validate.oneOf([
      'address_component', 'adr_address', 'alt_id', 'formatted_address',
      'geometry', 'geometry/location', 'geometry/location/lat',
      'geometry/location/lng', 'geometry/viewport', 'geometry/viewport/northeast',
      'geometry/viewport/northeast/lat', 'geometry/viewport/northeast/lng',
      'geometry/viewport/southwest', 'geometry/viewport/southwest/lat',
      'geometry/viewport/southwest/lng', 'icon', 'id', 'name', 'permanently_closed', 'photo',
      'place_id', 'scope', 'type', 'url', 'utc_offset', 'vicinity',
      'formatted_phone_number', 'international_phone_number', 'opening_hours',
      'website', 'price_level', 'rating', 'reviews', 'user_ratings_total', 'plus_code'
    ]), validate.deprecate(["alt_id", "id", "reference", "scope"])]), ',')),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};

/**
 * Makes a place photos request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.placesPhoto
 * @function
 * @param {Object} query
 * @param {string} query.photoreference
 * @param {number} [query.maxwidth]
 * @param {number} [query.maxheight]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var placesPhoto = {
  url: 'https://maps.googleapis.com/maps/api/place/photo',
  validator: validate.compose([
    validate.atLeastOneOfProperties(['maxwidth', 'maxheight']),
    validate.object({
      photoreference: validate.string,
      maxwidth: validate.optional(validate.number),
      maxheight: validate.optional(validate.number),
      retryOptions: validate.optional(convert.retryOptions),
      timeout: validate.optional(validate.number)
    })
  ])
};

/**
 * Makes a places autocomplete request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.placesAutoComplete
 * @function
 * @param {Object} query
 * @param {string} query.input
 * @param {string} query.sessiontoken Unique string identifying a single user's session. For convenience use require('@google/maps').util.placesAutoCompleteSessionToken()
 * @param {number} [query.offset]
 * @param {LatLng} [query.location]
 * @param {string} [query.language]
 * @param {number} [query.radius]
 * @param {string} [query.origin]
 * @param {string} [query.types]
 * @param {Object} components
 * @param {boolean} [query.strictbounds]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var placesAutoComplete = {
  url: 'https://maps.googleapis.com/maps/api/place/autocomplete/json',
  validator: validate.object({
    input: validate.string,
    sessiontoken: validate.optional(validate.string),
    offset: validate.optional(validate.number),
    location: validate.optional(convert.latLng),
    language: validate.optional(validate.string),
    radius: validate.optional(validate.number),
    origin: validate.optional(validate.string),
    types: validate.optional(validate.oneOf(['geocode', 'address', 'establishment', '(regions)', '(cities)'])),
    components: validate.optional(convert.pipedKeyValues),
    strictbounds: validate.optional(validate.boolean),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};


/**
 * Makes a places query autocomplete request.
 *
 * @memberof! GoogleMapsClient
 * @name GoogleMapsClient.placesQueryAutoComplete
 * @function
 * @param {Object} query
 * @param {string} query.input
 * @param {number} [query.offset]
 * @param {LatLng} [query.location]
 * @param {string} [query.language]
 * @param {number} [query.radius]
 * @param {ResponseCallback} callback Callback function for handling the result
 * @return {RequestHandle}
 */
var placesQueryAutoComplete = {
  url: 'https://maps.googleapis.com/maps/api/place/queryautocomplete/json',
  validator: validate.object({
    input: validate.string,
    offset: validate.optional(validate.number),
    location: validate.optional(convert.latLng),
    language: validate.optional(validate.string),
    radius: validate.optional(validate.number),
    retryOptions: validate.optional(convert.retryOptions),
    timeout: validate.optional(validate.number)
  })
};

var places = {
	findPlace: findPlace,
	places: places_1,
	placesNearby: placesNearby,
	place: place,
	placesPhoto: placesPhoto,
	placesAutoComplete: placesAutoComplete,
	placesQueryAutoComplete: placesQueryAutoComplete
};

/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var parseArgs = function(argv) {
  var parsed = {};
  var argv = argv || process.argv.slice(2);
  for (var i = 0; i < argv.length; i += 2) {
    var value = argv[i + 1];
    try {
      value = JSON.parse(value);
    } catch (e) {
    }
    var field = argv[i].replace(/^-*/g, '');
    var existing = parsed[field];
    if (Array.isArray(existing)) {
      value = existing.concat(value);
    } else if (existing != undefined) {
      value = [existing, value];
    }
    parsed[field] = value;
  }
  return parsed;
};

var callback = function(error, response) {
  if (error) {
    console.log("Error:", error.message != undefined ? error.message : error);
  } else {
    console.log(JSON.stringify(response.json, null, 4));
  }
};

var cli = {
	parseArgs: parseArgs,
	callback: callback
};

var rngBrowser = createCommonjsModule(function (module) {
// Unique ID creation requires a high quality random # generator.  In the
// browser this is a little complicated due to unknown quality of Math.random()
// and inconsistent support for the `crypto` API.  We do the best we can via
// feature-detection

// getRandomValues needs to be invoked in a context where "this" is a Crypto
// implementation. Also, find the complete implementation of crypto on IE11.
var getRandomValues = (typeof(crypto) != 'undefined' && crypto.getRandomValues && crypto.getRandomValues.bind(crypto)) ||
                      (typeof(msCrypto) != 'undefined' && typeof window.msCrypto.getRandomValues == 'function' && msCrypto.getRandomValues.bind(msCrypto));

if (getRandomValues) {
  // WHATWG crypto RNG - http://wiki.whatwg.org/wiki/Crypto
  var rnds8 = new Uint8Array(16); // eslint-disable-line no-undef

  module.exports = function whatwgRNG() {
    getRandomValues(rnds8);
    return rnds8;
  };
} else {
  // Math.random()-based (RNG)
  //
  // If all else fails, use Math.random().  It's fast, but is of unspecified
  // quality.
  var rnds = new Array(16);

  module.exports = function mathRNG() {
    for (var i = 0, r; i < 16; i++) {
      if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
      rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return rnds;
  };
}
});

/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
var byteToHex = [];
for (var i = 0; i < 256; ++i) {
  byteToHex[i] = (i + 0x100).toString(16).substr(1);
}

function bytesToUuid(buf, offset) {
  var i = offset || 0;
  var bth = byteToHex;
  // join used to fix memory issue caused by concatenation: https://bugs.chromium.org/p/v8/issues/detail?id=3175#c4
  return ([
    bth[buf[i++]], bth[buf[i++]],
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]], '-',
    bth[buf[i++]], bth[buf[i++]],
    bth[buf[i++]], bth[buf[i++]],
    bth[buf[i++]], bth[buf[i++]]
  ]).join('');
}

var bytesToUuid_1 = bytesToUuid;

// **`v1()` - Generate time-based UUID**
//
// Inspired by https://github.com/LiosK/UUID.js
// and http://docs.python.org/library/uuid.html

var _nodeId;
var _clockseq;

// Previous uuid creation time
var _lastMSecs = 0;
var _lastNSecs = 0;

// See https://github.com/uuidjs/uuid for API details
function v1(options, buf, offset) {
  var i = buf && offset || 0;
  var b = buf || [];

  options = options || {};
  var node = options.node || _nodeId;
  var clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq;

  // node and clockseq need to be initialized to random values if they're not
  // specified.  We do this lazily to minimize issues related to insufficient
  // system entropy.  See #189
  if (node == null || clockseq == null) {
    var seedBytes = rngBrowser();
    if (node == null) {
      // Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
      node = _nodeId = [
        seedBytes[0] | 0x01,
        seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]
      ];
    }
    if (clockseq == null) {
      // Per 4.2.2, randomize (14 bit) clockseq
      clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 0x3fff;
    }
  }

  // UUID timestamps are 100 nano-second units since the Gregorian epoch,
  // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
  // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
  // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
  var msecs = options.msecs !== undefined ? options.msecs : new Date().getTime();

  // Per 4.2.1.2, use count of uuid's generated during the current clock
  // cycle to simulate higher resolution clock
  var nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1;

  // Time since last uuid creation (in msecs)
  var dt = (msecs - _lastMSecs) + (nsecs - _lastNSecs)/10000;

  // Per 4.2.1.2, Bump clockseq on clock regression
  if (dt < 0 && options.clockseq === undefined) {
    clockseq = clockseq + 1 & 0x3fff;
  }

  // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
  // time interval
  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  }

  // Per 4.2.1.2 Throw error if too many uuids are requested
  if (nsecs >= 10000) {
    throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
  }

  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq;

  // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
  msecs += 12219292800000;

  // `time_low`
  var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
  b[i++] = tl >>> 24 & 0xff;
  b[i++] = tl >>> 16 & 0xff;
  b[i++] = tl >>> 8 & 0xff;
  b[i++] = tl & 0xff;

  // `time_mid`
  var tmh = (msecs / 0x100000000 * 10000) & 0xfffffff;
  b[i++] = tmh >>> 8 & 0xff;
  b[i++] = tmh & 0xff;

  // `time_high_and_version`
  b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
  b[i++] = tmh >>> 16 & 0xff;

  // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
  b[i++] = clockseq >>> 8 | 0x80;

  // `clock_seq_low`
  b[i++] = clockseq & 0xff;

  // `node`
  for (var n = 0; n < 6; ++n) {
    b[i + n] = node[n];
  }

  return buf ? buf : bytesToUuid_1(b);
}

var v1_1 = v1;

function v4(options, buf, offset) {
  var i = buf && offset || 0;

  if (typeof(options) == 'string') {
    buf = options === 'binary' ? new Array(16) : null;
    options = null;
  }
  options = options || {};

  var rnds = options.random || (options.rng || rngBrowser)();

  // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
  rnds[6] = (rnds[6] & 0x0f) | 0x40;
  rnds[8] = (rnds[8] & 0x3f) | 0x80;

  // Copy bytes to buffer, if provided
  if (buf) {
    for (var ii = 0; ii < 16; ++ii) {
      buf[i + ii] = rnds[ii];
    }
  }

  return buf || bytesToUuid_1(rnds);
}

var v4_1 = v4;

var uuid = v4_1;
uuid.v1 = v1_1;
uuid.v4 = v4_1;

var uuid_1 = uuid;

const { v4: uuidv4 } = uuid_1;

/**
 * Polyline encodes an array of LatLng objects.
 *
 * See {@link https://developers.google.com/maps/documentation/utilities/polylinealgorithm}
 *
 * @memberof! module:@google/maps
 * @name module:@google/maps.util.encodePath
 * @function
 * @param {LatLng[]} path
 * @return {string}
 */
var encodePath = function(path) {

  var result = [];
  var start = [0, 0];
  var end;

  var encodePart = function(part) {
    part = part < 0 ? ~(part << 1) : (part << 1);
    while (part >= 0x20) {
      result.push(String.fromCharCode((0x20 | (part & 0x1f)) + 63));
      part >>= 5;
    }
    result.push(String.fromCharCode(part + 63));
  };

  for (var i = 0, I = path.length || 0; i < I; ++i) {
    end = [Math.round(path[i].lat * 1e5), Math.round(path[i].lng * 1e5)];
    encodePart(end[0] - start[0]);  // lat
    encodePart(end[1] - start[1]);  // lng
    start = end;
  }

  return result.join('');
};

/**
 * Decodes a polyline encoded string.
 *
 * See {@link https://developers.google.com/maps/documentation/utilities/polylinealgorithm}
 *
 * @memberof! module:@google/maps
 * @name module:@google/maps.util.decodePath
 * @function
 * @param {string} path
 * @return {LatLng[]}
 */
var decodePath = function(encodedPath) {

  var len = encodedPath.length || 0;
  var path = new Array(Math.floor(encodedPath.length / 2));
  var index = 0;
  var lat = 0;
  var lng = 0;

  for (var pointIndex = 0; index < len; ++pointIndex) {
    var result = 1;
    var shift = 0;
    var b;
    do {
      b = encodedPath.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += ((result & 1) ? ~(result >> 1) : (result >> 1));

    result = 1;
    shift = 0;
    do {
      b = encodedPath.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += ((result & 1) ? ~(result >> 1) : (result >> 1));

    path[pointIndex] = {lat: lat * 1e-5, lng: lng * 1e-5};
  }
  path.length = pointIndex;

  return path;
};

var placesAutoCompleteSessionToken = uuidv4;

var util = {
	encodePath: encodePath,
	decodePath: decodePath,
	placesAutoCompleteSessionToken: placesAutoCompleteSessionToken
};

/**
 * @license
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Google Maps Service module.
 * @module @google/maps
 */

/**
 * Creates a Google Maps client. The client object contains all the API methods.
 *
 * @param {Object} options
 * @param {string} options.key API key (required, unless clientID and
 *     clientSecret provided).
 * @param {string=} options.clientId Maps API for Work client ID.
 * @param {string=} options.clientSecret Maps API for Work client secret (a.k.a.
 *     private key).
 * @param {string=} options.channel Maps API for Work channel.
 * @param {number=} options.timeout Timeout in milliseconds.
 *     (Default: 60 * 1000 ms)
 * @param {string=} options.language Default language for all queries.
        See https://developers.google.com/maps/faq#languagesupport
 * @param {number=} options.rate.limit Controls rate-limiting of requests.
 *     Maximum number of requests per period. (Default: 50)
 * @param {number=} options.rate.period Period for rate limit, in milliseconds.
 *     (Default: 1000 ms)
 * @param {number=} options.retryOptions.interval If a transient server error
 *     occurs, how long to wait before retrying the request, in milliseconds.
 *     (Default: 500 ms)
 * @param {Function=} options.Promise - Promise constructor (optional).
 * @return {GoogleMapsClient} The client object containing all API methods.
 */
var createClient = function(options) {
  options = options || {};

  if (options.experienceId && typeof options.experienceId === "string") {
    options.experienceId = [options.experienceId];
  }

  var makeApiCall$1 = makeApiCall.inject(options);
  var deprecate = util$2.deprecate;

  var makeApiMethod = function(apiConfig) {
    return function(query, callback, customParams) {
      query = apiConfig.validator(query);
      query.supportsClientId = apiConfig.supportsClientId !== false;
      query.options = apiConfig.options;
      if (options.language && !query.language) {
        query.language = options.language;
      }
      // Merge query and customParams.
      var finalQuery = {};
      customParams = customParams || {};
      [query, customParams].map(function(obj) {
        Object.keys(obj)
          .sort()
          .map(function(key) {
            finalQuery[key] = obj[key];
          });
      });
      return makeApiCall$1(apiConfig.url, finalQuery, callback);
    };
  };

  var geocode$1 = geocode;
  var geolocation$1 = geolocation;
  var timezone$1 = timezone;
  var directions$1 = directions;
  var distanceMatrix$1 = distanceMatrix;
  var elevation$1 = elevation;
  var roads$1 = roads;
  var places$1 = places;

  return {
    directions: makeApiMethod(directions$1.directions),
    distanceMatrix: makeApiMethod(distanceMatrix$1.distanceMatrix),
    elevation: makeApiMethod(elevation$1.elevation),
    elevationAlongPath: makeApiMethod(elevation$1.elevationAlongPath),
    geocode: makeApiMethod(geocode$1.geocode),
    geolocate: makeApiMethod(geolocation$1.geolocate),
    reverseGeocode: makeApiMethod(geocode$1.reverseGeocode),
    findPlace: makeApiMethod(places$1.findPlace),
    places: makeApiMethod(places$1.places),
    placesNearby: makeApiMethod(places$1.placesNearby),
    place: makeApiMethod(places$1.place),
    placesPhoto: makeApiMethod(places$1.placesPhoto),
    placesAutoComplete: makeApiMethod(places$1.placesAutoComplete),
    placesQueryAutoComplete: makeApiMethod(places$1.placesQueryAutoComplete),
    snapToRoads: makeApiMethod(roads$1.snapToRoads),
    nearestRoads: makeApiMethod(roads$1.nearestRoads),
    speedLimits: makeApiMethod(roads$1.speedLimits),
    snappedSpeedLimits: makeApiMethod(roads$1.snappedSpeedLimits),
    timezone: makeApiMethod(timezone$1.timezone),
    setExperienceId: (...ids) => {
      if (typeof ids === "string") {
        ids = [ids];
      }
      options.experienceId = ids;
    },
    getExperienceId: _ => options.experienceId,
    clearExperienceId: _ => {
      options.experienceId = null;
    }
  };
};

var cli$1 = cli;
var util$1 = util;

var lib = {
	createClient: createClient,
	cli: cli$1,
	util: util$1
};

export default lib;
//# sourceMappingURL=maps.js.map
