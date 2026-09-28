# Kortpris PSA relay

A tiny program on Cloudflare Workers (free plan) that fetches PSA prices for the app.

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
graders (`cgc9`, `bgs9_5`, `tag8`, `ace7`) and `ungraded`. Each grade also has
`smartMarketPrice` (`price`, and `confidence`: high, medium or low), the service's estimate of
today's price. Since app version 1.41.0 the relay passes on PSA's grades as `grades` and the
other companies' (CGC, BGS, SGC, TAG, ACE) as `otherGrades`, each with `count`, `median`,
`average`, `price`, `sure` and `lastSale` (see the top of `psa-prices.js`). Remembered answers'
keys start with `ANSWER_SHAPE` ("2:"), so answers in an older shape aren't handed out.
Sales are per TCGplayer product, so a card's normal and reverse holo prints are counted together.

The same answer has TCGplayer prices under `data.variants` (per print: `marketPrice`, `lowPrice`,
`conditionUsed`). On the free plan these are Near Mint only (checked 2026-09-27), the same as
TCGdex's TCGplayer prices, so the relay ignores them. `ungraded` eBay sales mix in other cards
(a $2 Mewtwo's median was $22), so the relay ignores those too.

Every answer from the price service has an `X-RateLimit-Daily-Remaining` header (credits left
today; they refill at midnight UTC). The relay keeps the latest one in KV under `credits`, adds
`cardsLeft` and `resetsAt` to its own answers, and `?credits=1` returns just those, for free.
When the credits are used up, the relay answers 429.

## Setting it up (once)

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

Edit `psa-prices.js`, then `npx wrangler deploy` again. `npx wrangler tail` shows its log live.
`?card=<id>&raw=1` returns the price service's own answer, to check what it sends. Every question
needs the app's address as its Origin, as in the curl above: since app version 1.53.0 one without
it is refused (403), so other web pages can't spend the day's credits through a picture or script.
