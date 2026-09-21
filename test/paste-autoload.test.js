import { describe, it, expect, beforeEach, vi } from 'vitest';

// Finding 6: pasting into #input must auto-load, the same way dropping a
// file does. start() only wires listeners if #load exists at import time,
// so the DOM must be in place before src/main.js is imported.
describe('paste on #input auto-loads (finding 6)', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = `
      <textarea id="input"></textarea>
      <button id="load" type="button"></button>
      <select id="header-row"></select>
      <input id="filter" type="search" />
      <button id="clear" type="button"></button>
      <p id="status"></p>
      <p id="count"></p>
      <main id="cards"></main>
    `;
  });

  it('loads the pasted cells without requiring a click on Read', async () => {
    vi.useFakeTimers();
    await import('../src/main.js');

    const input = document.getElementById('input');
    input.value = 'Name\tAnswer\nDana\tHello';
    input.dispatchEvent(new Event('paste', { bubbles: true }));

    // Deferred so the pasted text has landed in the value first.
    vi.runAllTimers();

    expect(document.getElementById('status').textContent).toBe('');
    expect(document.querySelectorAll('#cards .card').length).toBe(1);
    vi.useRealTimers();
  });
});
