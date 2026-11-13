import { expect, test } from '@playwright/test';
import { ask, flowStep, goTo, keypad, openApp, say, signIn, startCall, tapSuggestion, verifyCall, waitForAssistant } from './helpers';

test.beforeEach(async ({ page }) => openApp(page));

const journeyStep = (page: import('@playwright/test').Page, label: string) =>
  page.getByRole('list', { name: 'Donor journey' }).getByRole('listitem').filter({ hasText: label });

test.describe('donor and journey', () => {
  test('chat: the donor is highlighted once verified and the journey moves step by step', async ({ page }) => {
    const card = page.locator('.donor-card');
    await expect(card).toContainText('Not verified yet');
    await expect(card).not.toHaveClass(/verified/);
    await expect(journeyStep(page, 'Verifies identity')).toHaveAttribute('aria-current', 'step');
    await signIn(page, 'D-01');
    await expect(card).toHaveClass(/verified/);
    await expect(card).toContainText('Jordan Avery');
    await expect(card).toContainText('Verified in chat (donor ID)');
    await expect(journeyStep(page, 'Asks about a grant')).toHaveAttribute('aria-current', 'step');
    await ask(page, 'Has the Harbor Animal Rescue grant been paid?');
    await expect(journeyStep(page, 'Gets help')).toContainText('Answered from their grant records');
    await expect(page.getByRole('list', { name: 'Donor journey' }).locator('[aria-current="step"]')).toHaveCount(0);
  });

  test('voice: caller → verified donor → transferred to a person', async ({ page }) => {
    await startCall(page);
    await expect(page.locator('.donor-card')).toContainText('Unknown caller');
    await keypad(page, '02#');
    await expect(page.locator('.donor-card')).toContainText('Donor ID D-02 entered · PIN needed');
    await keypad(page, '2222#');
    await expect(page.locator('.donor-card')).toContainText('Priya Shah');
    await expect(page.locator('.donor-card')).toContainText('Verified by phone (donor ID + PIN)');
    await say(page, 'Can I talk to a person?');
    await expect(journeyStep(page, 'Gets a person')).toContainText('Transferred to');
  });

  test('a locked sign-in marks verification as stopped; general questions only', async ({ page }) => {
    for (const id of ['D-97', 'D-98', 'D-99']) await ask(page, id);
    await expect(page.locator('.donor-card')).toContainText('Couldn’t verify');
    await expect(journeyStep(page, 'Not verified')).toContainText('Locked after 3 tries · general questions only');
    await expect(journeyStep(page, 'Asks a general question')).toHaveAttribute('aria-current', 'step');
  });
});

