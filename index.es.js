'use strict';
var $scope, conflict, conflictResolution = [];
if (typeof global === 'object' && global) {
  $scope = global;
} else if (typeof window !== 'undefined') {
  $scope = window;
} else {
  $scope = {};
}
conflict = $scope.DeepDiff;
if (conflict) {
  conflictResolution.push(
    function() {
      if ('undefined' !== typeof conflict && $scope.DeepDiff === accumulateDiff) {
        $scope.DeepDiff = conflict;
        conflict = undefined;
      }
    });
}
// Production steps of ECMA-262, Edition 6, 22.1.2.1
if (!Array.from) {
  Array.from = (function() {
    var toStr = Object.prototype.toString;
    var isCallable = function(fn) {
      return typeof fn === 'function' || toStr.call(fn) === '[object Function]';
    };
    var toInteger = function(value) {
      var number = Number(value);
      if (isNaN(number)) { return 0; }
      if (number === 0 || !isFinite(number)) { return number; }
      return (number > 0 ? 1 : -1) * Math.floor(Math.abs(number));
    };
    var maxSafeInteger = Math.pow(2, 53) - 1;
    var toLength = function(value) {
      var len = toInteger(value);
      return Math.min(Math.max(len, 0), maxSafeInteger);
    };

    // The length property of the from method is 1.
    return function from(arrayLike/*, mapFn, thisArg */) {
      // 1. Let C be the this value.
      var C = this;

      // 2. Let items be ToObject(arrayLike).
      var items = Object(arrayLike);

      // 3. ReturnIfAbrupt(items).
      if (arrayLike === null) {
        throw new TypeError('Array.from requires an array-like object - not null or undefined');
      }

      // 4. If mapfn is undefined, then let mapping be false.
      var mapFn = arguments.length > 1 ? arguments[1] : void undefined;
      var T;
      if (typeof mapFn !== 'undefined') {
        // 5. else
        // 5. a If IsCallable(mapfn) is false, throw a TypeError exception.
        if (!isCallable(mapFn)) {
          throw new TypeError('Array.from: when provided, the second argument must be a function');
        }

        // 5. b. If thisArg was supplied, let T be thisArg; else let T be undefined.
        if (arguments.length > 2) {
          T = arguments[2];
        }
      }

      // 10. Let lenValue be Get(items, "length").
      // 11. Let len be ToLength(lenValue).
      var len = toLength(items.length);

      // 13. If IsConstructor(C) is true, then
      // 13. a. Let A be the result of calling the [[Construct]] internal method 
      // of C with an argument list containing the single item len.
      // 14. a. Else, Let A be ArrayCreate(len).
      var A = isCallable(C) ? Object(new C(len)) : new Array(len);

      // 16. Let k be 0.
      var k = 0;
      // 17. Repeat, while k < len… (also steps a - h)
      var kValue;
      while (k < len) {
        kValue = items[k];
        if (mapFn) {
          A[k] = typeof T === 'undefined' ? mapFn(kValue, k) : mapFn.call(T, kValue, k);
        } else {
          A[k] = kValue;
        }
        k += 1;
      }
      // 18. Let putStatus be Put(A, "length", len, true).
      A.length = len;
      // 20. Return A.
      return A;
    };
  }());
}
// nodejs compatible on server side and in the browser.
function inherits(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
}

function Diff(kind, path) {
  Object.defineProperty(this, 'kind', {
    value: kind,
    enumerable: true
  });
  if (path && path.length) {
    Object.defineProperty(this, 'path', {
      value: path,
      enumerable: true
    });
  }
}

function DiffEdit(path, origin, value) {
  DiffEdit.super_.call(this, 'E', path);
  Object.defineProperty(this, 'lhs', {
    value: origin,
    enumerable: true
  });
  Object.defineProperty(this, 'rhs', {
    value: value,
    enumerable: true
  });
}
inherits(DiffEdit, Diff);

function DiffNew(path, value) {
  DiffNew.super_.call(this, 'N', path);
  Object.defineProperty(this, 'rhs', {
    value: value,
    enumerable: true
  });
}
inherits(DiffNew, Diff);

