import { expect, test } from '@playwright/test';
import { ask, goTo, openApp, tapSuggestion, waitForAssistant } from './helpers';

test.beforeEach(async ({ page }) => openApp(page));

test('why-pending question → grant picker → grounded status card with a policy citation', async ({ page }) => {
  await tapSuggestion(page, 'Why is my grant pending?');
  const picker = page.locator('.picker');
  await expect(picker).toContainText('pending grants');
  await picker.getByRole('button').first().click();
  await waitForAssistant(page);

  const card = page.locator('.mcard').filter({ has: page.getByRole('list', { name: 'Grant progress' }) }).last();
  await expect(card).toContainText('Place in queue');
  await expect(card).toContainText('Estimated completion');
  await expect(card.getByRole('button', { name: /Grant policy/ })).toBeVisible();
  // Dates use the shared formatter, never raw ISO strings.
  await expect(card).not.toContainText(/\d{4}-\d{2}-\d{2}/);
});

test('expedite request escalates, books a callback and shows up in the rep console', async ({ page }) => {
  await tapSuggestion(page, 'Why is my grant pending?');
  await page.locator('.picker').getByRole('button').first().click();
  await waitForAssistant(page);
  await ask(page, 'Can this be sped up?');

  await expect(page.getByText(/Request sent to our .* team/)).toBeVisible();
  await page.locator('.slot').first().click();
  await waitForAssistant(page);
  await expect(page.getByText('Callback scheduled')).toBeVisible();

  await page.getByRole('button', { name: 'See what the rep sees →' }).last().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Schroeder Foundation');
  await expect(page.getByText('Asked to expedite a grant in review').first()).toBeVisible();
  await page.getByRole('tab', { name: /Tool log/ }).click();
  await expect(page.getByRole('region', { name: 'Tool log' })).toContainText('create_service_request');
});

test('a grant ID in free text is answered as a status question', async ({ page }) => {
  await ask(page, 'What is the status of GR-5053?');
  await expect(page.locator('.mcard').last()).toContainText('Grant GR-5053');
});

test('when every grant source is down the assistant refuses to guess and hands off', async ({ page }) => {
  await page.getByRole('button', { name: 'All sources down' }).click();
  await ask(page, 'Where is my Wright grant?');
  await expect(page.getByRole('alert')).toContainText('can’t reach our grant systems');
  await expect(page.getByText(/Request sent to our .* team/)).toBeVisible();
});

test('a family member cannot see grant details', async ({ page }) => {
  await page.getByRole('button', { name: 'Family member' }).click();
  await tapSuggestion(page, 'Where’s my grant?');
  await expect(page.getByText('You don’t have access to grant details')).toBeVisible();
});

test('out-of-scope questions are handed off, not answered', async ({ page }) => {
  await tapSuggestion(page, 'Where’s my contribution?');
  await expect(page.locator('.bubble-agent').last()).toContainText('I can only help with grant questions right now');
});

test('every agent action is written to the audit log', async ({ page }) => {
  await tapSuggestion(page, 'Show all my grants');
  await goTo(page, 'Audit log');
  await page.getByLabel('This session only').check();
  await expect(page.getByRole('region', { name: 'Audit log rows' })).toContainText('get_grant_status');
});
