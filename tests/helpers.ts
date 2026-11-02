import { expect, type Page } from '@playwright/test';

/** Open the app and wait for the donor chat. */
export async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Grants assistant' })).toBeVisible();
}

/** Wait until the assistant has finished its turn. */
export async function waitForAssistant(page: Page) {
  await expect(page.getByRole('status', { name: 'Assistant is working' })).toHaveCount(0, { timeout: 15_000 });
}

export async function ask(page: Page, text: string) {
  await page.getByLabel('Message the grants assistant').fill(text);
  await page.keyboard.press('Enter');
  await waitForAssistant(page);
}

export async function tapSuggestion(page: Page, label: string) {
  await page.locator('.chips').getByRole('button', { name: label, exact: true }).click();
  await waitForAssistant(page);
}

export async function goTo(page: Page, view: 'Donor chat' | 'Rep console' | 'Audit log' | 'Accessibility') {
  await page.getByRole('navigation', { name: 'Views' }).getByRole('button', { name: new RegExp(`^${view}`) }).click();
}
