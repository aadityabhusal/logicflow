const builtInModuleCode = `import { purry } from "remeda";
import { produce } from "immer";

// ===== Pipe Operations =====

export const pipeAsync = async (value, ...fns) => {
  let result = value;
  for (const fn of fns) {
    result = await fn(result);
  }
  return result;
};

// ===== Polymorphic Operations =====

export const length = (value) => value.length;

function _includes(value, search) {
  return value.includes(search);
}
export function includes(...args) {
  return purry(_includes, args);
}

function _concat(value, other) {
  return value.concat(other);
}
export function concat(...args) {
  return purry(_concat, args);
}

// ===== String Operations =====

function _localeCompare(str, other) {
  return str.localeCompare(other);
}
export function localeCompare(...args) {
  return purry(_localeCompare, args);
}

function _power(base, exp) {
  return Math.pow(base, exp);
}
export function power(...args) {
  return purry(_power, args);
}

function _mod(value, divisor) {
  return value % divisor;
}
export function mod(...args) {
  return purry(_mod, args);
}

function _lessThan(value, compare) {
  return value < compare;
}
export function lessThan(...args) {
  return purry(_lessThan, args);
}

function _lessThanOrEqual(value, compare) {
  return value <= compare;
}
export function lessThanOrEqual(...args) {
  return purry(_lessThanOrEqual, args);
}

function _greaterThan(value, compare) {
  return value > compare;
}
export function greaterThan(...args) {
  return purry(_greaterThan, args);
}

function _greaterThanOrEqual(value, compare) {
  return value >= compare;
}
export function greaterThanOrEqual(...args) {
  return purry(_greaterThanOrEqual, args);
}

// ===== Boolean Operations =====

export const not = (value) => !value;

function _and(left, rightCallback) {
  return left && rightCallback();
}
export function and(...args) {
  return purry(_and, args);
}

function _or(left, rightCallback) {
  return left || rightCallback();
}
export function or(...args) {
  return purry(_or, args);
}

export const thenElse = (trueCallback, falseCallback) => (condition) =>
  condition ? trueCallback() : falseCallback();

// ===== Tuple Operations =====

function _join(tuple, separator) {
  return tuple.join(separator);
}
export function join(...args) {
  return purry(_join, args);
}

export const toArray = (tuple) => [...tuple];

// ===== Array Operations =====

function _at(arr, index) {
  return arr.at(index);
}
export function at(...args) {
  return purry(_at, args);
}

function _indexOf(arr, item) {
  return arr.indexOf(item);
}
export function indexOf(...args) {
  return purry(_indexOf, args);
}

function _lastIndexOf(arr, item) {
  return arr.lastIndexOf(item);
}
export function lastIndexOf(...args) {
  return purry(_lastIndexOf, args);
}

export function slice(...args) {
  if (args.length > 0 && Array.isArray(args[0])) {
    return args[0].slice(args[1], args[2]);
  }
  return (arr) => arr.slice(args[0], args[1]);
}

function _some(arr, predicate) {
  return arr.some(predicate);
}
export function some(...args) {
  return purry(_some, args);
}

function _every(arr, predicate) {
  return arr.every(predicate);
}
export function every(...args) {
  return purry(_every, args);
}

export const toTuple = (arr) => [...arr];

// ===== Dictionary/Object Operations =====

function _get(obj, key) {
  return obj[key];
}
export function get(...args) {
  return purry(_get, args);
}

function _has(obj, key) {
  return key in obj;
}
export function has(...args) {
  return purry(_has, args);
}

export const toObject = (dict) => ({ ...dict });
export const toDictionary = (obj) => ({ ...obj });

// ===== Unknown Operations =====

export const toNumber = (value) => Number(value);

export const toString = (value) => {
  if (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    "toString" in value &&
    typeof value.toString === "function" &&
    value.toString !== Object.prototype.toString
  ) {
    return value.toString();
  }
  return JSON.stringify(value);
};

export const log = (value) => {
  console.log(value);
};

export const isTypeOf = (typeValue) => (value) => {
  if (Array.isArray(value) || Array.isArray(typeValue)) {
    return Array.isArray(value) && Array.isArray(typeValue);
  }
  if (value === null || typeValue === null) return value === typeValue;
  if (typeof value !== typeof typeValue) return false;
  if (typeof value === "object") return value.constructor === typeValue.constructor;
  return true;
};

export function fetch(...args) {
  if (args.length === 2) return globalThis.fetch(args[0], args[1]);
  if (args.length === 1 && typeof args[0] === "string") return globalThis.fetch(args[0]);
  if (args.length === 1) return (url) => globalThis.fetch(url, args[0]);
  return (url) => globalThis.fetch(url);
}

// ===== Request Instance Operations =====

export const getUrl = (request) => request.url;
export const getMethod = (request) => request.method;

function _getHeader(request, headerName) {
  return request.headers.get(headerName) || "";
}
export function getHeader(...args) {
  return purry(_getHeader, args);
}

function _getQuery(request, paramName) {
  return new URL(request.url).searchParams.get(paramName) || "";
}
export function getQuery(...args) {
  return purry(_getQuery, args);
}

export const getPath = (request) => new URL(request.url).pathname;

export const json = (instance) => instance.clone().json();
export const text = (instance) => instance.clone().text();

// ===== URL Instance Operations =====

export const getHref = (url) => url.href;
export const getOrigin = (url) => url.origin;
export const getPort = (url) => url.port;
export const getSearch = (url) => url.search;
export const getHash = (url) => url.hash;

// ===== Response Instance Operations =====

export const getStatus = (response) => response.status;

// ===== Immutable Update Operations =====

function navigatePath(target, path) {
  let current = target;
  for (let i = 0; i < path.length - 1; i++) {
    if (current == null || typeof current !== "object") return null;
    current = current[path[i]];
  }
  if (current == null || typeof current !== "object") return null;
  return current;
}

function _setIn(value, path, nextValue) {
  return produce(value, (draft) => {
    const parent = navigatePath(draft, path);
    if (parent) parent[path[path.length - 1]] = nextValue;
  });
}
export function setIn(...args) {
  return purry(_setIn, args);
}

function _updateIn(value, path, updater) {
  return produce(value, (draft) => {
    const parent = navigatePath(draft, path);
    if (parent) {
      const lastKey = path[path.length - 1];
      parent[lastKey] = updater(parent[lastKey]);
    }
  });
}
export function updateIn(...args) {
  return purry(_updateIn, args);
}

function _removeIn(value, path) {
  return produce(value, (draft) => {
    const parent = navigatePath(draft, path);
    if (parent) {
      const lastKey = path[path.length - 1];
      if (Array.isArray(parent)) {
        parent.splice(lastKey, 1);
      } else {
        delete parent[lastKey];
      }
    }
  });
}
export function removeIn(...args) {
  return purry(_removeIn, args);
}

function _setKey(value, key, nextValue) {
  return { ...value, [key]: nextValue };
}
export function setKey(...args) {
  return purry(_setKey, args);
}

function _updateKey(value, key, updater) {
  return { ...value, [key]: updater(value[key]) };
}
export function updateKey(...args) {
  return purry(_updateKey, args);
}

function _removeKey(value, key) {
  const { [key]: _, ...rest } = value;
  return rest;
}
export function removeKey(...args) {
  return purry(_removeKey, args);
}

function _replaceAt(value, index, nextValue) {
  return produce(value, (draft) => {
    draft[index] = nextValue;
  });
}
export function replaceAt(...args) {
  return purry(_replaceAt, args);
}

function _updateAt(value, index, updater) {
  return produce(value, (draft) => {
    draft[index] = updater(draft[index]);
  });
}
export function updateAt(...args) {
  return purry(_updateAt, args);
}

function _insertAt(value, index, nextValue) {
  return produce(value, (draft) => {
    draft.splice(index, 0, nextValue);
  });
}
export function insertAt(...args) {
  return purry(_insertAt, args);
}

function _removeAt(value, index) {
  return produce(value, (draft) => {
    draft.splice(index, 1);
  });
}
export function removeAt(...args) {
  return purry(_removeAt, args);
}
`;

export function generateBuiltInModule(): string {
  return builtInModuleCode;
}
