# Structure de table Grist — Import / Export

Widget personnalisé pour [Grist](https://www.getgrist.com/), à héberger sur GitHub Pages.

Deux onglets :

- **Import** : recrée, dans le document Grist où le widget est ajouté, la structure
  d'une table (colonnes, types, références...) à partir de son code Python (menu de la
  table, « Code View »), copié depuis n'importe quel document Grist.
- **Export** : choisit une ou plusieurs tables de **ce** document et génère leur code, au
  même format, prêt à être collé ailleurs (y compris dans ce même widget, dans un autre
  document).

Aucune donnée n'est envoyée où que ce soit : tout est lu et analysé entièrement dans le
navigateur, et la seule action effectuée sur demande est la création d'une table ou
l'ajout de colonnes dans le document Grist courant, via l'API officielle du widget.

## Import

1. Dans le document Grist source, ouvrez la table à dupliquer puis son menu **Code View**
   pour obtenir son code (voir exemple ci-dessous) — ou utilisez l'onglet **Export** de ce
   même widget sur ce document.
2. Dans le document Grist de destination, ouvrez l'onglet **Import**, collez le code dans
   la zone de texte, puis cliquez sur **Analyser**.
3. Choisissez ce qu'il doit se passer :
   - **Nouvelle table** (recommandé, sélectionné par défaut) : crée une table dédiée avec
     toutes les colonnes détectées. Si le texte collé contient plusieurs tables, elles
     sont toutes cochées par défaut ; décochez celles à ne pas créer. L'aperçu affiche
     alors les colonnes de chaque table cochée à la suite, séparées par un intitulé
     discret, avec un champ d'identifiant par table (pré-rempli avec le nom d'origine,
     première lettre en majuscule, modifiable) — tout est créé en une seule fois, en un
     seul clic, et les références entre ces tables sont conservées (elles suivent le
     nouvel identifiant si vous en changez un).
   - **Table existante** : ajoute uniquement les colonnes qui manquent à une table déjà
     présente dans ce document (une seule table source à la fois) ; les colonnes dont
     l'identifiant existe déjà sur la table choisie — sans tenir compte des majuscules,
     comme Grist — sont repérées « Déjà présente » dans l'aperçu et ignorées : leur type
     n'est jamais modifié. Les colonnes ajoutées apparaissent immédiatement dans les
     grilles déjà existantes de cette table, pas seulement dans « Données sources ».
4. Vérifiez l'aperçu (types détectés, colonnes ignorées, remarques éventuelles) — chaque
   colonne a sa propre case à cocher (cochée par défaut) pour l'exclure individuellement
   de l'action, en plus de la sélection par table — puis cliquez sur le bouton d'action.
   Le bouton **Effacer**, à côté d'Analyser, réinitialise entièrement l'onglet pour
   recommencer avec un autre texte.

Le widget ne modifie ni ne supprime jamais une colonne ou une table existante : en mode
« Nouvelle table », un identifiant déjà pris (sans tenir compte des majuscules, y compris
entre deux tables de la même sélection) est refusé ; en mode « Table existante », seules
les colonnes absentes sont ajoutées. Un identifiant de table doit être un identifiant
que Grist crée tel quel : majuscule initiale, puis lettres, chiffres ou `_` (ni accent, ni
espace, ni `None`/`True`/`False`) ; sinon Grist le réécrirait en silence.

Aucune confirmation n'est demandée avant de cliquer sur le bouton d'action : c'est un
choix délibéré, pas un oubli. Les actions de ce widget sont strictement additives (jamais
de suppression ni de modification d'une colonne ou table existante, voir ci-dessus), et le
bouton lui-même annonce déjà précisément la portée de l'action (« Créer 2 tables dans ce
document », « Ajouter 3 colonnes à cette table »...) au moment de cliquer — une boîte de
dialogue de confirmation ajouterait une étape sans réduire aucun risque réel ici. Le
filet de sécurité reste, comme pour toute action dans Grist, l'annulation native du
document (Ctrl+Z / Cmd+Z).

### Exemple de code accepté

```python
import grist
from functions import *
import datetime, math, re

@grist.UserTable
class INFOS_BENEVOLES:
  Dispo_Mardi22 = grist.Choice()

  @grist.formulaType(grist.Text())
  def Nom_de_famille(rec, table):
    return ''

  @grist.formulaType(grist.Reference('INFOS_BENEVOLES'))
  def FormPlus_src_INFOS_BENEVOLES_Prenom(rec, table):
    return 0
```

