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
    expect(links[0].textContent).toBe('example.com');
  });

  it('links a URL inside a sentence and keeps the surrounding text', () => {
    const frag = linkify('see https://example.com now');
    expect(frag.querySelectorAll('a')).toHaveLength(1);
    expect(textOf(frag)).toBe('see example.com now');
  });

  it('excludes trailing sentence punctuation from the link', () => {
    const frag = linkify('go to https://example.com.');
    expect(frag.querySelector('a').getAttribute('href')).toBe('https://example.com');
    expect(textOf(frag)).toBe('go to example.com.');
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

describe('compact grouping of short fields', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
  });

  const short = (label, value) => ({ label, value });
  const longValue = 'x'.repeat(200);

  it('groups consecutive short fields into one compact block', () => {
    renderCards(
      [{ index: 1, fields: [short('A', '78'), short('B', '1a08b155'), short('C', '9/10/2026')] }],
      container,
      1,
    );
    const groups = container.querySelectorAll('.compact');
    expect(groups).toHaveLength(1);
    expect(groups[0].querySelectorAll('.field')).toHaveLength(3);
  });

  it('leaves a long value outside the compact block, at full width', () => {
    renderCards(
      [{ index: 1, fields: [short('A', '78'), short('B', '79'), short('Body', longValue)] }],
      container,
      1,
    );
    expect(container.querySelectorAll('.compact')).toHaveLength(1);
    expect(container.querySelectorAll('.compact .field')).toHaveLength(2);
    const full = container.querySelectorAll('.card > .field');
    expect(full).toHaveLength(1);
    expect(full[0].querySelector('.label').textContent).toBe('Body');
  });

  it('treats a multi-line value as long even when it is short', () => {
    renderCards(
      [{ index: 1, fields: [short('A', 'one\ntwo')] }],
      container,
      1,
    );
    expect(container.querySelectorAll('.compact')).toHaveLength(0);
    expect(container.querySelectorAll('.card > .field')).toHaveLength(1);
  });

  it('starts a new compact block after a long field', () => {
    renderCards(
      [{
        index: 1,
        fields: [
          short('A', '1'), short('B', '2'),
          short('Body', longValue),
          short('C', '3'), short('D', '4'),
        ],
      }],
      container,
      1,
    );
    expect(container.querySelectorAll('.compact')).toHaveLength(2);
  });

  it('does not wrap a lone short field in a compact block', () => {
    renderCards(
      [{ index: 1, fields: [short('A', '78')] }],
      container,
      1,
    );
    expect(container.querySelectorAll('.compact')).toHaveLength(0);
    expect(container.querySelectorAll('.card > .field')).toHaveLength(1);
  });

  it('still renders every field exactly once regardless of grouping', () => {
    renderCards(
      [{ index: 1, fields: [short('A', '1'), short('B', '2'), short('Body', longValue)] }],
      container,
      1,
    );
    expect(container.querySelectorAll('.field')).toHaveLength(3);
  });

  it('renders a value with no line breaks and no horizontal overflow risk', () => {
    const token = 'a'.repeat(120);
    renderCards([{ index: 1, fields: [short('ID', token)] }], container, 1);
    expect(container.querySelector('.value').textContent).toBe(token);
  });
});

describe('paragraphs and line breaks', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
  });

  const render = (value) =>
    renderCards([{ index: 1, fields: [{ label: 'A', value }] }], container, 1);

  it('keeps single newlines inside one paragraph as line breaks', () => {
    render('as she will be\nable to answer that');
    const paragraphs = container.querySelectorAll('.value p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].querySelectorAll('br')).toHaveLength(1);
  });

  it('starts a new paragraph at a blank line', () => {
    render('Hi Eileen,\n\nThanks for reaching out!\nMore\n\nBest');
    expect(container.querySelectorAll('.value p')).toHaveLength(3);
  });

  it('treats whitespace-only lines as blank and handles CRLF', () => {
    render('one\r\n  \r\ntwo\r\nthree');
    const paragraphs = container.querySelectorAll('.value p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[1].querySelectorAll('br')).toHaveLength(1);
  });

  it('keeps links working across line breaks', () => {
    render('first\nhttps://example.com');
    expect(container.querySelectorAll('.value a')).toHaveLength(1);
  });
});

describe('short link text', () => {
  it('drops the scheme from a short URL', () => {
    const link = linkify('https://example.com/a').querySelector('a');
    expect(link.textContent).toBe('example.com/a');
    expect(link.getAttribute('href')).toBe('https://example.com/a');
  });

  it('drops the query and shortens a long path in the middle', () => {
    const url =
      'https://docs.google.com/document/d/1Anz8bzvMk2Nium0z1vmi3G8bcSaGp7ux/edit?usp=drivesdk&ouid=1';
    const link = linkify(url).querySelector('a');
    expect(link.getAttribute('href')).toBe(url);
    expect(link.getAttribute('title')).toBe(url);
    expect(link.textContent.startsWith('docs.google.com/document/')).toBe(true);
    expect(link.textContent.endsWith('/edit')).toBe(true);
    expect(link.textContent).toContain('…');
    expect(link.textContent.length).toBeLessThanOrEqual(48);
  });

  it('keeps the full text of the value outside the link', () => {
    const frag = linkify('see https://example.com now');
    expect(frag.textContent).toBe('see example.com now');
  });
});

describe('collapsing tall fields', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
  });

  const tall = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');

  it('collapses a tall field and offers a Show more button', () => {
    renderCards([{ index: 1, fields: [{ label: 'Thread', value: tall }] }], container, 1);
    const field = container.querySelector('.field');
    expect(field.classList.contains('collapsed')).toBe(true);
    const button = field.querySelector('button.more');
    expect(button.textContent).toBe('Show more');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('expands and collapses again on click', () => {
    renderCards([{ index: 1, fields: [{ label: 'Thread', value: tall }] }], container, 1);
    const field = container.querySelector('.field');
    const button = field.querySelector('button.more');
    button.click();
    expect(field.classList.contains('collapsed')).toBe(false);
    expect(button.textContent).toBe('Show less');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    button.click();
    expect(field.classList.contains('collapsed')).toBe(true);
  });

  it('treats one very long line as tall', () => {
    const wall = 'word '.repeat(400);
    renderCards([{ index: 1, fields: [{ label: 'A', value: wall }] }], container, 1);
    expect(container.querySelector('.field.collapsed')).not.toBeNull();
  });

  it('leaves a short field alone', () => {
    renderCards([{ index: 1, fields: [{ label: 'A', value: 'Hello,\n\nThanks' }] }], container, 1);
    expect(container.querySelector('.collapsed')).toBeNull();
    expect(container.querySelector('button.more')).toBeNull();
  });
});