function DiffDeleted(path, value) {
  DiffDeleted.super_.call(this, 'D', path);
  Object.defineProperty(this, 'lhs', {
    value: value,
    enumerable: true
  });
}
inherits(DiffDeleted, Diff);

function DiffArray(path, index, item) {
  DiffArray.super_.call(this, 'A', path);
  Object.defineProperty(this, 'index', {
    value: index,
    enumerable: true
  });
  Object.defineProperty(this, 'item', {
    value: item,
    enumerable: true
  });
}
inherits(DiffArray, Diff);

function arrayRemove(arr, from, to) {
  var rest = arr.slice((to || from) + 1 || arr.length);
  arr.length = from < 0 ? arr.length + from : from;
  arr.push.apply(arr, rest);
  return arr;
}

function realTypeOf(subject) {
  var type = typeof subject;
  if (type !== 'object') {
    return type;
  }

  if (subject === Math) {
    return 'math';
  } else if (subject === null) {
    return 'null';
  } else if (Array.isArray(subject)) {
    return 'array';
  } else if (Object.prototype.toString.call(subject) === '[object Date]') {
    return 'date';
  } else if (typeof subject.toString === 'function' && /^\/.*\//.test(subject.toString())) {
    return 'regexp';
  }
  return 'object';
}

function deepDiff(lhs, rhs, changes, prefilter, path, key, stack, orderIndependent) {
  path = path || [];
  stack = stack || [];
  var currentPath = path.slice(0);
  if (typeof key !== 'undefined') {
    if (prefilter) {
      if (typeof(prefilter) === 'function' && prefilter(currentPath, key)) {
        return; } else if (typeof(prefilter) === 'object') {
        if (prefilter.prefilter && prefilter.prefilter(currentPath, key)) {
          return; }
        if (prefilter.normalize) {
          var alt = prefilter.normalize(currentPath, key, lhs, rhs);
          if (alt) {
            lhs = alt[0];
            rhs = alt[1];
          }
        }
      }
    }
    currentPath.push(key);
  }

  // Use string comparison for regexes
  if (realTypeOf(lhs) === 'regexp' && realTypeOf(rhs) === 'regexp') {
    lhs = lhs.toString();
    rhs = rhs.toString();
  }

  var ltype = typeof lhs;
  var rtype = typeof rhs;

  var ldefined = ltype !== 'undefined' || (stack && stack[stack.length - 1].lhs && stack[stack.length - 1].lhs.hasOwnProperty(key));
  var rdefined = rtype !== 'undefined' || (stack && stack[stack.length - 1].rhs && stack[stack.length - 1].rhs.hasOwnProperty(key));

  if (!ldefined && rdefined) {
    changes(new DiffNew(currentPath, rhs));
  } else if (!rdefined && ldefined) {
    changes(new DiffDeleted(currentPath, lhs));
  } else if (realTypeOf(lhs) !== realTypeOf(rhs)) {
    changes(new DiffEdit(currentPath, lhs, rhs));
  } else if (realTypeOf(lhs) === 'date' && (lhs - rhs) !== 0) {
    changes(new DiffEdit(currentPath, lhs, rhs));
  } else if (ltype === 'object' && lhs !== null && rhs !== null) {
    if (!stack.filter(function(x) {
        return x.lhs === lhs; }).length) {
      stack.push({ lhs: lhs, rhs: rhs });
      if (Array.isArray(lhs)) {
        var lhs1 = Array.from(lhs); 
		var rhs1 = Array.from(rhs);
		if (orderIndependent) {
			for (i = 0; i < lhs.length && rhs1.length > 0 && lhs1.length > 0; i++) {
				var ridx = rhs1.indexOf(lhs[i]);
				var lidx = lhs1.indexOf(lhs[i]);
				if(ridx != -1) {
					rhs1.splice(ridx, 1);
					if(lidx != -1) {
						lhs1.splice(lidx, 1);
					}
				}
			}
			lhs1.sort(function(a, b) {
				return getOrderIndependentHash(a) - getOrderIndependentHash(b);
			});
 
			rhs1.sort(function(a, b) {
				return getOrderIndependentHash(a) - getOrderIndependentHash(b);
			});
		}
        var i, len = lhs1.length;
        for (i = 0; i < lhs1.length; i++) {
          if (i >= rhs1.length) {
            changes(new DiffArray(currentPath, i, new DiffDeleted(undefined, lhs1[i])));
          } else {
            deepDiff(lhs1[i], rhs1[i], changes, prefilter, currentPath, i, stack, orderIndependent);
          }
        }
        while (i < rhs1.length) {
          changes(new DiffArray(currentPath, i, new DiffNew(undefined, rhs1[i++])));
        }
      } else {
        var akeys = Object.keys(lhs);
        var pkeys = Object.keys(rhs);
        akeys.forEach(function(k, i) {
          var other = pkeys.indexOf(k);
          if (other >= 0) {
            deepDiff(lhs[k], rhs[k], changes, prefilter, currentPath, k, stack, orderIndependent);
            pkeys = arrayRemove(pkeys, other);
          } else {
            deepDiff(lhs[k], undefined, changes, prefilter, currentPath, k, stack, orderIndependent);
          }
        });
        pkeys.forEach(function(k) {
          deepDiff(undefined, rhs[k], changes, prefilter, currentPath, k, stack, orderIndependent);
        });
      }
      stack.length = stack.length - 1;
    } else if (lhs !== rhs) {
      // lhs is contains a cycle at this element and it differs from rhs
      changes(new DiffEdit(currentPath, lhs, rhs));
    }
  } else if (lhs !== rhs) {
    if (!(ltype === 'number' && isNaN(lhs) && isNaN(rhs))) {
      changes(new DiffEdit(currentPath, lhs, rhs));
    }
  }
}
function orderIndependentDeepDiff(lhs, rhs, changes, prefilter, path, key, stack) {
  return deepDiff(lhs, rhs, changes, prefilter, path, key, stack, true);
}
function accumulateDiff(lhs, rhs, prefilter, accum) {
  accum = accum || [];
  deepDiff(lhs, rhs,
    function(diff) {
      if (diff) {
        accum.push(diff);
      }
    },
    prefilter);
  return (accum.length) ? accum : undefined;
}
function accumulateOrderIndependentDiff(lhs, rhs, prefilter, accum) {
   accum = accum || [];
   deepDiff(lhs, rhs,
     function(diff) {
       if (diff) {
         accum.push(diff);
       }
     },
     prefilter, undefined, undefined, undefined, true);
   return (accum.length) ? accum : undefined;
 }

 
 // Gets a hash of the given object in an array order-independent fashion
 // also object key order independent (easier since they can be alphabetized)
 function getOrderIndependentHash(object) {
   var accum = 0;
   var type = realTypeOf(object);
 
   if (type === 'array') {
     object.forEach(function(item) {
       // Addition is commutative so this is order indep
       accum += getOrderIndependentHash(item);
     });
 
     var arrayString = '[type: array, hash: ' + accum + ']';
     return accum + hashThisString(arrayString);
   }
 
   if (type === 'object') {
     for (var key in object) {
       if (object.hasOwnProperty(key)) {
         var keyValueString = '[ type: object, key: ' + key + ', value hash: ' + getOrderIndependentHash(object[key]) + ']';
         accum += hashThisString(keyValueString);
       }
     }
 
     return accum;
   }
 
   // Non object, non array...should be good?
   var stringToHash = '[ type: ' + type + ' ; value: ' + object + ']';
   return accum + hashThisString(stringToHash);
 }
 
 // http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
 function hashThisString(string) {
   var hash = 0;
   if (string.length === 0) return hash;
   for (var i = 0; i < string.length; i++) {
     var char = string.charCodeAt(i);
     hash = ((hash<<5)-hash)+char;
     hash = hash & hash; // Convert to 32bit integer
   }
 
   return hash;
 }