test.describe('chat', () => {
  test('asks for a donor ID first; flow panel shows authentication then authorization', async ({ page }) => {
    await expect(page.locator('.bubble-agent').first()).toContainText('please enter your donor ID');
    await expect(flowStep(page, 'Authentication')).toContainText('Not verified');
    await signIn(page, 'D-01');
    await expect(flowStep(page, 'Authentication')).toContainText('Verified · D-01');
    await expect(flowStep(page, 'Authorization')).toContainText('Session limited to grants on D-01');
  });

  test('a question asked before sign-in is answered right after', async ({ page }) => {
    await ask(page, 'Why is my grant pending?');
    await expect(page.locator('.bubble-agent').last()).toContainText('First, please enter your donor ID');
    await ask(page, 'my id is d-01');
    await expect(page.locator('.picker')).toContainText('pending grants');
  });

  test('an unknown donor ID is refused, and three misses lock sign-in', async ({ page }) => {
    await ask(page, 'D-99');
    await expect(page.locator('.bubble-agent').last()).toContainText('I couldn’t find donor ID D-99');
    await ask(page, 'D-98');
    await ask(page, 'D-97');
    await expect(page.getByText('I couldn’t verify your identity')).toBeVisible();
    await expect(flowStep(page, 'Authentication')).toContainText('Locked');
  });

  test('authorization: another donor’s grant is blocked and never looked up', async ({ page }) => {
    await signIn(page, 'D-01');
    await ask(page, 'What is the status of G-2001?');
    await expect(page.locator('.bubble-agent').last()).toContainText('I can only share grants on your account');
    await expect(flowStep(page, 'Authorization')).toContainText('Blocked');
    await expect(flowStep(page, 'Authorization')).toContainText('G-2001 is not on D-01’s account');
    await expect(page.locator('body')).not.toContainText('Eastside Youth Soccer League');
  });

  test('authorization: a suspended account gets no grant details', async ({ page }) => {
    await signIn(page, 'D-04');
    await tapSuggestion(page, 'Where’s my grant?');
    await expect(page.getByText('Your account is suspended')).toBeVisible();
    await expect(flowStep(page, 'Authorization')).toContainText('Blocked');
  });

  test('grounded answer: picker → status card with policy citation, sources in the flow panel', async ({ page }) => {
    await signIn(page, 'D-01');
    await tapSuggestion(page, 'Why is my grant pending?');
    await page.locator('.picker').getByRole('button', { name: /Riverbend Community Health Clinic/ }).click();
    await waitForAssistant(page);
    const card = page.locator('.mcard').filter({ has: page.getByRole('list', { name: 'Grant progress' }) }).last();
    await expect(card).toContainText('#12 of 48');
    await expect(card.getByRole('button', { name: /Grant policy/ })).toBeVisible();
    await expect(flowStep(page, 'Answer')).toContainText('Grants agent › Due diligence');
    await expect(flowStep(page, 'Answer')).toContainText('Grant record G-1001');
  });

  test('hand-off: expedite opens a case', async ({ page }) => {
    await signIn(page, 'D-01');
    await ask(page, 'Why is the Riverbend grant pending?');
    await ask(page, 'Can this be sped up?');
    await expect(page.getByText(/Passed to our .* team/)).toBeVisible();
    await expect(flowStep(page, 'Answer')).toContainText('Handed to a person');
  });

  test('outside grants and planned toolsets get a generic reply', async ({ page }) => {
    await signIn(page, 'D-01');
    await ask(page, 'Can I get my tax receipt?');
    await expect(page.locator('.bubble-agent').last()).toContainText('For questions about tax receipts and statements, I can connect you with a person');
    await expect(flowStep(page, 'Answer')).toContainText('Generic reply');
    await ask(page, 'How do I submit a new grant?');
    await expect(page.locator('.bubble-agent').last()).toContainText('I can’t start, change or cancel grants in this chat yet');
    await expect(flowStep(page, 'Answer')).toContainText('Submissions (future)');
  });

  test('PII guardrail: removed before anything sees it, and never in the contract', async ({ page }) => {
    await signIn(page, 'D-01');
    await ask(page, 'My SSN is 123-45-6789 and card 4111 1111 1111 1111, where is my Riverbend grant?');
    await expect(page.locator('.bubble-user').last()).toHaveText('My SSN is [SSN removed] and card [card number removed], where is my Riverbend grant?');
    await expect(page.getByText('I removed personal information from your message')).toBeVisible();
    await expect(flowStep(page, 'Personal data guardrail')).toContainText('Removed: card number, Social Security number');
    await page.getByRole('button', { name: 'Show the Q&A contract (JSON)' }).click();
    const json = JSON.parse(await page.locator('#contract').innerText());
    expect(json.request.pii_removed).toEqual(['card number', 'Social Security number']);
    expect(JSON.stringify(json)).not.toContain('123-45-6789');
    await expect(page.locator('body')).not.toContainText('4111');
  });

  test('Q&A contract carries channel, session, routing and sources', async ({ page }) => {
    await signIn(page, 'D-01');
    await ask(page, 'Has the Harbor Animal Rescue grant been paid?');
    await page.getByRole('button', { name: 'Show the Q&A contract (JSON)' }).click();
    const json = JSON.parse(await page.locator('#contract').innerText());
    expect(json.request).toMatchObject({ channel: 'chat', session: { authenticated: true, method: 'donor_id', donor_id: 'D-01' } });
    expect(json.response).toMatchObject({ outcome: 'answered', authorization: { decision: 'allowed' }, routing: { agent: 'Grants agent', toolset: 'Disbursements' }, handoff: null });
    expect(json.response.sources).toContain('Grant record G-1003');
    expect(json.response.answer).toContain('Harbor Animal Rescue');
  });
});

