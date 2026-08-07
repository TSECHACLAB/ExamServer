import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

const THEMES = [
  "modern-light",
  "modern-dark",
  "simple-light",
  "simple-dark",
  "high-contrast",
] as const;

const ACTIVE_SESSION =
  "/exam/general/session?mode=exam&count=2&timer=0&random=0&bucket=other";

test.describe("演習導線 DADS", () => {
  for (const theme of THEMES) {
    test(`${theme}: 選択・設定・受験に横スクロールと重大なaxe違反がない`, async ({ page }, testInfo) => {
      await setTheme(page, theme);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.getByRole("heading", { name: "演習を選ぶ" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertNoSeriousAxeViolations(page);
      await attachScreenshot(page, testInfo, `selection-${theme}`);

      await page.getByRole("link", { name: /それ以外/ }).click();
      await page.getByRole("link", { name: /一般常識/ }).click();
      await expect(page.getByRole("heading", { name: "一般常識\(demo\)" })).toBeVisible();
      await expect(page.getByText("合格基準", { exact: true }).locator("..")).toContainText("60%");
      await assertNoHorizontalOverflow(page);
      await attachScreenshot(page, testInfo, `setup-${theme}`);

      await page.goto(ACTIVE_SESSION);
      await expect(
        page.getByText("日本の国花として広く親しまれている花はどれか？"),
      ).toBeVisible();
      await expect(page.getByText("現在位置：問1 / 2")).toBeVisible();
      await expect(page.getByText("回答済み 0 / 2")).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertMainIsNotCovered(page);
      await assertNoSeriousAxeViolations(page);
      await attachScreenshot(page, testInfo, `active-${theme}`);
    });
  }

  test("実APIで回答、終了前確認、採点、結果まで進む", async ({ page }, testInfo) => {
    await page.goto(ACTIVE_SESSION);
    await page.getByRole("radio", { name: "桜" }).check();
    await expect(page.getByText("回答済み 1 / 2")).toBeVisible();
    await page.getByRole("button", { name: "次へ" }).click();
    await page.getByRole("radio", { name: "H2O" }).check();
    await page.getByRole("button", { name: "回答状況を確認" }).click();

    await expect(page.getByRole("heading", { name: "回答状況を確認" })).toBeVisible();
    await expect(page.getByText("済 回答済み").locator("..")).toContainText("2問");
    await assertNoSeriousAxeViolations(page);
    await attachScreenshot(page, testInfo, "review");

    await page.getByRole("button", { name: "採点する" }).click();
    await expect(page.getByRole("heading", { name: "演習結果" })).toBeVisible();
    await expect(page.getByText("○ 合格")).toBeVisible();
    await expect(page.getByText("得点は100%、合格基準は60%です。")).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNoSeriousAxeViolations(page);
    await attachScreenshot(page, testInfo, "result");
  });

  test("不正URLを理由付きで拒否する", async ({ page }) => {
    await page.goto(
      "/exam/general/session?mode=wrong&count=0&timer=yes&random=2&domains=missing",
    );
    await expect(
      page.getByRole("heading", { name: "開始条件を確認できませんでした" }),
    ).toBeVisible();
    await expect(page.getByText(/mode は exam または drill/)).toBeVisible();
    await expect(page.getByText(/count は1以上の整数/)).toBeVisible();
    await expect(page.getByText(/存在しない出題範囲/)).toBeVisible();
    await expect(page.getByRole("link", { name: "設定画面に戻る" })).toBeVisible();
    await assertNoSeriousAxeViolations(page);
  });

  test("キーボードだけで回答から終了前確認へ進める", async ({ page }) => {
    await page.goto(ACTIVE_SESSION);
    const answer = page.getByRole("radio", { name: "桜" });
    await tabTo(page, page.getByRole("radio", { name: "バラ" }));
    await page.keyboard.press("ArrowDown");
    await expect(answer).toBeChecked();

    const next = page.getByRole("button", { name: "次へ" });
    await tabTo(page, next);
    await page.keyboard.press("Enter");
    await expect(page.getByText("水の化学式として正しいものはどれか？")).toBeVisible();

    const secondAnswer = page.getByRole("radio", { name: "H2O" });
    await tabTo(page, page.getByRole("radio", { name: "CO2" }));
    await page.keyboard.press("ArrowDown");
    await expect(secondAnswer).toBeChecked();
    const review = page.getByRole("button", { name: "回答状況を確認" });
    await tabTo(page, review);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "回答状況を確認" })).toBeVisible();
  });

  test("モバイル問題一覧は初期フォーカス、Esc、呼出元復帰を満たす", async ({
    page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "モバイル専用確認");
    await page.goto(ACTIVE_SESSION);
    const trigger = page.getByRole("button", { name: "問題一覧" });
    await trigger.focus();
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "問題一覧" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "問題一覧" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("Windows強制カラーでも状態文字と操作を維持する", async ({ page }, testInfo) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto(ACTIVE_SESSION);
    if (testInfo.project.name.startsWith("mobile")) {
      await page.getByRole("button", { name: "問題一覧" }).click();
    }
    await expect(
      page.getByRole("button", { name: /問1 未回答.*現在の問題/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "？ 分からない" })).toBeVisible();
    await assertNoHorizontalOverflow(page);
    await assertNoSeriousAxeViolations(page);
  });

  test("200%ブラウザズーム相当でも主要操作を覆わない", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("desktop"), "デスクトップ拡大確認");
    await page.setViewportSize({ width: 720, height: 450 });
    await page.goto(ACTIVE_SESSION);
    await expect(page.getByRole("radio", { name: "桜" })).toBeVisible();
    await expect(page.getByRole("button", { name: "次へ" })).toBeVisible();
    await assertMainIsNotCovered(page);
  });
});

async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((nextTheme) => {
    localStorage.setItem("examserver-theme", nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, theme);
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

async function assertMainIsNotCovered(page: Page) {
  const main = await page.locator("main").boundingBox();
  const footer = await page.locator("footer").last().boundingBox();
  expect(main).not.toBeNull();
  expect(footer).not.toBeNull();
  expect(main!.y + main!.height).toBeLessThanOrEqual(footer!.y + 1);
}

async function assertNoSeriousAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(blocking, blocking.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

async function tabTo(page: Page, target: Locator) {
  const seen: string[] = [];
  for (let index = 0; index < 80; index += 1) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((element) => element === document.activeElement)) return;
    seen.push(
      await page.evaluate(() => {
        const active = document.activeElement;
        if (!(active instanceof HTMLElement)) return "none";
        return `${active.tagName}:${active.getAttribute("aria-label") ?? active.innerText.slice(0, 32)}`;
      }),
    );
  }
  throw new Error(`キーボードフォーカスが対象操作へ到達しませんでした。${seen.join(" -> ")}`);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const artifactDirectory = "artifacts/playwright";
  const screenshotPath = `${artifactDirectory}/${name}-${testInfo.project.name}.png`;
  await mkdir(artifactDirectory, { recursive: true });
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await testInfo.attach(`${name}-${testInfo.project.name}`, {
    path: screenshotPath,
    contentType: "image/png",
  });
}