Un même collé peut contenir plusieurs blocs `@grist.UserTable` / `class ... :` : le
widget vous laisse alors choisir la table à importer.

### Correspondance des types

Cette table sert dans les deux sens : à l'import, pour choisir le type de colonne créé ;
à l'export, pour écrire l'expression correspondant au vrai type de la colonne (voir
« Export » plus bas).

| Écrit dans le code                    | Type de colonne Grist |
|----------------------------------------|----------------------------------|
| `grist.Text()`                         | Texte                            |
| `grist.Numeric()`                      | Numérique                        |
| `grist.Int()`                          | Entier                           |
| `grist.Bool()`                         | Case à cocher                    |
| `grist.Date()`                         | Date                             |
| `grist.DateTime('Fuseau')`             | Date et heure (fuseau donné, sinon `UTC` par défaut) |
| `grist.Choice()`                       | Choix (liste déroulante)         |
| `grist.ChoiceList()`                   | Choix multiples                  |
| `grist.Reference('Autre_Table')`       | Référence vers `Autre_Table`     |
| `grist.ReferenceList('Autre_Table')`   | Références vers `Autre_Table` (liste) |
| `grist.Attachments()`                  | Pièces jointes                   |
| tout le reste / type non reconnu       | Quelconque (`Any`)               |

À l'import, toutes les colonnes sont créées comme colonnes de données (pas de formules),
y compris celles écrites avec `@grist.formulaType(...)` dans le code source. Ce que le
widget ne peut pas reproduire n'est pas perdu en silence : les colonnes calculées (formule
ou valeur par défaut déclenchée, `def _default_...`) sont créées vides et les références
bidirectionnelles (`reverse_of=`) comme références simples ; une remarque de l'aperçu
les liste.

### Métadonnées de colonne restaurées à l'import

En plus du type, l'import restaure — quand ils sont présents dans le texte collé sous
la forme des arguments nommés supplémentaires décrits plus bas (« Métadonnées
capturées à l'export ») — le libellé (`label`), la description, la liste de choix et
son style (couleurs, gras...) pour Choix/Choix multiples, et le reste des options
d'affichage de la colonne (`widgetOptions` : alignement, retour à la ligne, format
numérique/date, etc.). Grist ignore la description quand on crée une colonne : le
widget l'applique juste après, dans une seconde étape. Un texte Code View réel, issu
directement de Grist (sans ces arguments), ne donne que les types.

### Limites connues

