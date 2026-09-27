# Kortpris

Photograph a Pokémon card on your phone and see what it sells for.

**Live at <https://mzdad.github.io/kortpris/>.** Every push to `main` updates it.

A web page with nothing to install. What happens to a photo:

1. **Photo → text.** [Tesseract.js](https://github.com/naptha/tesseract.js) reads the
   card's name and collector number (like `4/102`, or a promo's code like `SWSH193` or
   `SVP EN 001`) on the phone itself. Numbers of a set within a set, like `GG01/GG70` (Galarian
   Gallery) or `TG05/TG30` (Trainer Gallery), are recognised by the set size after the "/", as
   their tiny letters are often misread as digits: "6Go1/6670" is GG01 (`LETTERED_SETS` in
   `reader.js`). The name is checked against all 1025 Pokémon names and every Trainer and Energy
   card's name (`card-names.js`), so small misreads get corrected. The card is
   found in the photo by its yellow border, or, for silver-bordered and foil cards, by its
   shape (`card-finder.js`). The strip along its top where the name is printed is then read on
   its own, enlarged: as it is, with only its dark ink, and with only its white ink. On full-art
   cards the name sits on the artwork, where a read of the whole card often loses it
   (`readNameStrip`). The number is then read again from the full-size photo, in the
   two small corners where it is printed, several different ways (one of them with only the
   black ink kept, which hides coloured backgrounds and glitter), until two reads agree. When
   they don't, the corners are cut out again from the card's box made a tenth bigger, and then
   moved up a little: the box is never found exactly, and tiny print cut out a little
   differently often reads differently (`NUMBER_RECUTS`).
