import { expect, test, type Page, type Route } from "playwright/test";

const authenticatedSession = {
  state: "authenticated",
  session: {
    id: "owner-session-e2e",
    deviceLabel: "E2E cihazı",
    passwordVersion: 1,
    lastSeenAt: "2026-07-16T10:00:00.000Z",
    expiresAt: "2026-10-14T10:00:00.000Z",
  },
} as const;

const overview = {
  totalMemberships: 3,
  activeMemberships: 2,
  upcomingWeddings: 1,
  expiredMemberships: 1,
  cleanupCandidates: 0,
  guestStorageBytes: 1_048_576,
  systemStorageBytes: 262_144,
  reservedStorageBytes: 0,
  mediaCount: 4,
  unusedTokens: 7,
  latestHealth: {
    supabase_ok: true,
    r2_ok: true,
    checked_at: "2026-07-16T09:30:00.000Z",
  },
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(body),
  });
}

async function mockAuthenticatedOwner(page: Page) {
  await page.route("**/api/owner/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname === "/api/owner/session" && request.method() === "GET") {
      return fulfillJson(route, authenticatedSession);
    }
    if (pathname === "/api/owner/overview") {
      return fulfillJson(route, overview);
    }
    if (pathname === "/api/owner/couples") {
      return fulfillJson(route, { weddings: [], total: 0 });
    }
    if (pathname === "/api/owner/tokens") {
      return fulfillJson(route, { tokens: [], total: 0 });
    }
    if (pathname === "/api/owner/audit") {
      return fulfillJson(route, { audit: [] });
    }
    if (pathname === "/api/owner/cleanup") {
      return fulfillJson(route, { weddings: [] });
    }
    if (pathname === "/api/owner/settings/sessions") {
      return fulfillJson(route, {
        sessions: [
          {
            id: authenticatedSession.session.id,
            password_version: 1,
            device_label: authenticatedSession.session.deviceLabel,
            created_at: "2026-07-16T09:00:00.000Z",
            last_seen_at: authenticatedSession.session.lastSeenAt,
            expires_at: authenticatedSession.session.expiresAt,
            revoked_at: null,
          },
        ],
      });
    }
    if (pathname === "/api/owner/system") {
      return fulfillJson(route, { checks: [] });
    }
    if (pathname === "/api/owner/logout" && request.method() === "POST") {
      return fulfillJson(route, { ok: true });
    }

    return fulfillJson(route, { error: "UNMOCKED_OWNER_ENDPOINT" }, 501);
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
      ),
    )
    .toBe(true);
}

test("owner cockpit navigation and logout work across responsive layouts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await mockAuthenticatedOwner(page);

  await page.goto("/owner");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { name: "Sistemin tek bakışta durumu." })).toBeVisible();
  await expect(page.getByText("Toplam üyelik")).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const desktop = (page.viewportSize()?.width ?? 0) >= 1024;
  const navigation = page.getByRole("navigation", { name: "Owner bölümleri" });
  await expect(navigation).toBeVisible();
  await expect(page.locator('nav[aria-label="Owner bölümleri"]')).toHaveCount(2);

  const sections = [
    { desktop: "Çiftler", mobile: "Çiftler", title: "Her üyeliğin canlı dosyası." },
    { desktop: "Tokenlar", mobile: "Token", title: "Satış anahtarlarını güvenle yönet." },
    { desktop: "Hareketler", mobile: "Hareket", title: "Silinmeyen işlem günlüğü." },
    { desktop: "Temizlik", mobile: "Temizlik", title: "Silme kararı sende kalır." },
    { desktop: "Ayarlar", mobile: "Ayar", title: "Owner erişimini sen kontrol et." },
    {
      desktop: "Sistem Durumu",
      mobile: "Sistem",
      title: "Supabase ve R2 gerçekten çalışıyor mu?",
    },
  ];

  for (const section of sections) {
    await navigation
      .getByRole("button", { name: desktop ? section.desktop : section.mobile, exact: true })
      .click();
    await expect(page.getByRole("heading", { name: section.title })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await page.getByRole("button", { name: "Güvenli çıkış", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Kontrol merkezine dön." })).toBeVisible();
  expect(errors).toEqual([]);
});

test("owner login submits safely and opens the cockpit", async ({ page }) => {
  let authenticated = false;
  let loginPayload: Record<string, unknown> | null = null;

  await page.route("**/api/owner/**", async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());

    if (pathname === "/api/owner/session") {
      return fulfillJson(route, authenticated ? authenticatedSession : { state: "login" });
    }
    if (pathname === "/api/owner/login" && request.method() === "POST") {
      loginPayload = request.postDataJSON() as Record<string, unknown>;
      authenticated = true;
      return fulfillJson(route, { ok: true });
    }
    if (pathname === "/api/owner/overview") {
      return fulfillJson(route, overview);
    }

    return fulfillJson(route, { error: "UNMOCKED_OWNER_ENDPOINT" }, 501);
  });

  await page.goto("/owner");
  await page.getByLabel(/^Owner şifresi/).fill("guvenli-owner-sifresi");
  await page.getByLabel("Bu cihazın adı").fill("Playwright cihazı");
  await page.getByRole("button", { name: "Kokpiti aç" }).click();

  await expect(page.getByRole("heading", { name: "Sistemin tek bakışta durumu." })).toBeVisible();
  expect(loginPayload).toMatchObject({
    password: "guvenli-owner-sifresi",
    deviceLabel: "Playwright cihazı",
  });
  await expectNoHorizontalOverflow(page);
});
