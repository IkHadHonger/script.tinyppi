// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 U3knOwn

// The dashboard in Chromium against the real server (tests/browser/serve.py,
// Kodi faked): every tab, the format badges, search, the question a press
// asks and what it sends, a show with its seasons, the history and the
// report.  Fails on any script error the page raises.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { chromium, webkit } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOKEN = "BROWSER1";

let server, browser, context, page, base;
const problems = [];
const posts = [];
const addresses = [];

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
  context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
                                             isMobile: mobile, hasTouch: mobile,
                                             reducedMotion: "reduce" });
  await context.addInitScript((token) => {
    try { localStorage.setItem("tinyppi.token", token); } catch { /* Error pages may deny storage before the real frame loads. */ }
  }, TOKEN);
  page = await context.newPage();
  page.on("pageerror", (error) => problems.push("page error: " + error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push("console: " + message.text());
  });
  page.on("request", (request) => {
    addresses.push(request.url());
    // The session the token buys on connect is no write.
    if (request.method() === "POST" && !request.url().endsWith("/api/session")) {
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

test("the chapters ahead sit on the bar, a mouse brings up the rest, a click jumps", async () => {
  await page.mouse.move(0, 0);
  await page.waitForSelector(".chapter-dot");
  // Chapter 2 plays at 8.3 %: its own start (4.2 %) is behind the bar, the
  // first starts at 0 and has none.
  assert.equal(await page.locator(".chapter-dot").count(), 2, "only the ones ahead");
  // The stubs hand out string ids for words (see tests/stubs/xbmcaddon.py).
  assert.equal(await page.locator("#chapterNow").innerText(), "#32367 · Arrival");

  // Every dot sits on the middle of the fill's run, whatever it is laid over.
  const bar = await page.locator("#track").boundingBox();
  const boxes = () => page.locator(".chapter-dot").evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().toJSON()));
  const dots = await boxes();
  for (const dot of dots) {
    const middle = dot.y + dot.height / 2;
    assert.ok(Math.abs(middle - (bar.y + 8 + 6)) <= 1, `dot at ${middle}, bar at ${bar.y}`);
    assert.ok(dot.x >= bar.x && dot.x + dot.width <= bar.x + bar.width);
  }

  const third = dots[0];
  await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2);
  await page.waitForFunction(() => document.querySelectorAll(".chapter-dot").length === 3);
  await page.waitForSelector("#chapterTip:not(.hidden)");
  assert.equal(await page.locator("#chapterTip").innerText(), "#32366 · 01:00:00");
  const tip = await page.locator("#chapterTip").boundingBox();
  assert.ok(tip.y + tip.height <= bar.y + 8, "the name stands over the bar");

  // The one already seen, now that the mouse has brought it up.
  const [seen] = await boxes();
  await page.mouse.move(seen.x + seen.width / 2, seen.y + seen.height / 2);
  await page.waitForFunction(() => document.querySelector("#chapterTip").textContent.includes("00:05:00"));
  assert.equal(await page.locator(".chapter-dot.played").count(), 1);

  const [request] = await Promise.all([
    page.waitForRequest((sent) => sent.method() === "POST" && sent.url().endsWith("/api/command")),
    page.mouse.click(seen.x + seen.width / 2, seen.y + seen.height / 2),
  ]);
  assert.deepEqual(JSON.parse(request.postData()), { action: "chapter_goto", value: 2 });
  await page.mouse.move(0, 0);
  await page.waitForSelector("#chapterTip.hidden", { state: "attached" });
  await page.waitForFunction(() => document.querySelectorAll(".chapter-dot").length === 2);
});