- Les valeurs d'une liste de choix ne sont reprises que si elles apparaissent
  explicitement dans le code sous la forme `choices=['A', 'B']`. Un texte collé depuis
  la vraie Code View de Grist (qui n'expose pas ces valeurs) ne les contient pas ; un
  texte généré par l'onglet **Export** de ce même widget, si.
- Pour une colonne de référence, la « colonne d'affichage » (visible column) est
  restaurée quand le texte précise `visible_col='NomDeColonne'` et que cette colonne
  existe dans la table cible, déjà présente ou créée dans le même lot. Introuvable, elle
  est signalée dans le message de fin, sans faire échouer la création.
- Si une colonne référence une table qui n'existe pas dans le document de destination
  (et n'est pas créée en même temps), elle est importée en type `Any` avec un
  avertissement dans l'aperçu.
- Les arguments de constructeur complexes (expressions, appels imbriqués) ne sont pas
  interprétés ; seuls le premier argument texte (table cible, fuseau horaire) et les
  arguments nommés `choices=`, `widget_options=`, `label=`, `description=`, `visible_col=`
  et `reverse_of=` sont lus — le reste est ignoré sans faire échouer l'import de la colonne.
- Un appel dont les parenthèses ne sont pas refermées, ou une valeur texte qui s'étend sur
  plusieurs lignes dans un texte écrit à la main, est ignoré comme contenu non reconnu,
  avec un avertissement. Le texte généré par l'onglet **Export** n'a jamais ce défaut :
  les retours à la ligne y sont écrits `\n`.
- Grist réécrit certains identifiants de colonne (`_x` devient `x`, `class` devient
  `cclass`) : le widget suit l'identifiant réellement créé. Une colonne nommée `grist`
  fait en revanche échouer Grist lui-même (le code généré du document masque alors son
  propre module `grist`) : l'erreur est affichée et rien n'est créé.

## Export

1. Ouvrez l'onglet **Export**. La liste des tables de ce document se charge
   automatiquement (bouton **Actualiser la liste** pour la rafraîchir).
2. Cochez une ou plusieurs tables, puis cliquez sur **Générer le code**.
3. Copiez le code affiché (bouton **Copier**, ou sélection manuelle du texte) et
   collez-le où vous en avez besoin — par exemple dans l'onglet **Import** de ce même
   widget, ouvert sur un autre document.

Le format généré suit celui de la vraie « Code View » de Grist : mêmes lignes
d'import en en-tête, mêmes expressions `grist.Xxx(...)`, même ordre (colonnes de données
d'abord, puis colonnes de formule), mêmes lignes vides. Les tables système de Grist
(`_grist_*`) et les tables de synthèse (créées par un widget Synthèse/Pivot) ne sont pas
proposées : ce ne sont pas des tables qu'on recrée avec une simple action « nouvelle
table ».

Seule la structure (types de colonnes) est garantie fidèle. Pour une colonne de formule,
la formule d'origine est recopiée quand elle existe, mais telle que Grist la stocke en
interne (syntaxe `$Colonne`, sans traduire vers le `rec.Colonne` affiché par la vraie
Code View) ; une formule vide est remplacée par la valeur par défaut du type, comme le
fait Grist lui-même. Ceci n'affecte pas l'import : seul le type déclaré par
`@grist.formulaType(...)` est utilisé, jamais le corps de la fonction.

### Métadonnées capturées à l'export

Au-delà du type de chaque colonne, l'export capture et restitue le plus possible de sa
configuration réelle, pour que l'import qui suit la restaure fidèlement — en particulier
les choix définis (liste et style par choix), qui sont le cas le plus courant. Ceci est
fait en ajoutant, sur la même ligne que chaque `grist.Xxx(...)`, des arguments nommés
supplémentaires, tous optionnels :

- **`choices=[...]`** : la liste des valeurs d'un Choix/Choix multiples.
- **`widget_options='<JSON>'`** : le reste des options d'affichage de la colonne
  (`widgetOptions`, tel que Grist les stocke), sous forme d'un objet JSON — notamment le
  style par choix (`choiceOptions` : couleur de texte/fond, gras...), l'alignement, le
  retour à la ligne, le format numérique ou de date, et toute autre option générique
  rencontrée. Quelques clés sont volontairement exclues ou réduites (styles de mise en
  forme conditionnelle, formule compilée d'une condition de liste déroulante) : voir
  SECURITY.md pour le détail et la justification de chacune. Absent entièrement si la
  colonne n'a aucune option à en dehors des choix.
- **`label='...'`** : le libellé affiché de la colonne, uniquement s'il diffère de son
  identifiant (Grist les fait correspondre par défaut).
- **`description='...'`** : la description de la colonne, si elle est renseignée.
- **`visible_col='NomDeColonne'`** : pour une colonne de référence, l'identifiant (pas
  l'identifiant technique interne, propre au document et sans signification ailleurs) de
  la colonne de la table cible utilisée comme « colonne d'affichage ».

**Ce sont des arguments propres à ce widget, pas le format officiel de la Code View de
Grist** : Grist lui-même n'écrit, au mieux, que `choices=[...]` dans de rares cas, jamais
les autres. Un texte Code View authentique, collé depuis Grist sans ces arguments, ne
donne que les types — ces arguments sont une extension strictement additive du format,
reconnue par l'onglet **Import** de ce même widget. Voir SECURITY.md pour comment ce texte supplémentaire est
analysé (toujours par simple lecture de texte, jamais exécuté) et « Limites connues »
ci-dessus pour les cas non couverts.

### Tables référencées non sélectionnées

Si les tables cochées contiennent une colonne de référence (simple ou liste) vers une
table de ce document qui n'est elle-même pas cochée, un bandeau d'information apparaît
au-dessus de la liste, énumérant la ou les tables concernées et la colonne qui pointe
vers chacune. Deux choix, tous deux non bloquants (le bouton **Générer le code** reste
utilisable dans tous les cas) :

- **Inclure ces tables** : coche-les automatiquement (et peut faire réapparaître le
  bandeau si l'une d'elles référence à son tour une autre table non cochée) ;
- **Continuer sans elles** : masque le bandeau pour cette situation précise ; il
  réapparaît si la sélection change de façon à produire un ensemble différent de tables
  manquantes.

Générer le code sans inclure une table référencée n'est pas une erreur : la colonne de
référence correspondante s'importera simplement en type `Any` dans le document de
destination si la table cible n'y existe pas non plus, avec un avertissement affiché
dans l'aperçu de l'onglet **Import** (voir « Limites connues » ci-dessus) — exactement
comme pour toute référence vers une table absente.

## Identité visuelle (Grist Factory)

L'interface suit l'identité UI/UX commune aux widgets **Grist Factory** (grist-factory.fr) :

- **Palette** : une base neutre (fond/surface/bordures/texte en plusieurs intensités) et
  un seul bleu d'accent (`#2f6fed`) pour les actions et états actifs ; rouge pour les
  erreurs, ambre pour les remarques de l'analyse, vert pour les confirmations — jamais de
  couleur sans rôle sémantique. Coins arrondis partout (7 px / 11 px), ombres douces
  réservées aux éléments flottants (le panneau Réglages) et très légères sur les cartes.
- **Typographie** : **Manrope** (police variable) pour toute l'interface, vendorisée
  dans `fonts/manrope/` (police variable, licence SIL Open Font License jointe) plutôt
  que chargée depuis une CDN — voir SECURITY.md. Le code Python (collé ou généré) reste
  en police à chasse fixe, monospace, inchangé.
- **Thème système / clair / sombre** : réglable dans le panneau Réglages (icône en haut
  à droite), mémorisé sur cet appareil. « Système » (par défaut) suit le thème du
  système d'exploitation.
- **Icônes** : deux SVG en contour, en ligne dans `index.html`, aucune police d'icônes
  ni emoji (voir SECURITY.md).
- **Bilingue français / anglais** : réglable dans le même panneau. Toute chaîne visible
  de l'interface est traduite (`js/i18n.js`, dont un test vérifie que les deux langues
  ont les mêmes clés, formes plurielles et paramètres) — aussi bien les libellés fixes (titres,
  boutons, en-têtes, aide) que les messages générés dynamiquement pendant l'usage
  (statuts de création/ajout, avertissements d'analyse), accords singulier/pluriel
  compris (ex. « Table « X » créée avec 1 colonne. » / « ... avec 3 colonnes. »).
- **Logo** : celui de Grist Factory, affiché discrètement juste à droite du bouton
  Réglages (`assets/grist-factory-logo.jpg`).
- **Crédits** (panneau Réglages) : Grist Factory, site, licence.

## Installation (hébergement GitHub Pages)

1. Dans les paramètres du dépôt, activez **Pages** en choisissant la source
   « GitHub Actions » (le workflow `.github/workflows/pages.yml` fourni construit et
   publie automatiquement le site à chaque envoi sur `main`).
2. Une fois publié, l'URL du widget est celle indiquée par GitHub Pages, avec
   `index.html` à la racine (par ex. `https://<compte>.github.io/<depot>/`).
3. Dans un document Grist, ajoutez un widget **Personnalisé** (Custom) et collez cette
   URL. Grist demandera d'accorder l'accès complet au document (nécessaire pour créer
   une table) : c'est attendu, voir [SECURITY.md](./SECURITY.md).

### Hébergement en réseau fermé / auto-hébergé

Le widget charge l'API officielle de Grist depuis `https://docs.getgrist.com/grist-plugin-api.js`
(voir [SECURITY.md](./SECURITY.md) pour la justification). Si votre Grist est
auto-hébergé sur un réseau sans accès à ce domaine, votre instance Grist sert déjà ce
même fichier à sa propre racine (`<votre-grist>/grist-plugin-api.js`) : changez
simplement la balise `<script src="...">` dans `index.html` (et l'origine correspondante
dans la directive `script-src` de la CSP) pour pointer vers votre propre instance avant
de publier ce dépôt sur votre propre hébergement statique.

## Développement

Le widget est du HTML/CSS/JS statique sans dépendance d'exécution (modules ES natifs,
aucun paquet npm requis pour le faire tourner). Code, commentaires et titres de tests en
anglais ; documentation et messages de commit en français.

Trois suites de tests :

```sh
npm test               # unitaires (node --test, aucune installation) : parseur,
                       # génération, types, i18n, lint de sécurité, vrai Code View enregistré
npm run test:browser   # le vrai index.html dans Chromium (Playwright), faux `grist` en mémoire
npm run test:grist     # le widget contre une vraie instance Grist (voir ci-dessous)
```

`npm test` suffit pour la logique : il n'a besoin ni de navigateur ni de Grist. Le test de
sécurité (`test/security.test.mjs`) y interdit dans `js/` `eval`, le constructeur `Function`,
`innerHTML`/`outerHTML`, `document.write`, `import()`, `fetch`, `WebSocket`..., et vérifie
que `index.html` ne charge que l'API officielle de Grist et sa CSP.

Playwright, seule dépendance du dépôt (`devDependencies`, jamais publiée avec le widget),
sert aux deux autres suites :

```sh
npm ci
npx playwright install chromium
```

### Tests sur une instance Grist réelle

`npm run test:grist` pilote une vraie instance Grist par son API REST (qui expose la même
chose que l'API d'un widget : `listTables`, `fetchTable`, `applyUserActions` avec ses
`retValues`). Il vérifie ce que le widget attend du moteur (normalisation des identifiants,
description ignorée à la création, lot atomique...), l'aller-retour Export → Import de
chaque type de colonne avec toutes ses options, les identifiants contre le moteur, la
logique d'import, et l'interface complète pilotée dans Chromium, et le widget monté comme widget personnalisé
dans la vraie page de Grist (iframe, vrai script d'API, vraie autorisation d'accès). Pour
en lancer une :

```sh
docker run -d -p 8484:8484 -e APP_HOME_URL=http://localhost:8484 \
  -e GRIST_DEFAULT_EMAIL=ci@example.com -e GRIST_IN_SERVICE=true \
  -e GRIST_SANDBOX_FLAVOR=unsandboxed gristlabs/grist:1.7.20
GRIST_URL=http://localhost:8484 npm run test:grist   # GRIST_URL est ce défaut
```

Grist n'accepte que le nom d'hôte de `APP_HOME_URL` (`localhost`, pas `127.0.0.1`). La CI
exécute la même suite sur la même image (épinglée par digest). Si Chromium n'est pas à
l'emplacement attendu par Playwright, `PLAYWRIGHT_CHROMIUM_PATH` indique l'exécutable.

Les fixtures de `test/fixtures/code-view/` sont du texte Code View produit par le
`gencode.py` d'un vrai Grist ; elles se régénèrent avec `test/grist/record-code-view.mjs`
(`GRIST_SANDBOX_DIR=<grist-core>/sandbox/grist`, `GRIST_PYTHON`, `GRIST_VERSION`).

Structure :

```
index.html             page du widget (en-tête, panneau Réglages, onglets Import / Export)
style.css              mise en forme (identité visuelle Grist Factory, thème clair/sombre)
fonts/manrope/         police Manrope vendorisée (voir SECURITY.md)
assets/                logo Grist Factory (voir SECURITY.md)
js/app.js              point d'entrée : onglets, initialisation
js/importTab.js        onglet Import : câblage du DOM
js/importer.js         logique de l'import sans DOM : résolution des colonnes, identifiants,
                       création en un lot puis descriptions et colonnes d'affichage
js/exportTab.js        onglet Export
js/parser.js           lecture du code source (motifs fixes + scanner de parenthèses, jamais exécuté)
js/pyText.js           texte Python : littéraux, parenthèse fermante, arguments d'un appel
js/gristTypes.js       types de colonne <-> constructeurs Code View (une table de types)
js/widgetOptions.js    ce qui d'un widgetOptions peut voyager d'un document à l'autre
js/schema.js           structure réelle du document (_grist_Tables*), tables référencées
js/codeGenerator.js    génère le code Python (types + métadonnées)
js/dom.js              construction du DOM sans innerHTML
js/i18n.js             dictionnaire fr/en + liaison data-i18n
js/settings.js         panneau Réglages (thème, langue)
js/storage.js          préférences mémorisées (localStorage, tolérant au blocage)
js/util.js             délai d'attente des appels Grist, texte des erreurs
test/*.test.mjs        tests unitaires ; test/fixtures/ : vrai Code View enregistré
test/browser/          interface dans Chromium (faux grist en mémoire)
test/grist/            tests contre une vraie instance Grist
```

## Sécurité

Voir [SECURITY.md](./SECURITY.md) pour le modèle de menace, la politique de dépendances,
la Content-Security-Policy appliquée et la manière de vérifier vous-même ces propriétés
(utile en amont d'un audit de sécurité).

## Licence

[GNU GPL v3.0](./LICENSE).
