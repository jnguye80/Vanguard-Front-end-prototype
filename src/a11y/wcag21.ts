// WCAG 2.1 success criteria (W3C Recommendation, https://www.w3.org/TR/WCAG21/) with this prototype's
// conformance status. Target: Level AA (all A + AA criteria). AAA criteria are listed for completeness.
// Update a status only with evidence: an axe-core run, a keyboard / screen-reader pass, or a code change.

export const SPEC_URL = 'https://www.w3.org/TR/WCAG21/';

export type Level = 'A' | 'AA' | 'AAA';
export type Status = 'supports' | 'partial' | 'na' | 'not-targeted';

export interface Criterion {
  id: string;
  name: string;
  level: Level;
  anchor: string;
  status: Status;
  note: string;
}

export const PRINCIPLES: { n: string; name: string }[] = [
  { n: '1', name: 'Perceivable' },
  { n: '2', name: 'Operable' },
  { n: '3', name: 'Understandable' },
  { n: '4', name: 'Robust' },
];

export const GUIDELINES: Record<string, string> = {
  '1.1': 'Text Alternatives', '1.2': 'Time-based Media', '1.3': 'Adaptable', '1.4': 'Distinguishable',
  '2.1': 'Keyboard Accessible', '2.2': 'Enough Time', '2.3': 'Seizures and Physical Reactions', '2.4': 'Navigable', '2.5': 'Input Modalities',
  '3.1': 'Readable', '3.2': 'Predictable', '3.3': 'Input Assistance',
  '4.1': 'Compatible',
};

const AAA_NOTE = 'Level AAA is outside the AA target for this prototype.';
const NO_MEDIA = 'No audio or video content.';

const c = (id: string, name: string, level: Level, anchor: string, status: Status, note: string): Criterion =>
  ({ id, name, level, anchor, status, note });