function applyArrayChange(arr, index, change) {
  if (change.path && change.path.length) {
    var it = arr[index],
      i, u = change.path.length - 1;
    for (i = 0; i < u; i++) {
      it = it[change.path[i]];
    }
    switch (change.kind) {
      case 'A':
        applyArrayChange(it[change.path[i]], change.index, change.item);
        break;
      case 'D':
        delete it[change.path[i]];
        break;
      case 'E':
      case 'N':
        it[change.path[i]] = change.rhs;
        break;
    }
  } else {
    switch (change.kind) {
      case 'A':
        applyArrayChange(arr[index], change.index, change.item);
        break;
      case 'D':
        arr = arrayRemove(arr, index);
        break;
      case 'E':
      case 'N':
        arr[index] = change.rhs;
        break;
    }
  }
  return arr;
}

function applyChange(target, source, change) {
  if (target && source && change && change.kind) {
    var it = target,
      i = -1,
      last = change.path ? change.path.length - 1 : 0;
    while (++i < last) {
      if (typeof it[change.path[i]] === 'undefined') {
        it[change.path[i]] = (typeof change.path[i] === 'number') ? [] : {};
      }
      it = it[change.path[i]];
    }
    switch (change.kind) {
      case 'A':
        applyArrayChange(change.path ? it[change.path[i]] : it, change.index, change.item);
        break;
      case 'D':
        delete it[change.path[i]];
        break;
      case 'E':
      case 'N':
        it[change.path[i]] = change.rhs;
        break;
    }
  }
}

