import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storage as api } from '../src/main.js';

const { save, restore, forget, STORAGE_CAP } = api;

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

function throwingStorage() {
  return {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
}

describe('save and restore', () => {
  it('round-trips state', () => {
    const store = fakeStorage();
    const state = { rows: [['a', 'b']], headerRow: 0, filter: 'x', scroll: 120 };
    expect(save(state, store)).toBe(true);
    expect(restore(store)).toEqual(state);
  });

  it('returns null when nothing is stored', () => {
    expect(restore(fakeStorage())).toBeNull();
  });

  it('returns false rather than throwing in a private window', () => {
    expect(save({ rows: [], headerRow: 0, filter: '', scroll: 0 }, throwingStorage()))
      .toBe(false);
  });

  it('returns null rather than throwing when reading fails', () => {
    expect(restore(throwingStorage())).toBeNull();
  });

  it('refuses a payload over the cap', () => {
    const huge = { rows: [[ 'x'.repeat(STORAGE_CAP + 10) ]], headerRow: 0, filter: '', scroll: 0 };
    expect(save(huge, fakeStorage())).toBe(false);
  });

  it('returns null on corrupt stored data', () => {
    const store = fakeStorage();
    store.setItem('sheet-reader:v1', 'not json');
    expect(restore(store)).toBeNull();
  });
});

describe('default storage resolution when localStorage itself throws', () => {
  let original;

  beforeEach(() => {
    original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      get() {
        throw new Error('denied');
      },
      configurable: true,
    });
  });

  afterEach(() => {
    if (original) {
      Object.defineProperty(globalThis, 'localStorage', original);
    } else {
      delete globalThis.localStorage;
    }
  });

  it('save() with no store argument returns false rather than throwing', () => {
    expect(save({ rows: [], headerRow: 0, filter: '', scroll: 0 })).toBe(false);
  });

  it('restore() with no store argument returns null rather than throwing', () => {
    expect(restore()).toBeNull();
  });

  it('forget() with no store argument does not throw', () => {
    expect(() => forget()).not.toThrow();
  });
});
