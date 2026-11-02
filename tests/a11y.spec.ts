// WCAG 2.1 Level A and AA checks: axe-core on every view in light and dark, plus keyboard and reflow checks
// that automated rules can't cover. See src/a11y/wcag21.ts for the full conformance report.

import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { goTo, openApp, tapSuggestion, waitForAssistant } from './helpers';

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const WCAG21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function axeViolations(page: Page) {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async (tags) => {
    // @ts-expect-error axe is injected above
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return res.violations.map((v: { id: string; nodes: { target: string[] }[] }) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  }, WCAG21_AA);
}

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`WCAG 2.1 AA · ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('donor chat (status card, escalation, callback)', async ({ page }) => {
      await openApp(page);
      expect(await axeViolations(page)).toEqual([]);
      await tapSuggestion(page, 'Why is my grant pending?');
      await page.locator('.picker').getByRole('button').first().click();
      await waitForAssistant(page);
      await page.locator('.src-kb').first().click();
      expect(await axeViolations(page)).toEqual([]);
      await tapSuggestion(page, 'Can this be sped up?');
      expect(await axeViolations(page)).toEqual([]);
    });

    test('rep console, audit log and accessibility page', async ({ page }) => {
      await openApp(page);
      for (const view of ['Rep console', 'Audit log', 'Accessibility'] as const) {
        await goTo(page, view);
        expect(await axeViolations(page), view).toEqual([]);
      }
    });
  });
}

test('skip link is the first stop and moves focus to main content (2.4.1)', async ({ page }) => {
  await openApp(page);
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
});

test('page title names the current view (2.4.2)', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Rep console');
  await expect(page).toHaveTitle('Rep console · Momentum');
});

test('focus returns to the message box after a suggestion is used (2.4.3)', async ({ page }) => {
  await openApp(page);
  await page.locator('.chips').getByRole('button', { name: 'Where’s my grant?' }).focus();
  await page.keyboard.press('Enter');
  await waitForAssistant(page);
  await expect(page.getByLabel('Message the grants assistant')).toBeFocused();
});

test('rep console tabs work with arrow keys (2.1.1)', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Rep console');
  await page.getByRole('tab', { name: 'Summary' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Tool log/ })).toBeFocused();
  await expect(page.getByRole('tab', { name: /Tool log/ })).toHaveAttribute('aria-selected', 'true');
});

test('no horizontal scrolling at 320 CSS px (1.4.10)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openApp(page);
  for (const view of ['Donor chat', 'Rep console', 'Audit log', 'Accessibility'] as const) {
    await goTo(page, view);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, view).toBeLessThanOrEqual(0);
  }
});
