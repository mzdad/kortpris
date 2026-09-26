# Kortpris roadmap

What to build next, and why. Written 26 September 2026, at version 1.25.0. Biggest wins first
within each part; the size is a rough guess of the work (S = an hour or two, M = a session,
L = several sessions).

## Done in 1.25.0

- **Trainer and Energy names are read.** The reader knew only Pokémon names, so a Trainer card's
  name was thrown away or taken for something else. It now also knows every Trainer and Energy
  card's name (`card-names.js`, 1,480 names) and corrects misreads the same way.
- **Promo numbers are read**, like "SWSH193" on Black Star promos, which have no "/".
- **"Evolves from Galarian Linoone"** no longer turns into the card's name.
- **My cards is split** into Pokémon, Trainer cards and Energy cards.
- **Learned cards are kept in the account** when signed in, so they follow you to every phone and
  aren't lost when the phone's browser forgets them. Needs the new Firebase rules published once
  (see SETUP-ACCOUNTS.md).

## 1. Reading cards better

| | What | Why | Size |
|---|---|---|---|
| 1.1 | **Use the camera frame as the card's outline.** In the app's camera the card fills the white frame, so the app already knows where it is. | Finding the card is the step most photos fail at first; skipping it makes reading surer and faster. | M |
| 1.2 | **Newer promo and gallery numbers**: Scarlet & Violet promos ("SVP EN 001"), Galarian Gallery ("GG01/GG70"). | They read as nothing today, like "SWSH193" did. | S |
| 1.3 | **Full-art and gold cards**: the name and number sit on the artwork. | The reader loses text on busy backgrounds; the "ink only" copy used for numbers could help names too. | M |
| 1.4 | **Learned cards as suggestions**: a learned card that looks somewhat like the photo, but not clearly enough to open, is added to the cards the photo is compared with. | Today a learned card either opens or plays no part. | S |
| 1.5 | **Keep collecting failed photos** in `dev-local/` with the right answers. | Every fix so far came from a real photo that failed. The test set is 40 photos. | ongoing |

## 2. Quicker

| | What | Why | Size |
|---|---|---|---|
| 2.1 | **Recognise learned cards before reading the text.** Finding the card takes a moment; reading the text takes 5 to 20 seconds. | A card the app knows would open in 1 to 2 seconds instead of after the reading. | S |
| 2.2 | **Start the text reader when the page opens**, not at the first photo. | The first scan of a visit waits for a few megabytes to download. | S |
| 2.3 | **Remember database answers for a day** on the phone. | The free price database fails about half its requests, and each retry costs time. Scanning a card twice, or opening My cards, would not ask again. | S |
| 2.4 | **Read the number first, the name only when needed.** | Name and number are read one after the other. A clear number alone finds the card. | M |
| 2.5 | **Compare fewer pictures**: when only the name is known, the app compares the photo with up to 250 cards' pictures. Using the set size read, or learned cards, narrows that down. | The slowest searches are these. | M |
| 2.6 | **A paid price database (Scrydex)**, from the makers of the free one. | Faster and fresher prices, and it doesn't fail half the time. Costs money: your decision. | M |

## 3. Smoother

| | What | Why | Size |
|---|---|---|---|
| 3.1 | **Install it as an app** (home screen icon, opens full screen, starts instantly, My cards works without internet). | Feels like a real app; files load from the phone. Also stops updates from mixing old and new files. | M |
| 3.2 | **Take the photo by itself** when the card fills the frame and the phone is still. | No button to press; great for kids. The steadiness measure exists already. | M |
| 3.3 | **Scan several cards in a row**: after each card, "Save and next" goes straight back to the camera. | Adding a stack of cards to My cards is many taps today. | S |
| 3.4 | **My cards: sort and filter** (by value, set, name, newest) and share the list. | The list grows long. | M |
| 3.5 | **Hide the camera details** at the bottom of the page once the camera is proven on your phones. | It was added to find out what iPhones give. | S |

## 4. Accounts and keeping things

| | What | Why | Size |
|---|---|---|---|
| 4.1 | **Kids' own accounts under a parent**: see and move cards between them. | Each kid has their own cards. | L |
| 4.2 | **The Claude key in the account**, not only on one phone. | It has to be typed again on every phone. | S |

## Not planned

- **Non-English cards.** The free database has English cards only.
- **Grading a card's condition from the photo.** Too unreliable for prices that differ this much.
