# Structure de table Grist — Import / Export

Widget personnalisé pour [Grist](https://www.getgrist.com/), à héberger sur GitHub Pages.

Deux onglets :

- **Import** : recrée, dans le document Grist où le widget est ajouté, la structure
  d'une table (colonnes, types, références...) à partir de son code Python (menu de la
  table, « Code View »), copié depuis n'importe quel document Grist ; on choisit ce qu'on
  reprend, colonne par colonne et par élément (libellés, descriptions, choix, formules...).
- **Export** : choisit une ou plusieurs tables de **ce** document, et ce qu'on en garde
  (les mêmes éléments), puis génère leur code, au même format, prêt à être collé ailleurs
  (y compris dans ce même widget, dans un autre document).

Aucune donnée n'est envoyée où que ce soit : tout est lu et analysé entièrement dans le
navigateur, et la seule action effectuée sur demande, après confirmation, est la création
d'une table ou l'ajout de colonnes dans le document Grist courant (avec, pour ce qui vient
d'être créé, ses descriptions, ses colonnes affichées et ses formules), via l'API officielle
du widget.

## Import

1. Dans le document Grist source, ouvrez la table à dupliquer puis son menu **Code View**
   pour obtenir son code (voir exemple ci-dessous) — ou utilisez l'onglet **Export** de ce
   même widget sur ce document.
2. Dans le document Grist de destination, ouvrez l'onglet **Import** et collez le code dans
   la zone de texte : il est analysé dès qu'il est collé (le bouton **Analyser** sert pour
   un texte tapé ou modifié).
3. Choisissez ce qu'il doit se passer, avec le sélecteur qui ouvre l'aperçu (la ligne
   dessous décrit le choix en cours) :
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
   colonne a sa propre case à cocher (cochée par défaut, la case de l'en-tête les coche ou
   les décoche toutes) pour l'exclure individuellement de l'action, en plus de la sélection
   par table ; une colonne décochée est grisée. Sous le champ d'identifiant de chaque table,
   une ligne en italique donne la description que le code lui donne (tant que l'élément
   **Descriptions des tables** est coché). Sous l'aperçu, le groupe **Éléments à
   importer**, replié, liste ce que le texte contient au-delà du type des colonnes (voir plus
   bas) : tout y est coché par défaut, sauf les formules, et son résumé dit ce qui sera
   importé (« Tous », « Sans formules », « 4 sur 7 »…). Cliquez ensuite sur le bouton
   d'action, qui reste affiché en bas de l'aperçu pendant qu'on le parcourt, puis confirmez
   dans la boîte qui résume ce qui va être ajouté. L'icône
   **Effacer** (✕), en haut à droite de l'étape 1, réinitialise entièrement l'onglet pour
   recommencer avec un autre texte.

Le widget ne modifie ni ne supprime jamais une colonne ou une table existante : en mode
« Nouvelle table », un identifiant déjà pris (sans tenir compte des majuscules, y compris
entre deux tables de la même sélection) est refusé ; en mode « Table existante », seules
les colonnes absentes sont ajoutées. Un identifiant de table doit être un identifiant
que Grist crée tel quel : majuscule initiale, puis lettres, chiffres ou `_` (ni accent, ni
espace, ni `None`/`True`/`False`) ; sinon Grist le réécrirait en silence.