test("a pointer drags the bar, and the box hears once, where it let go", async (t) => {
  // A phone of its own: touch, and a narrow screen.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 },
                                           hasTouch: true, isMobile: true });
  t.after(() => phone.close());
  await phone.addInitScript((token) => localStorage.setItem("tinyppi.token", token), TOKEN);
  const handset = await phone.newPage();
  const errors = [];
  handset.on("pageerror", (error) => errors.push(error.message));
  const sent = [];
  handset.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/api/command")) {
      sent.push(JSON.parse(request.postData()));
    }
  });
  await handset.goto(base + "#live");
  await handset.waitForSelector(".track.seekable");
  const bar = await handset.locator("#track").boundingBox();
  const y = bar.y + bar.height / 2;
  // Chromium exposes a real touch drag through CDP. WebKit exposes taps
  // only, so exercise the same pointer handler with its real mouse input.
  const cdp = process.env.BROWSER === "webkit" ? null : await phone.newCDPSession(handset);
  const touch = async (type, at) => {
    if (cdp) return cdp.send("Input.dispatchTouchEvent", {
      type, touchPoints: type === "touchEnd" ? [] : [{ x: bar.x + bar.width * at, y }] });
    if (type === "touchEnd") return handset.mouse.up();
    await handset.mouse.move(bar.x + bar.width * at, y);
    if (type === "touchStart") await handset.mouse.down();
  };

  await touch("touchStart", 0.2);
  for (let step = 1; step <= 10; step++) await touch("touchMove", 0.2 + step * 0.04);
  // Chromium hands a finger's moves on to the page once a frame, so the last
  // may still be on its way: wait for the fill to arrive under the finger
  // rather than read it at once.
  const fill = () => handset.evaluate(() => parseFloat(document.getElementById("bar").style.width));
  try {
    await handset.waitForFunction(() =>
      Math.abs(parseFloat(document.getElementById("bar").style.width) - 60) < 0.5, null, { timeout: 5000 });
  } catch {
    assert.fail(`the fill under the finger, not ${await fill()}`);
  }
  const held = await handset.evaluate(() => ({
    dots: document.querySelectorAll(".chapter-dot").length,
    clock: document.getElementById("tElapsed").textContent,
    percent: parseFloat(document.getElementById("bar").style.width),
  }));
  assert.equal(held.dots, 3, "every chapter while the finger is on the bar");
  // Browser pointer coordinates are rounded to physical pixels. The clock
  // must follow the actual fill, rather than an idealised exactly-60% point.
  const seconds = held.clock.split(":").reduce((sum, part) => sum * 60 + Number(part), 0);
  assert.ok(Math.abs(seconds - 7200 * held.percent / 100) <= 1, "the clock follows the fill");
  assert.deepEqual(sent, [], "nothing is asked of the box mid-drag");

  const asked = handset.waitForRequest((request) =>
    request.method() === "POST" && request.url().endsWith("/api/command"));
  await touch("touchEnd");
  const command = JSON.parse((await asked).postData());
  assert.equal(command.action, "seek_percent");
  assert.ok(Math.abs(command.value - 60) < 0.5, `seeks to ${command.value}`);
  await handset.waitForFunction(() => document.querySelectorAll(".chapter-dot").length === 2);
  assert.equal(sent.length, 1, "once");
  assert.deepEqual(errors, []);
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
  await context.addInitScript((token) => {
    try { localStorage.setItem("tinyppi.token", token); } catch { /* Error pages may deny storage before the real frame loads. */ }
  }, TOKEN);
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
    await main.keyboard.press("Shift");
    await main.locator('.tab[data-tab="films"]').click();
    await main.waitForSelector("#filmGrid .film");
    assert.equal(await main.locator("#filmGrid .film").count(), 20);
    await main.keyboard.press("Shift");
    await main.locator('.tab[data-tab="series"]').click();
    await main.waitForSelector("#seriesGrid .film");
    assert.equal(await main.locator("#seriesGrid .film").count(), 5);
  } finally {
    await context.close();
  }
});

test("the token travels in headers only; the stream reads with an HttpOnly session", async () => {
  assert.ok(addresses.some((address) => address.endsWith("/api/stream")));
  assert.deepEqual(addresses.filter((address) => /token=/i.test(address)), []);
  const [session] = (await context.cookies(base + "api/state")).filter((cookie) => cookie.name === "tinyppi_session");
  assert.ok(session, "the session cookie is set");
  assert.equal(session.httpOnly, true);
  assert.equal(session.sameSite, "Strict");
  assert.equal(session.path, "/api/");
  assert.equal(await page.evaluate(() => document.cookie), "");
});

