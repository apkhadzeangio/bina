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

Cloudflare Pages-ის პროექტი `bina` (`bina-csn.pages.dev`, დომენი `bina.lithos.ge`) ფაილის ატვირთვით შეიქმნა. ასეთ პროექტს Cloudflare Git-ის ინტეგრაციაზე ვერ გადაიყვანს, ამიტომ გამოქვეყნებას GitHub Actions აკეთებს (`.github/workflows/deploy.yml`). `main`-ში ყოველი push-ის შემდეგ ის `dist/site`-ს ამ პროექტში ტვირთავს.

რეპოზიტორიის Settings → Secrets and variables → Actions-ში ორი საიდუმლო უნდა იყოს:

- `CLOUDFLARE_API_TOKEN` — Cloudflare-ის API ტოკენი, უფლებით Account → Cloudflare Pages → Edit.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare-ის ანგარიშის ID.

კოდის შეცვლის შემდეგ: `npm test`, `npm run build`, შემდეგ commit და push.
