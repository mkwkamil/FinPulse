# Kontrakt Danych Excel v1.0 (FinPulse FP&A Standard)

Niniejszy dokument definiuje standard budowy skoroszytów `.xlsx` obsługiwanych przez aplikację **FinPulse**. Każdy plik budżetowy spełniający ten kontrakt (niezależnie od liczby produktów, działów, kategorii kosztów czy liczby okresów) jest automatycznie parsowany, przeliczany w przeglądarce przez silnik `HyperFormula` i walidowany przez 5-bramkowy **Audytor Modelu** bez konieczności modyfikowania kodu aplikacji.

---

## 1. Struktura zakładek (8 wymaganych arkuszy)

Nazwy arkuszy stosują konwencję ASCII-safe (bez polskich znaków diakrytycznych i spacji) dla maksymalnej niezawodności odwołań w parserach formuł:

| Nr | Nazwa arkusza | Rola i zawartość |
|---|---|---|
| 1 | `00_Konfiguracja_UI` | Metadane modelu (`META_*`), deklaratywna definicja suwaków (`TBL_UI_SLIDERS`) oraz predefiniowane scenariusze (`TBL_UI_PRESETS`). |
| 2 | `01_Zalozenia_Modelu` | Blok mnożników symulacyjnych (`SIM_*`), parametry globalne (`CFG_*`), krzywa cen surowca (`TBL_RAW_PRICES_Q`), zamrożony bilans otwarcia (`BO_*`) oraz tabela produktów (`TBL_PRODUCTS`). |
| 3 | `02_Alokacja_Dzialy` | Dynamiczne słowniki działów (`TBL_DEPARTMENTS`) i kategorii (`TBL_COST_CATEGORIES`), macierz wag alokacji (`TBL_ALLOC_MATRIX`), koszty linii w czasie (`TBL_COST_LINES_MONTHLY`), koszty działów (`TBL_DEPT_COSTS_MONTHLY`) oraz macierz roczna Dział × Kategoria (`TBL_DEPT_X_CAT_YEAR`). |
| 4 | `03_Model_Operacyjny` | Acykliczny graf obliczeniowy (DAG): sprzedaż, zakupy i zapasy surowca, koszty operacyjne, majątek trwały i CapEx, harmonogram kredytu inwestycyjnego, kapitał obrotowy oraz kaskada płynności (Gotówka → Overdraft → Pożyczka wspólników). |
| 5 | `04_RZiS` | Rachunek zysków i strat (`STMT_PL`) z semantyką wierszy dla UI i wykresu Waterfall. |
| 6 | `05_Bilans` | Bilans (`STMT_BS`) zawierający kolumnę `Moment zero` (`BO`) oraz okresy `M1..Mn`, wraz z wierszem kontrolnym równowagi (`ROW_BS_CHECK`). |
| 7 | `06_CashFlow` | Rachunek przepływów pieniężnych metodą pośrednią (`STMT_CF`) oraz wiersz kontrolny uzgodnienia z bilansem (`ROW_CF_CHECK`). |
| 8 | `07_Wskazniki` | Wskaźniki finansowe (`STMT_RATIOS`) oraz panel automatycznych testów spójności modelu (`TBL_AUDIT_CHECKS`). |

---

## 2. Konwencja Nazwanych Zakresów (Workbook-Scoped Named Ranges)

Wszystkie odwołania aplikacji do skoroszytu opierają się o **Nazwane Zakresy o zasięgu skoroszytu** (nigdy o twarde adresy komórek w kodzie UI).

### 2.1 Metadane (`00_Konfiguracja_UI`)
- `META_SCHEMA_VERSION` — wersja kontraktu (wymagane `"1.0"`).
- `META_COMPANY_NAME` — nazwa spółki w nagłówku aplikacji.
- `META_BUDGET_TITLE` — tytuł budżetu (np. `"Budżet 12M, rok 2027"`).
- `META_CURRENCY` — kod waluty bazowej (np. `"PLN"`).
- `META_UNIT_SCALE` — dzielnik prezentacji tabel finansowych (domyślnie `1000` dla `tys.`).
- `META_ZERO_DATE` — data Momentu Zero w formacie `YYYY-MM-DD` (np. `"2026-12-31"`).
- `META_DEFAULT_PERIOD` — domyślnie podświetlony okres przy starcie (`1..N` lub `0` = cały rok).
- `TBL_UI_SLIDERS` — tabela definicji suwaków (wiersz nagłówkowy + definicje).
- `TBL_UI_PRESETS` — znormalizowana tabela presetów scenariuszy (`PresetID`, `PresetName`, `Description`, `SliderID`, `TargetValue`).

