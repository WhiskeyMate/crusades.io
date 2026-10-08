# Deploying crusades.io

The game is a static site: everything, including the simulation, runs in the
player's browser. Netlify serves it. Accounts and payments are optional and
add two outside services (Supabase and Stripe) plus three Netlify functions.

You can ship in two stages. Stage 1 gets the game online in a few minutes.
Stage 2 turns on sign-in and premium.

## Stage 1: the game on Netlify

1. Put the project in a Git repository and push it to GitHub (or GitLab).
   Because of the AGPL the repository should be public; see "Licence" below.
2. In Netlify: **Add new site > Import an existing project**, pick the repo.
   `netlify.toml` already sets the build command (`npm run build`), the
   publish directory (`dist`), the functions directory and Node 22. Accept the
   defaults and deploy.
3. Set `SOURCE_URL` in `src/main.ts` to the repository address and push. A
   "Read the source" link then appears on the landing page.
4. Optional: **Domain management > Add a domain** to use your own domain.
   Netlify issues the HTTPS certificate itself.

With no environment variables set, the site has no account button and no
functions are called. Nothing else is needed for a free, single-player launch.

## Stage 2: accounts and premium

What it does: a player signs in with an emailed link, pays through Stripe
Checkout, and can then choose the colour and arms their realm flies.

| Piece | Where it lives | What it is for |
| --- | --- | --- |
| Sign-in, `profiles`, `skins` | Supabase | who the player is, whether they paid, their arms |
| Checkout, billing portal | Stripe | taking the money |
| `create-checkout`, `billing-portal`, `stripe-webhook` | `netlify/functions/` | the only code that holds secrets |

### Supabase

1. Create a project at supabase.com.
2. **SQL editor**: paste and run `supabase/schema.sql`.
3. **Authentication > URL configuration**: set the Site URL to your site's
   address, and add it under Redirect URLs. Add `http://localhost:8888` too if
   you will test locally.
4. **Authentication > Emails**: the built-in mailer is rate-limited to a few
   emails an hour. Before real traffic, connect your own SMTP provider there.
5. From **Project settings > API** you will need the project URL, the `anon`
   key (public) and the `service_role` key (secret).

### Stripe

1. Create a Stripe account. Stay in **test mode** until everything works.
2. **Product catalogue**: add a product "crusades.io Premium" with one price.
   A recurring price makes premium a subscription; a one-time price makes it
   a single purchase. The code handles either. Copy the price id (`price_...`).
3. **Developers > Webhooks > Add endpoint**:
   `https://YOUR-SITE/.netlify/functions/stripe-webhook`, listening for
   `checkout.session.completed`, `customer.subscription.updated` and
   `customer.subscription.deleted`. Copy the signing secret (`whsec_...`).
4. **Settings > Billing > Customer portal**: turn it on, so "Manage billing"
   works.

### Netlify environment variables

**Site configuration > Environment variables.** Names are in `.env.example`.

| Variable | Value | Secret? |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL | no (built into the page) |
| `VITE_SUPABASE_ANON_KEY` | Supabase `anon` key | no |
| `SUPABASE_URL` | Supabase project URL | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` key | **yes** |
| `STRIPE_SECRET_KEY` | Stripe secret key (`sk_test_...` first) | **yes** |
| `STRIPE_WEBHOOK_SECRET` | the webhook signing secret | **yes** |
| `STRIPE_PRICE_ID` | the price id | no |
| `VITE_GAME_SERVER` | `wss://play.crusades.io` once the game server is up (docs/SERVER.md) | no |

Redeploy after setting them (the `VITE_` ones are read at build time).

### Check it end to end (test mode)

1. Open the site, **Sign in**, enter your email, follow the link.
2. **Go premium**, pay with Stripe's test card `4242 4242 4242 4242`, any
   future expiry, any CVC.
3. You land back on the site; within a few seconds the account shows
   **Premium** and the arms editor unlocks.
4. Save some arms, start a game: your realm is that colour and your shield
   carries the division and charge you chose.
5. In the Stripe dashboard cancel the test subscription; the account drops
   back to Free.

If step 3 never flips, look at **Developers > Webhooks** in Stripe for the
delivery attempt and its response, and at the function log in Netlify.

Only when all five work: switch Stripe to live mode, create the live price
and live webhook, and replace the three Stripe variables with live values.

### Working on it locally

`npm run dev` runs the game without functions. Add `?premium` to the address
(`http://localhost:5183/?premium`) to pretend to be a signed-in premium
player with the arms kept in the browser, which is enough to work on the
editor. To run the real functions locally, install the Netlify CLI, copy
`.env.example` to `.env`, fill it in and run `netlify dev`.

## How premium is kept honest

- The browser never decides who is premium. Only `stripe-webhook`, after
  checking Stripe's signature, writes `profiles.premium`.
- Players can read their own profile and cannot write it (row-level security).
- A player can only save arms if the database sees `premium = true` on their
  profile, so editing the page's JavaScript gains nothing.
- The service-role key and Stripe keys exist only in Netlify functions.

One limit to know about: the game itself is single-player and runs locally,
so a determined player could recolour their own realm by editing the page.
That costs you nothing today. It matters once other players can see the arms,
and the multiplayer design (docs/MULTIPLAYER.md) has the server hand out
cosmetics for that reason.

## Before taking real money

These are yours to sort out; none of them is code:

- A privacy policy and terms of sale linked from the site. You will hold
  email addresses and Stripe will ask for both.
- Tax: Stripe Tax can collect VAT or sales tax if you turn it on.
- A support email address for refunds and account trouble.

## Licence

The site is AGPL-3.0. Anyone who can play it must be able to get the source
of the version you are running, which is what `SOURCE_URL` is for. The footer
line "© OpenFront and Contributors" has to stay. See `NOTICE.md`.