test.describe('voice call', () => {
  test('verifies with donor ID and PIN on the keypad; the PIN is never shown', async ({ page }) => {
    await startCall(page);
    await keypad(page, '01#');
    await expect(flowStep(page, 'Authentication')).toContainText('PIN needed');
    await keypad(page, '11');
    await expect(page.getByLabel('Digits entered')).toHaveText('••');
    await keypad(page, '11#');
    await expect(page.getByLabel('Call captions')).toContainText('Thanks, Jordan. You’re verified for the Avery Family Giving Fund');
    await expect(page.getByLabel('Call captions')).toContainText('Keypad: ••••');
    await expect(page.getByLabel('Call captions')).not.toContainText('1111');
    await expect(flowStep(page, 'Authentication')).toContainText('Verified · D-01');
    await expect(flowStep(page, 'Authentication')).toContainText('Donor ID + PIN on the keypad');
  });

  test('a wrong PIN three times locks verification', async ({ page }) => {
    await startCall(page);
    await keypad(page, '01#');
    await keypad(page, '9999#');
    await expect(page.getByLabel('Call captions')).toContainText('That PIN didn’t match');
    await keypad(page, '9998#');
    await keypad(page, '9997#');
    await expect(page.getByLabel('Call captions')).toContainText('I’ve stopped trying');
    await expect(flowStep(page, 'Authentication')).toContainText('Locked');
  });

  test('lists are read as numbered choices; a key press picks one', async ({ page }) => {
    await startCall(page);
    await verifyCall(page);
    await page.getByRole('button', { name: 'Say “Why is my grant pending?”' }).click();
    await waitForAssistant(page);
    await expect(page.getByLabel('Call captions')).toContainText('Press 1 for Riverbend Community Health Clinic, $100,000. Press 2 for Cedar Hills Food Bank');
    await keypad(page, '2');
    await expect(page.getByLabel('Call captions')).toContainText('Cedar Hills Food Bank');
    await expect(flowStep(page, 'Answer')).toContainText('Answered');
  });

  test('a caller can answer “which one?” by name', async ({ page }) => {
    await startCall(page);
    await verifyCall(page);
    await say(page, 'Why is my grant pending?');
    await say(page, 'Riverbend');
    await expect(page.getByLabel('Call captions')).toContainText('#12 of 48');
  });

  test('a question before verifying waits, then is answered', async ({ page }) => {
    await startCall(page);
    await say(page, 'Has my Harbor Animal Rescue grant been paid?');
    await expect(page.getByLabel('Call captions')).toContainText('First, enter your donor ID on your keypad');
    await verifyCall(page);
    await expect(page.getByLabel('Call captions')).toContainText('Harbor Animal Rescue');
  });

  test('hand-off on a call is a transfer, with a case for the specialist', async ({ page }) => {
    await startCall(page);
    await verifyCall(page);
    await say(page, 'Can I talk to a person?');
    await expect(page.getByLabel('Call captions')).toContainText('I’m transferring you to our');
    await expect(page.getByText('Transferring you to a specialist')).toBeVisible();
    await expect(page.getByText('Connected to a specialist (simulated)')).toBeVisible({ timeout: 5000 });
    await expect(flowStep(page, 'Answer')).toContainText('Transferred to a person');
    await page.getByRole('button', { name: 'Hang up' }).click();
    await expect(page.getByRole('heading', { name: 'Call ended' })).toBeVisible();
  });

  test('authorization and PII work the same on a call', async ({ page }) => {
    await startCall(page);
    await verifyCall(page, '03', '3333');
    await say(page, 'My social is 123-45-6789. What about grant G-1001?');
    await expect(page.getByLabel('Call captions')).toContainText('My social is [SSN removed]');
    await expect(page.getByLabel('Call captions')).toContainText('I can only share grants on your account');
    await expect(flowStep(page, 'Authorization')).toContainText('Blocked');
    await expect(flowStep(page, 'Personal data guardrail')).toContainText('Social Security number');
  });
});

