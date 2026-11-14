# Oy vai toiminimi

Staattinen laskuri, joka näyttää, millä tuloksella osakeyhtiö kannattaa toiminimeä paremmin. Verovuoden 2026 säännöt.

Kaksi polkua samasta tuloksesta ja samasta nettotarpeesta:

- **Toiminimi.** Tulos verotetaan joka vuosi omistajan tulona, ja ylijäämä sijoitetaan omaan salkkuun.
- **Osakeyhtiö.** Palkkaa ja osinkoa nostetaan vain nettotarpeen verran. Loppu jää yhtiöön ja sijoitetaan siellä.

Työvuodet ja eläkevuodet ovat erillään. Eläkkeellä molemmista nostetaan sama summa verojen jälkeen: oy:stä osinkona, toiminimeltä salkkua myymällä. Viimeisenä eläkevuonna nostetaan vielä tavallinen summa, ja sen jälkeen loput myydään ja yhtiö puretaan (luovutusvoittovero).

Sivun pääluku on oy:n etu: käteen yhteensä, oy miinus toiminimi. Kaavio näyttää molempien varallisuuden verojen jälkeen työ- ja eläkevuosina, ja tuomion alla kerrotaan tulos, jolla oy alkaa kannattaa. Näkyvissä on viisi säädintä (tulos, nettotarve, työvuodet, eläkevuodet, tuotto), ja kaikki muu on lisäasetuksissa.

Tiedostot: `calc.js` on laskenta ilman selainriippuvuuksia, `app.js` piirtää sivun ja kaavion, `test.js` testaa laskennan.

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
