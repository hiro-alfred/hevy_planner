// Drives an already-installed Chrome over the DevTools Protocol: navigate,
// click by visible text, report what rendered, screenshot.
//
// Why this exists: most of this app's UI only appears after a click — the swap
// picker, the edit form, every disclosure — and `chrome --headless
// --screenshot` cannot click. That left the interactive half of the app
// permanently unverified. This closes that gap with NO new dependency: Node 22
// ships a global WebSocket, and Chrome is already on the machine.
//
// Usage (Chrome must already be listening on 9222):
//
//   chrome --headless=new --disable-gpu --force-prefers-reduced-motion \
//     --remote-debugging-port=9222 --user-data-dir=<scratch> \
//     --window-size=900,1400 about:blank
//
//   node scripts/cdp-drive.mjs <url> "<Click|fill:#id=value|Then This>" <out.png> [selector]
//
// Clicks match on visible-text PREFIX, so "More alternatives" hits the button
// labelled "More alternatives (7 left)" without hard-coding a count. The
// optional selector dumps innerText of everything matching it, which is what
// makes the run self-describing in a terminal rather than only in the PNG.
//
// A step written `fill:<css selector>=<value>` types into a field instead of
// clicking. Needed because the forms behind these disclosures are React
// CONTROLLED inputs: assigning `.value` updates the DOM and React's state never
// hears about it, so the next render puts the old value straight back. The
// native setter plus a bubbled `input` event is what React's synthetic event
// system actually listens for.
import { writeFileSync } from "node:fs";

const [, , url, clickText = "", outPath, selector = ".ui-opt"] = process.argv;
if (!url || !outPath) {
  console.error("usage: node scripts/cdp-drive.mjs <url> <clicks|separated> <out.png> [selector]");
  process.exit(1);
}

/**
 * Settle time after a click. Server actions dominate; local paging is instant.
 * Overridable because a full history backfill walks Hevy ten workouts per
 * request and takes minutes, not seconds — the default would screenshot a
 * button still reading "Re-syncing…".
 */
const SETTLE_MS = Number(process.env.CDP_SETTLE_MS) || 4000;

const targets = await (await fetch("http://127.0.0.1:9222/json")).json();
const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
if (!page) throw new Error("No page target on 127.0.0.1:9222 — is Chrome running with --remote-debugging-port?");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener("open", resolve, { once: true });
  ws.addEventListener("error", reject, { once: true });
});

let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);

  // Events carry no id. The only one that matters is a native dialog: a
  // window.confirm blocks the renderer until something answers it, so a
  // confirm-guarded button (the sync buttons, every destructive action) would
  // otherwise hang the whole run instead of clicking.
  if (message.method === "Page.javascriptDialogOpening") {
    console.log(`dialog accepted: ${message.params?.message ?? ""}`);
    ws.send(
      JSON.stringify({
        id: (nextId += 1),
        method: "Page.handleJavaScriptDialog",
        params: { accept: true },
      }),
    );
    return;
  }

  const resolve = pending.get(message.id);
  if (!resolve) return;
  pending.delete(message.id);
  resolve(message);
});

function send(method, params = {}) {
  const id = (nextId += 1);
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const reply = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return reply.result?.result?.value;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url });
await sleep(SETTLE_MS);

for (const step of clickText.split("|").filter(Boolean)) {
  const fill = step.startsWith("fill:") ? step.slice(5).split("=") : null;

  const result = fill
    ? await evaluate(`
        (() => {
          const field = document.querySelector(${JSON.stringify(fill[0])});
          if (!field) return "NOT FOUND: " + ${JSON.stringify(fill[0])};
          const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, "value").set;
          setter.call(field, ${JSON.stringify(fill.slice(1).join("="))});
          field.dispatchEvent(new Event("input", { bubbles: true }));
          return "filled: " + ${JSON.stringify(fill[0])} + " = " + field.value;
        })()
      `)
    : await evaluate(`
        (() => {
          const target = [...document.querySelectorAll("button")]
            .find((b) => b.textContent.trim().startsWith(${JSON.stringify(step)}));
          if (!target) return "NOT FOUND: " + ${JSON.stringify(step)};
          target.click();
          return "clicked: " + ${JSON.stringify(step)};
        })()
      `);

  console.log(result);
  await sleep(SETTLE_MS);
}

const rendered = await evaluate(`
  [...document.querySelectorAll(${JSON.stringify(selector)})]
    .map((node) => node.innerText.replace(/\\s*\\n\\s*/g, " | "))
    .join("\\n")
`);
console.log(rendered || `(nothing matched ${selector})`);

const shot = await send("Page.captureScreenshot", { captureBeyondViewport: true });
writeFileSync(outPath, Buffer.from(shot.result.data, "base64"));
console.log(`screenshot: ${outPath}`);
ws.close();