test.describe('rep console', () => {
  test('a chat hand-off becomes a case the rep can work, with no PII', async ({ page }) => {
    await signIn(page, 'D-01');
    await ask(page, 'My SSN is 123-45-6789. Why is the Riverbend grant pending?');
    await ask(page, 'Can this be sped up?');
    await page.getByRole('button', { name: 'See what the rep sees →' }).click();
    await expect(page).toHaveTitle(/^Rep console/);
    const header = page.locator('.detail .card').first();
    await expect(header).toContainText('Jordan Avery · Avery Family Giving Fund');
    await expect(header).toContainText('Chat · case');
    await expect(header).toContainText('Verified · D-01');
    await expect(page.getByRole('tabpanel')).toContainText('Asked to expedite a grant in review');
    await expect(page.getByRole('tabpanel')).toContainText('#12 of 48');
    await page.getByRole('tab', { name: /Transcript/ }).click();
    await expect(page.getByRole('tabpanel')).toContainText('[SSN removed]');
    await expect(page.locator('body')).not.toContainText('123-45-6789');

    await page.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(page.getByLabel('Reply to Jordan Avery')).toHaveValue(/Hi Jordan/);
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Dana (rep):');
    await page.getByRole('button', { name: 'Mark resolved' }).click();
    await expect(page.getByRole('navigation', { name: 'Views' })).toContainText('Rep console2');
  });

  test('a voice hand-off arrives as a transferred call; the PIN never appears', async ({ page }) => {
    await startCall(page);
    await verifyCall(page);
    await say(page, 'Can I talk to a person?');
    await page.getByRole('button', { name: 'See what the specialist sees →' }).click({ timeout: 6000 });
    const header = page.locator('.detail .card').first();
    await expect(header).toContainText('Voice · transferred call');
    await expect(page.getByRole('button', { name: 'Pick up transferred call' })).toBeVisible();
    await expect(page.getByRole('tabpanel')).toContainText('called the grants line');
    await page.getByRole('tab', { name: /Transcript/ }).click();
    await expect(page.getByRole('tabpanel')).toContainText('Caller: Keypad: ••••');
    await expect(page.getByRole('tabpanel')).not.toContainText('1111');
  });

  test('cases survive “Start over”; the queue filters work', async ({ page }) => {
    await signIn(page, 'D-02');
    await ask(page, 'Talk to a person');
    await page.getByRole('button', { name: 'Start over' }).click();
    await goTo(page, 'Rep console');
    await expect(page.getByRole('region', { name: 'Case queue' })).toContainText('Priya Shah');
    await expect(page.getByRole('region', { name: 'Case queue' }).locator('.queue-item')).toHaveCount(3);
    await page.getByRole('group', { name: 'Filter cases' }).getByRole('button', { name: 'Resolved' }).click();
    await expect(page.getByText('No cases match this filter.')).toBeVisible();
  });
});

