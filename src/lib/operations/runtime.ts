import { purry } from "remeda";

// ===== Pipe Operations =====

export const pipeAsync = async <T>(
  value: T,
  ...fns: ((arg: unknown) => Promise<unknown>)[]
): Promise<unknown> => {
  let result: unknown = value;
  for (const fn of fns) {
    result = await fn(result);
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

export const _thenElse =
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

function _slice<T>(
  arr: T[],
  start: number | undefined,
  end: number | undefined
): T[] {
  return arr.slice(start, end);
}
export function slice(...args: readonly unknown[]) {
  return purry(_slice, args);
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
  (type: string) =>
  (value: unknown): boolean =>
    typeof value === type;

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