export const CRITERIA: Criterion[] = [
  c('1.1.1', 'Non-text Content', 'A', 'non-text-content', 'supports', 'Decorative icons are hidden from assistive technology. Icon-only buttons (Send, previous / next turn) have text names. There are no informative images.'),
  c('1.2.1', 'Audio-only and Video-only (Prerecorded)', 'A', 'audio-only-and-video-only-prerecorded', 'na', NO_MEDIA),
  c('1.2.2', 'Captions (Prerecorded)', 'A', 'captions-prerecorded', 'na', NO_MEDIA),
  c('1.2.3', 'Audio Description or Media Alternative (Prerecorded)', 'A', 'audio-description-or-media-alternative-prerecorded', 'na', NO_MEDIA),
  c('1.2.4', 'Captions (Live)', 'AA', 'captions-live', 'na', NO_MEDIA),
  c('1.2.5', 'Audio Description (Prerecorded)', 'AA', 'audio-description-prerecorded', 'na', NO_MEDIA),
  c('1.2.6', 'Sign Language (Prerecorded)', 'AAA', 'sign-language-prerecorded', 'na', NO_MEDIA),
  c('1.2.7', 'Extended Audio Description (Prerecorded)', 'AAA', 'extended-audio-description-prerecorded', 'na', NO_MEDIA),
  c('1.2.8', 'Media Alternative (Prerecorded)', 'AAA', 'media-alternative-prerecorded', 'na', NO_MEDIA),
  c('1.2.9', 'Audio-only (Live)', 'AAA', 'audio-only-live', 'na', NO_MEDIA),
  c('1.3.1', 'Info and Relationships', 'A', 'info-and-relationships', 'supports', 'Structure is in the markup: landmarks, headings, lists for the progress tracker, description lists for grant facts, tables with column headers, and labelled form fields and tabs.'),
  c('1.3.2', 'Meaningful Sequence', 'A', 'meaningful-sequence', 'supports', 'Reading order follows the DOM. On narrow screens the chat moves above the sidebar; each is a self-contained region, so meaning does not change.'),
  c('1.3.3', 'Sensory Characteristics', 'A', 'sensory-characteristics', 'supports', 'Instructions name controls by their labels, not by shape, colour or position.'),
  c('1.3.4', 'Orientation', 'AA', 'orientation', 'supports', 'Works in portrait and landscape. Nothing locks orientation.'),
  c('1.3.5', 'Identify Input Purpose', 'AA', 'identify-input-purpose', 'na', 'No fields collect personal information about the user. The message box and the rep reply box are free text.'),
  c('1.3.6', 'Identify Purpose', 'AAA', 'identify-purpose', 'not-targeted', AAA_NOTE),
  c('1.4.1', 'Use of Color', 'A', 'use-of-color', 'supports', 'Status pills carry text, progress steps say Done / Current / Upcoming, trace steps carry a tag (READ, GUARD, FAIL…), and links are underlined.'),
  c('1.4.2', 'Audio Control', 'A', 'audio-control', 'na', 'No audio plays.'),
  c('1.4.3', 'Contrast (Minimum)', 'AA', 'contrast-minimum', 'supports', 'Text is 4.5:1 or better in light and dark themes (axe-core, all views). Accent text uses a separate token so links stay readable on dark surfaces.'),
  c('1.4.4', 'Resize Text', 'AA', 'resize-text', 'supports', 'Browser zoom to 200% reflows without loss. The Text size setting on this page enlarges the whole interface up to 150%.'),
  c('1.4.5', 'Images of Text', 'AA', 'images-of-text', 'supports', 'All text is real text. No images of text.'),
  c('1.4.6', 'Contrast (Enhanced)', 'AAA', 'contrast-enhanced', 'not-targeted', AAA_NOTE),
  c('1.4.7', 'Low or No Background Audio', 'AAA', 'low-or-no-background-audio', 'na', 'No audio.'),
  c('1.4.8', 'Visual Presentation', 'AAA', 'visual-presentation', 'not-targeted', AAA_NOTE),
  c('1.4.9', 'Images of Text (No Exception)', 'AAA', 'images-of-text-no-exception', 'supports', 'No images of text.'),
  c('1.4.10', 'Reflow', 'AA', 'reflow', 'supports', 'No horizontal scrolling at 320 CSS px. Wide data tables scroll inside their own focusable region, which the criterion allows.'),
  c('1.4.11', 'Non-text Contrast', 'AA', 'non-text-contrast', 'supports', 'Form-field borders and the focus ring are 3:1 or better. Buttons are identified by their text labels.'),
  c('1.4.12', 'Text Spacing', 'AA', 'text-spacing', 'supports', 'Tested with the WCAG text-spacing overrides (line height 1.5, paragraph 2em, letter 0.12em, word 0.16em): no text is clipped or overlapped.'),
  c('1.4.13', 'Content on Hover or Focus', 'AA', 'content-on-hover-or-focus', 'na', 'No tooltips or pop-ups appear on hover or focus.'),
  c('2.1.1', 'Keyboard', 'A', 'keyboard', 'supports', 'Every control is a native button, link, input or select. Rep-console tabs use arrow keys, Home and End. Scrollable regions take focus.'),
  c('2.1.2', 'No Keyboard Trap', 'A', 'no-keyboard-trap', 'supports', 'Focus can always move on with Tab and Shift+Tab. There are no modals.'),
  c('2.1.3', 'Keyboard (No Exception)', 'AAA', 'keyboard-no-exception', 'supports', 'No function needs a pointer.'),
  c('2.1.4', 'Character Key Shortcuts', 'A', 'character-key-shortcuts', 'na', 'No single-character shortcuts. Arrow keys work only while a tab has focus.'),
  c('2.2.1', 'Timing Adjustable', 'A', 'timing-adjustable', 'supports', 'No time limits on any task. Confirmations stay visible on the page after the toast fades.'),
  c('2.2.2', 'Pause, Stop, Hide', 'A', 'pause-stop-hide', 'supports', 'The rep console’s live SLA countdowns can be paused. Loading animations last under 5 seconds and stop with Reduce motion.'),
  c('2.2.3', 'No Timing', 'AAA', 'no-timing', 'supports', 'Timing is not part of any task.'),
  c('2.2.4', 'Interruptions', 'AAA', 'interruptions', 'not-targeted', AAA_NOTE),
  c('2.2.5', 'Re-authenticating', 'AAA', 're-authenticating', 'na', 'The prototype has no session expiry.'),
  c('2.2.6', 'Timeouts', 'AAA', 'timeouts', 'na', 'No inactivity timeouts.'),
  c('2.3.1', 'Three Flashes or Below Threshold', 'A', 'three-flashes-or-below-threshold', 'supports', 'Nothing flashes. The new-case highlight fades once, slowly.'),
  c('2.3.2', 'Three Flashes', 'AAA', 'three-flashes', 'supports', 'Nothing flashes.'),
  c('2.3.3', 'Animation from Interactions', 'AAA', 'animation-from-interactions', 'supports', 'Motion stops when the system asks for reduced motion or when Reduce motion is on here.'),
  c('2.4.1', 'Bypass Blocks', 'A', 'bypass-blocks', 'supports', 'A Skip to main content link is the first focusable element. Landmarks (header, navigation, main, labelled regions) allow jumping.'),
  c('2.4.2', 'Page Titled', 'A', 'page-titled', 'supports', 'The document title names the current view, e.g. “Rep console · Momentum”.'),
  c('2.4.3', 'Focus Order', 'A', 'focus-order', 'supports', 'Focus follows the visual order. When the control you used disappears mid-turn, focus returns to the message box.'),
  c('2.4.4', 'Link Purpose (In Context)', 'A', 'link-purpose-in-context', 'supports', 'Link text says where it goes (“See what the rep sees”, criterion names that open the W3C spec).'),
  c('2.4.5', 'Multiple Ways', 'AA', 'multiple-ways', 'na', 'A single page whose views switch in place; the criterion applies to sets of pages.'),
  c('2.4.6', 'Headings and Labels', 'AA', 'headings-and-labels', 'supports', 'Headings name each region. Labels describe the field (“Message the grants assistant”, “Donor”, “Data scenario”).'),
  c('2.4.7', 'Focus Visible', 'AA', 'focus-visible', 'supports', 'A 2px focus ring on every control, with a lighter ring inside the dark trace panel and an inset ring in clipped lists.'),
  c('2.4.8', 'Location', 'AAA', 'location', 'supports', 'The navigation marks the current view.'),
  c('2.4.9', 'Link Purpose (Link Only)', 'AAA', 'link-purpose-link-only', 'not-targeted', AAA_NOTE),
  c('2.4.10', 'Section Headings', 'AAA', 'section-headings', 'not-targeted', AAA_NOTE),
  c('2.5.1', 'Pointer Gestures', 'A', 'pointer-gestures', 'supports', 'Everything works with a single tap or click. No path or multi-finger gestures.'),
  c('2.5.2', 'Pointer Cancellation', 'A', 'pointer-cancellation', 'supports', 'Native buttons act on release, so moving off cancels.'),
  c('2.5.3', 'Label in Name', 'A', 'label-in-name', 'supports', 'Accessible names contain the visible label. Masked amounts show dots visually and read “Amount hidden for your role”.'),
  c('2.5.4', 'Motion Actuation', 'A', 'motion-actuation', 'na', 'No device-motion features.'),
  c('2.5.5', 'Target Size', 'AAA', 'target-size', 'partial', 'Most controls are 40–44 px. Some small text links are 24 px (meets the AA 2.2 minimum, not AAA 44 px).'),
  c('2.5.6', 'Concurrent Input Mechanisms', 'AAA', 'concurrent-input-mechanisms', 'supports', 'Mouse, touch and keyboard all work at any time.'),
  c('3.1.1', 'Language of Page', 'A', 'language-of-page', 'supports', 'The page declares lang="en".'),
  c('3.1.2', 'Language of Parts', 'AA', 'language-of-parts', 'supports', 'All content is English.'),
  c('3.1.3', 'Unusual Words', 'AAA', 'unusual-words', 'not-targeted', AAA_NOTE),
  c('3.1.4', 'Abbreviations', 'AAA', 'abbreviations', 'not-targeted', AAA_NOTE),
  c('3.1.5', 'Reading Level', 'AAA', 'reading-level', 'not-targeted', AAA_NOTE),
  c('3.1.6', 'Pronunciation', 'AAA', 'pronunciation', 'na', 'No words whose meaning depends on pronunciation.'),
  c('3.2.1', 'On Focus', 'A', 'on-focus', 'supports', 'Focusing a control never changes context.'),
  c('3.2.2', 'On Input', 'A', 'on-input', 'supports', 'Changing the donor starts a new chat; the controls bar says so before you change it.'),
  c('3.2.3', 'Consistent Navigation', 'AA', 'consistent-navigation', 'supports', 'The same navigation, in the same order, on every view.'),
  c('3.2.4', 'Consistent Identification', 'AA', 'consistent-identification', 'supports', 'The same action has the same name everywhere (“Talk to a person”).'),
  c('3.2.5', 'Change on Request', 'AAA', 'change-on-request', 'not-targeted', AAA_NOTE),
  c('3.3.1', 'Error Identification', 'A', 'error-identification', 'supports', 'System problems are stated in text (“I can’t reach our grant systems right now”). An empty message can’t be sent.'),
  c('3.3.2', 'Labels or Instructions', 'A', 'labels-or-instructions', 'supports', 'Every field is labelled; the message box gives an example question.'),
  c('3.3.3', 'Error Suggestion', 'AA', 'error-suggestion', 'supports', 'When the assistant doesn’t understand, it says so and offers example questions.'),
  c('3.3.4', 'Error Prevention (Legal, Financial, Data)', 'AA', 'error-prevention-legal-financial-data', 'supports', 'The assistant can’t move money or change a grant. Rep actions are reversible (Reopen) and replies are reviewed before sending.'),
  c('3.3.5', 'Help', 'AAA', 'help', 'supports', '“Talk to a person” is available on every chat screen.'),
  c('3.3.6', 'Error Prevention (All)', 'AAA', 'error-prevention-all', 'not-targeted', AAA_NOTE),
  c('4.1.1', 'Parsing', 'A', 'parsing', 'supports', 'Per the 2023 WCAG 2.1 errata, this criterion is always satisfied for content using HTML.'),
  c('4.1.2', 'Name, Role, Value', 'A', 'name-role-value', 'supports', 'Native controls throughout. Toggles expose aria-pressed, tabs aria-selected, expanders aria-expanded, current view aria-current.'),
  c('4.1.3', 'Status Messages', 'AA', 'status-messages', 'supports', 'The conversation is a polite live log; loading, scenario notes and confirmations use status regions that are always present.'),
];

export const STATUS_LABEL: Record<Status, string> = {
  supports: 'Supports',
  partial: 'Partially supports',
  na: 'Not applicable',
  'not-targeted': 'Not targeted (AAA)',
};

/** axe-core tags look like "wcag143" → "1.4.3". */
export function criterionFromAxeTag(tag: string): string | null {
  const m = tag.match(/^wcag(\d)(\d)(\d{1,2})$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}