2. **Text → card.** The name and number are looked up in [TCGdex](https://tcgdex.dev), a free
   card database that web pages may ask directly: the cards with that name and those with each
   number read come in one quick question each (`cards.js`), and every number the reader thought
   possible is tried against them. (Until version 1.32.0 the app used the Pokémon TCG API,
   pokemontcg.io, which is being shut down. Cards saved or learned before then are given TCGdex's
   ids once, by `card-ids.js`, which also lends TCGdex's cards without a picture the old
   database's.) A right number also finds a card whose
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
   and **TCGplayer** (USA, dollars), with links to both shops. Cardmarket also gives "reverse
   holo" prices for some cards never printed that way (Base Set Charizard); TCGdex lists each
   card's prints, so those are left out (`cardmarketReverseCounts`). A card whose background
   glitters in the photo (below the picture, letters left out) opens on its **reverse holo**
   price, which can be a hundred times the plain one (`sparkle.js`); that also picks the right
   one of two cards with the same picture when only one was ever printed as a reverse holo. **PSA prices** (what the card
   sold for on eBay in each PSA grade) come from PokemonPriceTracker through a small relay on
   Cloudflare that keeps its key secret (`relay/`, see `relay/README.md`). They are only
   fetched while "Fetch PSA prices automatically" is ticked on the card page, because the free
   plan allows about 50 cards a day; prices fetched in the last day are shown either way.
4. **My cards.** Cards can be saved with how many of each, and the list shows the total
   value in kroner. It is split into Pokémon, Trainer cards and Energy cards (the database's
   "supertype"; cards saved before 1.25.0 are asked for theirs when My cards opens). A search box
   narrows the list by name, set, number, version or kind ("jungle holo", "pika", "58",
   "trainer") and says what the cards found are worth together. Tapping a card opens its page
   there - the page the Scan screen shows for a card it found, with the saved version picked -
   and "Back to My cards" or the phone's own Back (a swipe on an iPhone) returns to the list.
   Without an account it is kept in the phone's browser only.

**The app's own camera.** "Take photo" opens a live camera inside the page (`camera.js`), zoomed
2x and with the phone's light on, because the phone's own camera screen can't be told to do either.
Zoomed in, the phone is held further away, so the card is in focus and out of the phone's shadow; the
light stays on, so a glare spot shows before the photo is taken. Zoom needs iOS 17 or Chrome on
Android, the light iOS 18; the buttons for them only show when the phone can. Both are remembered.
Where the browser can (Safari 18.4, Chrome), the photo is the camera's own full-size photo, otherwise
the live picture (an iPhone gives 2160×3840). The reader is told where the white frame was
(`readCardPhoto`'s `frame`): the card's own edges are used when found close to it, and the frame
otherwise; and when the number reads aren't sure, the number is read again at the frame's place. A live picture is softer than a photo, and a slightly
soft picture hides the tiny numbers on old cards from the reader, so: the white frame covers 90% of
the camera's real picture (the screen shows the whole of it), the sharpest of six pictures in the
0.6 s after the press is kept (pressing shakes the phone), and a picture that measures soft
(`softnessOf`) is sharpened, by an amount scaled to its size. Sharp pictures are left alone:
sharpening them made numbers read worse. On 10 old cards, sharp and slightly soft pictures (4K and
1080p) read 9 or 10 numbers, as many as the phone's own photos. The bottom of the page then says
what the camera gave ("camera 2160×3840 (live picture) · soft (0.18), sharpened"), to find out
what a phone does. "Use the phone's own camera" at the bottom opens the old camera screen, and so does
the button when the page can't have a live camera.

**Learning.** When the app can't tell which card a photo shows (or opens the wrong one) and the
viewer taps or types the right one, or saves the card the photo found, the app remembers how that
card's artwork looked in the photo (`learned.js`): the same small colour thumbnail the picture
comparison uses, about 1,300 bytes, kept on the phone and, while someone is signed in, in their
account too (`learned/<username>` in Firestore), so it follows them to every phone and isn't lost
when the phone's browser forgets it. A search typed while the photo's card
is already known is taken as a price lookup of some other card, and teaches nothing
(`answersPhoto` in `app.js`). Every new photo is compared with those first: as soon as the card's
edges are found in it, before any text is read (`lookAtPhoto` in `reader.js`, `openLearnedEarly` in
`app.js`). When it looks just like one learned card (`SAME_CARD_DISTANCE`) and clearly unlike every
other (`SAME_CARD_GAP`), that card opens straight away - in about a second, instead of after the 5
to 20 seconds of reading - however badly the text will read. The text is still read, as a check:
when it names another card's name and number exactly, that card is shown instead, because the same
picture is printed in several sets (`checkLearnedCard`). A photo whose card's edges aren't found is
compared by where its text is, after the reading. A reading stops between its steps when another
photo comes, so photos taken quickly one after another don't queue up. A photo that only looks
somewhat like learned cards (`LIKE_CARD_DISTANCE`, in other light or of another copy of the card)
still gets them as suggestions: they join the cards its text found, and when nothing is clear they go
first, marked "Seen before" - but they never open by themselves. When nothing could be read, they
are shown on their own to pick from. Tapping one teaches the app that photo too, so the next one
like it opens straight away. "Cards the app has learned" on the Scan screen lists them, each with a
Forget button. Tested with `dev_learning_test.html`.

**Kids mode.** The 🧒 button at the top switches on a mode for children who can't read well
yet: one big picture to tap for the camera, the card with 1 to 5 Poké Balls for how valuable
it is (one Poké Ball, then two Premier, three Great, four Ultra and five Master Balls, from 20, 40, 250 and 520 kroner), one rounded price, versions as little pictures of where the card glitters, and a big
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

What comes next, and why: [ROADMAP.md](ROADMAP.md).

## Files

| File | What it does |
|---|---|
| `index.html` | The page layout |
| `style.css` | Colours, fonts, spacing |
| `strings.js` | Every text in English and Danish - edit wordings here |
| `speech.js` | Reads text aloud with the phone's own voice, picking its most natural one |
| `pokemon-names.js` | All Pokémon names, used to correct misreads |
| `card-names.js` | All Trainer and Energy card names, used the same way |
| `card-finder.js` | Finds where the card is in the photo (yellow border, or shape) |
| `reader.js` | Photo → name and number |
| `cards.js` | Searches the card database (TCGdex), and asks for the prices of the cards shown |
| `card-ids.js` | The old database's set ids and TCGdex's, and the 30th Celebration reprints' numbers |
| `matcher.js` | Sorts candidate cards by how much they look like the photo |
| `collection.js` | "My cards": saved cards, how many of each, total value |
| `claude.js` | Optional: Claude reads the card instead, with the viewer's own API key |
| `sparkle.js` | Tells a reverse holo from the photo: glitter everywhere except the picture |
| `camera.js` | The app's own camera: live picture, 2x zoom, light, and the photo |
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
| `dev_learning_test.html` | Development tool: checks that learned cards are recognised or suggested, and nothing else is opened |
| `dev_special_numbers_test.html` | Development tool: promos, gallery and other lettered numbers (see below) |
| `dev_fullart_test.html` | Development tool: full-art, gold and illustration-rare cards (see below) |

## Publishing a change

Every push to `main` goes live within a minute or two. Before pushing, raise the version
number `?v=...` on our own files in `index.html` (and in the five `dev_` test pages), for example:

```bash
sed -i 's/?v=1.10.0/?v=1.10.1/g' index.html dev_reading_test.html dev_real_photos_test.html dev_learning_test.html dev_special_numbers_test.html dev_fullart_test.html
```

The page shows that number at the bottom ("Kortpris version 1.10.0"), so it's easy to check which
version a phone has. It also makes browsers fetch a matching set of files, instead of mixing
new ones with old cached copies, which could break the app for up to ten minutes. A phone may
still keep the start page itself for up to ten minutes (GitHub Pages) and open the version from
before an update, so the app asks for the newest start page as it opens, and loads again, once,
when that names another version (`reloadIfNewerVersion` in `app.js`).

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

<http://localhost:8765/dev_special_numbers_test.html> does the same for 27 cards with unusual
numbers: Black Star promos, Galarian and Trainer Gallery, Shiny Vault, Radiant Collection and the
Aquapolis/Skyridge holos. `?only=svp,GG` runs just some of them.
<http://localhost:8765/dev_fullart_test.html> does it for 27 full-art, gold, rainbow and
illustration-rare cards, whose name and number are printed on the artwork.

## Things to know

- **TCGdex gives prices one card at a time**, so a search finds cards without them, and the app
  asks for the prices of a card as it opens (`withPrices`). Its Cardmarket and TCGplayer prices are
  from the same day.
- **Some cards have no picture in TCGdex** (in September 2026: the Galarian Gallery, the Shiny
  Vaults, the Trainer Galleries, some promos): those borrow the old database's picture, and a card
  neither has shows a grey "?". A card without a picture can still be found by its number.
- **TCGdex's picture server refuses pictures whose address has an ending** like `?readable`
  (it then sends its permission twice), so its addresses are used as they are (`readablePictureUrl`).
- **The old database, pokemontcg.io, is being shut down** (its keys stop working on 1 March 2027)
  and allowed 1,000 lookups a day per internet connection without a key. Its picture server still
  lends pictures (see above), and the test pages make their fake photos from its big pictures, so
  they stay the same photos as before the move.
- **Prices are for ungraded cards.** Condition changes the value a lot.
- [Scrydex](https://scrydex.com), from the old database's makers, is a paid alternative.
