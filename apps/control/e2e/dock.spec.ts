import { expect, test, type Locator, type Page } from '@playwright/test';
import { connect, goTo, inReach, installFakeFluidNC, openApp } from './helpers';

// Stage 3 of the areas (DESIGN.md §5, change list 19): the main action of a panel is always in
// reach – docked to the bottom of the panel instead of lying below the fold of a long card.
// `toBeVisible` cannot see clipping, so this measures: with the panel scrolled to its top, the
// action's box lies inside the panel's visible area and a touch at its middle reaches it.

const SIZES = [
  { name: '1280 × 800', width: 1280, height: 800 },
  { name: '800 × 600 (the machine’s screen)', width: 800, height: 600 },
  { name: '1180 × 820 (iPad lying)', width: 1180, height: 820 },
  { name: '820 × 1180 (iPad upright)', width: 820, height: 1180 },
];

/** The panel whose scrolling the action has to stay in reach of */
const panelBody = (page: Page) => page.locator('.panel-body');

/**
 * On the machine's own screen the panel is a sheet that starts at "half": 800 × 600 leaves ~100 px
 * of body there – no room for a card and its docked action beside the row above it. That is what
 * the sheet's "Größer" is for (DESIGN.md §4); the action is measured at the rest the operator works at.
 */
async function sheetFull(page: Page) {
  const larger = page.locator('[data-slot="sheet-larger"]');
  if ((await larger.count()) > 0) await larger.click();
}

async function scrollToTop(page: Page) {
  await panelBody(page).evaluate((el) => {
    el.scrollTo({ top: 0, behavior: 'instant' });
  });
}

const inReachOfPanel = (page: Page, control: Locator) => inReach(page, control, panelBody(page));

for (const size of SIZES) {
  test.describe(`docked main action at ${size.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await installFakeFluidNC(page);
      await openApp(page);
      // Connected, so no control wears the cover that tells why it is locked
      await connect(page);
    });

    test('Einrichten · Nullpunkt: "Nullpunkt hier setzen" – from where its card is in view', async ({
      page,
    }) => {
      await goTo(page, 'Einrichten', 'Nullpunkt');
      await sheetFull(page);
      await scrollToTop(page);
      // (on the machine's small screen the panel shows little more than the row above the card)
      await page
        .getByTestId('zero-flow')
        .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      const set = page
        .getByRole('button', { name: /^Nullpunkt hier setzen/ })
        .and(page.locator('.hold'));
      await expect(set).toBeVisible();
      const r = await inReachOfPanel(page, set);
      expect(r.inside, JSON.stringify(r)).toBe(true);
      expect(r.reached, JSON.stringify(r)).toBe(true);
    });

    test('Einrichten · Antasten: "Antasten starten" – from where its card is in view', async ({
      page,
    }) => {
      await goTo(page, 'Einrichten', 'Antasten');
      await sheetFull(page);
      // The card of the chosen tile lies under the tiles: once it is at the top of the panel the
      // action is in reach, however long the card is.
      await page
        .getByTestId('probe-card')
        .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      const start = page
        .getByRole('button', { name: 'Antasten starten' })
        .and(page.locator('.hold'));
      await expect(start).toBeVisible();
      const r = await inReachOfPanel(page, start);
      expect(r.inside, JSON.stringify(r)).toBe(true);
      expect(r.reached, JSON.stringify(r)).toBe(true);
    });
  });
}