test("a cross-site embedded box reads live state and artwork without cookies", async () => {
  await context.close();
  const mobile = process.env.BROWSER === "webkit";
  const isolated = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce"
  });
  // Model a user who has allowed access to their local CoreELEC boxes.
  if (!mobile) await isolated.grantPermissions(["local-network-access"]);
  const seen = [];
  const parentAddress = base.replace("127.0.0.1", "127.0.0.2");
  try {
    await isolated.route(parentAddress + "container", route => route.fulfill({
      contentType: "text/html",
      body: `<iframe style="width:100%;height:800px" src="${base}?embedded=1#live"></iframe>`
    }));
    await isolated.route("**/api/art?**", route => route.fulfill({
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jHHsAAAAASUVORK5CYII=", "base64")
    }));
    isolated.on("request", request => {
      if (/\/api\/(stream|art)/.test(request.url())) seen.push(request);
    });
    isolated.on("requestfailed", request => console.error("embedded network:", request.url(), request.failure()));
    const parent = await isolated.newPage();
    parent.on("console", message => { if (message.type() === "error") console.error("embedded:", message.text()); });
    parent.on("pageerror", error => console.error("embedded page:", error.message));
    await parent.goto(parentAddress + "container");
    const box = parent.frameLocator("iframe");
    try {
      await box.locator("#dlgOk").waitFor({ state: "attached", timeout: 10000 });
    } catch (error) {
      console.error("embedded frames:", parent.frames().map(frame => frame.url()));
      console.error("parent document:", await parent.content());
      throw error;
    }
    const frame = parent.frames().find(frame => frame.url().startsWith(base));
    await frame.evaluate(() => window.TinyPPI.askToken());
    await box.locator("#tokenInput").fill(TOKEN);
    await box.locator("#dlgOk").click();
    await box.locator('#status[data-state="live"]').waitFor();
    await box.locator("#title").filter({ hasText: "Film" }).waitFor();
    assert.equal(await frame.evaluate(() => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth);
      image.onerror = () => reject(new Error("artwork did not load"));
      window.TinyPPI.loadArtwork(image, "/api/art?kind=poster&v=12345678");
    })), 1);
    // Exercise the real poster rendering path, including asynchronous token
    // fetches and data URLs, rather than only checking that the image loads.
    await frame.evaluate(() => {
      // Freeze the real stream before injecting poster snapshots; a live tick
      // must not replace the test's poster while its artwork is loading.
      window.TinyPPI.setStreamEnabled(false);
      window.TinyPPI.panels.update({ playing: true, title: "Tint test",
        art: { poster: "tint-first" }, groups: [], metrics: {} });
    });
    await frame.waitForFunction(() =>
      document.getElementById("nowCard").style.getPropertyValue("--cover-accent-rgb") !== "");
    assert.match(await box.locator("#poster").getAttribute("src"), /^data:image\//);
    assert.ok(await box.locator("#nowCard").evaluate(element =>
      element.style.getPropertyValue("--cover-gradient").includes("gradient(")));
    await frame.evaluate(() => {
      window.TinyPPI.panels.update({ playing: true, title: "Next poster",
        art: { poster: "tint-next" }, groups: [], metrics: {} });
    });
    await frame.waitForFunction(() =>
      document.getElementById("poster").dataset.artworkUrl?.includes("tint-next") &&
      document.getElementById("nowCard").style.getPropertyValue("--cover-accent-rgb") !== "");
    const authenticated = seen.filter(request => request.headers()["x-tinyppi-token"] === TOKEN);
    assert.ok(authenticated.some(request => request.url().includes("/api/stream")));
    assert.ok(authenticated.some(request => request.url().includes("/api/art?")));
    for (const request of authenticated) {
      assert.equal(request.headers().cookie, undefined);
      assert.ok(!/token=/i.test(request.url()));
    }
    assert.deepEqual(await isolated.cookies(), []);
  } finally {
    await isolated.close();
  }
});

test("main dashboard exposes unauthorized remote cards and accepts their token in-frame", async () => {
  const mobile = process.env.BROWSER === "webkit";
  const isolated = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile: mobile, hasTouch: mobile, reducedMotion: "reduce"
  });
  if (!mobile) await isolated.grantPermissions(["local-network-access"]);
  const parentAddress = base.replace("127.0.0.1", "127.0.0.2");
  try {
    await isolated.addInitScript(({token, origin}) => {
      if (location.origin === origin) localStorage.setItem("tinyppi.token", token);
    }, {token: TOKEN, origin: new URL(parentAddress).origin});
    await isolated.route(parentAddress + "**", async route => {
      const url = route.request().url().replace(parentAddress, base);
      if (url.endsWith('/api/stream')) {
        await route.fulfill({contentType: 'text/event-stream', body: ': test parent stream\n\n'});
        return;
      }
      if (url.endsWith("/api/hello")) {
        await route.fulfill({json: {main_dashboard: true, dashboard_trust: [new URL(base).origin]}});
      } else if (new URL(url).pathname.startsWith('/api/')) {
        await route.fulfill({json: {playing: false, control: false}});
      } else {
        const path = new URL(url).pathname;
        const contentType = path.endsWith('.js') ? 'text/javascript' :
          path.endsWith('.css') ? 'text/css' : 'text/html';
        try {
          const body = await readFile(join(HERE, '../../resources/web', path === '/' ? 'index.html' : path));
          await route.fulfill({contentType, body});
        } catch {
          await route.fulfill({status: 404, body: ''});
        }
      }
    });
    const parent = await isolated.newPage();
    parent.on("pageerror", error => problems.push(error.message));
    await parent.goto(parentAddress + "#live");
    const selector = `iframe[src^="${base}"]`;
    const box = parent.frameLocator(selector);
    await box.locator('#status[data-state="down"]').waitFor({state: 'attached'});
    await parent.locator(selector + ':not(.box-idle)').waitFor();
    const remote = parent.frames().find(frame => frame.url().startsWith(base));
    // A sibling cannot trigger credential UI, even using the parent's origin.
    await remote.evaluate(origin => dispatchEvent(new MessageEvent('message', {
      origin, source: window, data: {type: 'tinyppi-ask-token'}
    })), new URL(parentAddress).origin);
    assert.equal(await box.locator('#tokenDialog').evaluate(d => d.open), false);
    await parent.evaluate(() => { location.hash = 'settings'; });
    await parent.getByRole('button', {name: /127\.0\.0\.1 · Token invoeren in dit dashboard/}).click();
    await box.locator('#tokenDialog[open]').waitFor();
    await box.locator('#tokenInput').fill(TOKEN);
    await box.locator('#dlgOk').click();
    await box.locator('#status[data-state="live"]').waitFor();
    await box.locator('#title').filter({hasText: 'Film'}).waitFor();
    await parent.locator(selector + ':not(.box-idle)').waitFor();
    assert.equal(await parent.evaluate(() => localStorage.getItem('tinyppi.token')), TOKEN);
  } finally {
    await isolated.close();
  }
});

