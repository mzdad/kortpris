# Kortpris

Photograph a Pokémon card on your phone and see what it sells for.

**Live at <https://mzdad.github.io/kortpris/>.** Every push to `main` updates it.

A web page with nothing to install. What happens to a photo:

1. **Photo → text.** [Tesseract.js](https://github.com/naptha/tesseract.js) reads the
   card's name and collector number (like `4/102`) on the phone itself. The name is
   checked against all 1025 Pokémon names, so small misreads get corrected. The number
   is read a second time, zoomed in on the full-size photo.
2. **Text → card.** The name and number are looked up in the free
   [Pokémon TCG API](https://pokemontcg.io). If part of the text was misread, the
   candidates are sorted by how much their picture looks like the photo, and a clear
   winner opens by itself. The fields stay editable, so a card can also be typed in.
3. **Card → prices.** Prices from **Cardmarket** (Europe, euros, also shown in kroner)
   and **TCGplayer** (USA, dollars), with links to both shops.
4. **My cards.** Cards can be saved with how many of each, and the list shows the total
   value in kroner. Without an account it is kept in the phone's browser only.

**Accounts.** Each person can have a username and password, and their My cards is then kept
online and shows up on every phone they sign in on. Passwords must be at least 10
characters and pass the [zxcvbn](https://github.com/dropbox/zxcvbn) guessability check.
Accounts run on a Firebase project the owner creates: see [SETUP-ACCOUNTS.md](SETUP-ACCOUNTS.md).
Until `firebase-config.js` has that project's settings, the app hides accounts.

**Optional: read cards with Claude.** Under "Read cards with Claude" on the Scan screen,
the viewer can save their own Anthropic API key. Photos are then read by Claude Opus 5
(`claude.js`), which handles worn, foil and non-English cards far better, at roughly
US$0.03 per photo on the key owner's account. If Claude fails, the built-in reader takes
over and a notice says why. The key is kept in the phone's browser and sent only to
Anthropic.

## Files

| File | What it does |
|---|---|
| `index.html` | The page layout |
| `style.css` | Colours, fonts, spacing |
| `strings.js` | Every text in English and Danish - edit wordings here |
| `pokemon-names.js` | All Pokémon names, used to correct misreads |
| `reader.js` | Photo → name and number |
| `cards.js` | Searches the price database |
| `matcher.js` | Sorts candidate cards by how much they look like the photo |
| `collection.js` | "My cards": saved cards, how many of each, total value |
| `claude.js` | Optional: Claude reads the card instead, with the viewer's own API key |
| `storage.js` | Saves things on the phone (language, My cards) |
| `currency.js` | Shows prices in DKK, EUR, GBP or IDR, with the central bank's daily rates |
| `account.js` | Accounts: sign up, sign in, and My cards kept online (Firebase) |
| `password.js` | Decides whether a new password is strong enough |
| `firebase-config.js` | Which Firebase project holds the accounts |
| `firestore.rules` | Firebase-side privacy rules: each account sees only its own cards |
| `firebase.json` | Settings for Firebase's command-line tools and local test copy |
| `SETUP-ACCOUNTS.md` | Click-steps for creating the Firebase project |
| `app.js` | The screen: buttons, results, prices |
| `dev_reading_test.html` | Development tool, not part of the app (see below) |

## Publishing a change

Every push to `main` goes live within a minute or two. Before pushing, raise the version
number `?v=...` on our own files in `index.html` (and in `dev_reading_test.html`), for example:

```bash
sed -i 's/?v=1.7.0/?v=1.7.1/g' index.html dev_reading_test.html
```

The page shows that number at the bottom ("Kortpris version 1.7.0"), so it's easy to check which
version a phone has. It also makes browsers fetch a matching set of files, instead of mixing
new ones with old cached copies, which could break the app for up to ten minutes.

## Run it on the computer

```bash
python -m http.server 8765 --directory "D:/Claude - Card Scanner"
```

Then open <http://localhost:8765>. Opening the file directly (double-click) does not
work, because the text reader needs to be served by a web server.

## Testing accounts without a real project

Firebase's local test copy runs on this computer with fake accounts that never go online.
It needs Java 21 and the Firebase command-line tools:

```bash
firebase emulators:start --project demo-kortpris --only auth,firestore
```

Then open <http://localhost:8765/?emulator>. The `?emulator` part makes the app talk to the
local copy instead of the real project.

## Measuring the reader

Open <http://localhost:8765/dev_reading_test.html>. It makes 16 fake phone photos of 8
real cards (tilted, badly lit, blurred), runs them through the app and scores the result.
The photos are the same every run, so run it before and after changing `reader.js` or
`matcher.js`.

The number scores there are pessimistic: the fakes are made from 1024-pixel card
pictures, so their tiny print has far less detail than a real phone photo.

## Things to know

- **The free API is unreliable.** In September 2026, about half of all requests failed on
  the first try. The page retries every lookup up to 8 times before giving up.
- **Cardmarket prices can be weeks or months old** in this API. The page shows the date
  and labels anything older than two weeks.
- **Prices are for ungraded cards.** Condition changes the value a lot.
- The API's makers now run a paid successor, [Scrydex](https://scrydex.com), which has
  fresher data. It would be the upgrade path if the free one gets worse.
