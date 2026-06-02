import { purry } from "remeda";
import { produce } from "immer";

// ===== Pipe Operations =====

const await_ = async <T>(value: T | Promise<T>): Promise<T> => value;
export { await_ as await };

export const pipeAsync = async <T>(
  value: T,
  ...fns: ((arg: unknown) => unknown)[]
): Promise<unknown> => {
  let result: unknown = value;
  for (const fn of fns) {
    result = fn === await_ ? await result : fn(result);
  }
  return result;
};

// ===== Polymorphic Operations (work on multiple types) =====

export const length = (value: string | unknown[]) => value.length;

function _includes<T>(value: string | T[], search: string | T): boolean {
  return value.includes(search as never);
}
export function includes(...args: readonly unknown[]) {
  return purry(_includes, args);
}

function _concat<T>(value: string | T[], other: string | T[]): string | T[] {
  return value.concat(other as never);
}
export function concat(...args: readonly unknown[]) {
  return purry(_concat, args);
}

// ===== String Operations =====

function _localeCompare(str: string, other: string): number {
  return str.localeCompare(other);
}
export function localeCompare(...args: readonly unknown[]) {
  return purry(_localeCompare, args);
}

function _power(base: number, exp: number): number {
  return Math.pow(base, exp);
}
export function power(...args: readonly unknown[]) {
  return purry(_power, args);
}

function _mod(value: number, divisor: number): number {
  return value % divisor;
}
export function mod(...args: readonly unknown[]) {
  return purry(_mod, args);
}

function _lessThan(value: number, compare: number): boolean {
  return value < compare;
}
export function lessThan(...args: readonly unknown[]) {
  return purry(_lessThan, args);
}

function _lessThanOrEqual(value: number, compare: number): boolean {
  return value <= compare;
}
export function lessThanOrEqual(...args: readonly unknown[]) {
  return purry(_lessThanOrEqual, args);
}

function _greaterThan(value: number, compare: number): boolean {
  return value > compare;
}
export function greaterThan(...args: readonly unknown[]) {
  return purry(_greaterThan, args);
}

function _greaterThanOrEqual(value: number, compare: number): boolean {
  return value >= compare;
}
export function greaterThanOrEqual(...args: readonly unknown[]) {
  return purry(_greaterThanOrEqual, args);
}

// ===== Boolean Operations =====

export const not = (value: boolean) => !value;

function _and(left: boolean, rightCallback: () => unknown): boolean {
  return left && !!rightCallback();
}
export function and(...args: readonly unknown[]) {
  return purry(_and, args);
}

function _or(left: boolean, rightCallback: () => unknown): boolean {
  return left || !!rightCallback();
}
export function or(...args: readonly unknown[]) {
  return purry(_or, args);
}

const _thenElse =
  <T, F>(trueCallback: () => T, falseCallback: () => F) =>
  (condition: boolean) =>
    condition ? trueCallback() : falseCallback();

export function thenElse(...args: readonly unknown[]) {
  return purry(_thenElse, args);
}

// ===== Tuple Operations =====

function _join<T>(tuple: T[], separator: string): string {
  return tuple.join(separator);
}
export function join(...args: readonly unknown[]) {
  return purry(_join, args);
}

export const toArray = <T>(tuple: T[]) => [...tuple];

// ===== Array Operations =====

function _at<T>(arr: T[], index: number): T | undefined {
  return arr.at(index);
}
export function at(...args: readonly unknown[]) {
  return purry(_at, args);
}

function _indexOf<T>(arr: T[], item: T): number {
  return arr.indexOf(item);
}
export function indexOf(...args: readonly unknown[]) {
  return purry(_indexOf, args);
}

function _lastIndexOf<T>(arr: T[], item: T): number {
  return arr.lastIndexOf(item);
}
export function lastIndexOf(...args: readonly unknown[]) {
  return purry(_lastIndexOf, args);
}

export function slice(...args: readonly unknown[]) {
  if (args.length > 0 && Array.isArray(args[0])) {
    return (args[0] as unknown[]).slice(args[1] as number, args[2] as number);
  }
  return (arr: unknown[]) => arr.slice(args[0] as number, args[1] as number);
}

function _some<T>(
  arr: T[],
  predicate: (item: T, index: number, arr: T[]) => boolean
): boolean {
  return arr.some(predicate);
}
export function some(...args: readonly unknown[]) {
  return purry(_some, args);
}

function _every<T>(
  arr: T[],
  predicate: (item: T, index: number, arr: T[]) => boolean
): boolean {
  return arr.every(predicate);
}
export function every(...args: readonly unknown[]) {
  return purry(_every, args);
}

export const toTuple = <T>(arr: T[]) => [...arr] as const;

// ===== Dictionary/Object Operations =====

function _get<T>(obj: Record<string, T>, key: string): T {
  return obj[key];
}
export function get(...args: readonly unknown[]) {
  return purry(_get, args);
}

function _has<T>(obj: Record<string, T>, key: string): boolean {
  return key in obj;
}
export function has(...args: readonly unknown[]) {
  return purry(_has, args);
}

export const toObject = <T>(dict: Record<string, T>) => ({ ...dict });
export const toDictionary = <T>(obj: Record<string, T>) => ({ ...obj });

// ===== Unknown Operations =====

export const toNumber = (value: string): number => Number(value);

