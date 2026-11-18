# Lama Kakhi — Portfolio Website

A free website hosted on GitHub, with its own **site editor** at `/admin`.
No coding and nothing to install.

---

## 1. Put the website online (one time, ~10 minutes)

1. Go to **github.com** and create a free account, or sign in.
   Remember your **username**, because it becomes part of your website address.
2. Click **+** (top right) → **New repository**.
3. Name it exactly **`yourusername.github.io`**, replacing `yourusername` with your
   GitHub username in lowercase. Choose **Public**, then **Create repository**.
4. On the next page, click **uploading an existing file**.
5. Open this website folder on your computer and **drag everything inside it**
   into the browser window: `admin`, `css`, `fonts`, `images`, `js`, `index.html`,
   `favicon.svg` and the rest. Wait for every upload to finish.
6. Scroll down and click **Commit changes**.
7. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**,
   then **main** and **/ (root)**, and click **Save**.
8. After 1–2 minutes, the site is live at **https://yourusername.github.io** 🎉

> If dragging folders doesn't work, use Chrome, or upload the folders one at a time.

---

## 2. Edit the site with the site editor

Open **https://yourusername.github.io/admin**. Only you can save changes, because
saving needs your personal access key.

### First time on each computer or phone: make an access key
The editor shows these steps too:

1. Open **github.com/settings/personal-access-tokens/new** while signed in.
2. **Token name:** Website editor. **Expiration:** 1 year.
3. **Repository access:** *Only select repositories* → pick your website repository.
4. **Permissions → Repository permissions → Contents:** *Read and write*.
5. Click **Generate token**, copy it, and paste it into the editor with your
   repository name, for example `lamakakhi/lamakakhi.github.io`.

The key stays in that browser. Don't share it. If you lose it or it expires,
make a new one the same way.

### What you can do there
- **Home page & contact:** your name, intro line, the scrolling statement
  (put `*stars*` around words to make them orange), the moving words, email,
  Instagram, LinkedIn and a CV PDF.
- **About:** the About text and facts such as education and software.
- **Expertise:** the "What I do" rows, each with a picture.
- **Projects:** add, delete and drag to reorder. Every text, the cover photo, whether the
  project appears in the home slideshow, and its **photos**:
  - Drop photos in. They're resized for the web automatically (JPG or PNG; iPhone
    HEIC photos need converting first).
  - Each photo's **caption** becomes the big chapter title on the project page while
    the photo pans on the right, so good captions make it feel like a guided tour.
  - Drag photos to reorder, click **Make cover**, or click ✕ to remove one.
- **Preview changes:** see your draft on the real design before anyone else does.
- **Publish:** saves everything to GitHub at once. The website updates about a minute
  later. Refresh if you still see the old version.

### Without the editor
Everything the editor changes lives in **`js/content.js`**, so you can still edit that file
directly on GitHub using the ✏️ pencil icon. If the site ever goes blank after a hand-edit,
open the file's **History** on GitHub and restore the previous version.

---

## 3. Use your own domain (optional, about €12 a year)

The free `yourusername.github.io` address works forever. If you'd like `lamakakhi.com`,
buy the domain from any registrar. Then go to **Settings → Pages → Custom domain** on GitHub
and follow its instructions for which DNS records to add.

---

## What's in this folder

```
index.html        the page shell
admin/            the site editor (your-site/admin)
js/content.js     ★ all text and project info (the editor writes this file)
js/app.js         how the site works (leave alone)
css/style.css     colours and layout (leave alone)
fonts/            Chivo and Mozilla Text (free Google Fonts, SIL Open Font License)
images/           photos, one folder per project
favicon.svg       the little "LK" icon in the browser tab
```

The site loads one small free script from the internet for smooth scrolling (Lenis).
If it's ever unavailable, the site still works with normal scrolling.
