# FinPulse — Enterprise FP&A Dashboard (100% Client-Side)

Statycznie hostowana aplikacja webowa klasy Enterprise do interaktywnej analizy budżetu, alokacji kosztów na działy i symulacji finansowych **What-If** (`RZiS`, `Bilans`, `Cash Flow`, `Wskaźniki`) w oparciu o skoroszyty `.xlsx` i silnik obliczeniowy **HyperFormula** działający wyłącznie w przeglądarce użytkownika.

---

## Kluczowe możliwości

- **100% Client-Side Only (Zero backendu):** Poufne dane finansowe nigdy nie opuszczają przeglądarki. Brak zewnętrznych zapytań API, telemetrii ani zewnętrznych CDN-ów (`connect-src 'self'`, `Referrer-Policy: no-referrer`, lokalnie hostowane fonty `@fontsource/*`).
- **Kontrakt Danych Excel v1.0 (`docs/EXCEL_CONTRACT_V1.md`):** Parser nie polega na twardych współrzędnych (typu `B7`). Wszystkie parametry, słowniki, suwaki UI (`TBL_UI_SLIDERS`) i 3 sprawozdania odczytywane są po **Nazwanych Zakresach (Named Ranges)** dla dowolnej liczby produktów, działów, kategorii kosztów i okresów (`12M`, `18M`, `24M`+).
- **100% zgodności obliczeniowej z Excelem:** `ExcelJS` parsuje plik bezstratnie, a `HyperFormula` przelicza pełny graf zależności na każdym ruchu suwaka — utrzymując równowagę `Aktywa = Pasywa`, zamrożony `Moment zero`, limit overdraftu i pożyczkę wspólników.
- **5-bramkowy Audytor Modelu:** Przy wczytaniu i po każdej symulacji weryfikuje Kontrakt v1.0, parzystość wyników `Excel cache` vs `HyperFormula`, integralność 3 sprawozdań, blokadę Momentu Zero oraz kowenanty płynności.
- **Live-Sync z dyskiem lokalnym:** Integracja z **File System Access API** (`showOpenFilePicker` + zapis uchwytu w `IndexedDB` + polling zapisu z Excela `Ctrl+S` z atomowym debouncingiem) oraz fallback Drag & Drop / `<input type="file">`.
- **3 widoki zarządcze (Executive Dark Glass):**
  1. **Analiza kosztów:** 5 kart KPI, interaktywne cross-filtrowanie działów i kategorii, mostek wyniku Waterfall (z przejściami przez zero i dynamicznym CIT), trend miesięczny, deterministyczny **Insights Engine**, macierz cieplna `Dział × Kategoria`, tabela miesięczna oraz podgląd kluczy alokacji.
  2. **Przegląd finansowy:** 5 podzakładek (`Przegląd`, `RZiS (P&L)`, `Bilans` z zablokowanym Momentem Zero, `Cash Flow`, `Wskaźniki` z `TBL_AUDIT_CHECKS`), wykres zadłużenia/overdraftu i wyniku vs `CFO`, tabele `@tanstack/react-table` z przypiętą kolumną/nagłówkiem i kolumną `Δ vs Budżet`.
  3. **Porównywarka scenariuszy Side-by-Side + Eksport `.xlsx`:** Zapisywanie snapshotów i import presetów z Excela, wykres porównawczy ECharts w 3 trybach, tabela Side-by-Side oraz **bezstratny eksport przeliczonego scenariusza do `.xlsx`** (zachowane style i formuły, odświeżony cache `<v>`, `fullCalcOnLoad`, opcjonalna zakładka `99_Porownanie_Scenariuszy`).

---

## Stack technologiczny

- **Core:** React 19 + TypeScript (`strict: true`) + Vite 7
- **UI & Style:** Tailwind CSS v4 (motyw „Executive Dark Glass”, `tabular-nums`, self-hosted fonts `@fontsource/sora`, `@fontsource/dm-sans`, `@fontsource/jetbrains-mono`) + `lucide-react`
- **Silnik Excel i obliczeń:** `ExcelJS` + `HyperFormula`
- **Zarządzanie stanem:** `Zustand` (wraz z `localStorage` dla snapshotów scenariuszy i `IndexedDB` dla uchwytu pliku Live-Sync)
- **Wykresy i tabele:** Apache ECharts (`echarts/core` tree-shaken + eksport PNG) + `@tanstack/react-table`
- **Testy:** `Vitest`

---

## Uruchomienie lokalne i skrypty

```bash
# Instalacja zależności
npm install

# Serwer deweloperski Vite
npm run dev

# Kontrola typów TypeScript (strict)
npm run typecheck

# Pełny zestaw testów jednostkowych i integracyjnych (w tym Round-Trip .xlsx i CSP)
npm test

# Produkcyjny build statyczny do katalogu dist/
npm run build

# Generacja i weryfikacja referencyjnego szablonu Kontraktu v1.0
npm run phase0
```

Szablon referencyjny znajduje się w `public/templates/Budzet_BETA_v2_Standard.xlsx`, a pełna dokumentacja dla zespołu FP&A w `docs/EXCEL_CONTRACT_V1.md`.

---

## Wdrożenie statyczne (Cloudflare Pages / Vercel)

Aplikacja jest w 100% statyczna (katalog wyjściowy `dist/`):

- **Cloudflare Pages:** Build command `npm run build`, output directory `dist`. Plik `public/_headers` trafia automatycznie do `dist/_headers` i wymusza restrykcyjne nagłówki (`Content-Security-Policy`, `connect-src 'self'`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`).
- **Vercel:** Plik `vercel.json` konfiguruje identyczne nagłówki CSP/bezpieczeństwa, reguły cache dla `/assets/*` i `/templates/*` oraz SPA rewrite fallback.
