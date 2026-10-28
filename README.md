# ბინის დიზაინერი

ბინის ზუსტი გეგმა → მასალები და 3D → ხარჯთაღრიცხვა.

## ფაილები

- `dist/site/index.html` — მზა გვერდი Cloudflare-ზე ასატვირთად (ერთი ფაილი).
- `src/core/` — გამოთვლები, ინტერფეისისგან დამოუკიდებლად:
  - `geometry.js` — ფართი, პერიმეტრი, კედლის სიგრძის შეცვლა.
  - `model.js` — ოთახის დანიშნულებები, კარის/ფანჯრის ტიპები, ნიმუში ბინა.
  - `measure.js` — იატაკი, კედლები ღიობების გამოკლებით, ფილა, ფარტუხი, პლინტუსი, რაფები.
  - `catalog.js` — მასალების კატალოგი: საქართველოს მაღაზიების პროდუქტები, ფასი, ბმული და შემოწმების თარიღი. ფასის განახლება აქ ხდება.
  - `finishes.js` — რომელი მასალა რომელ ზედაპირზე.
  - `quantities.js` — შესაძენი რაოდენობა, დანაკარგი, შეკვრები, დამხმარე მასალები.
- `src/ui/` — გეგმის რედაქტორი, 3D ხედი, მასალები, ხარჯთაღრიცხვა.
- `test/` — გამოთვლების ტესტები.

## აწყობა

```
npm install
npm test        # გამოთვლების ტესტები
npm run build   # dist/artifact.html და dist/site/index.html
```

3D (three.js r128) და PDF-ის გახსნა (pdf.js 3.11.174) cdnjs-დან იტვირთება მხოლოდ საჭიროებისას.

## გამოქვეყნება

ეს პროექტი დაკავშირებულია Cloudflare Pages-ის არსებულ **bina** პროექტთან GitHub-ის ნატიური ინტეგრაციით.

- GitHub repository: `apkhadzeangio/bina` (branch: `main`).
- Cloudflare Pages project: `bina`.
- Framework preset: **None**.
- Build command: **ცარიელი** (საიტი წინასწარ არის აგებული).
- Build output directory: `dist/site`.
- Pages URL: https://bina-csn.pages.dev
- Custom domain: https://bina.lithos.ge

`main` ბრენჩზე ყოველი ახალი push ავტომატურად იწვევს Cloudflare Pages-ის production deployment-ს. GitHub Actions-ის ცალკე Wrangler workflow და Cloudflare API token secrets აღარ არის საჭირო.

კოდის შეცვლის შემდეგ გაუშვი `npm test` და `npm run build`, შემდეგ commit/push გაუკეთე აგებულ `dist/site/index.html`-საც.
