import { purry } from "remeda";

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

function _and(left: boolean, right: boolean): boolean {
  return left && right;
}
export function and(...args: readonly unknown[]) {
  return purry(_and, args);
}

function _or(left: boolean, right: boolean): boolean {
  return left || right;
}
export function or(...args: readonly unknown[]) {
  return purry(_or, args);
}

export const thenElse =
  <T, F>(trueVal: T, falseVal: F) =>
  (condition: boolean) =>
    condition ? trueVal : falseVal;

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

function _fetch(
  url: string,
  options: RequestInit | undefined
): Promise<Response> {
  return globalThis.fetch(url, options);
}
export function fetch(...args: readonly unknown[]) {
  return purry(_fetch, args);
}
