/* From https://raw.github.com/mbostock/queue/master/queue.js */
(function() {
  if (typeof module === "undefined") self.queue = queue;
  else module.exports = queue;

  queue.version = "1.0.0";

  function queue(parallelism, popdelay) {
    var queue = {},
        active = 0, // number of in-flight deferrals
        remaining = 0, // number of deferrals remaining
        head, tail, // singly-linked list of deferrals
        error = null,
        results = [],
        await = noop,
        awaitAll,
        timeout,
        popIncrease = 1.2,
        popDecrease = 1.1;

    if (arguments.length < 1) parallelism = Infinity;
    if (arguments.length < 2) popdelay = 0;

    queue.defer = function() {
      if (!error) {
        var node = arguments;
        node.index = results.push(undefined) - 1;
        if (tail) tail.next = node, tail = tail.next;
        else head = tail = node;
        ++remaining;
        timer();
      }
      return queue;
    };

    queue.await = function(f) {
      await = f;
      awaitAll = false;
      if (!remaining) notify();
      return queue;
    };

    queue.awaitAll = function(f) {
      await = f;
      awaitAll = true;
      if (!remaining) notify();
      return queue;
    };

    function pop() {
      if (head && active < parallelism) {
        var node = head,
            f = node[0],
            a = Array.prototype.slice.call(node, 1),
            i = node.index;
        if (head === tail) head = tail = null;
        else head = head.next;
        ++active;
        a.push(function(e, r) {
          --active;
          if (error != null) return;
          if (e != null) {
            // clearing remaining cancels subsequent callbacks
            // clearing head stops queued tasks from being executed
            // setting error ignores subsequent calls to defer
            error = e;
            remaining = results = head = tail = null;
            console.log('ERROR!' + error);
            notify();
          } else {
            results[i] = r;
          }
        });
        f.apply(null, a);
      }
    }

    function setVaryingInterval(callback) {
      return setTimeout(function() {
        setVaryingInterval(callback);
        callback();
      }, popdelay);
    }

    function timer() {
      if (timeout) {return;}
      timeout = setVaryingInterval(function() {
        if (remaining--) {
          pop();
        }
        if (remaining <= 0) {
          clearTimeout(timeout);
          timeout = null;
          notify();
        }
      });
    }

    function notify() {
      if (error != null) await(error);
      else if (awaitAll) await(null, results);
      else await.apply(null, [null].concat(results));
    }

    queue.popdelay = function(_) {
      if (!arguments.length) return popdelay;
      popdelay = _;
      return queue;
    }

    queue.popincrease = function() {
      popdelay *= popIncrease;
      return popIncrease;
    }

    queue.popdecrease = function() {
      popDecrease = Math.pow(popDecrease, .99);
      popdelay /= popDecrease;
      return popDecrease;
    }

    return queue;
  }

  function noop() {}
})();