export const toString = (value: unknown) => {
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

export const log = <T>(value: T) => {
  console.log(value);
};

export const isTypeOf =
  (typeValue: unknown) =>
  (value: unknown): boolean => {
    if (Array.isArray(value) || Array.isArray(typeValue)) {
      return Array.isArray(value) && Array.isArray(typeValue);
    }
    if (value === null || typeValue === null) return value === typeValue;
    if (typeof value !== typeof typeValue) return false;
    if (typeof value === "object") {
      return value.constructor === (typeValue as object).constructor;
    }
    return true;
  };

export function fetch(...args: readonly unknown[]) {
  if (args.length === 2)
    return globalThis.fetch(args[0] as string, args[1] as RequestInit);
  if (args.length === 1 && typeof args[0] === "string")
    return globalThis.fetch(args[0]);
  if (args.length === 1)
    return (url: string) => globalThis.fetch(url, args[0] as RequestInit);
  return (url: string) => globalThis.fetch(url);
}

// ===== Request Instance Operations =====

export const getUrl = (request: Request): string => request.url;
export const getMethod = (request: Request): string => request.method;

function _getHeader(request: Request, headerName: string): string {
  return request.headers.get(headerName) || "";
}
export function getHeader(...args: readonly unknown[]) {
  return purry(_getHeader, args);
}

function _getQuery(request: Request, paramName: string): string {
  return new URL(request.url).searchParams.get(paramName) || "";
}
export function getQuery(...args: readonly unknown[]) {
  return purry(_getQuery, args);
}

export const getPath = (request: Request): string =>
  new URL(request.url).pathname;

export const json = (instance: Request | Response): Promise<unknown> =>
  instance.clone().json();
export const text = (instance: Request | Response): Promise<string> =>
  instance.clone().text();

// ===== URL Instance Operations =====

export const getHref = (url: URL): string => url.href;
export const getOrigin = (url: URL): string => url.origin;
export const getPort = (url: URL): string => url.port;
export const getSearch = (url: URL): string => url.search;
export const getHash = (url: URL): string => url.hash;

// ===== Response Instance Operations =====

export const getStatus = (response: Response): number => response.status;

// ===== Error Operations =====

export const getMessage = (error: Error): string => error.message;

// ===== Immutable Update Operations =====

type PathSegment = string | number;

function navigatePath(
  target: unknown,
  path: PathSegment[]
): Record<string | number, unknown> | null {
  let current: unknown = target;
  for (let i = 0; i < path.length - 1; i++) {
    if (current == null || typeof current !== "object") return null;
    current = (current as Record<string | number, unknown>)[path[i]];
  }
  if (current == null || typeof current !== "object") return null;
  return current as Record<string | number, unknown>;
}

function _setIn<T extends object | unknown[]>(
  value: T,
  path: PathSegment[],
  nextValue: unknown
): T {
  return produce(value, (draft) => {
    const parent = navigatePath(draft, path);
    if (parent) parent[path[path.length - 1]] = nextValue;
  });
}
export function setIn(...args: readonly unknown[]) {
  return purry(_setIn, args);
}

function _updateIn<T extends object | unknown[]>(
  value: T,
  path: PathSegment[],
  updater: (v: unknown) => unknown
): T {
  return produce(value, (draft) => {
    const parent = navigatePath(draft, path);
    if (parent) {
      const lastKey = path[path.length - 1];
      parent[lastKey] = updater(parent[lastKey]);
    }
  });
}
export function updateIn(...args: readonly unknown[]) {
  return purry(_updateIn, args);
}

function _removeIn<T extends object | unknown[]>(
  value: T,
  path: PathSegment[]
): T {
  return produce(value, (draft) => {
    const parent = navigatePath(draft, path);
    if (parent) {
      const lastKey = path[path.length - 1];
      if (Array.isArray(parent)) {
        parent.splice(lastKey as number, 1);
      } else {
        delete parent[lastKey];
      }
    }
  });
}
export function removeIn(...args: readonly unknown[]) {
  return purry(_removeIn, args);
}

function _setKey<T extends Record<string, unknown>>(
  value: T,
  key: string,
  nextValue: unknown
): T {
  return { ...value, [key]: nextValue };
}
export function setKey(...args: readonly unknown[]) {
  return purry(_setKey, args);
}

function _updateKey<T extends Record<string, unknown>>(
  value: T,
  key: string,
  updater: (v: unknown) => unknown
): T {
  return { ...value, [key]: updater(value[key]) };
}
export function updateKey(...args: readonly unknown[]) {
  return purry(_updateKey, args);
}

function _removeKey<T extends Record<string, unknown>>(
  value: T,
  key: string
): T {
  const { [key]: _, ...rest } = value;
  return rest as T;
}
export function removeKey(...args: readonly unknown[]) {
  return purry(_removeKey, args);
}

function _replaceAt<T extends unknown[]>(
  value: T,
  index: number,
  nextValue: unknown
): T {
  return produce(value, (draft) => {
    draft[index] = nextValue;
  });
}
export function replaceAt(...args: readonly unknown[]) {
  return purry(_replaceAt, args);
}

function _updateAt<T extends unknown[]>(
  value: T,
  index: number,
  updater: (v: unknown) => unknown
): T {
  return produce(value, (draft) => {
    draft[index] = updater(draft[index]);
  });
}
export function updateAt(...args: readonly unknown[]) {
  return purry(_updateAt, args);
}

function _insertAt<T extends unknown[]>(
  value: T,
  index: number,
  nextValue: unknown
): T {
  return produce(value, (draft) => {
    draft.splice(index, 0, nextValue);
  });
}
export function insertAt(...args: readonly unknown[]) {
  return purry(_insertAt, args);
}

function _removeAt<T extends unknown[]>(value: T, index: number): T {
  return produce(value, (draft) => {
    draft.splice(index, 1);
  });
}
export function removeAt(...args: readonly unknown[]) {
  return purry(_removeAt, args);
}
