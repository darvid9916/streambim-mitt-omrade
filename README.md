# Mitt område – StreamBIM-widget

En widgetpanel för StreamBIM. Den visar en hantverkare hens egna objekt i dagens zon, med ett tryck och utan lager eller söksyntax.

**Flöde:** `getUserEmail` → rolltabell → planeringstabell → `applyObjectSearch` (entreprenör + zon) → `setSearchVisualizationMode('FADED')` → `zoomToSearchResult` → `colorCodeObjectsWithLegends` (status).

## Filer

| Fil | Innehåll |
|---|---|
| `index.html`, `app.js`, `styles.css` | Själva widgeten (statisk, inget byggsteg) |
| `lib/streambim-widget-api.min.js` | StreamBIMs bibliotek v3.0.0 (MIT), kopierat från github.com/streambim/streambim-widget-api |
| `config/settings.json` | Egenskapsnamn (pset/nycklar), statusvärden, färger, ärendetext |
| `config/roles.json` | Rolltabell: e-post eller `@domän` → företag, entreprenörsvärde, disciplin, språk |
| `config/plan.json` | Planeringstabell: entreprenör + datumintervall → våning + zon |
| `mock.js` | Demoläge, öppna `index.html?mock=1` för att prova utan StreamBIM |
| `ids/platsdata.ids` | IDS 1.0 som kontrollerar Platsdata/Entreprenor, Zon, Byggdel |

## Datakrav (gör detta först)

Följande egenskaper ska finnas i alla delmodeller, i Pset `Platsdata`:

- `Entreprenor` – samma värde som `contractorValue` i rolltabellen, t.ex. `EL - Elbolaget AB`
- `Zon` – t.ex. `B`
- `Byggdel` – t.ex. `63.B Dosor`

Status (valfritt): `Egenkontroll` / `Status`. Värden i `doneValues` räknas som klara, alla andra värden som kvar och tomt värde som utan status.

Använd andra namn genom att ändra `config/settings.json` och IDS-filen. Kontrollera modellerna med `ids/platsdata.ids` i Solibri eller med ifctester.

**Våning:** sökningen filtrerar bara på våning om `properties.floor` pekar på en egenskap, t.ex. `Vaning`. Annars används `gotoFloor` för att visa rätt plan, och zonvärdena bör vara unika per plan.

## Hosting – rekommendation

**Pilot: GitHub Pages.** Gratis, HTTPS och inget byggsteg. Pages sätter inga headers som blockerar iframe-inbäddning.
1. Lägg mappens innehåll i ett repo, t.ex. `darvid9916/streambim-mitt-omrade`.
2. Gå till Settings → Pages → Deploy from branch → `main` / root.
3. Adressen blir `https://darvid9916.github.io/streambim-mitt-omrade/`.

⚠️ GitHub Pages är alltid publikt, så lägg **aldrig personliga e-postadresser** i `roles.json` där. Använd domänrader (`@elbolaget.se`), som i exemplet.

**Drift: Azure Static Web Apps** i Swecos tenant, med en liten Azure Function som returnerar `roles.json` och `plan.json` bakom Entra ID (OpenID Connect). Peka `configBaseUrl` i `settings.json` mot funktionen. Själva widgeten behöver ingen ändring.

## Testlista i testprojektet (Test 1, Sweco: projectId 5364, buildingId 1000)

Följande står inte i API-dokumentationen. Verifiera det och justera `settings.json` vid behov:

1. Regler i samma inre array i `filter.rules` tolkas som OCH (`[[regelA, regelB]]`).
2. Likhetsoperatorn heter `=` (`search.equalsOperator`).
3. Formatet på `ObjectInfo.properties`, alltså `Pset~Nyckel` eller bara `Nyckel`. `getProp()` i `app.js` hanterar båda.
4. Färger utan `#`, som i README-exemplet (`4abb32`).
5. `getFloors()` returnerar id/namn som matchar `plan.json` → `floor`.

## Ärenden

Widget-API:t saknar dokumenterad metod för att skapa ärenden. Widgeten markerar och flyger till objektet och visar sedan var StreamBIMs egen ärendeknapp finns (texten ligger i `issueHint`). Fråga Rendra om ett API-anrop för "nytt ärende med valt objekt".