**Rien n'est écrit dans le document avant une confirmation.** Le bouton d'action (« Créer 2
tables dans ce document », « Ajouter 3 colonnes à cette table »…) ouvre une boîte de dialogue
qui résume ce qui va être ajouté : les tables avec le nombre de leurs colonnes (sous
l'identifiant saisi), ou les colonnes ajoutées à la table choisie. Elle prévient quand des
formules, cochées, vont s'exécuter dans le document, et rappelle que rien d'existant n'est
supprimé ni modifié. **Annuler** (ou la touche Échap) n'écrit rien et laisse l'aperçu tel quel ;
le bouton de confirmation a le focus, donc Entrée confirme, et une touche maintenue enfoncée
depuis le bouton d'action ne vaut pas confirmation. Cette étape s'ajoute à l'aperçu et à
l'annulation native du document (Ctrl+Z / Cmd+Z), qui défait l'action une fois faite.

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
widget les repère tous. En mode **Nouvelle table**, on décoche ceux dont on ne veut pas ;
en mode **Table existante**, on choisit la table source dont on reprend les colonnes.

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

Par défaut, toutes les colonnes sont créées comme colonnes de données, y compris celles
écrites avec `@grist.formulaType(...)` dans le code source, et sans formule. Ce que
l'import ne reprend pas n'est pas perdu en silence : une remarque de l'aperçu liste les
colonnes calculées (formule, ou formule de déclenchement `def _default_...`), créées
vides, et les références bidirectionnelles qui ne peuvent pas être reliées (voir
ci-dessous), créées comme références simples.

#### Références bidirectionnelles

Deux colonnes qui se désignent l'une l'autre (`reverse_of='Autre'` des deux côtés, comme
l'écrit la vraie Code View) et sont créées **ensemble** — deux tables du même collé, ou
deux colonnes ajoutées à la même table existante — sont reliées par Grist (leur
« colonne réciproque »), et leurs valeurs restent synchronisées. L'aperçu les marque
« bidirectionnelle ». Une colonne dont la réciproque n'est pas créée en même temps
(décochée, absente du texte, ou déjà présente dans le document) reste une référence simple,
avec une remarque : relier une colonne existante réécrirait ses valeurs, ce que ce widget
ne fait jamais. Si Grist refuse de relier une paire (version sans références
bidirectionnelles, par exemple), les tables et leurs descriptions restent et le message de
fin le dit.

#### Choisir les éléments à importer

Le type de chaque colonne est toujours importé. Le groupe **Éléments à importer**, sous
l'aperçu (replié : un clic sur son titre le déplie, et son résumé dit déjà ce qui est
choisi), laisse choisir d'un coup ce que le texte apporte en plus :

| Élément                             | Ce que le texte en dit                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| **Libellés**                        | `label='...'`, quand il diffère de l'identifiant                                |
| **Descriptions des colonnes**       | `description='...'`                                                             |
| **Descriptions des tables**         | la chaîne qui ouvre la classe de la table (voir « Métadonnées capturées »)      |
| **Listes de choix**                 | `choices=[...]` et le style de chaque choix                                     |
| **Format des cellules**             | le reste de `widget_options` : alignement, formats de nombre et de date, couleurs… |
| **Colonne affichée des références** | `visible_col='...'` : la colonne de la table liée que montre la cellule d'une référence |
| **Liens bidirectionnels**           | `reverse_of='...'`                                                              |
| **Formules**                        | colonnes de formule et formules de déclenchement                                |

Chaque élément dit, sous son nom, ce qu'il est : « Format des cellules » et « Colonne affichée
des références » sont les noms de ce que Grist range dans les options d'une colonne
(`widgetOptions`) et dans son réglage « colonne à afficher ».

Seuls les éléments que le texte contient réellement sont proposés, chacun avec le nombre
de colonnes qui le portent (de tables, pour les descriptions de tables) ; quand il n'en
contient aucun, le groupe n'apparaît pas. Ces nombres suivent l'aperçu : ne comptent que ce
qui sera créé (tables cochées, colonnes cochées, colonnes absentes de la table existante ; la
description d'une table qui reçoit des colonnes n'est jamais proposée : une table existante
n'est jamais modifiée). Tout est coché par défaut, sauf
**Formules** (voir ci-dessous), et les cases reviennent à cet état à chaque analyse. Un
élément décoché est laissé de côté à la création, comme si le texte ne le contenait pas :
sans **Liens bidirectionnels**, deux colonnes qui se désignent restent deux références
simples ; sans **Libellés**, chaque colonne garde le libellé que Grist déduit de son
identifiant. Seules les formules laissent une remarque dans l'aperçu (les colonnes créées
vides), puisqu'elles sont décochées sans que vous l'ayez demandé.

#### Reprendre les formules

Cocher **Formules** crée les colonnes de formule avec leur formule, et les colonnes de
données avec leur formule de déclenchement (`def _default_...`, valeur calculée à la
création d'une ligne). Le texte de la fonction est lu tel qu'écrit : un `return X` seul
devient la formule `X`, les fonctions de plusieurs lignes restent telles quelles, et la
valeur que rend une formule vide (`return None`, `return ''`...) donne une colonne sans
formule, comme dans Grist ; **Formules** n'est proposé que s'il y a une formule non vide
à reprendre. La syntaxe `$Colonne` (écrite par l'onglet **Export**) et
`rec.Colonne` (écrite par la vraie Code View) sont toutes deux valides pour Grist.

Une chaîne qui s'étend sur plusieurs lignes (guillemets triples, antislash en fin de ligne,
littéraux accolés entre parenthèses) garde son texte. Grist écrit ses lignes telles quelles
depuis la 1.7.20 et les indente avec le code avant : le widget lit les deux, d'après les
fixtures de `test/fixtures/code-view/strings-*.py` et 400 formules tirées au hasard dans le
Code View de chaque version. Un seul cas est indécidable à la lecture : quand **toutes** les
lignes de la chaîne sont au moins aussi indentées que le code, le texte ne dit pas de quelle
version il vient et il est lu comme celui d'une version antérieure à 1.7.20 ; collé depuis
une version plus récente, il perd alors l'indentation du code (4 espaces) en tête de ces
lignes (26 formules sur 400 dans le tirage, qui en indente beaucoup). L'onglet **Export**
écrit toujours un texte que cette règle relit exactement.

**Formules** est **décoché par défaut, volontairement** : une formule est du code Python que
Grist exécute dans ce document dès sa création, et un texte collé peut venir de
n'importe où. Le widget n'exécute lui-même jamais rien (voir SECURITY.md) ; en le cochant,
vous confiez ces formules à Grist, comme si vous les aviez saisies dans les
cellules. La boîte de confirmation le rappelle, et nomme les colonnes dont la formule
contient le mot `REQUEST` (la fonction de Grist qui peut envoyer des données vers un autre
serveur, là où l'instance l'active). Une formule qui renvoie une erreur (colonne absente
de la nouvelle table, par exemple) ne fait pas échouer l'import : ses cellules affichent
l'erreur dans Grist.

### Métadonnées de colonne restaurées à l'import

En plus du type, l'import restaure — quand ils sont présents dans le texte collé sous
la forme des arguments nommés supplémentaires décrits plus bas (« Métadonnées
capturées à l'export ») — le libellé (`label`), la description, la liste de choix et
son style (couleurs, gras...) pour Choix/Choix multiples, et le reste des options
d'affichage de la colonne (`widgetOptions` : alignement, retour à la ligne, format
numérique/date, etc.). Grist ignore la description quand on crée une colonne : le
widget l'applique juste après, dans une seconde étape. Un identifiant qui n'est pas celui
que Grist déduirait du libellé (`Name` pour le libellé « Nom ») est resté indépendant de
lui dans le document d'origine : l'import le fait de même, pour qu'une modification
ultérieure du libellé ne renomme pas la colonne. Un texte Code View réel, issu
directement de Grist (sans ces arguments), ne donne que les types. Chacune de ces
métadonnées est un élément que le groupe **Éléments à importer** laisse décocher (voir
« Choisir les éléments à importer »).

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
- Une formule de déclenchement est reprise comme formule des nouvelles lignes : les
  réglages « recalculer quand… » (`recalcWhen`, `recalcDeps`) ne figurent pas dans la Code
  View et ne sont pas repris. Une formule qui s'appuie sur une colonne ou une table absente
  du document de destination est créée telle quelle, et Grist en affiche l'erreur.
- Le widget copie la **structure** d'une table : ni les données, ni les droits d'accès, ni
  les vues et widgets de la page (ni leurs titres et descriptions), ni les tables de
  synthèse ne sont repris ou proposés. La description de la table elle-même l'est, pour les
  tables que l'import crée ; celle d'une table qui reçoit des colonnes n'est jamais modifiée.
- **Versions de Grist** : la suite complète (`npm run test:grist`, plus de 300 tests) passe
  sur Grist 1.2.1 (octobre 2024), 1.6.1, 1.7.1, 1.7.20 et une version de développement du
  1er octobre 2026. Avant 1.2, le moteur ne connaît pas les références bidirectionnelles
  (essayé sur 1.1.10 : le widget le dit dans le message de fin et crée des références
  simples) ; avant 1.1, il n'a pas de description de colonne (1.0.5). Ces versions ne sont
  pas couvertes par la suite complète.

## Export

1. Ouvrez l'onglet **Export**. La liste des tables de ce document se charge
   automatiquement (icône **Actualiser la liste** ↻, en haut à droite de l'étape, pour la
   relire, sans perdre les tables déjà cochées).
2. Cochez une ou plusieurs tables (la case **Tout cocher** les sélectionne toutes, dès deux
   tables). À partir de sept tables, un champ de recherche, au-dessus de la liste, filtre
   les tables au fil de la frappe (sans tenir compte des majuscules, des accents ni de
   l'ordre des mots) : les tables cochées que la recherche masque restent cochées, et
   exportées, ce que le champ rappelle ; la case du dessus (**Cocher les tables affichées**)
   n'agit alors que sur celles qui le sont, et **Échap** efface la recherche. Sous la liste,
   le groupe **Éléments à exporter**, replié, liste ce que ces tables contiennent au-delà du
   type de leurs colonnes (libellés, descriptions des colonnes et des tables, listes de
   choix, format des cellules, colonne affichée des références, liens bidirectionnels,
   formules), avec le nombre de colonnes (ou de tables) concernées et, sous chaque nom, ce
   qu'il est. Tout est coché par défaut et le résumé du groupe le dit (« Tous », « Sans
   formules »…) : dépliez-le pour décocher ce que le code ne doit pas contenir (le type de
   chaque colonne est toujours exporté). Cliquez ensuite sur **Générer le code**, bouton
   qui reste affiché en bas du cadre pendant qu'on le parcourt.
   Pour aller plus loin que le choix par table, le chevron (›) à droite de chaque ligne
   déplie les colonnes de la table, toutes cochées : décochez celles que le code ne doit
   pas contenir (le bouton dit alors « 3 colonnes sur 5 »). Les compteurs du groupe
   **Éléments à exporter**, le bandeau des tables référencées et le code ne tiennent plus
   compte d'une colonne décochée : une référence décochée n'appelle plus sa table, et une
   colonne que montre une référence, ou qui est l'autre bout d'un lien bidirectionnel,
   emporte avec elle ce lien (`visible_col`, `reverse_of`) dans le code. Ce choix est gardé
   quand on décoche puis recoche une table, quand on actualise la liste et quand la langue
   change. Il ne réécrit pas les formules : la formule d'une colonne gardée qui cite une
   colonne décochée est exportée telle quelle.
3. Copiez le code affiché (bouton **Copier le code**, sous le texte, qui montre un ✓ un
   instant, ou sélection manuelle du texte) et collez-le où vous en avez besoin — par exemple dans l'onglet **Import** de ce même
   widget, ouvert sur un autre document.

Le format généré suit celui de la vraie « Code View » de Grist : mêmes lignes
d'import en en-tête, mêmes expressions `grist.Xxx(...)`, même ordre (colonnes de données
d'abord, puis colonnes de formule), mêmes lignes vides. Les tables système de Grist
(`_grist_*`) et les tables de synthèse (créées par un widget Synthèse/Pivot) ne sont pas
proposées : ce ne sont pas des tables qu'on recrée avec une simple action « nouvelle
table ».

Seule la structure (types de colonnes) est garantie fidèle. Pour une colonne de formule
(et pour la formule de déclenchement d'une colonne de données, écrite comme la fait
Grist, par une fonction `_default_...` placée avant la colonne), la formule d'origine est
recopiée quand elle existe, mais telle que Grist la stocke en interne (syntaxe
`$Colonne`, sans traduire vers le `rec.Colonne` affiché par la vraie Code View) ; une
formule vide est remplacée par la valeur par défaut du type, comme le fait Grist
lui-même. À l'import, ces formules ne sont reprises que si **Formules** est coché dans le
groupe **Éléments à importer** ; sinon seul le type déclaré compte. Décocher **Formules** à
l'export écrit ces colonnes comme des colonnes de données, sans formule : le type seul
voyage.

### Métadonnées capturées à l'export

Au-delà du type de chaque colonne, l'export capture et restitue le plus possible de sa
configuration réelle, pour que l'import qui suit la restaure fidèlement — en particulier
les choix définis (liste et style par choix), qui sont le cas le plus courant. Ceci est
fait en ajoutant, sur la même ligne que chaque `grist.Xxx(...)`, des arguments nommés
supplémentaires, tous optionnels, chacun étant un élément que le groupe **Éléments à
exporter** laisse décocher (les formules en forment un de plus) :

- **`choices=[...]`** (**Listes de choix**) : la liste des valeurs d'un Choix/Choix
  multiples.
- **`widget_options='<JSON>'`** (**Format des cellules**, et pour le style par choix
  **Listes de choix**) : le reste des options d'affichage de la colonne
  (`widgetOptions`, tel que Grist les stocke), sous forme d'un objet JSON — notamment le
  style par choix (`choiceOptions` : couleur de texte/fond, gras...), l'alignement, le
  retour à la ligne, le format numérique ou de date, et toute autre option générique
  rencontrée. Quelques clés sont volontairement exclues ou réduites (styles de mise en
  forme conditionnelle, formule compilée d'une condition de liste déroulante) : voir
  SECURITY.md pour le détail et la justification de chacune. Absent entièrement si la
  colonne n'a aucune option à en dehors des choix.
- **`label='...'`** (**Libellés**) : le libellé affiché de la colonne, uniquement s'il
  diffère de son identifiant (Grist les fait correspondre par défaut).
- **`description='...'`** (**Descriptions des colonnes**) : la description de la colonne,
  si elle est renseignée.
- **`visible_col='NomDeColonne'`** (**Colonne affichée des références**) : pour une colonne
  de référence, l'identifiant (pas
  l'identifiant technique interne, propre au document et sans signification ailleurs) de
  la colonne de la table cible utilisée comme « colonne d'affichage ».

Une référence bidirectionnelle est écrite, comme le fait la vraie Code View, avec
**`reverse_of='NomDeColonne'`** (la colonne réciproque, dans la table cible ; élément
**Liens bidirectionnels**) : ce n'est pas une extension de ce widget.

La description d'une **table** (celle de son widget « Données brutes », où Grist la garde)
s'écrit comme la docstring de sa classe, une chaîne sur une seule ligne comme celle de
`description=` (élément **Descriptions des tables**) :

```python
@grist.UserTable
class Clients:
  'Les clients de l’association'
  Nom = grist.Text()
```

À l'import, la chaîne qui ouvre la classe est la description de la table, écrite une fois la
table créée ; une chaîne placée ailleurs, ou sur plusieurs lignes entre guillemets triples,
n'est pas lue (remarque « contenu non reconnu »). Seule la description de la table est
reprise : celles des autres widgets (vues, pages) ne font pas partie de sa structure.

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
- **Accessibilité** : quatre valeurs de la charte (texte discret, rouge et vert des
  messages, bleu des petits textes) sont légèrement assombries pour atteindre 4,5:1 (WCAG
  AA, RGAA 3.2) là où elles donnaient 3,7 à 4,4, et les champs ont un contour à 3:1 ;
  `test/style.test.mjs` mesure ces contrastes dans les deux thèmes. Les zones cliquables
  font au moins 24 px, le focus reste visible et revient au bouton qu'on vient d'actionner,
ou au champ de texte quand il n'y a plus rien à actionner (table créée, colonnes ajoutées), les
  champs, groupes et résultats ont un nom accessible et les fins d'analyse sont annoncées,
  l'onglet sélectionné reste repérable en mode contraste élevé (`forced-colors`), la page
  a un repère `main` et un titre par étape, et les onglets répondent aux flèches, à
  Début et à Fin. Vérifié dans Chromium à chaque lancement de `npm run test:browser` par
  axe-core (WCAG 2.2 A et AA, bonnes pratiques : aucune violation sur les écrans
  principaux — aperçus de l'Import, Export et son code, recherche, boîte de confirmation,
  Réglages —, thèmes clair et sombre, français et anglais) et par des contrôles de
  clavier, de taille et de nom accessible ; pas encore passé au lecteur d'écran.
- **Typographie** : **Manrope** (police variable) pour toute l'interface, vendorisée
  dans `fonts/manrope/` (police variable réduite à l'alphabet latin, 28 Ko, licence SIL
  Open Font License jointe) plutôt que chargée depuis une CDN — voir SECURITY.md. Le code Python (collé ou généré) reste
  en police à chasse fixe, monospace, inchangé.
- **Thème système / clair / sombre** : réglable dans le panneau Réglages (icône en haut
  à droite), mémorisé sur cet appareil, dans le `localStorage` du navigateur (le thème et la
  langue sont les seules données que le widget conserve ; voir « Accès demandé à Grist »).
  « Système » (par défaut) suit le thème du système d'exploitation.
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

La page charge l'API officielle de Grist depuis sa propre origine : `<script src="/grist-plugin-api.js">`,
la forme qu'attend une instance, qui sert ce fichier à sa racine. Servi tel quel par la même
origine que Grist, le widget ne contacte donc aucun autre domaine, et sa politique de sécurité
(`script-src 'self'`) ne nomme aucune adresse.

La publication GitHub Pages ne peut pas compter sur une instance : `.github/workflows/pages.yml`
télécharge l'API officielle (`https://docs.getgrist.com/grist-plugin-api.js`) au moment de publier,
la place à côté de `index.html` et fait pointer la balise dessus (`<script src="grist-plugin-api.js">`).
La page publiée ne contacte, elle non plus, aucun autre domaine. La copie de l'API est celle de la
dernière publication : relancer le workflow (onglet Actions, *Run workflow*) l'actualise. Le fichier
n'est pas dans le dépôt ; il appartient à Grist Labs (Apache-2.0, voir
`assets/grist-plugin-api.NOTICE.txt`, publié avec lui).

Pour un autre hébergement statique (réseau fermé, politique qui interdit un domaine tiers),
servez les fichiers que copie `pages.yml` et mettez à côté de `index.html` le fichier de votre
instance (`<votre-grist>/grist-plugin-api.js`), avec la balise `<script src="grist-plugin-api.js">` ;
si le widget est servi par le même domaine que Grist, laissez `/grist-plugin-api.js`. Dans les deux
cas, rien à changer à la politique de sécurité. Sans ce fichier, les deux onglets le disent
(« Impossible de trouver l'API Grist… »). Pour essayer la page en local, un serveur statique à la
racine du dépôt suffit, avec une copie du fichier à côté de `index.html` (`.gitignore` l'ignore).

Des tests (`test/security.test.mjs`, `test/site.test.mjs`) vérifient que la page ne charge que cette
API et ses propres scripts, que la politique de sécurité ne nomme aucun domaine, que la publication
réécrit exactement cette balise et publie le fichier que la page demande.

## Accès demandé à Grist

Le widget demande l'accès **complet** (`requiredAccess: "full"`), le seul niveau qui lui permet
de lire la structure des tables du document (les tables de métadonnées de Grist) et d'en
créer : Grist demande à l'utilisateur de l'accorder à l'ajout du widget. Voici tout ce qu'il en
fait, et rien d'autre :

| Quoi                                     | Appel de l'API du widget                                                                    | Quand                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Lire la liste des tables                 | `listTables`                                                                                | Import : avant de créer, pour refuser un identifiant déjà pris                     |
| Lire la structure des tables             | `fetchTable` sur `_grist_Tables`, `_grist_Tables_column` et `_grist_Views_section`          | Export (liste, génération) ; Import (tables à compléter, références, vérifications) |
| Créer des tables                         | `applyUserActions` : `AddTable`                                                             | Import « Nouvelle table », au clic sur le bouton d'action                          |
| Ajouter des colonnes                     | `applyUserActions` : `AddVisibleColumn`                                                     | Import « Table existante », au clic sur le bouton d'action                         |
| Compléter ce qui vient d'être créé       | `applyUserActions` : `ModifyColumn`, `SetDisplayFormula`, `UpdateRecord` (description d'une table, sur `_grist_Views_section`) | Juste après, sur les seules tables et colonnes que l'appel précédent a créées      |

- **Les lignes d'une table ne sont jamais lues ni écrites** : le widget ne lit que la structure
  (les tables de métadonnées ci-dessus) et n'écrit que des tables et des colonnes.
- **Strictement additif** : aucune suppression, aucun renommage, aucune modification d'une table
  ou d'une colonne qui existait avant. Un identifiant déjà pris est refusé, et les colonnes déjà
  présentes d'une table existante sont laissées telles quelles.
- **Une écriture n'a lieu qu'après confirmation** : le bouton d'action (« Créer 2 tables dans
  ce document », « Ajouter 3 colonnes à « Contacts » »…) ouvre une boîte qui résume ce qui sera
  ajouté, et rien n'est envoyé à Grist avant que l'utilisateur confirme ; Annuler n'écrit rien, et
  l'annulation native de Grist (Ctrl+Z) défait l'action une fois faite. L'export, lui, ne fait
  que lire.
- **Rien ne sort du navigateur** (`connect-src 'none'`), la page ne charge rien d'un autre domaine
  (l'API de Grist vient de sa propre origine, voir « Hébergement en réseau fermé ») et rien n'est
  conservé hors de Grist, hormis deux préférences d'affichage dans le `localStorage` de l'origine
  du widget : le thème (`gristFactory.theme`) et la langue (`gristFactory.locale`), jamais un
  contenu du document.
- **Deux messages dans la console du navigateur** (« Applying inline style violates… »,
  « Refused to apply inline style… ») sont normaux : le script officiel de l'API Grist crée une
  balise `<style>` pour le thème de Grist, que la politique de sécurité du widget (`style-src 'self'`)
  refuse volontairement, le widget ayant son propre thème. Aucune conséquence ; voir
  [SECURITY.md](./SECURITY.md).

Des tests (`test/security.test.mjs`) vérifient ces propriétés dans le code : les seules actions
envoyées à Grist sont celles du tableau, les seules tables lues sont ces tables de métadonnées, et
les seules clés écrites dans le navigateur sont les deux préférences.

## Développement

Le widget est du HTML/CSS/JS statique sans dépendance d'exécution (modules ES natifs,
aucun paquet npm requis pour le faire tourner). Code, commentaires et titres de tests en
anglais ; documentation et messages de commit en français.

Trois suites de tests :

```sh
npm test               # unitaires (node --test, aucune installation) : parseur,
                       # génération, types, i18n et typographie, contrastes, lint de sécurité,
                       # actions épinglées, site publié, vrai Code View enregistré
npm run test:browser   # le vrai index.html dans Chromium (Playwright), faux `grist` en mémoire
npm run test:grist     # le widget contre une vraie instance Grist (voir ci-dessous)
```

`npm test` suffit pour la logique : il n'a besoin ni de navigateur ni de Grist. Le test de
sécurité (`test/security.test.mjs`) y interdit dans `js/` `eval`, le constructeur `Function`,
`innerHTML`/`outerHTML` (y compris comme clé d'objet : la fonction qui construit les éléments,
`buildElement`, refuse de toute façon à l'exécution `innerHTML`, `outerHTML`, `srcdoc` et les
gestionnaires `on…`), `document.write`, `import()`, `fetch`, `WebSocket`..., et vérifie
que `index.html` ne charge que l'API officielle de Grist et sa CSP.

Playwright (et axe-core, qui y vérifie l'accessibilité), seules dépendances du dépôt
(`devDependencies`, jamais publiées avec le widget), servent aux deux autres suites :

```sh
npm ci
npx playwright install chromium
```

### Tests sur une instance Grist réelle

`npm run test:grist` pilote une vraie instance Grist par son API REST (qui expose la même
chose que l'API d'un widget : `listTables`, `fetchTable`, `applyUserActions` avec ses
`retValues`). Il vérifie ce que le widget attend du moteur (normalisation des identifiants,
description ignorée à la création, lot atomique...), l'aller-retour Export → Import de
chaque type de colonne avec toutes ses options (avec et sans formules, références
bidirectionnelles comprises), chaque élément laissé de côté à l'export puis à l'import (le
même document des deux côtés), les identifiants contre le moteur (tables, et colonnes
déduites de leur libellé), la logique d'import, l'interface complète pilotée dans
Chromium, et le widget monté comme widget personnalisé dans la vraie page de Grist
(iframe, vrai script d'API, vraie autorisation d'accès). Pour en lancer une :

```sh
docker run -d -p 8484:8484 -e APP_HOME_URL=http://localhost:8484 \
  -e GRIST_DEFAULT_EMAIL=ci@example.com -e GRIST_IN_SERVICE=true \
  -e GRIST_SANDBOX_FLAVOR=unsandboxed gristlabs/grist:1.7.20
GRIST_URL=http://localhost:8484 npm run test:grist   # GRIST_URL est ce défaut
```

Grist n'accepte que le nom d'hôte de `APP_HOME_URL` (`localhost`, pas `127.0.0.1`). La CI
exécute la même suite sur trois versions de Grist (1.2.1, 1.7.20 et une version de
développement), images épinglées par digest : pour en changer, `docker pull`, puis reporter
le digest affiché dans `.github/workflows/ci.yml`. Si Chromium n'est pas à
l'emplacement attendu par Playwright, `PLAYWRIGHT_CHROMIUM_PATH` indique l'exécutable.

Les fixtures de `test/fixtures/code-view/` sont du texte Code View produit par le
`gencode.py` d'un vrai Grist, dont `strings-1.2.1.py` et `strings-1.7.20.py`, les deux
façons d'écrire les chaînes sur plusieurs lignes ; elles se régénèrent avec
`test/grist/record-code-view.mjs` (`GRIST_SANDBOX_DIR=<grist-core>/sandbox/grist`,
`GRIST_PYTHON`, `GRIST_VERSION` ; l'argument `strings` n'enregistre que celle de la version
visée). Sans
sources de grist-core, `GRIST_PYTHON` peut être un petit script qui lance `python3` dans le
conteneur (`docker cp test/grist/code_view.py <conteneur>:/tmp/`, puis
`exec docker exec -i -e GRIST_SANDBOX_DIR=/grist/sandbox/grist <conteneur> python3 /tmp/code_view.py`).

Structure :

```
index.html             page du widget (en-tête, panneau Réglages, onglets Import / Export)
style.css              mise en forme (identité visuelle Grist Factory, thème clair/sombre)
fonts/manrope/         police Manrope vendorisée et son fichier d'origine (voir SECURITY.md)
assets/                logo Grist Factory (voir SECURITY.md)
js/theme-init.js       applique le thème et la langue mémorisés avant le premier affichage
                       (et masque la page française d'un lecteur de l'anglais jusqu'à sa traduction)
js/app.js              point d'entrée : onglets, initialisation
js/importTab.js        onglet Import : assemble les cinq modules ci-dessous
js/importUi.js         ... les éléments de la page que l'onglet utilise
js/importState.js      ... ce que l'onglet retient (analyse, choix, éléments laissés de côté)
js/importView.js       ... ce qu'il affiche (aperçu, avertissements, boutons)
js/importFlow.js       ... ce qu'il fait (analyser, effacer, créer, ajouter aux colonnes d'une table)
js/importConfirm.js    ... la confirmation demandée avant d'écrire dans le document
js/importer.js         logique de l'import sans DOM : résolution des colonnes, identifiants,
                       formules, création en un lot, puis détails et références bidirectionnelles
js/exportTab.js        onglet Export : lit le document et assemble les trois modules ci-dessous
js/exportTables.js     ... la liste des tables, sa recherche et la case qui les prend toutes
js/exportRefs.js       ... le bandeau des tables que les tables cochées référencent
js/exportOutput.js     ... le code généré et le bouton Copier
js/search.js           recherche dans une liste : mots, casse et accents ignorés
js/elements.js         éléments d'une colonne (libellés, choix, formules...) : comptes et retrait, pour Import et Export
js/elementsPicker.js   le groupe de cases à cocher de ces éléments (DOM), commun aux deux onglets
js/parser.js           lecture du code source (motifs fixes + scanner de parenthèses, jamais exécuté)
js/pyText.js           texte Python : littéraux, chaînes sur plusieurs lignes, parenthèse fermante, arguments
js/gristTypes.js       types de colonne <-> constructeurs Code View (une table de types)
js/widgetOptions.js    ce qui d'un widgetOptions peut voyager d'un document à l'autre
js/schema.js           structure réelle du document (_grist_Tables*), tables référencées
js/codeGenerator.js    génère le code Python (types, métadonnées, formules, références bidirectionnelles)
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
