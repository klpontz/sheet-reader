import { describe, it, expect } from 'vitest';
import { helpers } from '../src/main.js';

const { classifyInput, looksLikeSignInPage, rowsFromText, messageForFetchFailure } = helpers;

const ID = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

describe('classifyInput', () => {
  it('calls blank input empty', () => {
    expect(classifyInput('   ')).toBe('empty');
  });

  it('calls a sheets link a url', () => {
    expect(classifyInput(`https://docs.google.com/spreadsheets/d/${ID}/edit`)).toBe('url');
  });

  it('calls pasted cells cells', () => {
    expect(classifyInput('Name\tAnswer\nDana\tHello')).toBe('cells');
  });

  it('calls a single word cells', () => {
    expect(classifyInput('hello')).toBe('cells');
  });
});

describe('looksLikeSignInPage', () => {
  it('detects an HTML document', () => {
    expect(looksLikeSignInPage('<!DOCTYPE html><html><head>')).toBe(true);
  });

  it('detects a bare html tag', () => {
    expect(looksLikeSignInPage('  <HTML lang="en">')).toBe(true);
  });

  it('passes ordinary CSV through', () => {
    expect(looksLikeSignInPage('Name,Answer\nDana,Hello')).toBe(false);
  });

  it('does not trip on a cell containing markup', () => {
    expect(looksLikeSignInPage('Name,Answer\nDana,"<b>hi</b>"')).toBe(false);
  });
});

describe('rowsFromText', () => {
  it('parses tab-separated text', () => {
    expect(rowsFromText('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('parses comma-separated text', () => {
    expect(rowsFromText('a,b\r\nc,d')).toEqual([['a', 'b'], ['c', 'd']]);
  });
});

describe('messageForFetchFailure', () => {
  it('explains an unshared sheet', () => {
    expect(messageForFetchFailure(200, '<!DOCTYPE html>')).toBe(
      'This sheet is not public, so it cannot be read from a link. Copy the cells and paste them instead.',
    );
  });

  it('explains a missing sheet', () => {
    expect(messageForFetchFailure(404, '')).toBe(
      'That sheet or tab does not exist. Check the link.',
    );
  });

  it('explains a bad gid', () => {
    expect(messageForFetchFailure(400, '')).toBe(
      'That sheet or tab does not exist. Check the link.',
    );
  });
});
