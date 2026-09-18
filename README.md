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
     toutes les colonnes détectées.
   - **Table existante** : ajoute uniquement les colonnes qui manquent à une table déjà
     présente dans ce document ; les colonnes dont l'identifiant existe déjà sur la table
     choisie sont repérées « Déjà présente » dans l'aperçu et ignorées — leur type n'est
     jamais modifié.
4. Vérifiez l'aperçu (types détectés, colonnes ignorées, remarques éventuelles), puis
   cliquez sur le bouton d'action.

Le widget ne modifie ni ne supprime jamais une colonne ou une table existante : en mode
« Nouvelle table », un identifiant déjà pris est refusé (choisissez-en un autre) ; en
mode « Table existante », seules les colonnes absentes sont ajoutées.

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
y compris celles écrites avec `@grist.formulaType(...)` dans le code source : ce format
sert à Grist à afficher aussi les colonnes de données normales dans la Code View, il ne
signifie pas que la colonne d'origine est une formule.

### Métadonnées de colonne restaurées à l'import

En plus du type, l'import restaure — quand ils sont présents dans le texte collé sous
la forme des arguments nommés supplémentaires décrits plus bas (« Métadonnées
capturées à l'export ») — le libellé (`label`), la description, la liste de choix et
son style (couleurs, gras...) pour Choix/Choix multiples, et le reste des options
d'affichage de la colonne (`widgetOptions` : alignement, retour à la ligne, format
numérique/date, etc.). Un texte Code View réel, provenant directement de Grist (sans
ces arguments), s'importe exactement comme avant : seul le type est alors repris, comme
précédemment.

### Limites connues

- Les valeurs d'une liste de choix ne sont reprises que si elles apparaissent
  explicitement dans le code sous la forme `choices=['A', 'B']`. Un texte collé depuis
  la vraie Code View de Grist (qui n'expose habituellement pas ces valeurs) ne les
  contient pas ; un texte généré par l'onglet **Export** de ce même widget, si.
- Pour une colonne de référence, la « colonne d'affichage » (visible column) est
  restaurée automatiquement quand le texte collé précise `visible_col='NomDeColonne'`
  **et** que cette colonne cible existe déjà dans le document de destination — ce qui
  est de toute façon nécessaire pour que la colonne s'importe en Référence plutôt qu'en
  `Any` (voir ci-dessous). Cas non géré, signalé par un avertissement plutôt qu'une
  erreur silencieuse : une auto-référence vers la table en cours de création elle-même,
  en mode « Nouvelle table » (la colonne cible n'existe pas encore au moment de la
  résolution ; en mode « Table existante », ce même cas fonctionne, la table cible
  existant déjà). Sans `visible_col`, comme avant, la colonne d'affichage n'est pas
  définie automatiquement ; vous pouvez la choisir manuellement après création.
- Si une colonne référence une table qui n'existe pas encore dans le document de
  destination (et n'est pas la table en cours de création), elle est importée en type
  `Any` plutôt qu'en référence, avec un avertissement affiché dans l'aperçu.
- Les arguments de constructeur complexes (expressions, appels imbriqués autres que les
  arguments nommés reconnus ci-dessous) ne sont pas interprétés ; seuls le premier
  argument texte entre guillemets (nom de table cible, fuseau horaire) et les arguments
  nommés `choices=`, `widget_options=`, `label=`, `description=`, `visible_col=` sont
  lus — le reste est ignoré sans faire échouer l'import de la colonne.
- Une valeur contenant une parenthèse ou un crochet littéral (ex. un choix nommé
  `'Oui (confirmé)'`) est prise en charge correctement (voir SECURITY.md) ; un appel
  dont les parenthèses ne sont pas correctement refermées est en revanche ignoré comme
  contenu non reconnu, avec un avertissement.

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
les autres. Un texte Code View authentique, collé depuis Grist sans ces arguments,
continue de s'importer exactement comme avant (seul le type est alors repris) — ces
arguments sont une extension strictement additive du format, reconnue par l'onglet
**Import** de ce même widget. Voir SECURITY.md pour comment ce texte supplémentaire est
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

Le widget est du HTML/CSS/JS statique sans dépendance (modules ES natifs, aucun paquet
npm requis pour l'exécution). `package.json` ne sert qu'au lancement des tests :

```sh
npm test   # node --test — aucune installation nécessaire
```

Pour tester l'interface dans un vrai navigateur sans document Grist sous la main,
`test/browser/harness.html` recharge le widget réel (mêmes `js/*.js` et `style.css`) avec
une API Grist minimale simulée (aucune dépendance, un simple `<script>` inline dans ce
fichier de test) : ouvrez-le directement dans un navigateur. Ce fichier n'est jamais
publié (voir `.github/workflows/pages.yml`, qui ne copie que `index.html`, `style.css`,
`favicon.svg` et `js/*.js`).

Structure :

```
index.html            page du widget (onglets Import / Export)
style.css              mise en forme
js/parser.js           lecture du code source (regex + scanner de parenthèses/crochets,
                        jamais exécuté)
js/gristTypes.js       types Python <-> types de colonne Grist, métadonnées étendues
                        (choix, styles, widgetOptions...), dans les deux sens
js/schema.js           lecture de la structure réelle du document (_grist_Tables*),
                        détection des tables référencées non sélectionnées
js/codeGenerator.js    génère le code Python (types + métadonnées) à partir d'une
                        structure de table
js/dom.js              construction du DOM sans innerHTML
js/util.js             petits utilitaires partagés (délai, pluriel, messages d'erreur)
js/importTab.js        logique de l'onglet Import (nouvelle table / table existante)
js/exportTab.js        logique de l'onglet Export
js/app.js              point d'entrée : bascule d'onglet, initialisation
test/                  tests unitaires (node --test, aucune dépendance)
```

## Sécurité

Voir [SECURITY.md](./SECURITY.md) pour le modèle de menace, la politique de dépendances,
la Content-Security-Policy appliquée et la manière de vérifier vous-même ces propriétés
(utile en amont d'un audit de sécurité).

## Licence

[MIT](./LICENSE).
