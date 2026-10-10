// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 U3knOwn

// The dashboard in Chromium against the real server (tests/browser/serve.py,
// Kodi faked): every tab, the format badges, search, the question a press
// asks and what it sends, a show with its seasons, the history and the
// report.  Fails on any script error the page raises.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN = "BROWSER1";

let server, browser, page, base;
const problems = [];
const posts = [];

before(async () => {
  server = spawn(process.env.PYTHON || "python3", ["-I", join(HERE, "serve.py")],
                 { stdio: ["ignore", "pipe", "inherit"] });
  const port = await new Promise((resolve, reject) => {
    server.on("exit", (code) => reject(new Error("server exited with " + code)));
    server.stdout.on("data", (chunk) => {
      const found = /PORT (\d+)/.exec(String(chunk));
      if (found) resolve(found[1]);
    });
  });
  base = `http://127.0.0.1:${port}/`;
  const mobile = process.env.BROWSER === "webkit";
  browser = await (mobile ? webkit : chromium).launch();
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
                                             isMobile: mobile, hasTouch: mobile,
                                             reducedMotion: "reduce" });
  await context.addInitScript((token) => localStorage.setItem("tinyppi.token", token), TOKEN);
  page = await context.newPage();
  page.on("pageerror", (error) => problems.push("page error: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push("console: " + message.text());
  });
  page.on("request", (request) => {
    if (request.method() === "POST") {
      posts.push([new URL(request.url()).pathname, JSON.parse(request.postData() || "{}")]);
    }
  });
  await page.goto(base + "#live");
});

after(async () => {
  await browser?.close();
  server?.kill();
});

const tab = async (name) => {
  // A slow first connection can outlast the navigation's idle timer.
  // Wake it through real input, just as a user would; do not force clicks.
  await page.keyboard.press("Shift");
  await page.click(`.tab[data-tab="${name}"]`);
};
const texts = (selector) => page.locator(selector).allInnerTexts();

test("the live tab connects and shows the format badges", async () => {
  await page.waitForSelector('#status[data-state="live"]');
  await page.waitForFunction(() => document.querySelectorAll(".format").length >= 5);
  const badges = await texts(".format");
  for (const badge of ["UHD", "DV P7.6 FEL", "TrueHD Atmos", "Atmos", "7.1"]) {
    assert.ok(badges.includes(badge), `${badge} in ${badges}`);
  }
});

test("films: the wall, search and clearing it", async () => {
  await tab("films");
  await page.waitForFunction(() => document.querySelectorAll("#filmGrid .film").length === 20);
  await page.fill("#filmSearch", "Film 1");
  // "Film 10" to "Film 19"; the titles are numbered with two digits.
  await page.waitForFunction(() =>
    [...document.querySelectorAll("#filmGrid .film")].filter((tile) => !tile.hidden).length === 10);
  assert.equal(await page.textContent("#filmsCount"), "10 / 20");
  await page.click("#filmSearchClear");
  assert.equal(await page.inputValue("#filmSearch"), "");
  assert.equal(await page.textContent("#filmsCount"), "20");
});

test("a press on a film asks, and marking it sends the id", async () => {
  await page.locator("#filmGrid .film").nth(4).click();
  await page.waitForSelector("#markDialog[open]");
  // Listened for before the press: the wall may be read again (the library
  // moved) before the click itself has returned.
  const [request] = await Promise.all([
    page.waitForRequest((sent) => sent.method() === "POST" && sent.url().endsWith("/api/watched")),
    page.waitForResponse((answer) => answer.url().includes("/api/library")),
    page.click("#markWatched"),
  ]);
  const body = JSON.parse(request.postData());
  assert.equal(typeof body.movieid, "number");
  assert.equal(typeof body.watched, "boolean");
  await page.waitForFunction(() => !document.querySelector("#markDialog[open]"));
});

test("cancelling the question sends nothing", async () => {
  const before = posts.length;
  await page.locator("#filmGrid .film").first().click();
  await page.waitForSelector("#markDialog[open]");
  await page.click("#markCancel");
  await page.waitForFunction(() => !document.querySelector("#markDialog[open]"));
  assert.equal(posts.length, before);
});

test("series: a show opens with its seasons and episodes", async () => {
  await tab("series");
  await page.waitForFunction(() => document.querySelectorAll("#seriesGrid .film").length === 5);
  await page.locator("#seriesGrid .film").nth(1).click();
  await page.waitForSelector("#markDialog[open]");
  await page.click("#markPlay");
  await page.waitForSelector(".seasonfold");
  assert.equal(await page.locator(".seasonfold").count(), 2);
  await page.locator(".seasonfold .season").first().click();
  await page.waitForFunction(() => document.querySelector(".seasonepisodes")?.children.length > 0);
  await page.click("#seriesBack");
  await page.waitForFunction(() => document.querySelectorAll(".seasonfold").length === 0);
});

test("history: the events are worded for people", async () => {
  await tab("history");
  await page.waitForFunction(() => document.body.innerText.includes("Deutsch"));
  const body = await page.locator("body").innerText();
  assert.ok(body.includes("77 °C"));
  assert.ok(!body.includes("#2 · GER"), "track numbers and codes are dropped");
});

test("metadata and settings tabs open", async () => {
  await tab("metadata");
  await page.waitForSelector("#tab-metadata:not([hidden])");
  await tab("settings");
  await page.waitForSelector("#copyBtn");
});

test("main dashboard shares its own iframe state with films and series", async () => {
  const mobile = process.env.BROWSER === "webkit";
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce"
  });
  try {
    await context.route("**/api/hello*", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...await response.json(), main_dashboard: true } });
    });
    const main = await context.newPage();
    main.on("pageerror", error => problems.push(error.message));
    await main.goto(base + "#live");
    try {
      await main.waitForSelector("iframe.user-dashboard:not(.box-idle)", { timeout: 10000 });
    } catch (error) {
      console.error(await main.evaluate(() => ({
        note: document.getElementById("dashboardBoxesStatus").textContent,
        input: document.getElementById("dashboardBoxes").value,
        frames: [...document.querySelectorAll("iframe")].map(f => ({src: f.src, cls: f.className})),
        status: document.getElementById("status").outerHTML
      })));
      throw error;
    }
    await main.locator('.tab[data-tab="films"]').click();
    await main.waitForSelector("#filmGrid .film");
    assert.equal(await main.locator("#filmGrid .film").count(), 20);
    await main.locator('.tab[data-tab="series"]').click();
    await main.waitForSelector("#seriesGrid .film");
    assert.equal(await main.locator("#seriesGrid .film").count(), 5);
  } finally {
    await context.close();
  }
});

test("no script errors anywhere", () => {
  assert.deepEqual(problems, []);
});
