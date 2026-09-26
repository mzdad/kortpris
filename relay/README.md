# Kortpris relay

A tiny program on Cloudflare Workers (free plan), `relay.js`, that holds two keys a public web
page can't: it fetches PSA prices for the app, and searches the card database with its key.
Its address is still `kortpris-psa`, from when it only did PSA prices.

## Card searches (`/cards`)

The card database ([pokemontcg.io](https://pokemontcg.io)) allows 1,000 lookups a day and 30 a
minute per internet connection without a key. A scan takes from a few lookups to about 25 (the app
asks twice at once, and again when the database fails), so a busy day can use it up, and then no card
is found on that connection until it resets. With a free key it allows 20,000 a day. Its makers
ask for the key to be kept out of web pages, so the relay holds it, as the secret `TCG_API_KEY`.

`GET <relay>/cards?q=...&orderBy=...&pageSize=...&select=...` passes the app's search on with the
key and hands back the database's own answer, failures included (the app asks again, as it would
without the relay). Without the key it answers 503, and the app asks the database directly
(`fetchCardPage` in `cards.js`); it does the same when the relay refuses or can't be reached, and
leaves the relay alone for 10 minutes.

Adding the key (once):

1. Make a free account at <https://dev.pokemontcg.io> and copy the API key it shows.
2. In PowerShell, in this folder:
   ```
   npx.cmd --yes wrangler@latest secret put TCG_API_KEY --name kortpris-psa
   ```
   Paste the key when it asks, and press Enter. Nothing else changes: the app uses the key the
   next time it is opened (an app left open tries the relay again within 10 minutes).
3. Check: `curl "https://kortpris-psa.kortpris.workers.dev/cards?q=name:Pikachu&pageSize=1" -H "Origin: https://mzdad.github.io"`
   should answer with a card, not "the relay has no TCG_API_KEY secret".

## PSA prices

**Why it exists.** PSA prices (what a card sold for on eBay in each PSA grade) come from
[PokemonPriceTracker](https://www.pokemonpricetracker.com). Their API needs a secret key, and it
refuses calls straight from a web page. The app is a public web page, so it can't hold the key.
The relay holds it as a Cloudflare secret, fetches the prices, and hands back only what the app
shows. It only answers the app (`https://mzdad.github.io`, plus `http://localhost:8765` for
testing) and remembers each card for a day in Cloudflare's KV store, so the free plan's 100
credits a day (2 per card) go a long way.

The app's side is `graded.js`; `PSA_RELAY_URL` there must be this relay's address, which is
<https://kortpris-psa.kortpris.workers.dev/> (set up 2026-09-25).

The price service answers with `data.ebay.salesByGrade`: `psa10`, `psa9`, `psa8_5` (8.5) and so
on, each with `count`, `medianPrice`, `averagePrice`, `lastSaleDate` and more, next to other
graders (`cgc9`, `bgs9_5`, `tag8`, `ace7`) and `ungraded`. The relay passes on only PSA's.
Sales are per TCGplayer product, so a card's normal and reverse holo prints are counted together.

Every answer from the price service has an `X-RateLimit-Daily-Remaining` header (credits left
today; they refill at midnight UTC). The relay keeps the latest one in KV under `credits`, adds
`cardsLeft` and `resetsAt` to its own answers, and `?credits=1` returns just those, for free.
When the credits are used up, the relay answers 429.

## Setting it up (once, done 2026-09-25)

1. Make a free account on pokemonpricetracker.com and copy its API key.
2. Make a free account on cloudflare.com. Open **Workers & Pages** once; if it asks for a
   `workers.dev` subdomain, pick one.
3. In a terminal, in this folder:
   ```
   npx wrangler login
   npx wrangler kv namespace create REMEMBERED
   ```
   Put the printed KV id into `wrangler.toml`, then:
   ```
   npx wrangler deploy
   npx wrangler secret put PPT_API_KEY
   ```
   The last one asks for the key: paste it and press Enter. `deploy` prints the relay's address.
4. Try it: `curl "<address>/?card=base1-4" -H "Origin: https://mzdad.github.io"`

## Changing it

Edit `relay.js`, then `npx wrangler deploy` again. `npx wrangler tail` shows its log live.
`?card=<id>&raw=1` returns the price service's own answer, to check what it sends.
