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

test("privacy notice is reachable and mobile-safe", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Privacy & data" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(
    page.getByRole("heading", { name: "Your memories stay private." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Cloudflare Turnstile Privacy Addendum" }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
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
