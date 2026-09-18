# Import de structure de table Grist

Widget personnalisé pour [Grist](https://www.getgrist.com/), à héberger sur GitHub Pages.

Il permet de recréer, dans le document Grist où le widget est ajouté, une table déjà
configurée (colonnes, types, listes de choix, références...) à partir du code Python
d'une table copié depuis un **autre** document Grist (menu de la table, « Code View »).

Aucune donnée n'est envoyée où que ce soit : le texte collé est analysé entièrement dans
le navigateur, et la seule action effectuée est la création de la table dans le document
Grist courant, via l'API officielle du widget.

## Utilisation

1. Dans le document Grist source, ouvrez la table à dupliquer puis son menu **Code View**
   pour obtenir son code (voir exemple ci-dessous).
2. Dans le document Grist de destination, ajoutez ce widget (voir « Installation »),
   collez le code dans la zone de texte, puis cliquez sur **Analyser**.
3. Vérifiez l'aperçu (identifiant de table, liste des colonnes et types détectés,
   remarques éventuelles), ajustez l'identifiant de table si besoin.
4. Cliquez sur **Créer la table dans ce document**.

Le widget ne modifie jamais une table existante : si l'identifiant choisi correspond à
une table déjà présente, la création est refusée et vous devez en choisir un autre.

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

| Écrit dans le code                    | Type de colonne créé dans Grist |
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

Toutes les colonnes sont créées comme colonnes de données (pas de formules), y compris
celles écrites avec `@grist.formulaType(...)` dans le code source : ce format sert à
Grist à afficher aussi les colonnes de données normales dans la Code View, il ne signifie
pas que la colonne d'origine est une formule.

### Limites connues

- Les valeurs d'une liste de choix ne sont reprises que si elles apparaissent
  explicitement dans le code sous la forme `choices=['A', 'B']` (rarement le cas :
  Code View n'expose habituellement pas ces valeurs). Sinon, la colonne est créée en
  type Choix/Choix multiples mais sans liste préremplie.
- Pour une colonne de référence, la « colonne d'affichage » (visible column) n'est pas
  définie automatiquement ; vous pouvez la choisir manuellement après création.
- Si une colonne référence une table qui n'existe pas encore dans le document de
  destination (et n'est pas la table en cours de création), elle est importée en type
  `Any` plutôt qu'en référence, avec un avertissement affiché dans l'aperçu.
- Les arguments de constructeur complexes (expressions, parenthèses imbriquées) ne sont
  pas interprétés ; seul le premier argument texte entre guillemets est lu (nom de table
  cible, fuseau horaire).

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
index.html         page du widget
style.css           mise en forme
js/parser.js        lecture du texte source (regex uniquement, jamais exécuté)
js/gristTypes.js     conversion des types Python → types de colonne Grist
js/dom.js            construction du DOM sans innerHTML
js/app.js            interface : analyse, aperçu, création de la table
test/                tests unitaires (node --test, aucune dépendance)
```

## Sécurité

Voir [SECURITY.md](./SECURITY.md) pour le modèle de menace, la politique de dépendances,
la Content-Security-Policy appliquée et la manière de vérifier vous-même ces propriétés
(utile en amont d'un audit de sécurité).

## Licence

[MIT](./LICENSE).