### 2.2 Warstwa symulacji (`SIM_*`, `01_Zalozenia_Modelu`)
Domyślnie wszystkie komórki mają wartość `0` (`0.0%`). W trybie What-If aplikacja mutuje **wyłącznie** te komórki (oraz wskazane kolumny trybu `TABLE_COLUMN_ABS`), nie naruszając wartości bazowych ani formuł:
- `SIM_VOL_DELTA`, `SIM_PRICE_DELTA`, `SIM_RAW_PRICE_DELTA`
- `SIM_PROC_DELTA`, `SIM_LOG_DELTA`, `SIM_MKT_DELTA`
- `SIM_WAGE_DELTA`, `SIM_RENT_DELTA`, `SIM_OTH_FIX_DELTA`

### 2.3 Parametry globalne (`CFG_*`, `01_Zalozenia_Modelu`)
- Sprzedaż: `CFG_Q4_SHARE`, `CFG_ONLINE_SHARE`
- Surowiec: `CFG_RAW_USAGE`, `TBL_RAW_PRICES_Q` (Q1–Q4), `CFG_RAW_PRICE_PREV`, `CFG_SAFETY_STOCK`
- Koszty zmienne: `CFG_PROC_COST`, `CFG_EXPORT_SHARE`, `CFG_LOG_EXPORT`, `CFG_LOG_DOMESTIC`, `CFG_MKT_PERF_RATE`, `CFG_SUBCONTRACT_RATE`
- Koszty stałe i podatki: `CFG_HEADCOUNT_TOTAL` *(formuła `=SUM(COL_DEPT_HEADCOUNT)` — pojedyncze źródło prawdy)*, `CFG_AVG_WAGE`, `CFG_ZUS_RATE`, `CFG_RENT_MONTHLY`, `CFG_SALES_FIXED_MONTHLY`, `CFG_OTHER_FIXED_MONTHLY`, `CFG_CIT`
- Majątek i kredyt: `CFG_EXISTING_DEPR_ANNUAL`, `CFG_CAPEX_AMOUNT`, `CFG_CAPEX_MONTH`, `CFG_NEW_LINE_DEPR_RATE`, `CFG_LOAN_AMOUNT`, `CFG_LOAN_FEE_RATE`, `CFG_LOAN_MARGIN`, `CFG_WIBOR_3M`, `CFG_WIBOR_1M`, `CFG_LOAN_FIRST_REP_MONTH`, `CFG_LOAN_REP_FREQ`, `CFG_LOAN_INSTALLMENTS`
- Kapitał obrotowy i dotacja: `CFG_DSO_ONLINE`, `CFG_DSO_B2B`, `CFG_DPO_RAW`, `CFG_DAYS_IN_MONTH`, `CFG_GRANT_MONTHLY`
- Płynność: `CFG_OV_LIMIT`, `CFG_OV_MARGIN`, `CFG_MIN_CASH`, `CFG_SH_LOAN_MARGIN`

### 2.4 Zamrożony Bilans Otwarcia (`BO_*`, `01_Zalozenia_Modelu`)
Wartości statyczne (oraz ich sumy) całkowicie odizolowane od parametrów okresu budżetowego:
- Aktywa BO: `BO_FA_NET`, `BO_INV_SAFETY`, `BO_INV_RAW`, `BO_INV_OTHER`, `BO_INV_TOTAL`, `BO_AR_ONLINE`, `BO_AR_B2B`, `BO_AR_TOTAL`, `BO_OTHER_AR`, `BO_CASH`, `BO_ASSETS_TOTAL`
- Pasywa BO: `BO_EQUITY`, `BO_AP_RAW`, `BO_AP_OTHER`, `BO_AP_TOTAL`, `BO_DEFERRED_GRANT`, `BO_LOAN`, `BO_OVERDRAFT`, `BO_SH_LOAN`, `BO_LIAB_TOTAL`

### 2.5 Tabele dynamiczne i okresy
- `TBL_PRODUCTS`, `COL_PROD_CODE`, `COL_PROD_VOL`, `COL_PROD_PRICE`, `COL_PROD_RAW_USAGE`, `COL_PROD_ACTIVE` (`01_Zalozenia_Modelu`)
- `TBL_DEPARTMENTS`, `COL_DEPT_HEADCOUNT`, `COL_DEPT_RENT_WEIGHT`, `COL_DEPT_RENT_SHARE` (`02_Alokacja_Dzialy`)
- `TBL_COST_CATEGORIES` (`02_Alokacja_Dzialy`)
- `TBL_ALLOC_MATRIX`, `COL_ALLOC_ROW_SUMS` (`02_Alokacja_Dzialy`)
- `TBL_COST_LINES_MONTHLY` (`02_Alokacja_Dzialy`)
- `TBL_DEPT_COSTS_MONTHLY`, `ROW_ALLOC_DIFF` (`02_Alokacja_Dzialy`)
- `TBL_DEPT_X_CAT_YEAR` (`02_Alokacja_Dzialy`)
- `META_PERIOD_HEADERS` (`03_Model_Operacyjny`, zakres `1×N` z etykietami `YYYY-MM` okresów budżetowych)

