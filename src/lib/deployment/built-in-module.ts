const builtInModuleCode = `import { purry } from "remeda";

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

function _and(left, right) {
  return left && right;
}
export function and(...args) {
  return purry(_and, args);
}

function _or(left, right) {
  return left || right;
}
export function or(...args) {
  return purry(_or, args);
}

export const thenElse = (trueVal, falseVal) => (condition) =>
  condition ? trueVal : falseVal;

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

function _slice(arr, start, end) {
  return arr.slice(start, end);
}
export function slice(...args) {
  return purry(_slice, args);
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

export const isTypeOf = (type) => (value) => typeof value === type;

function _fetch(url, options) {
  return globalThis.fetch(url, options);
}
export function fetch(...args) {
  return purry(_fetch, args);
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
`;

export function generateBuiltInModule(): string {
  return builtInModuleCode;
}
