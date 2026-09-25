# Kortpris PSA relay

A tiny program on Cloudflare Workers (free plan) that fetches PSA prices for the app.

**Why it exists.** PSA prices (what a card sold for on eBay in each PSA grade) come from
[PokemonPriceTracker](https://www.pokemonpricetracker.com). Their API needs a secret key, and it
refuses calls straight from a web page. The app is a public web page, so it can't hold the key.
The relay holds it as a Cloudflare secret, fetches the prices, and hands back only what the app
shows. It only answers the app (`https://mzdad.github.io`, plus `http://localhost:8765` for
testing) and remembers each card for a day in Cloudflare's KV store, so the free plan's 100
credits a day (2 per card) go a long way.

The app's side is `graded.js`; `PSA_RELAY_URL` there must be this relay's address.

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
`?card=<id>&raw=1` returns the price service's own answer, to check what it sends.
