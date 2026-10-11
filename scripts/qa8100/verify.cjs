const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.QA_OUTPUT || '/tmp/ccswitch-8100-browser-results';
const origin = process.env.QA_ORIGIN || 'http://127.0.0.1:38100';
fs.mkdirSync(output, { recursive: true });
const results = [];
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [{ width: 800, height: 600 }, { width: 1920, height: 1080 }]) {
      for (const variant of ['before', 'after']) {
        const context = await browser.newContext({ viewport, locale: 'en-US' });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${origin}/qa8100${variant === 'before' ? '-before' : ''}.html`);
        await page.getByRole('button', { name: 'Search', exact: true }).click();
        const input = page.getByRole('textbox', { name: 'Search providers', exact: true });
        await input.waitFor();
        for (const search of ['My', 'Alpha']) {
          await input.fill(search);
          // Wait for the real component's 180ms enter animation to settle.
          await page.waitForTimeout(250);
          const edit = page.getByRole('button', { name: 'Edit My Alpha', exact: true });
          await edit.waitFor();
          const geometry = await page.evaluate(() => {
            const input = document.querySelector('input');
            const panel = input.parentElement.parentElement.parentElement;
            const buttons = [...document.querySelectorAll('button')];
            const rect = element => {
              const { x, y, width, height, top, bottom, left, right } = element.getBoundingClientRect();
              return { x, y, width, height, top, bottom, left, right };
            };
            const p = rect(panel);
            const actions = ['Edit My Alpha', 'More actions for My Alpha'].map(label => {
              const button = buttons.find(button => button.getAttribute('aria-label') === label);
              const b = rect(button);
              const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
              return { label, rect: b, overlap: p.left < b.right && p.right > b.left && p.top < b.bottom && p.bottom > b.top, clickable: button.contains(hit) };
            });
            const inputRect = rect(input);
            const close = rect(buttons.find(button => button.getAttribute('aria-label') === 'Close provider search'));
            const inputHit = document.elementFromPoint(inputRect.left + 24, inputRect.top + inputRect.height / 2);
            return { panel: p, input: inputRect, close, inputClickable: inputHit === input, position: getComputedStyle(panel).position, actions };
          });
          results.push({ viewport, variant, search, geometry });
          await page.screenshot({ path: path.join(output, `${variant}-${viewport.width}-${search}.png`) });
          if (variant === 'before') {
            assert.equal(geometry.position, 'fixed');
            assert(geometry.actions.every(action => action.overlap && !action.clickable), 'Baseline must reproduce overlapping, blocked card actions');
          } else {
            assert(geometry.actions.every(action => !action.overlap && action.clickable), 'Search must not cover card actions');
            assert(geometry.panel.left >= 0 && geometry.panel.right <= viewport.width, 'Panel must fit viewport');
            assert(geometry.input.width >= 200 && geometry.input.right <= geometry.close.left, 'Search input must retain usable width beside the close button');
            assert(geometry.inputClickable, 'Search input must remain directly clickable');
            await edit.click();
            assert.equal(await page.locator('body').getAttribute('data-edited'), '0');
            await page.getByRole('button', { name: 'More actions for My Alpha', exact: true }).click();
            await page.getByRole('menu').waitFor();
            await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
          }
        }
        if (variant === 'after') {
          await input.fill('zzzz-no-result');
          await page.getByText('No providers match your search.', { exact: true }).waitFor();
          await page.keyboard.press('Escape');
          await input.waitFor({ state: 'detached' });
          assert.equal(await page.getByRole('button', { name: /^Edit My/ }).count(), 16);
          for (const shortcut of ['Control+f', 'Meta+f']) {
            await page.keyboard.press(shortcut);
            await input.waitFor();
            assert.equal(await input.inputValue(), 'zzzz-no-result');
            await page.getByRole('button', { name: 'Clear', exact: true }).click();
            assert.equal(await page.getByRole('button', { name: /^Edit My/ }).count(), 16);
            await input.fill('zzzz-no-result');
            await page.getByRole('button', { name: 'Close provider search', exact: true }).click();
            await input.waitFor({ state: 'detached' });
          }
          await page.locator('#main-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
          await page.keyboard.press('Control+f');
          await input.waitFor();
          await page.waitForTimeout(250);
          assert(await input.evaluate(element => document.activeElement === element));
          const box = await input.boundingBox();
          assert(box.y >= 100 && box.y + box.height <= viewport.height, 'Opening search while scrolled must reveal the input');
        }
        assert.deepEqual(errors, [], 'No browser runtime errors');
        await context.close();
      }
    }
    console.log(JSON.stringify({ passed: true, cases: results.length, output }));
  } finally {
    fs.writeFileSync(path.join(output, 'geometry.json'), JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
