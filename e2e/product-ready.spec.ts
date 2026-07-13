import { expect, test, type Page } from "playwright/test";

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

test("login, studio menu and mobile grid remain usable", async ({ page }) => {
  await page.goto("/login");
  const demoLink = page.getByRole("link", { name: /Mary & John demo/i });
  await expect(demoLink).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await demoLink.click();
  await expect(page).toHaveURL(/\/admin\/mary-john$/);
  const coupleHeading = page.getByRole("heading", { name: "Mary & John" });
  const helpButton = page.getByRole("button", { name: "Help" });
  await expect(coupleHeading).toBeVisible();
  await expect
    .poll(async () => {
      const headingBox = await coupleHeading.boundingBox();
      const helpBox = await helpButton.boundingBox();
      return Boolean(headingBox && helpBox && headingBox.x + headingBox.width <= helpBox.x);
    })
    .toBe(true);
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Studio menu" }).click();
  const studioMenu = page.getByRole("navigation", { name: "Studio menu" });
  await expect(studioMenu.getByRole("link", { name: "Flow mode" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Flow mode" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  const layoutButton = page.getByRole("button", { name: /^Grid layout:/ });
  await layoutButton.click();
  await expectNoHorizontalOverflow(page);
});

test("studio keeps duplicated destinations in the menu and animates panel changes", async ({ page }) => {
  await page.goto("/admin/mary-john");

  await page.getByRole("button", { name: "Studio menu" }).click();
  const studioMenu = page.getByRole("navigation", { name: "Studio menu" });
  await studioMenu.getByRole("button", { name: "QR + guest link" }).click();

  const qrPanel = page.locator('[data-admin-panel="qr"]');
  await expect(qrPanel).toBeVisible();
  await expect(qrPanel).toHaveAttribute("data-panel-motion", "enter-exit");
  await expect(page.getByRole("link", { name: "View guest page" })).toHaveCount(0);

  await page.getByRole("button", { name: "Studio menu" }).click();
  await expect(page.getByRole("link", { name: "View guest page" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Flow mode" })).toHaveCount(1);
});

test("guest-memory thumbnails stay mounted while navigating between studio panels", async ({ page }) => {
  await page.goto("/admin/mary-john");
  const firstThumbnail = page.locator('[data-memory-inbox="true"] img').first();
  await expect(firstThumbnail).toBeVisible();
  await firstThumbnail.evaluate((image) => {
    image.dataset.cacheProbe = "preserved";
  });

  await page.getByRole("button", { name: "Studio menu" }).click();
  await page
    .getByRole("navigation", { name: "Studio menu" })
    .getByRole("button", { name: "Private storage" })
    .click();
  await expect(page.getByText(/34\.8 GB used of 50 GB/i)).toBeVisible();
  await page.getByRole("button", { name: "Studio menu" }).click();
  await page
    .getByRole("navigation", { name: "Studio menu" })
    .getByRole("button", { name: "Guest Memories" })
    .click();

  await expect(firstThumbnail).toHaveAttribute("data-cache-probe", "preserved");
});

test("mobile lightbox keeps the gallery at the selected memory", async ({ page }) => {
  if ((page.viewportSize()?.width ?? 1024) > 480) {
    test.skip();
  }

  await page.goto("/admin/mary-john");
  const inbox = page.locator('[data-memory-inbox="true"]');
  await inbox.evaluate((element) => {
    const spacer = document.createElement("div");
    spacer.style.height = "36rem";
    element.before(spacer);
  });
  await page.evaluate(() => window.scrollTo(0, 480));

  const memory = inbox.getByRole("button").last();
  await memory.scrollIntoViewIfNeeded();
  const selectedPosition = await page.evaluate(() => window.scrollY);
  expect(selectedPosition).toBeGreaterThan(0);

  await memory.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(selectedPosition - 1);

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(selectedPosition - 1);
});

test("story gallery keeps the layout switcher width steady and uses the high-quality demo image", async ({ page }) => {
  await page.goto("/admin/mary-john");
  const layoutButton = page.getByRole("button", { name: /^Grid layout:/ });
  const widthBefore = (await layoutButton.boundingBox())?.width;

  await layoutButton.click();
  await expect(layoutButton).toHaveAccessibleName("Grid layout: Story");
  const widthAfter = (await layoutButton.boundingBox())?.width;
  expect(widthBefore).toBeDefined();
  expect(widthAfter).toBeDefined();
  expect(Math.abs((widthBefore ?? 0) - (widthAfter ?? 0))).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-memory-inbox="true"] img').first()).toHaveAttribute(
    "src",
    /demo-couple-1\.webp(?:\?.*)?$/,
  );
});

test("demo guest can send a private photo", async ({ page }) => {
  await page.goto("/mary-john?demo=1");
  await expect(page.getByRole("heading", { name: "Mary & John" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.locator('input[type="file"]').setInputFiles({
    name: "memory.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Send memory" }).click();
  await expect(page.getByText("Thank you", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("help dialog traps focus and restores it on close", async ({ page }) => {
  await page.goto("/login");
  const helpButton = page.getByRole("button", { name: "Help" });
  await helpButton.focus();
  await helpButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("dialog")).toContainText("Let’s make this space yours");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(helpButton).toBeFocused();
});

test("privacy opens beside login help, stays out of demo, and keeps its controls compact", async ({ page }) => {
  await page.goto("/login");
  const privacyButton = page.getByRole("button", { name: "Privacy & data" });
  await expect(privacyButton).toBeVisible();
  await expect(page.getByRole("link", { name: "Privacy & data" })).toHaveCount(0);
  await privacyButton.click();

  const privacyDialog = page.getByRole("dialog");
  await expect(privacyDialog).toBeVisible();
  await expect(
    privacyDialog.getByRole("heading", { name: "Your memories stay private." }),
  ).toBeVisible();
  await expect(
    privacyDialog.getByRole("link", { name: "Turnstile privacy" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  await page.keyboard.press("Escape");

  await page.goto("/privacy");
  const turnstileLink = page.getByRole("link", { name: "Turnstile privacy" });
  const backLink = page.getByRole("link", { name: "Back" });
  await expect(turnstileLink).toHaveClass(/w-fit/);
  await expect(backLink).toHaveClass(/w-fit/);
  await expect(turnstileLink).toBeVisible();
  await expect(backLink).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/admin/mary-john");
  await expect(page.getByRole("button", { name: "Privacy & data" })).toHaveCount(0);

  await page.goto("/mary-john?demo=1");
  await expect(page.getByRole("link", { name: "Privacy & data" })).toHaveCount(0);
});

test("studio and guest action buttons fit their content", async ({ page }) => {
  await page.goto("/admin/mary-john");
  await page.getByRole("button", { name: "Studio menu" }).click();
  await page
    .getByRole("navigation", { name: "Studio menu" })
    .getByRole("button", { name: "Wedding Page" })
    .click();

  const uploadToggle = page.getByRole("button", { name: "Guests can upload" });
  await expect(uploadToggle).toHaveClass(/w-fit/);
  await expect(page.getByRole("button", { name: "Save the page" })).toHaveClass(/w-fit/);

  await page.goto("/mary-john?demo=1");
  await expect(page.getByRole("button", { name: "Send memory" })).toHaveClass(/justify-self-start/);
});

test("flow mode supports touch and keyboard playback controls", async ({ page }) => {
  await page.goto("/admin/mary-john/presentation");
  await page.getByRole("button", { name: "Start flow mode" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  const enterFullscreen = page.getByRole("button", { name: "Enter full screen" });
  if (await enterFullscreen.isEnabled()) {
    await enterFullscreen.click();
    await expect(page.getByRole("button", { name: "Exit full screen" })).toBeVisible();
  }
  const caption = page.locator('[data-presentation-caption="stable"]');
  const captionBefore = await caption.boundingBox();

  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await caption.boundingBox())?.height).toBe(captionBefore?.height);
  await expect.poll(async () => (await caption.boundingBox())?.y).toBe(captionBefore?.y);
  await page.getByRole("main").click({ position: { x: 10, y: 300 } });
  await expect(page.getByRole("button", { name: /Pause|Resume/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
