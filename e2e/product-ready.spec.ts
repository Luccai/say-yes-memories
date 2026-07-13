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
  await expect(demoLink).not.toHaveClass(/(^|\s)w-full(?:\s|$)/);
  await expect(createStudio).not.toHaveClass(/(^|\s)w-full(?:\s|$)/);
  await expect
    .poll(async () => {
      const formBox = await loginForm.boundingBox();
      const createBox = await createStudio.boundingBox();
      const demoBox = await demoLink.boundingBox();
      return Boolean(
        formBox &&
          createBox &&
          demoBox &&
          createBox.width < formBox.width - 24 &&
          demoBox.width < formBox.width - 24,
      );
    })
    .toBe(true);
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
  await expect(qrPanel.getByText("Share with guests or print on table cards.")).toHaveCount(0);
  await expect(qrPanel.getByText("scan to send memories")).toHaveCount(0);
  await expect(qrPanel.locator('[data-qr-card="true"]').getByRole("button", { name: "PNG" })).toBeVisible();
  await expect(qrPanel.locator('[data-qr-card="true"]').getByRole("button", { name: "SVG" })).toBeVisible();
  await expect(qrPanel.locator('[data-guest-link-card="true"]').getByRole("button", { name: "PNG" })).toHaveCount(0);
  await expect(qrPanel.getByText(/Download PNG to print it as it is/i)).toBeVisible();
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

  await page.getByRole("button", { name: "Studio menu" }).click();
  await page.getByRole("navigation", { name: "Studio menu" }).getByRole("link", { name: "Flow mode" }).click();
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
  await expect(firstSource).toMatch(/demo-couple-1\.webp/);

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
  await page.getByRole("button", { name: "Studio menu" }).click();
  await page
    .getByRole("navigation", { name: "Studio menu" })
    .getByRole("button", { name: "Wedding Page" })
    .click();

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
    /justify-self-start.*uppercase|uppercase.*justify-self-start/,
  );
  await expect(page.getByRole("button", { name: "Send memory" })).toHaveClass(/!font-extrabold/);
});

test("wedding page explains guest setup and makes upload availability unmistakable", async ({ page }) => {
  await page.goto("/admin/mary-john");
  await page.getByRole("button", { name: "Studio menu" }).click();
  await page
    .getByRole("navigation", { name: "Studio menu" })
    .getByRole("button", { name: "Wedding Page" })
    .click();

  await expect(page.getByRole("heading", { name: "Set the scene for your guests." })).toBeVisible();
  await expect(page.getByText(/Choose your photo and welcome note/i)).toBeVisible();
  await expect(page.getByLabel("Message for guests")).toBeDisabled();

  const uploadStatus = page.locator("[data-guest-upload-status]");
  await expect(uploadStatus).toHaveAttribute("data-guest-upload-status", "open");
  await expect(uploadStatus).toContainText("Guest uploads are open");
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

test("flow mode keeps every photo and video inside a square stage", async ({ page }) => {
  await page.goto("/admin/mary-john/presentation");
  await page.getByRole("button", { name: "Start flow mode" }).click();

  const mediaStage = page.locator("[data-presentation-media-id]");
  await expect
    .poll(async () => {
      const box = await mediaStage.boundingBox();
      return Boolean(box && Math.abs(box.width - box.height) <= 1);
    })
    .toBe(true);
  await expect(mediaStage.locator("img, video")).toHaveCSS("object-fit", "contain");
});

test("flow mode advances every three seconds without separating a memory from its note", async ({ page }) => {
  await page.goto("/admin/mary-john/presentation");
  await page.getByRole("button", { name: "Start flow mode" }).click();

  const currentMemory = page.locator("[data-presentation-media-id]");
  const caption = page.locator("[data-presentation-caption-media-id]");
  await expect(currentMemory).toHaveAttribute("data-presentation-media-id", "demo-photo-1");
  await expect(caption).toHaveAttribute("data-presentation-caption-media-id", "demo-photo-1");

  await expect.poll(() => page.getByText("2 / 7", { exact: true }).count(), { timeout: 5_000 }).toBe(1);
  await expect(currentMemory).toHaveAttribute("data-presentation-media-id", "demo-photo-2");
  await expect(caption).toHaveAttribute("data-presentation-caption-media-id", "demo-photo-2");
  await expect(caption).toContainText("Ava Bennett");

  await page.waitForTimeout(650);
  await expect(page.getByText("2 / 7", { exact: true })).toBeVisible();
  await expect(currentMemory).toHaveAttribute("data-presentation-media-id", "demo-photo-2");
  await expect(caption).toHaveAttribute("data-presentation-caption-media-id", "demo-photo-2");
});
