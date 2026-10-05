// Requires a running preview; optionally supply PLAYWRIGHT_MODULE and TEST_BASE_URL.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const baseUrl = process.env.TEST_BASE_URL || "http://localhost:3000";
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${baseUrl}/practice?seed=42`);
    await page.getByRole("button", { name: /試し切り開始/ }).click();
    await page.locator(".own-row .trial-field-card").first().focus();
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    for (let turn = 0; turn < 30 && !await page.locator(".trial-result").count(); turn++) {
      if ((await page.locator(".trial-turn-chip").textContent()).includes("CPU")) { await page.waitForTimeout(1000); continue; }
      await page.locator(".own-row .trial-field-card").first().click();
      const skill = page.locator(".card-frame-skill").first();
      if (await skill.isEnabled()) await skill.click();
      else { await page.keyboard.press("Escape"); await page.getByRole("button", { name: /ターンを終了/ }).click(); }
      await page.waitForTimeout(1100);
    }
    assert.equal(await page.locator(".trial-result h2").textContent(), "勝利");
    await page.getByRole("button", { name: "リプレイを見る", exact: true }).click();
    await page.getByRole("button", { name: "次の一手", exact: true }).click();
    assert.ok((await page.locator(".practice-replay").textContent()).includes("操作 1 /"));
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.ok((await page.evaluate(() => document.activeElement.textContent)).includes("リプレイを見る"));
    await page.getByRole("button", { name: "同じデッキで再戦", exact: true }).click();
    assert.ok((await page.locator(".trial-turn-chip").textContent()).includes("TURN 1"));
    await page.getByRole("button", { name: "演出 通常", exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), "reduced");
    await page.close();
    for (const [width, height] of [[390, 844], [320, 568], [768, 1024]]) {
      const mobile = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
      mobile.on("pageerror", (error) => errors.push(error.message));
      await mobile.goto(`${baseUrl}/practice`);
      await mobile.getByRole("button", { name: /試し切り開始/ }).click();
      await mobile.locator(".own-row .trial-field-card").first().click();
      assert.equal(await mobile.getByRole("dialog").count(), 1);
      await mobile.keyboard.press("Escape");
      const sizes = await mobile.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: window.innerWidth }));
      assert.ok(sizes.scroll <= sizes.width + 1, `horizontal overflow at ${width}px`);
      await mobile.close();
    }
    assert.deepEqual(errors, []);
    console.log("practice keyboard, victory, replay, rematch, motion and mobile UI passed");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