test.describe('not-verified donor', () => {
  test('chat: continue without a donor ID, get general answers, account questions need verification', async ({ page }) => {
    await tapSuggestion(page, 'I don’t have my donor ID');
    await expect(page.locator('.bubble-agent').last()).toContainText('I can’t look up your grants until you’re verified');
    await expect(page.locator('.donor-card')).toHaveClass(/guest/);
    await expect(page.locator('.donor-card')).toContainText('Continuing as a guest');
    await expect(journeyStep(page, 'Not verified')).toContainText('Skipped · general questions only');
    await expect(flowStep(page, 'Authentication')).toContainText('Not verified (guest)');

    // General question: answered from policy, no account data.
    await tapSuggestion(page, 'What is due diligence?');
    await expect(page.locator('.mcard').last()).toContainText('Source · ');
    await expect(flowStep(page, 'Authorization')).toContainText('General info only');
    await expect(flowStep(page, 'Answer')).toContainText('General answer');
    await expect(journeyStep(page, 'Gets help')).toContainText('General answer from grant policy');

    // Account question: blocked until verified, and kept for later.
    await ask(page, 'Why is my grant pending?');
    await expect(page.locator('.bubble-agent').last()).toContainText('I can’t look up your grants until you’re verified');
    await expect(flowStep(page, 'Authorization')).toContainText('Not verified → no account data');
    await page.getByRole('button', { name: 'Show the Q&A contract (JSON)' }).click();
    const json = JSON.parse(await page.locator('#contract').innerText());
    expect(json.request.session).toMatchObject({ authenticated: false, level: 'guest', donor_id: null });
    expect(json.response.authorization.decision).toBe('blocked');

    // Verifying later answers the kept question.
    await ask(page, 'D-01');
    await expect(page.locator('.picker')).toContainText('pending grants');
    await expect(page.locator('.donor-card')).toHaveClass(/verified/);
    await expect(journeyStep(page, 'Verifies identity')).toContainText('Donor ID');
  });

  test('voice: “I don’t know my donor ID” → general answer → transfer as an unverified caller', async ({ page }) => {
    await startCall(page);
    await page.getByRole('button', { name: 'Say “I don’t know my donor ID”' }).click();
    await waitForAssistant(page);
    await expect(page.getByLabel('Call captions')).toContainText('Without verifying, I can answer general questions');
    await say(page, 'How are approved grants paid?');
    await expect(page.getByLabel('Call captions')).toContainText('That’s from our grant policy.');
    await say(page, 'Has my grant to Riverbend been paid?');
    await expect(page.getByLabel('Call captions')).toContainText('Enter your donor ID on your keypad');
    await expect(page.getByLabel('Call captions')).not.toContainText('$100,000');
    await say(page, 'Talk to a person');
    await expect(page.getByLabel('Call captions')).toContainText('I’m transferring you');
    await page.getByRole('button', { name: 'See what the specialist sees →' }).click({ timeout: 6000 });
    const header = page.locator('.detail .card').first();
    await expect(header).toContainText('Unverified caller');
    await expect(header).toContainText('Not verified');
    await expect(page.getByRole('tabpanel')).toContainText('They chose to continue without verifying');
    await expect(page.getByRole('tabpanel')).toContainText('Verify the caller’s identity before discussing any grant');
  });

  test('voice: forgetting the PIN also continues as a guest', async ({ page }) => {
    await startCall(page);
    await keypad(page, '01#');
    await say(page, 'I forgot my PIN');
    await expect(page.locator('.donor-card')).toContainText('Continuing as a guest');
    await expect(page.locator('.donor-card')).not.toContainText('D-01');
  });

  test('after 3 failed tries: general questions still work, account questions don’t', async ({ page }) => {
    for (const id of ['D-97', 'D-98', 'D-99']) await ask(page, id);
    await expect(page.getByText('You can still ask general questions about grants')).toBeVisible();
    await ask(page, 'How long does a grant review take?');
    await expect(flowStep(page, 'Answer')).toContainText('General answer');
    await ask(page, 'D-01');
    await expect(page.locator('.bubble-agent').last()).toContainText('I can’t try verifying again');
    await expect(page.locator('.donor-card')).toContainText('Locked after 3 tries');
  });
});
