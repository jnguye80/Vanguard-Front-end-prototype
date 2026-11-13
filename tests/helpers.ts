import { expect, type Page } from '@playwright/test';

/** Open the app (chat channel) and wait for it to render. */
export async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Grants assistant · chat' })).toBeVisible();
}

/** Wait until the assistant has finished its turn. */
export async function waitForAssistant(page: Page) {
  await expect(page.getByRole('status', { name: 'Assistant is working' })).toHaveCount(0, { timeout: 15_000 });
}

// ---------------------------------------------------------------- chat

export async function ask(page: Page, text: string) {
  await page.getByLabel('Message the grants assistant').fill(text);
  await page.keyboard.press('Enter');
  await waitForAssistant(page);
}

/** Sign in to chat with a (fictional) sample donor ID. */
export async function signIn(page: Page, donorId = 'D-01') {
  await ask(page, donorId);
  await expect(page.locator('.bubble-agent').filter({ hasText: 'You’re signed in to' })).toBeVisible();
}

export async function tapSuggestion(page: Page, label: string) {
  await page.locator('.chips').getByRole('button', { name: label, exact: true }).click();
  await waitForAssistant(page);
}

// ---------------------------------------------------------------- voice

export async function startCall(page: Page) {
  await page.getByRole('group', { name: 'Channel' }).getByRole('button', { name: 'Voice call' }).click();
  await page.getByRole('button', { name: 'Start call' }).click();
  await expect(page.getByLabel('Call captions')).toContainText('Thanks for calling');
}

/** Press keys on the call keypad, e.g. "01#". */
export async function keypad(page: Page, keys: string) {
  const pad = page.getByRole('group', { name: 'Phone keypad' });
  for (const k of keys) {
    await pad.getByRole('button', { name: k === '#' ? 'Pound' : k === '*' ? 'Star (clear)' : k, exact: true }).click();
  }
  await waitForAssistant(page);
}

/** Verify on a call: donor ID then PIN, both on the keypad. */
export async function verifyCall(page: Page, id = '01', pin = '1111') {
  await keypad(page, `${id}#`);
  await expect(page.getByLabel('Call captions')).toContainText('enter your four-digit PIN');
  await keypad(page, `${pin}#`);
  await expect(page.getByLabel('Call captions')).toContainText('You’re verified for the');
}

/** "Say" something on the call by typing it. */
export async function say(page: Page, text: string) {
  await page.getByLabel('Or type what you’d say').fill(text);
  await page.getByRole('button', { name: 'Say it' }).click();
  await waitForAssistant(page);
}

export const flowStep = (page: Page, title: string) => page.locator('.flow-step').filter({ has: page.locator('.flow-title', { hasText: title }) });

export async function goTo(page: Page, view: 'Donor assistant' | 'Rep console') {
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: new RegExp(`^${view}`) }).click();
}
