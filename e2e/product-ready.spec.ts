import { readFile } from "node:fs/promises";
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

function studioNavigation(page: Page) {
  return page.getByRole("navigation", { name: "Studio navigation" });
}

async function openStudioPanel(page: Page, label: "Memories" | "Wedding page" | "QR + guest link" | "Storage") {
  const navigation = studioNavigation(page);

  if (label === "Storage" && (page.viewportSize()?.width ?? 1024) < 1024) {
    await navigation.getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog", { name: "More" }).getByRole("button", { name: "Storage" }).click();
    return;
  }

  await navigation.getByRole("button", { name: label }).click();
}

test("login, studio navigation and mobile grid remain usable", async ({ page }) => {
  await page.goto("/login");
  const demoLink = page.getByRole("link", { name: /Mary & John demo/i });
  const createStudio = page.getByRole("button", { name: "Create my studio" });
  const loginForm = page.locator("form").first();
  const tokenInput = page.getByRole("textbox", { name: "Etsy token" });
  const weddingDateInput = page.locator('input[type="date"]');
  await expect(demoLink).toBeVisible();
  await expect(createStudio).toBeVisible();
  await expect(weddingDateInput).toBeVisible();
  await expect
    .poll(async () => {
      const tokenBox = await tokenInput.boundingBox();
      const dateBox = await weddingDateInput.boundingBox();
      return Boolean(
        tokenBox &&
          dateBox &&
          Math.abs(dateBox.x - tokenBox.x) <= 1 &&
          Math.abs(dateBox.width - tokenBox.width) <= 1,
      );
    })
    .toBe(true);
  await expect
    .poll(async () => {
      const formBox = await loginForm.boundingBox();
      const createBox = await createStudio.boundingBox();
      const demoBox = await demoLink.boundingBox();
      return Boolean(
        formBox &&
          createBox &&
          demoBox &&
          Math.abs(createBox.width - demoBox.width) <= 1 &&
          Math.abs(createBox.x + createBox.width / 2 - (formBox.x + formBox.width / 2)) <= 1 &&
          Math.abs(demoBox.x + demoBox.width / 2 - (formBox.x + formBox.width / 2)) <= 1,
      );
    })
    .toBe(true);
  await expectNoHorizontalOverflow(page);

  await demoLink.click();
  await expect(page).toHaveURL(/\/admin\/mary-john$/);
  const coupleHeading = page.getByRole("heading", { name: "Mary & John" });
  await expect(coupleHeading).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await expect(studioNavigation(page).getByRole("link", { name: "Flow mode" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Flow mode" })).toHaveCount(1);

  const layoutButton = page.getByRole("button", { name: /^Grid layout:/ });
  await layoutButton.click();
  await expectNoHorizontalOverflow(page);
});

test("returning login hides the demo and gives password recovery a tangible button", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Returning" }).click();

  const forgotPassword = page.getByRole("button", { name: "Forgot password?" });
  await expect(forgotPassword).toHaveAttribute("data-app-button", "paper");
  await expect(page.getByRole("link", { name: /Mary & John demo/i })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("responsive studio navigation exposes the couple's primary tasks", async ({ page }) => {
  await page.goto("/admin/mary-john");

  const navigation = page.getByRole("navigation", { name: "Studio navigation" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Memories" })).toBeVisible();
  await expect(navigation.getByRole("link", { name: "Flow mode" })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Wedding page" })).toBeVisible();
  await expect(navigation.getByRole("button", { name: "QR + guest link" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Studio menu" })).toHaveCount(0);
  await expect(page.locator("header").getByRole("button", { name: "Help" })).toHaveCount(0);

  if ((page.viewportSize()?.width ?? 1024) < 1024) {
    await expect(navigation).toHaveAttribute("data-studio-navigation", "mobile");
    await navigation.getByRole("button", { name: "More" }).click();
    const moreActions = page.getByRole("dialog", { name: "More" });
    await expect(moreActions.getByRole("button", { name: "Storage" })).toBeVisible();
    await expect(moreActions.getByRole("link", { name: "View guest page" })).toBeVisible();
    await expect(moreActions.getByRole("button", { name: "Help" })).toBeVisible();
    await expect(moreActions.getByRole("button", { name: "Logout" })).toBeVisible();
  } else {
    await expect(navigation).toHaveAttribute("data-studio-navigation", "desktop");
    await expect(navigation.getByText("More", { exact: true })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Storage" })).toBeVisible();
    await expect(navigation.getByRole("link", { name: "View guest page" })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Help" })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Logout" })).toBeVisible();
  }
});

test("mobile More stays usable on short screens and releases its lock at desktop size", async ({ page }) => {
  if ((page.viewportSize()?.width ?? 1024) >= 1024) {
    test.skip();
  }

  await page.setViewportSize({ width: 390, height: 320 });
  await page.goto("/admin/mary-john");
  const navigation = studioNavigation(page);
  const moreButton = navigation.getByRole("button", { name: "More" });
  await moreButton.click();

  const moreDialog = page.getByRole("dialog", { name: "More" });
  await expect(moreDialog).toBeVisible();
  await expect(moreDialog).toHaveCSS("overflow-y", "auto");
  await moreDialog.getByRole("button", { name: "Logout" }).scrollIntoViewIfNeeded();
  await expect(moreDialog.getByRole("button", { name: "Logout" })).toBeVisible();

  await moreDialog.getByRole("button", { name: "Storage" }).click();
  await expect(moreButton).toHaveAttribute("aria-current", "page");
  await moreButton.click();
  await page.setViewportSize({ width: 1200, height: 700 });
  await expect(moreDialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("studio navigation keeps destinations clear and animates panel changes", async ({ page }) => {
  await page.goto("/admin/mary-john");

  await openStudioPanel(page, "QR + guest link");

  const qrPanel = page.locator('[data-admin-panel="qr"]');
  await expect(qrPanel).toBeVisible();
  await expect(qrPanel).toHaveAttribute("data-panel-motion", "enter-exit");
  await expect(qrPanel.getByText("Share with guests or print on table cards.")).toHaveCount(0);
  await expect(qrPanel.getByText("scan to send memories")).toHaveCount(0);
  await expect(qrPanel.locator('[data-qr-card="true"]').getByRole("button", { name: "PNG" })).toBeVisible();
  await expect(qrPanel.locator('[data-qr-card="true"]').getByRole("button", { name: "SVG" })).toBeVisible();
  await expect(qrPanel.locator('[data-guest-link-card="true"]').getByRole("button", { name: "PNG" })).toHaveCount(0);
  await expect(qrPanel.getByText(/Download PNG to print it as it is/i)).toBeVisible();
  await expect(qrPanel.getByRole("link", { name: "View guest page" })).toHaveCount(0);
  const [qrBox, guestLinkBox] = await Promise.all([
    qrPanel.locator('[data-qr-card="true"]').boundingBox(),
    qrPanel.locator('[data-guest-link-card="true"]').boundingBox(),
  ]);
  expect(qrBox).toBeTruthy();
  expect(guestLinkBox).toBeTruthy();
  expect(Math.abs((qrBox?.x ?? 0) + (qrBox?.width ?? 0) / 2 - ((guestLinkBox?.x ?? 0) + (guestLinkBox?.width ?? 0) / 2))).toBeLessThanOrEqual(1);
  expect(guestLinkBox?.y).toBeGreaterThanOrEqual((qrBox?.y ?? 0) + (qrBox?.height ?? 0));
  expect(guestLinkBox?.height).toBeLessThan(qrBox?.height ?? 0);

  const pngDownloadPromise = page.waitForEvent("download");
  await qrPanel.locator('[data-qr-card="true"]').getByRole("button", { name: "PNG" }).click();
  const pngDownload = await pngDownloadPromise;
  expect(pngDownload.suggestedFilename()).toBe("mary-john-wedding-qr-print.png");
  const pngPath = await pngDownload.path();
  expect(pngPath).toBeTruthy();
  const pngBytes = await readFile(pngPath!);
  expect(pngBytes.readUInt32BE(16)).toBe(1600);
  expect(pngBytes.readUInt32BE(20)).toBe(1600);

  await expect(studioNavigation(page).getByRole("link", { name: "Flow mode" })).toHaveCount(1);
});

test("guest-memory thumbnails stay mounted while navigating between studio panels", async ({ page }) => {
  await page.goto("/admin/mary-john");
  const firstThumbnail = page.locator('[data-memory-inbox="true"] img').first();
  await expect(firstThumbnail).toBeVisible();
  await firstThumbnail.evaluate((image) => {
    image.dataset.cacheProbe = "preserved";
  });

  await openStudioPanel(page, "Storage");
  await expect(page.getByText(/34\.8 GB used of 50 GB/i)).toBeVisible();
  await openStudioPanel(page, "Memories");

  await expect(firstThumbnail).toHaveAttribute("data-cache-probe", "preserved");
});

test("guest-memory thumbnails return from the studio cache after a route visit", async ({ page }) => {
  const thumbnailRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("-thumb.webp")) {
      thumbnailRequests.push(request.url());
    }
  });

  await page.goto("/admin/mary-john");
  const thumbnails = page.locator('[data-memory-inbox="true"] button img');
  await expect.poll(() => thumbnails.count()).toBeGreaterThan(1);
  await expect
    .poll(() =>
      thumbnails.evaluateAll((images) =>
        images.length > 1 && images.every((image) => image.getAttribute("src")?.startsWith("blob:")),
      ),
    )
    .toBe(true);

  await studioNavigation(page).getByRole("link", { name: "Flow mode" }).click();
  await expect(page).toHaveURL(/\/admin\/mary-john\/presentation$/);
  await page.getByRole("link", { name: "Back to the studio" }).click();
  await expect(page).toHaveURL(/\/admin\/mary-john$/);

  const returnedThumbnails = page.locator('[data-memory-inbox="true"] button img');
  await expect
    .poll(() =>
      returnedThumbnails.evaluateAll((images) =>
        images.length > 1 &&
        images.every((image) => image.getAttribute("src")?.startsWith("blob:")),
      ),
    )
    .toBe(true);
  expect(thumbnailRequests.length).toBeGreaterThan(0);
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

test("story gallery keeps the layout switcher width steady with cached thumbnails", async ({ page }) => {
  await page.goto("/admin/mary-john");
  const layoutButton = page.getByRole("button", { name: /^Grid layout:/ });
  const widthBefore = (await layoutButton.boundingBox())?.width;

  await layoutButton.click();
  await expect(layoutButton).toHaveAccessibleName("Grid layout: Story");
  const widthAfter = (await layoutButton.boundingBox())?.width;
  expect(widthBefore).toBeDefined();
  expect(widthAfter).toBeDefined();
  expect(Math.abs((widthBefore ?? 0) - (widthAfter ?? 0))).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-memory-inbox="true"] img').first()).toHaveAttribute("src", /^blob:/);
});

test("lightbox screen arrows replace the selected photo, not only its counter", async ({ page }) => {
  await page.goto("/admin/mary-john");
  const inbox = page.locator('[data-memory-inbox="true"]');
  const photoCards = inbox.locator("button").filter({ has: page.locator("img") });
  await photoCards.first().click();

  const dialog = page.getByRole("dialog");
  const selectedImage = dialog.locator("img").first();
  const firstSource = await selectedImage.getAttribute("src");
  expect(firstSource).toBeTruthy();

  await dialog.getByRole("button", { name: "Next media" }).click();
  await expect(dialog.getByText("2 / 7", { exact: true })).toBeVisible();
  await expect.poll(() => selectedImage.getAttribute("src")).not.toBe(firstSource);
});

test("lightbox delete action keeps a bold destructive emphasis", async ({ page }) => {
  await page.goto("/admin/mary-john");
  const inbox = page.locator('[data-memory-inbox="true"]');
  await inbox.locator("button").filter({ has: page.locator("img") }).first().click();

  await expect(page.getByRole("dialog").getByRole("button", { name: "Delete" })).toHaveClass(
    /!font-extrabold/,
  );
});

test("demo guest is a read-only preview and cannot create browser uploads", async ({ page }) => {
  await page.goto("/mary-john?demo=1");
  await expect(page.getByRole("heading", { name: "Mary & John" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await expect(page.getByLabel("Your name")).toBeDisabled();
  await expect(page.getByLabel("Memory note")).toBeDisabled();
  await expect(page.locator('input[type="file"]')).toBeDisabled();
  await expect(page.getByRole("button", { name: "Record voice note" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Send memory" })).toBeDisabled();
  await expect(page.getByText("No app needed. Your upload stays private.")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("help dialog traps focus and restores it on close", async ({ page }, testInfo) => {
  await page.goto("/login");
  const helpButton = page.getByRole("button", { name: "Help" });
  await helpButton.focus();
  await helpButton.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("dialog")).toContainText("Let’s make this space yours");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  // Mobile Safari does not expose programmatic button focus after a dialog closes.
  // The close interaction itself is still verified on the iPhone target.
  if (testInfo.project.name !== "iphone-17-pro-max") {
    await expect(helpButton).toBeFocused();
  }
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
  const turnstileLink = privacyDialog.getByRole("link", { name: "Turnstile privacy" });
  await expect(turnstileLink).toBeVisible();
  await expect(turnstileLink).toHaveClass(/w-fit/);
  await expect(page).toHaveURL(/\/login$/);
  await expectNoHorizontalOverflow(page);
  await page.keyboard.press("Escape");

  await page.goto("/admin/mary-john");
  await expect(page.getByRole("button", { name: "Privacy & data" })).toHaveCount(0);

  await page.goto("/mary-john?demo=1");
  await expect(page.getByRole("link", { name: "Privacy & data" })).toHaveCount(0);
});

test("studio and guest action buttons fit their content", async ({ page }) => {
  await page.goto("/admin/mary-john");
  await openStudioPanel(page, "Wedding page");

  const uploadToggle = page.getByRole("button", { name: "Close uploads" });
  await expect(uploadToggle).toHaveClass(/w-fit/);
  await expect(page.getByRole("button", { name: "Save the page" })).toHaveClass(/w-fit/);

  await page.goto("/mary-john?demo=1");
  const guestUploadChoices = page.locator('[data-guest-upload-choice]');
  await expect(guestUploadChoices).toHaveCount(2);
  await expect(guestUploadChoices.first()).toHaveAttribute("data-guest-upload-choice", "file");
  await expect(guestUploadChoices.last()).toHaveAttribute("data-guest-upload-choice", "voice");
  await expect(guestUploadChoices.last()).toHaveAttribute("aria-pressed", "false");
  await expect(guestUploadChoices.last()).toHaveClass(/border-dashed/);
  const [fileChoiceBox, voiceChoiceBox] = await Promise.all([
    guestUploadChoices.first().boundingBox(),
    guestUploadChoices.last().boundingBox(),
  ]);
  expect(fileChoiceBox?.height).toBe(voiceChoiceBox?.height);
  await expect(page.getByRole("button", { name: "Send memory" })).toHaveClass(
    /justify-self-center.*uppercase|uppercase.*justify-self-center/,
  );
  await expect(page.getByRole("button", { name: "Send memory" })).toHaveClass(/!font-extrabold/);
});

test("wedding page explains guest setup and makes upload availability unmistakable", async ({ page }) => {
  await page.goto("/admin/mary-john");
  await openStudioPanel(page, "Wedding page");

  await expect(page.getByText(/Choose your photo and welcome note/i)).toBeVisible();
  await expect(page.getByText("Set the scene for your guests.")).toHaveCount(0);
  await expect(
    page.getByText("Names and the wedding date are locked for safety. Contact us if either needs to change."),
  ).toHaveCount(0);
  await expect(page.getByLabel("Message for guests")).toHaveCount(0);
  await expect(page.getByText("Message for guests")).toBeVisible();
  await expect(page.locator('input[type="file"][accept="image/*"]')).toBeDisabled();

  const uploadStatus = page.locator("[data-guest-upload-status]");
  await expect(uploadStatus).toHaveAttribute("data-guest-upload-status", "open");
  await expect(uploadStatus).toContainText("Guest uploads are open");
  const saveButton = page.getByRole("button", { name: "Save the page" });
  const uploadButton = page.getByRole("button", { name: "Close uploads" });
  const [saveBox, uploadBox] = await Promise.all([saveButton.boundingBox(), uploadButton.boundingBox()]);
  expect(saveBox).toBeTruthy();
  expect(uploadBox).toBeTruthy();
  expect(Math.abs((saveBox?.y ?? 0) - (uploadBox?.y ?? 0))).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Close uploads" }).click();
  await expect(uploadStatus).toHaveAttribute("data-guest-upload-status", "closed");
  await expect(uploadStatus).toContainText("Guest uploads are closed");
  await expect(page.getByRole("button", { name: "Open uploads" })).toBeVisible();
});

test("flow mode supports touch and keyboard playback controls", async ({ page }) => {
  await page.goto("/admin/mary-john/presentation");
  await page.getByRole("button", { name: "Start flow mode" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  const enterFullscreen = page.getByRole("button", { name: "Enter full screen" });
  const isMobile = (page.viewportSize()?.width ?? 1024) < 768;
  if (isMobile) {
    await expect(enterFullscreen).toHaveCount(0);
  } else {
    await expect(enterFullscreen).toBeVisible();
    if (await enterFullscreen.isEnabled()) {
      await enterFullscreen.click();
      await expect(page.getByRole("button", { name: "Exit full screen" })).toBeVisible();
    }
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

test("flow mode gives photos and videos the full viewport stage", async ({ page }) => {
  await page.goto("/admin/mary-john/presentation");
  await page.getByRole("button", { name: "Start flow mode" }).click();

  const mediaStage = page.locator("[data-presentation-media-id]");
  const viewport = page.viewportSize();
  await expect
    .poll(async () => {
      const box = await mediaStage.boundingBox();
      return Boolean(
        box &&
          viewport &&
          Math.abs(box.width - viewport.width) <= 1 &&
          Math.abs(box.height - viewport.height) <= 1,
      );
    })
    .toBe(true);
  await expect(mediaStage.locator('img:not([aria-hidden="true"]), video')).toHaveCSS(
    "object-fit",
    "contain",
  );
  await expect(mediaStage.locator('img[aria-hidden="true"]')).toHaveCSS(
    "object-fit",
    "cover",
  );
});

test("flow mode advances with its matching memory note", async ({ page }) => {
  await page.goto("/admin/mary-john/presentation");
  await page.getByRole("button", { name: "Start flow mode" }).click();

  const currentMemory = page.locator("[data-presentation-media-id]");
  const caption = page.locator("[data-presentation-caption-media-id]");
  await expect(currentMemory).toHaveAttribute("data-presentation-media-id", "demo-photo-1");
  await expect(caption).toHaveAttribute("data-presentation-caption-media-id", "demo-photo-1");

  await page.waitForTimeout(1_000);
  await expect(currentMemory).toHaveAttribute("data-presentation-media-id", "demo-photo-1");
  await expect(caption).toHaveAttribute("data-presentation-caption-media-id", "demo-photo-1");

  await expect
    .poll(() => currentMemory.getAttribute("data-presentation-media-id"), { timeout: 8_000 })
    .toBe("demo-photo-2");
  await expect(caption).toHaveAttribute("data-presentation-caption-media-id", "demo-photo-2");
  await expect(caption).toContainText("Ava Bennett");
});
