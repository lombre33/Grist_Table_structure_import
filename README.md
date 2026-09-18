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

## Export

1. Ouvrez l'onglet **Export**. La liste des tables de ce document se charge
   automatiquement (bouton **Actualiser la liste** pour la rafraîchir).
2. Cochez une ou plusieurs tables, puis cliquez sur **Générer le code**.
3. Copiez le code affiché (bouton **Copier**, ou sélection manuelle du texte) et
   collez-le où vous en avez besoin — par exemple dans l'onglet **Import** de ce même
   widget, ouvert sur un autre document.

Le format généré suit exactement celui de la vraie « Code View » de Grist : mêmes lignes
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
js/parser.js           lecture du code source (regex uniquement, jamais exécuté)
js/gristTypes.js       types Python <-> types de colonne Grist, dans les deux sens
js/schema.js           lecture de la structure réelle du document (_grist_Tables*)
js/codeGenerator.js    génère le code Python à partir d'une structure de table
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
