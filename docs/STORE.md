# The store: Crowns, cosmetics and reserved names

Players buy **Crowns** with real money and spend Crowns on things to wear:
territory cloth, their own arms, ship, building and troop styles, bundles of
those, and a reserved house name. Nothing sold changes how the game plays.

Everything is off until the environment variables below are set, so the site
can go on running without it.

## How the money moves

```
 Buy a pack ─▶ Netlify function ─▶ Stripe Checkout (card, Google Pay, Apple Pay)
                                          │ paid
                    Stripe webhook ◀──────┘
                          │  add_crowns(user, amount, session)   (once per session)
                          ▼
                    Supabase: profiles.crowns
 Buy an item ─▶ Supabase function buy_item / buy_bundle / reserve_name
                (checks the price in the catalog table and the balance, in one transaction)
```

- The browser never holds a balance it can change. Crowns are added only by
  the webhook after Stripe's signature checks out, and spent only by database
  functions that look the price up themselves.
- Google Pay and Apple Pay are not separate integrations: they appear on
  Stripe's Checkout page when enabled in the Stripe dashboard and the
  player's device supports them.
- In multiplayer the **game server** tells everyone what each player wears.
  It verifies the player's sign-in token with Supabase and reads their
  equipped items itself, so cosmetics and reserved names cannot be faked.

## Set-up

### 1. Supabase

1. Create a project (or use the one from docs/DEPLOY.md).
2. **SQL editor**: run all of `supabase/schema.sql`. It is safe to re-run;
   do so whenever prices in `src/store/Catalog.ts` change, because the
   `catalog` table at the bottom mirrors them.
3. **Authentication > URL configuration**: Site URL `https://crusades.io`,
   and add it under Redirect URLs.
4. **Authentication > Emails**: connect an SMTP provider before real
   traffic; the built-in mailer allows only a few emails an hour.

### 2. Stripe

1. **Product catalogue**: one product per pack, each with a **one-time**
   price. Names and amounts as in `PACKS` in `src/store/Catalog.ts`:

   | Pack | Crowns granted | Price | Netlify variable |
   | --- | --- | --- | --- |
   | Page | 100 | $4.99 | `STRIPE_PRICE_PAGE` |
   | Squire | 250 | $9.99 | `STRIPE_PRICE_SQUIRE` |
   | Knight | 600 | $19.99 | `STRIPE_PRICE_KNIGHT` |
   | Baron | 1,500 | $49.99 | `STRIPE_PRICE_BARON` |
   | Duke | 3,500 | $99.99 | `STRIPE_PRICE_DUKE` |
   | King | 8,000 | $199.99 | `STRIPE_PRICE_KING` |

   Copy each price id (`price_...`) into the variable named beside it. A
   pack whose variable is unset shows "not on sale yet" instead of failing.
   New Stripe accounts have **Managed Payments** on by default (Stripe is
   the seller of record and handles sales tax and VAT, for a higher fee).
   With it on, give each product a tax code (edit the product, "Product tax
   code"). To sell as yourself instead, set `STRIPE_MANAGED_PAYMENTS=off`
   in Netlify, or turn it off under Settings > Managed Payments.
2. **Settings > Payment methods**: turn on Google Pay and Apple Pay (Apple
   Pay also asks you to register the domain there).
3. **Developers > Webhooks**: endpoint
   `https://crusades.io/.netlify/functions/stripe-webhook`, events
   `checkout.session.completed` and `charge.refunded`. Copy the signing
   secret.

### 3. Netlify environment variables

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | from Supabase > Project settings > API (public) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | same page (the service key is secret) |
| `STRIPE_SECRET_KEY` | `sk_test_...` while testing |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `STRIPE_PRICE_PAGE` … `STRIPE_PRICE_KING` | the six price ids |

Redeploy afterwards.

### 4. The game server

For cosmetics and reserved names to work in multiplayer, the server needs to
ask Supabase who players are. On the bare metal create
`C:\crusades\server.env` with:

```
SUPABASE_URL=https://YOURPROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=the service role key
```

and re-run `server\install-windows.ps1`. The server log then starts with
"accounts: on". Without the file everyone is a guest: the game works, nobody
sees cosmetics, and no name is protected.

## Check it end to end (Stripe test mode)

1. Open the site, click **Sign in · Store**, enter your email, follow the link.
2. **Crowns** tab: buy the Page pack with test card `4242 4242 4242 4242`.
   Back on the site the balance should read 100 within a few seconds.
3. **Troops** tab: you cannot afford Crusaders (500); buy a bigger pack and
   try again. The balance drops by exactly the price.
4. Click **Wear**, start a solo game: your soldiers are crusaders.
5. **House name**: reserve a name. In a second browser, not signed in, try
   to join a public game under that name: the server refuses it.
6. Join a public game from both browsers: the second player sees the first's
   cosmetics.

If step 2 never credits, look at the webhook's delivery attempts in Stripe
and at the `stripe-webhook` function log in Netlify.

## Working on it without any of that

`npm run dev`, then open `http://localhost:5183/?premium`. You are a
pretend signed-in player with 1,000 Crowns kept in the browser; buying,
wearing and the arms editor all work, and nothing is charged. Clear
`crusades.dev.account` in localStorage to start over.

## Adding things to sell

1. Add the item to `ITEMS` (or `BUNDLES`) in `src/store/Catalog.ts`, with a
   `variant` name and a `tag`.
2. Make the variant:
   - a recolour is one `register(...)` line in `src/render/Models.ts`;
   - a whole new set of models (troops, a fleet, an architecture) goes in
     `src/render/Styles.ts` (historical) or `src/render/Follies.ts` (the
     jokes), registered under the variant name;
   - a territory cloth is one line in `src/store/Cloths.ts`: a heraldic
     charge appended to `GLYPHS` (append only, the order is the atlas order),
     or a `PROCEDURAL` entry plus its branch in `src/render/Cloth.ts`;
   - arms charges are appended to `CHARGES` in `src/client/Heraldry.ts`.
   - a sea trail (the ribbon a longship lays on the water) is one line in
     `src/store/Trails.ts`: a style and up to three colours, or a symbol from
     `GLYPHS` on a band. A new style is a branch in `src/render/SeaTrails.ts`.
3. Run `npm run catalog-sql` to rewrite the price mirror at the bottom of
   `supabase/schema.sql`, then re-run that file in Supabase.

The store pictures are rendered from the real models and the real cloth
shader (`src/store/Preview.ts`), so a new item needs no artwork.

## What to settle before taking real money

- **Refunds.** A refund (yours, or one Stripe issues under Managed
  Payments) takes back the same share of the pack's Crowns through the
  `charge.refunded` webhook event. If the player has already spent them the
  balance stops at zero and they keep what they bought; the `purchases`
  ledger shows the full amount owed, for you to act on if you wish.
- **Terms and privacy pages**, and a support address; Stripe requires them.
- **Tax.** Turn on Stripe Tax if you need VAT or sales tax collected.
- **Virtual currency rules.** Selling a currency rather than items directly
  has consumer-law implications in some places (clear pricing, no expiry
  tricks, rules on minors). Worth an hour with someone who knows your market.
- **Licence.** The code that draws a cosmetic is AGPL like the rest, so the
  recolours and models are public. What you are selling is the entitlement
  on your servers, which is the usual arrangement and the same one the
  upstream project uses.
