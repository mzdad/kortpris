# Kortpris

Photograph a Pokémon card on your phone and see what it sells for.

**Live at <https://mzdad.github.io/kortpris/>.** Every push to `main` updates it.

A web page with nothing to install. What happens to a photo:

1. **Photo → text.** [Tesseract.js](https://github.com/naptha/tesseract.js) reads the
   card's name and collector number (like `4/102`) on the phone itself. The name is
   checked against all 1025 Pokémon names, so small misreads get corrected. The card is
   found in the photo by its yellow border, or, for silver-bordered and foil cards, by its
   shape (`card-finder.js`). The number is then read again from the full-size photo, in the
   two small corners where it is printed, several different ways (one of them with only the
   black ink kept, which hides coloured backgrounds and glitter).
2. **Text → card.** The name and number are looked up in the free
   [Pokémon TCG API](https://pokemontcg.io); every number the reader thought possible is
   tried, and the database says which one exists. A right number also finds a card whose
   name was misread, and the name is then corrected. If no number fits, the candidates are sorted by
   how much their picture looks like the photo, and a clear winner opens by itself. Cards
   with the very same picture (a holo and its plain print) are told apart by the number:
   a read "8/64" picks Mr. Mime 6/64, one digit away, over Mr. Mime 22/64. The 2026
   **30th Celebration: Classic Collection** reprints carry their original's number ("69/132"),
   which the database can't search on, so each is added next to its original; a "30" stamp at a
   bottom corner of the picture tells the two apart (`STAMP_CORNERS` in `matcher.js`). When
   both the name and the card's own number are unreadable but the set size isn't (shown as
   `?/110`), the photo is compared with every card from a set of that size. The
   fields stay editable, so a card can also be typed in.

   All drawing on canvases uses the processor (`willReadFrequently`), not the graphics card:
   graphics cards resize pictures slightly differently from PC to PC, and tiny print on foil
   cards reads differently after even a tiny change (one PC read `86/110`, another `0/110`,
   from the same photo).
3. **Card → prices.** Prices from **Cardmarket** (Europe, euros, also shown in kroner)
   and **TCGplayer** (USA, dollars), with links to both shops. A card whose background
   glitters in the photo (below the picture, letters left out) opens on its **reverse holo**
   price, which can be a hundred times the plain one (`sparkle.js`); that also picks the right
   one of two cards with the same picture when only one was ever printed as a reverse holo. **PSA prices** (what the card
   sold for on eBay in each PSA grade) come from PokemonPriceTracker through a small relay on
   Cloudflare that keeps its key secret (`relay/`, see `relay/README.md`). They are only
   fetched while "Fetch PSA prices automatically" is ticked on the card page, because the free
   plan allows about 50 cards a day; prices fetched in the last day are shown either way.
4. **My cards.** Cards can be saved with how many of each, and the list shows the total
   value in kroner. A search box narrows the list by name, set, number or version
   ("jungle holo", "pika", "58") and says what the cards found are worth together.
   Without an account it is kept in the phone's browser only.

**Learning.** When the app can't tell which card a photo shows (or opens the wrong one) and the
viewer taps or types the right one, or saves the card the photo found, the app remembers how that
card's artwork looked in the photo (`learned.js`): the same small colour thumbnail the picture
comparison uses, about 1,300 bytes, kept on this phone only. A search typed while the photo's card
is already known is taken as a price lookup of some other card, and teaches nothing
(`answersPhoto` in `app.js`). Every new photo is compared with those first. When it looks just like one
learned card (`SAME_CARD_DISTANCE`) and clearly unlike every other (`SAME_CARD_GAP`), that card
opens straight away, however badly the text read - unless the reader read another card's name and
number exactly, because the same picture is printed in several sets. "Cards the app has learned" on
the Scan screen lists them, each with a Forget button. Tested with `dev_learning_test.html`.

**Kids mode.** The 🧒 button at the top switches on a mode for children who can't read well
yet: one big picture to tap for the camera, the card with 1 to 5 gold coins for how valuable
it is, one rounded price, versions as little pictures of where the card glitters, and a big
Save button. Typing, settings, price tables and accounts are hidden (sign a child in first,
in normal mode). The phone also says everything out loud in Danish or English ("Pikachu. It's
worth about 33 kroner."), with its own built-in voice (`speech.js`): free, and nothing is sent
anywhere. The 🔊 buttons read aloud in normal mode too. iPhones only let a page speak after a
tap, so the first words come from pressing the camera button.

**Accounts.** Each person can have a username and password, and their My cards is then kept
online and shows up on every phone they sign in on. Passwords must be at least 10
characters and pass the [zxcvbn](https://github.com/dropbox/zxcvbn) guessability check.
Accounts run on a Firebase project the owner creates: see [SETUP-ACCOUNTS.md](SETUP-ACCOUNTS.md).
Until `firebase-config.js` has that project's settings, the app hides accounts.

**Optional: read cards with Claude.** Only for someone signed in to an account: then, under
"Read cards with Claude" on the Scan screen, they can save their own Anthropic API key.
Each account has its own key on each phone (`kortpris.claudeKey.<username>`), so someone else
signing in on the same phone doesn't use it; signed out, the box is hidden. Photos are then read by Claude Opus 5
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
| `speech.js` | Reads text aloud with the phone's own voice, picking its most natural one |
| `pokemon-names.js` | All Pokémon names, used to correct misreads |
| `card-finder.js` | Finds where the card is in the photo (yellow border, or shape) |
| `reader.js` | Photo → name and number |
| `cards.js` | Searches the price database |
| `matcher.js` | Sorts candidate cards by how much they look like the photo |
| `collection.js` | "My cards": saved cards, how many of each, total value |
| `claude.js` | Optional: Claude reads the card instead, with the viewer's own API key |
| `sparkle.js` | Tells a reverse holo from the photo: glitter everywhere except the picture |
| `learned.js` | Remembers cards the viewer picked for a photo, and recognises the next photo of them |
| `graded.js` | PSA prices of a card, asked from the relay and kept on the phone for a day |
| `relay/` | The PSA price relay that runs on Cloudflare, not in the page |
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
| `dev_real_photos_test.html` | Development tool: runs real photos from the private `dev-local/` folder |
| `dev_learning_test.html` | Development tool: checks that learned cards are recognised, and nothing else is |

## Publishing a change

Every push to `main` goes live within a minute or two. Before pushing, raise the version
number `?v=...` on our own files in `index.html` (and in the three `dev_` test pages), for example:

```bash
sed -i 's/?v=1.10.0/?v=1.10.1/g' index.html dev_reading_test.html dev_real_photos_test.html dev_learning_test.html
```

The page shows that number at the bottom ("Kortpris version 1.10.0"), so it's easy to check which
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

Real photos matter more. Put them in `dev-local/` (never published) and list them, with the
right answers, in `dev-local/real-photos.json`; then open
<http://localhost:8765/dev_real_photos_test.html>. Use the phone's original files: photos
sent through a chat app are shrunk to half the size or less on the way.

The number scores in the fake-photo test are pessimistic: the fakes are made from 1024-pixel card
pictures, so their tiny print has far less detail than a real phone photo.

## Things to know

- **The free API is unreliable.** In September 2026, about half of all requests failed on
  the first try. The page sends every lookup twice at once and tries up to 6 times before
  giving up.
- **Cardmarket prices can be weeks or months old** in this API. The page shows the date
  and labels anything older than two weeks.
- **Prices are for ungraded cards.** Condition changes the value a lot.
- The API's makers now run a paid successor, [Scrydex](https://scrydex.com), which has
  fresher data. It would be the upgrade path if the free one gets worse.