function revertArrayChange(arr, index, change) {
  if (change.path && change.path.length) {
    // the structure of the object at the index has changed...
    var it = arr[index],
      i, u = change.path.length - 1;
    for (i = 0; i < u; i++) {
      it = it[change.path[i]];
    }
    switch (change.kind) {
      case 'A':
        revertArrayChange(it[change.path[i]], change.index, change.item);
        break;
      case 'D':
        it[change.path[i]] = change.lhs;
        break;
      case 'E':
        it[change.path[i]] = change.lhs;
        break;
      case 'N':
        delete it[change.path[i]];
        break;
    }
  } else {
    // the array item is different...
    switch (change.kind) {
      case 'A':
        revertArrayChange(arr[index], change.index, change.item);
        break;
      case 'D':
        arr[index] = change.lhs;
        break;
      case 'E':
        arr[index] = change.lhs;
        break;
      case 'N':
        arr = arrayRemove(arr, index);
        break;
    }
  }
  return arr;
}

function revertChange(target, source, change) {
  if (target && source && change && change.kind) {
    var it = target,
      i, u;
    u = change.path.length - 1;
    for (i = 0; i < u; i++) {
      if (typeof it[change.path[i]] === 'undefined') {
        it[change.path[i]] = {};
      }
      it = it[change.path[i]];
    }
    switch (change.kind) {
      case 'A':
        // Array was modified...
        // it will be an array...
        revertArrayChange(it[change.path[i]], change.index, change.item);
        break;
      case 'D':
        // Item was deleted...
        it[change.path[i]] = change.lhs;
        break;
      case 'E':
        // Item was edited...
        it[change.path[i]] = change.lhs;
        break;
      case 'N':
        // Item is new...
        delete it[change.path[i]];
        break;
    }
  }
}

function applyDiff(target, source, filter) {
  if (target && source) {
    var onChange = function(change) {
      if (!filter || filter(target, source, change)) {
        applyChange(target, source, change);
      }
    };
    deepDiff(target, source, onChange);
  }
}

Object.defineProperties(accumulateDiff, {

  diff: {
    value: accumulateDiff,
    enumerable: true
  },
  orderIndependentDiff: {
    value: accumulateOrderIndependentDiff,
    enumerable: true
   },
  observableDiff: {
    value: deepDiff,
    enumerable: true
  },
  orderIndependentObservableDiff: {
     value:orderIndependentDeepDiff,
     enumerable: true
   },
   orderIndepHash: {
     value:getOrderIndependentHash,
     enumerable: true
   },
  applyDiff: {
    value: applyDiff,
    enumerable: true
  },
  applyChange: {
    value: applyChange,
    enumerable: true
  },
  revertChange: {
    value: revertChange,
    enumerable: true
  },
  isConflict: {
    value: function() {
      return 'undefined' !== typeof conflict;
    },
    enumerable: true
  },
  noConflict: {
    value: function() {
      if (conflictResolution) {
        conflictResolution.forEach(function(it) {
          it();
        });
        conflictResolution = null;
      }
      return accumulateDiff;
    },
    enumerable: true
  }
});

export default accumulateDiff;
