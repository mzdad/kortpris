# Setting up accounts

About 10 minutes, once. Kortpris keeps accounts in a free **Firebase** project (Google's)
that you own. You create the project; the app only needs its settings. Firebase's free
plan ("Spark") needs no credit card and covers a family easily.

Firebase moves its menus around now and then. If something below isn't where the guide
says, type its name into **Search for products** at the top left of the Firebase page.

## 1. Create the project

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a new Firebase project** (older screens say **Add project**).
3. Name it `kortpris` and click **Continue**.
4. If it offers **Gemini** or **Google Analytics**, switch them off: Kortpris doesn't use
   them. Click **Create project**, wait for it, then **Continue**.

## 2. Register the web app and send the settings

1. On the project's front page, click **+ Add app** (just under the project name),
   then pick the **`</>`** icon (Web).
2. App nickname: `Kortpris`. Leave **Firebase Hosting** unticked. Click **Register app**.
3. You'll see code that starts with `const firebaseConfig = {` and has six lines:
   `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.
   **Copy that block and paste it to Claude in the chat.** It is not secret: every
   visitor's browser needs it to find the project.
4. Click **Continue to console**.

## 3. Switch on username-and-password sign-in

1. Left menu: **Security → Authentication**, then **Get started**.
2. **Sign-in method** tab → **Email/Password** → switch on the first toggle only
   ("Email/Password", not "Email link") → **Save**.

Kortpris turns each username into a made-up address like `emil@kortpris.example.com`,
so no emails are ever sent.

## 4. Require long passwords on Firebase's side too

1. Still in Authentication: **Settings** tab → **Password policy**.
2. Tick **Require enforcement** and set **Minimum length** to **10**. Leave the
   uppercase / number / symbol requirements unticked: the app checks strength itself,
   and allows easy-to-remember phrases like "purple tiger eats rockets". **Save**.

## 5. Create the database for the cards

1. Left menu: **Databases and storage → Firestore** → **Create database**.
2. If asked for an edition, pick **Standard**.
3. Location: pick one in Europe, such as **eur3 (Europe)** or **europe-north1 (Finland)**.
   It can't be changed later.
4. Choose **Start in production mode** → **Create**.

## 6. Paste the privacy rules

1. In Firestore Database, open the **Rules** tab.
2. Delete everything in the box and paste the whole of `firestore.rules`
   (in this folder, or <https://github.com/mzdad/kortpris/blob/main/firestore.rules>).
3. Click **Publish**.

These rules are what keep each child's cards private: only their own account can read
or change them.

**When `firestore.rules` changes, do this step again.** Version 1.25.0 added a rule for the
cards the app has learned (kept in the account from then on); until it is published, the list
of learned cards says the account couldn't be used, and they stay on the phone only.

---

## Afterwards

**Create the kids' accounts** in the app: **My cards → Create account**. Usernames can use
a–z, numbers, `-` and `_` (no æ, ø, å). Better not to use full names.

**Stop strangers from making accounts** (recommended once the family's accounts exist):
Authentication → **Settings** → **User actions** → untick **Enable create (sign-up)** →
**Save**. Signing in keeps working. Tick it again whenever you want to add an account.

**A child forgot their password:** Authentication → **Users** → find
`theirname@kortpris.example.com` → **⋮** → **Delete account**. Then create the account again
in the app, with the same username and a new password (tick "Enable create" first if you
switched it off). Their cards are still there, because cards are saved under the username.
