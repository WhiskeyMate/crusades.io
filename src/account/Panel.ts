// The account dialog: sign in, go premium, and design your arms.

import {
  CHARGES,
  DIVISION_COUNT,
  hexToRGB,
  shieldSVG,
  Skin,
} from "../client/Heraldry";
import { account, accountsEnabled } from "./Account";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SWATCHES = [
  "#c71a21", "#d9632b", "#d9a521", "#7c9a2e", "#2f8a4a", "#1f8a86",
  "#2c6fb3", "#3b46a8", "#6a3fa6", "#a8358f", "#5b4636", "#2b2b33",
];
const DEFAULT: Skin = { color: SWATCHES[0], division: 4, charge: 3 };

let draft: Skin = { ...DEFAULT };
let note = "";

function say(text: string) {
  note = text;
  el("acct-note").textContent = text;
  el("acct-note").hidden = text === "";
}

function drawEditor() {
  const locked = !account.state?.premium;
  el("acct-preview").innerHTML = shieldSVG("preview", hexToRGB(draft.color), 96, draft);
  el("acct-colors").innerHTML =
    SWATCHES.map(
      (c) =>
        `<button class="swatch${c === draft.color ? " on" : ""}" data-c="${c}" style="background:${c}" title="${c}"></button>`,
    ).join("") + `<input type="color" id="acct-custom" value="${draft.color}" title="Any colour" />`;
  el("acct-divisions").innerHTML = Array.from({ length: DIVISION_COUNT }, (_, i) =>
    `<button class="pick${i === draft.division ? " on" : ""}" data-d="${i}">${shieldSVG("preview", hexToRGB(draft.color), 26, { ...draft, division: i })}</button>`,
  ).join("");
  el("acct-charges").innerHTML = CHARGES.map(
    (c, i) => `<button class="pick glyph${i === draft.charge ? " on" : ""}" data-g="${i}">${c}</button>`,
  ).join("");
  for (const b of Array.from(el("acct-editor").querySelectorAll<HTMLButtonElement>("button"))) {
    b.disabled = locked;
    b.onclick = () => {
      if (b.dataset.c) draft.color = b.dataset.c;
      if (b.dataset.d) draft.division = Number(b.dataset.d);
      if (b.dataset.g) draft.charge = Number(b.dataset.g);
      drawEditor();
    };
  }
  const custom = el<HTMLInputElement>("acct-custom");
  custom.disabled = locked;
  custom.oninput = () => {
    draft.color = custom.value;
    el("acct-preview").innerHTML = shieldSVG("preview", hexToRGB(draft.color), 96, draft);
  };
  custom.onchange = drawEditor;
  el("acct-editor").classList.toggle("locked", locked);
  el("acct-lock").hidden = !locked;
  el<HTMLButtonElement>("acct-save").disabled = locked;
}

function draw() {
  const s = account.state;
  const open = el("account-open");
  open.hidden = !accountsEnabled;
  open.innerHTML = s
    ? `${shieldSVG("preview", hexToRGB((account.skin ?? DEFAULT).color), 16, account.skin ?? DEFAULT)} Account`
    : "Sign in";
  el("acct-out").hidden = s !== null;
  el("acct-in").hidden = s === null;
  if (s) {
    el("acct-email").textContent = s.email;
    el("acct-tier").textContent = s.premium ? "Premium" : "Free";
    el("acct-tier").className = s.premium ? "tier premium" : "tier";
    el("acct-upgrade").hidden = s.premium;
    el("acct-billing").hidden = !s.premium;
    drawEditor();
  }
}

export async function initAccountPanel() {
  if (!accountsEnabled) return;
  const dialog = el("account");
  el("account-open").onclick = () => {
    draft = { ...(account.state?.skin ?? DEFAULT) };
    say("");
    draw();
    dialog.hidden = false;
  };
  el("acct-close").onclick = () => (dialog.hidden = true);

  el<HTMLFormElement>("acct-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = el<HTMLInputElement>("acct-mail").value.trim();
    if (!email) return;
    say("Sending…");
    const err = await account.signIn(email);
    say(err ?? `A sign-in link is on its way to ${email}. Open it on this device.`);
  };
  el("acct-signout").onclick = () => void account.signOut();
  el("acct-upgrade").onclick = async () => {
    say("Taking you to checkout…");
    const err = await account.checkout();
    if (err) say(err);
  };
  el("acct-billing").onclick = async () => {
    say("Opening billing…");
    const err = await account.billing();
    if (err) say(err);
  };
  el("acct-save").onclick = async () => {
    const err = await account.saveSkin({ ...draft });
    say(err ?? "Saved. Your next game flies these arms.");
  };

  account.onChange = () => {
    if (account.state?.skin && dialog.hidden) draft = { ...account.state.skin };
    draw();
    if (note) el("acct-note").textContent = note;
  };
  await account.init();
  draw();

  // Back from Stripe: the webhook may land a moment after the redirect.
  const back = new URLSearchParams(location.search).get("checkout");
  if (back) {
    history.replaceState(null, "", location.pathname);
    dialog.hidden = false;
    if (back === "success") {
      say("Thank you. Confirming your payment…");
      for (let i = 0; i < 6 && !account.state?.premium; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        await account.refresh();
      }
      say(
        account.state?.premium
          ? "You are premium. Design your arms below."
          : "Payment received; it can take a minute to show. Reload shortly.",
      );
    } else {
      say("Checkout cancelled. Nothing was charged.");
    }
  }
}