test("relayed card needs only the local dashboard and keeps remote tokens separate", async () => {
  const isolated = await browser.newContext();
  const origin = 'http://100.76.102.114:8099';
  const requests = [];
  let remoteToken = false;
  try {
    await isolated.addInitScript(token => localStorage.setItem('tinyppi.token', token), TOKEN);
    isolated.on('request', request => requests.push(request));
    await isolated.route('**/api/relay**', async route => {
      const request = route.request();
      assert.equal(request.headers()['x-tinyppi-token'], TOKEN);
      const url = new URL(request.url());
      if (url.pathname === '/api/relay/token') {
        assert.deepEqual(request.postDataJSON(), {origin, token: 'REMOTE11'});
        remoteToken = true;
        await route.fulfill({json: {ok: true}});
      } else if (!remoteToken) {
        await route.fulfill({status: 409, json: {error: 'remote token required'}});
      } else if (url.searchParams.get('path') === '/api/state') {
        await route.fulfill({json: {playing: true, control: false, title: 'Eric via Cube',
          groups: [], metrics: {}, art: {}, vs10: {}, position: '00:01:00'}});
      } else {
        await route.fulfill({json: {user: 'Eric', linked: true}});
      }
    });
    const local = await isolated.newPage();
    local.on('pageerror', error => problems.push(error.message));
    await local.goto(base + '?' + new URLSearchParams({embedded: '1', relay: origin}) + '#live');
    await local.locator('#status[data-state="down"]').waitFor();
    await local.evaluate(() => window.TinyPPI.askToken());
    assert.match(await local.locator('#dlgTitle').textContent(), /100\.76\.102\.114/);
    await local.locator('#tokenInput').fill('REMOTE11');
    await local.locator('#dlgOk').click();
    await local.locator('#title').filter({hasText: 'Eric via Cube'}).waitFor();
    assert.equal(await local.evaluate(() => localStorage.getItem('tinyppi.token')), TOKEN);
    assert.equal(await local.evaluate(() => window.TinyPPI.command('stop')), false);
    assert.ok(requests.every(request => new URL(request.url()).origin === new URL(base).origin));
    assert.ok(!requests.some(request => /\/api\/(stream|command|mode)/.test(request.url())));
    assert.ok(requests.every(request => !request.url().includes('REMOTE11')));
  } finally { await isolated.close(); }
});

test("main dashboard embeds a saved relay locally without replacing its own player", async () => {
  const isolated = await browser.newContext();
  const origin = 'http://100.76.102.114:8099';
  const requests = [];
  try {
    await isolated.addInitScript(token => localStorage.setItem('tinyppi.token', token), TOKEN);
    isolated.on('request', request => requests.push(request));
    await isolated.route('**/api/hello', route => route.fulfill({json: {
      main_dashboard: true, dashboard_trust: [origin], relay_origins: [origin],
      control: true, library: true, series: true
    }}));
    await isolated.route('**/api/relay?**', route => route.fulfill({json:
      new URL(route.request().url()).searchParams.get('path') === '/api/state' ?
        {playing: true, control: false, title: 'Eric via Cube', groups: [], metrics: {}, art: {}, vs10: {}} :
        {user: 'Eric', linked: true}
    }));
    const local = await isolated.newPage();
    local.on('pageerror', error => problems.push(error.message));
    await local.goto(base + '#live');
    const remote = local.frameLocator('iframe[src*="relay="]');
    await remote.locator('#title').filter({hasText: 'Eric via Cube'}).waitFor();
    await local.locator('#title').filter({hasText: 'Film'}).waitFor({state: 'attached'});
    await local.locator('iframe[src*="relay="]:not(.box-idle)').waitFor();
    assert.ok(requests.every(request => new URL(request.url()).origin === new URL(base).origin));
    assert.match(await local.locator('#title').textContent(), /Film/);
  } finally { await isolated.close(); }
});

test("no script errors anywhere", () => {
  assert.deepEqual(problems, []);
});
