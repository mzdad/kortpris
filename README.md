# Kortpris

Photograph a Pokémon card on your phone and see what it sells for.

It is a single web page, `index.html`, with nothing to install:

1. **Photo → text.** [Tesseract.js](https://github.com/naptha/tesseract.js) reads the
   card's name (the biggest text) and the collector number (like `4/102`) straight
   from the photo, on the phone itself.
2. **Text → card.** The name and number are looked up in the free
   [Pokémon TCG API](https://pokemontcg.io). If the photo was misread, looser searches
   follow, and you tap your card from a grid of pictures. The fields stay editable,
   so you can also type a card in by hand.
3. **Card → prices.** The API returns prices from **Cardmarket** (Europe, euros, also
   shown in kroner) and **TCGplayer** (USA, dollars), with links to both shops.

## Run it on the computer

```bash
python -m http.server 8765 --directory "D:/Claude - Card Scanner"
```

Then open <http://localhost:8765>. Opening the file directly (double-click) does not
work, because the text reader needs to be served by a web server.

## Things to know

- **The free API is unreliable.** In September 2026, about half of all requests failed on
  the first try. The page retries every lookup up to 6 times before giving up.
- **Cardmarket prices can be weeks or months old** in this API. The page shows the date
  and labels anything older than two weeks.
- **Prices are for ungraded cards.** Condition changes the value a lot.
- The API's makers now run a paid successor, [Scrydex](https://scrydex.com), which has
  fresher data. It would be the upgrade path if the free one gets worse.
