// WCAG 2.1 Level A and AA checks: axe-core on both channels in light and dark, plus keyboard and reflow
// checks that automated rules can't cover.

import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { goTo, openApp, signIn, startCall, tapSuggestion, verifyCall, waitForAssistant } from './helpers';

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

    test('chat (sign-in, status card, hand-off, contract)', async ({ page }) => {
      await openApp(page);
      expect(await axeViolations(page)).toEqual([]);
      await signIn(page, 'D-01');
      await tapSuggestion(page, 'Why is my grant pending?');
      await page.locator('.picker button').first().click();
      await waitForAssistant(page);
      await page.getByRole('button', { name: /Grant policy/ }).first().click();
      await tapSuggestion(page, 'Talk to a person');
      await page.getByRole('button', { name: 'Show the Q&A contract (JSON)' }).click();
      expect(await axeViolations(page)).toEqual([]);
      await page.getByRole('button', { name: 'See what the rep sees →' }).click();
      expect(await axeViolations(page)).toEqual([]);
      await page.getByRole('tab', { name: /Transcript/ }).click();
      await page.getByRole('button', { name: 'Reply', exact: true }).click();
      expect(await axeViolations(page)).toEqual([]);
    });

    test('voice (start screen, verified call, numbered choices)', async ({ page }) => {
      await openApp(page);
      await page.getByRole('group', { name: 'Channel' }).getByRole('button', { name: 'Voice call' }).click();
      expect(await axeViolations(page)).toEqual([]);
      await startCall(page);
      await verifyCall(page);
      await page.getByRole('button', { name: 'Say “Why is my grant pending?”' }).click();
      await waitForAssistant(page);
      expect(await axeViolations(page)).toEqual([]);
    });
  });
}

test('skip link is the first stop and moves focus to main content (2.4.1)', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('page title names the view and channel (2.4.2)', async ({ page }) => {
  await openApp(page);
  await expect(page).toHaveTitle(/^Chat · /);
  await page.getByRole('group', { name: 'Channel' }).getByRole('button', { name: 'Voice call' }).click();
  await expect(page).toHaveTitle(/^Voice call · /);
  await goTo(page, 'Rep console');
  await expect(page).toHaveTitle(/^Rep console · /);
});

test('rep console tabs work with arrow keys (2.1.1)', async ({ page }) => {
  await openApp(page);
  await goTo(page, 'Rep console');
  await page.getByRole('tab', { name: 'Summary' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Transcript/ })).toBeFocused();
  await expect(page.getByRole('tab', { name: /Transcript/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(page.getByRole('tab', { name: 'Summary' })).toBeFocused();
});

test('focus returns to the message box after a suggestion is used (2.4.3)', async ({ page }) => {
  await openApp(page);
  await signIn(page, 'D-01');
  await page.locator('.chips').getByRole('button', { name: 'Where’s my grant?' }).focus();
  await page.keyboard.press('Enter');
  await waitForAssistant(page);
  await expect(page.getByLabel('Message the grants assistant')).toBeFocused();
});

test('the whole call works from the keyboard (2.1.1)', async ({ page }) => {
  await openApp(page);
  await page.getByRole('group', { name: 'Channel' }).getByRole('button', { name: 'Voice call' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Start call' }).focus();
  await page.keyboard.press('Enter');
  const pad = page.getByRole('group', { name: 'Phone keypad' });
  for (const k of ['0', '1', 'Pound']) { await pad.getByRole('button', { name: k, exact: true }).focus(); await page.keyboard.press('Enter'); }
  await waitForAssistant(page);
  await expect(page.getByLabel('Call captions')).toContainText('enter your four-digit PIN');
});

test('no horizontal scrolling at 320 CSS px (1.4.10)', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await openApp(page);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await signIn(page, 'D-01');
  await tapSuggestion(page, 'Show all my grants');
  expect(await overflow()).toBeLessThanOrEqual(0);
  await startCall(page);
  await verifyCall(page);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await goTo(page, 'Rep console');
  expect(await overflow()).toBeLessThanOrEqual(0);
});
