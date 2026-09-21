import { describe, it, expect } from 'vitest';
import { parseDelimited, detectDelimiter } from '../src/delimited.js';

describe('parseDelimited', () => {
  it('splits a simple row', () => {
    expect(parseDelimited('a,b,c', ',')).toEqual([['a', 'b', 'c']]);
  });

  it('splits multiple rows', () => {
    expect(parseDelimited('a,b\nc,d', ',')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('keeps a delimiter inside quotes', () => {
    expect(parseDelimited('"a,b",c', ',')).toEqual([['a,b', 'c']]);
  });

  it('keeps a newline inside quotes', () => {
    expect(parseDelimited('"line one\nline two",next', ',')).toEqual([
      ['line one\nline two', 'next'],
    ]);
  });

  it('unescapes a doubled quote', () => {
    expect(parseDelimited('"she said ""hi""",b', ',')).toEqual([
      ['she said "hi"', 'b'],
    ]);
  });

  it('handles CRLF row endings', () => {
    expect(parseDelimited('a,b\r\nc,d', ',')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('handles a lone CR row ending', () => {
    expect(parseDelimited('a,b\rc,d', ',')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('ignores a trailing newline', () => {
    expect(parseDelimited('a,b\n', ',')).toEqual([['a', 'b']]);
  });

  it('keeps empty fields', () => {
    expect(parseDelimited('a,,c', ',')).toEqual([['a', '', 'c']]);
  });

  it('handles a single column', () => {
    expect(parseDelimited('a\nb', ',')).toEqual([['a'], ['b']]);
  });

  it('closes an unbalanced quote at end of input', () => {
    expect(parseDelimited('"unterminated', ',')).toEqual([['unterminated']]);
  });

  it('parses tab-separated clipboard content', () => {
    const clipboard = 'Name\tAnswer\nDana\t"First para.\n\nSecond para."';
    expect(parseDelimited(clipboard, '\t')).toEqual([
      ['Name', 'Answer'],
      ['Dana', 'First para.\n\nSecond para.'],
    ]);
  });
});

describe('detectDelimiter', () => {
  it('detects tabs from clipboard content', () => {
    expect(detectDelimiter('Name\tAnswer\nDana\tHello')).toBe('\t');
  });

  it('detects commas from export content', () => {
    expect(detectDelimiter('Name,Answer\r\nDana,Hello')).toBe(',');
  });

  it('ignores commas inside a quoted first field', () => {
    expect(detectDelimiter('"a,b,c,d"\tsecond')).toBe('\t');
  });

  it('defaults to tab when neither a tab nor a comma appears, so a single column of prose is not split on commas inside the text', () => {
    expect(detectDelimiter('What did you learn?')).toBe('\t');
  });
});