### 2.6 Sprawozdania i kontrole
- `STMT_PL` (`04_RZiS`)
- `STMT_BS`, `ROW_BS_CHECK` (`05_Bilans`)
- `STMT_CF`, `ROW_CF_CHECK` (`06_CashFlow`)
- `STMT_RATIOS`, `TBL_AUDIT_CHECKS` (`07_Wskazniki`)

---

## 3. Kolumny techniczne sprawozdań (`A:D` w `04_RZiS`, `05_Bilans`, `06_CashFlow`, `07_Wskazniki`)

Każdy zakres `STMT_*` zaczyna się od kolumny `A` i zawiera 4 kolumny metadanych semantycznych (w Excelu mogą być zwężone/wyszarzone) oraz kolumnę `E` (`Pozycja`) i kolumny okresów:

| Kolumna | Nazwa | Dozwolone wartości | Zastosowanie |
|---|---|---|---|
| `A` | `LINE_CODE` | Unikalny identyfikator (np. `PL_EBITDA`, `BS_CASH`, `CF_CFO`, `RT_DSO`) | Stabilne mapowanie KPI, wykresów i porównywarki scenariuszy niezależnie od tekstu etykiety. |
| `B` | `ROW_TYPE` | `SECTION`, `DETAIL`, `SUBTOTAL`, `TOTAL`, `PCT`, `RATIO`, `DAYS`, `CHECK` | Automatyczne formatowanie wierszy w tabelach UI i dobór tolerancji w deltach scenariuszy. |
| `C` | `AGG_MODE` | `SUM`, `LAST`, `FIRST`, `RATIO_REF`, `NONE` | Sposób agregacji w kolumnie rocznej oraz porównaniu scenariuszy. |
| `D` | `WF_ROLE` | `START`, `DELTA_NEG`, `DELTA_POS`, `SUBTOTAL`, `END`, `NONE` | Automatyczne budowanie mostka wyniku (Waterfall) z `04_RZiS`. |

---

## 4. Zasady edycji i rozszerzania szablonu przez zespół FP&A

1. **Zakaz Structured References (`Table[Col]`):** Wszystkie tabele są zwykłymi zakresami objętymi Nazwanym Zakresem (`TBL_*`). W formułach używaj standardowych odwołań A1 lub Named Ranges (`SUM`, `SUMIF/S`, `SUMPRODUCT`, `INDEX/MATCH`, `IF`, `MIN`, `MAX`, `MOD`, `ABS`).
2. **Zakaz pętli cyklicznych (DAG):** Odsetki od kredytu, overdraftu i pożyczki wspólników muszą być liczone od salda na początek okresu (`t-1`), aby uniknąć iteracji (`#CYCLE!`).
3. **Zakaz funkcji ulotnych i przestarzałych prefiksów:** Unikaj `OFFSET` i `INDIRECT` (zastępuj przez `INDEX`) oraz funkcji Excel 365 z prefiksem `_xlfn.` niewspieranych powszechnie (`XLOOKUP`, `LET`, `LAMBDA`, `FILTER`). Nie stosuj również formuł tablicowych CSE (zamiast `MAX(ABS(zakres))` używaj `MAX(ABS(MAX(zakres)), ABS(MIN(zakres)))`).
4. **Jedno źródło prawdy dla kadr:** Liczbę etatów edytuj wyłącznie w `TBL_DEPARTMENTS` (`02_Alokacja_Dzialy`) — `CFG_HEADCOUNT_TOTAL` w `01_Zalozenia_Modelu` aktualizuje się automatycznie.
5. **Dodawanie działu lub produktu:** Wstaw wiersz wewnątrz istniejącego zakresu Named Range (tak aby Excel automatycznie rozszerzył definicję `TBL_*` i `COL_*`), uzupełnij kod oraz kolumnę w `TBL_ALLOC_MATRIX` (zachowując `RowSum = 100%`).
6. **Dodawanie kolejnych okresów (np. 18M/24M):** Rozszerz kolumny w `03_Model_Operacyjny` oraz w zakresach `STMT_*` i `META_PERIOD_HEADERS`.
7. **Niezmienność Momentu Zero:** Pozycje otwarcia (`BO_*`) nie mogą odwoływać się do założeń roku budżetowego.
