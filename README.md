# Oy vai toiminimi

Staattinen laskuri, joka vertaa toiminimeä ja osakeyhtiötä vuoden 2026 verosäännöillä. Sama vuosittainen tulos ja sama käteen jäävä nettotarve. Ylijäämä sijoitetaan joko yhtiön sisälle tai henkilökohtaiseen salkkuun.

Kolme polkua:

- **Toiminimi.** Tulos verotetaan joka vuosi, ylijäämä menee omaan salkkuun.
- **Oy, ylijäämä yhtiöön.** Palkka ja osinko täyttävät nettotarpeen, loput jäävät yhtiöön ja sijoitetaan siellä.
- **Oy, ylijäämä itselle.** Vuoden voitto nostetaan ja sijoitetaan itse.

Luvut ovat suuntaa-antavia, eivät veroneuvontaa. Rajaukset ovat sivun alaosassa.

## Paikallisesti

Moduulit eivät aukea suoraan tiedostona. Käynnistä palvelin projektin kansiossa:

```bash
python3 -m http.server 8080
```

Avaa `http://localhost:8080`.

Testit:

```bash
node --test test.js
```

## GitHub-repositorio ja GitHub Pages

Aja komennot tämän kansion sisällä. `gh` on kirjauduttu (`gh auth login`), jos et ole vielä.

```bash
git init
git branch -M main
git add .
git commit -m "Lisää oy–toiminimi-laskuri"

gh repo create oy-vai-tmi --public --source=. --remote=origin --push \
  --description "Osakeyhtiön ja toiminimen kannattavuus, verotus 2026"

gh api --method POST \
  -H "Accept: application/vnd.github+json" \
  "/repos/$(gh api user -q .login)/oy-vai-tmi/pages" \
  -f build_type=legacy \
  -f "source[branch]=main" \
  -f "source[path]=/"
```

Sivu tulee osoitteeseen `https://KAYTTAJANIMI.github.io/oy-vai-tmi/`. Julkaisu kestää yleensä minuutin. Tilan näet komennolla:

```bash
gh api "/repos/$(gh api user -q .login)/oy-vai-tmi/pages"
```

Myöhemmät muutokset:

```bash
git add .
git commit -m "Päivitä laskuri"
git push
```
