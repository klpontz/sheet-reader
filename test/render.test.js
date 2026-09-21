import { describe, it, expect, beforeEach } from 'vitest';
import { linkify, renderCards, RENDER_CAP } from '../src/render.js';

function textOf(node) {
  return node.textContent;
}

describe('linkify', () => {
  it('leaves plain text alone', () => {
    const frag = linkify('no links here');
    expect(frag.querySelectorAll('a')).toHaveLength(0);
    expect(textOf(frag)).toBe('no links here');
  });

  it('turns a bare URL into a link', () => {
    const frag = linkify('https://example.com');
    const links = frag.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://example.com');
    expect(links[0].textContent).toBe('https://example.com');
  });

  it('links a URL inside a sentence and keeps the surrounding text', () => {
    const frag = linkify('see https://example.com now');
    expect(frag.querySelectorAll('a')).toHaveLength(1);
    expect(textOf(frag)).toBe('see https://example.com now');
  });

  it('excludes trailing sentence punctuation from the link', () => {
    const frag = linkify('go to https://example.com.');
    expect(frag.querySelector('a').getAttribute('href')).toBe('https://example.com');
    expect(textOf(frag)).toBe('go to https://example.com.');
  });

  it('links more than one URL', () => {
    const frag = linkify('https://a.com and https://b.com');
    expect(frag.querySelectorAll('a')).toHaveLength(2);
  });

  it('adds rel and target to links', () => {
    const link = linkify('https://example.com').querySelector('a');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('treats markup as literal text', () => {
    const frag = linkify('<script>alert(1)</script>');
    expect(frag.querySelectorAll('script')).toHaveLength(0);
    expect(textOf(frag)).toBe('<script>alert(1)</script>');
  });
});

describe('renderCards', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('renders one card per record', () => {
    renderCards(
      [
        { index: 1, fields: [{ label: 'Name', value: 'Dana' }] },
        { index: 2, fields: [{ label: 'Name', value: 'Sam' }] },
      ],
      container,
      2,
    );
    expect(container.querySelectorAll('.card')).toHaveLength(2);
  });

  it('replaces previous content on a second render', () => {
    const records = [{ index: 1, fields: [{ label: 'Name', value: 'Dana' }] }];
    renderCards(records, container, 1);
    renderCards(records, container, 1);
    expect(container.querySelectorAll('.card')).toHaveLength(1);
  });

  it('renders a label and a value for each field', () => {
    renderCards(
      [{ index: 1, fields: [{ label: 'Name', value: 'Dana' }] }],
      container,
      1,
    );
    expect(container.querySelector('.label').textContent).toBe('Name');
    expect(container.querySelector('.value').textContent).toBe('Dana');
  });

  it('shows the record position against the total', () => {
    renderCards(
      [{ index: 3, fields: [{ label: 'Name', value: 'Dana' }] }],
      container,
      47,
    );
    expect(container.querySelector('.card-index').textContent).toBe('Response 3 of 47');
  });

  it('splits a value on newlines into paragraphs', () => {
    renderCards(
      [{ index: 1, fields: [{ label: 'A', value: 'one\n\ntwo' }] }],
      container,
      1,
    );
    expect(container.querySelectorAll('.value p')).toHaveLength(2);
  });

  it('marks values with dir auto', () => {
    renderCards(
      [{ index: 1, fields: [{ label: 'A', value: 'مرحبا' }] }],
      container,
      1,
    );
    expect(container.querySelector('.value p').getAttribute('dir')).toBe('auto');
  });

  it('never turns a cell into markup', () => {
    renderCards(
      [{ index: 1, fields: [{ label: 'A', value: '<img src=x onerror=alert(1)>' }] }],
      container,
      1,
    );
    expect(container.querySelectorAll('img')).toHaveLength(0);
    expect(container.querySelector('.value').textContent)
      .toBe('<img src=x onerror=alert(1)>');
  });

  it('never turns a label into markup', () => {
    renderCards(
      [{ index: 1, fields: [{ label: '<b>bold</b>', value: 'x' }] }],
      container,
      1,
    );
    expect(container.querySelectorAll('b')).toHaveLength(0);
  });

  it('links a URL inside a value', () => {
    renderCards(
      [{ index: 1, fields: [{ label: 'A', value: 'see https://example.com' }] }],
      container,
      1,
    );
    expect(container.querySelectorAll('.value a')).toHaveLength(1);
  });

  it('caps rendering and says so', () => {
    const records = Array.from({ length: RENDER_CAP + 5 }, (_, i) => ({
      index: i + 1,
      fields: [{ label: 'A', value: String(i) }],
    }));
    renderCards(records, container, records.length);
    expect(container.querySelectorAll('.card')).toHaveLength(RENDER_CAP);
    expect(container.querySelector('.cap-notice')).not.toBeNull();
  });

  it('shows an empty-state message when there is nothing to render', () => {
    renderCards([], container, 0);
    expect(container.querySelector('.empty')).not.toBeNull();
    expect(container.querySelectorAll('.card')).toHaveLength(0);
  });
});
